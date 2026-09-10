const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

// Panel size. Defaults to the Pixel 9/10 Pro XL; override for another phone,
// e.g. SIZE=1080x2424 node build.js
const [W, H] = (process.env.SIZE || '1344x2992').split('x').map(Number);
const FONTS = path.resolve(__dirname, '.fonts');
const OUT = path.resolve(__dirname, process.env.OUT || 'pixel-9-pro-xl');
const TMP = path.resolve(__dirname, '.render');

// Anton and JetBrains Mono, both SIL Open Font License. Fetched on first run
// rather than vendored, so the repo stays text plus the finished PNGs.
const FONT_URLS = {
  'Anton.ttf': 'https://fonts.gstatic.com/s/anton/v27/1Ptgg87LROyAm0K0.ttf',
  'JetBrainsMono.ttf': 'https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKxjPVmUsaaDhw.ttf',
};

async function ensureFonts() {
  fs.mkdirSync(FONTS, { recursive: true });
  for (const [name, url] of Object.entries(FONT_URLS)) {
    const dest = path.join(FONTS, name);
    if (fs.existsSync(dest)) continue;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`font fetch failed: ${name} ${res.status}`);
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    console.log('fetched', name);
  }
}

// The word set into the all-over print pieces. One place to change it.
const WORD = process.env.WORD || 'GORDO';

const fontFace = `
@font-face { font-family:'Anton'; src:url('file://${FONTS}/Anton.ttf') format('truetype'); }
@font-face { font-family:'JBMono'; src:url('file://${FONTS}/JetBrainsMono.ttf') format('truetype'); }
`;

// Original single-stroke profile contour, drawn here rather than traced from
// any mark. viewBox is 1000x1100 so the neck runs off the bottom of the frame.
const HEAD = `
<path d="M600 95
         C470 88 348 170 322 320
         C316 352 302 362 296 382
         C280 412 230 464 210 504
         C202 524 230 534 266 532
         C290 534 294 546 286 562
         C310 572 310 588 282 600
         C264 610 272 646 304 670
         C348 702 440 728 532 718
         C566 714 588 728 600 764
         C612 814 614 900 610 1100"/>
<path d="M600 95
         C742 108 838 236 838 396
         C838 520 796 618 754 686
         C730 726 722 800 722 1100"/>
<path d="M606 470
         C654 458 678 500 660 540
         C648 566 616 568 606 546"/>
`;

/* ------------------------------------------------------------------ */
/* Shared fragments                                                    */
/* ------------------------------------------------------------------ */

// The tilted band: two full-bleed hairlines with a black block between them.
function band({ y, tilt, h, top, bottom, glow, label, labelColor }) {
  return `
  <div class="band" style="top:${y}px; transform:rotate(${tilt}deg);">
    <div class="rule" style="background:${top}; box-shadow:0 0 ${glow}px ${top};"></div>
    <div class="slab" style="height:${h}px;"></div>
    <div class="rule" style="background:${bottom}; box-shadow:0 0 ${glow}px ${bottom};"></div>
  </div>
  <div class="bandtag" style="top:${y + h / 2}px; color:${labelColor};">${label}</div>`;
}

// Xerox/halftone grain. Keeps the flat vector fills from looking sterile.
const grain = `<div class="grain"></div>`;

/* ------------------------------------------------------------------ */
/* Piece builders                                                      */
/* ------------------------------------------------------------------ */

// The wordmark stack: a few full-width lines, black showing between them,
// with the tilted band cutting through the middle of it.
function printPiece(c) {
  const rows = Array(c.rows).fill(`<span>${WORD}</span>`).join('');
  return `
  <div class="stage" style="background:${c.ground}">
    <div class="bloom" style="background:${c.bloom}"></div>
    <div class="print" style="
        font-size:${c.size}px; letter-spacing:${c.track}em; line-height:${c.lead};
        background-image:linear-gradient(${c.ramp});
        filter:drop-shadow(0 0 16px ${c.halo}) drop-shadow(0 0 70px ${c.halo2});">
      ${rows}
    </div>
    ${band(c.band)}
    <div class="pip" style="background:${c.pip}; box-shadow:0 0 20px ${c.pip};"></div>
    ${grain}
  </div>`;
}

