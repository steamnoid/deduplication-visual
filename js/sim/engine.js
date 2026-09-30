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
    vm: { name: 'obrazy VM', share: 0.82, ext: 'vmdk', base: 'img', churn: 0.02 },
    code: { name: 'kod źródłowy', share: 0.55, ext: 'tar', base: 'src', churn: 0.10 },
    logs: { name: 'logi', share: 0.30, ext: 'log', base: 'app', churn: 0.35 },
    db: { name: 'zrzuty bazy', share: 0.70, ext: 'sql', base: 'dump', churn: 0.05 }
  };

  /* Buduje zbiór plików o zadanej redundancji i liczbie wersji.
     Wersja 0 to treść bazowa; każda następna to kopia poprzedniej
     z prawdziwymi zmianami bajtów, więc chunking na każdej wersji
     daje inne granice. */
  function buildDataset(cfg) {
    const T = TYPES[cfg.type] || TYPES.vm;
    const versions = Math.max(1, cfg.versions || 1);
    const fileLen = Math.floor(cfg.fileKB * 1024);
    const files = cfg.files;
    const bodyBytes = fileLen * versions * files;
    const libLen = Math.floor(bodyBytes * 0.4);
    // zapas na wersje tworzone w trakcie osi czasu
    const growBodies = cfg.growBodies != null ? cfg.growBodies : files * (cfg.days || 30);
    const pool = makePool(bodyBytes + libLen + fileLen * growBodies + 65536, cfg.seed || 12345);
    stamp(pool, 0, libLen, 0);

    const out = [];
    let used = libLen;
    const rnd = mulberry((cfg.seed || 12345) ^ 0x5bf03635);

    for (let i = 0; i < files; i++) {
      const segs = segmentsFor(fileLen, T.share);
      const isCopy = i > 0 && (i / files) < cfg.redundancy;
      const srcBody = isCopy ? out[out.length - 1].bodies[0] : null;
      const bodies = [];

      for (let v = 0; v < versions; v++) {
        const off = used; used += fileLen;
        if (v === 0) {
          if (srcBody) {
            for (const sg of segs) pool.copyWithin(off + sg.at, srcBody.off + sg.at, srcBody.off + sg.at + sg.len);
          } else if (i === 1) {
            for (const sg of segs) pool.copyWithin(off + sg.at, 0, sg.len);
          }
        } else {
          // kopia poprzedniej wersji: większość bajtów zostaje, reszta to realne zmiany
          const prev = bodies[v - 1];
          pool.copyWithin(off, prev.off, prev.off + fileLen);
          const spots = 1 + Math.floor(rnd() * 3);
          for (let s = 0; s < spots; s++) {
            const at = Math.floor(rnd() * (fileLen - 512));
            const len = 128 + Math.floor(rnd() * 640);
            for (let k = 0; k < len; k++) {
              pool[off + at + k] = (pool[off + at + k] + 17 + k) & 0xff;
            }
          }
        }
        bodies.push({ off, len: fileLen });
      }

      out.push({
        i, name: fileName(cfg.type, i), type: cfg.type,
        len: fileLen, bodies, version: 0,
        off: bodies[0].off,
        kind: isCopy ? 'copy' : 'base',
        dead: false, born: 0
      });
    }
    const ds = { pool, files: out, poolSize: used, type: T, libEnd: libLen, fileLen, usedBytes: used };

    /* Nowa wersja pliku w trakcie osi czasu: kopia poprzedniej
       z prawdziwymi zmianami bajtów. Rozmiar zmiany wynika z typu
       pliku (VM ledwo żyje, logi zmieniają się całkowicie), więc
       delta na dysku jest taka, jakaby była naprawdę. */
    ds.advance = function (f, r) {
      if (used + fileLen > pool.length) return f.bodies.length - 1;
      const off = used; used += fileLen;
      const prev = f.bodies[f.bodies.length - 1];
      pool.copyWithin(off, prev.off, prev.off + fileLen);
      const span = Math.max(256, Math.floor(fileLen * T.churn * (0.5 + r())));
      const at = Math.floor(r() * Math.max(1, fileLen - span));
      for (let k = 0; k < span; k++) pool[off + at + k] = (pool[off + at + k] + 31 + k) & 0xff;
      f.bodies.push({ off, len: fileLen });
      ds.usedBytes = used;
      return f.bodies.length - 1;
    };
    /* Plik wchodzący do produkcji „od nowa": wspólne fragmenty
       z biblioteki, reszta to świeże bajty. Dzięki temu nowy plik
       nie dziedziczy po starym historii i nie deduplikuje się
       podejrzanie dobrze. */
    ds.recycle = function (f, r) {
      if (used + fileLen > pool.length) return false;
      const off = used; used += fileLen;
      const segs = segmentsFor(fileLen, T.share);
      for (const sg of segs) pool.copyWithin(off + sg.at, 0, sg.len);
      for (let k = 0; k < Math.floor(fileLen * 0.02); k++) {
        const at = Math.floor(r() * fileLen);
        pool[off + at] = (pool[off + at] + 7) & 0xff;
      }
      f.bodies = [{ off, len: fileLen }];
      f.version = 0;
      f.dead = false;
      ds.usedBytes = used;
      return true;
    };
    return ds;
  }

  function mulberry(a) {
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Podział pliku na segmenty: `share` długości pochodzi z bazy,
     reszta to materiał unikalny dla pliku. */
  function segmentsFor(len, share) {
    const segs = [];
    const shared = Math.floor(len * share);
    for (let at = 0; at < shared; at += 4096) segs.push({ at, len: Math.min(4096, shared - at) });
    return segs;
  }

  function fileName(type, i) {
    const T = TYPES[type] || TYPES.vm;
    return T.base + '-' + String(i + 1).padStart(3, '0') + '.' + T.ext;
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

  /* ---------- kontenery na dysku ---------- */

  class Container {
    constructor(cap) { this.cap = cap; this.used = 0; this.chunks = []; this.data = new Uint8Array(cap); }
    get free() { return this.cap - this.used; }
    get fill() { return this.used / this.cap; }
  }

  /* ---------- indeks + statystyki ---------- */

  class Run {
    constructor(ds, cfg) {
      this.ds = ds; this.cfg = cfg;
      this.BUCKETS = 1024;
      // prawda o tym, co jest na dysku: fp -> lista chunkId (może być >1 przy false negative)
      this.dataIndex = new Map();
      // strategia indeksowania (rozdział 4) — decyduje o koszcie odczytu
      this.makeIndex();
      this.bucketCounts = new Uint32Array(this.BUCKETS);
      this.isNew = new Uint8Array(1);   // 1 = chunk zapisany (unikalny)
      this.chunkRefs = new Int32Array(1);// żywe referencje do chunków
      this.byChunkId = [];               // chunkId -> {cont, off, len}
      this.contHoles = [];               // kontener -> bajty zwolnione
      this.marksByFile = new Map();      // fileId -> lista chunków tego pliku
      this.containers = [];
      this.containerSize = cfg.containerKB * 1024;
      this.chunkId = 0;
      this.fileQueue = ds.files.map(f => f.i);
      this.fileIdx = 0;
      this.day = 0;              // dzień osi czasu (oś 30 dni)
      this.gcLog = [];           // przebiegi kompaktacji
      this.bodyLog = new Map();  // (plik, dzień) -> bajty tej wersji
      this.expiredKeys = new Set(); // backupy już wygaszone
      this._storeBytes = cfg.keepBytes !== false;
      this.chunker = null;
      this.curFile = null;
      this.fileChunkMarks = [];
      this.tail = [];
      this.st = {
        logical: 0, written: 0, chunks: 0, unique: 0, dups: 0,
        bytesScanned: 0, ms: 0, peakIndex: 0, bucketHits: 0,
        expiredBytes: 0, expiredChunks: 0, expiredRefs: 0, gcRuns: 0, gcRewritten: 0,
        gcRead: 0, gcChunks: 0, backups: 0, falseNeg: 0, restoredFiles: 0, restoredBytes: 0
      };
      this.history = {
        logical: [], ratio: [], ram: [], written: [], avg: [],
        holes: [], containerFill: [], indexRam: []
      };
    }

    get currentFile() { return this.curFile; }
    get holesBytes() {
      let h = 0;
      for (let i = 0; i < this.contHoles.length; i++) h += this.contHoles[i];
      return h;
    }
    get usedBytes() {
      let u = 0;
      for (const c of this.containers) u += c.used;
      return u;
    }
    get diskBytes() { return this.containers.length * this.containerSize; }
    get indexEntries() { return this.idx ? this.idx.st.entries : 0; }
    get indexBytes() { return this.idx ? this.idx.ramBytes : 0; }
    get idxStats() { return this.idx ? this.idx.st : null; }

    makeIndex() {
      this.idx = NS.indices.makeIndex(this.cfg.indexKind || 'hash', this.cfg.segChunks);
    }

    /* Kolejka to lista wpisów {fi, v}: fi = indeks pliku, v = wersja.
       Zwykła liczba oznacza wersję 0, więc ścieżka bez osi czasu
       (S1/S2) działa jak dotąd. */
    markKey(fi, day) { return fi + '@' + (day == null ? this.day : day); }

    startFile() {
      if (this.fileIdx >= this.fileQueue.length) { this.done = true; return false; }
      const entry = this.fileQueue[this.fileIdx++];
      const fi = typeof entry === 'number' ? entry : entry.fi;
      const v = typeof entry === 'number' ? 0 : (entry.v || 0);
      const f = this.ds.files[fi];
      const body = f.bodies ? f.bodies[Math.min(v, f.bodies.length - 1)] : f;
      this.curFile = f;
      this.curVersion = v;
      this.chunker = new Chunker(this.ds.pool, body.off, body.len, this.cfg.bits, this.cfg.fastCDC);
      this.fileChunkMarks = [];
      this.bodyLog.set(this.markKey(f.i, this.day), body);
      this.st.backups++;
      if (this.idx) this.idx.beginFile(f.i);
      return true;
    }

    /* jeden krok symulacji: budget bajtów do przetworzenia */
    step(budget) {
      if (!this.chunker && !this.startFile()) return null;
      const t0 = performance.now();
      const ch = this.chunker;
      const posBefore = ch.pos;
      const made = ch.step(budget);
      const ds = this.ds, st = this.st;

      for (let k = ch.lens.n - made; k < ch.lens.n; k++) {
        const cs = ch.cuts.get(k);
        const len = ch.lens.get(k);
        const fp = fingerprint(ds.pool, ch.off + cs, len);
        const bucket = fpInt(fp, this.BUCKETS);

        // 1) strategia indeksu odpowiada, ile kosztuje sprawdzenie i czy w ogóle widzi duplikat
        const res = this.idx.lookup(fp);
        const known = this.dataIndex.get(fp);
        const onDisk = known && known.length > 0;

        let cid;
        if (res.hit && onDisk) {
          // duplikat: podbijamy referencję ostatniej kopii na dysku
          cid = known[known.length - 1];
          this._grow(this.chunkRefs, cid);
          this.chunkRefs[cid]++;
          st.dups++;
        } else {
          if (!res.hit && onDisk) st.falseNeg++;    // duplikat, którego indeks nie zobaczył
          const e = { id: this.chunkId++, refs: 1, size: len, bucket };
          cid = e.id;
          this._grow(this.isNew, e.id); this.isNew[e.id] = 1;
          this._grow(this.chunkRefs, e.id); this.chunkRefs[e.id] = 1;
          this._storeOff = ch.off + cs;
        if (this.bucketCounts[bucket] > 0) st.bucketHits++;
          this.bucketCounts[bucket]++;
          this.storeChunk(e, len);
          st.unique++;
          st.written += len;
          let arr = this.dataIndex.get(fp);
          if (!arr) { arr = []; this.dataIndex.set(fp, arr); }
          arr.push(e.id);
        }

        st.chunks++;
        st.logical += len;
        this.fileChunkMarks.push(cid);
        this.tail.push(cid);
        if (this.tail.length > 600) this.tail.splice(0, this.tail.length - 600);

        const mk = this.markKey(this.curFile.i, this.day);
        let m = this.marksByFile.get(mk);
        if (!m) { m = []; this.marksByFile.set(mk, m); }
        m.push(cid);
      }

      st.bytesScanned += ch.pos - posBefore;
      st.ms += performance.now() - t0;
      st.peakIndex = Math.max(st.peakIndex, this.indexEntries);

      if (ch.finished) {
        this.sample();
        if (!this.startFile()) this.done = true;
      }
      return made;
    }

    _grow(arr, id) {
      if (arr.length > id) return;
      const b = new arr.constructor(Math.ceil((id + 1) * 1.6) + 16);
      b.set(arr);
      if (arr === this.isNew || arr === this.chunkRefs) this[arr === this.isNew ? 'isNew' : 'chunkRefs'] = b;
      else this[arr === this.isNew ? 'isNew' : 'chunkRefs'] = b;
    }

    /* zapis nowego chunka do aktualnego kontenera */
    storeChunk(e, len) {
      let cont = this.containers[this.containers.length - 1];
      if (!cont || cont.free < len) {
        cont = new Container(this.containerSize);
        this.containers.push(cont);
        this.contHoles.push(0);
      }
      const off = cont.used;
      cont.used += len;
      cont.chunks.push(e.id);
      if (cont.data && this._storeBytes) {
        cont.data.set(this.ds.pool.subarray(this._storeOff, this._storeOff + len), off);
      }
      this.byChunkId[e.id] = { cont: this.containers.length - 1, off, len };
    }

    /* retencja: wygasamy najstarsze pliki → referencje spadają,
       chunki bez referencji zostawiają dziurę w kontenerze */
    expireFiles(count, queue, day) {
      const doneFiles = (queue || this.fileQueue).slice(0, count);
      const victims = doneFiles;
      let freed = 0, dropped = 0, chunks = 0;
      victims.forEach(entry => {
        const fi = typeof entry === 'number' ? entry : entry.fi;
        const f = this.ds.files[fi];
        const key = this.markKey(fi, day);
        if (this.expiredKeys.has(key)) return;   // ten backup już wygasł
        this.expiredKeys.add(key);
        const marks = this.marksByFile.get(key);
        if (marks) {
          for (let i = 0; i < marks.length; i++) {
            const cid = marks[i];
            if (this.chunkRefs[cid] == null) continue;
            this.chunkRefs[cid]--;
            chunks++;
            if (this.chunkRefs[cid] === 0) {
              const slot = this.byChunkId[cid];
              if (slot) {
                this.contHoles[slot.cont] += slot.len;
                freed += slot.len;
                dropped++;
              }
            }
          }
        }
        // plik ginie z listy tylko w trybie jednodniowym (S2);
        // na osi czasu plik żyje dalej, wygasa wyłącznie ten backup
        if (day == null) f.dead = true;
      });
      this.st.expiredBytes += freed;
      this.st.expiredChunks += dropped;
      this.st.expiredRefs += chunks;
      this.expireEvent = (this.expireEvent || 0) + 1;
      return { freed, dropped, files: victims.length };
    }

    /* Kompaktacja: żywe chunki przenosimy do nowych kontenerów, stare
       znikają razem z dziurami. To jedyne miejsce, gdzie dane faktycznie
       przepisujemy — stąd write amplification. Identyfikatory chunków
       zostają, więc pliki i ich oznaczenia dalej się zgadzają. */
    gc(force) {
      const disk = this.diskBytes;
      const holes = this.holesBytes;
      if (!force && (disk === 0 || holes / disk < 0.25)) return null;
      const t0 = performance.now();
      const newC = [], newHoles = [], newBy = new Array(this.byChunkId.length);
      let cur = null, ci = -1, read = 0, written = 0, moved = 0;

      for (let id = 0; id < this.byChunkId.length; id++) {
        if ((this.chunkRefs[id] | 0) <= 0) continue;
        const slot = this.byChunkId[id];
        if (!slot) continue;
        const src = this.containers[slot.cont];
        if (!cur || cur.free < slot.len) {
          cur = new Container(this.containerSize);
          ci = newC.length; newC.push(cur); newHoles.push(0);
        }
        const off = cur.used;
        cur.used += slot.len;
        cur.chunks.push(id);
        if (cur.data && src && src.data) cur.data.set(src.data.subarray(slot.off, slot.off + slot.len), off);
        newBy[id] = { cont: ci, off, len: slot.len };
        read += slot.len; written += slot.len; moved++;
      }

      const before = { containers: this.containers.length, bytes: disk, holes };
      this.containers = newC; this.contHoles = newHoles; this.byChunkId = newBy;
      this.st.gcRuns++;
      this.st.gcRewritten += written;
      this.st.gcRead += read;
      this.st.gcChunks += moved;
      const rec = { day: this.day, read, written, chunks: moved, before,
        after: { containers: this.containers.length, bytes: this.diskBytes, holes: this.holesBytes },
        ms: performance.now() - t0 };
      this.gcLog.push(rec);
      return rec;
    }

    /* Odtworzenie pliku z backupu dnia `day`. Sklejamy prawdziwe bajty
       z kontenerów i porównujemy z oryginałem — jeśli restore ma być
       wiarygodny, musi dać bajt w bajt, a nie tylko długość.
       Seek liczymy jako zmianę kontenera: plik czytamy w kolejności
       zapisu, więc w obrębie konteneru idziemy sekwencyjnie. */
    restore(day, fi) {
      const f = this.ds.files[fi];
      const marks = this.marksByFile.get(this.markKey(fi, day));
      if (!marks) return null;
      let total = 0;
      for (let i = 0; i < marks.length; i++) {
        const sl = this.byChunkId[marks[i]];
        if (!sl) return null;
        total += sl.len;
      }
      const out = new Uint8Array(total);
      const seen = new Set();
      let o = 0, seek = 0, last = -1;
      for (let i = 0; i < marks.length; i++) {
        const sl = this.byChunkId[marks[i]];
        if (sl.cont !== last) { seen.add(sl.cont); seek++; last = sl.cont; }
        const src = this.containers[sl.cont];
        if (src && src.data) out.set(src.data.subarray(sl.off, sl.off + sl.len), o);
        o += sl.len;
      }
      const body = this.bodyLog.get(this.markKey(fi, day)) || f;
      let same = true, firstDiff = -1;
      for (let i = 0; i < total; i++) {
        if (out[i] !== this.ds.pool[body.off + i]) { same = false; firstDiff = i; break; }
      }
      this.st.restoredFiles++;
      this.st.restoredBytes += total;
      return { file: f.name, day, bytes: total, chunks: marks.length,
        containers: seen.size, seeks: seek, verified: same, firstDiff };
    }

    sample() {
      const h = this.history, st = this.st;
      h.logical.push(st.logical);
      h.written.push(st.written);
      h.ratio.push(st.written ? st.logical / st.written : 0);
      h.ram.push(this.indexEntries);
      h.indexRam.push(this.indexBytes);
      h.falseNeg = st.falseNeg;
      h.avg.push(st.chunks ? st.logical / st.chunks : 0);
      h.holes.push(this.holesBytes);
      h.containerFill.push(this.containers.length
        ? this.containers.reduce((a, c) => a + c.fill, 0) / this.containers.length : 0);
      if (h.ratio.length > 600) {
        ['logical', 'written', 'ratio', 'ram', 'avg', 'holes', 'containerFill', 'indexRam']
          .forEach(k => h[k].shift());
      }
    }

    get progress() {
      let done = 0, bytes = 0;
      for (let i = 0; i < this.fileIdx - 1; i++) { done++; bytes += this.ds.files[this.fileQueue[i]].len; }
      if (this.curFile) bytes += this.chunker ? this.chunker.pos : 0;
      return { files: done, filesTotal: this.ds.files.length, bytes, bytesTotal: this.ds.poolSize };
    }
  }

  /* ---------- eksport ---------- */
  NS.sim = {
    IdList, TYPES, GEAR, fingerprint, fpInt, Chunker, Run, Container,
    buildDataset, makePool, fileName
  };

})(window.SIM = window.SIM || {});
