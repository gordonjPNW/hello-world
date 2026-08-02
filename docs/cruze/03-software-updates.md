# Phase 3 — Software updates, honestly

**Time:** 30 minutes to read and check. **You need:** [Phase 1](01-identify-your-system.md) done.

## The short version

| Thing | Can you update it yourself? |
|---|---|
| Radio / infotainment firmware | **No.** Dealer only, over the service connector |
| Over-the-air updates | **No.** This car predates GM's OTA platform |
| Embedded navigation maps (IO6 only) | **Sometimes** — sold separately on USB/SD, if still produced for this unit |
| CarPlay / Android Auto behavior | **Yes, indirectly** — it updates with the *phone*, not the car |
| OnStar / myChevrolet app features | **Yes** — server-side, nothing to install |

Most of what people want from an "infotainment update" on a car this age is actually delivered by
the phone. That's not a consolation prize — CarPlay and Android Auto in 2026 are vastly better than
they were in 2017, and they run on the phone's software, not the car's.

## Why there's no download link

GM does not publish consumer-downloadable infotainment firmware for the 2017 Cruze. Dealers flash
radio software through GM's Service Programming System, which requires a subscription, a dealer
account, and a physical connection to the car's diagnostic port. There is no public package, no
official USB image, and no login on Chevrolet's site that will give you one.

You will find forum threads insisting a USB update exists. Treat them carefully — most are about
different hardware:

- Threads about "GM 8-inch radio firmware" are usually **Infotainment 3** systems in 2019+ trucks
  and SUVs. Genuinely different hardware from a 2017 Cruze radio.
- Threads referencing **Chevrolet's Settings → Updates menu** are about vehicles on GM's newer
  electrical architecture. That menu doesn't exist on this car.
- Old bulletin numbers get passed around as if they were download links. A bulletin is an instruction
  to a technician, not a file.

Do **not** install a firmware image someone posts to a file-sharing site. A failed radio flash on
this platform means a replacement module and a dealer programming session, which costs far more than
whatever the bug was worth fixing.

## What "up to date" actually means here

The only reliable answer comes from a dealer running your VIN against GM's current software levels —
see the script at the end of [Phase 2](02-recalls-and-bulletins.md). That's a five-minute lookup for
them.

Two things to understand before you ask:

**Radio software for this generation stopped being actively developed years ago.** The last updates
for these units addressed specific defects, not features. There is no version out there that adds
wireless CarPlay, split-screen, or a new interface. If a service advisor says "it's at the latest
level," that's probably true and it doesn't mean anything was withheld from you.

**A flash is a fix, not an upgrade.** Ask for one when the car has a symptom that matches a known
bulletin. Asking for one because it feels overdue will get you a diagnostic charge and no change.

## Reading the current version

Useful to note before a dealer visit, so you can tell whether anything actually changed.

Go to **Settings** on the touchscreen, then look for **About**, **System Information**, or
**Software Information** — the label varies between the 7-inch and 8-inch units and between software
levels. You're looking for a build/version string, often long and non-obvious.

Photograph it. If a dealer flashes the radio, photograph it again afterward. Two photos is the whole
verification.

If you can't find the menu at all, don't force it — the version string isn't required for anything,
it's just evidence.

## Navigation maps — IO6 only

Skip this entirely if [Phase 1](01-identify-your-system.md) said IOB or IO5. Those units have no
embedded maps.

For IO6, map data is a **separate product from radio software**. GM sells map updates for
navigation-equipped vehicles through a map update portal, typically as a USB drive or SD card keyed
to the vehicle, ordered by VIN or by year/model.

Two realistic outcomes for a 2017 unit in 2026:

1. An update exists, costs somewhere in the range of a tank of gas or two, and buys you a map that
   is still a couple of years behind current.
2. Updates for this unit have been discontinued and the portal has nothing to sell you.

Either way, check by VIN before assuming. And weigh it honestly: **if CarPlay or Android Auto works,
phone navigation is better than an updated 2017 embedded map** — it's live, it has current traffic,
and it costs nothing. Buying a map update for a car with working phone projection is rarely the
right call. Buy it only if she genuinely drives outside cell coverage.

## The updates that actually matter

Given all of the above, here's where your effort goes instead:

1. **Open recalls** — [Phase 2](02-recalls-and-bulletins.md). Free, and real.
2. **The phone's OS and apps** — [Phase 4](04-carplay-android-auto.md). This is where the car gets
   meaningfully better year over year. A current iOS or Android version brings a current CarPlay or
   Android Auto interface to a nine-year-old head unit.
3. **OnStar account state** — [Phase 5](05-onstar-and-mychevrolet.md). Nothing to install, but
   there's a time-based expiry worth knowing about right now.

Next: [Phase 4 — CarPlay & Android Auto](04-carplay-android-auto.md)
