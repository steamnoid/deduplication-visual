/* sim/engine.js — model danych i obliczenia symulatora dedupu.
   Zasada: bajty są prawdziwe. Pula to jeden Uint8Array, pliki to widoki
   (offset, długość) w zakresie puli, więc redundancja jest realnym
   powtórzeniem bajtów, a chunking liczy prawdziwe granice. */

(function (NS) {

  /* ---------- tablice typowane zamiast obiektów ---------- */
  class IdList {
    constructor(cap, Type) { this.a = new Type(cap); this.n = 0; this.Type = Type; }
    push(v) {
      if (this.n === this.a.length) {
        const b = new this.Type(Math.ceil(this.a.length * 1.8) + 8);
        b.set(this.a); this.a = b;
      }
      this.a[this.n++] = v; return this.n - 1;
    }
    get(i) { return this.a[i]; }
    set(i, v) { this.a[i] = v; }
    clear() { this.n = 0; }
    get length() { return this.n; }
  }

  /* ---------- generator: pula bajtów + pliki ---------- */

  const ALPHA = 31;                 // alfanumeryczny „tekst binarny”

  function makePool(totalBytes, seed) {
    const a = new Uint8Array(totalBytes);
    let s = seed >>> 0;
    for (let i = 0; i < totalBytes; i++) {
      s = (Math.imul(s ^ (s >>> 15), 0x2545f491) + 0x9e3779b9) >>> 0;
      // mieszanka: duże bloki powtarzalne (jak biblioteki w obrazie VM) + szum
      a[i] = (s & 0x80) ? 32 + (s % ALPHA) : (s >>> 8) & 0xff;
    }
    return a;
  }

  /* Region wspólny: fragment puli, który wiele plików współdzieli.
     Dzięki niemu chunki naprawdę się powtarzają. */
  function stamp(pool, at, len, src) {
    if (src) pool.copyWithin(at, src, src + len);
    return at;
  }

  const TYPES = {
    vm: { name: 'obrazy VM', share: 0.82, noise: 0.05, mb: 3 },
    code: { name: 'kod źródłowy', share: 0.55, noise: 0.18, mb: 1.4 },
    logs: { name: 'logi', share: 0.30, noise: 0.35, mb: 2.2 },
    db: { name: 'zrzuty bazy', share: 0.70, noise: 0.08, mb: 1.8 }
  };

  /* Buduje zbiór plików o zadanej redundancji.
     redundancy: 0 = plik nigdy nie znacznie się nie powtarza,
                 1 = prawie identyczne kopie. */
  function buildDataset(cfg) {
    const T = TYPES[cfg.type] || TYPES.vm;
    const poolSize = cfg.files * cfg.fileKB * 1024;
    const pool = makePool(poolSize + 64 * 1024, cfg.seed || 12345);
    const files = [];
    let used = 0;

    // biblioteka wspólna — obszar puli, z którego pliki będą kopiować
    const libLen = Math.floor(poolSize * 0.5);
    stamp(pool, 0, libLen, 0);

    for (let i = 0; i < cfg.files; i++) {
      const len = Math.floor(cfg.fileKB * 1024);
      const off = used;
      used += len;
      const isCopy = i > 0 && (i / cfg.files) < cfg.redundancy;

      if (isCopy && i > 1) {
        // plik dziedziczy po poprzednim: kopia + mała zmiana
        const src = files[i - 1].off;
        const changeAt = off + Math.floor(len * (0.2 + 0.6 * ((i * 0.37) % 1)));
        const changeLen = Math.max(256, Math.floor(len * T.noise * 0.5));
        // kopiujemy wspólne części, resztę z własnej puli
        const segs = segmentsFor(len, T.share, i);
        segs.forEach(s => pool.copyWithin(off + s.at, src + s.at, src + s.at + s.len));
        // doklejki unikalne dla tego pliku
        pool[changeAt] = (pool[changeAt] + 91) & 0xff;
        pool[(changeAt + 17) % used] = (pool[(changeAt + 17) % used] + 7) & 0xff;
        void changeLen;
      } else if (i === 1) {
        // pierwsza kopia rodzaju
        const segs = segmentsFor(len, T.share, i);
        segs.forEach(s => pool.copyWithin(off + s.at, 0, s.len));
      }

      files.push({
        i,
        name: fileName(cfg.type, i),
        off, len,
        type: cfg.type,
        kind: isCopy ? 'copy' : 'base',
        v1: true
      });
    }
    return { pool, files, poolSize: used, type: T };
  }

  /* Podział pliku na segmenty: `share` długości pochodzi z bazy,
     reszta to materiał unikalny dla pliku. */
  function segmentsFor(len, share, i) {
    const segs = [];
    const shared = Math.floor(len * share);
    for (let at = 0; at < shared; at += 4096) segs.push({ at, len: Math.min(4096, shared - at) });
    void i;
    return segs;
  }

  function fileName(type, i) {
    const base = { vm: 'img', code: 'src', logs: 'app', db: 'dump' }[type] || 'file';
    return base + '-' + String(i + 1).padStart(3, '0') + '.' + { vm: 'vmdk', code: 'tar', logs: 'log', db: 'sql' }[type];
  }

  /* ---------- gear hash (tablica jak w rozdziale 3) ---------- */

  /* Generator 32-bitowych wartości (te same dolne bity co w tabeli Gear
     z rozdziału 3 — losowe, więc warunek (h & maska) == 0 spełnia się
     z prawdopodobieństwem 1/2ⁿ). */
  const GEAR = (function () {
    const t = new Int32Array(256);
    let s = 0x9e3779b9 >>> 0;
    for (let i = 0; i < 256; i++) {
      s = (Math.imul(s ^ (s >>> 16), 0x7feb352d) + 0x9e3779b9) >>> 0;
      s = (Math.imul(s ^ (s >>> 15), 0x846ca68b) ^ 0x9e3779b9) >>> 0;
      t[i] = s | 0;
    }
    return t;
  })();

  /* ---------- odcisk 64-bitowy (dwie równoległe ścieżki FNV) ---------- */

  function fingerprint(pool, off, len) {
    let h1 = 0x811c9dc5 | 0, h2 = 0x01000193 | 0;
    for (let i = 0; i < len; i++) {
      const b = pool[off + i];
      h1 = Math.imul(h1 ^ b, 0x01000193);
      h2 = Math.imul(h2 ^ b, 0x85ebca6b) ^ (h2 >>> 13);
    }
    return (h1 >>> 0) + ':' + (h2 >>> 0);
  }

  function fpInt(fp, buckets) {
    // kubełek do wizualizacji indeksu (liczymy z tekstu odcisku)
    const p = fp.indexOf(':');
    const v = (parseInt(fp.slice(0, p), 10) ^ (parseInt(fp.slice(p + 1), 10) >>> 3)) >>> 0;
    return v % (buckets || 1024);
  }

  /* ---------- chunker przyrostowy ---------- */

  class Chunker {
    constructor(pool, off, len, bits, fastCDC) {
      this.pool = pool; this.off = off; this.len = len;
      this.bits = bits; this.mask = (1 << bits) - 1;
      this.fastCDC = fastCDC;
      this.pos = 0;                 // bajty przetworzone
      this.chunkStart = 0;
      this.finished = false;
      this.maxSize = (1 << bits) * 8;
      this.h = 0;
      this.minSize = fastCDC ? Math.max(2, (1 << bits) >> 2) : 0;
      this.cuts = new IdList(1024, Float64Array);     // początki chunków
      this.lens = new IdList(1024, Int32Array);       // długości chunków
      this.fps = 0;
      this.bytesThisSecond = 0;
    }
    get chunkLen() { return this.pos - this.chunkStart; }

    /* przetwarza do `budget` bajtów, zwraca liczbę ukończonych chunków */
    step(budget) {
      const end = Math.min(this.len, this.pos + budget);
      const t0 = performance.now();
      let made = 0;
      for (let i = this.pos; i < end; i++) {
        this.h = ((this.h << 1) + GEAR[this.pool[this.off + i] & 0xff]) | 0;
        const size = i - this.chunkStart + 1;
        let cut = false;
        if (size >= this.minSize && (this.h & this.mask) === 0) cut = true;
        if (this.fastCDC && size === this.maxSize) cut = true;
        if (cut) {
          this.cuts.push(this.chunkStart);
          this.lens.push(i + 1 - this.chunkStart);
          this.chunkStart = i + 1;
          made++;
        }
      }
      const done = end - this.pos;
      this.pos = end;
      const dt = Math.max(1, performance.now() - t0);
      this.fps = this.fps * 0.9 + (done / dt * 1000) * 0.1;
      if (this.pos >= this.len) {
        if (this.chunkStart < this.len) {
          this.cuts.push(this.chunkStart);
          this.lens.push(this.len - this.chunkStart);
          made++;
        }
        this.finished = true;
      }
      return made;
    }
  }

  /* ---------- indeks + statystyki ---------- */

  class Run {
    constructor(ds, cfg) {
      this.ds = ds; this.cfg = cfg;
      this.index = new Map();          // fingerprint -> {chunkId, refs}
      this.BUCKETS = 1024;
      this.bucketCounts = new Uint32Array(this.BUCKETS);
      this.isNew = new Uint8Array(1);   // 1 = chunk unikalny (zapisany)
      this.chunkId = 0;
      this.st = {
        logical: 0, written: 0, chunks: 0, unique: 0, dups: 0,
        bytesScanned: 0, ms: 0, peakIndex: 0, bucketHits: 0
      };
      this.fileQueue = ds.files.map(f => f.i);
      this.fileIdx = 0;
      this.chunker = null;
      this.curFile = null;
      this.lastChunks = [];            // ostatnie chunki do pokazania
      this.history = { logical: [], ratio: [], ram: [], written: [], avg: [] };
    }

    get currentFile() { return this.curFile; }
    get busy() { return this.chunker && !this.chunker.finished; }

    startFile() {
      if (this.fileIdx >= this.fileQueue.length) return false;
      const f = this.ds.files[this.fileQueue[this.fileIdx++]];
      this.curFile = f;
      this.chunker = new Chunker(this.ds.pool, f.off, f.len, this.cfg.bits, this.cfg.fastCDC);
      this.fileChunkMarks = [];        // status chunków bieżącego pliku
      return true;
    }

    step(budget) {
      if (!this.chunker) { if (!this.startFile()) return null; }
      const t0 = performance.now();
      const ch = this.chunker;
      const posBefore = ch.pos;
      const made = ch.step(budget);
      const ds = this.ds, st = this.st;

      // zliczamy chunki zamykane w tym kroku
      for (let k = ch.lens.n - made; k < ch.lens.n; k++) {
        const cs = ch.cuts.get(k);
        const len = ch.lens.get(k);
        const abs = ch.off + cs;
        const f = fingerprint(ds.pool, abs, len);
        let e = this.index.get(f);
        if (e === undefined) {
          e = { id: this.chunkId, refs: 1, size: len, bucket: fpInt(f, this.BUCKETS) };
          this.index.set(f, e);
          if (this.isNew.length <= e.id) {
            const b = new Uint8Array(Math.ceil((e.id + 1) * 1.6) + 16);
            b.set(this.isNew); this.isNew = b;
          }
          this.isNew[e.id] = 1;
          if (this.bucketCounts[e.bucket] > 0) this.st.bucketHits++;
          this.bucketCounts[e.bucket]++;
          this.chunkId++;
          st.unique++;
          st.written += len;
        } else {
          e.refs++;
          st.dups++;
        }
        st.chunks++;
        st.logical += len;
        this.fileChunkMarks.push(e.id);
        if (!this.tail) this.tail = [];
        this.tail.push(e.id);
        if (this.tail.length > 600) this.tail.splice(0, this.tail.length - 600);
      }
      st.bytesScanned += ch.pos - posBefore;
      st.ms += performance.now() - t0;
      st.peakIndex = Math.max(st.peakIndex, this.index.size);

      if (ch.finished) {
        this.sample();
        if (!this.startFile()) this.done = true;
      }
      return made;
    }

    sample() {
      const h = this.history;
      const st = this.st;
      h.logical.push(st.logical);
      h.written.push(st.written);
      h.ratio.push(st.written ? st.logical / st.written : 0);
      h.ram.push(this.index.size);
      h.avg.push(st.chunks ? st.logical / st.chunks : 0);
      if (h.ratio.length > 600) {
        ['logical', 'written', 'ratio', 'ram', 'avg'].forEach(k => h[k].shift());
      }
    }

    get progress() {
      const total = this.ds.files.length;
      let done = 0, bytes = 0;
      for (let i = 0; i < this.fileIdx - 1; i++) { done++; bytes += this.ds.files[this.fileQueue[i]].len; }
      if (this.curFile) bytes += this.chunker ? this.chunker.pos : 0;
      return { files: done, filesTotal: total, bytes, bytesTotal: this.ds.poolSize };
    }
  }

  /* ---------- eksport ---------- */
  NS.sim = {
    IdList, TYPES, GEAR, fingerprint, fpInt, Chunker, Run,
    buildDataset, makePool, fileName
  };

})(window.SIM = window.SIM || {});
