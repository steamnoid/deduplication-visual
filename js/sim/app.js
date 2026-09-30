/* sim/app.js — okno, sterowanie i pętla symulacji */

(function (NS) {

  const state = {
    cfg: {
      type: 'vm', files: 40, fileKB: 48, redundancy: 0.55,
      bits: 5, fastCDC: true, speed: 1, containerKB: 32, retention: 6,
      indexKind: 'hash', segChunks: 16
    },
    run: null, playing: true, dirty: true
  };

  const el = {};
  let ctx = null, cv = null;

  function $(id) { return document.getElementById(id); }

  function init() {
    cv = $('cv');
    ctx = cv.getContext('2d', { alpha: false });
    ['cfgType', 'cfgFiles', 'cfgRedund', 'cfgBits', 'cfgSpeed', 'cfgCont', 'cfgRet',
      'cfgIndex', 'cfgSeg', 'cmpBtn', 'cmpPanel', 'cmpBody', 'cmpClose',
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
    el.cmpClose.addEventListener('click', closeCompare);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCompare(); });

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
