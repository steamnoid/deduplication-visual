/* sim/view.js — rysowanie pipeline'u na canvasie: bajty → chunki → indeks
   Layout jest proporcjonalny: draw dostaje rozmiary w CSS-pikselach
   i układa pasy proporcjonalnie do wysokości, więc działa w każdym oknie. */

(function (NS) {
  const C = {
    bg: '#080d18', panel: '#111a2c', panel2: '#18243d', line: '#2a3757',
    text: '#e9eefb', muted: '#94a3c2', dim: '#5b6b8c',
    new: '#f4a261', dupe: '#2ec4b6', ref: '#ffd166', save: '#06d6a0',
    bad: '#ef476f', info: '#5aa9e6', violet: '#b388eb', cyan: '#48cae4'
  };

  function rr(ctx, x, y, w, h, r) {
    const rad = Math.min(Math.abs(r), Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }
  function box(ctx, x, y, w, h, o) {
    o = o || {}; rr(ctx, x, y, w, h, o.r == null ? 5 : o.r);
    if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
    if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 1; if (o.dash) ctx.setLineDash(o.dash); ctx.stroke(); ctx.setLineDash([]); }
  }
  function alpha(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function text(ctx, s, x, y, o) {
    o = o || {};
    const fam = o.mono ? 'ui-monospace, Menlo, monospace' : '-apple-system, "SF Pro Text", system-ui, sans-serif';
    ctx.font = (o.weight || 500) + ' ' + (o.size || 13) + 'px ' + fam;
    ctx.fillStyle = o.color || C.text;
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = o.base || 'middle';
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    ctx.fillText(s, x, y);
    ctx.globalAlpha = 1;
  }
  function bar(ctx, x, y, w, h, v, o) {
    o = o || {}; rr(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = o.bg || '#1b2440'; ctx.fill();
    if (v > 0) { ctx.save(); rr(ctx, x, y, w, h, h / 2); ctx.clip(); ctx.fillStyle = o.fill || C.info; ctx.fillRect(x, y, w * Math.min(1, v), h); ctx.restore(); }
  }
  function spark(ctx, x, y, w, h, data, o) {
    o = o || {};
    box(ctx, x, y, w, h, { r: 6, fill: o.bg || '#0e1524', stroke: C.line });
    if (!data || data.length < 2) return;
    let mn = o.min, mx = o.max;
    if (mn == null || mx == null) {
      mn = Infinity; mx = -Infinity;
      for (const v of data) { if (v < mn) mn = v; if (v > mx) mx = v; }
      if (mx - mn < 1e-9) mx = mn + 1;
      const pad = (mx - mn) * 0.18; mn -= pad; mx += pad;
    }
    const val = data[data.length - 1];
    if (o.label) text(ctx, o.label, x + 8, y + 12, { size: 10, color: C.dim });
    if (o.value != null) text(ctx, o.value, x + w - 8, y + 12, { size: 12, weight: 700, color: o.color || C.save, align: 'right', mono: true });
    ctx.save();
    ctx.beginPath(); ctx.rect(x + 1, y + 1, w - 2, h - 2); ctx.clip();
    ctx.beginPath();
    data.forEach((v, i) => {
      const px = x + (i / (data.length - 1)) * (w - 2) + 1;
      const py = y + h - 1 - ((v - mn) / (mx - mn)) * (h - 2);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.strokeStyle = o.color || C.save; ctx.lineWidth = 1.7; ctx.stroke();
    ctx.lineTo(x + w - 1, y + h - 1); ctx.lineTo(x + 1, y + h - 1); ctx.closePath();
    ctx.fillStyle = alpha(o.color || C.save, 0.1); ctx.fill();
    if (o.mark != null) {
      const my = y + h - 1 - ((o.mark - mn) / (mx - mn)) * (h - 2);
      ctx.setLineDash([3, 3]); ctx.strokeStyle = alpha(C.ref, 0.7); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 1, my); ctx.lineTo(x + w - 1, my); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
    void val;
  }
  /* tysiące z odstępem — w Polishie to przecinek */
  function fmt(n) { return Math.round(n).toLocaleString('pl-PL'); }

  function fmtB(n) {
    if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
    if (n >= 1024) return (n / 1024).toFixed(0) + ' KB';
    return n + ' B';
  }

  /* ------------------------------------------------------------------ */
  function draw(ctx, W, H, run, cfg) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);

    const st = run.st, ch = run.chunker, f = run.currentFile;
    const M = 18;
    const innerW = W - 2 * M;

    // pasy layoutu: nagłówek, plik, lupa, maska+chunki, indeks+bilans, przebieg.
    // Proporcje dobrane tak, żeby ostatni pas (przebieg) domykał do dołu.
    const G = 14;
    const yHead = 0;
    const hFile = Math.max(28, H * 0.062);
    const yFile = 40;
    const hZoom = Math.max(50, H * 0.125);
    const yZoom = yFile + hFile + G;
    const yHash = yZoom + hZoom + G;
    const hHash = Math.max(74, H * 0.225);
    const hIdx = Math.max(110, H * 0.28);
    const yIdx = yHash + hHash + G;
    const ySpark = yIdx + hIdx + G;
    const hSpark = Math.max(54, H - ySpark - 6);

    /* ---------- nagłówek ---------- */
    text(ctx, '1 · bajty pliku', M, yHead + 16, { size: 11, weight: 700, color: C.dim });
    const pr = run.progress;
    text(ctx, (f ? f.name : '—') + '   ·   ' + pr.files + ' / ' + pr.filesTotal + ' plików   ·   ' + fmtB(f ? f.len : 0),
      W - M, yHead + 16, { size: 11.5, color: C.muted, align: 'right', mono: true });

    /* ---------- pasek pliku + głowica ---------- */
    box(ctx, M, yFile, innerW, hFile, { r: 5, fill: '#0e1524', stroke: C.line });
    if (f) {
      const bw = innerW - 4, n = Math.min(1100, Math.floor(bw));
      const step = bw / n;
      for (let i = 0; i < n; i++) {
        const at = Math.floor(i / n * f.len);
        const b = run.ds.pool[f.off + at];
        const v = (b & 0x3f) / 63;
        const done = at < (ch ? ch.pos : f.len);
        ctx.fillStyle = done ? 'rgba(90,169,230,' + (0.14 + v * 0.42) + ')' : 'rgba(90,169,230,0.06)';
        ctx.fillRect(M + 2 + i * step, yFile + 3, Math.max(1, step - 0.4), hFile - 6);
      }
      if (ch) {
        // granice chunków: tylko w oknie głowicy, inaczej za gęsto
        const scale = bw / f.len;
        const from = Math.max(0, ch.pos - 4000), to = Math.min(f.len, ch.pos + 400);
        for (let k = 0; k < ch.cuts.n; k++) {
          const c = ch.cuts.get(k);
          if (c < from || c > to) continue;
          const px = M + 2 + c * scale;
          ctx.fillStyle = alpha(C.ref, 0.9);
          ctx.fillRect(px, yFile + 2, 1, 5);
          ctx.fillRect(px, yFile + hFile - 7, 1, 5);
        }
        const hx = M + 2 + ch.pos * scale;
        ctx.fillStyle = C.ref; ctx.fillRect(hx - 1, yFile - 3, 2, hFile + 6);
        ctx.beginPath();
        ctx.moveTo(hx - 6, yFile - 9); ctx.lineTo(hx + 6, yFile - 9); ctx.lineTo(hx, yFile - 2);
        ctx.closePath(); ctx.fill();
      }
      text(ctx, (ch ? Math.round((ch.pos / f.len) * 100) : 0) + '%', M + innerW - 6, yFile + hFile + 8, { size: 10, color: C.dim, align: 'right' });
    }

    /* ---------- lupa: bajty wokół głowicy ---------- */
    text(ctx, '2 · lupa — 96 bajtów przy głowicy', M, yZoom - 4, { size: 11, weight: 700, color: C.dim });
    const ZOOM = 96;
    if (ch && f) {
      const end = ch.pos, start = Math.max(0, end - ZOOM);
      const shown = end - start;
      const cw = innerW / ZOOM;
      for (let i = 0; i < ZOOM; i++) {
        const at = start + i;
        const x = M + i * cw;
        if (at >= f.len) break;
        const b = run.ds.pool[f.off + at];
        const col = i >= shown ? '#101828' : 'rgba(90,169,230,.2)';
        box(ctx, x, yZoom, cw - 1, hZoom * 0.5, { r: 2, fill: col, stroke: at < end ? alpha(C.info, 0.25) : '#1a2338' });
        if (cw > 7) {
          text(ctx, String.fromCharCode(32 + (b & 0x5f)), x + (cw - 1) / 2, yZoom + hZoom * 0.25, {
            size: Math.min(11, cw * 0.9), color: i >= shown ? C.dim : C.info, align: 'center', mono: true
          });
        }
      }
      // znaczniki cięć w lupie
      for (let k = 0; k < ch.cuts.n; k++) {
        const c = ch.cuts.get(k);
        if (c < start || c > end) continue;
        const x = M + (c - start) * cw;
        ctx.fillStyle = C.ref; ctx.fillRect(x - 1, yZoom - 3, 2, 4);
        ctx.fillRect(x - 1, yZoom + hZoom * 0.5, 2, 5);
      }
      // wartość hasza pod lupą
      const hh = ch.h >>> 0;
      text(ctx, 'h = 0x' + hh.toString(16).padStart(8, '0'), M, yZoom + hZoom - 10, { size: 12, weight: 700, mono: true, color: C.ref });
      text(ctx, 'chunk #' + ch.cuts.n + ' · ' + ch.chunkLen + ' B', M + 190, yZoom + hZoom - 10, { size: 11, color: C.muted, mono: true });
    } else {
      text(ctx, 'brak pliku w kolejce', M + 6, yZoom + 20, { size: 12, color: C.dim });
    }

    /* ---------- maska i chunki bieżącego pliku ---------- */
    const wHash = Math.min(420, innerW * 0.36);
    text(ctx, '3 · maska', M, yHash - 4, { size: 11, weight: 700, color: C.dim });
    box(ctx, M, yHash, wHash, hHash, { r: 8, fill: C.panel, stroke: C.line });
    if (ch) {
      const bw2 = Math.min(30, (wHash - 30) / ch.bits);
      text(ctx, 'maska ' + ch.bits + ' bitów  (średni chunk ' + (1 << ch.bits) + ' B)', M + 12, yHash + 16, { size: 10.5, color: C.dim });
      for (let b = 0; b < ch.bits; b++) {
        const bit = (ch.h >> b) & 1;
        const col = bit ? C.bad : C.save;
        const x = M + 12 + (ch.bits - 1 - b) * bw2;
        box(ctx, x, yHash + 26, bw2 - 4, 24, { r: 3, fill: alpha(col, 0.18), stroke: col });
        text(ctx, bit + '', x + (bw2 - 4) / 2, yHash + 38, { size: 12, weight: 800, mono: true, color: col, align: 'center' });
      }
      const hit = (ch.h & ch.mask) === 0 && ch.chunkLen >= ch.minSize;
      text(ctx, hit ? '→ cięcie' : '→ dalej', M + 12, yHash + 64, { size: 11.5, weight: 700, color: hit ? C.save : C.muted });
      text(ctx, 'próg Min ' + ch.minSize + ' B', M + 96, yHash + 64, { size: 10.5, color: C.dim });
      // rozkład długości chunków bieżącego pliku
      const hh2 = Math.max(30, hHash - 100);
      drawLensHist(ctx, M + 12, yHash + 90, wHash - 24, hh2, run, C.cyan);
    }

    // filmstrip: ostatnie chunky ze wszystkich plików (koło bufora)
    const xs = M + wHash + 16, ws = W - M - xs;
    text(ctx, '4 · ostatnie chunki (nowe = pomarańczowe, znane = zielone)', xs, yHash - 4, { size: 11, weight: 700, color: C.dim });
    const marks = run.tail || (run.tail = []);
    const tile = 8, gap = 2;
    const perRow = Math.max(10, Math.floor((ws - 4) / (tile + gap)));
    const maxRows = Math.max(1, Math.floor((hHash - 6) / (13 + gap)));
    const shown = Math.min(marks.length, perRow * maxRows);
    const start = Math.max(0, shown - perRow * maxRows);
    for (let i = start; i < shown; i++) {
      const k = i - start;
      const x = xs + (k % perRow) * (tile + gap);
      const y = yHash + 4 + ((k / perRow) | 0) * (13 + gap);
      const isNew = run.isNew[marks[i]] === 1;
      box(ctx, x, y, tile, 13, { r: 2, fill: alpha(isNew ? C.new : C.dupe, 0.8) });
    }
    const nNew = countNew(run, marks);
    text(ctx, 'w oknie: ' + nNew + ' nowych  ·  ' + (marks.length - nNew) + ' referencji',
      xs, yHash + hHash - 2, { size: 10.5, color: C.dim });


    /* ---------- kontenery na dysku ---------- */
    const wIdx = innerW * 0.62;
    text(ctx, '5 · kontenery na dysku (' + SIM_KB(run.containerSize) + ' każdy)', M, yIdx - 4, { size: 11, weight: 700, color: C.dim });
    box(ctx, M, yIdx, wIdx, hIdx, { r: 8, fill: C.panel, stroke: C.line });
    drawContainers(ctx, M + 10, yIdx + 22, wIdx - 20, hIdx - 74, run);

    // pasek indeksu (1024 kubełków, cienki)
    const iw = wIdx - 20, ih = 16;
    const iy = yIdx + hIdx - 30;
    const B = run.BUCKETS;
    const is = run.idxStats;
    text(ctx, (is ? (is.disk ? is.disk + ' seeków na dysk' : '0 seeków') + '  ·  ' +
      is.seq + ' odczytów sekwencyjnych  ·  ' + st.bucketHits + ' kolizji  ·  ' : '') +
      st.falseNeg + ' pominiętych duplikatów',
      M + 10, yIdx + hIdx - 44, { size: 10, color: st.falseNeg ? C.ref : C.dim });
    const cw = iw / B;
    for (let i = 0; i < B; i++) {
      const v = run.bucketCounts[i];
      if (!v) continue;
      ctx.fillStyle = alpha(C.violet, 0.25 + 0.65 * Math.min(1, v / 30));
      ctx.fillRect(M + 10 + i * cw, iy + ih - 4 - Math.min(1, v / 30) * (ih - 6), Math.max(1, cw - 0.4), ih - 6);
    }
    ctx.strokeStyle = C.line; ctx.lineWidth = 1;
    ctx.strokeRect(M + 10.5, iy + 0.5, iw - 1, ih - 1);

    /* ---------- statystyki ---------- */
    const sx = M + wIdx + 16, sw = W - M - sx;
    text(ctx, '6 · bilans', sx, yIdx - 4, { size: 11, weight: 700, color: C.dim });
    const st2 = st;
    const holes = run.holesBytes;
    const ratio = st2.written ? st2.logical / st2.written : 0;
    const rowsDef = [
      { n: 'bajty logiczne', v: fmtB(st2.logical), c: C.info },
      { n: 'bajty na dysku', v: fmtB(st2.written), c: C.new },
      { n: 'dziury (wygasłe chunki)', v: fmtB(holes), c: holes ? C.ref : C.dim },
      { n: 'chunki / unikalne', v: st2.chunks.toLocaleString('pl-PL') + ' / ' + st2.unique.toLocaleString('pl-PL'), c: C.muted },
      { n: 'referencje', v: st2.dups.toLocaleString('pl-PL'), c: C.dupe },
      { n: 'kontenery', v: String(run.containers.length), c: C.violet },
      { n: 'indeks w RAM (' + (run.cfg.indexKind === 'eb' ? 'EB' : run.cfg.indexKind === 'silo' ? 'SiLo' : 'hash') + ')',
        v: fmtB(run.indexBytes), c: C.violet },
      { n: 'dedup ratio', v: st2.written ? (st2.logical / st2.written).toFixed(2) + ' : 1' : '—', c: C.save, big: true }
    ];
    const rh = Math.min(19, (hIdx - 20) / rowsDef.length);
    rowsDef.forEach((r, i) => {
      const y = yIdx + 12 + i * rh;
      text(ctx, r.n, sx, y, { size: 10.5, color: C.muted });
      text(ctx, r.v, sx + sw, y, { size: r.big ? 13.5 : 11.5, weight: 700, color: r.c, align: 'right', mono: true });
    });
    const share = st2.logical ? st2.written / st2.logical : 0;
    const bw2 = Math.min(120, sw);
    text(ctx, 'zapis / logiczne', sx, yIdx + hIdx - 24, { size: 10, color: C.dim });
    bar(ctx, sx, yIdx + hIdx - 16, bw2, 8, share, { fill: C.new, bg: '#1b2440' });
    text(ctx, Math.round(share * 100) + ' %', sx + bw2 + 8, yIdx + hIdx - 12, { size: 10, color: C.new, mono: true });
    const eff = run.containers.length * run.containerSize;
    text(ctx, 'kontenery zajmują ' + fmtB(eff) + (holes > 0 ? ' (dziury ' + Math.round(holes / eff * 100) + ' %)' : ''),
      sx, yIdx + hIdx - 2, { size: 10, color: holes ? C.ref : C.dim });

    /* ---------- przebieg ---------- */
    const sw2 = (innerW - 24) / 4;
    spark(ctx, M, ySpark, sw2, hSpark, run.history.ratio,
      { color: C.save, min: 1, max: Math.max(2, Math.max.apply(null, run.history.ratio.concat([1])) * 1.1), label: 'dedup ratio', value: ratio.toFixed(2) });
    spark(ctx, M + (sw2 + 8), ySpark, sw2, hSpark, run.history.indexRam,
      { color: C.violet, label: 'indeks w RAM', value: fmtB(run.indexBytes) });
    spark(ctx, M + 2 * (sw2 + 8), ySpark, sw2, hSpark, run.history.containerFill,
      { color: C.new, label: 'średnie wypełnienie kontenerów', value: Math.round((run.history.containerFill[run.history.containerFill.length - 1] || 0) * 100) + ' %' });
    spark(ctx, M + 3 * (sw2 + 8), ySpark, sw2, hSpark, run.history.holes,
      { color: run.holesBytes ? C.ref : C.dupe, label: 'dziury (wygasłe chunki)', value: fmtB(run.holesBytes) });
  }

  function drawLensHist(ctx, x, y, w, h, run, col) {
    const lens = run.chunker && run.chunker.lens.n ? run.chunker.lens : null;
    text(ctx, 'rozkład długości chunków w bieżącym pliku', x, y - 4, { size: 9.5, color: C.dim });
    if (!lens) return;
    const n = lens.n;
    const start = Math.max(0, n - 1200);
    const bins = 18, hist = new Array(bins).fill(0);
    const mxL = Math.max(64, (1 << run.chunker.bits) * 6);
    for (let i = start; i < n; i++) {
      const v = Math.min(bins - 1, Math.floor(lens.get(i) / mxL * bins));
      hist[v]++;
    }
    const hmax = Math.max(1, Math.max.apply(null, hist));
    const bw = w / bins;
    for (let i = 0; i < bins; i++) {
      const bh = (hist[i] / hmax) * (h - 12);
      if (bh < 0.6) continue;
      box(ctx, x + i * bw + 1, y + h - bh, bw - 2, bh, { r: 1, fill: alpha(col, 0.35), stroke: alpha(col, 0.6) });
    }
    text(ctx, '0', x, y + h + 6, { size: 9, color: C.dim });
    text(ctx, mxL + ' B', x + w, y + h + 6, { size: 9, color: C.dim, align: 'right' });
  }

  function SIM_KB(b) { return (b / 1024).toFixed(0) + ' KB'; }

  /* siatka kontenerów: wypełnienie, dziury, świeżo zapisany */
  function drawContainers(ctx, x, y, w, h, run) {
    const conts = run.containers;
    if (!conts.length) {
      text(ctx, 'jeszcze nic nie zapisano', x + 4, y + 12, { size: 11.5, color: C.dim });
      return;
    }
    const cols = Math.max(6, Math.min(24, Math.floor(w / 52)));
    const cw = (w - (cols - 1) * 5) / cols;
    const ch = Math.min(40, (h - (Math.ceil(conts.length / cols) - 1) * 5));
    const rowsN = Math.ceil(conts.length / cols);
    const maxRows = Math.max(1, Math.floor((h + 5) / (ch + 5)));
    const from = Math.max(0, conts.length - cols * maxRows);

    for (let i = from; i < conts.length; i++) {
      const c = conts[i];
      const k = i - from;
      const cx = x + (k % cols) * (cw + 5);
      const cy = y + ((k / cols) | 0) * (ch + 5);
      const fill = c.fill;
      const holes = run.contHoles[i] || 0;
      const holeFrac = c.cap ? holes / c.cap : 0;
      box(ctx, cx, cy, cw, ch, { r: 4, fill: '#0b1220', stroke: C.line });
      // zapisane bajty
      const usedH = (ch - 4) * Math.min(1, fill);
      ctx.fillStyle = alpha(C.new, 0.75);
      ctx.fillRect(cx + 2, cy + ch - 2 - usedH, cw - 4, usedH);
      // dziury
      if (holeFrac > 0) {
        const holeH = (ch - 4) * Math.min(1, holeFrac);
        ctx.save();
        ctx.strokeStyle = alpha(C.ref, 0.9); ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.strokeRect(cx + 2.5, cy + ch - 2 - holeH + 1, cw - 5, holeH - 2);
        ctx.restore();
      }
      // świeżo zapełniany
      if (i === conts.length - 1 && fill > 0.02) {
        const top = cy + ch - 2 - usedH;
        ctx.fillStyle = alpha(C.save, 0.9);
        ctx.fillRect(cx + 2, top, cw - 4, 2);
      }
      text(ctx, Math.round(fill * 100) + '', cx + 3, cy + 8, {
        size: 8.5, color: fill > 0.9 ? C.text : C.dim, weight: 700
      });
    }
    if (from > 0) {
      text(ctx, '+' + from + ' starszych kontenerów', x + 2, y + h + 12, { size: 10, color: C.dim });
    }
    // legenda
    const lx = x + w - 8;
    box(ctx, lx - 132, y + h - 12, 8, 8, { fill: alpha(C.new, 0.75) });
    text(ctx, 'zapisane', lx - 120, y + h - 8, { size: 9.5, color: C.dim });
    box(ctx, lx - 66, y + h - 12, 8, 8, { fill: 'none', stroke: C.ref, dash: [2, 2] });
    text(ctx, 'dziury', lx - 54, y + h - 8, { size: 9.5, color: C.dim });
  }

  function countNew(run, marks) {
    let n = 0;
    for (let i = 0; i < marks.length; i++) if (run.isNew[marks[i]] === 1) n++;
    return n;
  }


  /* ---------- wykres 30 dni ---------- */

  /* Trzy serie na jednym obrazie, bo to one się ze sobą biją:
     zapisane bajty (słupki), dziury po retencji (linia) i momenty,
     w których GC zabrał się do sprzątania (znaczniki). */
  function drawTimeline(ctx, W, H, res, sel, hover) {
    const S = res.series;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    const padL = 56, padR = 58, padT = 52, padB = 40;
    const px = padL, py = padT;
    const pw = W - padL - padR, ph = H - padT - padB;

    let maxW = 1, maxH = 0.01;
    for (const d of S) { maxW = Math.max(maxW, d.written); maxH = Math.max(maxH, d.holesRatio); }
    const niceW = niceMax(maxW), niceH = Math.min(1, Math.max(0.3, Math.ceil(maxH * 5) / 5));

    // siatka i podpisy osi
    for (let i = 0; i <= 4; i++) {
      const y = py + ph - (ph * i) / 4;
      ctx.strokeStyle = i ? C.line : '#3a4a70';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, Math.round(y) + .5); ctx.lineTo(px + pw, Math.round(y) + .5); ctx.stroke();
      text(ctx, fmtB((niceW * i) / 4), px - 8, y, { size: 10, color: C.dim, align: 'right', mono: true });
      text(ctx, Math.round((niceH * i) / 4 * 100) + '%', px + pw + 8, y, { size: 10, color: C.dim, mono: true });
    }

    const bw = pw / S.length;
    const barW = Math.max(3, bw - 5);

    for (let i = 0; i < S.length; i++) {
      const d = S[i];
      const x = px + i * bw;
      const h = (d.written / niceW) * ph;
      const y = py + ph - h;
      const isSel = i === sel;
      const first = d.day === 1;
      const col = first ? C.violet : (d.ratio > 8 ? C.save : d.ratio > 2 ? C.dupe : C.new);
      ctx.fillStyle = isSel ? col : alpha(col, 0.72);
      rr(ctx, x + 2.5, y, barW, Math.max(2, h), Math.min(3, barW / 2));
      ctx.fill();
      if (isSel) {
        ctx.strokeStyle = C.text; ctx.lineWidth = 1;
        rr(ctx, x + 2.5, y, barW, Math.max(2, h), Math.min(3, barW / 2)); ctx.stroke();
      }
      // dwa pasy zdarzeń nad wykresem: wygaśnięte kopie i GC
      if (d.expired > 0) {
        ctx.fillStyle = alpha(C.ref, 0.9);
        ctx.fillRect(x + 2.5, py - 20, barW, 4);
      }
      if (d.gc) {
        const gh = 4 + (d.gc / Math.max(1, maxW)) * 12;
        ctx.fillStyle = C.bad;
        ctx.fillRect(x + 2.5, py - 13, barW, gh);
      }
      if ((i + 1) % 5 === 0 || i === S.length - 1) {
        text(ctx, 'd' + d.day, x + bw / 2, py + ph + 14, { size: 10, color: C.dim, align: 'center' });
      }
    }

    // linia dziur: procent niewykorzystanego miejsca w kontenerach
    ctx.strokeStyle = C.bad; ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    S.forEach((d, i) => {
      const x = px + i * bw + bw / 2;
      const y = py + ph - (d.holesRatio / niceH) * ph;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // legenda
    text(ctx, 'zapisane bajty / dzień', px, 12, { size: 11, color: C.muted });
    text(ctx, 'dziury %', px + 138, 12, { size: 11, color: C.bad });
    text(ctx, 'pasek: wygaśnięte kopie', px + 196, 12, { size: 10, color: C.ref });
    text(ctx, 'pasek: GC', px + 324, 12, { size: 10, color: C.bad });
    text(ctx, 'słupek fioletowy: pierwszy pełny backup', px + 388, 12, { size: 10, color: C.violet });

    // dzień pod kursorem dostaje własny kontur
    if (hover != null && hover !== sel && S[hover]) {
      const hx = px + hover * bw;
      ctx.strokeStyle = alpha(C.info, 0.5);
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.strokeRect(Math.round(hx) + 1.5, py - 6, Math.max(1, bw - 3), ph + 6);
      ctx.setLineDash([]);
    }

    // podświetlenie wybranego dnia: pasek pod osią i opis pod nim
    const d = S[sel];
    const selX = px + sel * bw;
    ctx.fillStyle = alpha(C.info, 0.13);
    ctx.fillRect(selX, py - 10, bw, ph + 10);
    if (d) {
      const label = 'dzień ' + d.day + ' — ' + fmtB(d.written) + ' zapisu, ' +
        Math.round(d.holesRatio * 100) + '% dziur' + (d.gc ? ', GC ' + fmtB(d.gc) : '');
      const lx = Math.min(W - 8, Math.max(80, selX + bw / 2));
      text(ctx, label, lx, H - 9, { size: 11, color: C.info, align: 'center', weight: 600 });
    }
    if (hover != null && S[hover] && hover !== sel) tipDay(ctx, W, H, S[hover], px + hover * bw, pw, res);
    return { px, pw, bw, n: S.length, py, ph };
  }


  /* ---------- przebieg jednego dnia ---------- */

  /* Dzień to strumień chunków: każdy to albo zapis na dysk, albo
     duplikat pominięty, albo delta. Rysujemy to jako pas zdarzeń
     i dwie krzywe narastające — wejście i zapis — z głową odtwarzającą
     przebieg. Prawa strona wiersza pokazuje, ile tego dnia naprawdę
     zapisało się na dysk. */
  function drawDay(ctx, W, H, day, t) {
    const tr = day.trace;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    if (!tr.length) return null;

    const padL = 12, padR = 12;
    const pw = W - padL - padR;
    const yStrip = 30, hStrip = 58;
    const yCurve = 108, hCurve = H - yCurve - 30;

    // ile bajtów w sumie i ile na dysk
    let totalIn = 0, totalWrite = 0, maxLen = 1;
    for (const e of tr) {
      totalIn += e.len;
      if (e.kind !== 'dup') totalWrite += e.rec || e.len;
      if (e.len > maxLen) maxLen = e.len;
    }

    // krzywe narastające liczymy raz, potem tylko ryszymy
    const cumIn = new Float64Array(tr.length);
    const cumW = new Float64Array(tr.length);
    let a = 0, b = 0;
    for (let i = 0; i < tr.length; i++) {
      a += tr[i].len; cumIn[i] = a;
      if (tr[i].kind !== 'dup') b += tr[i].rec || tr[i].len;
      cumW[i] = b;
    }
    const scale = Math.max(1, totalIn);
    const head = Math.max(0, Math.min(tr.length, Math.round(t * tr.length)));

    // siatka pod krzywymi
    for (let i = 0; i <= 2; i++) {
      const y = yCurve + hCurve - (hCurve * i) / 2;
      ctx.strokeStyle = C.line;
      ctx.beginPath(); ctx.moveTo(padL, Math.round(y) + .5); ctx.lineTo(padL + pw, Math.round(y) + .5); ctx.stroke();
    }

    // pas zdarzeń: wysokość to realny rozmiar chunka
    const w = pw / tr.length;
    for (let i = 0; i < head; i++) {
      const e = tr[i];
      const h = Math.max(1.5, (e.len / maxLen) * hStrip);
      const x = padL + i * w;
      const col = e.kind === 'new' ? C.new : e.kind === 'delta' ? C.violet : C.dupe;
      ctx.fillStyle = col;
      ctx.fillRect(x, yStrip + hStrip - h, Math.max(0.7, w - (w > 3 ? 0.6 : 0)), h);
    }
    // jeszcze nieodtworzone: kontur
    ctx.fillStyle = alpha(C.dim, 0.13);
    ctx.fillRect(padL + head * w, yStrip, pw - head * w, hStrip);

    // krzywe wejścia i zapisu
    line(ctx, cumIn, padL, yCurve, hCurve, scale, C.muted, 1.2, [3, 3], pw);
    line(ctx, cumW, padL, yCurve, hCurve, scale, C.save, 1.8, null, pw);

    // zdarzenia systemowe tego dnia
    for (const p of day.phases || []) {
      if (p.kind === 'scan') continue;
      const x = padL + (p.at / tr.length) * pw;
      ctx.strokeStyle = p.kind === 'gc' ? C.bad : C.ref;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(x, yStrip - 6); ctx.lineTo(x, yCurve + hCurve); ctx.stroke();
      ctx.setLineDash([]);
      text(ctx, p.kind === 'gc' ? 'GC' : 'wygaśnięcia', x + 3, yStrip - 10,
        { size: 9, color: p.kind === 'gc' ? C.bad : C.ref });
    }

    // głowa odtwarzania
    const hx = padL + head * w;
    ctx.strokeStyle = C.text;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(hx, yStrip - 6); ctx.lineTo(hx, yCurve + hCurve); ctx.stroke();
    ctx.fillStyle = C.text;
    ctx.beginPath(); ctx.arc(hx, yStrip - 6, 3, 0, Math.PI * 2); ctx.fill();

    // legenda
    text(ctx, 'nowy chunk na dysk', padL, 12, { size: 10, color: C.new });
    text(ctx, 'duplikat pominięty', padL + 108, 12, { size: 10, color: C.dupe });
    text(ctx, 'delta', padL + 196, 12, { size: 10, color: C.violet });
    text(ctx, 'bajty wchodzące', padL + 240, 12, { size: 10, color: C.muted });
    text(ctx, 'zapisane na dysk', padL + 330, 12, { size: 10, color: C.save });

    // odczyt przy głowie
    const wIn = head ? cumIn[head - 1] : 0;
    const wOut = head ? cumW[head - 1] : 0;
    const out = {
      pct: head / tr.length,
      written: wOut, logical: wIn,
      ratio: wOut > 0 ? wIn / wOut : 0,
      chunks: head
    };
    box(ctx, W - 232, H - 24, 220, 18, { r: 4, fill: alpha(C.info, 0.1) });
    text(ctx, Math.round(out.pct * 100) + '% dnia · ' + fmtB(wIn) + ' wejścia · ' +
      fmtB(wOut) + ' na dysk' + (out.ratio ? ' · ' + out.ratio.toFixed(1) + ':1' : ''),
      W - 222, H - 15, { size: 11, color: C.text, mono: true });
    text(ctx, 'chunków ' + fmt(head) + ' z ' + fmt(tr.length) +
      (day.stride > 1 ? ' (krok ' + day.stride + ')' : ''), padL, H - 15,
      { size: 10, color: C.dim, mono: true });
    return out;
  }

  function line(ctx, data, x0, y0, h, max, color, lw, dash, pw) {
    if (data.length < 2) return;
    ctx.strokeStyle = color; ctx.lineWidth = lw;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = x0 + (i / (data.length - 1)) * pw;
      const y = y0 + h - (Math.min(1, data[i] / max)) * h;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }


  /* Tip pod kursorem. Tekst pisany jest z liczb dnia, a nie z szablonu:
     jeśli model się zmieni, zdanie zmieni się razem z nim. */
  function tipDay(ctx, W, H, d, x0, pw, res) {
    const lines = [
      'dzień ' + d.day + ' z ' + res.series.length,
      'wejście ' + fmtB(d.logical) + ' · zapis ' + fmtB(d.written) +
        (d.ratio ? ' · ' + d.ratio.toFixed(1) + ':1' : ''),
      'kontenery ' + d.containers + ' · dziury ' + Math.round(d.holesRatio * 100) + '%' +
        ' · indeks ' + fmtB(d.indexRam)
    ];
    if (d.deltaChunks) lines.push('delt zapisano: ' + fmt(d.deltaChunks));
    if (d.expired) lines.push('wygasło ' + fmtB(d.expired));
    if (d.gc) lines.push('GC przepisał ' + fmtB(d.gc));
    lines.push(cozSieDzialo(d));

    ctx.font = '500 11px -apple-system, system-ui, sans-serif';
    let wmax = 0;
    for (const l of lines) wmax = Math.max(wmax, ctx.measureText(l).width);
    const bw = Math.min(W - 16, wmax + 22);
    const bh = lines.length * 15 + 14;
    let bx = x0 + bw / 2 - bw / 2;
    bx = Math.max(6, Math.min(W - bw - 6, bx));
    let by = H - bh - 26;
    if (by < 4) by = 4;

    box(ctx, bx, by, bw, bh, { r: 6, fill: 'rgba(10,16,28,.97)', stroke: C.line });
    lines.forEach((l, i) => {
      const y = by + 14 + i * 15;
      text(ctx, l, bx + 11, y, {
        size: 11,
        color: i === 0 ? C.text : i === lines.length - 1 ? C.info : C.muted,
        weight: i === 0 ? 600 : 500
      });
    });
  }

  /* Jedno zdanie o tym, co ten dzień znaczył. */
  function cozSieDzialo(d) {
    if (d.day === 1) return 'pierwszy pełny backup: na dysk trafia cały zbiór';
    const c = d.chunks ? d.dups / d.chunks : 0;
    if (d.written === 0) return 'nic nowego nie zapisał się na dysk';
    if (c > 0.8) return 'prawie wszystko było duplikatem — indeks zrobił robotę';
    if (d.deltaChunks && d.deltaChunks * 3 > d.chunks) return 'pliki zmienione: delta skróciła większość nowych chunków';
    if (d.gc) return 'dziury przekroczyły próg, więc system sprzątał';
    if (d.expired) return 'głównie wygaśnięte kopie i drobne zmiany w plikach';
    return 'zwykły dzień: niewiele się zmieniło, niewiele zapisano';
  }

  /* Tip nad przebiegiem dnia: konkretny chunk pod kursorem. */
  function tipChunk(ctx, W, H, day, i, xAt) {
    const e = day.trace[i];
    if (!e) return;
    const kind = e.kind === 'new' ? 'nowy chunk na dysk'
      : e.kind === 'delta' ? 'delta (krótszy zapis)' : 'duplikat pominięty';
    const lines = [kind, 'rozmiar ' + fmtB(e.len) +
      (e.kind !== 'dup' ? ' · na dysk ' + fmtB(e.rec || e.len) : ' · na dysk 0 B'),
      'plik ' + (e.file + 1) + ', pozycja ' + fmtB(e.at)];
    ctx.font = '500 11px -apple-system, system-ui, sans-serif';
    let wmax = 0;
    for (const l of lines) wmax = Math.max(wmax, ctx.measureText(l).width);
    const bw = wmax + 22, bh = lines.length * 15 + 12;
    const x = Math.max(6, Math.min(W - bw - 6, (xAt || 0) - bw / 2));
    box(ctx, x, 4, bw, bh, { r: 6, fill: 'rgba(10,16,28,.97)', stroke: C.line });
    lines.forEach((l, k) => text(ctx, l, x + 11, 15 + k * 15, {
      size: 11, color: k === 0 ? (e.kind === 'new' ? C.new : e.kind === 'delta' ? C.violet : C.dupe) : C.muted
    }));
  }

  function niceMax(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }

  NS.view = { draw, drawTimeline, drawDay, tipChunk, C, rr, box, text, alpha, bar, spark, fmtB, fmt };

})(window.SIM = window.SIM || {});
