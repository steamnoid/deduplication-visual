/* ch2.js — Rozdział 2: przegląd dedupu — taksonomia, workflow, scenariusze, mapa technologii */

(function (D) {
  const C = D.C;

  /* ------------------------------------------------------------------
     dedup-taxonomy — trzy osie decyzji (interaktywny wybór)
     ------------------------------------------------------------------ */
  D.scene('dedup-taxonomy', {
    title: 'Taksonomia',
    duration: 6.0,
    controls: [
      { type: 'toggle', key: 'sweep', label: 'Auto: przeglądaj osie', value: true },
      { type: 'select', key: 'axis', label: 'Oś', value: 'granulacja', options: ['granulacja', 'wolumen', 'moment', 'miejsce'], off: 'sweep' }
    ],

    draw: function (ctx, t, p) {
      const W = 800, H = 450;
      const axes = {
        granulacja: {
          title: 'Ziarno dedupu',
          a: { k: 'plik', d: 'cały plik = 1 jednostka', c: C.fresh },
          b: { k: 'chunk', d: 'blok ~KB, zawartość decyduje', c: C.dupe },
          q: 'Chunk daje lepszy dedup ratio, ale kosztuje indeks i CPU.'
        },
        wolumen: {
          title: 'Zakres porównywania',
          a: { k: 'lokalny', d: 'tylko pliki w jednym wolumenie', c: C.info },
          b: { k: 'globalny', d: 'wszystko, co kiedykolwiek zapisano', c: C.violet },
          q: 'Globalny daje lepszy ratio, ale indeks rośnie i słabiej trafia w cache.'
        },
        moment: {
          title: 'Kiedy powstaje decyzja',
          a: { k: 'offline', d: 'po fakcie, skanując istniejące dane', c: C.ref },
          b: { k: 'online (in-line)', d: 'w locie, przed zapisem', c: C.save },
          q: 'In-line nie marnuje miejsca, ale obciąża ścieżkę zapisu.'
        },
        miejsce: {
          title: 'Gdzie działa mechanizm',
          a: { k: 'u źródła', d: 'na kliencie, przed siecią', c: C.cyan },
          b: { k: 'u celu', d: 'w systemie pamięci masowej', c: C.violet },
          q: 'U źródła oszczędza łącze; u celu — klient jest prostszy.'
        }
      };
      const order = ['granulacja', 'wolumen', 'moment', 'miejsce'];
      const key = p.sweep ? order[Math.min(3, Math.floor(D.span(t, 0.02, 0.9) * 4))] : (axes[p.axis] ? p.axis : 'granulacja');
      const ax = axes[key];
      const idx = ['granulacja', 'wolumen', 'moment', 'miejsce'].indexOf(key);
      const local = D.span(t, 0.05, 0.2) > 0.5 ? 1 : 0;
      void local;

      D.sceneTitle(ctx, 'Trzy (cztery) osie, po których porównuje się systemy dedupu', W, C.muted);

      // karty dwóch opcji
      const cw = 300, ch = 150, gap = 36;
      const xa = 44 + (idx % 2) * 6, ya = 86;
      [ax.a, ax.b].forEach((o, i) => {
        const x = i === 0 ? xa : xa + cw + gap + 12;
        const focused = D.easeInOut(D.span(t, 0.1, 0.3));
        D.box(ctx, x, ya, cw, ch, {
          r: 12, fill: D.alpha(o.c, 0.08 + 0.1 * focused), stroke: D.alpha(o.c, 0.4 + 0.5 * focused), lw: 1.4
        });
        D.text(ctx, o.k.toUpperCase(), x + 20, ya + 34, { size: 17, weight: 800, color: o.c });
        D.wrap(ctx, o.d, x + 20, ya + 62, cw - 40, 19, { size: 13, color: C.muted });
      });

      D.text(ctx, 'vs', xa + cw + gap / 2 + 6, ya + ch / 2, {
        size: 13, color: C.dim, align: 'center', baseline: 'middle', weight: 700
      });

      // notatka
      const ny = ya + ch + 22;
      D.box(ctx, 44, ny, W - 88, 40, { r: 9, fill: C.panel, stroke: C.line });
      D.text(ctx, '⚖  ' + ax.q, 60, ny + 20, { size: 13.5, color: C.text, baseline: 'middle', weight: 600 });

      // suwak osi
      const labels = ['granulacja', 'wolumen', 'moment', 'miejsce'];
      const sy = 398;
      D.text(ctx, 'oś:', 44, sy, { size: 12, color: C.dim, baseline: 'middle' });
      const sx0 = 80, sw = 620;
      D.line(ctx, sx0, sy, sx0 + sw, sy, { color: C.line, lw: 3 });
      labels.forEach((l, i) => {
        const x = sx0 + (sw / 3) * i;
        const on = i === idx;
        ctx.beginPath();
        ctx.arc(x, sy, on ? 8 : 5, 0, Math.PI * 2);
        ctx.fillStyle = on ? D.CH[2] : C.panel2; ctx.fill();
        ctx.strokeStyle = on ? D.CH[2] : C.line; ctx.lineWidth = 2; ctx.stroke();
        D.text(ctx, l, x, sy + 24, {
          size: 11.5, color: on ? C.text : C.dim, align: 'center', weight: on ? 700 : 500
        });
      });
      const kx = sx0 + (sw / 3) * idx;
      const kt = D.easeInOut(D.span(t, 0.05, 0.25));
      ctx.beginPath();
      ctx.arc(kx, sy, 15, 0, Math.PI * 2);
      ctx.strokeStyle = D.alpha(D.CH[2], 0.3 + 0.35 * kt); ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath();
      ctx.arc(kx, sy, 20, 0, Math.PI * 2);
      ctx.strokeStyle = D.alpha(D.CH[2], 0.18 * kt); ctx.lineWidth = 3; ctx.stroke();
    }
  });

  /* ------------------------------------------------------------------
     dedup-workflow — pełna ścieżka chunka (kluczowa scena rozdziału)
     ------------------------------------------------------------------ */
  D.scene('dedup-workflow', {
    title: 'Workflow dedupu',
    duration: 6.4,

    draw: function (ctx, t, p) {
      const W = 800, H = 450;
      void p;
      D.sceneTitle(ctx, 'Co dzieje się z każdym chunkiem pliku', W, C.muted);

      /* --- dane wejściowe: 10 chunków, 4 z nich duplikaty --- */
      const dupes = { 1: 1, 4: 1, 6: 1, 8: 1 };   // indeksy chunków będące duplikatami
      const CS = 40;

      D.pill(ctx, 'raport_kopia.pdf · 400 B', 30, 52, { fill: C.panel2, stroke: C.line, color: C.muted, size: 12 });

      const pipeY = 116, nodeH = 70;
      const nodes = [
        { x: 30, w: 118, label: 'Plik', sub: 'strumień bajtów', color: C.text },
        { x: 186, w: 118, label: 'Chunker', sub: 'CDC', color: C.info },
        { x: 342, w: 118, label: 'Hash', sub: 'odcisk palca', color: C.info },
        { x: 498, w: 118, label: 'Indeks', sub: 'RAM: hash → dane', color: C.violet },
        { x: 654, w: 118, label: 'Zapis', sub: 'container', color: C.fresh }
      ];
      nodes.forEach((n, i) => {
        D.box(ctx, n.x, pipeY, n.w, nodeH, { r: 10, fill: C.panel, stroke: C.line });
        D.text(ctx, n.label, n.x + n.w / 2, pipeY + 28, {
          size: 14, weight: 700, color: n.color, align: 'center', baseline: 'middle'
        });
        D.text(ctx, n.sub, n.x + n.w / 2, pipeY + 47, {
          size: 10.5, color: C.dim, align: 'center', baseline: 'middle'
        });
        if (i < nodes.length - 1) {
          D.arrow(ctx, n.x + n.w + 4, pipeY + nodeH / 2, nodes[i + 1].x - 4, pipeY + nodeH / 2,
            { color: C.line, lw: 1.6, head: 6 });
        }
      });

      /* --- pasmo chunków pliku --- */
      const cy = 234, csW = (W - 60) / 10;
      D.text(ctx, 'chunki po podziale', 30, 216, { size: 11, color: C.dim, weight: 700 });
      for (let i = 0; i < 10; i++) {
        const x = 30 + i * csW;
        const isDupe = !!dupes[i];
        const arrive = D.span(t, 0.12 + i * 0.055, 0.2 + i * 0.055);
        D.box(ctx, x + 3, cy, csW - 6, 30, {
          r: 4,
          fill: arrive > 0 ? D.alpha(isDupe ? C.dupe : C.fresh, 0.25) : '#141d33',
          stroke: arrive > 0 ? (isDupe ? C.dupe : C.fresh) : '#212c49',
          lw: 1
        });
        if (arrive > 0.4) {
          D.text(ctx, isDupe ? '↺' : 'N', x + csW / 2, cy + 15, {
            size: 13, weight: 800, color: isDupe ? C.dupe : C.fresh, align: 'center', baseline: 'middle'
          });
        }
        D.text(ctx, 'c' + (i + 1), x + csW / 2, cy + 44, {
          size: 9.5, color: C.dim, align: 'center', baseline: 'middle'
        });
      }

      /* --- decyzja: hit / miss --- */
      const done = D.span(t, 0.72, 0.95);
      const miss = [0, 2, 3, 5, 7, 9];        // chunki zapisywane
      const hit = [1, 4, 6, 8];                // duplikaty

      D.box(ctx, 498, 312, 118, 62, { r: 8, fill: C.panel, stroke: C.line });
      D.text(ctx, 'w indeksie?', 557, 330, { size: 11.5, color: C.muted, align: 'center', baseline: 'middle', weight: 600 });
      const hitN = Math.floor(done * hit.length), missN = Math.floor(done * miss.length);
      D.text(ctx, 'tak: ' + hitN + '  /  nie: ' + missN, 557, 352, {
        size: 11.5, color: C.text, align: 'center', baseline: 'middle', mono: true
      });

      D.arrow(ctx, 620, 330, 686, 316, { color: D.alpha(C.dupe, done), lw: 2, head: 6 });
      D.text(ctx, 'TAK', 654, 300, { size: 10.5, color: D.mix(C.dim, C.dupe, done), weight: 700, align: 'center' });
      D.arrow(ctx, 620, 358, 686, 400, { color: D.alpha(C.fresh, done), lw: 2, head: 6 });
      D.text(ctx, 'NIE', 654, 398, { size: 10.5, color: D.mix(C.dim, C.fresh, done), weight: 700, align: 'center' });

      /* --- co się dzieje dalej --- */
      D.box(ctx, 690, 292, 84, 46, { r: 8, fill: D.alpha(C.dupe, 0.12), stroke: D.alpha(C.dupe, 0.5) });
      D.text(ctx, 'referencja', 732, 308, { size: 10.5, color: C.dupe, align: 'center', baseline: 'middle', weight: 700 });
      D.text(ctx, '(lokalizacja)', 732, 324, { size: 9, color: C.dim, align: 'center', baseline: 'middle' });

      D.box(ctx, 690, 380, 84, 46, { r: 8, fill: D.alpha(C.fresh, 0.12), stroke: D.alpha(C.fresh, 0.5) });
      D.text(ctx, 'zapis danych', 732, 396, { size: 10.5, color: C.fresh, align: 'center', baseline: 'middle', weight: 700 });
      D.text(ctx, '+ metadane', 732, 412, { size: 9, color: C.dim, align: 'center', baseline: 'middle' });

      /* --- licznik oszczędności --- */
      const saved = Math.min(4, Math.floor(done * 4)) * CS;
      D.box(ctx, 30, 312, 440, 96, { r: 10, fill: C.panel, stroke: C.line });
      D.text(ctx, 'BAJTY ZAPISANE NA DYSK', 48, 334, { size: 10.5, color: C.dim, weight: 700 });
      const total = 10 * CS, written = total - saved;
      D.bar(ctx, 48, 348, 404, 16, written / total, { fill: C.fresh, bg: '#1b2440' });
      D.box(ctx, 48 + 404 * written / total, 348, 404 * saved / total, 16, { r: 0, fill: D.alpha(C.save, 0.3) });
      D.text(ctx, Math.round(written) + ' B zapisane', 48, 384, {
        size: 12, color: C.fresh, weight: 700, baseline: 'middle'
      });
      D.text(ctx, saved + ' B zaoszczędzone (' + Math.round(saved / total * 100) + '%)', 200, 384, {
        size: 12, color: C.save, weight: 700, baseline: 'middle'
      });
    }
  });

  /* ------------------------------------------------------------------
     dedup-scenarios — sześć miejsc, w których dedup bywa stosowany
     ------------------------------------------------------------------ */
  D.scene('dedup-scenarios', {
    title: 'Scenariusze',
    duration: 6.0,

    draw: function (ctx, t, p) {
      const W = 800, H = 450;
      void p;
      D.sceneTitle(ctx, 'Gdzie dedup się opłaca', W, C.muted);

      const items = [
        { t: 'Kopia zapasowa', d: 'największy zysk: te same pliki w kółko', c: C.fresh },
        { t: 'Pamięć wtórna', d: 'archiwa, repozytoria, macierze', c: C.fresh },
        { t: 'Pamięć pierwotna', d: 'VM-y z jednego szablonu', c: C.info },
        { t: 'Chmura', d: 'wiele kont z tymi samymi obrazami', c: C.info },
        { t: 'SSD / flash', d: 'mała pojemność → każdy MB się liczy', c: C.dupe },
        { t: 'Sieć', d: 'mniej bajtów w tranzycie do backupu', c: C.violet }
      ];

      const cw = 240, chh = 118, gx = 20, gy = 20;
      const x0 = (W - (cw * 3 + gx * 2)) / 2, y0 = 86;

      items.forEach((it, i) => {
        const col = i % 3, row = (i / 3) | 0;
        const x = x0 + col * (cw + gx), y = y0 + row * (chh + gy);
        const act = D.easeInOut(D.span(t, 0.08 + i * 0.11, 0.26 + i * 0.11));
        D.box(ctx, x, y, cw, chh, {
          r: 11,
          fill: D.alpha(it.c, 0.06 + 0.12 * act),
          stroke: D.alpha(it.c, 0.3 + 0.6 * act), lw: 1.3
        });
        // ikona
        const ix = x + 26, iy = y + 30;
        ctx.save();
        ctx.globalAlpha = 0.4 + 0.6 * act;
        this.icon(ctx, i, ix, iy, it.c);
        ctx.restore();
        D.text(ctx, it.t, x + 50, y + 30, { size: 14, weight: 700, color: it.c, baseline: 'middle' });
        D.wrap(ctx, it.d, x + 16, y + 62, cw - 32, 17, { size: 11.5, color: C.muted });
      });

      D.wrap(ctx, 'Wspólny mianownik: dane są powtarzalne, a nośnik jest drogi. Im droższy zapis (SSD, chmura) i im więcej powtórzeń, tym większa rola dedupu.',
        x0, y0 + 2 * (chh + gy) + 6, cw * 3 + gx * 2, 19, { size: 12.5, color: C.dim });

      D.sceneFoot(ctx, 'rozdział 2.3 — scenariusze zastosowań', W, H, C.dim);
    },

    icon: function (ctx, i, x, y, c) {
      ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = 1.8; ctx.lineJoin = 'round';
      if (i === 0 || i === 1) {           // dysk
        ctx.beginPath(); ctx.ellipse(x, y - 5, 12, 5, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 12, y - 5); ctx.lineTo(x - 12, y + 5);
        ctx.quadraticCurveTo(x, y + 12, x + 12, y + 5); ctx.lineTo(x + 12, y - 5); ctx.stroke();
      } else if (i === 2 || i === 3) {     // chmura
        ctx.beginPath();
        ctx.arc(x - 5, y + 1, 6, Math.PI * 0.6, Math.PI * 1.5);
        ctx.arc(x + 2, y - 3, 8, Math.PI * 1.2, Math.PI * 1.9);
        ctx.arc(x + 8, y + 2, 5, Math.PI * 1.6, Math.PI * 0.5);
        ctx.closePath(); ctx.stroke();
      } else if (i === 4) {                // chip
        ctx.beginPath(); ctx.rect(x - 9, y - 9, 18, 18); ctx.stroke();
        for (let k = -5; k <= 5; k += 5) {
          ctx.beginPath(); ctx.moveTo(x + k, y - 9); ctx.lineTo(x + k, y - 14); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x + k, y + 9); ctx.lineTo(x + k, y + 14); ctx.stroke();
        }
      } else {                             // sieć
        ctx.beginPath();
        ctx.moveTo(x, y - 10); ctx.lineTo(x, y - 4);
        ctx.moveTo(x - 11, y + 8); ctx.lineTo(x - 11, y + 2); ctx.lineTo(x + 11, y + 2); ctx.lineTo(x + 11, y + 8);
        ctx.moveTo(x, y - 4); ctx.lineTo(x - 11, y + 2); ctx.moveTo(x, y - 4); ctx.lineTo(x + 11, y + 2);
        ctx.stroke();
      }
    }
  });

  /* ------------------------------------------------------------------
     key-tech-map — pięć kluczowych technologii i ich rozdziały
     ------------------------------------------------------------------ */
  D.scene('key-tech-map', {
    title: 'Mapa technologii',
    duration: 5.2,

    draw: function (ctx, t, p) {
      const W = 800, H = 450;
      void p;
      D.sceneTitle(ctx, 'Pięć filarów systemu dedupu (i rozdział, który je opisuje)', W, C.muted);

      const tech = [
        { ch: 3, name: 'Chunking', q: 'Jak wycinać fragmenty?', d: 'CDC · AE · FastCDC', c: D.CH[3] },
        { ch: 4, name: 'Indeksowanie', q: 'Jak szybko znaleźć duplikat?', d: 'Extreme Binning · SiLo', c: D.CH[4] },
        { ch: 5, name: 'Rewriting', q: 'Co zrobić ze śmieciami?', d: 'HAR · CABdedup', c: D.CH[5] },
        { ch: 6, name: 'Bezpieczeństwo', q: 'Jak nie zdradzić pliku?', d: 'CE · MLK · UACE · SecDep', c: D.CH[6] },
        { ch: 7, name: 'Delta compression', q: 'Co z podobnym, ale nie identycznym?', d: 'Ddelta · DARE', c: D.CH[7] }
      ];

      const x0 = 40, y0 = 58, rh = 52;
      tech.forEach((it, i) => {
        const y = y0 + i * rh;
        const act = D.easeInOut(D.span(t, 0.06 + i * 0.11, 0.26 + i * 0.11));
        D.box(ctx, x0, y, W - x0 - 40, rh - 8, {
          r: 9, fill: D.alpha(it.c, 0.05 + 0.1 * act), stroke: D.alpha(it.c, 0.2 + 0.45 * act), lw: 1.1
        });
        D.boxSides(ctx, x0, y, 5, rh - 8, 3, 'l', { fill: it.c });

        D.pill(ctx, 'rozdz. ' + it.ch, x0 + 16, y + 12, {
          fill: D.alpha(it.c, 0.16), color: it.c, size: 10, h: 20
        });
        D.text(ctx, it.name, x0 + 100, y + 22, { size: 14, weight: 700, color: it.c, baseline: 'middle' });
        D.text(ctx, it.q, x0 + 296, y + 22, { size: 13, color: C.text, baseline: 'middle' });
        D.text(ctx, it.d, W - 60, y + 22, {
          size: 11, color: C.dim, align: 'right', baseline: 'middle', mono: true
        });
      });

      // framework
      const fy = y0 + tech.length * rh + 6;
      const fact = D.easeInOut(D.span(t, 0.62, 0.85));
      D.box(ctx, x0, fy, W - x0 - 40, 52, {
        r: 9, fill: D.alpha(D.CH[8], 0.08 + 0.12 * fact), stroke: D.alpha(D.CH[8], 0.3 + 0.5 * fact), lw: 1.2
      });
      D.boxSides(ctx, x0, fy, 5, 52, 3, 'l', { fill: D.CH[8] });
      D.pill(ctx, 'rozdz. 8', x0 + 16, fy + 16, { fill: D.alpha(D.CH[8], 0.18), color: D.CH[8], size: 10, h: 20 });
      D.text(ctx, 'Framework', x0 + 100, fy + 26, { size: 14, weight: 700, color: D.CH[8], baseline: 'middle' });
      D.text(ctx, 'pipeline backupu i restore, GC, near-exact dedup, rekomendacje projektowe',
        x0 + 296, fy + 26, { size: 13, color: C.text, baseline: 'middle' });

      D.sceneFoot(ctx, 'pięć technologii · osiem rozdziałów', W, H, C.dim);
    }
  });

})(window.DECK);
