/* ch4.js — Rozdział 4: schematy indeksowania (Extreme Binning, SiLo) */

(function (D) {
  const C = D.C;

  /* ------------------------------------------------------------------
     1. index-bottleneck — indeks jest mały względem danych, ale losowy
     ------------------------------------------------------------------ */
  D.scene('index-bottleneck', {
    title: 'Indeks jako wąskie gardło',
    duration: 5.4,
    controls: [{ type: 'range', key: 'chunkKB', label: 'Chunk', min: 1, max: 64, step: 1, value: 4 }],

    draw: function (ctx, t, p) {
      const W = 800, H = 450;
      const chunkB = p.chunkKB * 1024;
      const dataTB = 1;
      const chunks = (dataTB * 1024 * 1024 * 1024 * 1024) / chunkB;
      const entryB = 24;                        // 16 B odcisk + 8 B lokalizacja
      const idxGB = chunks * entryB / 1e9;

      D.sceneTitle(ctx, '1 TB danych w chunkach po ' + p.chunkKB + ' KB — ile pamięci potrzebuje indeks', W, C.muted);

      /* --- lewo: słupki, skala log --- */
      const px0 = 46, py0 = 92, pw = 320, ph = 200;
      D.box(ctx, px0, py0, pw, ph, { r: 10, fill: C.panel, stroke: C.line });
      D.text(ctx, 'Indeks w RAM (GB)', px0 + 16, py0 + 24, { size: 11, color: C.dim, weight: 700 });
      const fmtGB = g => g >= 1024 ? (g / 1024).toFixed(1) + ' TB' : g.toFixed(g < 10 ? 1 : 0) + ' GB';
      const rows = [1, 10, 100, 1000].map(tb => ({ tb, gb: tb * chunks * entryB / 1e9 }));
      const maxGB = 1000 * chunks * entryB / 1e9;
      const barW = pw - 132;
      rows.forEach((r, i) => {
        const y = py0 + 46 + i * 36;
        const v = D.clamp(Math.log10(r.gb + 1) / Math.log10(maxGB + 1), 0, 1);
        D.text(ctx, r.tb + ' TB', px0 + 12, y + 9, { size: 11, color: C.muted, baseline: 'middle' });
        D.bar(ctx, px0 + 58, y + 1, barW, 17, v, { fill: C.violet, bg: '#1b2440' });
        D.text(ctx, fmtGB(r.gb), px0 + pw - 14, y + 9, {
          size: 11, color: C.violet, align: 'right', baseline: 'middle', weight: 700
        });
      });
      D.text(ctx, 'skala logarytmiczna', px0 + 16, py0 + ph - 16, { size: 10, color: C.dim });

      /* --- prawa: koszt odczytu --- */
      const rx = px0 + pw + 20, rw = W - rx - 34;
      D.box(ctx, rx, py0, rw, ph, { r: 10, fill: C.panel, stroke: C.line });
      D.text(ctx, 'Koszt jednego sprawdzenia duplikatu', rx + 16, py0 + 24, { size: 11, color: C.dim, weight: 700 });

      const costs = [
        { n: 'indeks w cache (32 MB)', v: 0.08, l: '≈ 5 ns', c: C.save },
        { n: 'indeks w RAM, poza cache', v: 1, l: '≈ 80 ns', c: C.bad }
      ];
      costs.forEach((r, i) => {
        const y = py0 + 52 + i * 46;
        D.text(ctx, r.n, rx + 16, y, { size: 12, color: C.text, baseline: 'middle' });
        D.bar(ctx, rx + 16, y + 10, rw - 120, 14, r.v, { fill: r.c, bg: '#1b2440' });
        D.text(ctx, r.l, rx + rw - 16, y + 17, { size: 12, color: r.c, weight: 700, align: 'right', baseline: 'middle' });
      });

      const thr = D.span(t, 0.15, 0.5);
      D.box(ctx, rx + 16, py0 + 148, rw - 32, 36, { r: 7, fill: D.alpha(C.info, 0.1), stroke: D.alpha(C.info, 0.3) });
      D.text(ctx, 'przepustowość dedupu spada wtedy z ~2 GB/s do ~200 MB/s',
        rx + 26, py0 + 166, { size: 11, color: D.mix(C.dim, C.info, thr), baseline: 'middle' });

      /* --- podsumowanie --- */
      const my = py0 + ph + 22;
      D.box(ctx, 46, my, W - 70, 54, { r: 9, fill: C.panel, stroke: C.line });
      D.text(ctx, 'Indeks to tylko ' + (entryB / chunkB * 100).toFixed(2) + '% objętości danych — ale każde sprawdzenie',
        62, my + 20, { size: 12.5, color: C.muted, baseline: 'middle' });
      D.text(ctx, 'jest losowym odczytem RAM. Dlatego rozdział 4 walczy o to, żeby indeks był mały i trafiał w cache.',
        62, my + 38, { size: 12.5, color: C.text, baseline: 'middle' });

      const chips = [
        { n: 'Extreme Binning', c: C.violet, d: 'mniej wpisów' },
        { n: 'SiLo', c: C.cyan, d: 'kolejność wg rozmiaru' },
        { n: 'Bloom / approximation', c: C.save, d: 'mniej sprawdzeń' }
      ];
      chips.forEach((c2, i) => {
        const act = D.easeInOut(D.span(t, 0.5 + i * 0.1, 0.72 + i * 0.1));
        D.pill(ctx, c2.n, 46 + i * 210, my + 70, {
          fill: D.alpha(c2.c2 || c2.c, 0.1 + 0.15 * act), stroke: D.alpha(c2.c, 0.3 + 0.5 * act), color: c2.c, size: 12
        });
        D.text(ctx, c2.d, 46 + i * 210, my + 100, { size: 10.5, color: C.dim });
      });

      D.sceneFoot(ctx, 'rozdział 4 · Extreme Binning, SiLo', W, H, C.dim);
    }
  });

  /* ------------------------------------------------------------------
     3. bloom-gate — tanie bramki przed dokładnym sprawdzeniem
     ------------------------------------------------------------------ */
  D.scene('bloom-gate', {
    title: 'Bloom filter jako bramka',
    duration: 5.6,
    controls: [{ type: 'button', label: '↻ Odtwórz', action: 'replay' }],

    draw: function (ctx, t, p) {
      const W = 800, H = 450;
      void p;
      D.sceneTitle(ctx, 'Najpierw tanio, potem dokładnie — i tylko czasem', W, C.muted);

      const N = 14;
      const dupe = [1, 4, 6, 9, 12];               // duplikaty (5 z 14)

      /* --- rząd chunków --- */
      const y0 = 108, cw = 46;
      D.text(ctx, 'chunki', 46, y0 - 14, { size: 11, color: C.dim, weight: 700 });
      for (let i = 0; i < N; i++) {
        const x = 46 + i * (cw + 6);
        const go = D.span(t, 0.08 + i * 0.03, 0.2 + i * 0.03);
        D.box(ctx, x, y0, cw, 30, {
          r: 4, fill: go > 0 ? D.alpha(C.info, 0.18) : '#131c31',
          stroke: go > 0 ? D.alpha(C.info, 0.5) : '#212c49', lw: 1
        });
        D.text(ctx, 'c' + (i + 1), x + cw / 2, y0 + 15, {
          size: 10, color: go > 0 ? C.info : C.dim, align: 'center', baseline: 'middle', mono: true
        });
      }

      /* --- bramka 1: Bloom --- */
      const b1 = 164;
      D.box(ctx, 46, b1, W - 92, 62, { r: 9, fill: C.panel, stroke: C.line });
      D.pill(ctx, '1', 62, b1 + 20, { fill: D.alpha(C.violet, 0.2), stroke: C.violet, color: C.violet, size: 11, h: 22, padX: 7 });
      D.text(ctx, 'Bloom filter mówi „nie ma takiego hasha” — bezpiecznie pomijamy', 100, b1 + 22, {
        size: 12.5, color: C.text, baseline: 'middle'
      });
      D.text(ctx, 'Nie ma fałszywych „nie ma” — fałszywe mogą być tylko „jest”.', 100, b1 + 42, {
        size: 11, color: C.dim
      });

      /* --- przepływ --- */
      const y2 = 254, py0 = 200;
      const passed = Math.floor(D.span(t, 0.25, 0.7) * N);
      let skip = 0;
      for (let i = 0; i < passed; i++) if (dupe.indexOf(i) < 0) skip++;

      // gałąź: "nie ma" → zapisujemy
      D.arrow(ctx, 120, b1 + 62, 120, y2, { color: D.alpha(C.save, D.span(t, 0.3, 0.5)), lw: 2, head: 6 });
      D.text(ctx, '„nie ma”', 130, b1 + 72, { size: 10.5, color: C.save });
      D.box(ctx, 46, y2, 150, 40, { r: 7, fill: D.alpha(C.save, 0.12), stroke: D.alpha(C.save, 0.45) });
      D.text(ctx, 'zapisujemy chunk', 121, y2 + 20, { size: 11.5, color: C.save, align: 'center', baseline: 'middle', weight: 600 });

      // gałąź: "jest" → pełne sprawdzenie
      D.arrow(ctx, 330, b1 + 62, 330, y2, { color: D.alpha(C.ref, D.span(t, 0.35, 0.55)), lw: 2, head: 6 });
      D.text(ctx, '„może jest”', 340, b1 + 72, { size: 10.5, color: C.ref });
      D.box(ctx, 250, y2, 160, 40, { r: 7, fill: D.alpha(C.ref, 0.12), stroke: D.alpha(C.ref, 0.45) });
      D.text(ctx, 'sprawdzamy pełny indeks', 330, y2 + 20, { size: 11.5, color: C.ref, align: 'center', baseline: 'middle', weight: 600 });

      D.arrow(ctx, 565, b1 + 62, 565, y2, { color: D.alpha(C.violet, D.span(t, 0.4, 0.6)), lw: 2, head: 6 });
      D.text(ctx, 'albo porównujemy pełne odciski', 575, b1 + 72, { size: 10.5, color: C.violet });
      D.box(ctx, 480, y2, 170, 40, { r: 7, fill: D.alpha(C.violet, 0.12), stroke: D.alpha(C.violet, 0.45) });
      D.text(ctx, 'kolidujący odcisk', 565, y2 + 20, { size: 11.5, color: C.violet, align: 'center', baseline: 'middle', weight: 600 });

      /* --- liczniki --- */
      D.box(ctx, 46, 326, W - 92, 60, { r: 9, fill: C.panel, stroke: C.line });
      const r1 = skip / N;
      D.text(ctx, 'pominięto pełne sprawdzenia: ' + skip + ' z ' + N + ' chunków', 64, 348, {
        size: 12.5, color: C.save, weight: 700, baseline: 'middle'
      });
      D.bar(ctx, 64, 362, W - 128, 12, r1, { fill: C.save, bg: '#1b2440' });
      D.text(ctx, Math.round(r1 * 100) + '% tanich decyzji zamiast kosztownych', W - 64, 348, {
        size: 11.5, color: C.dim, align: 'right', baseline: 'middle'
      });

      D.sceneFoot(ctx, 'tańszy warunek odfiltrowuje większość chunków, zanim dotkniemy indeksu', W, H, C.dim);
      void py0;
    }
  });

})(window.DECK);
