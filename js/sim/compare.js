/* sim/compare.js — headless porównanie konfiguracji na tym samym zbiorze.
   Chunking liczymy RAZ, potem przepuszczamy te same granice przez różne
   strategie indeksu — dzięki temu porównujemy indeks, a nie chunker. */

(function (NS) {

  /* 1) chunkujemy cały zbiór raz i zwracamy listę (plik, offset, długość) */
  function chunkAll(ds, bits) {
    const out = [];
    for (const f of ds.files) {
      const ch = new SIM.sim.Chunker(ds.pool, f.off, f.len, bits, true);
      while (!ch.finished) ch.step(1 << 20);
      for (let k = 0; k < ch.lens.n; k++) {
        out.push(f.i, ch.off + ch.cuts.get(k), ch.lens.get(k));
      }
    }
    return { flat: Float64Array.from(out), n: out.length / 3 };
  }

  /* 2) przepuszczamy granice przez strategię indeksu i liczymy metryki */
  function simulate(cfg, chunked) {
    const idx = SIM.indices.makeIndex(cfg.indexKind || 'hash', cfg.segChunks);
    const data = new Set();               // fp istniejący na dysku
    let dup = 0, fresh = 0, falseNeg = 0, written = 0, logical = 0;
    let containerKB = cfg.containerKB || 32;
    const cap = containerKB * 1024;
    let contUsed = 0, containers = 0;

    const flat = chunked.flat;
    let curFile = -1;
    for (let i = 0; i < chunked.n; i++) {
      const fi = flat[i * 3], off = flat[i * 3 + 1], len = flat[i * 3 + 2];
      if (fi !== curFile) { idx.beginFile(fi); curFile = fi; }
      const fp = SIM.sim.fingerprint(SIM_POOL, off, len);
      const res = idx.lookup(fp);
      const onDisk = data.has(fp);
      logical += len;
      if (res.hit && onDisk) { dup++; }
      else {
        if (!res.hit && onDisk) falseNeg++;
        data.add(fp);
        fresh++;
        written += len;
        if (contUsed + len > cap) { containers++; contUsed = 0; }
        contUsed += len;
      }
    }
    if (contUsed > 0) containers++;
    const st = idx.st;
    return {
      label: SIM.INDEX_KINDS[cfg.indexKind || 'hash'],
      chunks: chunked.n,
      fresh, dup, falseNeg,
      ratio: written ? logical / written : 0,
      stored: written,
      logical,
      indexEntries: st.entries,
      indexRam: idx.ramBytes,
      ramReads: st.ram,
      diskReads: st.disk,
      seqReads: st.seq,
      reads: st.ram + st.disk + st.seq,
      containers,
      containerBytes: containers * cap
    };
  }

  /* pula jest współdzielona, żeby nie generować danych dwa razy */
  let SIM_POOL = null;
  function prepare(cfg) {
    const ds = SIM.sim.buildDataset(cfg);
    SIM_POOL = ds.pool;
    return { ds, chunked: chunkAll(ds, cfg.bits) };
  }

  NS.compare = { prepare, chunkAll, simulate };
})(window.SIM = window.SIM || {});
