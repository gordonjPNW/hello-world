# Phase 7 — Upgrades worth considering

Optional. Do [Phases 2, 4, and 5](00-overview.md#order-of-operations) first — they're free and they
solve more than anything on this page.

Ranked by whether they're actually worth it on a nine-year-old economy car.

## Worth it: a good cable and a vent mount

Unglamorous and genuinely the best value here. A certified data cable that lives in the car and
doesn't fail intermittently removes the most common CarPlay complaint. A mount makes the phone useful
when projection isn't running.

Cost: not much. Do this one.

## Worth it, with caveats: a wireless CarPlay / Android Auto adapter

Small dongles plug into the car's USB port, present themselves to the car as a wired phone, and talk
to the actual phone over Wi-Fi and Bluetooth. They work on this car **because it already has wired
projection** — that's the prerequisite, and it's satisfied here.

What you get: the phone stays in a pocket or bag and projection starts on its own.

What you give up:

- **The phone stops charging** through the projection connection, because the cable is now feeding
  the adapter. On a long drive this matters. Plan for a separate charging cable.
- **A few seconds of connection delay** on every start, versus instant with a cable.
- **A new failure mode.** These adapters have their own firmware and their own bugs, and a flaky one
  produces exactly the intermittent-dropout symptoms you were trying to escape.
- **Quality varies wildly.** The market is full of near-identical white-label boxes. Buy from a brand
  with a real update history and a return window, and be prepared to send one back.

Verdict: good if she'll use it daily and hates the cable. Not a fix for a car whose wired projection
is already misbehaving — fix that first in [Phase 4](04-carplay-android-auto.md).

## Marginal: 7-inch to 8-inch screen upgrade

Kits exist to convert an IOB 7-inch car to the 8-inch IO5/IO6 hardware. It's a real conversion, not a
bezel swap — different unit, and it needs programming to the VIN.

Skip it unless she specifically wants embedded navigation, and re-read the navigation argument in
[Phase 3](03-software-updates.md) before deciding — phone navigation through CarPlay is better than
an IO6 map in almost every scenario. Paying to add embedded navigation to a car that already projects
a live-traffic map is hard to justify.

## Situational: aftermarket head unit

Worth genuinely considering **if the HMI module has failed** ([Phase 6](06-troubleshooting.md)).
Comparing a dealer module replacement plus programming against a modern aftermarket unit with
wireless CarPlay built in changes the calculation — sometimes the aftermarket unit wins on both price
and features.

What you need to keep working, and what makes this more involved than it sounds:

- **Steering wheel controls** — needs a retention interface module
- **Backup camera** — needs the factory camera adapted to the new unit's input
- **Chimes and warning tones** — on many GM cars these route through the factory radio
- **OnStar** — verify what an install does to it before committing
- **The climate control display**, if any of it shares the screen

That's a vehicle-specific harness and interface package, not a universal double-DIN kit. Get a quote
from a shop that has done this exact car. If the factory unit is working fine, don't.

## Skip: "unlock" and video-in-motion modules

Modules sold to enable video playback while driving, or to unlock hidden menus. Setting aside that
watching video while driving is a bad idea on its own terms, these tap into the car's data network
and are a common source of odd electrical gremlins that later get misdiagnosed as module failure.

Not worth it on a car you want to be reliable.

## Skip: paying for an infotainment software flash with no symptom

Covered in [Phase 3](03-software-updates.md), repeated here because it's the most common way to spend
money for nothing on this car. A flash fixes a defect. With no defect present, it changes nothing and
you pay diagnostic time to learn that.

Next: [Phase 8 — Validation](08-validation.md)
