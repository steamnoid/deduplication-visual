/* Narzędzie deweloperskie: sprawdza funkcje rysujące bez przeglądarki.
   Podajemy atrapę kontekstu 2D, która liczy operacje i zapamiętuje
   ostatnie wartości, po czym sprawdzamy, co rysunek faktycznie robi. */
global.window = {};
global.performance = { now: () => Date.now() };
require('../js/sim/delta.js');
require('../js/sim/indices.js');
require('../js/sim/engine.js');
require('../js/sim/view.js');
require('../js/sim/timeline.js');
global.SIM = window.SIM;

function stubCtx() {
  const st = { fillRect: 0, stroke: 0, fillText: 0, texts: [], rects: [], arcs: 0, width: 0, lineWidth: 0 };
  return {
    _st: st,
    set fillStyle(v) { st._fill = v; }, get fillStyle() { return st._fill; },
    set strokeStyle(v) { st._stroke = v; }, get strokeStyle() { return st._stroke; },
    set globalAlpha(v) { st._alpha = v; }, get globalAlpha() { return st._alpha; },
    set font(v) { st._font = v; }, get font() { return st._font; },
    set textAlign(v) { st._align = v; }, get textAlign() { return st._align; },
    set textBaseline(v) { st._base = v; }, get textBaseline() { return st._base; },
    set lineWidth(v) { st.width = v; }, get lineWidth() { return st.width; },
    fillRect(x, y, w, h) { st.fillRect++; if (st.rects.length < 6) st.rects.push([x, y, w, h]); },
    strokeRect() {}, clearRect() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() { st.arcs++; },
    arcTo() {}, rect() {}, clip() {}, save() {}, restore() {},
    fill() { st.fills = (st.fills || 0) + 1; }, stroke() { st.stroke++; }, setLineDash() {},
    fillText(s, x, y) { st.fillText++; st.texts.push(String(s)); },
    // przybliżona szerokość: dość, żeby tipy miały sensowny rozmiar
    measureText(s) { return String(s).length * 6.2; },
  };
}

const ctx = stubCtx();
const view = SIM.view;
let bledy = 0;
function sprawdz(nazwa, fn) {
  try { fn(); console.log('  ✓ ' + nazwa); }
  catch (e) { bledy++; console.log('  ✗ ' + nazwa + ' — ' + e.message); }
}

console.log('batch 30 dni z deltą:');
const r = SIM.timeline.runBatch({
  type: 'code', files: 24, fileKB: 32, redundancy: 0.55,
  containerKB: 256, retention: 7, days: 30, delta: true
});
console.log('  ' + r.series.length + ' dni, ślad dnia 1: ' + r.series[0].trace.length +
  ' zdarzeń, dnia 30: ' + r.series[29].trace.length);

console.log('drawTimeline:');
sprawdz('rysuje wykres bez błędu', () => {
  ctx._st.fills = 0;
  const L = view.drawTimeline(ctx, 900, 250, r, 29);
  if (!L || !L.bw || L.n !== 30) throw new Error('zły layout: ' + JSON.stringify(L));
  if (ctx._st.fills < 30) throw new Error('narysował tylko ' + ctx._st.fills + ' wypełnień, spodziewaliśmy się 30 słupków');
});
sprawdz('etykieta wybranego dnia zmienia się z dniem', () => {
  ctx._st.texts.length = 0;
  view.drawTimeline(ctx, 900, 250, r, 0);
  const a = ctx._st.texts.slice();
  ctx._st.texts.length = 0;
  view.drawTimeline(ctx, 900, 250, r, 29);
  const b = ctx._st.texts.slice();
  const la = a.find(t => t.indexOf('dzień') === 0);
  const lb = b.find(t => t.indexOf('dzień') === 0);
  if (!la || !lb) throw new Error('brak etykiety dnia');
  if (la === lb) throw new Error('etykieta nie zmieniła się: ' + la);
});

