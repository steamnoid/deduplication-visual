/* export-gifs.mjs — renderuje sceny z render.html przez headless Chrome
   i koduje je do animowanych GIF-ów (puppeteer-core + pngjs + gifenc).
   Uruchomienie:  npm run gifs            (wszystkie sceny)
                  npm run gifs -- --scene fastcdc-masks
                  node tools/export-gifs.mjs --list
                  node tools/export-gifs.mjs --poster-only            */

import { launch } from 'puppeteer-core';
import { PNG } from 'pngjs';
import gifenc from 'gifenc';
const { GIFEncoder, quantize, applyPalette } = gifenc;
import { writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'gifs');
const POSTERS = join(ROOT, 'posters');

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].find(existsSync);

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf('--' + k);
  return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : d;
};

const OPT = {
  scene: arg('scene', null),
  fps: +arg('fps', 20),
  colors: +arg('colors', 255),
  scale: +arg('scale', 1),
  posterOnly: !!arg('poster-only', false),
  list: !!arg('list', false),
  loopPad: +arg('pad', 0.12)      // dodatkowy czas „zatrzymania” na końcu pętli
};

if (!CHROME) {
  console.error('Nie znaleziono Chrome/Chromium.');
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ------------------------------------------------------------------ */

async function main() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(POSTERS, { recursive: true });

  const browser = await launch({
    executablePath: CHROME,
    headless: 'shell',
    args: ['--allow-file-access-from-files', '--force-device-scale-factor=1',
      '--hide-scrollbars', '--disable-lcd-text']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 1 });
  const url = 'file://' + join(ROOT, 'render.html');
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction('window.DECK && Object.keys(window.DECK.scenes).length > 0');

  const sceneIds = await page.evaluate(() => Object.keys(window.DECK.scenes));
  if (OPT.list) {
    console.log(sceneIds.length + ' scen:');
    sceneIds.forEach(id => console.log('  ' + id));
    await browser.close();
    return;
  }

  const todo = OPT.scene ? sceneIds.filter(s => s === OPT.scene || s.includes(OPT.scene)) : sceneIds;
  if (!todo.length) {
    console.error('Brak scen pasujących do: ' + OPT.scene);
    await browser.close();
    process.exit(1);
  }

  const report = [];
  for (const id of todo) {
    report.push(await exportScene(page, id));
  }
  await browser.close();

  console.log('\n── podsumowanie ──');
  let total = 0;
  report.forEach(r => {
    total += r.size;
    console.log(
      r.scene.padEnd(24) +
      String(r.frames).padStart(4) + ' kl.  ' +
      (r.size / 1024).toFixed(0).padStart(6) + ' kB  ' +
      (r.posted ? 'poster ✓' : '')
    );
  });
  console.log('RAZEM: ' + (total / 1024 / 1024).toFixed(2) + ' MB');
}

/* ------------------------------------------------------------------ */

async function exportScene(page, id) {
  const info = await page.evaluate((sid, k) => window.__setup(sid, k), id, OPT.scale);
  const dur = info.duration * (1 + OPT.loopPad);
  const n = Math.max(6, Math.round(dur * OPT.fps));

  // 1. klatki
  const shots = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) % 1;
    await page.evaluate(tt => window.__frame(tt, {}), t);
    const buf = await page.screenshot({
      clip: { x: 0, y: 0, width: info.w, height: info.h },
      captureBeyondViewport: false
    });
    shots.push(PNG.sync.read(Buffer.from(buf)).data);
  }
  await page.evaluate(tt => window.__frame(tt, {}), 0.92);
  const posterBuf = Buffer.from(await page.screenshot({
    clip: { x: 0, y: 0, width: info.w, height: info.h }
  }));
  writeFileSync(join(POSTERS, id + '.png'), posterBuf);

  if (OPT.posterOnly) return { scene: id, frames: n, size: 0, posted: true };

  // 2. jedna paleta globalna z próbką klatek (mniejszy GIF)
  const samples = [];
  const step = Math.max(1, Math.floor(n / 7));
  for (let i = 0; i < n; i += step) {
    const f = shots[i];
    for (let px = 0; px < f.length; px += 4 * 3) samples.push(f[px], f[px + 1], f[px + 2], 255);
  }
  let palette = quantize(new Uint8ClampedArray(samples), OPT.colors, { format: 'rgb565' });
  while (palette.length < 256) palette.push([0, 0, 0]);   // zarezerwowany indeks przezroczystości

  // 3. indeksowanie + kodowanie (z różnicowaniem klatek przez przezroczystość)
  //    identyczne sąsiednie klatki scala się w jedną (dłuższy delay)
  const delay = Math.round(1000 / OPT.fps);
  const TRANSPARENT = 255;
  const merged = [];
  shots.forEach(rgba => {
    const last = merged[merged.length - 1];
    if (last && sameFrame(last.rgba, rgba)) { last.count++; return; }
    merged.push({ rgba, count: 1 });
  });

  const gif = GIFEncoder();
  let prev = null;
  merged.forEach((fr, i) => {
    const idx = applyPalette(fr.rgba, palette);
    if (prev) {
      for (let px = 0; px < fr.rgba.length; px += 4) {
        if (fr.rgba[px] === prev[px] && fr.rgba[px + 1] === prev[px + 1] &&
            fr.rgba[px + 2] === prev[px + 2] && fr.rgba[px + 3] === prev[px + 3]) {
          idx[px >> 2] = TRANSPARENT;
        }
      }
    }
    gif.writeFrame(idx, info.w, info.h, {
      palette: i === 0 ? palette : undefined,
      delay: delay * fr.count,
      repeat: 0,
      transparent: i > 0,
      transparentIndex: TRANSPARENT,
      dispose: 1
    });
    prev = fr.rgba;
  });
  gif.finish();

  const out = Buffer.from(gif.bytes());
  writeFileSync(join(OUT, id + '.gif'), out);
  process.stdout.write('.');
  return { scene: id, frames: merged.length, size: out.length, posted: true };
}

function sameFrame(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) return false;
  }
  return true;
}

main().catch(e => { console.error(e); process.exit(1); });
