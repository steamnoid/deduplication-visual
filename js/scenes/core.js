/* core.js — przestrzeń nazw, rejestr scen i slajdów, narzędzia rysowania.
   Wszystko na klasycznych skryptach (bez modułów), żeby deck działał z file:// */

window.DECK = (function () {
  const D = {
    scenes: {},
    slides: [],
    chapters: {}
  };

  /* ---------- rejestr ---------- */

  D.scene = function (id, def) {
    def.id = id;
    def.duration = def.duration || 3.6;
    def.width = def.width || 800;
    def.height = def.height || 450;
    def.controls = def.controls || [];
    D.scenes[id] = def;
    return def;
  };

  D.slide = function (def) {
    D.slides.push(def);
    return def;
  };

  D.chapter = function (key, def) {
    D.chapters[key] = def;
  };

  /* ---------- paleta wspólna scenom ---------- */

  const C = {
    bg: '#0b1120',
    bgSoft: '#101a2e',
    panel: '#18223a',
    panel2: '#1f2b48',
    line: '#2b3859',
    text: '#e9eefb',
    muted: '#94a3c2',
    dim: '#5b6b8c',
    dupe: '#2ec4b6',
    dupeDim: '#1b6b64',
    fresh: '#f4a261',
    ref: '#ffd166',
    save: '#06d6a0',
    bad: '#ef476f',
    info: '#5aa9e6',
    violet: '#b388eb',
    cyan: '#48cae4'
  };
  D.C = C;

  D.CH = {
    0: '#8fa3c8',
    1: '#f4a261',
    2: '#5aa9e6',
    3: '#2ec4b6',
    4: '#b388eb',
    5: '#ef476f',
    6: '#ffd166',
    7: '#48cae4',
    8: '#a0c4ff'
  };

  /* ---------- matematyka / czas ---------- */

  D.prng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  D.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  D.lerp = (a, b, t) => a + (b - a) * t;
  D.ease = (t) => t * t * (3 - 2 * t);
  D.easeOut = (t) => 1 - Math.pow(1 - t, 3);
  D.easeIn = (t) => t * t * t;
  D.easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  D.bounce = (t) => {
    if (t < 0.5) return D.easeOut(t * 2);
    return D.easeOut((1 - t) * 2) * 0.4 + 0.6;
  };

  /* Znormalizowany postęp pod-interwału [a,b] z easingiem. */
  D.span = function (t, a, b, easing) {
    if (t <= a) return 0;
    if (t >= b) return 1;
    const u = (t - a) / (b - a);
    return (easing || D.ease)(u);
  };

  /* Czy jesteśmy w pod-interwale? */
  D.inSpan = (t, a, b) => t >= a && t < b;

  /* ---------- geometria ---------- */

  D.rr = function (ctx, x, y, w, h, r) {
    const rad = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
  };

  /* Zaokrąglony prostokąt z obwódką i (opcjonalnie) wypełnieniem. */
  D.box = function (ctx, x, y, w, h, o) {
    o = o || {};
    D.rr(ctx, x, y, w, h, o.r == null ? 6 : o.r);
    if (o.fill) {
      ctx.fillStyle = o.fill;
      ctx.fill();
    }
    if (o.stroke) {
      ctx.strokeStyle = o.stroke;
      ctx.lineWidth = o.lw || 1;
      if (o.dash) ctx.setLineDash(o.dash);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };

  /* Prostokąt z zaokrąglonymi tylko wybranymi rogami (domyślnie wszystkie). */
  D.boxSides = function (ctx, x, y, w, h, r, sides, o) {
    o = o || {};
    const tl = sides.indexOf('t') >= 0 ? r : 0;
    const tr = sides.indexOf('r') >= 0 ? r : 0;
    const br = sides.indexOf('b') >= 0 ? r : 0;
    const bl = sides.indexOf('l') >= 0 ? r : 0;
    ctx.beginPath();
    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + w - tr, y + (tr ? tr : 0));
    if (tr) ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
    ctx.lineTo(x + w, y + h - br);
    if (br) ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
    ctx.lineTo(x + bl, y + h);
    if (bl) ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
    ctx.lineTo(x, y + tl);
    if (tl) ctx.quadraticCurveTo(x, y, x + tl, y);
    ctx.closePath();
    if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
    if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 1; ctx.stroke(); }
  };

  D.alpha = function (hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  };

  D.mix = function (a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(D.lerp((pa >> 16) & 255, (pb >> 16) & 255, t));
    const g = Math.round(D.lerp((pa >> 8) & 255, (pb >> 8) & 255, t));
    const bl = Math.round(D.lerp(pa & 255, pb & 255, t));
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  };

  /* ---------- tekst ---------- */

  D.font = function (ctx, o) {
    const size = o.size || 14;
    const weight = o.weight || 500;
    const family = o.mono ? 'ui-monospace, "SF Mono", Menlo, monospace'
      : '-apple-system, "SF Pro Text", "Segoe UI", system-ui, sans-serif';
    ctx.font = weight + ' ' + size + 'px ' + family;
  };

  D.text = function (ctx, str, x, y, o) {
    o = o || {};
    D.font(ctx, o);
    ctx.fillStyle = o.color || C.text;
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = o.baseline || 'alphabetic';
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    ctx.fillText(str, x, y);
    ctx.globalAlpha = 1;
    return ctx.measureText(str).width;
  };

  D.textW = function (ctx, str, o) {
    D.font(ctx, o);
    return ctx.measureText(str).width;
  };

  /* Zawijanie tekstu; zwraca liczbę linii. */
  D.wrap = function (ctx, str, x, y, maxW, lh, o) {
    o = o || {};
    D.font(ctx, o);
    const words = String(str).split(/\s+/);
    let line = '';
    let yy = y;
    let lines = 0;
    ctx.textAlign = o.align || 'left';
    for (let i = 0; i < words.length; i++) {
      const test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && line) {
        D.text(ctx, line, x, yy, o);
        lines++;
        line = words[i];
        yy += lh;
      } else {
        line = test;
      }
    }
    if (line) { D.text(ctx, line, x, yy, o); lines++; }
    return lines;
  };

  /* ---------- strzałki / linie ---------- */

  D.arrow = function (ctx, x1, y1, x2, y2, o) {
    o = o || {};
    const head = o.head == null ? 7 : o.head;
    const a = Math.atan2(y2 - y1, x2 - x1);
    const bx = x2 - Math.cos(a) * head * 0.85;
    const by = y2 - Math.sin(a) * head * 0.85;
    ctx.save();
    if (o.dash) ctx.setLineDash(o.dash);
    ctx.strokeStyle = o.color || C.muted;
    ctx.lineWidth = o.lw || 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = o.color || C.muted;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - Math.cos(a - 0.42) * head, y2 - Math.sin(a - 0.42) * head);
    ctx.lineTo(x2 - Math.cos(a + 0.42) * head, y2 - Math.sin(a + 0.42) * head);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  D.line = function (ctx, x1, y1, x2, y2, o) {
    o = o || {};
    ctx.save();
    if (o.dash) ctx.setLineDash(o.dash);
    ctx.strokeStyle = o.color || C.line;
    ctx.lineWidth = o.lw || 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  };

  /* ---------- elementy złożone ---------- */

  /* Pasek postępu: 0..1 */
  D.bar = function (ctx, x, y, w, h, v, o) {
    o = o || {};
    D.rr(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = o.bg || C.panel2;
    ctx.fill();
    if (v > 0) {
      ctx.save();
      D.rr(ctx, x, y, w, h, h / 2);
      ctx.clip();
      ctx.fillStyle = o.fill || C.info;
      ctx.fillRect(x, y, w * D.clamp(v, 0, 1), h);
      ctx.restore();
    }
    if (o.stroke) { D.rr(ctx, x, y, w, h, h / 2); ctx.strokeStyle = o.stroke; ctx.lineWidth = 1; ctx.stroke(); }
  };

  /* Etykieta-pigułka */
  D.pill = function (ctx, str, x, y, o) {
    o = o || {};
    const size = o.size || 12;
    const padX = o.padX == null ? 8 : o.padX;
    const h = o.h || size + 10;
    D.font(ctx, { size, weight: o.weight || 600, mono: o.mono });
    const w = ctx.measureText(str).width + padX * 2;
    const px = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
    D.rr(ctx, px, y, w, h, h / 2);
    ctx.fillStyle = o.fill || C.panel2;
    ctx.fill();
    if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = 1; ctx.stroke(); }
    D.text(ctx, str, px + padX, y + h / 2 + 0.5, { size, weight: o.weight || 600, mono: o.mono, color: o.color || C.text, baseline: 'middle' });
    return w;
  };

  /* Tytuł sceny (nagłówek u góry kadru) */
  D.sceneTitle = function (ctx, str, w, color) {
    D.text(ctx, str, 16, 24, { size: 13.5, weight: 700, color: color || C.muted, baseline: 'middle' });
  };

  /* Podpis osi / stopka */
  D.sceneFoot = function (ctx, str, w, h, color) {
    D.text(ctx, str, w - 16, h - 14, { size: 11.5, color: color || C.dim, align: 'right', baseline: 'middle' });
  };

  /* Blok danych: kolor + litera (D = duplikat, N = nowy) */
  D.chunk = function (ctx, x, y, w, h, kind, o) {
    o = o || {};
    const col = kind === 'dupe' ? C.dupe : kind === 'ref' ? C.ref : C.fresh;
    D.box(ctx, x, y, w, h, { r: 5, fill: D.alpha(col, o.active === false ? 0.16 : 0.34), stroke: col, lw: o.lw || 1.2 });
    if (o.label) {
      D.text(ctx, o.label, x + w / 2, y + h / 2 + 0.5, {
        size: o.labelSize || 11, weight: 700, color: col, align: 'center', baseline: 'middle', mono: true
      });
    }
  };

  /* Deterministyczny "hash" napisu -> liczba 0..1 (do kolorów/rozmiarów) */
  D.h01 = function (str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 100000) / 100000;
  };

  /* Tabela Gear: w oryginale 128 wpisów o losowych, „gęstych" wartościach
     (w książce i w artykule FastCDC). Dla czytelnych danych demo generujemy ją
     deterministycznie — statystycznie zachowuje się tak samo: dolne bity są
     jednostajnie losowe, więc warunek (h & maska) == 0 spełnia się ~1/2ⁿ razy. */
  (function () {
    const r = D.prng(1337);
    const T = new Array(256);
    for (let i = 0; i < 256; i++) {
      T[i] = (Math.floor(r() * 4294967296) >>> 0);
    }
    D.GEAR = T;
  })();

  /* Wartość gear dla jednego bajtu */
  D.gearVal = function (code) { return D.GEAR[code & 0x7f]; };

  /* Hasz przesuwny: h = (h << 1) + G[bajt], liczony od pozycji from */
  D.roll = function (str, from) {
    let h = 0;
    for (let i = (from || 0); i < str.length; i++) {
      h = ((h << 1) + D.gearVal(str.charCodeAt(i))) >>> 0;
    }
    return h >>> 0;
  };

  /* Geedy chunking: końce fragmentów (indeksy 0-based) */
  D.geedyCuts = function (str, mask, from) {
    const cuts = [];
    let h = 0;
    for (let i = (from || 0); i < str.length; i++) {
      h = ((h << 1) + D.gearVal(str.charCodeAt(i))) >>> 0;
      if ((h & mask) === 0) cuts.push(i + 1);
    }
    return cuts;
  };

  /* FastCDC / Normalized Chunking.
     bits  – ile bitów maski (średni chunk = 2^bits B)
     minSz – próg Min  (przed nim sprawdzamy rzadziej)
     maxSz – próg Max  (dłuższy chunk nie powstaje) */
  D.fastCdcCuts = function (str, bits, minSz, maxSz) {
    const mask = (1 << bits) - 1;
    const mn = minSz == null ? Math.max(1, (1 << bits) >> 2) : minSz;
    const mx = maxSz == null ? (1 << bits) * 4 : maxSz;
    const cuts = [0];
    let i = 0;
    while (i < str.length) {
      const limit = Math.min(i + mx, str.length);
      // hasz przesuwny liczony od początku chunka: hs[k] = hash(str[i..i+k])
      const hs = [0];
      let h = 0;
      for (let k = i; k < limit; k++) h = ((h << 1) + D.gearVal(str.charCodeAt(k))) >>> 0, hs.push(h);
      let cut = -1;
      // faza 1: po prgu Min sprawdzamy co 16 bajtów
      for (let k = mn; k + 16 <= limit; k += 16) {
        if ((hs[k + 16] & mask) === 0) { cut = i + k + 16; break; }
      }
      // faza 2: sprawdzamy każdy bajt
      if (cut < 0) {
        for (let k = mn; k < limit; k++) {
          if ((hs[k + 1] & mask) === 0) { cut = i + k + 1; break; }
        }
      }
      if (cut < 0) cut = limit;
      cuts.push(cut);
      i = cut;
    }
    return cuts;
  };

  /* Podglądowy „plik”: deterministyczny tekst o zadanej długości i powtarzalnych
     fragmentach (żeby duplikaty były widoczne). */
  D.makeData = function (seed, len) {
    const r = D.prng(seed);
    const alpha = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < len; i++) s += alpha[Math.floor(r() * alpha.length)];
    return s;
  };

  /* Wstaw/usuń fragment w danym miejscu (do animacji kaskady) */
  D.spliceAt = function (str, at, ins) {
    return str.slice(0, at) + ins + str.slice(at);
  };

  return D;
})();
