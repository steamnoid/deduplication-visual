/* sim/timeline.js — pełen cykl życia w 30 dni.

   Oś czasu to nie wykres zmyślony. Dzień po dniu przepuszczamy realne
   bajty przez ten sam chunker i indeks, co w animacji, tylko bez
   malowania klatek:

     dzień 1..30
       1. backup bieżących wersji plików
       2. retencja: wygasają najstarsze backupy plików (rotacja per-plik)
       3. GC: gdy dziury przekroczą próg, żywe chunki jadą do nowych kontenerów

   Plik odtwarzamy tak samo jak w prawdziwym systemie: sklejamy bajty
   z kontenerów i porównujemy z oryginałem. Jeśli wychodzi różnica,
   restore jest zepsuty i widać to w licznikach. */
(function (NS) {
  'use strict';

  const sim = NS.sim;

  /* Rotacja retencji: kolejka kopii w kolejności powstania.
     Każdy wpis to jeden backup jednego pliku w jednym dniu. */
  /* Retencja w modelu rotacji per-plik (jak w R1/Retrospect):
     każdy plik trwa kopie, a codziennie wygasamy najstarszą kopię
     kilku plików, przechodząc po kolei po liście. Dzięki temu dziury
     powstają stopniowo, a nie jednym klifem co tydzień. */
  function newRetention(keep) { return { keep, copies: new Map(), order: [], backlog: 0 }; }
  function retentionNote(r, day, fi) {
    let a = r.copies.get(fi);
    if (!a) { a = []; r.copies.set(fi, a); r.order.push(fi); }
    a.push(day);
  }
  function retentionDue(r, day, maxPerDay) {
    const out = [];
    for (const fi of r.order) {
      const a = r.copies.get(fi);
      if (!a) continue;
      while (a.length && day - a[0] > r.keep) out.push({ fi, day: a.shift() });
    }
    out.sort((a, b) => a.day - b.day);
    const take = out.splice(0, maxPerDay);
    r.backlog = out.length;
    return take;
  }

  /* Jeden przebieg 30 dni. Zwraca serię dzienną plus podsumowanie,
     a Run zostaje w stanie końcowym, żeby dało się zrobić restore. */
  function runBatch(cfg) {
    const days = Math.max(1, cfg.days || 30);
    const c = Object.assign({
      type: 'code', files: 40, fileKB: 48, redundancy: 0.55,
      versions: 2, retention: 7, gcThreshold: 0.25, churn: null,
      expiryPerDay: 1, birthsPerDay: 1, deathsPerDay: 1, fastCDC: true,
      indexKind: 'hash', segChunks: 16, containerKB: 256, seed: 12345,
      keepBytes: true, delta: false, deltaPick: 'index', deltaMin: 256, deltaTargets: 4,
      chainGuard: 'expand'
    }, cfg);
    // Oś czasu liczymy z chunkami ~1 KB. Animacja celowo używa 32 B,
    // żeby granice chunków były widoczne na ekranie, ale przy 32 B
    // delta nie ma o czym mówić — każdy chunk jest mniejszy niż narzut.
    c.bits = Math.max(10, c.bits || 5);

    const ds = sim.buildDataset({
      type: c.type, files: c.files, fileKB: c.fileKB,
      redundancy: c.redundancy, versions: c.versions, seed: c.seed,
      days: days
    });

    const run = new sim.Run(ds, {
      bits: c.bits, fastCDC: c.fastCDC, cdcMasks: c.cdcMasks, indexKind: c.indexKind,
      segChunks: c.segChunks, containerKB: c.containerKB, keepBytes: c.keepBytes,
      delta: c.delta, deltaPick: c.deltaPick, deltaMin: c.deltaMin, deltaTargets: c.deltaTargets,
      chainGuard: c.chainGuard
    });

    const rnd = (function (a) {
      return function () {
        a = (a + 0x9e3779b9) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
        t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
        return ((t ^= t >>> 15) >>> 0) / 4294967296;
      };
    })(c.seed ^ 0x1234abcd);

    const churn = (sim.TYPES[c.type] || sim.TYPES.code).churn;
    const ret = newRetention(c.retention);
    const series = [];
    const events = [];
    const live = ds.files.slice();

    // Zbiór ma stałą liczebność: pierwszego dnia wchodzą wszystkie pliki,
    // potem codziennie jeden znika z produkcji i jeden wchodzi „od nowa”
    // (z nową treścią, więc nie dziedziczy po nim historii). Dzięki
    // ciągłej rotacji retencja ma co wygaszać, a GC ma co sprzątać.
    const birthOrder = ds.files.map(f => f.i);
    for (let i = birthOrder.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = birthOrder[i]; birthOrder[i] = birthOrder[j]; birthOrder[j] = t;
    }
    let cursor = 0;
    let lastBroken = 0;
    const aliveCount = () => live.reduce((a, f) => a + (!f.dead && f.born !== undefined ? 1 : 0), 0);

    for (let d = 0; d < days; d++) {
      // 1) kto znika z produkcji. Nie schodzimy poniżej połowy
      // zbioru, bo wtedy retencja i GC nie miałyby już czego ruszać.
      const aliveList = live.filter(f => !f.dead && f.born !== undefined && f.born < d);
      for (let k = 0; k < c.deathsPerDay; k++) {
        if (aliveList.length - k - 1 < c.files * 0.5) break;
        const f = aliveList[Math.floor(rnd() * aliveList.length)];
        f.dead = true;
        events.push({ day: d, kind: 'death', text: f.name + ' znika z produkcji' });
      }

      // 2) kto wchodzi do produkcji na wolne miejsce, z nową treścią
      let bornToday = 0;
      if (d === 0) {
        for (const fi of birthOrder) { const f = ds.files[fi]; f.born = 0; f.dead = false; f.version = 0; }
      } else {
        for (let b = 0; b < c.birthsPerDay; b++) {
          if (aliveCount() >= c.files) break;
          let fi = -1;
          for (let k = 0; k < birthOrder.length; k++) {
            const j = (cursor + k) % birthOrder.length;
            const cand = ds.files[birthOrder[j]];
            if (cand.dead || cand.born === undefined) { fi = birthOrder[j]; cursor = (j + 1) % birthOrder.length; break; }
          }
          if (fi < 0) break;
          const f = ds.files[fi];
          ds.recycle(f, rnd);
          f.born = d;
          bornToday++;
          events.push({ day: d, kind: 'birth', text: f.name + ' wchodzi do produkcji' });
        }
      }

      // 3) stan plików na dziś: kto faktycznie się zmienił od wczoraj.
      // Zmiana to realne nowe bajty, więc chunking daje inne granice
      // i na dysku ląduje prawdziwa delta.
      let changed = 0;
      for (const f of live) {
        if (f.dead || f.born === undefined || d <= f.born) continue;
        const rate = c.churn != null ? c.churn : churn;
        if (rnd() < Math.max(rate, 0.05)) {
          f.version = ds.advance(f, rnd);
          changed++;
        }
      }

      const queue = live
        .filter(f => !f.dead && f.born !== undefined && f.born <= d)
        .map(f => ({ fi: f.i, v: f.version }));

      // 4) właściwy dzień: skan → chunki → indeks → kontenery.
      // Nagrywamy ślad, żeby dało się ten dzień odtworzyć klatka po klatce:
      // przy tysiącach chunków zostawiamy co n-ty, żeby śład równomiernie
      // pokrywał cały dzień i nie ważył pół gigabajta.
      const trace = [];
      let stride = 1, seen = 0;
      run.onChunk = e => {
        seen++;
        if (seen % stride === 0) trace.push(e);
        if (trace.length > 1400) {         // decymacja w locie
          let j = 0;
          for (let i = 0; i < trace.length; i += 2) trace[j++] = trace[i];
          trace.length = j;
          stride *= 2;
        }
      };
      const before = {
        logical: run.st.logical, written: run.st.written, chunks: run.st.chunks,
        dups: run.st.dups, unique: run.st.unique, falseNeg: run.st.falseNeg
      };
      run.day = d;
      run.fileQueue = queue;
      run.fileIdx = 0;
      run.done = false;
      run.chunker = null;
      let steps = 0;
      while (!run.done && steps++ < 400000) run.step(1 << 18);

      for (const e of queue) retentionNote(ret, d, e.fi);

      // 5) retencja: wygasają najstarsze kopie kolejnych plików
      const due = retentionDue(ret, d, 999);
      let freed = 0, droppedChunks = 0;
      for (const x of due) {
        const r = run.expireFiles(1, [x], x.day);
        freed += r.freed; droppedChunks += r.dropped;
      }
      if (due.length) {
        events.push({ day: d, kind: 'expire', text: 'wygasają ' + due.length + ' kopii, zwalnia się ' + fmtKB(freed) });
      if (changed) events.push({ day: d, kind: 'change', text: changed + ' plików zmienionych od wczoraj' });
      }

      // 6) retencja mogła zabić bajt docelowy delty — wtedy plik zostaje,
      // a odtworzyć się nie da. Liczymy to, zamiast udawać, że nic się nie stało.
      const brokenNow = run.checkChains();
      if (brokenNow > lastBroken) {
        events.push({ day: d, kind: 'chain',
          text: 'retencja zerwała ' + (brokenNow - lastBroken) + ' łańcuchów delta — te pliki nie odtworzą się' });
      }
      lastBroken = brokenNow;

      // 7) GC: dopiero gdy dziury naprawdę bolą
      let gcRec = null;
      const holesRatio = run.diskBytes ? run.holesBytes / run.diskBytes : 0;
      if (holesRatio > c.gcThreshold) {
        gcRec = run.gc(false);
        if (gcRec) events.push({ day: d, kind: 'gc', text: 'GC: ' + fmtKB(gcRec.written) + ' przepisanych, ' + gcRec.chunks + ' chunków' });
      }

      run.onChunk = null;
      const phases = [{ at: 0, kind: 'scan' }];
      for (const e of due) phases.push({ at: trace.length, kind: 'expire', bytes: 0 });
      if (gcRec) phases.push({ at: trace.length, kind: 'gc', bytes: gcRec.written });

      series.push({
        day: d + 1,
        trace, phases, stride,
        filesInDay: queue.map(e => e.fi),
        files: queue.length,
        logical: run.st.logical - before.logical,
        written: run.st.written - before.written,
        ratio: (run.st.written - before.written) > 0 ? (run.st.logical - before.logical) / (run.st.written - before.written) : 0,
        chunks: run.st.chunks - before.chunks,
        dups: run.st.dups - before.dups,
        unique: run.st.unique - before.unique,
        falseNeg: run.st.falseNeg - before.falseNeg,
        deltaBytes: run.st.deltaBytes - before.deltaBytes,
        deltaRaw: run.st.deltaRaw - before.deltaRaw,
        deltaChunks: run.st.deltaChunks - before.deltaChunks,
        expired: freed,
        expiredChunks: droppedChunks,
        gc: gcRec ? gcRec.written : 0,
        gcChunks: gcRec ? gcRec.chunks : 0,
        containersBefore: gcRec ? gcRec.before.containers : null,
        gcRuns: run.st.gcRuns,
        disk: run.diskBytes,
        used: run.usedBytes,
        holes: run.holesBytes,
        holesRatio,
        containers: run.containers.length,
        indexRam: run.indexBytes,
        indexEntries: run.indexEntries,
        cumulativeLogical: run.st.logical,
        cumulativeWritten: run.st.written + run.st.gcRewritten,
        missing: run.st.logical - run.st.written - run.st.gcRewritten
      });
    }

    // podsumowanie: ile naprawdę zapisaliśmy (backup + GC) na bajty wejściowe
    const logical = run.st.logical;
    const stored = run.st.written;
    const rewritten = run.st.gcRewritten;
    const summary = {
      days: days,
      backups: run.st.backups,
      logical,
      stored,
      rewritten,
      gcRuns: run.st.gcRuns,
      gcChunks: run.st.gcChunks,
      ratio: stored ? logical / stored : 0,
      // write amplification: ile bajtów trafiło na dysk na każdy bajt,
      // który faktycznie musiał być zapisany. GC pisze do dysku tak samo
      // jak backup, więc wchodzi do licznika — inaczej wyglądałoby,
      // że sprzątanie jest darmowe.
      wa: stored ? (stored + rewritten) / stored : 0,
      gcShare: (stored + rewritten) ? rewritten / (stored + rewritten) : 0,
      containers: run.containers.length,
      disk: run.diskBytes,
      holes: run.holesBytes,
      live: run.usedBytes,
      indexRam: run.indexBytes,
      indexEntries: run.indexEntries,
      falseNeg: run.st.falseNeg,
      deltaChunks: run.st.deltaChunks,
      deltaTries: run.st.deltaTries,
      deltaBytes: run.st.deltaBytes,
      deltaRaw: run.st.deltaRaw,
      deltaSaved: run.st.deltaRaw - run.st.deltaBytes,
      chainsBroken: run.st.chainsBroken,
      brokenNow: run.checkChains(),
      brokenFiles: run.brokenFiles(),
      chainRewrites: run.st.chainRewrites,
      chainBytes: run.st.chainBytes,
      chainMaxDepth: run.st.chainMaxDepth,
      chunkBytes: 1 << c.bits,
      expiredBytes: run.st.expiredBytes,
      expiredChunks: run.st.expiredChunks,
      expiredCopies: run.expiredKeys.size
    };

    return { ds, run, series, events, summary, retention: c.retention };
  }

  /* Próbki restore: kilka plików z różnych dni. Jeśli w systemie są
     zerwane łańcuchy, dokładamy z nich po cztery — inaczej tabela
     wyglądałaby na zdrową, choć część plików jest nie do odtworzenia. */
  function restoreSamples(result) {
    const run = result.run, ds = result.ds;
    const out = [];
    const last = result.series.length - 1;
    for (const b of run.brokenSamples(4)) {
      const f = ds.files[b.fi];
      if (!f) continue;
      const r = run.restore(b.day, b.fi);
      if (r) {
        r.file = f.name;
        r.why = b.bad + ' fragmentów bez celu';
        out.push(r);
      } else {
        // restore zwrócił null, bo fragment zniknął z dysku — to nie jest
        // brak próbki, tylko plik, którego już nie da się złożyć
        out.push({
          file: f.name, day: b.day, bytes: 0, chunks: 0, containers: 0, seeks: 0,
          verified: false, deltas: 0, broken: b.bad, risky: b.bad, dead: true,
          why: b.bad + ' fragmentów zniknęło z dysku'
        });
      }
    }
    for (let s = 0; s < 12; s++) {
      const day = Math.max(0, last - s * Math.max(1, Math.floor(last / 11)));
      const cands = ds.files.filter(f => !f.dead && f.born !== undefined && f.born <= day);
      if (!cands.length) continue;
      const f = cands[(s * 7) % cands.length];
      const r = run.restore(day, f.i);
      if (r) { r.file = f.name; r.type = f.type; out.push(r); }
    }
    return out;
  }

  function fmtKB(b) {
    if (b >= 1024 * 1024) return (b / 1048576).toFixed(1) + ' MB';
    if (b >= 1024) return (b / 1024).toFixed(0) + ' KB';
    return b + ' B';
  }

  NS.timeline = { runBatch, restoreSamples, fmtKB };
})(window.SIM = window.SIM || {});
