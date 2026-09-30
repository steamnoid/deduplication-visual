/* Narzędzie: ile duplikatów wykrywa chunking przy różnych konfiguracjach
   FastCDC. Artykuł (Xia i in., ATC 2016) twierdzi, że cut-point skipping
   kosztuje najwięcej ze wszystkich optymalizacji, a znormalizowane
   chunking ten koszt odzyskuje.

   Kluczowy jest przypadek z wstawionymi bajtami na początku pliku: wszystkie
   granice chunków przesuwają się wtedy o długość wstawki i system musi je
   z powrotem zsynchronizować. Bez przesunięcia test niczego nie mierzy —
   pokrycie wynosi 1,00 zawsze. */
global.window = {};
global.performance = { now: () => Date.now() };
require('../js/sim/delta.js');
require('../js/sim/indices.js');
require('../js/sim/engine.js');
global.SIM = window.SIM;
const sim = window.SIM.sim;

const LIB = 32 * 1024;      // wspólna biblioteka w puli, jak w buildDataset
const FILE = +(process.env.FILE_KB || 64) * 1024;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) & 255;
  };
}

/* Pula z biblioteką, plikiem i jego kopią przesuniętą o `insLen` bajtów. */
function makePair(seed, insLen) {
  const total = LIB + FILE + insLen + FILE;
  const pool = new Uint8Array(total);
  const r = rng(seed);
  for (let i = 0; i < total; i++) pool[i] = r();
  const a = { off: LIB, len: FILE };
  // kopia: najpierw wstawka, potem oryginał
  const b = { off: LIB + FILE, len: FILE + insLen };
  for (let i = 0; i < insLen; i++) pool[b.off + i] = r();
  pool.set(pool.subarray(a.off, a.off + FILE), b.off + insLen);
  // fragment „wspólnej biblioteki" w pliku, żeby było co deduplikować
  for (let i = 0; i < FILE * 0.5; i += 4096) {
    const len = Math.min(4096, FILE * 0.5 - i);
    pool.copyWithin(a.off + i, LIB + i, LIB + i + len);
    pool.copyWithin(b.off + insLen + i, LIB + i, LIB + i + len);
  }
  return { pool, a, b };
}

function cuts(pool, body, bits, nc, minDiv) {
  const ch = new sim.Chunker(pool, body.off, body.len, bits, true,
    nc ? sim.fastCDCMasks(bits) : null);
  if (minDiv) ch.minSize = Math.max(2, (1 << bits) / minDiv);
  while (!ch.finished) ch.step(1 << 20);
  const out = [];
  for (let i = 0; i < ch.lens.n; i++) {
    const at = ch.cuts.get(i), len = ch.lens.get(i);
    out.push(sim.fingerprint(pool, body.off + at, len) + ':' + len);
  }
  return out;
}

function pokrycie(a, b) {
  const zbior = new Set(a);
  let trafione = 0, wszystkie = 0;
  for (const k of b) {
    const dl = parseInt(k.slice(k.lastIndexOf(':') + 1), 10);
    wszystkie += dl;
    if (zbior.has(k)) trafione += dl;
  }
  return wszystkie ? trafione / wszystkie : 0;
}

function zmierz(bits, nc, minDiv, insLen, proby) {
  let suma = 0;
  for (let seed = 1; seed <= proby; seed++) {
    const { pool, a, b } = makePair(seed, insLen);
    suma += pokrycie(cuts(pool, a, bits, nc, minDiv), cuts(pool, b, bits, nc, minDiv));
  }
  return suma / proby;
}

const proby = 5;
console.log('Pokrycie kopii chunkami oryginału (1,00 = wszystkie bajty znalazły duplikat)');
console.log('Plik ' + (FILE / 1024) + ' KB, ' + proby + ' powtórzeń na konfigurację.\n');

for (const insLen of [0, 137, 1024, 4096]) {
  console.log('=== wstawka na początku kopii: ' +
    (insLen ? insLen + ' B — granice przesuwać się o ' + insLen + ' B' : '0 B (kontrola: 1,00)'));
  console.log('  średnia | bez NC  | NC       | NC+próg 1/4 | koszt progu');
  for (const bits of [10, 12, 13]) {
    const bezNC = zmierz(bits, false, null, insLen, proby);
    const nc = zmierz(bits, true, null, insLen, proby);
    const ncMin = zmierz(bits, true, 4, insLen, proby);
    const koszt = nc > 0 ? 100 * (1 - ncMin / nc) : 0;
      const naChunk = (FILE / (1 << bits)) | 0;
    const ostrz = naChunk < 50 ? '  ← za mało chunków, aby wyciągać wnioski' : '';
    console.log('  ' + String(1 << bits).padStart(6) + ' B | ' + bezNC.toFixed(3) +
      '    | ' + nc.toFixed(3) + '    | ' + ncMin.toFixed(3) +
      '     | ' + koszt.toFixed(1) + '%  (' + naChunk + ' chunków)' + ostrz);
  }
  console.log();
}
