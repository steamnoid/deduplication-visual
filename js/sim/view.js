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
    const hHash = Math.max(74, H * 0.235);
    const hIdx = Math.max(88, H * 0.24);
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
      const hh2 = Math.max(34, hHash - 92);
      drawLensHist(ctx, M + 12, yHash + 82, wHash - 24, hh2, run, C.cyan);
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


    /* ---------- indeks + statystyki ---------- */
    const wIdx = innerW * 0.56;
    text(ctx, '5 · indeks w RAM (' + run.BUCKETS + ' kubełków)', M, yIdx - 4, { size: 11, weight: 700, color: C.dim });
    box(ctx, M, yIdx, wIdx, hIdx, { r: 8, fill: C.panel, stroke: C.line });
    const B = run.BUCKETS, cols = 64, rowsN = B / cols;
    const cw = (wIdx - 20) / cols, chh = (hIdx - 42) / rowsN;
    let mxB = 1;
    for (let i = 0; i < B; i++) if (run.bucketCounts[i] > mxB) mxB = run.bucketCounts[i];
    for (let i = 0; i < B; i++) {
      const v = run.bucketCounts[i];
      const x = M + 10 + (i % cols) * cw, y = yIdx + 24 + ((i / cols) | 0) * chh;
      box(ctx, x, y, cw - 1, chh - 1, {
        r: 1,
        fill: v ? alpha(C.violet, 0.18 + 0.72 * (v / mxB)) : '#0e1524',
        stroke: v ? alpha(C.violet, 0.5) : '#182338'
      });
    }
    const per = st.unique / B;
    text(ctx, st.unique.toLocaleString('pl-PL') + ' wpisów · średnio ' + per.toFixed(1) +
      ' / kubełek · kolizje: ' + st.bucketHits.toLocaleString('pl-PL') +
      ' (' + (st.unique ? Math.round(st.bucketHits / st.unique * 100) : 0) + ' % nowych chunków)',
      M + 10, yIdx + hIdx - 10, { size: 10.5, color: C.muted, mono: true });

    // statystyki
    const sx = M + wIdx + 16, sw = W - M - sx;
    text(ctx, '6 · bilans', sx, yIdx - 4, { size: 11, weight: 700, color: C.dim });
    const ratio = st.written ? st.logical / st.written : 0;
    const rowsDef = [
      { n: 'bajty logiczne', v: fmtB(st.logical), c: C.info },
      { n: 'bajty zapisane', v: fmtB(st.written), c: C.new },
      { n: 'chunki', v: st.chunks.toLocaleString('pl-PL'), c: C.text },
      { n: 'unikalne chunki', v: st.unique.toLocaleString('pl-PL'), c: C.violet },
      { n: 'referencje (duplikaty)', v: st.dups.toLocaleString('pl-PL'), c: C.dupe },
      { n: 'dedup ratio', v: ratio ? ratio.toFixed(2) + ' : 1' : '—', c: C.save, big: true }
    ];
    const rh = Math.min(20, (hIdx - 6) / rowsDef.length);
    rowsDef.forEach((r, i) => {
      const y = yIdx + 12 + i * rh;
      text(ctx, r.n, sx, y, { size: 11, color: C.muted });
      text(ctx, r.v, sx + sw, y, { size: r.big ? 14 : 12, weight: 700, color: r.c, align: 'right', mono: true });
    });
    // pasek udziału zapisanych bajtów
    const share = st.logical ? st.written / st.logical : 0;
    text(ctx, 'udział danych na dysku', sx, yIdx + hIdx - 22, { size: 10, color: C.dim });
    bar(ctx, sx, yIdx + hIdx - 14, sw, 8, share, { fill: C.new, bg: '#1b2440' });
    text(ctx, Math.round(share * 100) + ' % puli logicznej', sx + sw, yIdx + hIdx - 10, { size: 10, color: C.new, align: 'right', mono: true });

    /* ---------- przebieg ---------- */
    const sw2 = (innerW - 24) / 4;
    spark(ctx, M, ySpark, sw2, hSpark, run.history.ratio,
      { color: C.save, min: 1, max: Math.max(2, Math.max.apply(null, run.history.ratio.concat([1])) * 1.1), label: 'dedup ratio', value: ratio.toFixed(2) });
    spark(ctx, M + (sw2 + 8), ySpark, sw2, hSpark, run.history.ram,
      { color: C.violet, label: 'wpisy w indeksie', value: st.unique.toLocaleString('pl-PL') });
    spark(ctx, M + 2 * (sw2 + 8), ySpark, sw2, hSpark, run.history.written,
      { color: C.new, label: 'bajty zapisane', value: fmtB(st.written) });
    spark(ctx, M + 3 * (sw2 + 8), ySpark, sw2, hSpark, run.history.avg,
      { color: C.dupe, label: 'średni chunk (B)', value: st.chunks ? Math.round(st.logical / st.chunks) + ' B' : '—' });
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

  function countNew(run, marks) {
    let n = 0;
    for (let i = 0; i < marks.length; i++) if (run.isNew[marks[i]] === 1) n++;
    return n;
  }

  NS.view = { draw, C, rr, box, text, alpha, bar, spark, fmtB };

})(window.SIM = window.SIM || {});
