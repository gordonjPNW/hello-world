# Phase 4 — CarPlay & Android Auto

**Time:** 45 minutes. **You need:** her phone, and a good cable.

This is the highest-value phase in the guide. On a car with no embedded navigation and a nine-year-old
interface, phone projection *is* the infotainment system. Getting it solid fixes most of what people
blame on "the radio being old."

## What this car supports

- **Wired CarPlay and wired Android Auto**, standard on the 2017 Cruze LT.
- **Not wireless.** The 2017 Cruze does not support wireless CarPlay or wireless Android Auto
  natively. Any claim otherwise is either about a newer car or about an aftermarket adapter — see
  [Phase 7](07-upgrades.md) for the adapter route, which is real but has tradeoffs.
- **One projection session at a time.** CarPlay and Android Auto don't run simultaneously. If both
  of you connect phones regularly, expect to swap.

## Get the cable right

Say this first because it's the answer roughly half the time: **the cable is usually the problem.**

- Use a **data** cable, not a charge-only cable. Cheap cables sold for charging often have no data
  lines at all. The car will happily charge the phone and never show CarPlay.
- For iPhone: use the cable Apple shipped, or a third-party cable with **MFi / "Made for iPhone"**
  certification. Uncertified cables fail intermittently, which is worse than failing outright.
- For Android: use the cable that came with the phone, or a known-good USB-C cable rated for data.
- **Replace any cable that's been living in a car.** Heat, sun, and being yanked at an angle kill
  them. A frayed or intermittently-working cable produces exactly the symptom people describe as
  "CarPlay randomly disconnects."

Buy two good cables. Keep one in the car, keep one as the known-good spare for testing. This is a
ten-dollar fix for a problem people take to dealers.

## Use the right USB port

Not every USB port in the car does data. The port in the **center stack / front of the console** is
the projection port. Ports in the rear of the console or in a rear seat area may be charge-only,
depending on how the car was configured.

If CarPlay doesn't appear, try the other port before concluding anything is broken.

## iPhone — first-time setup

1. On the phone: **Settings → General → CarPlay** and make sure CarPlay isn't restricted. If
   Screen Time restrictions are on, check **Settings → Screen Time → Content & Privacy Restrictions
   → Allowed Apps** and confirm CarPlay is permitted.
2. Unlock the phone. A locked phone on first connection will often just charge.
3. Start the car and let the radio finish booting **before** plugging in. Plugging in mid-boot is a
   common cause of a failed first handshake.
4. Plug into the center-stack USB port.
5. The screen should prompt to enable Apple CarPlay. Accept it.
6. Siri must be enabled for CarPlay to work properly — CarPlay leans on it for voice control.

Once it's worked once, it should come up automatically on subsequent connections.

## Android — first-time setup

1. On modern Android versions, Android Auto is **built into the OS** rather than being a separate
   app you launch. Older phones need the Android Auto app installed from the Play Store first.
2. Make sure the Android Auto components are **up to date** in the Play Store before the first
   attempt. This is the single most common Android Auto fix.
3. Unlock the phone, start the car, let the radio boot, then plug into the center-stack port.
4. Accept the prompts on the **phone** — Android Auto asks for permissions on the phone screen, not
   the car screen, and it's easy to miss them and assume the car failed.
5. Grant location, contacts, and notification access when asked, or half the features silently do
   nothing.

## Set Bluetooth up too — but understand the split

Bluetooth and phone projection are separate systems on this car and they overlap confusingly.

- **With CarPlay or Android Auto active**, calls and audio route through the projection session.
- **Without it** — phone in a pocket, cable left at home — Bluetooth handles hands-free calling and
  audio streaming.

Pair over Bluetooth anyway, so the car is useful when the cable isn't in play. **Settings →
Bluetooth → Pair Device** on the touchscreen, then select the car from the phone's Bluetooth menu
and confirm the matching code.

**Clear out stale pairings while you're in there.** These units hold a limited number of paired
devices, and a list full of old phones — a previous owner's, an upgraded handset — causes connection
flakiness that looks like a hardware fault. Delete everything that isn't a phone currently in use.

## Known friction on this generation

Worth knowing so you don't chase a dealer visit over normal behavior:

- **Slow boot.** The radio takes a noticeable moment to come up on a cold start, and projection
  starts after that. This is normal for the hardware.
- **Projection needs the phone unlocked** on first connect after a phone reboot.
- **New OS versions occasionally break older head units temporarily.** If CarPlay or Android Auto
  stops working right after a major phone OS update, the fix almost always arrives in a phone-side
  update, not a car-side one. Check for phone updates before booking service.
- **Voice control quality is a phone feature.** Siri and Google Assistant through projection are
  current-generation; the car's own built-in voice recognition is 2017-era and much worse. Use the
  steering wheel button that invokes the phone assistant, not the car's.

## Quick diagnostic order

When projection stops working, work down this list before assuming the radio failed:

1. Try the **known-good spare cable**.
2. Try the **other USB port**.
3. **Unlock the phone**, then unplug and replug.
4. Check for **phone OS and app updates**.
5. On the phone, **forget the car** in Bluetooth settings, delete the pairing on the car side too,
   and re-pair from scratch.
6. Try a **different phone entirely**. If a second phone works, the car is fine.
7. Only then go to [Phase 6](06-troubleshooting.md) for the radio-side resets.

Next: [Phase 5 — OnStar & myChevrolet](05-onstar-and-mychevrolet.md)
