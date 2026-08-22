// The avatar. One creature, built additively — each evolution stage layers new parts
// onto the same body rather than swapping in a whole new drawing, so levelling up
// reads as growth instead of replacement.
//
// Everything is inline SVG with CSS keyframes. No image assets, no libraries.

import { stageForLevel } from './engine.js';

const MOODS = {
  healthy: { hue: 152, sat: '62%', light: '52%', bob: '2.6s' },
  wobbly:  { hue: 42,  sat: '48%', light: '52%', bob: '4.2s' },
  broken:  { hue: 220, sat: '10%', light: '48%', bob: '6s' },
};

/**
 * Build the creature SVG markup.
 *
 * @param {number} level   current player level, drives which parts exist
 * @param {'healthy'|'wobbly'|'broken'} health  drives colour and expression
 * @returns {string} SVG markup, safe to assign to innerHTML (no user input reaches it)
 */
export function creatureSvg(level, health = 'healthy') {
  const stage = stageForLevel(level);
  const mood = MOODS[health] ?? MOODS.healthy;

  const has = {
    limbs: level >= 5,
    legs: level >= 10,
    wings: level >= 15,
    aura: level >= 20,
  };

  // Standing on legs lifts the whole body so the creature doesn't grow downward
  // out of the frame.
  const lift = has.legs ? -6 : 0;

  const body = `hsl(${mood.hue} ${mood.sat} ${mood.light})`;
  const bodyDark = `hsl(${mood.hue} ${mood.sat} ${pct(mood.light, -14)})`;
  const bodyLight = `hsl(${mood.hue} ${mood.sat} ${pct(mood.light, +16)})`;

  return `
<svg viewBox="0 0 120 128" role="img" class="creature creature--${stage.id} creature--${health}"
     aria-label="${stage.name} creature, level ${level}, ${moodLabel(health)}">
  <style>
    .cr-bob { animation: cr-bob ${mood.bob} ease-in-out infinite; transform-origin: 60px 100px; }
    .cr-aura { animation: cr-spin 14s linear infinite; transform-origin: 60px 66px; }
    .cr-spark { animation: cr-twinkle 2.4s ease-in-out infinite; }
    .cr-spark:nth-of-type(2) { animation-delay: .8s; }
    .cr-spark:nth-of-type(3) { animation-delay: 1.6s; }
    .cr-wing-l { animation: cr-flap-l 3s ease-in-out infinite; transform-origin: 34px 66px; }
    .cr-wing-r { animation: cr-flap-r 3s ease-in-out infinite; transform-origin: 86px 66px; }

    @keyframes cr-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
    @keyframes cr-spin { to { transform: rotate(360deg); } }
    @keyframes cr-twinkle { 0%, 100% { opacity: .25; } 50% { opacity: 1; } }
    @keyframes cr-flap-l { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(-10deg); } }
    @keyframes cr-flap-r { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(10deg); } }

    @media (prefers-reduced-motion: reduce) {
      .cr-bob, .cr-aura, .cr-spark, .cr-wing-l, .cr-wing-r { animation: none; }
    }
  </style>

  ${has.aura ? aura(body) : ''}

  <g class="cr-bob" transform="translate(0 ${lift})">
    ${has.wings ? wings(bodyLight) : ''}
    ${has.limbs ? limbs(body, bodyDark) : ''}
    ${bodyShape(body, bodyDark, bodyLight)}
    ${face(health, bodyDark)}
  </g>

  ${has.legs ? legs(bodyDark) : ''}
  ${has.aura ? sparks(bodyLight) : ''}
</svg>`.trim();
}

/** Replace the contents of a container with a freshly built creature. */
export function renderCreature(container, level, health) {
  if (!container) return;
  container.innerHTML = creatureSvg(level, health);
}

// --- parts -----------------------------------------------------------------

