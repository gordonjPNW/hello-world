# Phase 6 — Troubleshooting

Read this before you need it. The two headline failures on GM infotainment of this era look
identical from the driver's seat — a black or frozen screen — but one is a software hang you can
clear in your driveway and the other is a dead module. Telling them apart saves a diagnostic fee.

## Symptom: black screen, frozen screen, or endless reboot loop

### Fix 1 — the sleep reset (try this first)

These units clear their cache on shutdown, and can hang partway through. The system needs the car to
go fully to sleep to finish, and **locking the car or opening it again interrupts that.**

1. Turn the car off.
2. Open the driver's door, then close it.
3. **Do not lock the car.** Walk away.
4. Wait at least 5 minutes — 15 is safer.
5. Start the car.

This clears a surprising share of MyLink hangs. It costs nothing and it's the same thing a dealer
would try first. If it half-works — screen comes back, then hangs again next drive — repeat once
with a longer wait before escalating.

### Fix 2 — power cycle at the fuse box

If the sleep reset doesn't take, cutting power to the module forces a cold boot.

The cleanest version on this car is to disconnect the **positive lead at the underhood fuse box**,
which on a second-gen Cruze is typically a **13 mm** nut. Leave it disconnected for about 5 minutes,
then reconnect.

Before you do this:

- **Know the radio's anti-theft/pairing state.** Modern GM units generally re-authenticate to the
  car automatically, but confirm you're not about to need a code you don't have.
- You'll lose radio presets, clock, and possibly some trip data. Not the pairings, usually.
- If you're not comfortable working around battery terminals, this is a legitimate thing to hand to
  a shop. It's a 15-minute job.

Disconnecting the battery negative terminal accomplishes the same thing if that's easier to reach.

### Fix 3 — check the fuses

If the screen is fully dark with no backlight and no chime, check the infotainment-related fuses in
both the underhood box and the interior box. The owner's manual — or the myChevrolet app's copy of
it for the exact VIN — has the fuse map. A blown fuse is cheap and immediate.

### If none of that works: suspect the HMI module

The **HMI module** is the computer running MyLink. It's a known failure point across GM's radios of
this generation, not just the Cruze. Symptoms of a failing module rather than a software hang:

- Resets work but only for a day or two, with the interval shortening
- Screen is dark but the audio still plays, or vice versa
- Touch input is dead or wildly offset while the display is fine
- The unit gets hot and fails more readily when the car has been sitting in the sun

That's a hardware replacement, and it needs programming to the VIN afterward — meaning a dealer or a
shop with GM programming capability. Get a quote before authorizing it, and ask specifically whether
the quote includes programming, because that's where surprise line items appear. On a 2017 Cruze
it's worth comparing against a good aftermarket head unit — see [Phase 7](07-upgrades.md).

## Symptom: no sound, or sound only from some speakers

Check in this order:

1. **Balance and fade** in audio settings — easy to knock off center accidentally, and it perfectly
   mimics a dead speaker.
2. **Speed-compensated volume** — if volume behaves strangely with speed, this setting is why.
3. **Source-specific muting** — try radio, Bluetooth, and USB separately. One dead source is a
   different problem from all sources dead.
4. Amplifier-equipped cars have a separate amp that can fail independently of the head unit.

## Symptom: Bluetooth connects but calls are one-sided

Almost always the microphone or its permissions:

- Check that the phone granted the car microphone access.
- Delete the pairing on both sides and re-pair — a partial pairing that got audio but not the
  hands-free profile is common.
- If the far end can't hear her at all on every call and every phone, the cabin microphone (in the
  headliner near the dome light) or its wiring is the suspect.

## Symptom: backup camera black or distorted

Not strictly infotainment, but it displays through the same screen so it lands here.

- A **fully black screen only in reverse**, with the radio otherwise fine, points at the camera or
  its wiring rather than the head unit.
- Water intrusion into the camera is the usual cause on cars of this age. Look for fogging inside
  the lens.
- A **distorted or garbled image** more often points at the head unit or the video connection.
- Clean the lens first. It sounds too obvious and it's right often enough to try.

## Symptom: screen works but everything is slow

Manage expectations here. This is 2017 automotive hardware and it was not fast when new. That said:

- **Clear out stale Bluetooth pairings** — [Phase 4](04-carplay-android-auto.md). A full device list
  slows boot measurably.
- **Remove a large USB drive** full of media. The unit indexes it on every start.
- If it's slow *and* getting worse over months, that's the HMI module pattern above, not aging.

## When to stop and go to a dealer

Escalate if:

- Resets stop holding, or the interval between failures is shrinking
- Anything infotainment-related is accompanied by **warning lights on the cluster** — that suggests a
  network or power fault, not a radio fault
- The screen fails and something else electrical fails at the same time

Take the version photo from [Phase 3](03-software-updates.md) and any bulletin numbers from
[Phase 2](02-recalls-and-bulletins.md) with you.

Next: [Phase 7 — Upgrades worth considering](07-upgrades.md)
