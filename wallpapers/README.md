# Phone backgrounds

Six wallpapers built to sit alongside the watch face set in the Dial Index.
They borrow the same palette and the same structural moves rather than shrinking
a dial onto a phone: black ground, oversized cropped wordmark, the tilted band
with a hairline on each edge, and the neon glow stack.

Rendered at **1344 x 2992**, the Pixel 9 / 10 Pro XL panel.

## The set

| File | From | Notes |
| --- | --- | --- |
| `club-neon.png` | CLUB | Wordmark stack ramping blue to cyan to green, band tilted -6 degrees with cyan and magenta rules. |
| `prism-synth.png` | PRISM | Same structure in synthwave. Pink through violet to cyan, band tilted the other way. |
| `ember-warm.png` | EMBER | Wordmark held back to texture, one warm line as hero, gold bezel arc beneath. |
| `head-neon.png` | BRAINDEAD | Single-stroke profile in cyan to green, yellow and magenta rules on the band. |
| `head-volt.png` | VOLT | The same linework in high-visibility yellow. The loudest one. |
| `head-whiteout.png` | WHITEOUT | Plain white linework on black. No ramp, no glow. |

Each one keeps the top third clear so the lock screen clock has somewhere to sit,
and puts the band low enough that the icon grid does not fight it.

The linework is drawn here rather than traced from anything. The wordmark is set
from `WORD`, so the type pieces can carry whatever mark you want.

## Building

```
npm install
node build.js
```

Fonts (Anton and JetBrains Mono, both SIL Open Font License) are fetched on the
first run into `.fonts/`. Rendering goes through headless Chromium, so
`playwright-core` needs a browser it can reach; set `executablePath` in
`build.js` if yours lives somewhere other than `/opt/pw-browsers`.

Three environment variables change the output:

```
WORD=GORDO           # the wordmark set into the type pieces
SIZE=1080x2424       # panel size, for a different phone
OUT=pixel-9          # output directory
```