function bodyShape(body, bodyDark, bodyLight) {
  return `
    <path d="M60 26 C82 26 96 44 96 66 C96 88 80 101 60 101 C40 101 24 88 24 66 C24 44 38 26 60 26 Z"
          fill="${body}" stroke="${bodyDark}" stroke-width="2.5" stroke-linejoin="round"/>
    <ellipse cx="47" cy="45" rx="11" ry="7" fill="${bodyLight}" opacity=".45"
             transform="rotate(-24 47 45)"/>`;
}

function face(health, ink) {
  const eyes = health === 'broken'
    // Downcast arcs read as "sad" without needing a whole new head.
    ? `<path d="M42 62 Q48 56 54 62" fill="none" stroke="${ink}" stroke-width="3.2" stroke-linecap="round"/>
       <path d="M66 62 Q72 56 78 62" fill="none" stroke="${ink}" stroke-width="3.2" stroke-linecap="round"/>`
    : `<circle cx="48" cy="60" r="5.2" fill="${ink}"/>
       <circle cx="72" cy="60" r="5.2" fill="${ink}"/>
       <circle cx="49.8" cy="58.2" r="1.7" fill="#fff" opacity=".9"/>
       <circle cx="73.8" cy="58.2" r="1.7" fill="#fff" opacity=".9"/>`;

  const mouth = {
    healthy: `<path d="M50 76 Q60 85 70 76" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`,
    wobbly:  `<path d="M51 80 Q60 76 69 80" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`,
    broken:  `<path d="M50 84 Q60 75 70 84" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`,
  }[health] ?? '';

  return eyes + mouth;
}

function limbs(body, bodyDark) {
  return `
    <ellipse cx="21" cy="72" rx="8" ry="6.5" fill="${body}" stroke="${bodyDark}" stroke-width="2.5"
             transform="rotate(-18 21 72)"/>
    <ellipse cx="99" cy="72" rx="8" ry="6.5" fill="${body}" stroke="${bodyDark}" stroke-width="2.5"
             transform="rotate(18 99 72)"/>`;
}

function legs(ink) {
  return `
    <rect x="45" y="93" width="9" height="19" rx="4.5" fill="${ink}"/>
    <rect x="66" y="93" width="9" height="19" rx="4.5" fill="${ink}"/>
    <ellipse cx="49.5" cy="114" rx="8" ry="4" fill="${ink}"/>
    <ellipse cx="70.5" cy="114" rx="8" ry="4" fill="${ink}"/>`;
}

function wings(light) {
  // Tall and pointed rather than round — the body covers everything inboard of
  // x=24, so a stubby wing only shows its rounded end and reads as an ear.
  return `
    <path class="cr-wing-l" d="M36 56 C20 28 4 34 3 52 C2 72 18 86 36 80 Z"
          fill="${light}" opacity=".72"/>
    <path class="cr-wing-r" d="M84 56 C100 28 116 34 117 52 C118 72 102 86 84 80 Z"
          fill="${light}" opacity=".72"/>`;
}

function aura(body) {
  return `
    <circle class="cr-aura" cx="60" cy="66" r="55" fill="none" stroke="${body}"
            stroke-width="2" stroke-linecap="round" stroke-dasharray="10 16" opacity=".55"/>`;
}

function sparks(light) {
  return `
    <circle class="cr-spark" cx="16" cy="30" r="3" fill="${light}"/>
    <circle class="cr-spark" cx="104" cy="38" r="2.4" fill="${light}"/>
    <circle class="cr-spark" cx="96" cy="14" r="2" fill="${light}"/>`;
}

// --- helpers ---------------------------------------------------------------

/** Shift an HSL lightness string like "52%" by a percentage-point delta. */
function pct(lightness, delta) {
  const base = parseFloat(lightness);
  return `${Math.min(96, Math.max(8, base + delta))}%`;
}

function moodLabel(health) {
  return { healthy: 'thriving', wobbly: 'waiting on you', broken: 'streak broken' }[health] ?? 'thriving';
}
