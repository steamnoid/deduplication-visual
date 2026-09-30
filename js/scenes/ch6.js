/* ch6.js — Rozdział 6: bezpieczny dedup (wyciek informacji, CE, MLK, UACE, SecDep) */

(function (D) {
  const C = D.C;

  /* ------------------------------------------------------------------
     1. dedup-leak — sam fakt istnienia pliku jest informacją
     ------------------------------------------------------------------ */
  D.scene('dedup-leak', {
    title: 'Wyciek przez dedup',
    duration: 6.0,
    controls: [{ type: 'button', label: '↻ Odtwórz', action: 'replay' }],

    draw: function (ctx, t, p) {
      const W = 800, H = 450;
      void p;
      D.sceneTitle(ctx, 'Serwer odpowiada szybciej, gdy plik już u siebie ma', W, C.muted);

      const y0 = 128;
      // klient
      D.box(ctx, 46, y0 - 40, 152, 112, { r: 10, fill: C.panel, stroke: C.line });
      D.text(ctx, 'atakujący', 122, y0 - 18, { size: 13, weight: 700, color: C.bad, align: 'center', baseline: 'middle' });
      D.text(ctx, '„mam plik poufny', 122, y0 + 6, { size: 10.5, color: C.muted, align: 'center', baseline: 'middle' });
      D.text(ctx, 'raport_płacowy.pdf”', 122, y0 + 24, { size: 10.5, color: C.muted, align: 'center', baseline: 'middle' });

      // serwer
      D.box(ctx, 602, y0 - 40, 152, 112, { r: 10, fill: C.panel, stroke: C.line });
      D.text(ctx, 'backup', 678, y0 - 18, { size: 13, weight: 700, color: C.text, align: 'center', baseline: 'middle' });
      D.text(ctx, 'chunki w indeksie', 678, y0 + 6, { size: 10.5, color: C.muted, align: 'center', baseline: 'middle' });

      // dwa przebiegi
      const runs = [
        { y: y0 + 6, name: 'pliku NIE ma', fast: false, col: C.dim, resp: '„zapisuję nowy chunk”', ms: 95 },
        { y: y0 + 74, name: 'plik JEST w backupie', fast: true, col: C.bad, resp: '„już mam, nie zapisuję”', ms: 32 }
      ];
      runs.forEach((r, k) => {
        const act = D.span(t, 0.14 + k * 0.22, 0.5 + k * 0.22);
        D.text(ctx, r.name, 210, r.y - 12, { size: 11.5, color: r.col, weight: 600 });

        D.box(ctx, 210, r.y, 44, 24, { r: 4, fill: D.alpha(C.info, 0.2), stroke: C.info, lw: 1 });
        D.text(ctx, 'plik', 232, r.y + 12, { size: 9, color: C.info, align: 'center', baseline: 'middle' });

        // strzałka „leci” przez czas odpowiedzi
        const len = 30 + 330 * D.easeOut(D.clamp(act / (r.ms / 110), 0, 1));
        D.arrow(ctx, 258, r.y + 12, 258 + len, r.y + 12, {
          color: D.alpha(r.col, D.easeInOut(act * 3)), lw: 2, head: 7
        });

        // pasek czasu odpowiedzi
        const by = r.y + 30;
        D.box(ctx, 258, by, 330, 10, { r: 5, fill: '#151e33' });
        D.box(ctx, 258, by, 330 * (r.ms / 110), 10, { r: 5, fill: D.alpha(r.col, D.easeInOut(act * 2)) });
        D.text(ctx, r.ms + ' ms', 598, by + 5, {
          size: 10.5, color: r.col, weight: 700, baseline: 'middle', align: 'right'
        });

        if (act > 0.55) {
          D.box(ctx, 602, r.y, 152, 24, { r: 4, fill: D.alpha(r.col, 0.14), stroke: D.alpha(r.col, 0.5), lw: 1 });
          D.text(ctx, r.resp, 678, r.y + 12, {
            size: 10, color: r.col, align: 'center', baseline: 'middle'
          });
        }
      });

      // zegar porównawczy
      D.box(ctx, 46, 300, W - 92, 52, { r: 9, fill: D.panel, stroke: C.line });
      D.text(ctx, 'Czas odpowiedzi sam w sobie jest sygnałem:', 64, 314, { size: 12.5, color: C.text, baseline: 'middle' });
      D.text(ctx, 'dedup zamienia pytanie „czy masz te dane?” na pytanie „czy masz dokładnie ten chunk?”.',
        64, 332, { size: 12, color: C.muted, baseline: 'middle' });

      // rozwiązanie + zastrzeżenie
      const act = D.easeInOut(D.span(t, 0.62, 0.85));
      D.box(ctx, 46, 358, W - 92, 40, { r: 9, fill: D.alpha(C.ref, 0.08 + 0.1 * act), stroke: D.alpha(C.ref, 0.3 + 0.5 * act) });
      D.text(ctx, 'Rozwiązanie: szyfrowanie zbieżne (CE) — serwer porównuje zaszyfrowane chunki, a nie jawne.',
        64, 378, { size: 12, color: D.mix(C.muted, C.ref, act), baseline: 'middle', weight: 600 });
      const act2 = D.easeInOut(D.span(t, 0.78, 0.95));
      D.box(ctx, 46, 404, W - 92, 38, { r: 9, fill: D.alpha(C.bad, 0.05 + 0.08 * act2), stroke: D.alpha(C.bad, 0.2 + 0.4 * act2) });
      D.text(ctx, 'Ale: serwer wciąż widzi rozmiary chunków, a słabe dane (teksty, hasła) można zgadywać atakiem siłowym.',
        64, 423, { size: 11.5, color: D.mix(C.muted, C.text, act2), baseline: 'middle' });
    }
  });

  /* ------------------------------------------------------------------
     2. key-hierarchy — CE → MLK → UACE → SecDep
     ------------------------------------------------------------------ */
  D.scene('key-hierarchy', {
    title: 'Hierarchia kluczy',
    duration: 6.4,
    controls: [
      { type: 'toggle', key: 'sweep', label: 'Auto: przejdź przez warianty', value: true },
      { type: 'select', key: 'v', label: 'Wariant', value: 'ce', options: ['ce', 'mlk', 'uace', 'secddep'], off: 'sweep' }
    ],

    draw: function (ctx, t, p) {
      const W = 800, H = 450;
      const variants = [
        {
          id: 'ce', n: 'Convergent Encryption', c: C.fresh,
          keys: ['klucz globalny'],
          hide: 'treść danych', leak: 'plik wciąż łatwo rozpoznać', ratio: '100%'
        },
        {
          id: 'mlk', n: 'Message-Locked Key', c: C.ref,
          keys: ['klucz globalny', 'klucz z wiadomości'],
          hide: 'to, że dwa pliki to ta sama treść', leak: 'brak klucza dla danego użytkownika', ratio: '100%'
        },
        {
          id: 'uace', n: 'User-Aware CE', c: C.cyan,
          keys: ['klucz globalny', 'klucz z wiadomości', 'sekret użytkownika'],
          hide: 'kto wgrał dane', leak: 'dwa konta nie współdzielą plików', ratio: '≈100%'
        },
        {
          id: 'secddep', n: 'SecDep', c: C.save,
          keys: ['klucz globalny', 'klucz z wiadomości', 'sekret użytkownika', 'poziomy zarządzania kluczami'],
          hide: 'plik, użytkownika i poziom dostępu', leak: 'brak widocznych różnic', ratio: '≈100%'
        }
      ];
      const order = ['ce', 'mlk', 'uace', 'secddep'];
      const vi = p.sweep ? Math.min(3, Math.floor(D.span(t, 0.03, 0.92) * 4)) : order.indexOf(p.v);
      const v = variants[vi] || variants[0];
      const act = D.easeInOut(D.span(t, 0.03 + vi * 0.22, 0.2 + vi * 0.22));

      D.sceneTitle(ctx, 'Ten sam plik, cztery poziomy ukrywania', W, C.muted);

      // nagłówek wariantu
      D.box(ctx, 46, 78, W - 92, 56, { r: 10, fill: D.alpha(v.c, 0.08 + 0.1 * act), stroke: D.alpha(v.c, 0.3 + 0.5 * act) });
      D.text(ctx, v.n, 66, 106, { size: 17, weight: 800, color: v.c, baseline: 'middle' });
      D.text(ctx, 'ukrywa: ' + v.hide, 300, 100, { size: 12, color: C.text, baseline: 'middle' });
      D.text(ctx, v.leak, 300, 118, { size: 11, color: C.dim });
      D.pill(ctx, 'dedup ratio ' + v.ratio, W - 60, 96, { align: 'right', fill: C.panel2, stroke: C.line, color: C.muted, size: 11 });

      // łańcuch kluczy
      D.text(ctx, 'łańcuch kluczy', 46, 172, { size: 11, color: C.dim, weight: 700 });
      const ky = 190;
      v.keys.forEach((k, i) => {
        const x = 46 + i * 190;
        const on = D.easeInOut(D.span(t, 0.06 + i * 0.16, 0.26 + i * 0.16));
        D.box(ctx, x, ky, 168, 54, {
          r: 9, fill: D.alpha(v.c, 0.06 + 0.12 * on), stroke: D.alpha(v.c, 0.25 + 0.5 * on), lw: 1.2
        });
        D.text(ctx, k, x + 12, ky + 22, { size: 12, weight: 700, color: D.mix(C.dim, v.c, on), baseline: 'middle' });
        D.text(ctx, i === 0 ? 'serwer' : i === 1 ? 'z samej treści' : i === 2 ? 'tylko właściciel' : 'zarządza nimi system',
          x + 12, ky + 40, { size: 10, color: C.dim, baseline: 'middle' });
        if (i < v.keys.length - 1) {
          D.arrow(ctx, x + 170, ky + 27, x + 186, ky + 27, { color: D.alpha(v.c, on * 0.7), lw: 1.6, head: 5 });
        }
      });

      // co widzi serwer
      D.box(ctx, 46, 268, W - 92, 74, { r: 9, fill: C.panel, stroke: C.line });
      D.text(ctx, 'Co widzi serwer', 64, 290, { size: 11, color: C.dim, weight: 700 });
      const nChunks = 8;
      for (let i = 0; i < nChunks; i++) {
        const x = 64 + i * 46;
        const same = i % 3 !== 0;
        D.box(ctx, x, 302, 40, 26, {
          r: 4, fill: D.alpha(same ? C.dupe : C.fresh, 0.2), stroke: D.alpha(same ? C.dupe : C.fresh, 0.5), lw: 1
        });
        D.text(ctx, same ? '▓▓▓' : '▒▒▒', x + 20, 315, {
          size: 10, color: same ? C.dupe : C.fresh, align: 'center', baseline: 'middle'
        });
      }
      D.text(ctx, 'identyczne bloki = te same chunki, niezależnie od pliku i użytkownika',
        W - 60, 290, { size: 11, color: C.dim, align: 'right' });

      D.text(ctx, 'Koszt: szyfrowanie i zarządzanie kluczami. Zysk: serwer nie zdradza, czego nie ma.',
        46, 372, { size: 12.5, color: C.muted });

      // postęp wariantów
      order.forEach((id, i) => {
        const x = 46 + i * 130;
        const on = i === vi;
        D.pill(ctx, id.toUpperCase(), x, 396, {
          fill: on ? D.alpha(v.c, 0.25) : C.panel2,
          stroke: on ? v.c : C.line, color: on ? C.text : C.dim, size: 11
        });
      });
    }
  });

})(window.DECK);
