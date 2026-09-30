/* deck.js — router slajdów, host sceny (żywy canvas), przegląd, nawigacja.
   Wymaga DECK z core.js; slajdy zarejestrowane przez js/slides/*.js */

(function (D) {
  const stage = document.getElementById('stage');
  const progress = document.getElementById('progress');
  const counter = document.getElementById('counter');
  const overview = document.getElementById('overview');
  const ovBody = document.getElementById('ovBody');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let current = 0;
  const hosts = new Map();   // sceneId -> host (canvas + params + controls)

  /* ---------- host sceny ---------- */

  function createHost(sceneId) {
    const sc = D.scenes[sceneId];
    const root = document.createElement('div');
    root.className = 'stagebox';

    const canvas = document.createElement('canvas');
    canvas.width = sc.width;
    canvas.height = sc.height;
    canvas.style.aspectRatio = sc.width + ' / ' + sc.height;
    root.appendChild(canvas);

    const ctx = canvas.getContext('2d', { alpha: false });

    const params = {};
    sc.controls.forEach(c => { params[c.key] = c.value; });

    const host = {
      sc, canvas, ctx, params, root,
      playing: true,
      t: 0,
      startTs: 0,
      dirty: true,
      fpsLimit: 30
    };

    if (sc.controls.length) {
      const bar = document.createElement('div');
      bar.className = 'controls';
      sc.controls.forEach(c => {
        if (c.hidden) return;
        if (c.type === 'button') {
          const b = document.createElement('button');
          b.className = 'btn';
          b.textContent = c.label;
          b.addEventListener('click', () => {
            if (c.action === 'replay') restart(host);
            if (c.action === 'step' && host.stepTo) host.stepTo();
          });
          bar.appendChild(b);
          host.buttons = host.buttons || [];
          host.buttons.push({ el: b, ctl: c });
          return;
        }
        if (c.type === 'toggle') {
          const b = document.createElement('button');
          b.className = 'btn' + (params[c.key] ? ' on' : '');
          b.textContent = c.label;
          b.addEventListener('click', () => {
            params[c.key] = !params[c.key];
            b.classList.toggle('on', !!params[c.key]);
            restart(host);
          });
          bar.appendChild(b);
          host.buttons = host.buttons || [];
          host.buttons.push({ el: b, ctl: c });
          return;
        }
        if (c.type === 'select') {
          const wrap = document.createElement('div');
          wrap.className = 'ctrl';
          const l = document.createElement('label');
          l.textContent = c.label;
          const s = document.createElement('select');
          s.className = 'btn';
          c.options.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o;
            opt.textContent = o;
            s.appendChild(opt);
          });
          s.value = params[c.key];
          s.addEventListener('change', () => {
            params[c.key] = s.value;
            if (c.off) {
              params[c.off] = false;
              (host.buttons || []).forEach(b => { if (b.ctl.key === c.off) b.el.classList.remove('on'); });
            }
            restart(host);
          });
          wrap.appendChild(l); wrap.appendChild(s);
          bar.appendChild(wrap);
          return;
        }
        // range
        const wrap = document.createElement('div');
        wrap.className = 'ctrl';
        const l = document.createElement('label');
        l.textContent = c.label;
        const r = document.createElement('input');
        r.type = 'range';
        r.min = c.min; r.max = c.max; r.step = c.step || 1;
        r.value = params[c.key];
        const o = document.createElement('output');
        o.textContent = fmt(c.value, c);
        r.addEventListener('input', () => {
          params[c.key] = parseFloat(r.value);
          o.textContent = fmt(params[c.key], c);
          if (c.off) {                       // ruch suwakiem wyłącza auto-przesuwanie
            params[c.off] = false;
            (host.buttons || []).forEach(b => { if (b.ctl.key === c.off) b.el.classList.remove('on'); });
          }
          restart(host);
        });
        wrap.appendChild(l); wrap.appendChild(r); wrap.appendChild(o);
        bar.appendChild(wrap);
      });
      root.appendChild(bar);
    }

    // pauza / start przy hover + klawisz
    const toggle = () => { host.playing = !host.playing; host.startTs = performance.now(); };
    canvas.addEventListener('click', toggle);
    canvas.style.cursor = 'pointer';
    canvas.title = 'Kliknij, aby zatrzymać / wznowić animację';

    hosts.set(sceneId, host);
    return host;
  }

  function fmt(v, c) {
    if (c.fmt) return c.fmt(v);
    return c.step && c.step < 1 ? v.toFixed(String(c.step).split('.')[1].length) : String(v);
  }

  function restart(host) {
    host.t = 0;
    host.startTs = performance.now();
    host.playing = true;
  }

  function renderHost(host, t) {
    const ctx = host.ctx;
    ctx.save();
    ctx.fillStyle = D.C.bg;
    ctx.fillRect(0, 0, host.sc.width, host.sc.height);
    try {
      host.sc.draw(ctx, t, host.params, host.sc);
    } catch (e) {
      ctx.restore();
      D.text(ctx, 'Błąd sceny: ' + e.message, 20, 40, { size: 16, color: D.C.bad });
      console.error('[scene ' + host.sc.id + ']', e);
      return;
    }
    ctx.restore();
  }

  /* pętla animacji — tylko dla widocznych scen */
  let last = 0;
  function loop(ts) {
    for (const host of hosts.values()) {
      if (host.root.offsetParent === null) continue;   // slajd niewidoczny
      if (host.playing) {
        const dur = host.sc.duration * 1000;
        host.t = ((ts - host.startTs) % dur) / dur;
      }
      if (ts - last > 1000 / (host.fpsLimit || 30)) {
        renderHost(host, host.t);
        last = ts;
      }
    }
    requestAnimationFrame(loop);
  }

  /* ---------- render slajdu ---------- */

  function buildSlide(sl) {
    const el = document.createElement('article');
    el.className = 'slide active' + (sl.layout ? ' ' + sl.layout : '');
    el.dataset.id = sl.id;

    const chColor = D.CH[sl.chapter] || D.CH[0];
    el.style.setProperty('--chapter', chColor);

    /* kolumna tekstowa */
    const head = document.createElement('div');
    head.className = 'head';
    let html = '';
    if (sl.kicker) {
      html += '<div class="kicker"><span class="num">' + (sl.num || '') + '</span>' + sl.kicker + '</div>';
    }
    if (sl.title) html += '<h1>' + sl.title + '</h1>';
    if (sl.lead) html += '<p class="lead">' + sl.lead + '</p>';
    if (sl.points && sl.points.length) {
      html += '<ul class="points">' + sl.points.map(p => '<li>' + p + '</li>').join('') + '</ul>';
    }
    if (sl.html) html += sl.html;
    head.innerHTML = html;
    el.appendChild(head);

    /* kolumna wizualna */
    if (sl.scene || sl.raw) {
      const vis = document.createElement('div');
      vis.className = 'visual';
      if (sl.scene) {
        const host = createHost(sl.scene);
        vis.appendChild(host.root);
        if (sl.caption) {
          const cap = document.createElement('div');
          cap.className = 'caption';
          cap.innerHTML = '<span class="dot"></span><span>' + sl.caption + '</span>';
          vis.appendChild(cap);
        }
      } else {
        vis.innerHTML = sl.raw;
      }
      el.appendChild(vis);
      // slajd bez wizualizacji — sama treść, wyśrodkowana
      if (!sl.scene && !sl.raw) el.classList.add('text-only');
    } else if (sl.full) {
      const full = document.createElement('div');
      full.className = 'visual';
      full.style.gridColumn = '1 / -1';
      full.innerHTML = sl.full;
      el.appendChild(full);
    }

    return el;
  }

  /* ---------- przegląd ---------- */

  function buildOverview() {
    ovBody.innerHTML = '';
    const groups = new Map();
    D.slides.forEach((sl, i) => {
      const key = sl.chapterLabel || 'Inne';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ sl, i });
    });
    groups.forEach((items, key) => {
      const g = document.createElement('div');
      g.className = 'ov-group';
      const ch = items[0].sl.chapter;
      g.style.setProperty('--c', D.CH[ch] || D.CH[0]);
      g.innerHTML = '<h3>' + key + '</h3>';
      const grid = document.createElement('div');
      grid.className = 'ov-grid';
      items.forEach(({ sl, i }) => {
        const b = document.createElement('button');
        b.className = 'ov-item';
        b.dataset.i = i;
        b.innerHTML = '<span class="n">' + (i + 1) + '</span>' + (sl.ovTitle || sl.title || sl.kicker || 'Slajd');
        b.addEventListener('click', () => { go(i); closeOverview(); });
        grid.appendChild(b);
      });
      g.appendChild(grid);
      ovBody.appendChild(g);
    });
  }

  function closeOverview() { overview.classList.remove('open'); }

  /* ---------- nawigacja ---------- */

  let built = false;

  function go(i) {
    if (!built) { build(); if (built === 'building') return; }
    i = Math.max(0, Math.min(D.slides.length - 1, i));
    if (i === current && stage.firstChild) return;
    current = i;
    const sl = D.slides[i];
    stage.innerHTML = '';
    stage.appendChild(buildSlide(sl));
    progress.style.width = ((i + 1) / D.slides.length * 100) + '%';
    progress.style.background = D.CH[sl.chapter] || D.CH[0];
    counter.textContent = (i + 1) + ' / ' + D.slides.length;
    document.documentElement.style.setProperty('--chapter', D.CH[sl.chapter] || D.CH[0]);
    document.body.style.setProperty('--chapter', D.CH[sl.chapter] || D.CH[0]);
    const loc = '#' + (sl.id || i);
    if (location.hash !== loc) history.replaceState(null, '', loc);
    document.querySelectorAll('.ov-item').forEach(b =>
      b.classList.toggle('current', +b.dataset.i === i));
  }

  function build() {
    if (built === 'building') return;
    built = 'building';
    buildOverview();
    const fromHash = location.hash.replace('#', '');
    let start = 0;
    if (fromHash) {
      const idx = D.slides.findIndex(s => s.id === fromHash);
      if (idx >= 0) start = idx;
    }
    built = true;
    go(start);
    requestAnimationFrame(loop);
  }

  document.getElementById('prevBtn').addEventListener('click', () => go(current - 1));
  document.getElementById('nextBtn').addEventListener('click', () => go(current + 1));
  document.getElementById('tocBtn').addEventListener('click', () => {
    overview.classList.toggle('open');
    buildOverview();
  });
  overview.addEventListener('click', (e) => { if (e.target === overview) closeOverview(); });

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'Escape') { closeOverview(); return; }
    if (overview.classList.contains('open')) return;
    switch (e.key) {
      case 'ArrowRight': case 'PageDown': case ' ': case 'Enter': e.preventDefault(); go(current + 1); break;
      case 'ArrowLeft': case 'PageUp': case 'Backspace': e.preventDefault(); go(current - 1); break;
      case 'Home': go(0); break;
      case 'End': go(D.slides.length - 1); break;
      case 'o': case 'O': overview.classList.toggle('open'); buildOverview(); break;
      case 'f': case 'F':
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(() => {});
        break;
    }
  });

  let touchX = null;
  document.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  document.addEventListener('touchend', e => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 60) go(current + (dx < 0 ? 1 : -1));
    touchX = null;
  }, { passive: true });

  /* start — także gdy ktoś otworzy plik i dopisze slajdy później */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(build, 0));
  } else {
    setTimeout(build, 0);
  }

  /* API dla narzędzi (shots.mjs) */
  D.goto = function (i) { if (!built) build(); go(i); };
  D.current = () => current;

  /* API dla narzędzi (render.html) */
  D.renderScene = function (ctx, sceneId, t, params) {
    const sc = D.scenes[sceneId];
    if (!sc) throw new Error('brak sceny: ' + sceneId);
    const p = Object.assign({}, params);
    sc.controls.forEach(c => { if (p[c.key] === undefined) p[c.key] = c.value; });
    ctx.save();
    ctx.fillStyle = D.C.bg;
    ctx.fillRect(0, 0, sc.width, sc.height);
    sc.draw(ctx, t, p, sc);
    ctx.restore();
  };

  D.sceneIds = () => Object.keys(D.scenes);
})(window.DECK);
