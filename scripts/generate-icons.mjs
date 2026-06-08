#!/usr/bin/env node
/**
 * Erzeugt die PWA-/Favicon-Icons in public/icons/.
 *
 *   npm run icons
 *
 * Verhalten:
 *  - Liegt ein eigenes Logo unter public/logo.svg (oder .png), wird es zentriert
 *    auf den Marken-Verlauf (Akzentblau) gesetzt.
 *  - Sonst wird ein sauberer „RS"-Textplatzhalter gerendert.
 *
 * Es entstehen getrennte Varianten:
 *  - „any"      → Motiv füllt die Kachel (icon-192/512.png, Apple-Touch, Favicon)
 *  - „maskable" → Motiv in der Safe-Zone (~60 %), damit Android zu Kreis/Squircle
 *                 beschneiden kann, ohne das Logo anzuschneiden
 *                 (icon-192-maskable.png / icon-512-maskable.png)
 */
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const PUBLIC = join(process.cwd(), 'public');
const ICONS_DIR = join(PUBLIC, 'icons');
mkdirSync(ICONS_DIR, { recursive: true });

// Marken-Verlauf = Akzentfarbe aus tailwind.config.ts (accent → accent.strong).
const BG_TOP = '#3B82F6';
const BG_BOTTOM = '#2563EB';

function backgroundSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${BG_TOP}"/>
        <stop offset="1" stop-color="${BG_BOTTOM}"/>
      </linearGradient>
    </defs>
    <rect width="${size}" height="${size}" fill="url(#g)"/>
  </svg>`;
}

function textSvg(size, ratio) {
  const fontSize = Math.round(size * 0.5 * ratio);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
      font-family="Helvetica, Arial, sans-serif" font-weight="700"
      font-size="${fontSize}" fill="#FFFFFF">RS</text>
  </svg>`;
}

/** Liefert das zentrierte Motiv (echtes Logo oder Platzhalter) in der Zielgröße. */
async function overlayBuffer(size, ratio) {
  const logoSvg = join(PUBLIC, 'logo.svg');
  const logoPng = join(PUBLIC, 'logo.png');
  const source = existsSync(logoSvg) ? logoSvg : existsSync(logoPng) ? logoPng : null;
  if (source) {
    const inner = Math.round(size * ratio);
    return sharp(source)
      .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  }
  return sharp(Buffer.from(textSvg(size, ratio))).png().toBuffer();
}

async function buildIcon(size, outName, ratio) {
  const background = await sharp(Buffer.from(backgroundSvg(size))).png().toBuffer();
  const overlay = await overlayBuffer(size, ratio);
  await sharp(background)
    .composite([{ input: overlay, gravity: 'center' }])
    .png()
    .toFile(join(ICONS_DIR, outName));
  console.log('  ✓', outName);
}

// [Dateiname, Kantenlänge, Motiv-Anteil an der Kachel]
const targets = [
  ['icon-192.png', 192, 0.8], // any
  ['icon-512.png', 512, 0.8], // any
  ['icon-192-maskable.png', 192, 0.6], // maskable: Safe-Zone
  ['icon-512-maskable.png', 512, 0.6], // maskable: Safe-Zone
  ['apple-touch-icon.png', 180, 0.78], // iOS rundet selbst → etwas Rand
  ['favicon-32.png', 32, 0.72],
];

console.log('Erzeuge Icons …');
for (const [name, size, ratio] of targets) {
  await buildIcon(size, name, ratio);
}
console.log('Fertig: public/icons/');
