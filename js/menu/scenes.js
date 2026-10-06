// Animated order-status scenes for the customer tracker (inline SVG, animated in css/menu.css).
//   clock   — scheduled: alarm clock, hands turning
//   printer — received: the kitchen printer prints the ticket
//   pan     — preparing food: pan tossing food over the flame
//   pour    — preparing drinks: a cup filling up
//   cloche  — ready: the serving dome lifts, sparkles
//   done    — completed: check mark with hearts
//   cancel  — cancelled
import { raw } from '../core/util.js';

let uid = 0;
const r1 = (n) => Math.round(n * 10) / 10;

function ticks(cx, cy) {
  let out = '';
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6, rin = i % 3 ? 35 : 31, rout = 39;
    out += `<line x1="${r1(cx + rin * Math.sin(a))}" y1="${r1(cy - rin * Math.cos(a))}" x2="${r1(cx + rout * Math.sin(a))}" y2="${r1(cy - rout * Math.cos(a))}"/>`;
  }
  return out;
}
function rays(cx, cy, n = 8, rin = 54, rout = 66) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const a = (i * 2 * Math.PI) / n + Math.PI / n;
    out += `<line x1="${r1(cx + rin * Math.cos(a))}" y1="${r1(cy + rin * Math.sin(a))}" x2="${r1(cx + rout * Math.cos(a))}" y2="${r1(cy + rout * Math.sin(a))}"/>`;
  }
  return out;
}
const SPARK = 'M0-9C1-3 3-1 9 0 3 1 1 3 0 9-1 3-3 1-9 0-3-1-1-3 0-9Z';
const HEART = 'M0 5C-9-2-4-10 0-5 4-10 9-2 0 5Z';

