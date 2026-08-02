# Phase 2 — Recalls & bulletins

**Time:** 30 minutes. **You need:** the VIN.

This is the only phase with something GM will fix for free, forever, on any owner's car. Do it first.

Safety recalls **do not expire** and are **not tied to the original owner**. A 2017 car bought used
in 2026 with an open recall still gets the repair at no charge at any Chevrolet dealer. Wendy does
not need to have bought the car new, and there's no mileage cutoff.

## Get the VIN

Driver's side dash at the base of the windshield, visible from outside. Also on the driver's door
jamb sticker, the insurance card, and the registration. 17 characters.

For a 2017 Cruze **hatchback** the VIN's body-style digits differ from the sedan's — relevant only
because some lookup sites make you pick "Cruze" vs "Cruze 5 HB" from a menu. Pick the hatch.

## Check it — two places, both free

**1. NHTSA** — `nhtsa.gov/recalls`. Enter the VIN. This is the authoritative US government list of
open safety recalls for that specific car. It reports only recalls that are **still open** on the
VIN, so a blank result is genuinely good news, not a failed lookup.

**2. Chevrolet Owner Center / myChevrolet app** — GM's own record. Occasionally shows customer
satisfaction programs and special coverage adjustments that aren't safety recalls and therefore
don't appear on the NHTSA site. Worth checking both.

If either one lists something open, call a dealer's service department, give them the VIN, and ask
them to schedule the recall repair. Say the word "recall" — it routes differently from paid service
and it should never generate a quote.

## Known recalls for the 2017 Cruze

Two were issued against this model year. **Neither replaces a VIN check** — this list is context so
you know what you're looking at if one comes back.

| NHTSA number | Component | Scope | Remedy |
|---|---|---|---|
| **17V057000** | Front seats | Certain 2016–2017 Cruze | Inspect front passenger seat; replace seat-back frames with incorrect welds |
| **18V304000** | Fuel system | Certain 2016–2018 Cruze **LS** with gasoline engine and a tire inflator kit instead of a spare | Install a lock-ring shielding the fuel tank vapor pressure sensor from rear-impact damage |

Note the scope on the second one: it targets **LS** trim cars fitted with an inflator kit rather than
a spare. An LT hatchback is probably outside that population — but "probably" is exactly why you run
the VIN rather than reading a table.

Neither of these is infotainment-related. There is no safety recall on the MyLink system itself for
this model year, which is worth knowing because a frozen screen is not going to be fixed for free
under a recall.

## Technical service bulletins are a different thing

A **TSB** is not a recall. It's GM telling dealers "if a customer reports symptom X, here's the known
fix." TSBs are not free, not mandatory, and not something the dealer will volunteer.

This matters for infotainment specifically, because **a radio software flash on this car usually
happens under a TSB**, not a recall. See [Phase 3](03-software-updates.md) for how to actually
request one.

To see what bulletins exist for the car: NHTSA publishes TSB summaries at `nhtsa.gov` under the
vehicle's complaints/bulletins tab. The summaries are terse — often just a title and a date — but a
title is enough to ask a service advisor an informed question.

Search the bulletin list for terms like `radio`, `infotainment`, `MyLink`, `display`, `Bluetooth`,
and `USB`. Write down the bulletin number of anything whose title resembles a symptom the car
actually has. Bulletins for symptoms the car *doesn't* have are not worth chasing.

## What to do with a bulletin number

Call the dealer and be specific:

> "It's a 2017 Cruze hatchback, VIN is ____. It's doing ____. I found bulletin ____ that looks like
> it matches. Can you check whether the radio is at the latest software level for this VIN, and
> whether that bulletin applies?"

That question gets a much better answer than "can you update my radio." The dealer's system can look
up the current software level programmed to that VIN against the latest available — that lookup is
the actual answer to "is my car up to date," and you can't run it yourself.

Expect diagnostic time to be billable if nothing applies. Ask what the diagnostic fee is before you
book, and ask whether it's waived if a bulletin turns out to cover the repair.

Next: [Phase 3 — Software updates, honestly](03-software-updates.md)
