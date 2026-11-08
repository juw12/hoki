// Hoki: a waving lucky cat. Tap it for a luck boost.
// Everything is stored on this device only (localStorage).

(() => {
  'use strict';

  const STORE_KEY = 'hoki.v1';

  // Paw motion: assets/cat.svg has one arm group #hoki-paw that rotates around data-pivot
  // between the two angles in data-paw-range (degrees). The desktop widget reads the same values.
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
  if (params.has('widget')) {
    document.body.classList.add('widget');
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
  function applyTimeOfDay() {
    const forced = params.get('time');
    document.documentElement.dataset.time = forced || timeOfDay(new Date().getHours());
  }
  applyTimeOfDay();
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
  let pawRange = [-10, 9];
  let pawAngle = 0;
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
  }

  function renderBoost() {
    const pct = Math.round(boost * 100);
    boostBar.firstElementChild.style.width = `${(boost * 100).toFixed(1)}%`;
    boostBar.setAttribute('aria-valuenow', String(pct));
    boostPct.textContent = `${pct}%`;
    glow.style.opacity = String(0.15 + boost * 0.75);
    glow.style.transform = `translate(-50%, -50%) scale(${(0.92 + boost * 0.18).toFixed(3)})`;
  }

  // Wave -1..1 -> arm angle: +1 = paw up (first angle), -1 = paw folded forward (second angle).
  function setPaw(wave) {
    if (!paw) {
      return;
    }
    const [up, folded] = pawRange;
    pawAngle = up + ((1 - wave) / 2) * (folded - up);
    paw.setAttribute('transform', `rotate(${pawAngle.toFixed(2)} ${pivot[0]} ${pivot[1]})`);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    boost *= Math.pow(0.5, dt / BOOST_HALF_LIFE_SEC);
    if (boost < 0.002) {
      boost = 0;
    }
    const speed = reducedMotion ? 0.35 : BASE_WAVES_PER_SEC + boost * MAX_EXTRA_WAVES_PER_SEC;
    phase += dt * speed * Math.PI * 2;
    setPaw(Math.sin(phase));
    renderBoost();
  }

  // ---------- effects ----------
  function pawPoint() {
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
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
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
    floatText(`+1 ${blessing}`, x + (Math.random() - 0.5) * 30, y - 10);
    coins(x, y, milestone ? 18 : 3);

    hint.classList.add('quiet');
    catButton.classList.add('bump');
    setTimeout(() => catButton.classList.remove('bump'), 90);

    if (milestone) {
      boost = 1;
      ringBell(true);
      const rect = catButton.getBoundingClientRect();
      // Above the head, so the celebration never covers the cat's face.
      floatText(milestone.zh, rect.left + rect.width * 0.62, rect.top - rect.height * 0.02, true);
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
    if (event.button === 0) {
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

  const desktopToggle = $('desktop-toggle');
  const desktopPanel = $('desktop');
  desktopToggle.addEventListener('click', () => {
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
  async function boot() {
    renderStats();
    const response = await fetch('assets/cat.svg');
    catButton.innerHTML = await response.text();
    catSvg = catButton.querySelector('svg');
    catSvg.removeAttribute('width');
    catSvg.removeAttribute('height');
    catSvg.setAttribute('aria-hidden', 'true');
    catSvg.setAttribute('focusable', 'false');
    paw = catSvg.querySelector('#hoki-paw');
    pivot = (catSvg.dataset.pivot || '0 0').split(' ').map(Number);
    pawRange = (catSvg.dataset.pawRange || '-10 9').split(' ').map(Number);
    requestAnimationFrame((now) => {
      lastFrame = now;
      frame(now);
    });
  }

  boot();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Small hook for automated checks.
  window.hoki = { tap, state, getBoost: () => boost, getAngle: () => pawAngle };
})();
