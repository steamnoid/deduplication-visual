/* ch0.js — sceny wprowadzające: dlaczego dedup, plik vs chunk */

(function (D) {
  const C = D.C;

  /* ------------------------------------------------------------------
     1. why-dedup — 12 nocnych kopii tego samego obciążenia.
        Dwa wykresy obok siebie, ta sama skala: bez dedupu / z dedupem.
     ------------------------------------------------------------------ */
  D.scene('why-dedup', {
    title: 'Po co dedup',
    duration: 5.0,
    controls: [{ type: 'toggle', key: 'noDedup', label: 'Pokaż tylko wariant bez dedupu', value: false }],

    draw: function (ctx, t, p) {
      const W = 800, H = 450;
      const days = 12, TB = 2, RATIO = 0.16;
      const shown = Math.max(1, Math.min(days, Math.ceil(D.span(t, 0.06, 0.8) * days)));
      const noDedup = !!p.noDedup;

      D.sceneTitle(ctx, '12 nocnych kopii tego samego obciążenia · ' + days * TB + ' TB danych logicznych', W, C.muted);

      const panels = noDedup
        ? [{ x: 40, title: 'Bez dedupu', color: C.muted, f: 1 }]
        : [
          { x: 40, title: 'Bez dedupu', color: C.muted, f: 1 },
          { x: 412, title: 'Z dedupem', color: C.save, f: RATIO }
        ];

      const maxV = days * TB;
      panels.forEach(pan => {
        const y0 = 92, y1 = 336;
        const bw = (pan.w || 348 - 20) / days;
        const x0 = pan.x + 34;

        D.text(ctx, pan.title, pan.x, 68, { size: 14.5, weight: 700, color: pan.color });

        for (let v = 0; v <= maxV; v += 8) {
          const y = y1 - (v / maxV) * (y1 - y0);
          D.line(ctx, x0, y, pan.x + 328, y, { color: v === 0 ? C.line : '#182338', lw: 1 });
          D.text(ctx, v + ' TB', x0 - 7, y, { size: 10, color: C.dim, align: 'right', baseline: 'middle' });
        }

        for (let i = 0; i < shown; i++) {
          const logical = (i + 1) * TB;
          const physical = logical * pan.f;
          const x = x0 + i * bw + 4;
          const w = bw - 8;

          D.box(ctx, x, y1 - (logical / maxV) * (y1 - y0), w, (logical / maxV) * (y1 - y0), {
            r: 4, fill: D.alpha(C.info, 0.14), stroke: D.alpha(C.info, 0.5), lw: 1
          });
          const hp = (physical / maxV) * (y1 - y0);
          if (hp > 1) D.boxSides(ctx, x, y1 - hp, w, hp, 4, 't', { fill: pan.color });
          if (i % 2 === 0 || shown <= 6) {
            D.text(ctx, String(i + 1), x + w / 2, y1 + 13, { size: 9.5, color: C.dim, align: 'center' });
          }
        }

        // linia trendu fizycznego — tylko do pokazanego dnia
        const yEnd = y1 - (shown * TB * pan.f / maxV) * (y1 - y0);
        ctx.save();
        ctx.strokeStyle = pan.color; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(x0, y1);
        ctx.lineTo(x0 + shown * bw - 4, yEnd);
        ctx.stroke();
        ctx.restore();

      });

      D.text(ctx, 'kolejne noce (dzień 1…' + days + ')   ·   niebieski kontur = rozmiar logiczny, wypełnienie = dane na dysku',
        40, 362, { size: 11.5, color: C.dim });

      // podsumowanie
      const logical = shown * TB, phys = logical * RATIO;
      const msg = noDedup
        ? 'Bez dedupu każda kopia zajmuje pełne ' + (shown * TB) + ' TB. Po ' + days + ' dniach dysk jest pełny.'
        : 'Po ' + shown + ' dniach: ' + (shown * TB) + ' TB logicznie → ' + phys.toFixed(1) + ' TB na dysku. Nowe kopie to głównie metadane.';
      D.wrap(ctx, msg, 40, 394, 720, 20, { size: 14.5, color: C.muted });

      if (!noDedup) {
        const saved = (days * TB) * (1 - RATIO);
        D.pill(ctx, '↘ oszczędność po ' + days + ' dniach: ' + saved.toFixed(0) + ' TB', 40, 420, {
          fill: D.alpha(C.save, 0.16), stroke: C.save, color: C.save, size: 12.5
        });
        D.pill(ctx, 'dedup ratio ≈ ' + (1 / RATIO).toFixed(1) + ' : 1', 292, 420, {
          fill: C.panel2, stroke: C.line, color: C.muted, size: 12.5
        });
      }
    }
  });

  /* ------------------------------------------------------------------
     2. file-vs-chunk — ta sama informacja zapisana na dwa sposoby
     ------------------------------------------------------------------ */
  D.scene('file-vs-chunk', {
    title: 'Plik vs chunk',
    duration: 4.6,
    controls: [{ type: 'button', label: '↻ Odtwórz', action: 'replay' }],

    draw: function (ctx, t, p) {
      const W = 800, H = 450;
      void p;
      D.sceneTitle(ctx, 'Ten sam plik, 3 bajty różnicy na początku', W, C.muted);

      const A = D.makeData(7, 168);
      const B = D.spliceAt(A, 0, 'xyz');
      const x0 = 78, w = W - x0 - 34;
      const reveal = D.span(t, 0.1, 0.45);
      const s = D.easeInOut;

      D.text(ctx, 'DEDUP NA PLIKACH', x0, 78, { size: 11, color: C.muted, weight: 700 });

      // A
      this.chip(ctx, x0, 96, 'A', C.info);
      this.strip(ctx, A, x0, 108, w, 26, reveal, 'whole');
      // B
      this.chip(ctx, x0, 158, 'B', C.info);
      this.strip(ctx, B, x0, 170, w, 26, reveal, 'whole');

      // werdykt dla plików
      const sA = D.span(t, 0.5, 0.68);
      D.arrow(ctx, x0, 206, x0 + 40, 206, { color: C.bad, lw: 2, head: 6 });
      D.text(ctx, 'B ≠ A  →  cały plik zapisujemy drugi raz', x0 + 52, 206, {
        size: 13, color: D.mix(C.text, C.bad, sA), weight: 600, baseline: 'middle'
      });

      D.box(ctx, x0, 226, w * s(sA), 30, { r: 6, fill: C.panel, stroke: C.line });
      D.boxSides(ctx, x0, 226, w * s(sA), 30, 6, 't', { fill: D.alpha(C.bad, 0.5) });
      D.text(ctx, '300% rozmiaru logicznego', x0 + 12, 241, {
        size: 12, weight: 700, color: C.text, baseline: 'middle'
      });

      D.text(ctx, 'DEDUP NA CHUNKACH', x0, 288, { size: 11, color: C.muted, weight: 700 });

      // A po chunkach: wszystkie 11 chunków zapisujemy
      this.chip(ctx, x0, 306, 'A', C.fresh);
      this.strip(ctx, A, x0, 318, w, 26, reveal, 'chunk', 11, t);
      // B po chunkach: tylko chunk 1 jest nowy
      this.chip(ctx, x0, 356, 'B', C.fresh);
      this.strip(ctx, B, x0, 368, w, 26, reveal, 'chunk', 1, t);

      const sB = D.span(t, 0.72, 0.9);
      D.arrow(ctx, x0, 408, x0 + 40, 408, { color: C.save, lw: 2, head: 6 });
      D.text(ctx, 'chunki 2…n identyczne  →  zapisywany jest tylko chunk 1', x0 + 52, 408, {
        size: 13, color: D.mix(C.text, C.save, sB), weight: 600, baseline: 'middle'
      });

      D.box(ctx, x0, 422, w * s(sB), 32, { r: 6, fill: C.panel, stroke: C.line });
      D.boxSides(ctx, x0, 422, w * s(sB) * 0.19, 32, 6, 't', { fill: D.alpha(C.save, 0.75) });
      D.text(ctx, 'zapisano 12 z 22 chunków  ≈  19% danych', x0 + w * 0.21, 438, {
        size: 12, weight: 700, color: C.text, baseline: 'middle'
      });
    },

    chip: function (ctx, x, y, name, color) {
      D.rr(ctx, x, y - 15, 32, 30, 7);
      ctx.fillStyle = D.alpha(color, 0.18); ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.stroke();
      D.text(ctx, name, x + 16, y, { size: 15, weight: 800, color, align: 'center', baseline: 'middle', mono: true });
    },

    /* 'whole' – cały plik jednym kolorem; 'chunk' – podział na 16-bajtowe chunki,
       newCount = ile początkowych chunków faktycznie zapisujemy */
    strip: function (ctx, str, x, y, w, h, reveal, mode, newCount, t) {
      const n = str.length;
      const cs = 16;
      const cnt = Math.ceil(n / cs);
      if (mode === 'whole') {
        D.boxSides(ctx, x, y, w * reveal, h, 6, 't', { fill: D.alpha(C.info, 0.18), stroke: C.info, lw: 1.4 });
        D.text(ctx, n + ' B', x + 10, y + h / 2 + 0.5, {
          size: 11, color: C.info, weight: 700, baseline: 'middle', mono: true
        });
        D.text(ctx, '1 „chunk” = cały plik', x + w - 8, y + h / 2 + 0.5, {
          size: 10.5, color: C.dim, align: 'right', baseline: 'middle'
        });
        return;
      }
      const appRef = D.span(t || 0, 0.7, 0.88, D.easeOut);
      for (let c = 0; c < cnt; c++) {
        const start = c * cs;
        if (start / n > reveal) break;
        const len = Math.min(cs, n - start);
        const isNew = c < newCount;
        const app = isNew ? 1 : appRef;
        const col = isNew ? C.fresh : C.dupe;
        D.boxSides(ctx, x + (start / n) * w, y, (len / n) * w - 1.5, h, 3, 'tlbr', {
          fill: D.alpha(col, 0.18 + 0.34 * app), stroke: D.alpha(col, 0.45 + 0.55 * app), lw: 1
        });
        if (!isNew && app > 0.55) {
          D.text(ctx, '↺', x + (start / n) * w + (len / n) * w / 2 - 1, y + h / 2 + 0.5, {
            size: 10, color: C.dupe, align: 'center', baseline: 'middle', alpha: app
          });
        }
      }
    }
  });

})(window.DECK);
