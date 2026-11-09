// Hoki: a waving lucky cat. Tap it for a luck boost.
// Everything is stored on this device only (localStorage).

(() => {
  'use strict';

  const STORE_KEY = 'hoki.v1';

  // Paw motion: a real maneki-neko beckons front-to-back, not side to side. assets/cat.svg has the
  // forearm #hoki-paw (foreshortens from the shoulder at data-pivot) and the hand #hoki-hand (folds
  // toward the viewer at data-wrist); data-beckon gives both scale amounts at full fold. The desktop
  // widget and tools/make_widget_frames.py use the same matrices (see beckonMatrices).
  const BASE_WAVES_PER_SEC = 0.7;
  const MAX_EXTRA_WAVES_PER_SEC = 2.6;

  // Boost: each tap adds some, and it fades with a half-life.
  const BOOST_PER_TAP = 0.08;
  const BOOST_HALF_LIFE_SEC = 6;

  // Lucky numbers (8 = 发 "prosper", 2 = 易 "easy", 168 = 一路发 "prosper all the way").
  const MILESTONES = [
    { at: 8, zh: '发', en: 'Prosperity is coming' },
    { at: 28, zh: '易发', en: 'Fortune comes easy' },
    { at: 88, zh: '发发', en: 'Double prosperity' },
    { at: 168, zh: '一路发', en: 'Prosper all the way' },
    { at: 288, zh: '易发发', en: 'Easy double fortune' },
    { at: 888, zh: '发发发', en: 'Triple prosperity' },
    { at: 1688, zh: '一路发发', en: 'All the way, twice over' },
    { at: 8888, zh: '发发发发', en: 'Legendary luck' },
  ];
  const BLESSINGS = ['福', '财', '运', '喜'];

  const $ = (id) => document.getElementById(id);
  const catButton = $('cat');
  const fxLayer = $('fx');
  const glow = $('glow');
  const todayEl = $('today');
  const totalEl = $('total');
  const nextEl = $('next');
  const boostBar = $('boost-bar');
  const boostPct = $('boost-pct');
  const soundButton = $('sound');
  const toast = $('toast');
  const hint = $('hint');

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const params = new URLSearchParams(location.search);
  // The Windows app (app/) tells the page which window it is in: 'app' or 'widget'.
  // The Android app serves the bundled copy from appassets.androidplatform.net.
  const androidApp = location.hostname === 'appassets.androidplatform.net';
  const native = window.HOKI_NATIVE || (androidApp ? 'android' : null);
  const desktopApp = native === 'app' || native === 'widget';
  const nativeWidget = native === 'widget';
  if (params.has('widget') || nativeWidget) {
    document.body.classList.add('widget');
  }
  if (native) {
    document.body.classList.add('native');
  }

  // Sky in the moon gate follows the local time of day (like Jeda's scenes).
  function timeOfDay(hour) {
    if (hour >= 5 && hour < 8) {
      return 'dawn';
    }
    if (hour >= 8 && hour < 17) {
      return 'day';
    }
    if (hour >= 17 && hour < 19) {
      return 'dusk';
    }
    return 'night';
  }
  // One gentle fortune per local day, the same all day long (no network, no randomness per visit).
  const FORTUNES = [
    { zh: '大吉', en: 'Great luck. A good day to start something small.' },
    { zh: '中吉', en: 'Good luck. Say yes to one kind invitation.' },
    { zh: '小吉', en: 'A little luck. Tidy one corner; luck likes room.' },
    { zh: '吉', en: 'Luck is near. Drink some water, wave back.' },
    { zh: '末吉', en: 'Luck is on its way. Keep going, slowly.' },
    { zh: '福', en: 'Blessings at home. Call someone you miss.' },
    { zh: '财', en: 'Good for money. Spend on something that lasts.' },
    { zh: '喜', en: 'A happy day. Share one good thing.' },
  ];

  let currentFortune = FORTUNES[0];

  function renderFortune() {
    const now = new Date();
    const dayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    let hash = 0;
    for (const ch of dayKey) {
      hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    }
    currentFortune = FORTUNES[hash % FORTUNES.length];
    const seal = $('fortune-seal');
    if (!seal) {
      return;
    }
    seal.textContent = currentFortune.zh.slice(-1);
    $('fortune-name').textContent = currentFortune.zh;
    $('fortune-line').textContent = currentFortune.en;
  }

  // Share today's fortune: native share sheet when available, copy otherwise.
  const fortuneShareBtn = $('fortune-share');
  const fortuneShareLabel = $('fortune-share-label');
  let shareTimer = null;

  function fortuneShareText() {
    return currentFortune ? `${currentFortune.zh} · ${currentFortune.en}` : '';
  }

  function flashShare(label) {
    if (!fortuneShareLabel) {
      return;
    }
    fortuneShareLabel.textContent = label;
    if (fortuneShareBtn) {
      fortuneShareBtn.classList.add('is-copied');
    }
    clearTimeout(shareTimer);
    shareTimer = setTimeout(() => {
      fortuneShareLabel.textContent = 'Share';
      if (fortuneShareBtn) {
        fortuneShareBtn.classList.remove('is-copied');
      }
    }, 1600);
  }

  function fallbackCopyFortune(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    flashShare(ok ? 'Copied' : 'Copy failed');
  }

  async function copyFortuneText(text) {
    try {
      await navigator.clipboard.writeText(text);
      flashShare('Copied');
    } catch {
      fallbackCopyFortune(text);
    }
  }

  async function shareFortune() {
    const text = fortuneShareText();
    if (!text) {
      return;
    }
    const payload = { text, title: "Hoki · today's fortune" };
    const canNative = typeof navigator.share === 'function' && (!navigator.canShare || navigator.canShare(payload));
    if (canNative) {
      try {
        await navigator.share(payload);
        flashShare('Shared');
      } catch (err) {
        if (!err || err.name !== 'AbortError') {
          copyFortuneText(text);
        }
      }
    } else {
      copyFortuneText(text);
    }
  }

  if (fortuneShareBtn) {
    fortuneShareBtn.addEventListener('click', shareFortune);
  }

  function applyTimeOfDay() {
    const forced = params.get('time');
    document.documentElement.dataset.time = forced || timeOfDay(new Date().getHours());
  }
  applyTimeOfDay();
  renderFortune();
  setInterval(applyTimeOfDay, 60 * 1000);

  // ---------- state ----------
  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  };

  function loadState() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
    } catch {
      saved = {};
    }
    const state = {
      total: Number(saved.total) || 0,
      today: Number(saved.today) || 0,
      day: saved.day || todayKey(),
      sound: saved.sound !== false,
    };
    if (state.day !== todayKey()) {
      state.day = todayKey();
      state.today = 0;
    }
    return state;
  }

  const state = loadState();
  const save = () => localStorage.setItem(STORE_KEY, JSON.stringify(state));

  // ---------- sound: a small synthesized bell ----------
  let audioCtx = null;
  function ringBell(big = false) {
    if (!state.sound) {
      return;
    }
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const now = audioCtx.currentTime;
      const partials = big
        ? [[1046.5, 0.35, 2.2], [1568, 0.25, 1.6], [2093, 0.15, 1.1], [3136, 0.08, 0.6]]
        : [[1568, 0.3, 1.1], [2349, 0.14, 0.7], [3136, 0.06, 0.35]];
      for (const [freq, gain, decay] of partials) {
        const osc = audioCtx.createOscillator();
        const amp = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        amp.gain.setValueAtTime(0.0001, now);
        amp.gain.exponentialRampToValueAtTime(gain, now + 0.005);
        amp.gain.exponentialRampToValueAtTime(0.0001, now + decay);
        osc.connect(amp).connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + decay + 0.05);
      }
    } catch {
      // Audio is optional.
    }
  }

  // ---------- rendering ----------
  let paw = null;
  let pivot = [0, 0];
  let hand = null;
  let wrist = [0, 0];
  let beckon = [0.12, 0.38];
  let pawFold = 0;
  let cat3d = null;           // the 3D ceramic cat (js/cat3d.js); null -> SVG fallback
  let catReady = false;
  const fixedPose = params.has('pose') ? Math.min(1, Math.max(0, Number(params.get('pose')) || 0)) : null;
  let catSvg = null;
  let boost = 0;
  let phase = 0;
  let lastFrame = performance.now();

  function nextMilestone(count) {
    const found = MILESTONES.find((m) => m.at > count);
    return found ? found.at : Math.ceil((count + 1) / 8888) * 8888;
  }

  function renderStats() {
    todayEl.textContent = state.today.toLocaleString();
    totalEl.textContent = state.total.toLocaleString();
    nextEl.textContent = nextMilestone(state.today).toLocaleString();
    $('sound-label').textContent = state.sound ? 'Sound on' : 'Sound off';
    soundButton.setAttribute('aria-pressed', String(state.sound));
    $('widget-count').textContent = state.today.toLocaleString();
  }

  function renderBoost() {
    const pct = Math.round(boost * 100);
    boostBar.firstElementChild.style.width = `${(boost * 100).toFixed(1)}%`;
    boostBar.setAttribute('aria-valuenow', String(pct));
    boostPct.textContent = `${pct}%`;
    glow.style.opacity = String(0.15 + boost * 0.75);
    glow.style.transform = `translate(-50%, -50%) scale(${(0.92 + boost * 0.18).toFixed(3)})`;
  }

  // Fold 0..1 -> two affine matrices: the forearm shortens from the shoulder (leaning toward the
  // viewer) and the hand shortens toward the wrist and widens a touch (tipping toward the viewer).
  function beckonMatrices(fold) {
    const armScale = 1 - beckon[0] * fold;
    const handScale = 1 - beckon[1] * fold;
    const handWiden = 1 + 0.05 * fold;
    const lift = pivot[1] * (1 - armScale);
    return {
      arm: [1, 0, 0, armScale, 0, lift],
      hand: [handWiden, 0, 0, armScale * handScale, wrist[0] * (1 - handWiden), armScale * wrist[1] * (1 - handScale) + lift],
    };
  }

  // Wave -1..1: +1 = paw raised and open, -1 = paw folded forward toward the viewer.
  function setPaw(wave) {
    if (!paw || !hand) {
      return;
    }
    pawFold = (1 - wave) / 2;
    const { arm, hand: handMatrix } = beckonMatrices(pawFold);
    paw.setAttribute('transform', `matrix(${arm.map((v) => v.toFixed(3)).join(' ')})`);
    hand.setAttribute('transform', `matrix(${handMatrix.map((v) => v.toFixed(3)).join(' ')})`);
  }

  // Slow GPUs (old phones, software WebGL) get a lighter render, then a frame-rate cap that keeps
  // the main thread at least half idle so taps stay responsive.
  let renderCost = 0;
  let renderFrames = 0;
  let lightened = false;
  function scheduleFrame() {
    if (cat3d && renderCost > 25) {
      setTimeout(() => requestAnimationFrame(frame), renderCost);
    } else {
      requestAnimationFrame(frame);
    }
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    boost *= Math.pow(0.5, dt / BOOST_HALF_LIFE_SEC);
    if (boost < 0.002) {
      boost = 0;
    }
    const speed = reducedMotion ? 0.35 : BASE_WAVES_PER_SEC + boost * MAX_EXTRA_WAVES_PER_SEC;
    phase += dt * speed * Math.PI * 2;
    const wave = fixedPose === null ? Math.sin(phase) : 1 - fixedPose * 2;
    if (cat3d) {
      pawFold = (1 - wave) / 2;
      const start = performance.now();
      cat3d.update(pawFold, fixedPose === null ? dt : 0);
      renderCost = renderCost * 0.85 + (performance.now() - start) * 0.15;
      renderFrames += 1;
      if (!lightened && renderFrames > 20 && renderCost > 30) {
        lightened = true;
        cat3d.lighten();
      }
      catReady = true;
    } else {
      setPaw(wave);
    }
    renderBoost();
    scheduleFrame();
  }

  // ---------- effects ----------
  function pawPoint() {
    if (cat3d) {
      return cat3d.pawPoint();
    }
    const r = (catSvg || catButton).getBoundingClientRect();
    if (!catSvg) {
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    const [vbW, vbH] = catSvg.getAttribute('viewBox').split(' ').slice(2).map(Number);
    const [pawX, pawY] = (catSvg.dataset.paw || '0 0').split(' ').map(Number);
    return { x: r.left + (pawX / vbW) * r.width, y: r.top + (pawY / vbH) * r.height };
  }

  function floatText(text, x, y, big = false) {
    const el = document.createElement('div');
    el.className = big ? 'float big' : 'float';
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    fxLayer.append(el);
    el.addEventListener('animationend', () => el.remove());
  }

  function coins(x, y, count) {
    for (let i = 0; i < count; i += 1) {
      const el = document.createElement('span');
      el.className = 'coin';
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2;
      const dist = 60 + Math.random() * 90;
      el.style.left = `${x - 6}px`;
      el.style.top = `${y - 6}px`;
      el.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      el.style.setProperty('--dy', `${Math.sin(angle) * dist + 40}px`);
      fxLayer.append(el);
      el.addEventListener('animationend', () => el.remove());
    }
  }

  let toastTimer = null;
  function showToast(html) {
    toast.innerHTML = html;
    toast.classList.add('show');
    hint.classList.add('away');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
      hint.classList.remove('away');
    }, 2600);
  }

  // ---------- tap ----------
  function tap() {
    if (state.day !== todayKey()) {
      state.day = todayKey();
      state.today = 0;
    }
    state.today += 1;
    state.total += 1;
    boost = Math.min(1, boost + BOOST_PER_TAP);
    phase += Math.PI / 3; // a little flick on every tap
    save();
    renderStats();

    const { x, y } = pawPoint();
    const milestone = MILESTONES.find((m) => m.at === state.today);
    const blessing = BLESSINGS[state.total % BLESSINGS.length];
    const catWidth = catButton.getBoundingClientRect().width;
    // Right of the raised paw, over the head: clear of the left lantern.
    floatText(`+1 ${blessing}`, x + catWidth * 0.22 + (Math.random() - 0.5) * 24, y - 6);
    coins(x, y, milestone ? 18 : 3);

    hint.classList.add('quiet');
    catButton.classList.add('bump');
    if (cat3d) {
      cat3d.hop();
    }
    setTimeout(() => catButton.classList.remove('bump'), 90);

    if (milestone) {
      boost = 1;
      ringBell(true);
      const rect = catButton.getBoundingClientRect();
      // Above the head, so the celebration never covers the cat's face.
      floatText(milestone.zh, rect.left + rect.width * 0.64, rect.top + rect.height * 0.2, true);
      showToast(`<b lang="zh">${milestone.zh}</b><span><strong>${milestone.at} today</strong><br>${milestone.en}</span>`);
      if (navigator.vibrate) {
        navigator.vibrate([30, 40, 30, 40, 60]);
      }
    } else {
      ringBell(false);
      if (navigator.vibrate) {
        navigator.vibrate(12);
      }
    }
  }

  // Pointer for fast repeated taps; click with detail 0 for keyboard (Enter/Space).
  catButton.addEventListener('pointerdown', (event) => {
    if (event.button === 0 && !nativeWidget) {
      tap();
    }
  });
  catButton.addEventListener('click', (event) => {
    if (event.detail === 0) {
      tap();
    }
  });

  soundButton.addEventListener('click', () => {
    state.sound = !state.sound;
    save();
    renderStats();
  });

  // ---------- install help ----------
  let installPrompt = null;
  const installButton = $('install');
  const installHelp = $('install-help');
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (isStandalone) {
    installButton.hidden = true;
  }
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
  });
  installButton.addEventListener('click', async () => {
    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      return;
    }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    installHelp.textContent = ios
      ? 'In Safari tap Share, then "Add to Home Screen".'
      : 'Open your browser menu and choose "Add to Home screen" or "Install app".';
    installHelp.hidden = !installHelp.hidden;
  });

  const phoneToggle = $('phone-toggle');
  const phonePanel = $('phone');
  phoneToggle.addEventListener('click', () => {
    phonePanel.hidden = !phonePanel.hidden;
    phoneToggle.setAttribute('aria-expanded', String(!phonePanel.hidden));
  });

  const desktopToggle = $('desktop-toggle');
  const desktopPanel = $('desktop');
  if (desktopApp) {
    desktopToggle.setAttribute('aria-label', 'Put Hoki on your desktop');
  }
  desktopToggle.addEventListener('click', () => {
    if (desktopApp) {
      nativeCall('open_widget');
      return;
    }
    desktopPanel.hidden = !desktopPanel.hidden;
    desktopToggle.setAttribute('aria-expanded', String(!desktopPanel.hidden));
  });
  $('copy').addEventListener('click', async () => {
    const copyButton = $('copy');
    try {
      await navigator.clipboard.writeText($('install-cmd').textContent);
      copyButton.textContent = 'Copied';
    } catch {
      copyButton.textContent = 'Select and copy';
    }
    setTimeout(() => {
      copyButton.textContent = 'Copy';
    }, 1600);
  });

  // ---------- boot ----------
  // The cat is a real 3D ceramic figure when WebGL is available; the flat SVG is the fallback.
  async function startCat3D() {
    if (params.has('flat')) {
      return false;
    }
    try {
      const { createCat3D } = await import('./cat3d.js');
      cat3d = createCat3D(catButton, { sway: !reducedMotion && fixedPose === null });
      catButton.classList.add('is-3d');
      return true;
    } catch (error) {
      cat3d = null;
      return false;
    }
  }

  function startLoop() {
    requestAnimationFrame((now) => {
      lastFrame = now;
      frame(now);
    });
  }

  async function boot() {
    renderStats();
    if (await startCat3D()) {
      startLoop();
      return;
    }
    const response = await fetch('assets/cat.svg');
    catButton.innerHTML = await response.text();
    catSvg = catButton.querySelector('svg');
    catSvg.removeAttribute('width');
    catSvg.removeAttribute('height');
    catSvg.setAttribute('aria-hidden', 'true');
    catSvg.setAttribute('focusable', 'false');
    paw = catSvg.querySelector('#hoki-paw');
    pivot = (catSvg.dataset.pivot || '0 0').split(' ').map(Number);
    hand = catSvg.querySelector('#hoki-hand');
    wrist = (catSvg.dataset.wrist || '38 90').split(' ').map(Number);
    beckon = (catSvg.dataset.beckon || '0.12 0.38').split(' ').map(Number);
    catReady = true;
    startLoop();
  }

  boot();

  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !native) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }


  // ---------- native app (app/, Tauri): the full app window and the live desktop cat ----------
  function nativeCall(command, args) {
    const tauri = window.__TAURI__;
    if (!tauri || !tauri.core) {
      return Promise.resolve();
    }
    return tauri.core.invoke(command, args).catch(() => {});
  }

  // Counts stay in step between the app window and the desktop cat (same storage).
  window.addEventListener('storage', (event) => {
    if (event.key !== STORE_KEY) {
      return;
    }
    Object.assign(state, loadState());
    renderStats();
  });

  if (nativeWidget) {
    // The app feeds in the desktop cursor (relative to this window), so Hoki watches the mouse anywhere.
    window.hokiCursor = (x, y) => {
      if (cat3d && cat3d.lookAt) {
        cat3d.lookAt(x, y);
      }
    };

    // Click = tap (on release, so a drag never counts); press and move = carry Hoki somewhere else.
    let press = null;
    catButton.addEventListener('pointerdown', (event) => {
      if (event.button === 0) {
        press = { x: event.screenX, y: event.screenY };
      }
    });
    window.addEventListener('pointermove', (event) => {
      if (press && (event.buttons & 1) && Math.hypot(event.screenX - press.x, event.screenY - press.y) > 5) {
        press = null;
        nativeCall('widget_drag');
      }
    });
    window.addEventListener('pointerup', (event) => {
      if (press && event.button === 0) {
        tap();
      }
      press = null;
    });

    // Right-click menu.
    const menu = document.createElement('div');
    menu.className = 'widget-menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    const items = [
      ['Open Hoki', () => nativeCall('open_app')],
      ['Small', () => nativeCall('widget_size', { size: 0 })],
      ['Medium', () => nativeCall('widget_size', { size: 1 })],
      ['Large', () => nativeCall('widget_size', { size: 2 })],
      ['Sound on / off', () => {
        state.sound = !state.sound;
        save();
        renderStats();
      }],
      ['Hide Hoki', () => nativeCall('close_widget')],
    ];
    for (const [label, action] of items) {
      const item = document.createElement('button');
      item.type = 'button';
      item.setAttribute('role', 'menuitem');
      item.textContent = label;
      item.addEventListener('click', () => {
        menu.hidden = true;
        action();
      });
      menu.append(item);
    }
    document.body.append(menu);
    window.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      menu.hidden = false;
      const x = Math.min(event.clientX, window.innerWidth - menu.offsetWidth - 4);
      const y = Math.min(event.clientY, window.innerHeight - menu.offsetHeight - 4);
      menu.style.left = `${Math.max(4, x)}px`;
      menu.style.top = `${Math.max(4, y)}px`;
    });
    window.addEventListener('pointerdown', (event) => {
      if (!menu.contains(event.target)) {
        menu.hidden = true;
      }
    }, true);
    window.addEventListener('blur', () => {
      menu.hidden = true;
    });
  }

  // Small hook for automated checks.
  window.hoki = {
    tap,
    state,
    getBoost: () => boost,
    getFold: () => pawFold,
    getRenderer: () => (cat3d ? '3d' : 'svg'),
    isReady: () => catReady,
    getPose: () => (cat3d ? cat3d.pose() : null),
    getFortune: () => currentFortune, getShareText: fortuneShareText };
})();
