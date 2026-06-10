#!/usr/bin/env node
/**
 * Erzeugt die PWA-/Favicon-Icons in public/icons/.
 *
 *   npm run icons
 *
 * Quelle:
 *  - Liegt ein Marken-Logo unter public/logo.svg (oder .png), wird es als
 *    App-Icon vollflächig (randlos) verwendet. Transparente Bereiche/Ecken
 *    werden mit LOGO_BG gefüllt – damit nichts durchscheint (wichtig für iOS
 *    apple-touch und Android maskable). Plattformen runden die Ecken selbst.
 *  - Ohne Logo: sauberer „RS"-Textplatzhalter auf dem Akzent-Verlauf.
 *
 * Varianten:
 *  - „any"      → icon-192/512.png, apple-touch-icon.png, favicon-32.png
 *  - „maskable" → icon-192/512-maskable.png (das Logo-Motiv liegt in der
 *                 Safe-Zone, daher ist Vollflächigkeit hier unkritisch)
 */
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const PUBLIC = join(process.cwd(), 'public');
const ICONS_DIR = join(PUBLIC, 'icons');
mkdirSync(ICONS_DIR, { recursive: true });

// Hintergrundfarbe des Marken-Logos – füllt transparente Ecken / den Rand der
// Kachel. An die Hintergrundfarbe von public/logo.svg anpassen.
const LOGO_BG = '#1E4D8E';

// Fallback-Verlauf (nur ohne Logo): Akzentfarbe aus tailwind.config.ts.
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

/** Sucht das Marken-Logo (SVG bevorzugt). */
function findLogo() {
  const svg = join(PUBLIC, 'logo.svg');
  const png = join(PUBLIC, 'logo.png');
  return existsSync(svg) ? svg : existsSync(png) ? png : null;
}

/** Echtes Logo: vollflächig auf die Kachel skaliert; alles Transparente wird
 *  mit LOGO_BG hinterlegt (keine durchsichtigen Ecken). */
async function buildFromLogo(source, size, outName) {
  await sharp(source)
    .resize(size, size, { fit: 'contain', background: LOGO_BG })
    .flatten({ background: LOGO_BG })
    .png()
    .toFile(join(ICONS_DIR, outName));
  console.log('  ✓', outName);
}

/** Platzhalter: „RS"-Text zentriert auf dem Akzent-Verlauf. */
async function buildPlaceholder(size, outName, ratio) {
  const background = await sharp(Buffer.from(backgroundSvg(size))).png().toBuffer();
  const overlay = await sharp(Buffer.from(textSvg(size, ratio))).png().toBuffer();
  await sharp(background)
    .composite([{ input: overlay, gravity: 'center' }])
    .png()
    .toFile(join(ICONS_DIR, outName));
  console.log('  ✓', outName);
}

// [Dateiname, Kantenlänge, Motiv-Anteil an der Kachel (nur Platzhalter)]
const targets = [
  ['icon-192.png', 192, 0.8], // any
  ['icon-512.png', 512, 0.8], // any
  ['icon-192-maskable.png', 192, 0.6], // maskable: Safe-Zone
  ['icon-512-maskable.png', 512, 0.6], // maskable: Safe-Zone
  ['apple-touch-icon.png', 180, 0.78], // iOS rundet selbst
  ['favicon-32.png', 32, 0.72],
];

const logo = findLogo();
console.log(logo ? `Erzeuge Icons aus ${logo} …` : 'Kein Logo gefunden – Platzhalter „RS" …');
for (const [name, size, ratio] of targets) {
  if (logo) await buildFromLogo(logo, size, name);
  else await buildPlaceholder(size, name, ratio);
}
console.log('Fertig: public/icons/');