const SCENES = {
  clock: () => `
    <ellipse class="scn-shadow" cx="80" cy="146" rx="38" ry="5"/>
    <g class="clk">
      <path class="clk-bell" d="M33 57A21 21 0 0 1 61 31Z"/>
      <path class="clk-bell" d="M99 31A21 21 0 0 1 127 57Z"/>
      <g class="clk-legs"><line x1="54" y1="126" x2="45" y2="140"/><line x1="106" y1="126" x2="115" y2="140"/></g>
      <circle class="clk-face" cx="80" cy="86" r="46"/>
      <g class="clk-ticks">${ticks(80, 86)}</g>
      <line class="clk-h" x1="80" y1="86" x2="80" y2="64"/>
      <line class="clk-m" x1="80" y1="86" x2="80" y2="54"/>
      <circle class="clk-cap" cx="80" cy="86" r="5"/>
    </g>`,

  printer: (id) => `
    <clipPath id="${id}"><rect x="10" y="63" width="140" height="97"/></clipPath>
    <ellipse class="scn-shadow" cx="80" cy="146" rx="44" ry="5"/>
    <g class="prn">
      <rect class="prn-roll" x="44" y="20" width="72" height="16" rx="8"/>
      <rect class="prn-body" x="26" y="30" width="108" height="38" rx="12"/>
      <rect class="prn-stripe" x="26" y="44" width="108" height="5"/>
      <circle class="prn-led" cx="116" cy="38" r="3.5"/>
      <rect class="prn-slot" x="42" y="60" width="76" height="6" rx="3"/>
    </g>
    <g clip-path="url(#${id})">
      <g class="prn-paper">
        <path class="prn-sheet" d="M50 36H110V134l-6-5-6 5-6-5-6 5-6-5-6 5-6-5-6 5-6-5-6 5Z"/>
        <rect class="prn-ln prn-ln--b" x="60" y="76" width="40" height="5" rx="2.5"/>
        <rect class="prn-ln" x="60" y="88" width="30" height="4" rx="2"/>
        <rect class="prn-ln" x="60" y="98" width="36" height="4" rx="2"/>
        <rect class="prn-ln" x="60" y="108" width="24" height="4" rx="2"/>
        <rect class="prn-ln prn-ln--b" x="88" y="108" width="12" height="4" rx="2"/>
      </g>
    </g>`,

  pan: () => `
    <ellipse class="scn-shadow" cx="80" cy="148" rx="42" ry="5"/>
    <g class="pan-steam"><path d="M64 84c-6-6 6-10 0-16s6-10 0-16"/><path d="M80 80c-6-6 6-10 0-16s6-10 0-16"/><path d="M96 84c-6-6 6-10 0-16s6-10 0-16"/></g>
    <g class="pan-fire">
      <path class="fl fl--o" d="M57 140C53 131 59 125 62 116 66 125 71 131 67 140Z"/>
      <path class="fl fl--o fl--2" d="M72 140C68 129 75 121 80 110 85 121 92 129 88 140Z"/>
      <path class="fl fl--o fl--3" d="M93 140C89 131 95 125 98 116 101 125 107 131 103 140Z"/>
      <path class="fl fl--i fl--2" d="M76 140C74 133 78 128 80 122 82 128 86 133 84 140Z"/>
    </g>
    <rect class="pan-burner" x="48" y="139" width="64" height="7" rx="3.5"/>
    <g class="pan-move">
    <g class="pan-food">
      <circle class="fd fd--1" cx="62" cy="104" r="7"/>
      <rect class="fd fd--2" x="72" y="98" width="15" height="10" rx="4"/>
      <circle class="fd fd--3" cx="98" cy="103" r="7"/>
      <rect class="fd fd--4" x="86" y="100" width="9" height="9" rx="2.5"/>
      <ellipse class="fd fd--5" cx="74" cy="104" rx="6" ry="3.5"/>
    </g>
    <g class="pan-body">
      <path class="pan-bowl" d="M36 106H124C124 118 110 127 80 127S36 118 36 106Z"/>
      <rect class="pan-rim" x="32" y="102" width="96" height="7" rx="3.5"/>
      <rect class="pan-handle" x="124" y="102.5" width="18" height="6" rx="3"/>
      <rect class="pan-grip" x="138" y="101" width="20" height="9" rx="4.5"/>
      <path class="pan-shine" d="M46 113c9 7 22 9 34 9"/>
    </g>
    </g>`,

  pour: (id) => `
    <clipPath id="${id}"><path d="M62 78H114L108 132A6 6 0 0 1 102 137H74A6 6 0 0 1 68 132Z"/></clipPath>
    <ellipse class="scn-shadow" cx="88" cy="146" rx="36" ry="5"/>
    <path class="pr-glass" d="M62 78H114L108 132A6 6 0 0 1 102 137H74A6 6 0 0 1 68 132Z"/>
    <rect class="pr-stream" x="88" y="40" width="5" height="96" rx="2.5"/>
    <g clip-path="url(#${id})">
      <g class="pr-fill">
        <rect class="pr-liq" x="40" y="82" width="100" height="70"/>
        <path class="pr-wave" d="M40 83q8-5 16 0t16 0 16 0 16 0 16 0 16 0v6H40Z"/>
        <circle class="pr-bub" cx="80" cy="120" r="2.5"/><circle class="pr-bub pr-bub--2" cx="96" cy="126" r="2"/>
      </g>
    </g>
    <path class="pr-cup" d="M62 78H114L108 132A6 6 0 0 1 102 137H74A6 6 0 0 1 68 132Z"/>
    <path class="pr-glint" d="M70 88l4 38"/>
    <g class="pr-jug"><g transform="rotate(50 60 36)">
      <path class="pr-handle" d="M44 24C33 24 33 44 42 47"/>
      <path class="pr-pitcher" d="M44 18H74L84 14 77 26 79 56H40Z"/>
      <path class="pr-milk" d="M42 40H78L79 56H40Z"/>
    </g></g>`,

  cloche: (id) => `
    <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f6f9"/><stop offset="1" stop-color="#aeb8c4"/></linearGradient>
    <ellipse class="scn-shadow" cx="80" cy="138" rx="52" ry="5"/>
    <ellipse class="cl-plate" cx="80" cy="125" rx="58" ry="9"/>
    <g class="cl-food">
      <path class="cl-dome-food" d="M54 123C54 105 66 96 80 96S106 105 106 123Z"/>
      <circle class="cl-g" cx="69" cy="107" r="5"/><circle class="cl-r" cx="80" cy="101" r="4.5"/><circle class="cl-g" cx="91" cy="106" r="4.5"/><circle class="cl-r" cx="96" cy="115" r="4"/><circle class="cl-w" cx="64" cy="117" r="2"/><circle class="cl-w" cx="84" cy="112" r="2"/><circle class="cl-w" cx="74" cy="116" r="1.8"/>
    </g>
    <g class="cl-sparks">
      <g transform="translate(36 86)"><path class="spk" d="${SPARK}"/></g>
      <g transform="translate(126 82)"><path class="spk spk--2" d="${SPARK}"/></g>
      <g transform="translate(118 108) scale(.6)"><path class="spk spk--3" d="${SPARK}"/></g>
      <g transform="translate(44 108) scale(.55)"><path class="spk spk--2" d="${SPARK}"/></g>
    </g>
    <g class="cl-lid">
      <path d="M28 121C28 89 52 66 80 66S132 89 132 121Z" fill="url(#${id})"/>
      <rect class="cl-rim" x="22" y="118" width="116" height="7" rx="3.5"/>
      <rect class="cl-rim" x="76" y="58" width="8" height="10" rx="2"/>
      <circle class="cl-knob" cx="80" cy="57" r="7"/>
      <path class="cl-glint" d="M46 106c2-13 11-23 23-28"/>
    </g>`,

  done: () => `
    <g class="dn-rays">${rays(80, 80)}</g>
    <circle class="dn-c" cx="80" cy="80" r="42"/>
    <path class="dn-k" d="M61 81l13 13 26-28"/>
    <g transform="translate(122 52)"><path class="dn-h" d="${HEART}"/></g>
    <g transform="translate(38 60) scale(.75)"><path class="dn-h dn-h--2" d="${HEART}"/></g>
    <g transform="translate(118 112) scale(.6)"><path class="dn-h dn-h--3" d="${HEART}"/></g>`,

  cancel: () => `
    <circle class="cx-c" cx="80" cy="80" r="42"/>
    <path class="cx-x" d="M64 64l32 32"/>
    <path class="cx-x cx-x--2" d="M96 64l-32 32"/>`,
};

/** Inline SVG for one status scene. */
export function scene(kind) {
  const id = `scn${++uid}`;
  const k = SCENES[kind] ? kind : 'printer';
  return raw(`<svg class="scn scn--${k}" viewBox="0 0 160 160" aria-hidden="true" focusable="false">${SCENES[k](id)}</svg>`);
}
