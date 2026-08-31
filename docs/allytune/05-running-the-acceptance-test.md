# Running the acceptance test

This is the one job in phase 1 that needs you rather than the computer. It takes about 20 minutes,
most of which is waiting.

**What it does:** captures three runs of Uncharted 4 that are meant to be *identical*, then reports
how much they disagreed. That disagreement is the noise floor — the smallest difference this whole
setup can actually detect. Everything we do later is measured against it.

**Why it matters:** a typical settings change is worth 5–15%. If three identical runs disagree by
5%, then every future "this setting helped" is indistinguishable from the machine just being
moody. Getting this number is what stops the Uncharted 4 session going the way it went last time.

---

## Before you start

Two things need fixing first. Neither is optional.

### 1. Open the terminal as Administrator

"Administrator" is Windows' term for a terminal allowed to touch system-level things. The
temperature and power sensors will not run without it.

1. Press the **Windows key**.
2. Type `terminal`.
3. **Right-click** "Windows Terminal" in the results and choose **Run as administrator**.
4. Windows will ask "Do you want to allow this app to make changes?" — choose **Yes**.

You can tell it worked because the window title bar says **Administrator**.

### 2. Plug the Ally in and charge it above 50%

As the battery drains, the Ally quietly reduces how much power it gives the chip. Three runs
spanning a drop from 30% to 15% are not three identical runs — the machine changed underneath you,
and that difference lands directly in the number we are trying to measure.

Plug it in, let it reach at least 50%, and **leave it plugged in for all three runs**.

> Leaving it plugged in means the test measures your **docked** profile. That is fine — it is one
> of the two profiles you want. Once the battery is healthy you can repeat the whole thing on
> battery to get the handheld noise floor, which is a separate number.

---

## Step 1 — check the setup

In the Administrator terminal, type these two lines, pressing Enter after each:

```bash
cd C:\Users\gordo\Documents\Claude\hello-world
```

```bash
python -m allytune doctor
```

`cd` means "change directory" — it moves the terminal into the project folder. The second line
runs allytune's self-check.

**What you should see:** a list of checks, each starting with `OK`:

```
allytune 0.1.0 -- installation check
==========================================================================
  OK   Python          3.12.10
  OK   Elevated        yes
  OK   PresentMon      C:\...\tools\PresentMon-2.5.1-x64.exe
  OK   Uncharted 4     C:\...\u4.exe
  OK   Configuration   docked
  OK   Power           AC
```

**If `Elevated` says `no`** — the terminal is not running as Administrator. Close it and redo the
"Run as administrator" step above.

**If you get `'python' is not recognized`** — close this terminal and open a new one (as
Administrator again). Python was installed during this session and only new terminals know about
it. If it still fails, use this longer form instead, which works regardless:

```bash
C:\Users\gordo\AppData\Local\Programs\Python\Python312\python.exe -m allytune doctor
```

**If `Configuration` says something other than `docked` or `handheld`** — it means you are in a
mixed state, like plugged in with no monitor attached. That is still measurable, just make sure
all three runs are in the *same* state.

---

## Step 2 — start the sensors

In the **same** Administrator terminal:

```bash
.\tools\LibreHardwareMonitor\LibreHardwareMonitor.exe
```

A window opens showing temperatures and power. **Leave it open** — minimise it if you like.
allytune reads from it in the background.

**If nothing happens or you get a UAC prompt you cannot accept** — the terminal is not elevated.
Go back and fix that. This program flatly refuses to start otherwise.

You can skip this step if you want to. You will still get frametimes and the noise floor; you just
will not get power, clock or temperature readings alongside them.

---

## Step 3 — pick your route

Start Uncharted 4 and find a spot to use as the route. Then **write down** what you chose, because
you have to reproduce it three times.

**The best kind of route is one where you do nothing.** Stand in a heavy area — somewhere with a
long view, lots of foliage or a busy vista — put the controller down, and let the camera sit still
for 90 seconds. A stationary camera removes almost all of the human variability, and that matters
far more than testing a "typical" moment of play.

A walked path is the fallback. If you walk one, walk exactly the same path, at the same pace, in
the same direction, every time.

**What to avoid:** cutscenes, anything with scripted combat, anywhere enemies can wander in, and
anywhere a cloud can change the lighting. Anything that differs between runs on its own becomes
noise you cannot separate from the rig's own noise.