// One oversized word cropped by both edges, held low, with a bezel arc under it.
function heroPiece(c) {
  return `
  <div class="stage" style="background:${c.ground}">
    <div class="bloom" style="background:${c.bloom}"></div>
    <div class="ghost" style="
        font-size:${c.ghostSize}px; color:${c.ghost};
        filter:drop-shadow(0 0 40px ${c.halo2});">
      ${Array(5).fill(`<span>${WORD}</span>`).join('')}
    </div>
    <div class="hero" style="
        top:${c.heroY}px; font-size:${c.size}px; letter-spacing:${c.track}em;
        background-image:linear-gradient(${c.ramp});
        filter:drop-shadow(0 0 24px ${c.halo}) drop-shadow(0 0 80px ${c.halo2});">
      ${WORD}
    </div>
    <svg class="arc" viewBox="0 0 1344 420" preserveAspectRatio="none">
      <path d="M74 24 C430 300 914 300 1270 24" fill="none"
            stroke="${c.arc}" stroke-width="7" stroke-linecap="round"
            style="filter:drop-shadow(0 0 16px ${c.arc})"/>
    </svg>
    <div class="tag" style="color:${c.tag}">${c.tagText}</div>
    ${grain}
  </div>`;
}

// Linework: the neon contour, cropped by the frame, under a band.
function linePiece(c) {
  return `
  <div class="stage" style="background:${c.ground}">
    ${c.bloom ? `<div class="bloom" style="background:${c.bloom}"></div>` : ''}
    <svg class="head" viewBox="0 0 1000 1100" preserveAspectRatio="xMidYMax meet">
      <defs>
        <linearGradient id="ink" x1="0" y1="0" x2=".3" y2="1">
          ${c.stops}
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#ink)" stroke-width="${c.weight}"
         stroke-linecap="round" stroke-linejoin="round"
         style="filter:${c.glow}">
        ${HEAD}
      </g>
    </svg>
    ${band(c.band)}
    <div class="pip" style="background:${c.pip}; box-shadow:0 0 20px ${c.pip};"></div>
    ${grain}
  </div>`;
}

/* ------------------------------------------------------------------ */
/* The six                                                             */
/* ------------------------------------------------------------------ */

const PIECES = [

  { name: 'club-neon', build: () => printPiece({
      ground: '#000000',
      bloom: 'radial-gradient(66% 30% at 50% 40%, rgba(70,255,244,.13), transparent 74%)',
      size: 505, track: -.005, lead: 1.28, rows: 4,
      ramp: '180deg, #46A9FF 0%, #46FFF4 36%, #46FF6F 74%, #46FFF4 100%',
      halo: 'rgba(70,255,244,.40)', halo2: 'rgba(70,169,255,.22)',
      pip: '#FF46F8',
      band: { y: 1520, tilt: -6, h: 300, top: '#46FFF4', bottom: '#FF46F8', glow: 14,
              label: 'C L U B', labelColor: '#46FFF4' },
    })
  },

  { name: 'prism-synth', build: () => printPiece({
      ground: '#050208',
      bloom: 'radial-gradient(70% 34% at 50% 58%, rgba(255,70,248,.15), transparent 76%)',
      size: 505, track: -.005, lead: 1.28, rows: 4,
      ramp: '180deg, #FF46F8 0%, #C158FF 34%, #7B6BFF 62%, #46FFF4 100%',
      halo: 'rgba(255,70,248,.38)', halo2: 'rgba(70,255,244,.20)',
      pip: '#46FFF4',
      band: { y: 1170, tilt: 6, h: 300, top: '#46FFF4', bottom: '#FF46F8', glow: 14,
              label: 'P R I S M', labelColor: '#FF46F8' },
    })
  },

  { name: 'ember-warm', build: () => heroPiece({
      ground: '#0C0704',
      bloom: 'radial-gradient(76% 36% at 50% 56%, rgba(255,146,70,.20), transparent 78%)',
      ghost: 'rgba(201,162,83,.12)', ghostSize: 420,
      heroY: 1440, size: 560, track: -.02,
      ramp: '180deg, #FFD246 0%, #FF9246 52%, #FF5F4A 100%',
      halo: 'rgba(255,146,70,.44)', halo2: 'rgba(255,210,70,.20)',
      arc: '#C9A253',
      tag: '#C9A253', tagText: 'E M B E R',
    })
  },

  { name: 'head-neon', build: () => linePiece({
      ground: '#000000',
      bloom: 'radial-gradient(56% 26% at 42% 50%, rgba(70,255,111,.13), transparent 72%)',
      stops: '<stop offset="0" stop-color="#46FFF4"/><stop offset=".55" stop-color="#46FF6F"/><stop offset="1" stop-color="#46A9FF"/>',
      weight: 15,
      glow: 'drop-shadow(0 0 14px rgba(70,255,244,.85)) drop-shadow(0 0 48px rgba(70,255,111,.45))',
      pip: '#FF46F8',
      band: { y: 2310, tilt: -5, h: 290, top: '#F5E800', bottom: '#FF46F8', glow: 14,
              label: 'N E O N', labelColor: '#46FFF4' },
    })
  },

  { name: 'head-volt', build: () => linePiece({
      ground: '#000000',
      bloom: 'radial-gradient(56% 26% at 42% 50%, rgba(245,232,0,.14), transparent 72%)',
      stops: '<stop offset="0" stop-color="#FFF75E"/><stop offset=".5" stop-color="#F5E800"/><stop offset="1" stop-color="#E0C400"/>',
      weight: 17,
      glow: 'drop-shadow(0 0 16px rgba(245,232,0,.90)) drop-shadow(0 0 56px rgba(245,232,0,.40))',
      pip: '#F5E800',
      band: { y: 2310, tilt: -5, h: 290, top: '#F5E800', bottom: '#F5E800', glow: 14,
              label: 'V O L T', labelColor: '#F5E800' },
    })
  },

  { name: 'head-whiteout', build: () => linePiece({
      ground: '#000000',
      bloom: null,
      stops: '<stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#FFFFFF"/>',
      weight: 14,
      glow: 'none',
      pip: '#FFFFFF',
      band: { y: 2310, tilt: -5, h: 290, top: '#FFFFFF', bottom: '#FFFFFF', glow: 0,
              label: 'W H I T E O U T', labelColor: '#B8B8B8' },
    })
  },
];

