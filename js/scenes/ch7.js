/* ch7.js — Rozdział 7: delta compression po dedupie (Ddelta, DARE) */

(function (D) {
  const C = D.C;

  /* ------------------------------------------------------------------
     1. delta-encoding — jak zapisuje się różnicę
     ------------------------------------------------------------------ */
  D.scene('delta-encoding', {
    title: 'Delta encoding',
    duration: 5.6,
    controls: [{ type: 'button', label: '↻ Odtwórz', action: 'replay' }],

    draw: function (ctx, t, p) {
      const W = 800, H = 450;
      void p;
      D.sceneTitle(ctx, 'Podobne ≠ identyczne. Delta zapisuje tylko to, co się zmieniło.', W, C.muted);

      const base = 'raport sprzedazowy 2026';
      const mod = 'raport sprzedażowy 2026!';
      const x0 = 168, w = W - x0 - 40, chh = 32;

      // lista operacji: COPY + INS
      const ops = [];
      let i = 0;
      while (i < mod.length) {
        if (mod[i] === base[i]) {
          let j = i;
          while (j < mod.length && mod[j] === base[j]) j++;
          ops.push({ t: 'copy', len: j - i });
          i = j;
        } else {
          let j = i;
          while (j < mod.length && mod[j] !== base[j]) j++;
          ops.push({ t: 'ins', lit: mod.slice(i, j) });
          i = j;
        }
      }

      const drawStr = (y, str, col, label, hi) => {
        D.text(ctx, label, 46, y + chh / 2, { size: 11, color: C.dim, weight: 700, baseline: 'middle' });
        for (let k = 0; k < str.length; k++) {
          const x = x0 + k * (w / str.length);
          const bwid = w / str.length - 2;
          const changed = hi && hi.indexOf(k) >= 0;
          D.box(ctx, x, y, bwid, chh, {
            r: 3, fill: D.alpha(changed ? C.ref : col, changed ? 0.28 : 0.16),
            stroke: D.alpha(changed ? C.ref : col, changed ? 0.7 : 0.45), lw: changed ? 1.4 : 1
          });
          D.text(ctx, str[k], x + bwid / 2, y + chh / 2, {
            size: 11, color: changed ? C.ref : col, align: 'center', baseline: 'middle', mono: true,
            weight: changed ? 700 : 400
          });
        }
      };

      const changedIdx = [];
      for (let k = 0; k < mod.length; k++) if (mod[k] !== base[k]) changedIdx.push(k);

      drawStr(88, base, C.dupe, 'baza', null);
      drawStr(136, mod, C.dupe, 'nowa wersja', changedIdx);

      // instrukcje
      const oy = 198;
      D.text(ctx, 'instrukcje', 46, oy + chh / 2, { size: 11, color: C.dim, weight: 700, baseline: 'middle' });
      const bytes = ops.reduce((a, o) => a + (o.t === 'copy' ? 1 : 2 + o.lit.length), 0);
      let ox = x0;
      const totalW = ops.reduce((a, o) => a + (o.t === 'copy' ? 66 : 34 + o.lit.length * 9), 0) + (ops.length - 1) * 6;
      const scale = Math.min(1, (w) / totalW);
      ops.forEach((o, k) => {
        const label = o.t === 'copy' ? 'COPY(' + o.len + ')' : 'INS("' + o.lit + '")';
        const bw2 = Math.max(44, (o.t === 'copy' ? 66 : 34 + o.lit.length * 9) * scale) - 5;
        const col = o.t === 'copy' ? C.dupe : C.ref;
        const act = D.span(t, 0.2 + k * 0.09, 0.4 + k * 0.09);
        D.box(ctx, ox, oy, bw2, chh, { r: 5, fill: D.alpha(col, 0.1 + 0.18 * act), stroke: D.alpha(col, 0.3 + 0.5 * act), lw: 1 });
        D.text(ctx, label, ox + bw2 / 2, oy + chh / 2, {
          size: 10, color: D.mix(C.dim, col, D.easeInOut(act)), align: 'center', baseline: 'middle', mono: true
        });
        ox += bw2 + 6;
      });

      // rekonstrukcja
      const ry = 264;
      D.text(ctx, 'rekonstrukcja', 46, ry + chh / 2, { size: 11, color: C.dim, weight: 700, baseline: 'middle' });
      const prog = D.span(t, 0.4, 0.8);
      const outChars = Math.ceil(prog * mod.length);
      for (let k = 0; k < mod.length; k++) {
        if (k >= outChars) break;
        const x = x0 + k * (w / mod.length);
        const bwid = w / mod.length - 2;
        const changed = changedIdx.indexOf(k) >= 0;
        D.box(ctx, x, ry, bwid, chh, {
          r: 3, fill: D.alpha(changed ? C.ref : C.dupe, 0.2), stroke: D.alpha(changed ? C.ref : C.dupe, 0.55), lw: 1
        });
        D.text(ctx, mod[k], x + bwid / 2, ry + chh / 2, {
          size: 11, color: changed ? C.ref : C.dupe, align: 'center', baseline: 'middle', mono: true
        });
      }

      /* --- ile bajtów --- */
      D.box(ctx, 46, 330, W - 92, 80, { r: 9, fill: C.panel, stroke: C.line });
      D.text(ctx, 'pełna kopia', 64, 350, { size: 11, color: C.dim });
      D.bar(ctx, 200, 344, 420, 14, 1, { fill: C.fresh, bg: '#1b2440' });
      D.text(ctx, mod.length + ' B', 640, 351, { size: 12, color: C.fresh, weight: 700, baseline: 'middle' });
      D.text(ctx, 'delta', 64, 374, { size: 11, color: C.dim });
      D.bar(ctx, 200, 368, 420, 14, bytes / mod.length, { fill: C.save, bg: '#1b2440' });
      D.text(ctx, bytes + ' B', 640, 375, { size: 12, color: C.save, weight: 700, baseline: 'middle' });
      D.pill(ctx, 'oszczędność ' + Math.round((1 - bytes / mod.length) * 100) + '%', 660, 358, {
        fill: D.alpha(C.save, 0.16), stroke: C.save, color: C.save, size: 12
      });
      D.text(ctx, 'COPY = skopiuj spójny kawałek bazy,  INS = wstaw literał. Na krótkim tekście efekt jest czysto teoretyczny —',
        64, 398, { size: 11, color: C.dim, baseline: 'middle' });
      D.text(ctx, 'przy dużych plikach binarnych i obrazach delta działa bardzo dobrze.', 64, 398 + 0, {
        size: 11, color: C.dim, baseline: 'middle', alpha: 0
      });
    }
  });

  /* ------------------------------------------------------------------
     2. ddelta — nie skanujemy całego pliku, tylko sąsiedztwo duplikatów
     ------------------------------------------------------------------ */
  D.scene('ddelta', {
    title: 'Ddelta',
    duration: 5.8,
    controls: [{ type: 'button', label: '↻ Odtwórz', action: 'replay' }],

    draw: function (ctx, t, p) {
      const W = 800, H = 450;
      void p;
      D.sceneTitle(ctx, 'Najdroższe w delcie jest skanowanie — Ddelta ogranicza je do okolic duplikatów', W, C.muted);

      const x0 = 46, y0 = 104, w = W - 92, h = 44;
      const N = 40;

      // mapa pliku: duplikaty sąsiadują ze sobą (typowo po backupie)
      const isDupe = i => (i > 12 && i < 20) || (i > 28 && i < 34);

      D.text(ctx, 'plik wejściowy', x0, y0 - 14, { size: 11, color: C.dim, weight: 700 });
      for (let i = 0; i < N; i++) {
        const bw = w / N - 2;
        D.box(ctx, x0 + i * (w / N), y0, bw, h, {
          r: 3, fill: isDupe(i) ? D.alpha(C.dupe, 0.22) : D.alpha(C.fresh, 0.14),
          stroke: isDupe(i) ? D.alpha(C.dupe, 0.55) : D.alpha(C.fresh, 0.35), lw: 0.8
        });
      }

      // okno skanowania
      const prog = D.span(t, 0.1, 0.65);
      const full = D.easeInOut(prog * 1.0);
      const winW = w * (1 - full * 0.82);
      D.box(ctx, x0 + full * w * 0.82, y0 - 8, Math.max(6, winW), h + 16, {
        r: 5, fill: D.alpha(C.ref, 0.1), stroke: C.ref, lw: 1.5
      });
      const winCx = D.clamp(x0 + full * w * 0.82 + winW / 2, x0 + 52, W - 60);
      D.pill(ctx, 'okno skanu', winCx, y0 - 20, {
        align: 'center', fill: D.alpha(C.ref, 0.2), stroke: C.ref, color: C.ref, size: 10, h: 20
      });

      // porównanie
      const cy = 208;
      D.box(ctx, 46, cy, W - 92, 108, { r: 10, fill: C.panel, stroke: C.line });
      const rows = [
        { n: 'klasyczna delta', d: 'przeszukuje cały plik', v: 1.0, l: '100 % pliku', c: C.bad },
        { n: 'Ddelta', d: 'greedy scanning: sąsiedztwo znalezionych duplikatów', v: 0.18, l: '≈ 18 % pliku', c: C.save }
      ];
      rows.forEach((r, i) => {
        const y = cy + 26 + i * 42;
        D.text(ctx, r.n, 66, y, { size: 12.5, weight: 700, color: r.c, baseline: 'middle' });
        D.text(ctx, r.d, 200, y, { size: 11, color: C.dim, baseline: 'middle' });
        D.bar(ctx, 400, y - 7, 240, 15, r.v, { fill: r.c, bg: '#1b2440' });
        D.text(ctx, r.l, 660, y, { size: 12, color: r.c, weight: 700, baseline: 'middle' });
      });

      D.pill(ctx, '≈ 5× mniej bajtów do porównania', 66, cy + 82, {
        fill: D.alpha(C.save, 0.16), stroke: C.save, color: C.save, size: 12
      });
      D.text(ctx, 'działa, bo po dedupie podobne fragmenty leżą obok siebie', 290, cy + 93, {
        size: 11.5, color: C.muted
      });

      D.box(ctx, 46, 336, W - 92, 76, { r: 9, fill: D.alpha(C.info, 0.07), stroke: D.alpha(C.info, 0.3) });
      D.wrap(ctx, 'Gear-based fast chunking tnie chunki na słowa (średnio 64 B) i liczy dla nich szybki hash (Spooky), a dopasowanie potwierdza porównaniem bajtów (memcmp). Greedy scanning rozszerza potem wyszukiwanie na obszary sąsiadujące ze znalezionymi duplikatami — dlatego nie trzeba przeszukiwać całego pliku.',
        62, 354, W - 124, 19, { size: 12.5, color: C.muted });
    }
  });

  /* ------------------------------------------------------------------
     3. dare — wykrywanie podobieństwa przed kompresją deltą
     ------------------------------------------------------------------ */
  D.scene('dare', {
    title: 'DARE — wykrywanie podobieństwa przed deltą',
    duration: 6.0,
    controls: [{ type: 'button', label: '↻ Odtwórz', action: 'replay' }],

    draw: function (ctx, t, p) {
      const W = 800, H = 450;
      void p;
      D.sceneTitle(ctx, 'DARE = wykrywanie podobieństwa zanim w ogóle policzymy deltę', W, C.muted);

      const stages = [
        { n: '1. super-feature', d: 'grupa cech z kolejnych bloków', c: C.info },
        { n: '2. DupAdj', d: 'sąsiednie bloki muszą być duplikatami', c: C.cyan },
        { n: '3. delta', d: 'dopiero dla naprawdę podobnych par', c: C.save }
      ];
      stages.forEach((s, i) => {
        const x = 46 + i * 244;
        const act = D.easeInOut(D.span(t, 0.08 + i * 0.16, 0.3 + i * 0.16));
        D.box(ctx, x, 86, 224, 56, {
          r: 9, fill: D.alpha(s.c, 0.06 + 0.12 * act), stroke: D.alpha(s.c, 0.25 + 0.5 * act), lw: 1.1
        });
        D.text(ctx, s.n, x + 14, 106, { size: 12.5, weight: 700, color: s.c, baseline: 'middle' });
        D.text(ctx, s.d, x + 14, 126, { size: 10.5, color: C.muted });
        if (i < 2) D.arrow(ctx, x + 226, 114, x + 240, 114, { color: D.alpha(C.line, act), lw: 1.6, head: 5 });
      });

      /* --- para plików: super-feature i kandydaci --- */
      const y0 = 180;
      const pairs = [
        { x: 60, name: 'obraz-1.vmdk', sf: [1, 4, 7, 2, 5], sim: 0.92, c: C.save },
        { x: 470, name: 'obraz-2.vmdk', sf: [1, 4, 9, 2, 6], sim: 0.88, c: C.save }
      ];
      pairs.forEach(pr => {
        D.text(ctx, pr.name, pr.x, y0, { size: 11, color: C.muted, weight: 700 });
        pr.sf.forEach((v, i) => {
          const x = pr.x + i * 46;
          D.box(ctx, x, y0 + 12, 40, 30, { r: 4, fill: D.alpha(C.info, 0.18), stroke: D.alpha(C.info, 0.5), lw: 1 });
          D.text(ctx, 'sf' + v, x + 20, y0 + 27, { size: 9, color: C.info, align: 'center', baseline: 'middle', mono: true });
        });
        D.bar(ctx, pr.x, y0 + 52, 220, 12, pr.sim, { fill: C.save, bg: '#1b2440' });
        D.text(ctx, 'podobieństwo ' + Math.round(pr.sim * 100) + '%', pr.x, y0 + 76, {
          size: 10.5, color: C.save
        });
      });

      // strzałka „dobra para"
      D.arrow(ctx, 350, y0 + 27, 430, y0 + 27, { color: C.save, lw: 2, head: 6 });
      D.pill(ctx, 'trafiona para → delta', 390, y0 - 4, {
        align: 'center', fill: D.alpha(C.save, 0.2), stroke: C.save, color: C.save, size: 10.5, h: 22
      });

      /* --- parametry --- */
      D.box(ctx, 46, 300, W - 92, 76, { r: 9, fill: C.panel, stroke: C.line });
      D.text(ctx, 'Dwa progi decydują o wyniku:', 64, 320, { size: 12, color: C.dim, weight: 700 });
      const knobs = [
        { n: 'próg podobieństwa', lo: 'więcej par', hi: 'mniej par', c: C.cyan },
        { n: 'zakres sąsiedztwa (DupAdj)', lo: 'szerszy', hi: 'węższy', c: C.info }
      ];
      knobs.forEach((k, i) => {
        const x = 64 + i * 350;
        D.text(ctx, k.n, x, 342, { size: 11, color: C.muted });
        D.line(ctx, x, 356, x + 320, 356, { color: C.line, lw: 3 });
        D.arrow(ctx, x + 6, 356, x + 300, 356, { color: D.alpha(k.c, 0.5), lw: 1.4, head: 5 });
        D.text(ctx, k.lo, x, 366, { size: 10, color: C.dim });
        D.text(ctx, k.hi, x + 320, 366, { size: 10, color: C.dim, align: 'right' });
      });

      D.text(ctx, 'Nieco więcej pracy na etapie wyszukiwania = dużo mniej zmarnowanej pracy na delcie.',
        46, 396, { size: 12.5, color: C.text });
      D.sceneFoot(ctx, 'rozdział 7.3 · DARE (IEEE TC 2016)', W, H, C.dim);
    }
  });

})(window.DECK);
