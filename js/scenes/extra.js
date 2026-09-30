/* extra.js — dwie sceny uzupełniające do rozdziału o indeksowaniu:
   1) Extreme Binning jako schemat PODOBIEŃSTWOWY (reprezentant pliku),
      a nie cięcie przestrzeni hashy na bity,
   2) SiLo rozłożone na dwie warstwy: Similarity (reprezentanci segmentów)
      oraz Locality (prefetch całego segmentu zamiast pytań per chunk).
   Kanwa zawsze 800x450, klasyczny skrypt, deterministyczny (bez Math.random). */

(function (D) {
  const C = D.C;

  /* --- drobne narzędzia lokalne ------------------------------------- */

  /* 1440 -> "1 440" (separator tysięcy spacją) */
  function grp(n) {
    const s = String(Math.round(n));
    let o = '';
    for (let i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 === 0) o += ' ';
      o += s[i];
    }
    return o;
  }

  function kb(b) {
    if (b >= 1024) return (b / 1024).toFixed(1).replace('.', ',') + ' kB';
    return Math.round(b) + ' B';
  }

  function hex4(v) {
    return ('000' + Math.floor(v * 4096).toString(16)).slice(-4);
  }

  /* Nagłówek małego panelu: tytuł po lewej, opis po prawej, linia rozdzielająca. */
  function phead(ctx, x, y, w, label, right, col, ruleY) {
    D.text(ctx, label, x, y, { size: 11, weight: 700, color: col || C.muted, baseline: 'middle' });
    if (right) D.text(ctx, right, x + w, y, { size: 10, color: C.dim, align: 'right', baseline: 'middle' });
    D.line(ctx, x, ruleY == null ? y + 13 : ruleY, x + w, ruleY == null ? y + 13 : ruleY, { color: C.line, lw: 1 });
  }

  /* Rząd kwadracików-chunków. state(i, cw) -> null | {c, a, s} (kolor, wypełnienie, obwódka) */
  function chunkRow(ctx, x, y, maxW, h, n, gap, state, maxCw) {
    const cw = Math.min(maxCw || maxW, (maxW - (n - 1) * gap) / n);
    for (let i = 0; i < n; i++) {
      const s = state(i, cw);
      if (!s) continue;
      D.box(ctx, x + i * (cw + gap), y, cw, h, {
        r: Math.min(3, cw / 2), fill: D.alpha(s.c, s.a), stroke: D.alpha(s.c, s.s == null ? 0.5 : s.s), lw: 1
      });
    }
    return cw;
  }

  /* Miniaturowy pasek odcisku (deterministyczne „górki”) */
  function ticks(ctx, x, y, w, h, n, key, col) {
    const g = w / n;
    for (let i = 0; i < n; i++) {
      const v = D.h01(key + ':' + i);
      const th = Math.max(2, Math.round(v * h));
      D.box(ctx, x + i * g, y + (h - th), Math.max(1.5, g - 1.6), th, { r: 1, fill: D.alpha(col, 0.45 + 0.45 * v) });
    }
  }

  /* ------------------------------------------------------------------
     1. extreme-binning-similarity — Extreme Binning jako schemat
        PODOBIEŃSTWOWY: na dysku pliki, w RAM tylko minimalne fingerprinty
        (po jednym na plik), trafienie = plik jest podobny = warto
        przeczytać jego indeks na dysku w całości.
        UWAGA: nie pokazujemy cięcia przestrzeni hashy na bity.
     ------------------------------------------------------------------ */
  D.scene('extreme-binning-similarity', {
    title: 'Extreme Binning: indeks trzyma pliki, nie chunki',
    duration: 7.2,
    controls: [
      { type: 'range', key: 'files', label: 'Pliki na dysku', min: 20, max: 200, step: 10, value: 60 }
    ],

    draw: function (ctx, t, p, sc) {
      const W = (sc && sc.width) || 800, H = (sc && sc.height) || 450;
      const CPK = 12;                 // chunków na plik (średnio)
      const NF = p.files;             // plików na dysku
      const CH = NF * CPK;            // chunków na dysku
      const SHOWN = 3;                // ile plików rysujemy w całości
      const HIT = 1;                  // indeks pliku, który trafia

      D.sceneTitle(ctx, 'Extreme Binning: jeden wpis indeksu na plik, nie na chunk', W, C.muted);
      D.pill(ctx, 'indeksowanie · Extreme Binning', W - 16, 14, {
        align: 'right', size: 11, h: 21, fill: D.alpha(C.violet, 0.15),
        stroke: D.alpha(C.violet, 0.5), color: C.violet
      });

      /* ============ górny pas: dysk -> RAM -> decyzja ============ */
      const PY = 46, PH = 186;
      const A1X = 24, A1W = 246;
      const A2X = 290, A2W = 218;
      const A3X = 528, A3W = 248;
      D.box(ctx, A1X, PY, A1W, PH, { r: 10, fill: C.panel, stroke: C.line });
      D.box(ctx, A2X, PY, A2W, PH, { r: 10, fill: C.panel, stroke: C.line });
      D.box(ctx, A3X, PY, A3W, PH, { r: 10, fill: C.panel, stroke: C.line });

      /* --- panel 1: pliki na dysku --- */
      phead(ctx, A1X + 18, 66, A1W - 36, 'DYSK', 'pliki + ich chunki');
      const ry = [96, 129, 162], rh = 30;
      for (let i = 0; i < SHOWN; i++) {
        const y = ry[i];
        const on = D.easeOut(D.span(t, 0.04 + i * 0.045, 0.18 + i * 0.045));
        const rep = D.span(t, 0.18 + i * 0.05, 0.34 + i * 0.05, D.easeOut);
        const hit = i === HIT ? D.span(t, 0.56, 0.66) : 0;
        const read = i === HIT ? D.span(t, 0.66, 0.78) : 0;

        D.box(ctx, A1X + 18, y, A1W - 36, rh, {
          r: 5, fill: D.alpha(hit > 0 ? C.save : C.info, 0.05 + 0.10 * hit),
          stroke: D.mix(C.line, C.save, read), lw: 1 + read * 0.6
        });
        D.text(ctx, 'f0' + (i + 1) + '.vmdk', A1X + 25, y + 15, {
          size: 10, weight: 700, mono: true, color: D.mix(C.dim, C.text, on), baseline: 'middle'
        });

        // chunki pliku; jeden z nich to minimalny fingerprint
        const sx = A1X + 80, sw = A1W - 80 - 24;
        chunkRow(ctx, sx, y + 8, sw, 14, CPK, 2, function (k) {
          if (on <= 0) return null;
          const isRep = k === 3;
          const c = isRep ? C.violet : (k % 4 === 0 ? C.dupeDim : C.dim);
          return {
            c: c,
            a: (isRep ? 0.25 + 0.7 * rep : 0.16 + 0.2 * on) * (isRep ? 1 : 1),
            s: isRep ? 0.35 + 0.6 * rep : 0.28
          };
        });

        // po trafieniu: indeks tego pliku czytany w całości
        if (read > 0) {
          D.box(ctx, A1X + 18, y + rh - 4, (A1W - 36) * D.easeOut(read), 3, {
            r: 1.5, fill: D.alpha(C.save, 0.9)
          });
        }

        // łącznik reprezentant -> wpis w RAM
        const con = D.span(t, 0.30 + i * 0.05, 0.48 + i * 0.05, D.easeInOut);
        if (con > 0) {
          D.arrow(ctx, A1X + A1W - 4, y + 15, A2X + 12, y + 15, {
            color: D.alpha(C.violet, con), lw: 1.3, dash: [3, 3], head: 5
          });
        }
      }
      D.text(ctx, '… + ' + grp(NF - SHOWN) + ' plików, każdy dostaje 1 wpis', A1X + 18, 208, {
        size: 10, color: C.dim
      });
      D.text(ctx, 'chunków na dysku: ' + grp(CH), A1X + 18, 222, { size: 10, color: C.muted });

      /* --- panel 2: co siedzi w RAM --- */
      phead(ctx, A2X + 18, 66, A2W - 36, 'RAM', 'indeks');
      for (let i = 0; i < SHOWN; i++) {
        const y = ry[i];
        const on = D.easeOut(D.span(t, 0.32 + i * 0.05, 0.50 + i * 0.05));
        const hit = i === HIT ? D.span(t, 0.54, 0.64) : 0;
        const col = hit > 0 ? C.save : C.violet;
        D.box(ctx, A2X + 18, y, A2W - 36, rh, {
          r: 5, fill: D.alpha(col, 0.06 + 0.16 * on + 0.10 * hit),
          stroke: D.alpha(col, 0.25 + 0.45 * on + 0.3 * hit), lw: 1
        });
        D.box(ctx, A2X + 25, y + 7, 4, 16, { r: 2, fill: D.alpha(col, 0.5 + 0.5 * on) });
        D.text(ctx, 'min. fp · f0' + (i + 1), A2X + 36, y + 15, {
          size: 10, color: D.mix(C.dim, C.text, on), baseline: 'middle'
        });
        if (on > 0.25) {
          D.text(ctx, hex4(D.h01('fp' + i)), A2X + A2W - 25, y + 15, {
            size: 10, weight: 700, mono: true, color: D.mix(C.dim, col, on),
            align: 'right', baseline: 'middle'
          });
        }
      }
      D.text(ctx, 'wpisów w RAM: ' + grp(NF), A2X + 18, 208, { size: 10, color: C.muted });
      D.text(ctx, 'to ' + kb(NF * 24) + ' zamiast ' + kb(CH * 24), A2X + 18, 222, { size: 10, color: C.dim });

      /* --- panel 3: decyzja --- */
      phead(ctx, A3X + 18, 66, A3W - 36, 'NOWY CHUNK', 'z backupu');
      const inc = D.easeOut(D.span(t, 0.44, 0.56));
      D.box(ctx, A3X + 18, 82, A3W - 36, 30, {
        r: 6, fill: D.alpha(C.fresh, 0.10 + 0.28 * inc), stroke: D.alpha(C.fresh, 0.35 + 0.55 * inc), lw: 1.2
      });
      D.text(ctx, 'chunk-0148', A3X + 18 + (A3W - 36) / 2, 97, {
        size: 10, weight: 700, mono: true, color: D.mix(C.dim, C.fresh, inc), align: 'center', baseline: 'middle'
      });
      D.arrow(ctx, A3X + A3W / 2, 114, A3X + A3W / 2, 130, {
        color: D.alpha(C.info, D.span(t, 0.54, 0.62)), lw: 1.6, head: 6
      });
      D.text(ctx, 'porównanie z reprezentantami', A3X + 18, 138, { size: 10.5, color: C.dim });
      D.text(ctx, 'wszystko siedzi w RAM — zero I/O', A3X + 18, 150, { size: 10.5, color: C.dim });

      const mt = D.easeOut(D.span(t, 0.58, 0.68));
      D.box(ctx, A3X + 18, 162, A3W - 36, 28, {
        r: 6, fill: D.alpha(C.ref, 0.08 + 0.20 * mt), stroke: D.alpha(C.ref, 0.25 + 0.6 * mt), lw: 1.2
      });
      D.text(ctx, 'trafienie → f0' + (HIT + 1) + ' jest podobny', A3X + 30, 176, {
        size: 10.5, weight: 600, color: D.mix(C.dim, C.ref, mt), baseline: 'middle'
      });
      const rd = D.easeOut(D.span(t, 0.68, 0.80));
      D.box(ctx, A3X + 18, 196, A3W - 36, 30, {
        r: 6, fill: D.alpha(C.save, 0.08 + 0.18 * rd), stroke: D.alpha(C.save, 0.28 + 0.6 * rd), lw: 1.2
      });
      D.text(ctx, '1 odczyt indeksu f0' + (HIT + 1) + ' z dysku', A3X + 30, 211, {
        size: 10.5, weight: 600, color: D.mix(C.dim, C.save, rd), baseline: 'middle'
      });

      /* ============ dolny pas: kroki + licznik ============ */
      const BY = 244, BH = 176;
      D.box(ctx, 24, BY, 430, BH, { r: 10, fill: C.panel, stroke: C.line });
      D.text(ctx, 'co robi Extreme Binning', 42, 266, { size: 11, weight: 700, color: C.muted, baseline: 'middle' });
      D.line(ctx, 42, 279, 436, 279, { color: C.line, lw: 1 });

      const steps = [
        { t: 'Dla każdego pliku liczymy minimalny fingerprint', c: C.info },
        { t: 'Do RAM-u trafia tylko ten jeden odcinek pliku', c: C.violet },
        { t: 'Nowy chunk porównujemy z tymi reprezentantami', c: C.cyan },
        { t: 'Trafienie oznacza: ten plik jest podobny', c: C.ref },
        { t: 'Jego indeks na dysku warto odczytać w całości', c: C.save }
      ];
      steps.forEach((s, i) => {
        const y = 298 + i * 27;
        const a = D.easeOut(D.span(t, 0.10 + i * 0.10, 0.30 + i * 0.10));
        D.pill(ctx, String(i + 1), 42, y - 11, {
          size: 10, h: 22, padX: 7, fill: D.alpha(s.c, 0.10 + 0.12 * a),
          stroke: D.alpha(s.c, 0.3 + 0.5 * a), color: D.mix(C.dim, s.c, a)
        });
        D.text(ctx, s.t, 72, y, { size: 11.5, color: D.mix(C.dim, C.text, a), baseline: 'middle' });
      });

      /* licznik odczytów */
      D.box(ctx, 470, BY, 306, BH, { r: 10, fill: C.panel, stroke: C.line });
      D.text(ctx, 'losowe odczyty potrzebne do decyzji', 488, 266, {
        size: 11, weight: 700, color: C.muted, baseline: 'middle'
      });
      D.line(ctx, 488, 279, 758, 279, { color: C.line, lw: 1 });

      const cnt = D.easeOut(D.span(t, 0.76, 0.90));
      D.text(ctx, 'klasyczna tablica hashy', 488, 292, { size: 10.5, color: C.dim, baseline: 'middle' });
      D.text(ctx, '1 losowy odczyt na chunk', 758, 292, {
        size: 10.5, weight: 700, color: D.mix(C.dim, C.bad, cnt), align: 'right', baseline: 'middle'
      });
      D.bar(ctx, 488, 302, 270, 12, cnt, { fill: C.bad, bg: '#1b2440' });
      D.text(ctx, grp(CH) + ' odczytów losowych', 488, 328, {
        size: 11, weight: 700, color: D.mix('#3a2a3d', C.bad, cnt), baseline: 'middle'
      });
      D.text(ctx, 'na chunk', 758, 328, { size: 10, color: C.dim, align: 'right', baseline: 'middle' });

      D.text(ctx, 'Extreme Binning', 488, 352, { size: 10.5, weight: 700, color: C.violet, baseline: 'middle' });
      D.text(ctx, '1 odczyt indeksu na plik', 758, 352, {
        size: 10.5, weight: 700, color: D.mix(C.dim, C.save, cnt), align: 'right', baseline: 'middle'
      });
      D.bar(ctx, 488, 362, 270, 12, cnt / CPK, { fill: C.save, bg: '#1b2440' });
      D.text(ctx, grp(NF) + ' odczytów', 488, 388, {
        size: 11, weight: 700, color: D.mix('#25423a', C.save, cnt), baseline: 'middle'
      });
      D.text(ctx, 'na plik', 758, 388, { size: 10, color: C.dim, align: 'right', baseline: 'middle' });
      D.text(ctx, 'RAM: ' + grp(NF) + ' × 24 B = ' + kb(NF * 24) + '  ·  ×' + CPK + ' mniej odczytów',
        488, 412, { size: 10, color: C.dim });

      D.sceneFoot(ctx, 'Extreme Binning nie dzieli przestrzeni hashy na bity — szuka podobnych plików', W, H, C.dim);
    }
  });

  /* ------------------------------------------------------------------
     2. silo-two-levels — SiLo na dwóch warstwach:
        (1) SIMILARITY: dane leżą w segmentach, do RAM trafiają tylko
            reprezentanci segmentów, indeks RAM jest mały mimo tysięcy
            chunków na dysku;
        (2) LOCALITY: trafienie mówi, w którym segmencie szukać — robimy
            PREFETCH całego segmentu zamiast pytać o każdy chunk osobno.
        UWAGA: to NIE jest sortowanie wpisów wg rozmiaru.
     ------------------------------------------------------------------ */
  D.scene('silo-two-levels', {
    title: 'SiLo: Similarity + Locality',
    duration: 7.6,
    controls: [
      { type: 'range', key: 'seg', label: 'Chunki w segmencie', min: 4, max: 32, step: 1, value: 16 }
    ],

    draw: function (ctx, t, p, sc) {
      const W = (sc && sc.width) || 800, H = (sc && sc.height) || 450;
      const K = p.seg;                // chunków w segmencie
      const SEG = 4;                  // segmenty na dysku
      const HIT = 1;                  // segment, który trafia

      D.sceneTitle(ctx, 'SiLo działa na dwóch warstwach: podobieństwo, potem lokalność', W, C.muted);
      D.pill(ctx, 'indeksowanie · SiLo = Similarity + Locality', W - 16, 14, {
        align: 'right', size: 11, h: 21, fill: D.alpha(C.cyan, 0.15),
        stroke: D.alpha(C.cyan, 0.5), color: C.cyan
      });

      /* ================= warstwa 1: SIMILARITY ================= */
      D.box(ctx, 24, 46, 752, 172, { r: 10, fill: C.panel, stroke: C.line });
      D.text(ctx, '1 · SIMILARITY', 42, 64, { size: 13, weight: 800, color: C.cyan, baseline: 'middle' });
      D.text(ctx, '— do RAM trafia tylko reprezentant każdego segmentu', 158, 64, {
        size: 11, color: C.muted, baseline: 'middle'
      });
      D.pill(ctx, '✕ nie sortowanie wg rozmiaru', 758, 53, {
        align: 'right', size: 10, h: 22, padX: 8, fill: D.alpha(C.bad, 0.10),
        stroke: D.alpha(C.bad, 0.4), color: C.bad
      });
      D.line(ctx, 42, 76, 758, 76, { color: C.line, lw: 1 });

      D.text(ctx, 'SEGMENTY NA DYSKU', 42, 88, { size: 10, weight: 700, color: C.dim });
      D.text(ctx, 'REPREZENTANCI W RAM', 486, 88, { size: 10, weight: 700, color: C.dim });

      const ry = [96, 119, 142, 165], rh = 20;
      for (let i = 0; i < SEG; i++) {
        const y = ry[i];
        const on = D.easeOut(D.span(t, 0.04 + i * 0.04, 0.18 + i * 0.04));
        const rep = D.span(t, 0.16 + i * 0.04, 0.32 + i * 0.04, D.easeOut);
        const ram = D.easeOut(D.span(t, 0.28 + i * 0.04, 0.46 + i * 0.04));
        const hit = i === HIT ? D.span(t, 0.52, 0.64) : 0;

        D.text(ctx, 'seg-0' + (i + 1), 42, y + 10, {
          size: 10, weight: 700, mono: true, color: D.mix(C.dim, C.muted, on), baseline: 'middle'
        });
        const cw = chunkRow(ctx, 86, y, 364, rh, K, 2, function (k) {
          if (on <= 0) return null;
          if (k === 1) return { c: C.violet, a: 0.22 + 0.68 * rep, s: 0.35 + 0.6 * rep };
          const c = k % 5 === 0 ? C.dupeDim : C.dim;
          return { c: c, a: (0.12 + 0.14 * on) * (0.6 + 0.4 * hit), s: 0.26 };
        }, 18);
        if (hit > 0) {
          D.box(ctx, 83, y - 2, 2 + (cw + 2) * K + 2, rh + 4, {
            r: 4, fill: D.alpha(C.save, 0.05 * hit), stroke: D.alpha(C.save, 0.55 * hit), lw: 1.4
          });
        }

        // reprezentant -> RAM (łącznik biegnie wolną szczeliną, nie przez chunki)
        const con = D.span(t, 0.26 + i * 0.04, 0.44 + i * 0.04, D.easeInOut);
        const stripEnd = 86 + K * (cw + 2) - 2;
        if (con > 0 && stripEnd + 4 < 482) {
          D.arrow(ctx, stripEnd + 4, y + 10, 482, y + 10, {
            color: D.alpha(C.violet, con * 0.9), lw: 1.2, dash: [3, 3], head: 5
          });
        }

        D.box(ctx, 486, y, 272, rh, {
          r: 4, fill: D.alpha(hit > 0 ? C.save : C.violet, 0.05 + 0.12 * ram + 0.12 * hit),
          stroke: D.alpha(hit > 0 ? C.save : C.violet, 0.2 + 0.4 * ram + 0.4 * hit), lw: 1
        });
        D.box(ctx, 494, y + 6, 4, 8, { r: 2, fill: D.alpha(hit > 0 ? C.save : C.violet, 0.45 + 0.5 * ram) });
        D.text(ctx, 'min. fingerprint', 506, y + 10, {
          size: 10, color: D.mix(C.dim, C.text, ram), baseline: 'middle'
        });
        if (ram > 0.2) {
          D.text(ctx, hex4(D.h01('seg' + i)), 750, y + 10, {
            size: 10, weight: 700, mono: true, color: D.mix(C.dim, hit > 0 ? C.save : C.violet, ram),
            align: 'right', baseline: 'middle'
          });
        }
      }

      D.text(ctx, 'segmenty: ' + SEG + ' × ' + K + ' = ' + grp(SEG * K) + ' chunków na dysku   ·   RAM: ' +
        SEG + ' reprezentantów (po 24 B) = ' + kb(SEG * 24), 42, 202, { size: 10, color: C.muted });

      /* ================= warstwa 2: LOCALITY ================= */
      D.box(ctx, 24, 226, 752, 92, { r: 10, fill: C.panel, stroke: C.line });
      D.text(ctx, '2 · LOCALITY', 42, 244, { size: 13, weight: 800, color: C.violet, baseline: 'middle' });
      D.text(ctx, '— trafienie mówi, w którym segmencie szukać', 152, 244, {
        size: 11, color: C.muted, baseline: 'middle'
      });
      D.line(ctx, 42, 256, 758, 256, { color: C.line, lw: 1 });

      const inc = D.easeOut(D.span(t, 0.44, 0.56));
      const mt = D.span(t, 0.52, 0.64);
      const pf = D.span(t, 0.60, 0.78, D.easeInOut);

      D.text(ctx, 'seg-0' + (HIT + 1), 176, 268, {
        size: 10, weight: 700, mono: true, color: D.mix(C.dim, C.save, mt)
      });
      D.box(ctx, 42, 272, 92, 30, {
        r: 6, fill: D.alpha(C.fresh, 0.10 + 0.26 * inc), stroke: D.alpha(C.fresh, 0.35 + 0.55 * inc), lw: 1.2
      });
      D.text(ctx, 'chunk?', 88, 287, {
        size: 10, weight: 700, mono: true, color: D.mix(C.dim, C.fresh, inc), align: 'center', baseline: 'middle'
      });
      D.arrow(ctx, 140, 287, 168, 287, { color: D.alpha(C.info, D.span(t, 0.54, 0.62)), lw: 1.6, head: 6 });

      const lit = D.clamp(1 + pf * (K - 1), 0, K);
      chunkRow(ctx, 176, 272, 424, 30, K, 3, function (k) {
        if (k >= lit) return null;
        const lead = k >= Math.floor(lit) - 0.5;
        return {
          c: k === 0 ? C.ref : C.save,
          a: lead ? 0.45 : 0.16 + 0.2 * D.clamp(pf * K - k, 0, 1),
          s: lead ? 0.95 : 0.45
        };
      }, 20);
      D.text(ctx, '1 losowy odczyt', 616, 281, {
        size: 10.5, weight: 700, color: D.mix(C.dim, C.ref, mt), baseline: 'middle'
      });
      D.text(ctx, '+ ' + (K - 1) + ' chunków z prefetchu', 616, 296, {
        size: 10.5, color: D.mix(C.dim, C.save, pf), baseline: 'middle'
      });

      /* ================= porównanie + skuteczność ================= */
      const cnt = D.easeOut(D.span(t, 0.76, 0.90));
      D.box(ctx, 24, 326, 470, 94, { r: 10, fill: C.panel, stroke: C.line });
      D.text(ctx, 'koszt jednej decyzji o duplikacie', 42, 344, {
        size: 11, weight: 700, color: C.muted, baseline: 'middle'
      });
      D.text(ctx, 'klasyczna tablica hashy', 42, 362, { size: 10.5, color: C.dim, baseline: 'middle' });
      D.text(ctx, '1 losowy odczyt na chunk', 476, 362, {
        size: 10.5, weight: 700, color: D.mix(C.dim, C.bad, cnt), align: 'right', baseline: 'middle'
      });
      D.bar(ctx, 42, 370, 434, 12, cnt, { fill: C.bad, bg: '#1b2440' });
      D.text(ctx, 'SiLo', 42, 398, { size: 10.5, weight: 700, color: C.violet, baseline: 'middle' });
      D.text(ctx, '1 losowy odczyt na segment + prefetch', 476, 398, {
        size: 10.5, weight: 700, color: D.mix(C.dim, C.save, cnt), align: 'right', baseline: 'middle'
      });
      D.bar(ctx, 42, 406, 434, 12, cnt / K, { fill: C.save, bg: '#1b2440' });

      D.box(ctx, 506, 326, 270, 94, { r: 10, fill: C.panel, stroke: C.line });
      D.text(ctx, 'chunków na 1 losowy odczyt', 524, 344, {
        size: 11, weight: 700, color: C.muted, baseline: 'middle'
      });
      D.text(ctx, String(K) + '×', 524, 372, {
        size: 22, weight: 800, color: D.mix('#253a3f', C.save, cnt), baseline: 'middle'
      });
      D.text(ctx, 'chunków obsłużonych', 758, 372, {
        size: 10, color: C.dim, align: 'right', baseline: 'middle'
      });
      D.bar(ctx, 524, 384, 234, 14, cnt * (K / 32), { fill: C.save, bg: '#1b2440' });
      D.text(ctx, (K - 1) + ' z ' + K + ' chunków leci z prefetchu', 524, 412, { size: 10, color: C.dim });

      D.sceneFoot(ctx, 'SiLo nie sortuje wpisów według rozmiaru — łączy podobieństwo z lokalnością', W, H, C.dim);
    }
  });

})(window.DECK);
