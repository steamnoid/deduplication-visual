/* tools/shots.mjs — zrzuty ekranu slajdów decku do szybkiego przeglądu.
   Użycie: node tools/shots.mjs [co] [ile]  →  np. node tools/shots.mjs 0 51  */

import { launch } from 'puppeteer-core';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '.shots');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const from = +(process.argv[2] || 0);
const to = +(process.argv[3] || 999);

mkdirSync(OUT, { recursive: true });

const b = await launch({
  executablePath: CHROME, headless: 'shell',
  args: ['--allow-file-access-from-files', '--hide-scrollbars', '--force-device-scale-factor=1']
});
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 810, deviceScaleFactor: 1 });
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto('file://' + join(ROOT, 'index.html'), { waitUntil: 'load' });
await new Promise(r => setTimeout(r, 900));

const n = await p.evaluate(() => DECK.slides.length);
for (let i = from; i < Math.min(n, to); i++) {
  await p.evaluate(i => window.DECK.goto(i), i);
  await new Promise(r => setTimeout(r, 450));
  await p.screenshot({ path: join(OUT, String(i).padStart(2, '0') + '.png') });
  process.stdout.write('.');
}
console.log('\n' + errs.length ? errs.slice(0, 5) : 'bez błędów');
await b.close();
