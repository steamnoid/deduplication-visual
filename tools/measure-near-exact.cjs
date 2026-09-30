/* Narzędzie: near-exact, czyli obcięty odcisk w indeksie (rozdział 8).
   Pytanie, na które odpowiada: ile RAM oszczędza obcięcie odcisku i co
   się za tym płaci. Odpowiedź zależy od tego, czy przy trafieniu
   sprawdzamy pełny hash na dysku. */
global.window = {};
global.performance = { now: () => Date.now() };
require('../js/sim/delta.js');
require('../js/sim/indices.js');
require('../js/sim/engine.js');
global.SIM = window.SIM;
const sim = window.SIM.sim;

function miesiac(fpBits, fpVerify) {
  const ds = sim.buildDataset({
    type: 'code', files: 24, fileKB: 32, redundancy: 0.55,
    containerKB: 256, retention: 7, days: 30, seed: 12345
  });
  const run = new sim.Run(ds, {
    bits: 10, fastCDC: true, indexKind: 'hash', segChunks: 16,
    containerKB: 256, keepBytes: true, fpBits, fpVerify
  });
  for (let d = 0; d < 30; d++) {
    run.day = d; run.fileIdx = 0; run.done = false;
    run.fileQueue = ds.files
      .filter(f => !f.dead && f.born !== undefined && f.born <= d)
      .map(f => ({ fi: f.i, v: f.version || 0 }));
    while (!run.done) run.step(1 << 18);
  }
  let ok = 0, zle = 0;
  for (let d = 24; d < 30; d++) {
    for (let f = 0; f < 6; f++) {
      const r = run.restore(d, f);
      if (!r) continue;
      if (r.verified) ok++; else zle++;
    }
  }
  return {
    ram: run.indexBytes, fp: run.st.falsePos, neg: run.st.falseNeg,
    ratio: run.st.logical / run.st.written, ok, zle
  };
}

console.log('near-exact: obcięty odcisk w indeksie');
console.log('30 dni, 24 pliki × 32 KB, kod, pełna tablica hash, 36 prób restore\n');
console.log('bity | RAM indeksu | fałszywe trafienia | dedup ratio | restore');
for (const weryfikacja of [true, false]) {
  console.log(weryfikacja ? '— pełny hash sprawdzany przy trafieniu —' : '— ufamy samemu skrótowi —');
  for (const bits of [0, 32, 16, 12, 8, 4]) {
    const r = miesiac(bits, weryfikacja);
    console.log(String(bits || 64).padStart(4) + ' | ' + String(Math.round(r.ram)).padStart(10) + ' B | ' +
      String(r.fp).padStart(19) + ' | ' + r.ratio.toFixed(2).padStart(11) + ' | ' +
      (r.zle ? '✗ ' + r.zle + ' plików uszkodzonych' : '✓ wszystko bajt w bajt'));
  }
  console.log();
}
console.log('Wniosek: obcięcie odcisku samo w sobie nic nie kosztuje w ratio —');
console.log('pełny hash i tak trzeba mieć, żeby potwierdzić trafienie. Kosztem jest');
console.log('FAŁSZYWYCH trafień, a te widać dopiero przy restore: metryka dedup');
console.log('rośnie, a pliki przestają się odtwarzać.');
