/* ch1.js — Rozdział 1: dedup wyrósł z systemów backupu */

(function (D) {
  const C = D.C;

  /* ------------------------------------------------------------------
     backup-evolution — 10 zachowanych wersji zbioru plików:
     pełna kopia / przyrostowa / dedupowa
     ------------------------------------------------------------------ */
  D.scene('backup-evolution', {
    title: 'Trzy strategie retencji',
    duration: 6.0,
    controls: [{ type: 'button', label: '↻ Odtwórz', action: 'replay' }],

    draw: function (ctx, t, p) {
      const W = 800, H = 450;
      void p;
      D.sceneTitle(ctx, 'Ten sam zbiór plików, 10 zachowanych wersji — co zajmuje miejsce i ile trwa restore', W, C.muted);

      const rows = [
        { name: 'Pełna kopia', sub: 'full', color: C.bad, w: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], sum: '1000%', note: 'czytanie 1 wersji' },
        { name: 'Kopia przyrostowa', sub: 'incremental', color: C.ref, w: [1, .02, .02, .02, .02, .02, .02, .02, .02, .02], sum: '118%', note: 'restore = baza + 9 delt' },
        { name: 'Kopia z dedupem', sub: 'dedup-based', color: C.save, w: [1, .01, .01, .01, .01, .01, .01, .01, .01, .01], sum: '109%', note: 'restore = skok po chunkach' }
      ];

      const x0 = 40, y0 = 66, rh = 88, bw = (W - 250 - x0) / 10;
      rows.forEach((row, r) => {
        const y = y0 + r * rh;
        const shown = Math.max(1, Math.min(10, Math.ceil(D.span(t, 0.05 + r * 0.1, 0.5 + r * 0.1) * 10)));

        D.text(ctx, row.name, x0, y + 14, { size: 14.5, weight: 700, color: row.color });
        D.text(ctx, row.sub, x0 + 220, y + 14, { size: 11, color: C.dim, baseline: 'middle' });

        for (let i = 0; i < 10; i++) {
          const x = x0 + i * bw;
          const on = i < shown;
          const full = bw - 6;
          D.box(ctx, x, y + 26, full, 34, { r: 4, fill: '#121a2e', stroke: '#1e2846' });
          if (on) {
            D.boxSides(ctx, x, y + 26, Math.max(4, full * row.w[i]), 34, 4, 't', {
              fill: D.alpha(row.color, 0.85)
            });
          }
          D.text(ctx, 'v' + (i + 1), x + full / 2, y + 70, {
            size: 9.5, color: on ? C.muted : C.dim, align: 'center'
          });
        }

        // metryki po prawej
        const mx = x0 + 10 * bw + 16;
        D.text(ctx, row.sum, mx, y + 30, { size: 19, weight: 800, color: row.color, baseline: 'middle' });
        D.text(ctx, 'zajętego miejsca', mx + 74, y + 31, { size: 10.5, color: C.dim, baseline: 'middle' });
        D.text(ctx, row.note, mx, y + 52, { size: 11, color: C.muted });
      });

      // oś: 10 wersji
      D.text(ctx, 'wersje czasu (v1 … v10)', x0, y0 + 3 * rh + 4, { size: 10.5, color: C.dim });

      D.wrap(ctx, 'Przyrostowo oszczędza na niezmienionych plikach, ale każda kolejna wersja zależy od poprzedniej — im głębsza retencja, tym dłuższy restore. Dedup przechowuje tyle samo unikalnych chunków, ale każdą wersję odtwarza jednym skokiem po tablicy referencji.',
        x0, 384, W - 80, 19, { size: 12.5, color: C.muted });

      D.sceneFoot(ctx, 'rozdział 1–2 · dedup vs. klasyczne strategie backupu', W, H, C.dim);
    }
  });

})(window.DECK);
