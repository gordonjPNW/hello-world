# 2017 Chevy Cruze Hatchback LT — Infotainment & Software Guide

Everything on the *software* side of Wendy's car: what the radio actually is, what can and can't be
updated, how to get CarPlay/Android Auto working properly, what OnStar still gives you in 2026, and
how to fix the two failure modes these systems are known for.

This guide deliberately covers **only** infotainment, connectivity, and software/recall status.
Nothing here is mechanical maintenance — no oil, no coolant, no PCV valve.

## The car

| | |
|---|---|
| **Model** | 2017 Chevrolet Cruze **hatchback**, LT trim — second generation (D2XX platform) |
| **Body note** | The 5-door hatch was **new to North America for MY2017**; the sedan launched a year earlier as a 2016 |
| **Engine** | 1.4 L turbo (LE2), 6-speed automatic or 6-speed manual |
| **Standard radio** | **Chevrolet MyLink, 7-inch** touchscreen — RPO code **IOB** |
| **Optional radio** | 8-inch MyLink (**IO5**), or 8-inch MyLink with embedded navigation (**IO6**) |
| **Phone projection** | Apple CarPlay **and** Android Auto, standard on LT — **wired only** |
| **Telematics** | OnStar with 4G LTE and built-in Wi-Fi hotspot |

Confirm which radio she actually has before doing anything else — the three units behave differently
and most advice online doesn't say which one it's for. [Phase 1](01-identify-your-system.md) shows
you how to read the RPO sticker.

## Set expectations first

This is the part most guides skip, so here it is up front:

**You cannot download and install infotainment firmware for this car yourself.** GM does not publish
consumer-downloadable radio software for the 2017 Cruze. There is no "update from USB" flow on these
units the way there is on a phone or a console. Radio software is flashed by a dealer over the
service connector, and only when a bulletin or a diagnosed symptom calls for it.

The 2017 Cruze also predates GM's real over-the-air update platform. When Chevrolet's website talks
about checking for updates under **Settings → Updates**, that's describing newer vehicles built on
the Vehicle Intelligence Platform. Don't expect to find that menu here, and don't conclude something
is broken when you can't.

So the useful work is not "install the latest version." It's this:

1. Confirm which unit you have, and what it's supposed to do
2. Clear any open recalls — free, and the only updates GM will genuinely push you to take
3. Get a dealer flash **only if** a symptom matches a bulletin
4. Set up CarPlay/Android Auto properly, which fixes most complaints people blame on firmware
5. Sort out OnStar and the myChevrolet app, which is where the real 2026 gotcha lives
6. Know the two reset procedures before you need them

## Order of operations

| Phase | File | Time | Why it's here |
|---|---|---|---|
| 1 | [Identify the system](01-identify-your-system.md) | 15 min | Three different radios wear the same "MyLink" name |
| 2 | [Recalls & bulletins](02-recalls-and-bulletins.md) | 30 min | Free, VIN-specific, and the only mandatory item here |
| 3 | [Software updates, honestly](03-software-updates.md) | 30 min | What updating actually means on this car |
| 4 | [CarPlay & Android Auto](04-carplay-android-auto.md) | 45 min | The cable is the problem more often than the car is |
| 5 | [OnStar & myChevrolet](05-onstar-and-mychevrolet.md) | 45 min | Connected Access is aging out right about now |
| 6 | [Troubleshooting](06-troubleshooting.md) | as needed | Black screen, freezing, and how to tell a bug from dead hardware |
| 7 | [Upgrades worth considering](07-upgrades.md) | — | Wireless CarPlay, screen swaps, and what to skip |
| 8 | [Validation](08-validation.md) | 30 min | Prove it all works before handing the keys back |

Phases 2, 4, and 5 are the ones with real payoff. If you only have an afternoon, do those three.

## A caution about sources

Almost everything written about MyLink updates online is either about a different GM vehicle, a
different radio generation, or is someone repeating a rumor about a USB update package that was
never publicly released for this car. Forum posts describing firmware files for "GM 8-inch radios"
are usually about the Infotainment 3 systems in 2019+ trucks, which are genuinely different hardware.

Where this guide is uncertain, it says so. Where a claim needs your VIN to confirm, it tells you to
go check rather than guessing for you.
