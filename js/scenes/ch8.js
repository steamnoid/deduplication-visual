/* ch8.js — Rozdział 8: framework (pipeline, GC, near-exact dedup) */

(function (D) {
  const C = D.C;

  /* ------------------------------------------------------------------
     1. inline-pipeline — gdzie w potoku zapada decyzja o dedupie
     ------------------------------------------------------------------ */
  D.scene('inline-pipeline', {
    title: 'Pipeline in-line',
    duration: 6.0,
    controls: [{ type: 'button', label: '↻ Odtwórz', action: 'replay' }],

    draw: function (ctx, t, p) {
      const W = 800, H = 450;
      void p;
      D.sceneTitle(ctx, 'Backup to przepływ. Pytanie brzmi: w którym miejscu pominąć duplikat', W, C.muted);

      const stages = [
        { n: 'sieć', c: C.cyan, w: 1 },
        { n: 'chunking', c: C.info, w: 1 },
        { n: 'haszowanie', c: C.info, w: 1 },
        { n: 'indeks', c: C.violet, w: 1 },
        { n: 'zapis', c: C.fresh, w: 1 }
      ];
      const x0 = 46, total = W - 92;
      const sw = total / stages.length;
      const cy = 100;

      stages.forEach((s, i) => {
        const x = x0 + i * sw;
        D.box(ctx, x + 3, cy, sw - 6, 46, { r: 8, fill: D.alpha(s.c, 0.12), stroke: D.alpha(s.c, 0.45), lw: 1 });
        D.text(ctx, s.n, x + sw / 2, cy + 23, {
          size: 12, weight: 700, color: s.c, align: 'center', baseline: 'middle'
        });
        if (i < stages.length - 1) {
          D.arrow(ctx, x + sw - 3, cy + 23, x + sw - 1, cy + 23, { color: C.line, lw: 1.5, head: 5 });
        }
      });

      // przepływ bajtów
      const fy = 172;
      D.text(ctx, 'przepływ danych', x0, fy - 12, { size: 11, color: C.dim, weight: 700 });
      D.box(ctx, x0, fy, total, 26, { r: 6, fill: '#131c31', stroke: '#1e2846' });
      const fill = D.easeInOut(D.span(t, 0.1, 0.55));
      D.boxSides(ctx, x0, fy, total * fill, 26, 6, 't', { fill: D.alpha(C.save, 0.55) });
      // duplikaty pomijane na etapie indeksu
      const idxX = x0 + 3 * sw;
      if (fill > 0.72) {
        D.box(ctx, idxX, fy, sw - 6, 26, { r: 4, fill: D.alpha(C.violet, 0.3), stroke: C.violet, lw: 1 });
        D.text(ctx, 'tu sprawdzamy', idxX + sw / 2, fy + 13, { size: 10, color: C.text, align: 'center', baseline: 'middle' });
      }

      /* --- dwa warianty --- */
      const vy = 234;
      const variants = [
        {
          n: 'in-line (w locie)', c: C.save, act: D.span(t, 0.3, 0.55),
          plus: 'od razu mniej zapisu, brak okna na przepisanie',
          minus: 'każdy chunk musi zostać sprawdzony przed zapisem',
          thr: 'przepustowość spada z ~2 GB/s do ~0,4 GB/s'
        },
        {
          n: 'off-line (po fakcie)', c: C.ref, act: D.span(t, 0.55, 0.8),
          plus: 'ścieżka zapisu nietknięta',
          minus: 'trzeba przepisać istniejące dane, powstają śmieci do GC',
          thr: 'okno konserwacji, ale wyższa wydajność'
        }
      ];
      variants.forEach((v, i) => {
        const x = x0 + i * (total / 2 + 8);
        const w2 = total / 2 - 8;
        const a = D.easeInOut(v.act);
        D.box(ctx, x, vy, w2, 116, {
          r: 10, fill: D.alpha(v.c, 0.05 + 0.09 * a), stroke: D.alpha(v.c, 0.2 + 0.5 * a), lw: 1.2
        });
        D.text(ctx, v.n, x + 16, vy + 24, { size: 14, weight: 700, color: D.mix(C.dim, v.c, a), baseline: 'middle' });
        D.text(ctx, '+  ' + v.plus, x + 16, vy + 52, { size: 11, color: C.muted });
        D.text(ctx, '−  ' + v.minus, x + 16, vy + 70, { size: 11, color: C.muted });
        D.box(ctx, x + 16, vy + 84, w2 - 32, 20, { r: 5, fill: D.alpha(v.c, 0.12) });
        D.text(ctx, v.thr, x + w2 / 2, vy + 94, { size: 11, color: v.c, align: 'center', baseline: 'middle', weight: 600 });
      });

      D.box(ctx, 46, 366, W - 92, 46, { r: 9, fill: C.panel, stroke: C.line });
      D.text(ctx, 'Framework z rozdziału 8 składa to w całość: potok backupu, potok restore, GC i tryb near-exact.',
        64, 389, { size: 12.5, color: C.text, baseline: 'middle' });
    }
  });

  /* ------------------------------------------------------------------
     2. gc-amplification — GC kosztuje odczyty i zapisy
     ------------------------------------------------------------------ */
  D.scene('gc-amplification', {
    title: 'Garbage collection',
    duration: 5.8,
    controls: [{ type: 'button', label: '↻ Odtwórz', action: 'replay' }],

    draw: function (ctx, t, p) {
      const W = 800, H = 450;
      void p;
      D.sceneTitle(ctx, 'Sprzątanie śmieci prawie zawsze kosztuje podwójnie: odczyt i zapis', W, C.muted);

      const cw = 32, chh = 30, gap = 4;
      const liveN = 10, deadN = 6, N = liveN + deadN;
      const x0 = 150, step = cw + gap;
      const prog = D.span(t, 0.18, 0.72);

      /* --- przed --- */
      const y1 = 96;
      D.text(ctx, 'przed', 46, y1 + chh / 2, { size: 12, color: C.muted, weight: 700, baseline: 'middle' });
      D.text(ctx, 'kontener 1', 46, y1 + chh / 2 - 6, { size: 10, color: C.dim });
      for (let i = 0; i < N; i++) {
        const isLive = i < liveN;
        const col = isLive ? C.dupe : C.dim;
        D.box(ctx, x0 + i * step, y1, cw, chh, {
          r: 4, fill: D.alpha(col, isLive ? 0.2 : 0.06), stroke: D.alpha(col, isLive ? 0.55 : 0.22), lw: 1
        });
        D.text(ctx, isLive ? 'a' + (i + 1) : '✕', x0 + i * step + cw / 2, y1 + chh / 2, {
          size: isLive ? 10 : 12, color: isLive ? C.dupe : D.mix(C.dim, C.bad, prog * 1.2),
          align: 'center', baseline: 'middle', mono: !isLive, weight: 700
        });
      }
      D.text(ctx, liveN + ' żywych + ' + deadN + ' martwych', x0 + N * step, y1 - 8, {
        size: 10, color: C.bad, align: 'right'
      });

      /* --- GC --- */
      const yArrow = 148;
      D.arrow(ctx, 96, yArrow, 96, yArrow + 26, { color: C.line, lw: 2, head: 6 });
      D.text(ctx, 'GC', 110, yArrow + 13, { size: 10.5, color: C.muted, weight: 700, baseline: 'middle' });
      D.text(ctx, 'odczytujemy żywe chunki i zapisujemy je do nowego kontenera',
        150, yArrow + 13, { size: 11, color: C.dim, baseline: 'middle' });

      /* --- po --- */
      const y2 = 196;
      D.text(ctx, 'po', 46, y2 + chh / 2, { size: 12, color: C.muted, weight: 700, baseline: 'middle' });
      // nowy kontener
      for (let i = 0; i < liveN; i++) {
        const g = D.easeInOut(D.clamp(prog * 1.5 - i * 0.05, 0, 1));
        D.box(ctx, x0 + i * step, y2, cw, chh, {
          r: 4, fill: D.alpha(C.dupe, 0.14 + 0.1 * g), stroke: D.alpha(C.dupe, 0.3 + 0.35 * g), lw: 1
        });
        if (g > 0.3) {
          D.text(ctx, 'a' + (i + 1), x0 + i * step + cw / 2, y2 + chh / 2, {
            size: 10, color: D.mix(C.dim, C.dupe, g), align: 'center', baseline: 'middle', mono: true
          });
        }
      }
      // stary kontener pusty
      for (let i = 0; i < deadN; i++) {
        const x = x0 + (liveN + i) * step;
        D.box(ctx, x, y2, cw, chh, { r: 4, fill: '#0f1526', stroke: '#1d2740', lw: 1 });
      }
      D.text(ctx, 'kontener 2', 46, y2 + chh / 2 - 6, { size: 10, color: C.dim });
      D.text(ctx, 'stary kontener', x0 + N * step, y2 - 8, { size: 10, color: C.dim, align: 'right' });
      D.text(ctx, 'kontener 2 (10 żywych)', x0 + liveN * step - 8, y2 - 8, {
        size: 10, color: C.save, align: 'right'
      });

      /* --- licznik operacji --- */
      D.box(ctx, 46, 268, W - 92, 86, { r: 9, fill: C.panel, stroke: C.line });
      D.text(ctx, 'Co musiał zrobić system (16 komórek po 1 KB)', 64, 290, { size: 11, color: C.dim, weight: 700 });
      const ops = [
        { n: 'odczytane bajty', v: 16, l: '16 KB', c: C.info, note: 'cały stary kontener' },
        { n: 'zapisane bajty', v: 10, l: '10 KB', c: C.save, note: 'tylko żywe chunki' },
        { n: 'zmarnowane bajty', v: 6, l: '6 KB', c: C.bad, note: '6 KB zapisu na nic' }
      ];
      ops.forEach((o, i) => {
        const x = 64 + i * 240;
        const g = D.easeInOut(D.span(t, 0.6 + i * 0.06, 0.8 + i * 0.06));
        D.text(ctx, o.n, x, 314, { size: 10.5, color: C.dim });
        D.text(ctx, o.l, x, 336, { size: 17, weight: 800, color: D.mix('#26314d', o.c, g), baseline: 'middle' });
        D.text(ctx, o.note, x, 350, { size: 9.5, color: C.dim });
      });

      D.box(ctx, 46, 366, W - 92, 46, { r: 9, fill: D.alpha(C.info, 0.07), stroke: D.alpha(C.info, 0.28) });
      D.text(ctx, 'To jest „write amplification”: operacja czysto porządkowa, a mimo to generuje zapis.',
        64, 389, { size: 12.5, color: C.text, baseline: 'middle' });
      D.sceneFoot(ctx, 'rozdział 8.2.3 · garbage collection', W, H, C.dim);
    }
  });

  /* ------------------------------------------------------------------
     3. near-exact-physical — tanie przybliżenie dzięki lokalności fizycznej
     ------------------------------------------------------------------ */
  D.scene('near-exact-physical', {
    title: 'Near-exact dedup: tylko próbki w RAM',
    duration: 6.2,
    controls: [{ type: 'range', key: 'samples', label: 'Próbki w RAM', min: 4, max: 16, step: 1, value: 6 }],

    draw: function (ctx, t, p) {
      const W = 800, H = 450;
      D.sceneTitle(ctx, 'Indeks w RAM trzyma tylko część fingerprintów — reszta duplikatów przepada', W, C.muted);

      /* --- RAM: reprezentanci vs pełny indeks --- */
      const total = 24, kept = p.samples;
      const rx = 46, ry = 92, rw = W - 92, rh = 46;
      D.text(ctx, 'indeks w RAM', rx, ry - 12, { size: 11, color: C.dim, weight: 700 });
      D.box(ctx, rx, ry, rw, rh, { r: 8, fill: C.panel, stroke: C.line });
      const cellW = (rw - 20) / total;
      for (let i = 0; i < total; i++) {
        const on = i < kept;
        const x = rx + 10 + i * cellW;
        const appear = D.easeInOut(D.clamp(D.span(t, 0.1, 0.5) * total - i, 0, 1));
        D.box(ctx, x, ry + 8, cellW - 2, rh - 16, {
          r: 2,
          fill: on ? D.alpha(C.dupe, 0.2 * appear) : '#101828',
          stroke: on ? D.alpha(C.dupe, 0.5 * appear) : '#1a2338', lw: 1
        });
        if (!on) {
          D.text(ctx, '·', x + (cellW - 2) / 2, ry + rh / 2, {
            size: 11, color: '#2a3550', align: 'center', baseline: 'middle'
          });
        }
      }
      D.pill(ctx, kept + ' z ' + total + ' fingerprintów', rx + rw - 132, ry - 30, {
        fill: D.alpha(C.dupe, 0.14), stroke: D.alpha(C.dupe, 0.4), color: C.dupe, size: 10.5, h: 20
      });
      D.text(ctx, 'próbki / reprezentanci', rx + 150, ry - 20, { size: 10.5, color: C.dim });

      /* --- plik przychodzący: część chunków wypada --- */
      const cy = 178;
      D.text(ctx, 'nowy plik', rx, cy - 12, { size: 11, color: C.dim, weight: 700 });
      const N = 16, bw = (rw - 20) / N;
      const missed = [];
      for (let i = 0; i < N; i++) {
        const x = rx + 10 + i * bw;
        // chunk trafia, jeśli jego reprezentant jest w RAM
        const rep = (i * 3) % total;
        const found = rep < kept;
        if (!found) missed.push(i);
        const t0 = D.span(t, 0.25 + i * 0.02, 0.4 + i * 0.02);
        D.box(ctx, x, cy, bw - 2, 30, {
          r: 3,
          fill: t0 > 0 ? D.alpha(found ? C.dupe : C.dim, 0.22) : '#101828',
          stroke: t0 > 0 ? D.alpha(found ? C.dupe : C.dim, 0.5) : '#1a2338', lw: 1
        });
        if (t0 > 0.5) {
          D.text(ctx, found ? '↺' : '✕', x + (bw - 2) / 2, cy + 15, {
            size: 11, weight: 700, color: found ? C.dupe : C.dim, align: 'center', baseline: 'middle'
          });
        }
      }
      D.text(ctx, 'chunki rozpoznane', rx + 10, cy + 44, { size: 10, color: C.dupe });
      D.text(ctx, 'chunki przepadłe (zapisane drugi raz)', rx + 190, cy + 44, { size: 10, color: C.dim });

      /* --- wynik --- */
      const wy = 262;
      D.box(ctx, 46, wy, W - 92, 96, { r: 10, fill: C.panel, stroke: C.line });
      const missedFrac = missed.length / N;
      const ratio = 100 - missedFrac * 100;
      const ram = total / kept;
      const rows = [
        { n: 'Indeks w RAM', v: ram, l: '×' + ram.toFixed(1) + ' mniejszy niż pełny', c: C.dupe, dir: 'mniej' },
        { n: 'Dedup ratio vs wersja dokładna (ED)', v: ratio / 100, l: ratio.toFixed(0) + ' % — próg to 97 %', c: C.save, dir: 'mniej' }
      ];
      rows.forEach((r, i) => {
        const y = wy + 28 + i * 34;
        D.text(ctx, r.n, 66, y, { size: 11.5, color: C.muted, baseline: 'middle' });
        D.bar(ctx, 300, y - 7, 300, 15, D.clamp(r.v, 0, 1) * (i === 0 ? 0.5 : 1), { fill: r.c, bg: '#1b2440' });
        D.text(ctx, r.l, 620, y, { size: 11.5, color: r.c, weight: 700, baseline: 'middle' });
      });
      D.text(ctx, 'Brak fałszywych trafień: decyzja pozostaje dokładna — po prostu część duplikatów przepada.',
        66, wy + 78, { size: 11, color: C.text });

      D.box(ctx, 46, 372, W - 92, 42, { r: 9, fill: D.alpha(C.info, 0.07), stroke: D.alpha(C.info, 0.28) });
      D.text(ctx, 'Physical locality = układ po dedupie, utrzymywany w kontenerach: wiadomo, co leży obok czego.',
        64, 393, { size: 12, color: C.text, baseline: 'middle' });
      D.sceneFoot(ctx, 'rozdział 8.3 · near-exact dedup', W, H, C.dim);
    }
  });

  /* ------------------------------------------------------------------
     4. near-exact-logical — logical locality: receptisy jako recepta pliku
     ------------------------------------------------------------------ */
  D.scene('near-exact-logical', {
    title: 'Logical locality: receptisy',
    duration: 6.2,
    controls: [{ type: 'button', label: '↻ Odtwórz', action: 'replay' }],

    draw: function (ctx, t, p) {
      const W = 800, H = 450;
      void p;
      D.sceneTitle(ctx, 'Receptis pamiętają kolejność chunków sprzed dedupu — czyli wiedzą, co się powtórzy', W, C.muted);

      /* --- receptisy --- */
      const rx = 46, y0 = 96;
      const recipes = [
        { n: 'receptis A (v1)', seq: [1, 1, 1, 0, 1, 0, 1], off: 'C1:0 C1:2 C3:1', c: C.info },
        { n: 'receptis B (v2)', seq: [1, 1, 0, 1, 1, 0, 1], off: 'C1:0 C2:4 C3:0', c: C.cyan }
      ];
      D.text(ctx, 'receptisy (przepis pliku)', rx, y0 - 12, { size: 11, color: C.dim, weight: 700 });
      const seqW = 46;
      recipes.forEach((r, ri) => {
        const y = y0 + ri * 58;
        D.text(ctx, r.n, rx, y + 18, { size: 10.5, weight: 700, color: r.c, baseline: 'middle' });
        r.seq.forEach((v, i) => {
          const x = rx + 130 + i * (seqW + 4);
          D.box(ctx, x, y, seqW, 34, {
            r: 4,
            fill: D.alpha(v ? C.dupe : C.line, v ? 0.22 : 0.12),
            stroke: D.alpha(v ? C.dupe : C.line, v ? 0.5 : 0.3), lw: 1
          });
          D.text(ctx, v ? 'dup' : 'nowy', x + seqW / 2, y + 17, {
            size: 9, color: v ? C.dupe : C.dim, align: 'center', baseline: 'middle', weight: 600
          });
        });
        D.text(ctx, r.off, rx + 130, y + 46, { size: 9.5, color: C.dim, mono: true });
      });

      /* --- nowy plik + przewidywanie --- */
      const ny = 224;
      D.text(ctx, 'plik wchodzący', rx, ny - 10, { size: 11, color: C.dim, weight: 700 });
      const incoming = [1, 1, 0, 1, 1, 0, 1, 0];
      const prog = D.span(t, 0.2, 0.7);
      incoming.forEach((v, i) => {
        const x = rx + i * (seqW + 4);
        const done = i < prog * incoming.length;
        D.box(ctx, x, ny, seqW, 34, {
          r: 4,
          fill: done ? D.alpha(C.fresh, 0.2) : '#101828',
          stroke: done ? D.alpha(C.fresh, 0.5) : '#1a2338', lw: 1
        });
        if (done) {
          D.text(ctx, v ? '↺' : 'N', x + seqW / 2, ny + 17, {
            size: 11, weight: 700, color: v ? C.dupe : C.fresh, align: 'center', baseline: 'middle'
          });
        }
      });

      /* --- przewidywane pozycje --- */
      const py = 300;
      D.box(ctx, 46, py, W - 92, 82, { r: 10, fill: C.panel, stroke: C.line });
      D.text(ctx, 'Co system zrobił bez czytania indeksu chunk po chunku', 66, py + 22, {
        size: 11.5, color: C.muted, weight: 700
      });
      const steps = [
        'dopasował plik do receptisa po podobieństwie sekwencji chunków',
        'z receptisa odczytał, które kontenery i offsety się powtórzą',
        'odczytał tylko te, a pozostałe chunki zapisał'
      ];
      steps.forEach((t2, i) => {
        const a = D.easeInOut(D.span(t, 0.45 + i * 0.12, 0.68 + i * 0.12));
        D.text(ctx, (i + 1) + '.', 66, py + 44 + i * 16, {
          size: 11, weight: 700, color: D.mix(C.dim, C.save, a), baseline: 'middle'
        });
        D.text(ctx, t2, 84, py + 44 + i * 16, {
          size: 11, color: D.mix(C.dim, C.text, a), baseline: 'middle'
        });
      });

      D.box(ctx, 46, 396, W - 92, 38, { r: 9, fill: D.alpha(C.info, 0.07), stroke: D.alpha(C.info, 0.28) });
      D.text(ctx, 'Działa, dopóki pliki naprawdę mają tę samą strukturę. Przy plikach niezależnych receptisy nic nie przewidzą.',
        64, 415, { size: 11.5, color: C.muted, baseline: 'middle' });
      D.sceneFoot(ctx, 'logical locality = sekwencja chunków przed dedupem, utrzymana w recipis', W, H, C.dim);
    }
  });

})(window.DECK);