console.log('drawDay:');
const wyniki = [];
sprawdz('pusty ślad nie wywala', () => view.drawDay(ctx, 900, 200, { trace: [], phases: [] }, 1));
[0, 0.25, 0.5, 0.75, 1].forEach(t => {
  sprawdz('t=' + t, () => {
    const out = view.drawDay(ctx, 900, 200, r.series[29], t);
    if (!out) throw new Error('brak odczytu');
    if (out.logical < out.written) throw new Error('zapis większy niż wejście');
    if (out.pct < 0 || out.pct > 1) throw new Error('pct poza zakresem');
    wyniki.push(out);
  });
});
sprawdz('odczyt rośnie wraz z głową', () => {
  for (let i = 1; i < wyniki.length; i++) {
    if (wyniki[i].chunks < wyniki[i - 1].chunks) throw new Error('głowa się cofnęła');
    if (wyniki[i].logical < wyniki[i - 1].logical) throw new Error('bajty wejścia cofnęły się');
  }
});
sprawdz('dzień 1 ma więcej zapisu niż dzień 30', () => {
  const d1 = view.drawDay(ctx, 900, 200, r.series[0], 1);
  const d30 = view.drawDay(ctx, 900, 200, r.series[29], 1);
  if (!(d1.written > d30.written)) {
    throw new Error('dzień 1 zapisał ' + d1.written + ', dzień 30 ' + d30.written);
  }
  console.log('    dzień 1: ' + d1.written + ' B na dysk, ratio ' + d1.ratio.toFixed(2));
  console.log('    dzień 30: ' + d30.written + ' B na dysk, ratio ' + d30.ratio.toFixed(1));
});
sprawdz('zdarzenia systemowe są w śladzie', () => {
  const z = r.series.reduce((a, d) => a + (d.phases || []).filter(p => p.kind !== 'scan').length, 0);
  if (!z) throw new Error('brak oznaczeń GC/wygaśnięć');
  console.log('    oznaczeń zdarzeń systemowych w miesiącu: ' + z);
});

console.log('tipy:');
sprawdz('tip dnia pokazuje liczby i zdanie', () => {
  ctx._st.texts.length = 0;
  const L = view.drawTimeline(ctx, 900, 250, r, 29, 14);
  const t = ctx._st.texts.join(' | ');
  if (t.indexOf('dzień 15') < 0) throw new Error('brak dnia w tipie: ' + t.slice(0, 120));
  if (t.indexOf('Na dysk') < 0 && t.indexOf('zapis') < 0) throw new Error('brak opisu zapisu');
  void L;
});
sprawdz('każdy dzień ma opis w tipie', () => {
  // tip rysuje się dla dnia pod kursorem, więc hover musi różnić się od wybranego
  for (let i = 0; i < r.series.length; i++) {
    ctx._st.texts.length = 0;
    view.drawTimeline(ctx, 900, 250, r, (i + 1) % r.series.length, i);
    const t = ctx._st.texts.join(' | ');
    if (t.indexOf('kontenery') < 0) throw new Error('dzień ' + (i + 1) + ': brak opisu');
    if (t.indexOf('dzień ' + (i + 1)) < 0) throw new Error('dzień ' + (i + 1) + ': zły nagłówek tipu');
  }
});
sprawdz('tip znika, gdy dzień jest już wybrany', () => {
  ctx._st.texts.length = 0;
  view.drawTimeline(ctx, 900, 250, r, 12, 12);
  const t = ctx._st.texts.join(' | ');
  if (t.indexOf('kontenery') >= 0) throw new Error('tip rysuje się dwa razy dla tego samego dnia');
});
sprawdz('tip chunka pokazuje rodzaj i rozmiary', () => {
  const day = r.series[0];
  const iNowy = day.trace.findIndex(e => e.kind === 'new');
  const iDup = day.trace.findIndex(e => e.kind === 'dup');
  if (iNowy < 0 || iDup < 0) throw new Error('brak zdarzeń nowy/duplikat');
  ctx._st.texts.length = 0;
  view.tipChunk(ctx, 900, 200, day, iNowy, 300);
  const t = ctx._st.texts.join(' | ');
  if (t.indexOf('nowy chunk') < 0) throw new Error('brak rodzaju: ' + t);
  if (t.indexOf('plik') < 0) throw new Error('brak pliku: ' + t);
  ctx._st.texts.length = 0;
  view.tipChunk(ctx, 900, 200, day, iDup, 300);
  const t2 = ctx._st.texts.join(' | ');
  if (t2.indexOf('na dysk 0 B') < 0) throw new Error('duplikat powinien mieć zero zapisu: ' + t2);
});
sprawdz('tip poza zakresem nic nie rysuje', () => {
  ctx._st.texts.length = 0;
  view.tipChunk(ctx, 900, 200, r.series[0], 99999, 300);
  if (ctx._st.texts.length) throw new Error('narysował tip dla nieistniejącego zdarzenia');
});
sprawdz('pozycja tipu mieści się w szerokości', () => {
  ctx._st.rects.length = 0;
  ctx._st.fills = 0;
  view.tipChunk(ctx, 300, 200, r.series[0], 0, 5);
  const bad = ctx._st.rects.some(x => x[0] < 0 || x[0] + x[2] > 300);
  if (bad) throw new Error('tip wychodzi poza kanwę: ' + JSON.stringify(ctx._st.rects));
});

