/* sim/app.js — okno, sterowanie i pętla symulacji */

(function (NS) {

  const state = {
    cfg: {
      type: 'vm', files: 40, fileKB: 48, redundancy: 0.55,
      bits: 5, fastCDC: true, speed: 1, containerKB: 32, retention: 6,
      indexKind: 'hash', segChunks: 16,
      delta: 'off', chainGuard: 'expand'
    },
    run: null, playing: true, dirty: true,
    tl: { res: null, sel: 0, layout: null, busy: false, t: 1, playing: false, raf: 0, hover: null, hoverDay: null }
  };

  const el = {};
  let ctx = null, cv = null;

  function $(id) { return document.getElementById(id); }

  function init() {
    cv = $('cv');
    ctx = cv.getContext('2d', { alpha: false });
    ['cfgType', 'cfgFiles', 'cfgRedund', 'cfgBits', 'cfgSpeed', 'cfgCont', 'cfgRet',
      'cfgIndex', 'cfgSeg', 'cmpBtn', 'cmpPanel', 'cmpBody', 'cmpClose',
      'tlBtn', 'tlPanel', 'tlBody', 'tlClose', 'cfgDelta', 'cfgChain', 'rowChain',
      'files', 'btnPlay', 'btnReset', 'btnExpire', 'stLogical', 'stWritten', 'stRatio',
      'stChunks', 'stUnique', 'stDups', 'stIdx', 'stCont', 'stHoles', 'stFps', 'poolInfo'
    ].forEach(k => { el[k] = $(k); });

    buildControls();
    rebuild();
    requestAnimationFrame(loop);
  }

  function buildControls() {
    el.cfgType.innerHTML = Object.entries(SIM.sim.TYPES)
      .map(([k, v]) => '<option value="' + k + '">' + v.name + '</option>').join('');
    el.cfgType.value = state.cfg.type;
    el.cfgType.addEventListener('change', e => { state.cfg.type = e.target.value; rebuild(); });

    bindRange('cfgFiles', 'files', v => state.cfg.files = v, () => { rebuild(); });
    bindRange('cfgRedund', 'redundancy', v => state.cfg.redundancy = v / 100, () => { rebuild(); });
    bindRange('cfgBits', 'bits', v => { state.cfg.bits = v; }, () => { restart(); });
    bindRange('cfgSpeed', 'speed', v => { state.cfg.speed = v; }, null);
    el.cfgIndex.innerHTML = Object.entries(SIM.INDEX_KINDS)
      .map(([k, v]) => '<option value="' + k + '">' + v + '</option>').join('');
    el.cfgIndex.value = state.cfg.indexKind;
    el.cfgIndex.addEventListener('change', e => {
      state.cfg.indexKind = e.target.value;
      syncSeg();
      rebuild();
    });
    bindRange('cfgSeg', 'segChunks', v => { state.cfg.segChunks = v; }, () => { rebuild(); });
    syncSeg();

    el.cmpBtn.addEventListener('click', openCompare);
    el.cfgDelta.addEventListener('change', e => { state.cfg.delta = e.target.value; syncDelta(); });
    el.cfgChain.addEventListener('change', e => { state.cfg.chainGuard = e.target.value; });
    el.cfgDelta.value = state.cfg.delta;
    el.cfgChain.value = state.cfg.chainGuard;
    syncDelta();
    el.tlBtn.addEventListener('click', openTimeline);
    el.tlClose.addEventListener('click', closeTimeline);
    el.cmpClose.addEventListener('click', closeCompare);
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      closeCompare(); closeTimeline();
    });

    bindRange('cfgCont', 'containerKB', v => { state.cfg.containerKB = v; }, () => { rebuild(); });
    bindRange('cfgRet', 'retention', v => { state.cfg.retention = v; }, null);

    el.btnExpire.addEventListener('click', () => {
      if (!state.run) return;
      const res = state.run.expireFiles(state.cfg.retention);
      state.lastExpire = res;
      updateStats();
    });

    el.btnPlay.addEventListener('click', () => {
      state.playing = !state.playing;
      el.btnPlay.textContent = state.playing ? '⏸ Pauza' : '▶ Graj';
    });
    el.btnReset.addEventListener('click', () => { rebuild(); state.playing = true; el.btnPlay.textContent = '⏸ Pauza'; });
  }

  function syncDelta() {
    el.rowChain.style.display = state.cfg.delta === 'off' ? 'none' : '';
  }

  function syncSeg() {
    const row = document.getElementById('rowSeg');
    if (row) row.style.display = state.cfg.indexKind === 'silo' ? '' : 'none';
  }

  function fmt(n) { return n.toLocaleString('pl-PL'); }
  function kb(n) { return (n / 1024).toFixed(1) + ' KB'; }

  function openCompare() {
    const cfg = state.cfg;
    const t0 = performance.now();
    const { chunked } = SIM.compare.prepare(cfg);
    const rows = ['hash', 'eb', 'silo'].map(k => {
      const r = SIM.compare.simulate({ ...cfg, indexKind: k }, chunked);
      r.kind = k;
      return r;
    });
    const ms = Math.round(performance.now() - t0);
    const cur = rows.find(r => r.kind === cfg.indexKind);

    const cell = (r, k) => {
      const val = r[k];
      const better = {
        indexRam: 'min', diskReads: 'min', falseNeg: 'min', ratio: 'max', reads: 'min'
      }[k];
      const best = better === 'min' ? Math.min.apply(null, rows.map(x => x[k]))
        : Math.max.apply(null, rows.map(x => x[k]));
      const isBest = val === best && rows.filter(x => x[k] === best).length === 1;
      const show = k === 'ratio' ? val.toFixed(2) + ' : 1' : fmt(Math.round(val));
      return '<td class="' + (isBest ? 'best' : '') + '">' + show + '</td>';
    };

    el.cmpBody.innerHTML =
      '<p class="lead">Ten sam zbiór i te same granice chunków — różni się tylko strategia indeksu. ' +
      'Policzone w ' + fmt(chunked.n) + ' krokach w ' + ms + ' ms.</p>' +
      '<table><thead><tr><th>strategia</th><th>indeks w RAM</th><th>seeki na dysk</th>' +
      '<th>odczyty sekwencyjne</th><th>pominięte duplikaty</th><th>dedup ratio</th></tr></thead><tbody>' +
      rows.map(r =>
        '<tr class="' + (r.kind === cfg.indexKind ? 'cur' : '') + '">' +
        '<th>' + r.label + (r.kind === cfg.indexKind ? ' <em>— teraz</em>' : '') + '</th>' +
        cell(r, 'indexRam') + cell(r, 'diskReads') + cell(r, 'seqReads') +
        cell(r, 'falseNeg') + cell(r, 'ratio') + '</tr>').join('') +
      '</tbody></table>' +
      '<p class="note">Komendy: ' + chunked.n + ' chunków w kolejności plików. ' +
      'Twój wybór: ' + SIM.indices.makeIndex(cfg.indexKind, cfg.segChunks).note() + '. ' +
      'Wariant zaznaczony <em class="best">zielonym</em> jest najlepszy w danej kolumnie.</p>' +
      '<p class="note">Zaproponowany scenariusz: <b>pełna tablica hash</b> daje najlepsze ratio i zero ' +
      'seeków, ale indeks rośnie z liczbą chunków. <b>Extreme Binning</b> trzyma w RAMie wpis na plik, ' +
      'więc przy tysiącach plików indeks jest znikomy — kosztem jednego odczytu indeksu podobnego pliku. ' +
      '<b>SiLo</b> to kompromis: reprezentant na segment, cały segment wczytujesz jednym prefetchem.</p>';
    el.cmpPanel.hidden = false;
    void cur;
  }
  function closeCompare() { el.cmpPanel.hidden = true; }


  /* ---------- pełen cykl: 30 dni ---------- */

  /* Liczymy 30 dni tym samym chunkerem i indeksem co animacja, tylko
     bez malowania. Dlatego wynik na wykresie zgadza się z tym, co
     widać w symulatorze dzień po dniu. */
  function openTimeline() {
    el.tlPanel.hidden = false;
    if (state.tl.busy) return;
    state.tl.busy = true;
    el.tlBody.innerHTML = '<p class="lead">Liczę 30 dni: ' + state.cfg.files + ' plików × 30 dni, ' +
      'ten sam chunker i indeks co w animacji. Chwilka…</p>';
    requestAnimationFrame(() => setTimeout(() => {
      const c = state.cfg;
      const t0 = performance.now();
      const base = {
        type: c.type, files: c.files, fileKB: c.fileKB, redundancy: c.redundancy,
        fastCDC: c.fastCDC, indexKind: c.indexKind, segChunks: c.segChunks,
        containerKB: c.containerKB, retention: c.retention, days: 30
      };
      const res = SIM.timeline.runBatch(Object.assign({}, base, {
        delta: c.delta !== 'off', deltaPick: c.delta, chainGuard: c.chainGuard
      }));
      res.ms = performance.now() - t0;
      // dwa warianty do porównania: cel wybierany po pozycji i „ostatni
      // chunk”. To najlepsza ilustracja, że w delta liczy się wybór celu
      res.alts = null;
      if (c.delta !== 'off') {
        res.alts = [
          { label: 'bez delty', r: SIM.timeline.runBatch(base) },
          { label: 'delta, cel po pozycji', r: SIM.timeline.runBatch(Object.assign({}, base, { delta: true, deltaPick: 'index', chainGuard: c.chainGuard })) },
          { label: 'delta, cel: ostatnie chunki', r: SIM.timeline.runBatch(Object.assign({}, base, { delta: true, deltaPick: 'recent', chainGuard: c.chainGuard })) }
        ];
      }
      state.tl.res = res;
      state.tl.sel = res.series.length - 1;
      state.tl.busy = false;
      renderTimeline();
    }, 40));
  }

  function closeTimeline() { stopDay(); el.tlPanel.hidden = true; }

  function renderTimeline() {
    const res = state.tl.res;
    if (!res) return;
    const S = res.series, s = res.summary, d = S[state.tl.sel];
    const fmtB = SIM.view.fmtB;
    const events = res.events.filter(e => e.day === d.day - 1);
    const gcLog = res.run.gcLog;
    const restored = SIM.timeline.restoreSamples(res);
    const okAll = restored.every(r => r.verified);

    el.tlBody.innerHTML =
      '<p class="lead">Miesiąc pracy systemu na tych samych danych, które widzisz w symulatorze: ' +
      'codziennie backup wszystkich plików, pliki się zmieniają, najstarsze kopie wygasają po ' +
      s.days + ' dniach, a gdy dziury przekroczą 25% dysku, startuje GC. Policzone w ' +
      Math.round(res.ms) + ' ms.</p>' +
      '<div style="display:flex;gap:8px;align-items:center;margin:14px 0 2px">' +
      '<button class="btn" id="dayPlay">⏵ Odtwórz dzień</button>' +
      '<input type="range" id="dayPos" min="0" max="1000" value="1000" style="flex:1">' +
      '<span style="font-size:11px;color:var(--dim);min-width:96px" id="dayRead">100% dnia</span></div>' +
      '<canvas id="dayCv" style="width:100%;height:200px;display:block;margin:4px 0 2px"></canvas>' +
      '<canvas id="tlCv" style="width:100%;height:250px;display:block;margin:6px 0 4px"></canvas>' +
      '<p class="note" style="margin-top:0">Kliknij słupek, żeby wybrać dzień. Przebieg poniżej to ten sam ' +
      'chunker i ten sam indeks co w animacji — tylko z liczbami zamiast klatek.</p>' +

      '<h3 style="margin:18px 0 8px;font-size:13px">Dzień ' + d.day + '</h3>' +
      '<div class="stats" style="margin:0 0 6px">' +
      stat('plików w backupie', String(d.files)) +
      stat('zapisane na dysk', fmtB(d.written), 'var(--new)') +
      stat('delta do zapisania', fmtB(Math.max(0, d.logical - d.written)), 'var(--save)') +
      stat('dedup ratio dnia', d.ratio ? d.ratio.toFixed(1) + ' : 1' : '—', 'var(--save)') +
      stat('kontenery', String(d.containers)) +
      stat('dziury', Math.round(d.holesRatio * 100) + '%', 'var(--bad)') +
      stat('wygaśnięte kopie', fmtB(d.expired), 'var(--ref)') +
      stat('GC tego dnia', d.gc ? fmtB(d.gc) : '—', 'var(--bad)') +
      stat('indeks RAM', fmtB(d.indexRam), 'var(--violet)') +
      '</div>' +
      (events.length
        ? '<p class="note" style="margin:6px 0 0">W tym dniu: ' +
          events.map(e => e.text).join(' · ') + '.</p>'
        : '') +

      '<h3 style="margin:20px 0 8px;font-size:13px">Bilans miesiąca</h3>' +
      '<table><tbody>' +
      row('bajty wchodzące (suma 30 dni)', fmtB(s.logical), '') +
      row('zapisane przez backupy', fmtB(s.stored), 'var(--new)') +
      row('przepisane przez GC', fmtB(s.rewritten), 'var(--bad)') +
      row('oszczędność (wejście / zapis)', s.ratio.toFixed(1) + ' : 1', 'var(--save)') +
      row('write amplification (zapis / nowe bajty)', s.wa.toFixed(2) + '×', 'var(--bad)') +
      row('udział GC w zapisie', Math.round(s.gcShare * 100) + '%', 'var(--bad)') +
      row('przebiegi GC', String(s.gcRuns) + ' (' + s.gcChunks + ' chunków)', '') +
      row('kopie wygaszone', fmt(s.expiredCopies), '') +
      row('żywe bajty na dysku', (s.live / 1048576).toFixed(2) + ' MB z ' + (s.disk / 1048576).toFixed(2) + ' MB', '') +
      row('indeks w RAM na koniec', fmtB(s.indexRam) + ' (' + fmt(s.indexEntries) + ' wpisów)', 'var(--violet)') +
      '</tbody></table>' +
      '<p class="note">' + waExplain(s) + '</p>' +
      deltaSection(res, s) +

      (gcLog.length
        ? '<h3 style="margin:20px 0 8px;font-size:13px">Kiedy GC włączał się w miesiącu</h3>' +
          '<table><thead><tr><th>dzień</th><th>kontenery</th><th>przepisane</th><th>chunki</th><th>dziury przed</th><th>dziury po</th></tr></thead><tbody>' +
          gcLog.map(g => '<tr><th>dzień ' + (g.day + 1) + '</th><td>' + g.before.containers + ' → ' +
            g.after.containers + '</td><td>' + fmtB(g.written) + '</td><td>' + fmt(g.chunks) +
            '</td><td>' + Math.round(g.before.holes / Math.max(1, g.before.bytes) * 100) + '%</td><td>' +
            Math.round(g.after.holes / Math.max(1, g.after.bytes) * 100) + '%</td></tr>').join('') +
          '</tbody></table>' +
          '<p class="note">GC nie usuwa dziur, tylko przenosi żywe chunki do nowych kontenerów. ' +
          'Dlatego w miesiącu, w którym dużo się zmienia, na dysk trafia więcej bajtów niż w samych backupach — ' +
          'to jest write amplification i dlatego progi uruchamiania GC są tak ostrożne.</p>'
        : '<p class="note">GC nie ruszył: dziury nie przekroczyły 25% dysku. W tym miesiącu pliki prawie się nie zmieniały, ' +
          'więc retencja uwalniała głównie kopie bez wyłącznych chunków.</p>') +

      '<h3 style="margin:20px 0 8px;font-size:13px">Restore: odtworzone pliki</h3>' +
      '<p class="lead" style="margin:0 0 10px">Odtwarzamy pliki z różnych dni i <b>porównujemy bajty z oryginałem</b>. ' +
      'Jeśli restore ma być warty, musi dać bajt w bajt — nie „tyle samo długości”.</p>' +
      '<table><thead><tr><th>plik</th><th>dzień</th><th>rozmiar</th><th>chunki</th>' +
      '<th>kontenery</th><th>seeki</th><th>zgodność</th></tr></thead><tbody>' +
      restored.map(r => '<tr><th>' + r.file + '</th><td>' + (r.day + 1) + '</td><td>' + fmtB(r.bytes) +
        '</td><td>' + fmt(r.chunks) + '</td><td>' + r.containers + '</td><td>' + r.seeks + '</td>' +
        '<td class="' + (r.verified ? 'best' : '') + '">' + (r.verified ? '✓ bajt w bajt' : '✗ RÓŻNICA') +
        '</td></tr>').join('') +
      '</tbody></table>' +
      '<p class="note">' + (okAll
        ? 'Wszystkie próbki zgadzają się co do bajtu. Plik czytamy w kolejności zapisu chunków, więc w obrębie jednego kontenera idziemy sekwencyjnie — seek liczymy przy zmianie kontenera. Plik zmieniony w dniu ' +
          (d.day) + ' ma część chunków sprzed wielu dni i część nowych, więc przy odtwarzaniu skacze między starymi i nowymi kontenerami: stąd różnica między plikami w tabeli. Uwaga do skali: animacja używa chunków ' +
          (1 << state.cfg.bits) + ' B, żeby dało się je zobaczyć na ekranie, a liczba seeków rośnie odwrotnie do wielkości chunka — przy chunkach 8 KB byłaby kilkadziesiąt razy mniejsza. Dlatego tu liczy się różnica między plikami, nie bezwzględna wartość.'
        : 'Uwaga: część plików nie odtwarza się identycznie. To nie jest miły komunikat, ale właśnie po to restore sprawdzamy bajt po bajcie.') +
      '</p>';

    drawDayCanvas(res, state.tl.sel);

    const cv = $('tlCv');
    const W = cv.clientWidth || 1100;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = 250 * dpr;
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.tl.layout = SIM.view.drawTimeline(ctx, W, 250, res, state.tl.sel, state.tl.hover);

    const gcBtn = $('gcBtn');
    if (gcBtn) {
      gcBtn.addEventListener('click', () => {
        const g = res.run.gcAll();
        state.tl.gc = g;
        renderTimeline();
      });
    }
    if (state.tl.gc) {
      const g = state.tl.gc;
      const after = SIM.timeline.restoreSamples(res);
      const bad = after.filter(x => !x.verified).length;
      el.tlBody.insertAdjacentHTML('afterbegin',
        '<p class="note" style="margin:0 0 12px;padding:10px 12px;border:1px solid ' +
        (bad ? 'var(--bad)' : 'var(--line)') + ';border-radius:6px;color:' +
        (bad ? 'var(--bad)' : 'var(--save)') + '">Po wymuszonym sprzątaniu: zebrano ' +
        fmtB(g.bytes) + ' (' + fmt(g.collected) + ' chunków). Restore: ' +
        (after.length - bad) + '/' + after.length + ' plików zgodnych bajt w bajt' +
        (bad ? ', <b>' + bad + ' plików jest do odtworzenia z nieczytelnych fragmentów</b>' +
          (g.names && g.names.length ? ' (' + g.names.join(', ') + ')' : '') : '.') + '</p>');
    }

    cv.onclick = ev => {
      const r = cv.getBoundingClientRect();
      const x = ev.clientX - r.left;
      const L = state.tl.layout;
      if (!L) return;
      const i = Math.floor((x - L.px) / L.bw);
      if (i >= 0 && i < L.n) {
        state.tl.sel = i;
        state.tl.t = 1;
        state.tl.playing = false;
        stopDay();
        renderTimeline();
      }
    };

    cv.onmousemove = ev => {
      const r = cv.getBoundingClientRect();
      const L = state.tl.layout;
      if (!L) return;
      const i = Math.floor((ev.clientX - r.left - L.px) / L.bw);
      const idx = (i >= 0 && i < L.n) ? i : null;
      if (idx === state.tl.hover) return;
      state.tl.hover = idx;
      redrawTimeline();
    };
    cv.onmouseleave = () => { state.tl.hover = null; redrawTimeline(); };

    bindDayHover(res);

    const pos = $('dayPos');
    pos.value = Math.round(state.tl.t * 1000);
    pos.oninput = () => {
      state.tl.t = +pos.value / 1000;
      stopDay();
      drawDayCanvas(res, state.tl.sel);
    };
    $('dayPlay').onclick = () => {
      state.tl.playing = !state.tl.playing;
      $('dayPlay').textContent = state.tl.playing ? '⏸ Pauza' : '⏵ Odtwórz dzień';
      if (state.tl.playing) {
        if (state.tl.t >= 1) state.tl.t = 0;
        tickDay(res);
      } else stopDay();
    };
  }

  /* Delta na 30 dniach. Trzy liczby są tu najważniejsze: ile bajtów
     zastąpiła delta, ile kosztowało utrzymanie łańcuchów i ile plików
     przestało się odtwarzać. */
  function deltaSection(res, s) {
    if (!s.deltaChunks && !res.alts) return '';
    const out = [];
    out.push('<h3 style="margin:20px 0 8px;font-size:13px">Delta: różnica zamiast całości</h3>');
    out.push('<div class="stats" style="margin:0 0 6px">' +
      stat('prób delta', fmt(s.deltaTries)) +
      stat('zapisanych delt', fmt(s.deltaChunks), 'var(--violet)') +
      stat('bajty na deltach', SIM.view.fmtB(s.deltaBytes), 'var(--violet)') +
      stat('oszczędność', s.deltaRaw ? Math.round(100 * s.deltaSaved / s.deltaRaw) + '%' : '—', 'var(--save)') +
      stat('najdłuższy łańcuch', s.chainMaxDepth ? s.chainMaxDepth + ' delta' : 'brak') +
      stat('rozwiązane łańcuchy', fmt(s.chainRewrites) + (s.chainBytes ? ' (' + SIM.view.fmtB(s.chainBytes) + ')' : ''), 'var(--ref)') +
      stat('fragmenty bez celu', fmt(s.brokenNow), s.brokenNow ? 'var(--bad)' : '') +
      stat('pliki do odtworzenia', String(s.brokenFiles.files), s.brokenFiles.files ? 'var(--bad)' : 'var(--save)') +
      '</div>');

    if (res.alts) {
      out.push('<table style="margin-top:12px"><thead><tr><th>wariant</th><th>zapis na dysk</th>' +
        '<th>oszczędność</th><th>dedup ratio</th><th>write amplif.</th><th>pliki zepsute</th></tr></thead><tbody>' +
        res.alts.map(a => {
          const x = a.r.summary;
          return '<tr><th>' + a.label + '</th><td>' + SIM.view.fmtB(x.stored) + '</td><td>' +
            (x.stored ? Math.round(100 * (1 - x.stored / res.alts[0].r.summary.stored)) : 0) + '%</td><td>' +
            x.ratio.toFixed(1) + ' : 1</td><td>' + x.wa.toFixed(2) + '×</td><td>' +
            (x.brokenFiles.files ? '<span style="color:var(--bad)">' + x.brokenFiles.files + '</span>' : '0') +
            '</td></tr>';
        }).join('') + '</tbody></table>');
      out.push('<p class="note">Ten sam miesiąc, te same dane, różny wybór celu delty. ' +
        'Ostatnia kolumna to pliki, których nie da się odtworzyć, bo retencja ' +
        'zabiła bajt docelowy, którego nikt nie zabezpieczył.</p>');
    }

    out.push('<p class="note">Delta działa na chunkach ' +
      (s.chunkBytes >= 1024 ? (s.chunkBytes / 1024) + ' KB' : s.chunkBytes + ' B') +
      ', bo oś czasu liczymy w takiej skali — przy 32-bajtowych chunkach animacji ' +
      'każdy rekord delta byłby droższy niż surowe bajty. Wybór celu to ' +
      '<b>cel po pozycji</b> (ten sam kawałek pliku sprzed zmiany, tylko granice się ' +
      'przesunęły) albo prosto <b>ostatni zapisany chunk</b>. Różnica w zapisie jest ' +
      'kilkunastokrotna, bo zły cel oznacza kompresję bez pokrycia.</p>');

    out.push('<div style="margin:12px 0 4px;display:flex;gap:8px;align-items:center">' +
      '<button class="btn" id="gcBtn">🧹 Wymuś GC i sprawdź restore</button>' +
      '<span style="font-size:11px;color:var(--dim)">sprząta wszystko, co straciło ostatnią referencję — ' +
      'i pokaże, co przestanie się odtwarzać</span></div>');
    return out.join('');
  }


  /* Odtwarzanie wybranego dnia. Nie korzystamy z głównej pętli symulacji:
     batch liczył dzień już dawno temu, tutaj tylko przesuwamy głowę
     po zapisanym śladzie zdarzeń. */
  function drawDayCanvas(res, dayIdx) {
    const cv = $('dayCv');
    if (!cv) return;
    const W = cv.clientWidth || 900;
    const H = 200;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const day = res.series[dayIdx];
    const out = SIM.view.drawDay(ctx, W, H, day, state.tl.t);
    if (state.tl.hoverDay != null && out) {
      const n = day.trace.length;
      const x = 12 + (state.tl.hoverDay / n) * (W - 24);
      SIM.view.tipChunk(ctx, W, H, day, state.tl.hoverDay, x);
    }
    const el = $('dayRead');
    if (el && out) {
      el.textContent = Math.round(out.pct * 100) + '% · ' + out.ratio.toFixed(1) + ':1';
    }
  }

  function tickDay(res) {
    cancelAnimationFrame(state.tl.raf);
    const step = () => {
      if (!state.tl.playing) return;
      state.tl.t = Math.min(1, state.tl.t + 0.012);
      const pos = $('dayPos');
      if (pos) pos.value = Math.round(state.tl.t * 1000);
      drawDayCanvas(res, state.tl.sel);
      if (state.tl.t >= 1) {
        state.tl.playing = false;
        const b = $('dayPlay');
        if (b) b.textContent = '⏵ Odtwórz dzień';
        return;
      }
      state.tl.raf = requestAnimationFrame(step);
    };
    state.tl.raf = requestAnimationFrame(step);
  }

  /* Przerysowanie bez przebudowy HTML — hover nie może przerabiać panelu. */
  function redrawTimeline() {
    const res = state.tl.res;
    if (!res) return;
    const cv = $('tlCv');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.tl.layout = SIM.view.drawTimeline(ctx, cv.width / dpr, 250, res, state.tl.sel, state.tl.hover);
  }

  /* Kursor nad pasem zdarzeń: pokazujemy konkretny chunk, nie tylko dzień. */
  function bindDayHover(res) {
    const cv = $('dayCv');
    if (!cv) return;
    cv.onmousemove = ev => {
      const r = cv.getBoundingClientRect();
      const day = res.series[state.tl.sel];
      if (!day || !day.trace.length) return;
      const n = day.trace.length;
      const i = Math.floor((ev.clientX - r.left - 12) / ((cv.clientWidth - 24) / n));
      if (i < 0 || i >= n) { state.tl.hoverDay = null; drawDayCanvas(res, state.tl.sel); return; }
      state.tl.hoverDay = i;
      drawDayCanvas(res, state.tl.sel);
    };
    cv.onmouseleave = () => { state.tl.hoverDay = null; drawDayCanvas(res, state.tl.sel); };
  }

  function stopDay() {
    cancelAnimationFrame(state.tl.raf);
    state.tl.playing = false;
    const b = $('dayPlay');
    if (b) b.textContent = '⏵ Odtwórz dzień';
  }

  function stat(label, value, color) {
    return '<div class="stat"><div class="l">' + label + '</div><div class="v"' +
      (color ? ' style="color:' + color + ';font-size:14px"' : ' style="font-size:14px"') +
      '>' + value + '</div></div>';
  }
  function row(a, b, color) {
    return '<tr><th>' + a + '</th><td' + (color ? ' style="color:' + color + '"' : '') +
      '>' + b + '</td></tr>';
  }

  function waExplain(s) {
    if (s.rewritten === 0) {
      return 'GC jeszcze nic nie przepisał, więc write amplification wynosi 1,00× — na dysku leży ' +
        'dokładnie tyle, ile musiało być zapisane. Cała oszczędność (' + s.ratio.toFixed(1) +
        ' : 1) pochodzi z dedupu.';
    }
    return 'Backupy zapisały ' + SIM.view.fmtB(s.stored) + ' nowych bajtów, a GC przepisał jeszcze ' +
      SIM.view.fmtB(s.rewritten) + '. Na każdy bajt, który faktycznie musiał powstać na dysku, ' +
      'system zapisał ' + s.wa.toFixed(2) + ' bajtu. Im częściej pliki się zmieniają i im krótsza ' +
      'retencja, tym więcej wynosi ta liczba — dlatego progi uruchamiania GC są tak ostrożne, ' +
      'a retencja ma znaczenie dla wydajności, nie tylko dla miejsca na dysku.';
  }

  function bindRange(id, key, set, onChange) {
    const input = $(id), out = $(id + 'Val');
    const fmt = () => {
      out.textContent = key === 'redundancy' ? input.value + '%'
        : key === 'bits' ? input.value + ' bitów (' + (1 << input.value) + ' B)'
          : key === 'speed' ? input.value + '×'
            : input.value;
    };
    input.addEventListener('input', () => { set(+input.value); fmt(); if (onChange) onChange(); });
    fmt();
  }

  function rebuild() {
    const t0 = performance.now();
    const ds = SIM.sim.buildDataset(state.cfg);
    state.run = new SIM.sim.Run(ds, state.cfg);
    state.run.startFile();
    rebuildFileList();
    el.poolInfo.textContent = 'pool: ' + SIM.view.fmtB(ds.poolSize) + ' · ' + ds.files.length + ' plików';
    NS.buildMs = performance.now() - t0;
    state.dirty = true;
  }

  function restart() {
    const st = state.run ? state.run.st : null;
    rebuild();
    if (st) state.dirty = true;
  }

  function rebuildFileList() {
    const host = el.files;
    host.innerHTML = '';
    const frag = document.createDocumentFragment();
    state.run.ds.files.forEach(f => {
      const b = document.createElement('button');
      b.className = 'frow';
      b.dataset.i = f.i;
      b.innerHTML = '<span class="fname">' + f.name + '</span>' +
        '<span class="fmeta">' + SIM.view.fmtB(f.len) + '</span>' +
        '<span class="fkind ' + f.kind + '">' + (f.kind === 'copy' ? 'kopia' : 'oryginał') + '</span>';
      b.addEventListener('click', () => focusFile(f.i));
      frag.appendChild(b);
    });
    host.appendChild(frag);
  }

  function focusFile(i) {
    const run = state.run;
    run.fileQueue = run.ds.files.map(f => f.i);
    const pos = run.fileQueue.indexOf(i);
    run.fileQueue = [i].concat(run.fileQueue.filter(x => x !== i));
    run.fileIdx = 0;
    run.startFile();
    state.dirty = true;
  }

  let last = 0, lastErr = null;
  function loop(ts) {
    // kolejna klatka rejestrujemy ZANIM cokolwiek się wykonze, żeby błąd
    // rysowania nie zabił symulacji
    requestAnimationFrame(loop);
    const dt = Math.min(50, ts - last || 16);
    last = ts;

    if (state.playing && state.run) {
      const run = state.run;
      // budżet bajtów na klatkę: 24 kB × mnożnik prędkości
      const budget = Math.max(512, Math.round(24000 * state.cfg.speed * dt / 16.7));
      let guard = 0;
      while (!run.done && guard++ < 12) {
        const before = run.fileIdx;
        run.step(budget);
        if (run.fileIdx === before && !run.chunker) break;
        if (state.cfg.speed > 2.5) continue;
        break;
      }
      updateStats();
    }

    if (state.run && (state.dirty !== false || state.playing)) {
      const W = cv.clientWidth, H = cv.clientHeight;
      if (cv.width !== Math.round(W * dpr())) resize();
      try {
        SIM.view.draw(ctx, cv.width / dpr(), cv.height / dpr(), state.run, state.cfg, state);
        lastErr = null;
      } catch (e) {
        if (lastErr !== e.message) { lastErr = e.message; console.error('błąd rysowania:', e); }
      }
    }
  }

  function dpr() { return Math.min(2, window.devicePixelRatio || 1); }
  function resize() {
    cv.width = Math.round(cv.clientWidth * dpr());
    cv.height = Math.round(cv.clientHeight * dpr());
  }
  window.addEventListener('resize', () => { resize(); state.dirty = true; });

  function fmtBytes(n) {
    if (n >= 1073741824) return (n / 1073741824).toFixed(2) + ' GB';
    if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
    if (n >= 1024) return (n / 1024).toFixed(0) + ' KB';
    return n + ' B';
  }

  function updateStats() {
    const st = state.run.st;
    el.stLogical.textContent = SIM.view.fmtB(st.logical);
    el.stWritten.textContent = SIM.view.fmtB(st.written);
    el.stRatio.textContent = st.written ? (st.logical / st.written).toFixed(2) + ' : 1' : '—';
    el.stChunks.textContent = st.chunks.toLocaleString('pl-PL');
    el.stUnique.textContent = st.unique.toLocaleString('pl-PL');
    el.stDups.textContent = st.dups.toLocaleString('pl-PL');
    el.stFps.textContent = state.run.chunker
      ? (state.run.chunker.fps / 1000).toFixed(0).replace('.', ',') + ' MB/s*'
      : '—';
    el.stCont.textContent = state.run.containers.length;
    el.stHoles.textContent = fmtBytes(state.run.holesBytes);
    el.stHoles.style.color = state.run.holesBytes > 0 ? 'var(--ref)' : '';
    const is = state.run.idxStats;
    el.stIdx.textContent = fmtBytes(state.run.indexBytes);
    el.stIdx.title = is
      ? (is.disk + ' seeków na dysk · ' + is.seq + ' odczytów sekwencyjnych · ' +
        state.run.st.falseNeg + ' pominiętych duplikatów')
      : '';

    const cur = state.run.fileIdx - 1;
    el.files.querySelectorAll('.frow').forEach((n, i) => {
      const f = state.run.ds.files[i];
      n.classList.toggle('done', i < cur && !f.dead);
      n.classList.toggle('cur', i === cur);
      n.classList.toggle('dead', !!f.dead);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
  NS.state = state;

})(window.SIM = window.SIM || {});