/* ------------------------------------------------------------------ */

const shell = (body) => `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFace}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:#000}
.stage{position:relative;width:${W}px;height:${H}px;overflow:hidden}
.bloom{position:absolute;inset:0;z-index:1}

.print{
  position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
  z-index:2; font-family:'Anton',sans-serif; text-align:center;
  color:transparent; -webkit-background-clip:text; background-clip:text;
  display:flex; flex-direction:column; white-space:nowrap;
}

.ghost{
  position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
  z-index:2; font-family:'Anton',sans-serif; line-height:1.9; text-align:center;
  display:flex; flex-direction:column; white-space:nowrap;
}
.hero{
  position:absolute; left:50%; transform:translateX(-50%); z-index:3;
  font-family:'Anton',sans-serif; line-height:.9; white-space:nowrap;
  color:transparent; -webkit-background-clip:text; background-clip:text;
}
.arc{position:absolute; z-index:3; left:0; bottom:230px; width:${W}px; height:520px}

.head{position:absolute; z-index:2; left:-25%; width:150%; bottom:0;}

.band{position:absolute; left:-22%; width:144%; z-index:4;}
.band .rule{width:100%;height:4px}
.band .slab{width:100%;background:#000}

.tag{
  position:absolute; z-index:5; left:0; right:0; bottom:110px; text-align:center;
  font-family:'JBMono',monospace; font-size:25px; letter-spacing:.44em; opacity:.5;
}
.bandtag{
  position:absolute; z-index:5; left:0; right:0; text-align:center;
  transform:translateY(-50%);
  font-family:'JBMono',monospace; font-size:27px; letter-spacing:.46em; opacity:.72;
}
.pip{
  position:absolute; z-index:5; left:50%; top:132px; margin-left:-9px;
  width:18px; height:18px; border-radius:50%;
}
.grain{
  position:absolute; inset:0; z-index:6; pointer-events:none; opacity:.14;
  background-image:radial-gradient(rgba(255,255,255,.5) .9px, transparent 1px);
  background-size:4px 4px; mix-blend-mode:overlay;
}
</style></head><body>${body}</body></html>`;

(async () => {
  await ensureFonts();
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(TMP, { recursive: true });
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--force-color-profile=srgb', '--font-render-hinting=none'],
  });
  const page = await browser.newPage({
    viewport: { width: W, height: H }, deviceScaleFactor: 1,
  });

  for (const p of PIECES) {
    const file = path.join(TMP, p.name + '.html');
    fs.writeFileSync(file, shell(p.build()));
    await page.goto('file://' + file);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT, p.name + '.png'), type: 'png' });
    console.log('rendered', p.name);
  }

  await browser.close();
})();