Also: **do not change any graphics settings between runs.** Not one. The first run after a settings
change recompiles shaders and is always slower.

---

## Step 4 — one practice run

Before the real thing, take one throwaway capture. This confirms allytune can see the game and
gives the shaders a chance to compile.

Get the game running and showing your route, then — from the terminal — run:

```bash
python -m allytune measure --seconds 30 --game "Uncharted 4" --label practice
```

You have 30 seconds. Switch to the game immediately after pressing Enter.

**What you should see** when it finishes:

```
Metrics
==========================================================================
  frames             1800 analysed, 0 dropped
  1% low frametime   31.20 ms   <- primary
  frametime stdev    2.10 ms   <- primary
  average fps        40.1
  GPU-busy ratio     0.970
  classification     GPU-bound
```

The numbers will differ. What matters is that you got some.

**If it says `PresentMon captured no frames`** — the game was not drawing. Usually it was
minimised, or on a loading screen, or you did not switch to it in time. Try again.

**If it says `No frames captured for process 'u4.exe'`** — allytune captured frames but none from
Uncharted. Check the game is *Uncharted 4*, not The Lost Legacy, which is `tll.exe`. To see what
it did find, run the same command with `--process ""` on the end.

Throw this run away. It exists only to warm things up.

---

## Step 5 — the real thing

```bash
python -m allytune noisefloor --runs 3 --seconds 90 --game "Uncharted 4"
```

Here is what happens, and it repeats three times:

1. It prints `Run 1/3 -- get into position, then press Enter to start capture.`
2. Get the game to the start of your route.
3. Press **Enter**, then switch to the game **immediately**.
4. Do your route for 90 seconds. It prints the run's numbers when done.
5. It waits 90 seconds to let the chip cool back to the same temperature it started at. This is
   not padding — a run that starts hotter runs slower, and without the wait that difference would
   show up as noise.

Then it prints the verdict.

---

## Reading the result

```
Noise floor from 3 identical runs
==========================================================================
  1% low frametime       mean   31.240  spread  1.82%  cv  0.94%
  frametime stdev        mean    2.110  spread  2.41%  cv  1.22%
  mean frametime         mean   24.930  spread  0.51%  cv  0.27%

  Headline: 2.41% (worst pacing metric: frametime stdev)
  Verdict:  USABLE -- under 3%. The rig resolves a 5% effect.
```

**"Spread"** is the gap between the best and worst of the three runs, as a percentage. The headline
is the worst of the pacing measurements, not the average of them — if any one of them wanders, the
rig cannot resolve changes in that one.

| Headline | What it means | What to do |
|---|---|---|
| **Under 3%** | The rig works. | Move on to actual tuning. |
| **3–5%** | Marginal. Only big effects are trustworthy. | Worth tightening, but usable. |
| **5% or more** | Not usable. | Stop. See below. |

### If it comes out at 5% or more

That is not a failure of the test — it is the test doing its job. Something varied between runs.
In order of likelihood:

1. **The route was not repeatable.** By far the most common cause. Switch to a stationary camera
   if you walked a path.
2. **Something was running in the background.** A Windows update, a Steam download, a browser.
3. **The chip did not cool back down.** Increase the wait: add `--cooldown 180` to the command.
4. **Shaders were still compiling.** Play the area for a few minutes first, then re-run.

Change **one** of those, run it again, and see if the number moves. Tell me the number either way
— an honest 6% is far more useful than a 2% that was not real.

---

## Seeing the results on your phone

Leave this running in a terminal:

```bash
python -m allytune dashboard
```

It prints an address like `http://10.0.0.121:8777`. Open that in your phone's browser — the phone
needs to be on the same WiFi as the Ally. You will see the noise floor, the latest run and a table
of every run so far, and it refreshes itself every 20 seconds.

Press **Ctrl+C** in the terminal to stop it.

The address can change if your router hands out a new one, so use whatever the command prints
rather than saving it.

---

## What to send me afterwards

The whole output of the `noisefloor` command — a screenshot is fine. In particular the headline
percentage, the verdict line, and the `classification` from the individual runs, which tells us
whether Uncharted 4 is GPU-bound or CPU-bound on this chip. That single word decides which knobs
are worth sweeping at all, and the plan's working guess about it has already been wrong by a
factor of four once on this hardware.
