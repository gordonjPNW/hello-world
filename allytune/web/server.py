"""A phone-readable results dashboard, served from the Ally over WiFi.

Deliberately not a native app and deliberately not FastAPI.

Not native, because a phone app would need a store listing or sideloading, a
signing identity, and a rebuild every time the metrics change -- for a page that
shows a table. A web page reachable at a LAN address works on any phone, on the
Ally's own touchscreen, and on the docked monitor, with nothing installed.

Not FastAPI, because http.server ships with Python. On a handheld, every
dependency is something that has to be installed, kept working and debugged on a
7" screen. The plan's phase 4 can swap in FastAPI if the UI ever needs it; a
read-only results view does not.

Read-only by construction, with one deliberate exception: `/prep`, the
pre-gaming cleanup page, closes background processes on request. That is a
narrower promise than "read-only," so it is worth being precise about its
safety instead of just noting the exception. It can act on exactly the process
names hand-reviewed into `allytune.system.cleanup.CATEGORIES` and nothing
else -- never the running game, never allytune's own tools, never a
system-critical process -- enforced by an allowlist plus an independent
protected-names guard, both covered in that module's tests. Everything else on
this server remains read-only.
"""

from __future__ import annotations

import http.server
import json
import socket
import socketserver
from pathlib import Path

from allytune import store
from allytune.analysis import noise as N
from allytune.system import cleanup as C

PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark light">
<title>allytune</title>
<style>
  :root {
    --bg: #0f1115; --card: #171a21; --line: #262b36;
    --fg: #e6e9ef; --dim: #8b93a3;
    --good: #4ade80; --warn: #fbbf24; --bad: #f87171; --accent: #60a5fa;
  }
  @media (prefers-color-scheme: light) {
    :root { --bg:#f6f7f9; --card:#fff; --line:#e3e6ec; --fg:#11141a; --dim:#5b6472; }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 16px 14px 48px;
    background: var(--bg); color: var(--fg);
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    -webkit-text-size-adjust: 100%;
  }
  header { display:flex; align-items:baseline; gap:10px; margin-bottom:14px; }
  h1 { font-size: 19px; margin: 0; letter-spacing: -0.01em; }
  .sub { color: var(--dim); font-size: 13px; }
  .card {
    background: var(--card); border: 1px solid var(--line);
    border-radius: 12px; padding: 14px; margin-bottom: 12px;
  }
  .card h2 { font-size: 13px; margin: 0 0 10px; color: var(--dim);
             text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
  .big { font-size: 34px; font-weight: 650; letter-spacing: -0.02em; }
  .good { color: var(--good); } .warn { color: var(--warn); } .bad { color: var(--bad); }
  .verdict { margin-top: 6px; font-size: 13.5px; color: var(--dim); }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  th, td { text-align: right; padding: 7px 4px; border-bottom: 1px solid var(--line);
           font-size: 13px; white-space: nowrap; }
  th:first-child, td:first-child { text-align: left; }
  th { color: var(--dim); font-weight: 600; font-size: 11.5px;
       text-transform: uppercase; letter-spacing: 0.04em; }
  tr:last-child td { border-bottom: none; }
  .scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .tag { display:inline-block; padding:2px 8px; border-radius:999px;
         background:var(--line); color:var(--dim); font-size:11.5px; }
  .empty { color: var(--dim); font-size: 14px; }
  .metric { display:flex; justify-content:space-between; padding:6px 0;
            border-bottom:1px solid var(--line); font-size:14px; }
  .metric:last-child { border-bottom:none; }
  .metric span:last-child { font-variant-numeric: tabular-nums; font-weight:600; }
  button { background:var(--line); color:var(--fg); border:none; border-radius:8px;
           padding:9px 14px; font-size:14px; font-family:inherit; }
</style>
</head>
<body>
<header>
  <h1>allytune</h1>
  <span class="sub" id="updated">loading…</span>
  <a href="/prep" style="margin-left:auto;color:var(--accent);font-size:13px;
     text-decoration:none;white-space:nowrap">prep for gaming →</a>
</header>
<div id="app"></div>
<div class="card">
  <button onclick="load()">Refresh</button>
  <span class="sub" style="margin-left:8px">auto-refreshes every 20 s</span>
</div>
<script>
const fmt = (v, d=2) => (v === null || v === undefined) ? "–" : Number(v).toFixed(d);

function floorClass(p) { return p < 3 ? "good" : (p < 5 ? "warn" : "bad"); }

function render(data) {
  const app = document.getElementById("app");
  document.getElementById("updated").textContent =
    "updated " + new Date().toLocaleTimeString();
  let html = "";

  for (const [config, nf] of Object.entries(data.noise_floors || {})) {
    html += '<div class="card"><h2>Noise floor · ' + config + '</h2>' +
      '<div class="big ' + floorClass(nf.headline_pct) + '">' +
      fmt(nf.headline_pct) + '%</div>' +
      '<div class="verdict">' + nf.verdict + '</div>' +
      '<div class="verdict">from ' + nf.runs + ' runs · worst metric: ' +
      nf.headline_metric + '</div></div>';
  }

  const latest = data.latest;
  if (latest) {
    const m = latest.metrics || {};
    html += '<div class="card"><h2>Latest run</h2>' +
      '<div class="verdict" style="margin-bottom:8px">' +
      (latest.game || "—") + ' · <span class="tag">' +
      (latest.configuration || "?") + '</span> · ' +
      (latest.timestamp || "") + '</div>' +
      row("1% low frametime", fmt(m.low_1pct_ms) + " ms") +
      row("frametime stdev", fmt(m.frame_time_stdev_ms) + " ms") +
      row("0.1% low frametime", fmt(m.low_0p1pct_ms) + " ms") +
      row("mean frametime", fmt(m.frame_time_mean_ms) + " ms") +
      row("average fps", fmt(m.avg_fps, 1)) +
      row("GPU-busy ratio", fmt(m.gpu_busy_ratio, 3)) +
      row("classification", m.classification || "–") +
      row("frames / dropped", (m.frames||0) + " / " + (m.dropped||0)) +
      '</div>';
  }

  const runs = data.runs || [];
  html += '<div class="card"><h2>Runs (' + runs.length + ')</h2>';
  if (!runs.length) {
    html += '<div class="empty">Nothing recorded yet. Run ' +
            '<code>allytune measure</code> on the Ally.</div>';
  } else {
    html += '<div class="scroll"><table><tr>' +
      '<th>when</th><th>config</th><th>1% low</th><th>stdev</th>' +
      '<th>fps</th><th>gpu</th><th>class</th></tr>';
    for (const r of runs.slice().reverse()) {
      const m = r.metrics || {};
      html += '<tr><td>' + (r.timestamp||"").slice(5,16).replace("T"," ") + '</td>' +
        '<td>' + (r.configuration||"") + '</td>' +
        '<td>' + fmt(m.low_1pct_ms) + '</td>' +
        '<td>' + fmt(m.frame_time_stdev_ms) + '</td>' +
        '<td>' + fmt(m.avg_fps,1) + '</td>' +
        '<td>' + fmt(m.gpu_busy_ratio,2) + '</td>' +
        '<td>' + (m.classification||"") + '</td></tr>';
    }
    html += '</table></div>';
  }
  html += '</div>';

  if (data.warnings && data.warnings.length) {
    html += '<div class="card"><h2>Warnings</h2>';
    for (const w of data.warnings) html += '<div class="verdict">• ' + w + '</div>';
    html += '</div>';
  }
  app.innerHTML = html;
}

function row(k, v) {
  return '<div class="metric"><span>' + k + '</span><span>' + v + '</span></div>';
}

async function load() {
  try {
    const r = await fetch("/api/state", {cache: "no-store"});
    render(await r.json());
  } catch (e) {
    document.getElementById("updated").textContent = "offline";
  }
}
load();
setInterval(load, 20000);
</script>
</body>
</html>
"""


PREP_PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark light">
<title>allytune · prep</title>
<style>
  :root {
    --bg: #0f1115; --card: #171a21; --line: #262b36;
    --fg: #e6e9ef; --dim: #8b93a3;
    --good: #4ade80; --warn: #fbbf24; --bad: #f87171; --accent: #60a5fa;
  }
  @media (prefers-color-scheme: light) {
    :root { --bg:#f6f7f9; --card:#fff; --line:#e3e6ec; --fg:#11141a; --dim:#5b6472; }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 16px 14px 40px;
    background: var(--bg); color: var(--fg);
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    -webkit-text-size-adjust: 100%;
  }
  header { display:flex; align-items:baseline; justify-content:space-between; margin-bottom:14px; }
  h1 { font-size: 19px; margin: 0; letter-spacing: -0.01em; }
  a.nav { color: var(--dim); font-size: 13px; text-decoration: none; }
  .card {
    background: var(--card); border: 1px solid var(--line);
    border-radius: 14px; padding: 18px; margin-bottom: 12px;
  }
  .ready   { --pill-bg: rgba(74,222,128,0.15); --pill-fg: var(--good); }
  .tight   { --pill-bg: rgba(251,191,36,0.15); --pill-fg: var(--warn); }
  .noisy   { --pill-bg: rgba(248,113,113,0.15); --pill-fg: var(--bad); }
  .free {
    font-size: 42px; font-weight: 700; letter-spacing: -0.02em; line-height: 1;
    color: var(--pill-fg, var(--fg));
  }
  .free-unit { font-size: 18px; color: var(--dim); font-weight: 500; margin-left: 4px; }
  .pill {
    display: inline-block; margin-top: 10px; padding: 4px 12px; border-radius: 999px;
    background: var(--pill-bg, var(--line)); color: var(--pill-fg, var(--fg));
    font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
  }
  .verdict-text { margin-top: 10px; font-size: 13.5px; color: var(--dim); }
  .reclaim { margin-top: 12px; font-size: 13px; color: var(--dim); }
  .reclaim b { color: var(--fg); }
  .row {
    display: flex; align-items: center; gap: 12px; padding: 12px 0;
    border-bottom: 1px solid var(--line);
  }
  .row:last-child { border-bottom: none; }
  .row.empty { opacity: 0.4; }
  .row input[type=checkbox] {
    width: 22px; height: 22px; accent-color: var(--accent); flex-shrink: 0;
  }
  .row .label { flex: 1; min-width: 0; }
  .row .name { font-weight: 600; font-size: 14.5px; }
  .row .note { color: var(--dim); font-size: 12px; margin-top: 2px; }
  .row .mb { font-variant-numeric: tabular-nums; color: var(--dim); font-size: 13px; white-space: nowrap; }
  button.go {
    width: 100%; padding: 16px; margin-top: 16px; border: none; border-radius: 12px;
    background: var(--accent); color: #0b1220; font-size: 16px; font-weight: 700;
    font-family: inherit; cursor: pointer;
  }
  button.go:active { opacity: 0.85; }
  button.go:disabled { opacity: 0.5; }
  button.refresh {
    background: var(--line); color: var(--fg); border: none; border-radius: 8px;
    padding: 8px 12px; font-size: 13px; font-family: inherit;
  }
  #result { display: none; margin-top: 14px; padding: 12px; border-radius: 10px;
            background: rgba(74,222,128,0.1); font-size: 13.5px; }
  #result.show { display: block; }
  .foot { display:flex; justify-content:space-between; align-items:center; margin-top: 6px; }
  .updated { color: var(--dim); font-size: 12px; }
</style>
</head>
<body>
<header>
  <h1>Get ready to game</h1>
  <a class="nav" href="/">results ↗</a>
</header>

<div class="card" id="statusCard">
  <div><span class="free" id="freeGb">–</span><span class="free-unit">GB free</span></div>
  <div class="pill" id="pill">…</div>
  <div class="verdict-text" id="verdictText"></div>
  <div class="reclaim" id="reclaim"></div>
</div>

<div class="card" id="listCard">
  <div id="rows">loading…</div>
  <button class="go" id="goBtn" onclick="doCleanup()">Clean Up For Gaming</button>
  <div id="result"></div>
</div>

<div class="foot">
  <span class="updated" id="updated"></span>
  <button class="refresh" onclick="load()">Refresh</button>
</div>

<script>
const fmt1 = v => Number(v).toFixed(1);

function row(cat) {
  const empty = cat.running.length === 0;
  const names = cat.running.map(p => p.name).join(', ');
  const checked = (!empty && cat.default_on) ? 'checked' : '';
  return '<label class="row' + (empty ? ' empty' : '') + '">' +
    '<input type="checkbox" data-key="' + cat.key + '" ' + checked +
      (empty ? ' disabled' : '') + '>' +
    '<span class="label"><span class="name">' + cat.label + '</span>' +
      '<span class="note">' + (empty ? 'nothing running' : (names || cat.note)) +
      '</span></span>' +
    '<span class="mb">' + (empty ? '' : Math.round(cat.total_mb) + ' MB') + '</span>' +
    '</label>';
}

function render(data) {
  document.getElementById('freeGb').textContent = fmt1(data.free_gb);
  const card = document.getElementById('statusCard');
  card.className = 'card ' + data.verdict;
  const pill = document.getElementById('pill');
  pill.textContent = data.verdict === 'ready' ? 'Ready' :
                      data.verdict === 'tight' ? 'Tight' : 'Noisy';
  document.getElementById('verdictText').textContent = data.verdict_text;
  const reclaimGb = (data.reclaimable_mb / 1024).toFixed(1);
  document.getElementById('reclaim').innerHTML =
    'up to <b>' + reclaimGb + ' GB</b> reclaimable below';
  document.getElementById('rows').innerHTML = data.categories.map(row).join('');
  document.getElementById('updated').textContent =
    'updated ' + new Date().toLocaleTimeString();
}

async function load() {
  try {
    const r = await fetch('/api/noise', {cache: 'no-store'});
    render(await r.json());
  } catch (e) {
    document.getElementById('updated').textContent = 'offline';
  }
}

async function doCleanup() {
  const keys = Array.from(document.querySelectorAll('#rows input:checked'))
                     .map(el => el.dataset.key);
  if (!keys.length) return;
  const btn = document.getElementById('goBtn');
  btn.disabled = true;
  btn.textContent = 'Cleaning up…';
  try {
    const r = await fetch('/api/cleanup', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({categories: keys}),
    });
    const data = await r.json();
    const gained = (data.free_gb_after - data.free_gb_before).toFixed(1);
    const box = document.getElementById('result');
    box.className = 'show';
    let html = 'Closed ' + data.closed.length + ' process(es), freed ' +
      '<b>' + gained + ' GB</b> (' + fmt1(data.free_gb_before) + ' → ' +
      fmt1(data.free_gb_after) + ' GB).';
    if (data.failed_permission.length) {
      html += '<br><span style="color:var(--warn)">' + data.failed_permission.length +
        ' process(es) need Administrator to close: ' +
        data.failed_permission.join(', ') +
        '. Restart <code>allytune dashboard</code> from an elevated terminal ' +
        'to close these too.</span>';
    }
    if (data.failed_other.length) {
      html += '<br><span style="color:var(--bad)">' + data.failed_other.length +
        ' did not close for another reason: ' + data.failed_other.join(', ') + '.</span>';
    }
    box.innerHTML = html;
  } catch (e) {
    const box = document.getElementById('result');
    box.className = 'show';
    box.textContent = 'Something went wrong -- check the terminal.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Clean Up For Gaming';
    load();
  }
}

load();
setInterval(load, 8000);
</script>
</body>
</html>
"""


def _state(results_dir=None) -> dict:
    """Everything the page needs, in one request.

    One endpoint rather than several because the page is refreshed over WiFi
    from a phone and round trips are the expensive part.
    """
    runs = store.load_runs(results_dir)

    # Group noise-floor runs by configuration. Handheld and docked floors are
    # never combined -- they are different measurement regimes and a pooled
    # number would be meaningless in both.
    floors = {}
    by_config = {}
    for r in runs:
        if "noise floor run" in (r.get("notes") or ""):
            by_config.setdefault(r.get("configuration", "unknown"), []).append(r)

    for config, group in by_config.items():
        recent = group[-3:]
        if len(recent) < 2:
            continue
        try:
            floors[config] = _floor_from_records(recent)
        except (ValueError, KeyError):
            continue

    return {
        "runs": runs[-50:],
        "latest": runs[-1] if runs else None,
        "noise_floors": floors,
        "warnings": (runs[-1].get("device", {}).get("warnings", []) if runs else []),
    }


class _M:
    """Minimal stand-in so recorded dicts can be fed to the noise-floor code."""

    def __init__(self, d):
        self.__dict__.update(d)


def _floor_from_records(records) -> dict:
    nf = N.compute([_M(r["metrics"]) for r in records])
    return {
        "headline_pct": nf.headline_pct,
        "headline_metric": nf.headline_metric,
        "verdict": nf.verdict,
        "runs": nf.runs,
    }


def _lan_ip() -> str:
    """Best guess at the address a phone should use.

    Connecting a UDP socket to an off-net address forces the OS to pick the
    outbound interface without sending a packet, which is the reliable way to
    find the LAN address when several adapters exist.
    """
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def make_handler(results_dir):
    class Handler(http.server.BaseHTTPRequestHandler):
        def _send(self, body: bytes, ctype: str):
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path.startswith("/api/state"):
                body = json.dumps(_state(results_dir), default=str).encode("utf-8")
                self._send(body, "application/json; charset=utf-8")
            elif self.path.startswith("/api/noise"):
                body = json.dumps(C.scan().as_dict()).encode("utf-8")
                self._send(body, "application/json; charset=utf-8")
            elif self.path in ("/", "/index.html"):
                self._send(PAGE.encode("utf-8"), "text/html; charset=utf-8")
            elif self.path in ("/prep", "/prep/"):
                self._send(PREP_PAGE.encode("utf-8"), "text/html; charset=utf-8")
            else:
                self.send_error(404)

        def do_POST(self):
            # The one route on this server that changes anything. See the
            # module docstring for exactly what it is and is not permitted to
            # touch -- enforced in allytune.system.cleanup, not here.
            if self.path.startswith("/api/cleanup"):
                length = int(self.headers.get("Content-Length") or 0)
                raw = self.rfile.read(length) if length else b"{}"
                try:
                    payload = json.loads(raw or b"{}")
                except json.JSONDecodeError:
                    payload = {}
                keys = payload.get("categories") or []
                if not isinstance(keys, list):
                    keys = []
                result = C.cleanup([str(k) for k in keys])
                body = json.dumps(result.as_dict()).encode("utf-8")
                self._send(body, "application/json; charset=utf-8")
            else:
                self.send_error(404)

        def log_message(self, *a):
            pass  # a request log per 20 s poll is just noise on a handheld

    return Handler


def serve(host: str = "0.0.0.0", port: int = 8777, results_dir=None) -> None:
    handler = make_handler(results_dir)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer((host, port), handler) as httpd:
        url = "http://" + _lan_ip() + ":" + str(port)
        print("allytune dashboard")
        print("=" * 60)
        print("  Results        : " + url)
        print("  Prep for gaming: " + url + "/prep")
        print("  On this device : http://localhost:" + str(port) + " (and /prep)")
        print()
        print("  The phone must be on the same WiFi network as the Ally.")
        print("  Press Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped")
