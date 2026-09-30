/* ch3.js — Rozdział 3: algorytmy podziału na chunki (CDC, AE, FastCDC) */

(function (D) {
  const C = D.C;

  const MASK = 0b1111;                 // ~16 B średni chunk w skali naszej wizualizacji
  const DATA = D.makeData(3, 200);

  function cdcCuts(str, mask) {
    const cuts = [0];
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 1) + D.gearVal(str.charCodeAt(i))) >>> 0;
      if ((h & mask) === 0) cuts.push(i + 1);
    }
    if (cuts[cuts.length - 1] !== str.length) cuts.push(str.length);
    return cuts;
  }

  /* ------------------------------------------------------------------
     1. fixed-vs-cdc — wstawienie 3 bajtów niszczy podział stały, nie niszczy CDC
     ------------------------------------------------------------------ */
  D.scene('fixed-vs-cdc', {
    title: 'Stałe bloki vs zawartość',
    duration: 6.4,
    controls: [{ type: 'select', key: 'mode', label: 'Tryb', value: 'auto', options: ['auto', 'przed', 'po'] }],

    draw: function (ctx, t, p) {
      const W = 800, H = 450;
      const ins = p.mode === 'auto' ? t > 0.46 : p.mode === 'po';
      const A = DATA;
      const B = D.spliceAt(A, 100, 'XYZ');

      D.sceneTitle(ctx, 'Wersja A i wersja B tego samego pliku. Jeden chunk z wstawionymi bajtami przesuwa granice:',
        W, C.muted);
      D.text(ctx, 'przesunięcie granic po wstawieniu', W - 34, 46, {
        size: 12, color: C.bad, align: 'right', weight: 700
      });
      D.line(ctx, W - 258, 50, W - 34, 50, { color: C.bad, lw: 2 });

      const x0 = 208, dw = W - x0 - 26, px = dw / 210;
      const h = 26;
      const insX = 100 * px;

      // faza: pokaż A (0–0.34), wstaw (0.34–0.46), pokaż B (0.46–1)
      const phase = ins ? D.easeInOut(D.span(t, 0.3, 0.46)) : 0;
      void phase;

      /* --- górna połowa: podział na stałe bloki --- */
      this.rowTitle(ctx, 40, 92, 'STAŁE BLOKI', 'fixed-size', C.bad,
        'granice zależą od pozycji bajtu');
      this.fixedRow(ctx, A, B, x0, 96, dw, px, h, ins);

      /* --- dolna połowa: CDC --- */
      this.rowTitle(ctx, 40, 250, 'CHUNKI (CDC)', 'content-defined', C.save,
        'granice zależą od treści');
      this.cdcRow(ctx, A, B, x0, 254, dw, px, h, ins);

      /* --- legenda + wniosek --- */
      D.box(ctx, 40, 396, W - 66, 40, { r: 9, fill: C.panel, stroke: C.line });
      const good = ins ? D.span(t, 0.62, 0.8) : 0;
      D.text(ctx,
        ins
          ? 'Po wstawieniu 3 bajtów: podział stały nie znalazł ' + this.missCountFixed(A, B) +
            ' pasujących bloków. CDC zgubił ' + this.missCountCdc(A, B) + ' chunk(i) i dalej znów trafiał w indeks.'
          : 'Ten sam plik, inny podział. Za chwilę wstawimy 3 bajty w połowie pliku.',
        56, 416, { size: 12.5, color: ins ? D.mix(C.muted, C.save, good) : C.muted, baseline: 'middle' });
    },

    rowTitle: function (ctx, x, y, name, en, color, note) {
      D.text(ctx, name, x, y, { size: 13, weight: 800, color });
      D.text(ctx, en, x, y + 18, { size: 11, color: C.dim, mono: true });
      D.text(ctx, note, x, y + 38, { size: 10.5, color: C.dim });
    },

    fixedRow: function (ctx, A, B, x0, y, dw, px, h, ins) {
      const BS = 10;                              // blok 10 B
      const aCut = [], bCut = [];
      for (let i = 0; i < A.length; i += BS) aCut.push(i);
      aCut.push(A.length);
      for (let i = 0; i < B.length; i += BS) bCut.push(i);
      bCut.push(B.length);

      D.text(ctx, 'przed (A)', x0, y - 8, { size: 10, color: C.dim });
      for (let i = 0; i < aCut.length - 1; i++) {
        const s = aCut[i], e = aCut[i + 1];
        D.boxSides(ctx, x0 + s * px, y, (e - s) * px - 1.5, h, 3, 'tlbr',
          { fill: D.alpha(C.info, 0.16), stroke: D.alpha(C.info, 0.45), lw: 1 });
      }
      D.text(ctx, 'po (B)', x0, y + h + 16, { size: 10, color: C.dim });
      for (let i = 0; i < bCut.length - 1; i++) {
        const s = bCut[i], e = bCut[i + 1];
        const same = i < 10;
        const col = same ? C.save : C.bad;
        D.boxSides(ctx, x0 + s * px, y + h + 24, (e - s) * px - 1.5, h, 3, 'tlbr', {
          fill: D.alpha(col, 0.16), stroke: D.alpha(col, 0.5), lw: 1
        });
      }
      if (ins) {
        D.arrow(ctx, 100 * px, y + 2 * h + 34, 103 * px, y + 2 * h + 34,
          { color: C.bad, lw: 1.5, head: 5 });
        D.text(ctx, 'od tego miejsca nic już nie pasuje', x0 + dw, y + 2 * h + 52, {
          size: 10.5, color: C.bad, align: 'right'
        });
      } else {
        D.text(ctx, 'wygląda identycznie — dopóki plik się nie zmieni', x0 + dw, y + 2 * h + 52, {
          size: 10.5, color: C.dim, align: 'right'
        });
      }
    },

    cdcRow: function (ctx, A, B, x0, y, dw, px, h, ins) {
      const ca = cdcCuts(A, MASK), cb = cdcCuts(B, MASK);
      const chunksA = [], chunksB = [];
      for (let i = 0; i < ca.length - 1; i++) chunksA.push(A.slice(ca[i], ca[i + 1]));
      for (let i = 0; i < cb.length - 1; i++) chunksB.push(B.slice(cb[i], cb[i + 1]));

      D.text(ctx, 'przed (A)', x0, y - 8, { size: 10, color: C.dim });
      let offA = 0;
      chunksA.forEach(c => {
        D.boxSides(ctx, x0 + offA * px, y, c.length * px - 2, h, 3, 'tlbr',
          { fill: D.alpha(C.info, 0.16), stroke: D.alpha(C.info, 0.45), lw: 1 });
        offA += c.length;
      });
      D.text(ctx, 'po (B)', x0, y + h + 16, { size: 10, color: C.dim });
      let off = 0;
      const setA = {};
      chunksA.forEach(c => { setA[c] = 1; });
      chunksB.forEach(c => {
        const isNew = !setA[c];
        const col = isNew ? C.fresh : C.save;
        D.boxSides(ctx, x0 + off * px, y + h + 24, c.length * px - 2, h, 3, 'tlbr', {
          fill: D.alpha(col, 0.18), stroke: D.alpha(col, 0.55), lw: 1
        });
        if (!isNew) {
          D.text(ctx, '↺', x0 + off * px + c.length * px / 2, y + h + 24 + h / 2, {
            size: 10, color: C.save, align: 'center', baseline: 'middle', weight: 700
          });
        }
        off += c.length;
      });
      if (ins) {
        D.arrow(ctx, 100 * px, y + 2 * h + 34, 103 * px, y + 2 * h + 34,
          { color: C.fresh, lw: 1.5, head: 5 });
        D.text(ctx, 'tylko 1–2 chunki do zapisania, reszta trafia w indeks', x0 + dw, y + 2 * h + 52, {
          size: 10.5, color: C.save, align: 'right'
        });
      } else {
        D.text(ctx, 'te same granice, bo zależą od treści', x0 + dw, y + 2 * h + 52, {
          size: 10.5, color: C.dim, align: 'right'
        });
      }
    },

    missCountFixed: function (A, B) {
      const BS = 10;
      let ok = 0, tot = 0;
      for (let i = 0; i < B.length; i += BS) {
        tot++;
        if (A.slice(i, i + BS) === B.slice(i, i + BS)) ok++;
      }
      return tot - ok;
    },
    missCountCdc: function (A, B) {
      const cb = cdcCuts(B, MASK);
      let off = 0, miss = 0;
      for (let i = 0; i < cb.length - 1; i++) {
        const c = B.slice(cb[i], cb[i + 1]);
        if (A.indexOf(c) < 0) miss++;
        off += c.length;
      }
      return miss;
    }
  });

  /* ------------------------------------------------------------------
     2. gear-hash — jak powstaje punkt podziału
     ------------------------------------------------------------------ */
  D.scene('gear-hash', {
    title: 'Gear hash',
    duration: 5.0,
    controls: [{ type: 'range', key: 'bits', label: 'Maska', min: 2, max: 5, step: 1, value: 3 }],

    draw: function (ctx, t, p) {
      const W = 800, H = 450;
      const bytes = DATA.slice(0, 26);
      const mask = (1 << p.bits) - 1;
      const step = Math.max(1, Math.floor(D.span(t, 0.08, 0.85) * bytes.length));

      D.sceneTitle(ctx, 'h = (h << 1) + G[bajt]   —   punkt podziału, gdy (h & maska) == 0', W, C.muted);

      /* --- bajty --- */
      const bx = 46, by = 92, bw = 26, bh = 34;
      for (let i = 0; i < bytes.length; i++) {
        const cur = i === step - 1;
        const visited = i < step;
        D.box(ctx, bx + i * bw, by, bw - 3, bh, {
          r: 4,
          fill: cur ? D.alpha(C.ref, 0.35) : visited ? D.alpha(C.info, 0.14) : '#131c31',
          stroke: cur ? C.ref : visited ? D.alpha(C.info, 0.4) : '#1e2846',
          lw: cur ? 2 : 1
        });
        D.text(ctx, bytes[i], bx + i * bw + (bw - 3) / 2, by + bh / 2, {
          size: 13, weight: 700, mono: true, align: 'center', baseline: 'middle',
          color: cur ? C.ref : visited ? C.text : C.dim
        });
      }
      D.text(ctx, 'bajty pliku', bx, by - 14, { size: 11, color: C.dim, weight: 700 });
      D.text(ctx, 'przesuwamy okno', bx + bytes.length * bw - 6, by - 14, {
        size: 11, color: C.ref, align: 'right'
      });

      /* --- wartości h i test maski --- */
      const h = D.roll(bytes.slice(0, step), 0);
      const hit = (h & mask) === 0;

      const panelY = 160;
      D.box(ctx, 46, panelY, W - 92, 104, { r: 10, fill: C.panel, stroke: C.line });
      D.text(ctx, 'stan hasha po ' + step + ' bajtach', 66, panelY + 24, { size: 11, color: C.dim, weight: 700 });
      D.box(ctx, 66, panelY + 36, 232, 38, { r: 7, fill: '#0d1526', stroke: hit ? C.save : C.line });
      D.text(ctx, 'h = 0x' + h.toString(16).padStart(8, '0'), 78, panelY + 55, {
        size: 17, color: hit ? C.save : C.text, weight: 700, mono: true, baseline: 'middle'
      });

      // maska: bity hasza sprawdzane przez warunek
      const mx = 350, my = panelY + 34, bw2 = 26;
      D.text(ctx, 'dolne ' + p.bits + ' bity hasza', mx, panelY + 24, { size: 11, color: C.dim, weight: 700 });
      for (let b = 0; b < p.bits; b++) {
        const bit = (h >> b) & 1;
        const col = bit ? C.bad : C.save;
        D.box(ctx, mx + (p.bits - 1 - b) * bw2, my, bw2 - 4, 28, {
          r: 4, fill: D.alpha(col, 0.2), stroke: col, lw: 1
        });
        D.text(ctx, bit + '', mx + (p.bits - 1 - b) * bw2 + (bw2 - 4) / 2, my + 14, {
          size: 13, weight: 800, mono: true, align: 'center', baseline: 'middle', color: col
        });
        D.text(ctx, '2^' + b, mx + (p.bits - 1 - b) * bw2 + (bw2 - 4) / 2, my + 40, {
          size: 9, color: C.dim, align: 'center'
        });
      }
      D.text(ctx, hit ? 'wszystkie zera  →  punkt podziału!' : 'nie-zero  →  skanujemy dalej',
        mx + p.bits * bw2 + 24, my + 14, {
        size: 13, weight: 700, color: hit ? C.save : C.muted, baseline: 'middle'
      });
      D.text(ctx, 'prawdopodobieństwo: 1 / 2^' + p.bits + ' ≈ 1 / ' + (1 << p.bits),
        mx + p.bits * bw2 + 24, my + 34, { size: 10.5, color: C.dim });

      /* --- powstawanie chunków w oknie --- */
      const cy = 302;
      D.text(ctx, 'chunki w tym oknie:', 46, cy - 12, { size: 11, color: C.dim, weight: 700 });
      const cuts = [0].concat(cdcCuts(bytes, mask).filter(c => c > 0 && c < bytes.length));
      cuts.push(bytes.length);
      const px = (W - 92) / bytes.length;
      for (let i = 0; i < cuts.length - 1; i++) {
        const s = cuts[i], e = cuts[i + 1];
        const done = e <= step;
        const col = done ? C.dupe : C.line;
        D.boxSides(ctx, 46 + s * px, cy, (e - s) * px - 2, 32, 4, 'tlbr', {
          fill: done ? D.alpha(col, 0.2) : '#131c31', stroke: done ? D.alpha(col, 0.55) : '#1e2846', lw: 1
        });
        const label = (e - s) + ' B';
        if ((e - s) * px > 34) {
          D.text(ctx, label, 46 + (s + e) / 2 * px, cy + 16, {
            size: 10, color: done ? C.dupe : C.dim, align: 'center', baseline: 'middle', mono: true
          });
        }
        if (i < cuts.length - 1) {
          D.line(ctx, 46 + e * px - 1, cy - 4, 46 + e * px - 1, cy + 36, { color: C.save, lw: 1.5 });
        }
      }

      D.box(ctx, 46, 356, W - 92, 68, { r: 9, fill: D.alpha(C.info, 0.07), stroke: D.alpha(C.info, 0.3) });
      D.wrap(ctx, 'Gear hash to przesunięcie i dodanie wartości z tabeli. Nie ma tu magii — jest tylko fakt, że niskie bity hasha zmieniają się przy każdym nowym bajcie, więc warunek „co 2ⁿ bajtów” spełnia się mniej więcej co 2ⁿ bajtów. Stąd nazwa content-defined: granica wynika z treści, a nie z adresu.',
        62, 372, W - 124, 19, { size: 12.5, color: C.muted });
    }
  });


  /* ------------------------------------------------------------------
     3. fastcdc-masks — zależność maski od rozmiaru chunków (interaktywna)
     ------------------------------------------------------------------ */
  D.scene('fastcdc-masks', {
    title: 'FastCDC: maski S / A / L i rozmiary chunków',
    duration: 6.0,
    controls: [
      { type: 'toggle', key: 'sweep', label: 'Auto: przesuwaj maskę', value: true },
      { type: 'range', key: 'bits', label: 'Maska', min: 5, max: 9, step: 1, value: 6, off: 'sweep' }
    ],

    draw: function (ctx, t, p) {
      const W = 800, H = 450;
      const bits = p.sweep ? Math.round(D.lerp(5, 9, D.span(t, 0.05, 0.75, D.easeInOut))) : p.bits;
      const avg = Math.pow(2, bits);
      const minS = Math.max(1, Math.floor(avg / 4));
      const maxS = avg * 8;

      D.sceneTitle(ctx, 'FastCDC: średni chunk = 2ⁿ B; maska zmienia się przy progu średniej', W, C.muted);

      /* --- suwak wizualny --- */
      const sx = 46, sy = 62, sw = W - 92;
      D.line(ctx, sx, sy, sx + sw, sy, { color: C.line, lw: 4 });
      for (let b = 5; b <= 9; b++) {
        const x = sx + sw * (b - 5) / 4;
        const on = b === bits;
        ctx.beginPath(); ctx.arc(x, sy, on ? 9 : 4, 0, Math.PI * 2);
        ctx.fillStyle = on ? C.ref : C.panel2; ctx.fill();
        ctx.strokeStyle = on ? C.ref : C.line; ctx.lineWidth = 2; ctx.stroke();
        D.text(ctx, (1 << b) + ' B', x, sy + 22, { size: 9.5, color: on ? C.text : C.dim, align: 'center' });
      }
      D.text(ctx, 'maska ' + bits + ' bitów  →  średni chunk ' + avg + ' B', sx, sy - 18, {
        size: 13, color: C.ref, weight: 700
      });

      /* --- podział pliku z Normalized Chunking (Min/Mid/Max) --- */
      const data = D.makeData(5, 4000);
      const cuts = D.fastCdcCuts(data, bits, minS, avg, maxS);
      const sizes = [];
      for (let i = 0; i < cuts.length - 1; i++) sizes.push(cuts[i + 1] - cuts[i]);

      const y0 = 116, h = 30, dw = W - 92;
      const reveal = D.span(t, 0.1, 0.55);
      D.text(ctx, 'chunki (Min = ¼ średniej, Max = 8× średniej)', 46, y0 - 12, {
        size: 11, color: C.dim, weight: 700
      });
      const shown = Math.floor(sizes.length * reveal) + 1;
      for (let i = 0; i < shown; i++) {
        const s = sizes[i];
        const x = 46 + cuts[i] / data.length * dw;
        const w = s / data.length * dw;
        const clipped = Math.max(2, Math.min(w - 1.5, w));
        D.boxSides(ctx, x, y0, clipped, h, 3, 'tlbr', {
          fill: D.alpha(C.dupe, 0.2), stroke: D.alpha(C.dupe, 0.5), lw: 1
        });
      }
      // wstawiony baj, który psuje podział
      const insX = 46 + (2000 / data.length) * dw;
      D.line(ctx, insX, y0 - 4, insX, y0 + h + 4, { color: C.bad, lw: 1.5, dash: [3, 3] });
      D.pill(ctx, 'wstawiony baj', insX, y0 + h / 2 - 10, {
        align: 'center', fill: D.alpha(C.bad, 0.22), stroke: C.bad, color: C.bad, size: 9.5, h: 20
      });

      /* --- histogram rozmiarów --- */
      const hx = 46, hy = 190, hw = 420, hh = 96;
      D.box(ctx, hx, hy, hw, hh, { r: 8, fill: C.panel, stroke: C.line });
      D.text(ctx, 'rozkład rozmiarów chunków', hx + 12, hy + 18, { size: 10.5, color: C.dim, weight: 700 });
      const bins = 14, maxSeen = Math.max(1, Math.max.apply(null, sizes));
      const maxBin = maxSeen * 1.05;
      const hist = new Array(bins).fill(0);
      sizes.forEach(s => {
        const k = Math.min(bins - 1, Math.floor(s / maxBin * bins));
        hist[k]++;
      });
      const hmax = Math.max(1, Math.max.apply(null, hist));
      const bwB = (hw - 30) / bins;
      hist.forEach((v, i) => {
        const bh = (v / hmax) * (hh - 48);
        D.box(ctx, hx + 15 + i * bwB + 1, hy + hh - 16 - bh, bwB - 2, bh, {
          r: 2, fill: D.alpha(C.info, 0.55), stroke: D.alpha(C.info, 0.8), lw: 0.8
        });
      });
      D.text(ctx, Math.min(minS, maxBin) + ' B', hx + 15, hy + hh - 4, { size: 9, color: C.dim });
      D.text(ctx, maxSeen + ' B (max w tej próbie)', hx + hw - 15, hy + hh - 4, { size: 9, color: C.dim, align: 'right' });

      /* --- skutki: dedup ratio i przepustowość --- */
      const px2 = hx + hw + 24, pw = W - px2 - 46;
      const ratio = 7.4 - (bits - 5) * 0.85;
      const thr = 0.34 + (bits - 5) * 0.14;
      D.box(ctx, px2, hy, pw, hh, { r: 8, fill: C.panel, stroke: C.line });
      this.metric(ctx, px2 + 14, hy + 24, 'dedup ratio', ratio.toFixed(1) + ' : 1', ratio / 9, C.save);
      this.metric(ctx, px2 + 14, hy + 66, 'przepustowość', (thr * 100).toFixed(0) + ' %', thr, C.info);

      D.box(ctx, 46, 306, W - 92, 74, { r: 9, fill: C.panel, stroke: C.line });
      D.wrap(ctx, 'Normalized Chunking używa trzech masek: MaskS (15 bitów) przed progiem średniej — trudniej ciąć, MaskA (13 bitów) jako maska domyślna, MaskL (11 bitów) po progu — łatwiej ciąć. Większe chunki to mniej wpisów w indeksie i lepsza przepustowość, ale po wstawieniu bajta tracisz cały chunk.',
        62, 326, W - 124, 19, { size: 12.5, color: C.muted });

      const leg = [
        { m: 'MaskS', b: 15, c: C.ref, d: 'przed avg' },
        { m: 'MaskA', b: 13, c: C.info, d: 'domyślna' },
        { m: 'MaskL', b: 11, c: C.dupe, d: 'po avg' }
      ];
      leg.forEach((l, i) => {
        D.pill(ctx, l.m + ' · ' + l.b + ' bitów', 46 + i * 132, 388, {
          fill: D.alpha(l.c, 0.14), stroke: D.alpha(l.c, 0.45), color: l.c, size: 10.5, h: 20
        });
        D.text(ctx, l.d, 46 + i * 132 + 96, 398, { size: 10, color: C.dim, baseline: 'middle' });
      });
      D.text(ctx, 'Wykresy poglądowe — liczby ilustrują zależność, nie konkretny benchmark z książki.',
        46, 424, { size: 10, color: C.dim });
      D.sceneFoot(ctx, 'rozdział 3.3 · FastCDC (ATC\'16)', W, H, C.dim);
    },

    metric: function (ctx, x, y, label, value, v, color) {
      D.text(ctx, label, x, y, { size: 10.5, color: C.dim });
      D.text(ctx, value, x + pw(v), y, { size: 15, color, weight: 700, align: 'right' });
      D.bar(ctx, x, y + 8, pw(v), 8, D.clamp(v, 0, 1), { fill: color, bg: '#1b2440' });
      function pw() { return 200; }
    }
  });

  /* ------------------------------------------------------------------
     4. cutpoint-skip — ile bajtów trzeba zhaszować
     ------------------------------------------------------------------ */
  D.scene('cutpoint-skip', {
    title: 'Cut point skipping',
    duration: 5.2,

    draw: function (ctx, t, p) {
      const W = 800, H = 450;
      void p;
      D.sceneTitle(ctx, 'Ile bajtów musi przejrzeć chunker, żeby znaleźć granice?', W, C.muted);

      const data = D.makeData(9, 256);
      const minS = 64, total = 256, MASKB = 127;

      /* --- plan skanowania: pozycje haszowane i przeskoczone --- */
      const hashed = [];
      let h = 0;
      for (let x = 0; x < minS; x++) h = ((h << 1) + D.gearVal(data.charCodeAt(x))) >>> 0;
      let x = minS;
      while (x < 255) {
        hashed.push(x);
        x++;
        h = ((h << 1) + D.gearVal(data.charCodeAt(x - 1))) >>> 0;
        if ((h & MASKB) === 0) break;                       // punkt podziału
      }
      const cutX = x;
      const classic = cutX;                               // gear CDC haszuje wszystko
      const fast = minS + hashed.length;                  // AE/FastCDC: próg + reszta

      /* --- skanowanie --- */
      const x0 = 46, y0 = 100, dw = W - 92, dh = 40;
      D.text(ctx, 'chunk', x0, y0 - 12, { size: 11, color: C.dim, weight: 700 });

      const prog = D.span(t, 0.06, 0.66);
      const upto = Math.floor(prog * cutX);
      const u = (1 / total) * dw;

      D.box(ctx, x0, y0, dw, dh, { r: 5, fill: '#131c31', stroke: '#1e2846' });

      const skipW = (minS / total) * dw;
      D.box(ctx, x0, y0, skipW, dh, { r: 5, fill: D.alpha(C.ref, 0.16), stroke: D.alpha(C.ref, 0.5) });
      D.text(ctx, 'nie haszujemy ' + minS + ' B', x0 + skipW / 2, y0 + dh / 2, {
        size: 10, color: C.ref, align: 'center', baseline: 'middle'
      });

      for (let i = 0; i < hashed.length; i++) {
        if (hashed[i] > upto) break;
        D.box(ctx, x0 + hashed[i] * u, y0 + 6, Math.max(1.6, u - 0.6), dh - 12, {
          r: 1, fill: D.alpha(C.info, 0.9)
        });
      }
      D.line(ctx, x0 + upto * u, y0 - 6, x0 + upto * u, y0 + dh + 6,
        { color: C.ref, lw: 1.5, dash: [3, 3] });

      if (prog > 0.93) {
        const cx = x0 + (cutX / total) * dw;
        D.line(ctx, cx, y0 - 8, cx, y0 + dh + 8, { color: C.save, lw: 2.5 });
        D.pill(ctx, 'punkt podziału', cx, y0 + dh + 12, {
          align: 'center', fill: D.alpha(C.save, 0.2), stroke: C.save, color: C.save, size: 10, h: 20
        });
      }

      /* --- porównanie kosztu --- */
      const cy = 196;
      D.box(ctx, 46, cy, W - 92, 124, { r: 10, fill: C.panel, stroke: C.line });
      const rows = [
        { n: 'klasyczny gear CDC', h: 'hashuje każdy bajt chunka', v: 1, l: '100 %', c: C.bad },
        { n: 'AE / FastCDC', h: 'pomija pierwsze ' + minS + ' B (próg Min)', v: fast / classic, l: Math.round(fast / classic * 100) + ' %', c: C.save }
      ];
      rows.forEach((r, i) => {
        const y = cy + 28 + i * 44;
        D.text(ctx, r.n, 66, y, { size: 12.5, weight: 700, color: r.c, baseline: 'middle' });
        D.text(ctx, r.h, 66, y + 17, { size: 10.5, color: C.dim });
        D.bar(ctx, 268, y - 7, 290, 16, r.v, { fill: r.c, bg: '#1b2440' });
        D.text(ctx, r.l, 578, y + 1, { size: 13, color: r.c, weight: 800, baseline: 'middle', align: 'right' });
        D.text(ctx, 'bajtów haszowanych', 660, y + 1, { size: 11, color: C.dim, baseline: 'middle' });
      });
      D.pill(ctx, '≈ ' + Math.round(classic / fast) + '× mniej pracy CPU', 66, cy + 94, {
        fill: D.alpha(C.save, 0.16), stroke: C.save, color: C.save, size: 12
      });
      D.text(ctx, 'koszt: nieco większe chunki → nieco mniejsze dedup ratio', 250, cy + 103, {
        size: 11.5, color: C.muted
      });

      D.box(ctx, 46, 342, W - 92, 72, { r: 9, fill: D.alpha(C.info, 0.07), stroke: D.alpha(C.info, 0.3) });
      D.wrap(ctx, 'Chunker jest zwykle wąskim gardłem: przebiega przez każdy bajt, zanim cokolwiek trafi do indeksu. Pomysł jest prosty — nie szukaj punktu podziału w pierwszych kilkudziesięciu bajtach chunka, bo i tak są zbyt krótkie. Liczy się to, gdy chunki mają kilka KB.',
        62, 360, W - 124, 19, { size: 12.5, color: C.muted });
    }
  });

})(window.DECK);
