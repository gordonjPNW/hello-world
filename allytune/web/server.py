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

Read-only by construction: there is no route that writes anything, which is what
makes it safe to expose on a home network during phase 1.
"""

from __future__ import annotations

import http.server
import json
import socket
import socketserver
from pathlib import Path

from allytune import store
from allytune.analysis import noise as N

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
            elif self.path in ("/", "/index.html"):
                self._send(PAGE.encode("utf-8"), "text/html; charset=utf-8")
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
        print("  On this device : http://localhost:" + str(port))
        print("  On your phone  : " + url)
        print()
        print("  The phone must be on the same WiFi network as the Ally.")
        print("  Press Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped")