console.log('legenda i etykiety:');
sprawdz('legenda przebiegu dnia', () => {
  ctx._st.texts.length = 0;
  view.drawDay(ctx, 900, 200, r.series[0], 1);
  const t = ctx._st.texts.join(' | ');
  ['nowy chunk na dysk', 'duplikat pominięty', 'delta', 'bajty wchodzące', 'zapisane na dysk']
    .forEach(s => { if (t.indexOf(s) < 0) throw new Error('brak etykiety: ' + s); });
});
sprawdz('legenda wykresu 30 dni', () => {
  ctx._st.texts.length = 0;
  view.drawTimeline(ctx, 900, 250, r, 0, null);
  const t = ctx._st.texts.join(' | ');
  if (t.indexOf('zapisane bajty / dzień') < 0) throw new Error('brak legendy');
  if (t.indexOf('pierwszy pełny backup') < 0) throw new Error('brak opisu fioletowego słupka');
  if (t.indexOf('wygaśnięte kopie') < 0) throw new Error('brak opisu paska wygaśnięć');
});

console.log('szerokości (okno 1366×768 daje wąski panel):');
[320, 500, 700, 900, 1400].forEach(W => {
  sprawdz('wykres 30 dni przy ' + W + ' px', () => {
    const L = view.drawTimeline(ctx, W, 250, r, 10, 20);
    if (L.pw <= 0 || L.bw <= 0) throw new Error('zerowa szerokość: ' + JSON.stringify(L));
    if (L.px + L.pw > W) throw new Error('wykres wychodzi poza kanwę');
  });
  sprawdz('przebieg dnia przy ' + W + ' px', () => {
    const out = view.drawDay(ctx, W, 200, r.series[10], 0.5);
    if (!out) throw new Error('brak odczytu');
  });
  sprawdz('tip chunka przy ' + W + ' px', () => {
    ctx._st.rects.length = 0;
    view.tipChunk(ctx, W, 200, r.series[0], 3, W / 2);
    const bad = ctx._st.rects.some(x => x[0] < -0.5 || x[0] + x[2] > W + 0.5);
    if (bad) throw new Error('wychodzi poza kanwę: ' + JSON.stringify(ctx._st.rects));
  });
});
sprawdz('tip dnia mieści się w wąskim panelu', () => {
  for (const W of [320, 500, 700]) {
    ctx._st.rects.length = 0;
    view.drawTimeline(ctx, W, 250, r, 0, 15);
    const bad = ctx._st.rects.some(x => x[0] < -0.5 || x[0] + x[2] > W + 0.5);
    if (bad) throw new Error('W=' + W + ': ' + JSON.stringify(ctx._st.rects));
  }
});

console.log('\nid w app.js a w simulator.html:');
const fs = require('fs');
const app = fs.readFileSync(__dirname + '/../js/sim/app.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../simulator.html', 'utf8');
const uzyte = new Set();
for (const m of app.matchAll(/\$\('([^']+)'\)/g)) uzyte.add(m[1]);
for (const m of app.matchAll(/getElementById\('([^']+)'\)/g)) uzyte.add(m[1]);
// lista identyfikatorów podpinanych w init(): ['cfgType', 'cfgFiles', ...]
const m = app.match(/\[((?:\s*'[a-zA-Z][\w]*'\s*,?)+)\]\.forEach\(k => \{ el\[k\] = \$\(k\)/);
if (m) for (const id of m[1].matchAll(/'([^']+)'/g)) uzyte.add(id[1]);
else { bledy++; console.log('  ✗ nie znalazłem listy identyfikatorów w init()'); }
const wHtml = new Set();
for (const m of html.matchAll(/id="([^"]+)"/g)) wHtml.add(m[1]);
let brak = 0;
for (const id of [...uzyte].sort()) {
  // id tworzone dynamicznie w kodzie (np. tlCv) nie ma w HTML na starcie
  // id, które panel tworzy przy renderowaniu, nie ma w HTML na starcie
  const dynamiczne = /^(tlCv|dayCv|dayPos|dayPlay|dayRead|gcBtn)$/.test(id);
  if (!wHtml.has(id) && !dynamiczne) { brak++; console.log('  ✗ brak id: ' + id); }
}
if (!brak) console.log('  ✓ wszystkie ' + uzyte.size + ' identyfikatorów z app.js istnieje w simulator.html');
bledy += brak;

console.log('\nskrypty na stronie:');
for (const m of html.matchAll(/src="(js\/sim\/[^"]+)"/g)) {
  const plik = __dirname + '/../' + m[1];
  if (!fs.existsSync(plik)) { bledy++; console.log('  ✗ nie ma pliku: ' + m[1]); }
  else console.log('  ✓ ' + m[1]);
}

console.log(bledy ? '\nBŁĘDY: ' + bledy : '\nWszystko przeszło.');
process.exit(bledy ? 1 : 0);
