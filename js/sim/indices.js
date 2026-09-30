/* sim/indices.js — trzy strategie indeksowania z rozdziału 4.
   Wspólny interfejs:
     reset()
     beginFile(fileId, repFp)      — plik wchodzi do systemu
     lookup(fp)                   — {hit, kind, reads:{ram,disk,seq}}
     insert(fp, size)              — po udowodnionym trafieniu
     ramBytes                      — ile RAM zajmuje indeks
     st                            — liczniki
   Liczymy trzy rodzaje kosztu, bo to one rozróżniają strategie:
     ram  — losowy odczyt z pamięci (tani, ale zawsze)
     disk — losowy odczyt indeksu z dysku (drogi: osobny seek)
     seq  — odczyt sekwencyjny w obrębie jednego kontenera (najtańszy) */

(function (NS) {
  const ENTRY = 24;                 // 16 B odcisk + 8 B lokalizacja

  /* ---------- 1. pełna tablica hash (domyślna) ---------- */
  class HashTableIndex {
    constructor() { this.reset(); }
    reset() {
      this.map = new Map();
      this.st = { ram: 0, disk: 0, seq: 0, entries: 0, probes: 0, falseNeg: 0 };
    }
    beginFile() {}
    lookup(fp) {
      this.st.probes++;
      this.st.ram++;
      const e = this.map.get(fp);
      if (e !== undefined) { e.refs++; return { hit: true, kind: 'ram', e }; }
      const e2 = { id: this.map.size, refs: 1 };
      this.map.set(fp, e2);
      this.st.entries = this.map.size;
      return { hit: false, kind: 'ram', e: e2 };
    }
    get ramBytes() { return this.map.size * ENTRY; }
    label() { return 'pełna tablica hash'; }
    note() { return 'jeden wpis na chunk, jeden losowy odczyt RAM na chunk'; }
  }

  /* ---------- 2. Extreme Binning (podejście podobieństwowe) ---------- */
  /* W RAM jeden wpis na plik: minimalny fingerprint pliku. Trafienie w
     reprezentanta nie jest jeszcze trafieniem w duplikat — trzeba przeczytać
     indeks tego pliku z dysku (jeden seek + sekwencyjne wpisy). Pozostałe
     chunki pliku żyją wyłącznie na dysku: jeśli przyszły plik powtarza któryś
     z nich, a nie powtarza reprezentanta, duplik przepadnie. */
  class ExtremeBinningIndex {
    constructor() { this.reset(); }
    reset() {
      this.reps = new Map();          // repFp -> fileId
      this.fileIndex = new Map();     // fileId -> Set(fp)  (na dysku)
      this.curFile = -1;
      this.curEmpty = true;           // czy żaden chunk tego pliku jeszcze nie wszedł
      this.st = { ram: 0, disk: 0, seq: 0, entries: 0, probes: 0, falseNeg: 0, resolved: 0 };
    }
    beginFile(fileId) { this.curFile = fileId; this.curEmpty = true; this.linked = null; }
    lookup(fp) {
      this.st.probes++;
      this.st.ram++;
      // 1) plik już powiązany z podobnym → sprawdzamy jego wczytany indeks (w cache)
      if (this.linked) {
        const set = this.linked;
        if (set.has(fp)) return { hit: true, kind: 'linked', e: { id: 0, refs: 2 } };
        this._attach(this.curFile, fp);
        return { hit: false, kind: 'linked-new', e: { id: 0 } };
      }
      const owner = this.reps.get(fp);
      if (owner === undefined) {
        // brak reprezentanta: tej ścieżki nikt nie sprawdza
        this.st.falseNeg++;
        this._attach(this.curFile, fp);
        if (this.curEmpty) { this.reps.set(fp, this.curFile); this.curEmpty = false; this.st.entries = this.reps.size; }
        return { hit: false, kind: 'ram-new', e: { id: this.st.entries } };
      }
      // reprezentant wskazał plik podobny → jeden seek i odczyt CAŁEGO jego indeksu
      this.st.disk++;
      this.st.resolved++;
      const set = this.fileIndex.get(owner);
      const setSize = set ? set.size : 0;
      this.st.seq += setSize;
      this.linked = set || new Set();
      if (set && set.has(fp)) return { hit: true, kind: 'disk', e: { id: 0, refs: 2 } };
      this._attach(this.curFile, fp);
      if (this.curEmpty) { this.reps.set(fp, this.curFile); this.curEmpty = false; this.st.entries = this.reps.size; }
      return { hit: false, kind: 'disk-new', e: { id: this.st.entries } };
    }
    _attach(fileId, fp) {
      let s = this.fileIndex.get(fileId);
      if (!s) { s = new Set(); this.fileIndex.set(fileId, s); }
      s.add(fp);
    }
    get ramBytes() { return this.reps.size * ENTRY; }
    label() { return 'Extreme Binning'; }
    note() { return 'jeden wpis na plik; podobny plik = jeden odczyt indeksu z dysku'; }
  }

  /* ---------- 3. SiLo: similarity + locality ---------- */
  /* Indeks RAM trzyma reprezentanta każdego SEGMENTU pliku (similarity →
     mało RAM). Trafienie wyznacza segment, który wczytujemy w całości
     (locality → jeden seek i seria sekwencyjnych odczytów zamiast wielu
     losowych). Ostatni segment trzymamy „w cache”, bo właśnie go czytaliśmy. */
  class SiLoIndex {
    constructor(segmentChunks) { this.segSize = Math.max(2, segmentChunks || 16); this.reset(); }
    setSegmentSize(n) { this.segSize = Math.max(2, n); }
    reset() {
      this.segments = new Map();      // repFp -> segment
      this.byFile = new Map();        // fileId -> segmenty
      this.st = { ram: 0, disk: 0, seq: 0, entries: 0, probes: 0, falseNeg: 0, prefetches: 0 };
      this.curFile = -1;
      this.cur = null;                // segment w budowie
      this.loaded = null;             // segment wczytany prefetchem (w cache)
    }
    beginFile(fileId) {
      this.curFile = fileId;
      const list = this.byFile.get(fileId);
      this.cur = list && list.length ? list[list.length - 1] : null;
      this.curFull = this.cur ? this.cur.chunks.length >= this.segSize : false;
      this.loaded = null;
    }
    lookup(fp) {
      this.st.probes++;
      this.st.ram++;
      // 1) ostatni segment tego samego pliku — zwykle jeszcze w cache
      if (this.cur && this.cur.chunks.indexOf(fp) >= 0) {
        return { hit: true, kind: 'seg-cached', e: { id: this.cur.id, refs: 2 } };
      }
      // 2) segment właśnie wczytany — jego wpisy są już w cache
      if (this.loaded && this.loaded.chunks.indexOf(fp) >= 0) {
        return { hit: true, kind: 'seg-cached', e: { id: this.loaded.id, refs: 2 } };
      }
      // 3) reprezentant innego segmentu → prefetch (1 seek + sekwencyjne odczyty)
      const seg = this.segments.get(fp);
      if (seg !== undefined) {
        this.st.disk++;
        this.st.seq += seg.chunks.length;
        this.st.prefetches++;
        this.loaded = seg;
        return { hit: true, kind: 'seg-fetch', e: { id: seg.id, refs: 2 } };
      }
      // 4) brak: fp należy do segmentu w budowie
      if (!this.cur || this.curFull) {
        const s = { id: this.st.entries++, file: this.curFile, chunks: [], cache: false };
        this.segments.set(fp, s);
        let list = this.byFile.get(this.curFile);
        if (!list) { list = []; this.byFile.set(this.curFile, list); }
        list.push(s);
        this.cur = s;
        this.curFull = s.chunks.length >= this.segSize;
      }
      this.cur.chunks.push(fp);
      this.curFull = this.cur.chunks.length >= this.segSize;
      return { hit: false, kind: 'ram-new', e: { id: this.cur.id } };
    }
    get ramBytes() { return this.segments.size * ENTRY; }
    label() { return 'SiLo (similarity + locality)'; }
    note() { return 'reprezentant na segment pliku; trafienie = prefetch całego segmentu'; }
  }

  function makeIndex(kind, segmentChunks) {
    if (kind === 'eb') return new ExtremeBinningIndex();
    if (kind === 'silo') return new SiLoIndex(segmentChunks);
    return new HashTableIndex();
  }

  const INDEX_KINDS = {
    hash: 'pełna tablica hash',
    eb: 'Extreme Binning',
    silo: 'SiLo'
  };

  NS.indices = { HashTableIndex, ExtremeBinningIndex, SiLoIndex, ENTRY, makeIndex, INDEX_KINDS };
  NS.makeIndex = makeIndex;
  NS.INDEX_KINDS = INDEX_KINDS;

})(window.SIM = window.SIM || {});
