/* ch5.js — Rozdział 5: rewriting (HAR, CABdedup) */

(function (D) {
  const C = D.C;

  /* ------------------------------------------------------------------
     1. fragmentation — śmieci po usunięciu i nadpisaniu chunków
     ------------------------------------------------------------------ */
  D.scene('fragmentation', {
    title: 'Fragmentacja',
    duration: 5.6,
    controls: [{ type: 'button', label: '↻ Odtwórz', action: 'replay' }],

    draw: function (ctx, t, p) {
      const W = 800, H = 450;
      void p;
      D.sceneTitle(ctx, 'Po serii backupów w kontenerach zostają dziury', W, C.muted);

      const cells = 16;                          // komórek w kontenerze
      const cw = 34, chh = 30, gap = 3;

      // stan 1: pełny kontener
      const st1 = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10', 'a11', 'a12', 'a13', 'a14', 'a15', 'a16'];

      // stan 2: po usunięciu plików + nadpisaniu kilku chunków
      const dead = new Set(['a2', 'a7', 'a11', 'a15']);
      const changed = new Set(['a4', 'a9']);

      // stan 3: po garbage collection
      const alive = st1.filter(c => !dead.has(c));

      const draw = (y, label, state, opt) => {
        D.text(ctx, label, 46, y + (chh * Math.ceil(cells / 8) + gap * 2) / 2, {
          size: 12, color: opt.lc, weight: 700, baseline: 'middle'
        });
        for (let i = 0; i < state.length; i++) {
          const cx = 150 + (i % 8) * (cw + gap);
          const cy = y + ((i / 8) | 0) * (chh + gap);
          const deadC = dead.has(state[i]) && !opt.collected;
          const ch = changed.has(state[i]) && !opt.collected;
          const col = deadC ? C.dim : ch ? C.fresh : C.dupe;
          D.box(ctx, cx, cy, cw, chh, {
            r: 4,
            fill: deadC ? '#0f1526' : D.alpha(col, opt.moved ? 0.3 : 0.2),
            stroke: deadC ? '#1d2740' : D.alpha(col, 0.55), lw: 1
          });
          D.text(ctx, deadC ? '·' : state[i].slice(1), cx + cw / 2, cy + chh / 2, {
            size: 10, color: deadC ? '#2f3d5c' : col, align: 'center', baseline: 'middle', mono: true
          });
        }
      };

      const a1 = D.span(t, 0.05, 0.2), a2 = D.span(t, 0.3, 0.5), a3 = D.span(t, 0.62, 0.85);
      draw(80, '1. po zapisie', st1, { lc: C.muted, collected: false, moved: false });
      draw(196, '2. po usunięciu', st1, { lc: C.muted, collected: false, moved: false });
      draw(312, '3. po GC', alive, { lc: C.save, collected: true, moved: false });

      // efekty usunięcia w środkowym kontenerze
      ['a2', 'a7', 'a11', 'a15'].forEach((c, k) => {
        const i = st1.indexOf(c);
        const cx = 150 + (i % 8) * (cw + gap) + cw / 2;
        const cy = 196 + ((i / 8) | 0) * (chh + gap) + chh / 2;
        const g = D.easeInOut(D.span(t, 0.34 + k * 0.03, 0.52 + k * 0.03));
        D.text(ctx, '✕', cx, cy, { size: 12, color: D.mix('#2f3d5c', C.bad, g), align: 'center', baseline: 'middle', weight: 700 });
      });
      ['a4', 'a9'].forEach((c, k) => {
        const i = st1.indexOf(c);
        const cx = 150 + (i % 8) * (cw + gap) + cw / 2;
        const cy = 196 + ((i / 8) | 0) * (chh + gap) + chh / 2;
        const g = D.easeInOut(D.span(t, 0.4 + k * 0.04, 0.58 + k * 0.04));
        D.box(ctx, cx - 1, cy - 1, 2, 2, { r: 1, fill: C.fresh, alpha: g });
        D.text(ctx, '↻', cx, cy, { size: 11, color: D.mix(C.dupe, C.fresh, g), align: 'center', baseline: 'middle', weight: 700 });
      });

      // strzałki między kontenerami
      [1, 2].forEach(i => {
        const g = D.easeInOut(D.span(t, 0.28 + i * 0.3, 0.5 + i * 0.3));
        D.arrow(ctx, 96, 80 + i * 116 + 56, 96, 80 + i * 116 + 116 - 8, {
          color: D.alpha(C.line, g), lw: 2, head: 6
        });
      });

      /* --- liczby --- */
      D.box(ctx, 46, 412, W - 92, 32, { r: 8, fill: C.panel, stroke: C.line });
      const waste = Math.round((st1.length - alive.length) / st1.length * 100);
      D.text(ctx, 'kontener 2: ' + (st1.length - alive.length) + ' martwych chunków = ' + waste +
        '% zmarnowanego miejsca. GC je usuwa, ale kosztem odczytów i zapisów.',
        62, 428, { size: 12, color: D.mix(C.muted, C.ref, a3), baseline: 'middle' });
      void a1; void a2;
    }
  });

  /* ------------------------------------------------------------------
     2. har-rewrite — HAR: duplikaty wracają tam, gdzie były wczoraj
        (opiera się na wiedzy z poprzedniego backupu, nie na „gorącości” danych)
     ------------------------------------------------------------------ */
  D.scene('har-rewrite', {
    title: 'HAR — dziedziczenie rzadkich kontenerów',
    duration: 6.6,
    controls: [{ type: 'button', label: '↻ Odtwórz', action: 'replay' }],

    draw: function (ctx, t, p) {
      const W = 800, H = 450;
      void p;
      D.sceneTitle(ctx, 'Poprzedni backup wie, w których kontenerach są te chunki', W, C.muted);

      /* --- pliki A (wczoraj) i B (dziś) --- */
      const chunkW = 30, chunkH = 24, gap = 4;
      const files = [
        { n: 'plik A (wczoraj)', y: 92, diff: 0, c: C.fresh },
        { n: 'plik B (dziś)', y: 132, diff: 3, c: C.info }
      ];
      const NW = 12;
      files.forEach(f => {
        D.text(ctx, f.n, 46, f.y + chunkH / 2, { size: 11, weight: 700, color: f.c, baseline: 'middle' });
        for (let i = 0; i < NW; i++) {
          const x = 168 + i * (chunkW + gap);
          const changed = i >= NW - f.diff;
          D.box(ctx, x, f.y, chunkW, chunkH, {
            r: 3, fill: D.alpha(changed ? C.ref : C.dupe, 0.18), stroke: D.alpha(changed ? C.ref : C.dupe, 0.5), lw: 1
          });
          D.text(ctx, 'k' + (i + 1), x + chunkW / 2, f.y + chunkH / 2, {
            size: 8.5, color: changed ? C.ref : C.dupe, align: 'center', baseline: 'middle', mono: true
          });
        }
      });

      /* --- kontenery --- */
      const contY = 210, contW = 132, contH = 92, contX = [46, 190, 334, 478, 622];
      const sparse = 1;                                   // C2 to kontener rzadki
      const conts = [
        { n: 'C1', live: 6, dead: 0 },
        { n: 'C2', live: 2, dead: 4, sparse: true },
        { n: 'C3', live: 5, dead: 1 },
        { n: 'C4', live: 4, dead: 2 }
      ];
      conts.forEach((cn, i) => {
        const x = contX[i];
        const active = D.easeInOut(D.span(t, 0.12 + i * 0.06, 0.3 + i * 0.06));
        D.box(ctx, x, contY, contW, contH, {
          r: 8, fill: C.panel, stroke: D.alpha(cn.sparse ? C.ref : C.line, 0.5 + 0.5 * active), lw: 1.2
        });
        D.text(ctx, cn.n, x + 10, contY + 16, { size: 11, weight: 700, color: C.muted });
        // komórki: martwe (przerywane) i żywe
        const cells = 6;
        for (let c = 0; c < cells; c++) {
          const isDead = cn.sparse ? c < 4 : c >= 6 - Math.round(cn.live / 2);
          const cx = x + 9 + (c % 3) * 39;
          const cy = contY + 30 + ((c / 3) | 0) * 24;
          D.box(ctx, cx, cy, 33, 18, {
            r: 3,
            fill: isDead ? '#0f1526' : D.alpha(C.dupe, 0.22),
            stroke: isDead ? '#1d2740' : D.alpha(C.dupe, 0.5), lw: 1
          });
          if (isDead) {
            D.text(ctx, '✕', cx + 16, cy + 9, { size: 9, color: '#2f3d5c', align: 'center', baseline: 'middle' });
          }
        }
        if (cn.sparse) {
          D.pill(ctx, 'rzadki', x + contW - 52, contY + 7, {
            fill: D.alpha(C.ref, 0.18), stroke: C.ref, color: C.ref, size: 9.5, h: 18
          });
        }
        D.text(ctx, cn.live + '/' + (cn.live + cn.dead) + ' żywych', x + 10, contY + contH - 12, {
          size: 9.5, color: C.dim
        });
      });
      void sparse;

      // C5 — nowy kontener na duplikaty z pliku B
      const newC = D.easeInOut(D.span(t, 0.55, 0.75));
      D.box(ctx, contX[3], contY, contW, contH, { r: 8, fill: D.panel, stroke: C.line, lw: 1.2 });
      D.text(ctx, 'C5', contX[3] + 10, contY + 16, { size: 11, weight: 700, color: C.muted });
      for (let c = 0; c < 3; c++) {
        const cx = contX[3] + 10 + c * 44;
        const on = D.clamp(newC * 3 - c, 0, 1);
        D.box(ctx, cx, contY + 30, 38, 18, {
          r: 3, fill: D.alpha(C.ref, 0.1 + 0.25 * on), stroke: D.alpha(C.ref, 0.3 + 0.5 * on), lw: 1
        });
        if (on > 0.4) {
          D.text(ctx, 'nowy', cx + 19, contY + 39, {
            size: 7.5, color: C.ref, align: 'center', baseline: 'middle'
          });
        }
      }
      D.text(ctx, 'nowe chunki', contX[3] + 10, contY + contH - 12, { size: 9.5, color: C.dim });
      // kontener C4 przesunięty, żeby zrobić miejsce dla C5
      void contX[3];

      /* --- strzałki: duplikaty z B lecą do C2 --- */
      const actArrow = D.easeInOut(D.span(t, 0.3, 0.55));
      for (let i = 0; i < 9; i++) {
        const sx = 168 + i * (chunkW + gap) + chunkW / 2;
        const tx = contX[1] + 9 + (i % 3) * 39 + 16;
        const ty = contY + 39 + (((i / 3) | 0) % 2) * 24;
        D.arrow(ctx, sx, 160, tx, ty, {
          color: D.alpha(C.dupe, actArrow * (0.35 + 0.35 * (i % 3) / 2)), lw: 1, head: 4
        });
      }

      /* --- trzy elementy HAR --- */
      const ideas = [
        { n: 'dziedziczenie rzadkich kontenerów', d: 'duplikaty wracają tam, gdzie były w poprzednim backupie', c: C.ref },
        { n: 'CMA — oczyszczanie kontenerów', d: 'martwe komórki znikają, zanim kontener zostanie zwolniony', c: C.violet },
        { n: 'wariant hybrydowy', d: 'część plików przepisujemy, część zostawiamy — zależnie od tego, co się opłaca', c: C.save }
      ];
      ideas.forEach((it, i) => {
        const y = 312 + i * 38;
        const a = D.easeInOut(D.span(t, 0.62 + i * 0.08, 0.8 + i * 0.08));
        D.box(ctx, 46, y, W - 92, 32, {
          r: 8, fill: D.alpha(it.c, 0.05 + 0.1 * a), stroke: D.alpha(it.c, 0.2 + 0.4 * a), lw: 1
        });
        D.boxSides(ctx, 46, y, 4, 32, 2, 'l', { fill: it.c });
        D.text(ctx, it.n, 58, y + 16, {
          size: 11, weight: 700, color: D.mix(C.dim, it.c, a), baseline: 'middle'
        });
        D.text(ctx, it.d, 288, y + 16, { size: 10.5, color: C.muted, baseline: 'middle' });
      });

      D.sceneFoot(ctx, 'rozdział 5.2 · HAR opiera się na poprzednim backupie, nie na statystyce odczytów', W, H, C.dim);
    }
  });

  /* ------------------------------------------------------------------
     3. cabdedup — CABdedupe: przyczynowość między plikami
     ------------------------------------------------------------------ */
  D.scene('cabdedup', {
    title: 'CABdedupe — przyczynowość',
    duration: 6.0,
    controls: [{ type: 'button', label: '↻ Odtwórz', action: 'replay' }],

    draw: function (ctx, t, p) {
      const W = 800, H = 450;
      void p;
      D.sceneTitle(ctx, 'Pliki w zbiorze backupu nie są niezależne — jedne są od pochodne innych', W, C.muted);

      const files = [
        { id: 'baza.sql', n: 'oryginał', c: C.fresh, x: 60, dup: 0.55, rel: null },
        { id: 'baza_kopia.sql', n: 'kopia 1:1', c: C.dupe, x: 320, dup: 0.98, rel: 0 },
        { id: 'raport.csv', n: 'inna rodzina', c: C.violet, x: 580, dup: 0.12, rel: null }
      ];

      D.text(ctx, 'pliki w zbiorze', 46, 90, { size: 11, color: C.dim, weight: 700 });
      files.forEach((f, i) => {
        const y = 104 + i * 66;
        const on = D.easeInOut(D.span(t, 0.08 + i * 0.1, 0.28 + i * 0.1));
        D.box(ctx, f.x, y, 170, 54, {
          r: 9, fill: D.alpha(f.c, 0.06 + 0.1 * on), stroke: D.alpha(f.c, 0.25 + 0.5 * on), lw: 1.2
        });
        D.text(ctx, f.id, f.x + 12, y + 20, { size: 12, weight: 700, color: f.c, baseline: 'middle' });
        D.text(ctx, f.n, f.x + 12, y + 36, { size: 10, color: C.dim });
        D.bar(ctx, f.x + 12, y + 44, 146, 5, f.dup, { fill: f.c, bg: '#1b2440' });
      });

      /* relacja przyczynowa */
      const aRel = D.easeInOut(D.span(t, 0.34, 0.55));
      D.arrow(ctx, 236, 168, 312, 168, { color: D.alpha(C.save, aRel), lw: 2, head: 7 });
      D.pill(ctx, 'kopia powstała z', 274, 136, {
        align: 'center', fill: D.alpha(C.save, 0.18 * aRel), stroke: D.alpha(C.save, 0.5 * aRel), color: C.save, size: 10, h: 20
      });
      D.text(ctx, 'system wykrywa zależność zamiast analizować oba pliki od zera',
        236, 202, { size: 10.5, color: D.mix(C.dim, C.text, aRel) });

      /* --- porównanie podejść --- */
      const cy = 306;
      D.box(ctx, 46, cy, W - 92, 84, { r: 10, fill: C.panel, stroke: C.line });
      const rows = [
        { n: 'każdy plik osobno', d: 'pełna analiza każdego pliku', v: 1, c: C.muted, l: '100 % pracy' },
        { n: 'z przyczynowością', d: 'plik powiązany dziedziczy wynik', v: 0.45, c: C.save, l: '≈ 45 % pracy' }
      ];
      rows.forEach((r, i) => {
        const y = cy + 24 + i * 34;
        const on = D.easeInOut(D.span(t, 0.5 + i * 0.12, 0.72 + i * 0.12));
        D.text(ctx, r.n, 66, y, { size: 12, weight: 700, color: D.mix(C.dim, r.c, on), baseline: 'middle' });
        D.text(ctx, r.d, 196, y, { size: 11, color: C.muted, baseline: 'middle' });
        D.bar(ctx, 470, y - 7, 170, 15, r.v, { fill: D.mix(C.dim, r.c, on), bg: '#1b2440' });
        D.text(ctx, r.l, 656, y, { size: 11.5, color: r.c, weight: 700, baseline: 'middle' });
      });

      D.text(ctx, 'Motywacją jest m.in. ruch w sieci: im mniej analizy i odczytów, tym mniej bajtów leci przez WAN.',
        46, 408, { size: 11.5, color: C.muted });
      D.sceneFoot(ctx, 'zadziała tylko tam, gdzie dane naprawdę mają strukturę', W, H, C.dim);
    }
  });

})(window.DECK);
