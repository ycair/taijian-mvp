(() => {
  const deck = document.getElementById('deck');
  const slides = [...document.querySelectorAll('.slide')];
  const dotsWrap = document.getElementById('dots');
  const sectionLabel = document.getElementById('section-label');
  const counter = document.getElementById('slide-counter');
  const progress = document.getElementById('progress-bar');
  const prevBtn = document.getElementById('prev');
  const nextBtn = document.getElementById('next');
  const autoBtn = document.getElementById('auto');
  const fullBtn = document.getElementById('full');
  const helpBtn = document.getElementById('help-btn');
  const help = document.getElementById('help');
  const helpClose = document.getElementById('help-close');

  let index = 0;
  let autoTimer = null;
  let autoOn = false;

  const pad = (n) => String(n).padStart(2, '0');
  const isInteractive = (el) =>
    !!el.closest('button, a, input, .segmented, .phone, .nfc-sticker, .scenario-tabs, .toggle, .controls, .help-card');

  slides.forEach((slide, i) => {
    slide.setAttribute('role', 'group');
    slide.setAttribute('aria-roledescription', 'slide');
    slide.setAttribute('aria-label', `${i + 1} / ${slides.length}`);
    slide.setAttribute('aria-hidden', i === 0 ? 'false' : 'true');
    const dot = document.createElement('button');
    dot.className = 'nav-dot' + (i === 0 ? ' is-on' : '');
    dot.type = 'button';
    dot.setAttribute('role', 'tab');
    dot.setAttribute('aria-label', `第 ${i + 1} 頁：${slide.dataset.label || ''}`);
    dot.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
    dot.addEventListener('click', () => go(i));
    dotsWrap.appendChild(dot);
  });
  const dots = [...dotsWrap.children];

  function setTheme(slide) {
    const light = slide.classList.contains('slide-paper');
    deck.dataset.theme = light ? 'light' : 'dark';
  }

  function go(next, opts = {}) {
    const target = Math.max(0, Math.min(slides.length - 1, next));
    if (target === index && opts.force !== true) return;
    slides[index].classList.remove('is-active');
    slides[index].setAttribute('aria-hidden', 'true');
    index = target;
    const slide = slides[index];
    slide.classList.add('is-active');
    slide.setAttribute('aria-hidden', 'false');
    setTheme(slide);
    sectionLabel.textContent = slide.dataset.section || '';
    counter.textContent = `${pad(index + 1)} / ${pad(slides.length)}`;
    progress.style.width = `${((index + 1) / slides.length) * 100}%`;
    dots.forEach((dot, i) => {
      dot.classList.toggle('is-on', i === index);
      dot.setAttribute('aria-selected', i === index ? 'true' : 'false');
    });
    if (opts.hash !== false) {
      history.replaceState(null, '', `#slide-${index + 1}`);
    }
    if (autoOn) restartAuto();
  }

  function next() { go(index + 1); }
  function prev() { go(index - 1); }

  nextBtn.addEventListener('click', next);
  prevBtn.addEventListener('click', prev);

  /* ---------- scenario tabs ---------- */
  const scenarios = {
    base: {
      mrr: 'NT$124k',
      note: '付費會員 P50 683 人；12 個月轉正 2.8%。',
    },
    commercial: {
      mrr: 'NT$556k',
      note: '付費會員 P50 2,623 人；12 個月轉正 39.4%。',
    },
    appstore: {
      mrr: 'NT$1.39M',
      note: '付費會員 P50 7,151 人；12 個月轉正 98.4%。',
    },
  };
  const mrrEl = document.getElementById('scenario-mrr');
  const noteEl = document.getElementById('scenario-note');
  const tabs = [...document.querySelectorAll('.scenario-tab')];
  const barRows = [...document.querySelectorAll('.bar-row')];
  function selectScenario(name) {
    const data = scenarios[name];
    if (!data) return;
    tabs.forEach((tab) => {
      const on = tab.dataset.scenario === name;
      tab.classList.toggle('is-on', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    barRows.forEach((row) => row.classList.toggle('is-active', row.dataset.bar === name));
    if (mrrEl) {
      mrrEl.classList.add('is-changing');
      mrrEl.textContent = data.mrr;
      window.setTimeout(() => mrrEl.classList.remove('is-changing'), 280);
    }
    if (noteEl) noteEl.textContent = data.note;
  }
  tabs.forEach((tab) => tab.addEventListener('click', () => selectScenario(tab.dataset.scenario)));
  // Keep the first scenario visually active even before the slide is reached.
  selectScenario('base');

  /* ---------- pricing ---------- */
  const billing = document.getElementById('billing-toggle');
  const proPrice = document.getElementById('pro-price');
  const proPeriod = document.getElementById('pro-period');
  const proFoot = document.getElementById('pro-foot');
  let annual = false;
  billing?.addEventListener('click', () => {
    annual = !annual;
    billing.classList.toggle('is-on', annual);
    billing.setAttribute('aria-pressed', annual ? 'true' : 'false');
    if (proPrice) proPrice.textContent = annual ? 'NT$1,990' : 'NT$199';
    if (proPeriod) proPeriod.textContent = annual ? '/ 年' : '/ 月';
    if (proFoot) proFoot.textContent = annual ? '等於每月 NT$166；年繳含 3 張 NFC 貼紙' : '年繳 NT$1,990，等於每月 NT$166';
    const label = billing.querySelector('.toggle-label');
    if (label) label.textContent = annual ? '年繳' : '月繳';
  });

  /* ---------- NFC demo ---------- */
  const phone = document.getElementById('nfc-phone');
  const sticker = document.getElementById('nfc-sticker');
  const ring = document.getElementById('tap-ring');
  const lockScreen = phone?.querySelector('[data-screen="lock"]');
  const recordScreen = phone?.querySelector('[data-screen="record"]');
  const lockNote = phone?.querySelector('.lock-note');
  const lockCardStrong = phone?.querySelector('.lock-card strong');
  const lockCardSmall = phone?.querySelector('.lock-card small');
  const segButtons = [...document.querySelectorAll('[data-nfc-mode]')];
  let nfcMode = 'blank';
  let nfcTimer = null;

  function setNfcMode(mode, silent = false) {
    nfcMode = mode;
    segButtons.forEach((btn) => btn.classList.toggle('is-on', btn.dataset.nfcMode === mode));
    if (lockScreen && recordScreen) {
      lockScreen.hidden = false;
      recordScreen.hidden = true;
    }
    if (lockNote) lockNote.textContent = mode === 'blank' ? '空白貼紙 · 靠近以寫入' : '已設定貼紙 · 碰一下開啟';
    if (lockCardStrong) lockCardStrong.textContent = mode === 'blank' ? '空白 NFC 貼紙' : '已感應貼紙';
    if (lockCardSmall) lockCardSmall.textContent = mode === 'blank' ? '點貼紙，寫入居民的快速記錄' : '點一下，開啟居民的今天';
  }

  function tapSticker() {
    if (!phone || !sticker) return;
    window.clearTimeout(nfcTimer);
    if (ring) {
      ring.classList.remove('is-tapping');
      void ring.offsetWidth;
      ring.classList.add('is-tapping');
    }
    if (nfcMode === 'bound') {
      if (lockScreen && recordScreen) {
        lockScreen.hidden = true;
        recordScreen.hidden = false;
      }
      return;
    }
    // Blank sticker: write, then bind, then open the record screen.
    phone.classList.add('is-writing');
    if (lockCardStrong) lockCardStrong.textContent = '寫入中…';
    if (lockCardSmall) lockCardSmall.textContent = '正在把居民寫進貼紙';
    nfcTimer = window.setTimeout(() => {
      phone.classList.remove('is-writing');
      if (lockScreen && recordScreen) {
        lockScreen.hidden = true;
        recordScreen.hidden = false;
      }
      nfcMode = 'bound';
      segButtons.forEach((btn) => btn.classList.toggle('is-on', btn.dataset.nfcMode === 'bound'));
    }, 850);
  }

  segButtons.forEach((btn) => btn.addEventListener('click', () => setNfcMode(btn.dataset.nfcMode)));
  sticker?.addEventListener('click', tapSticker);
  sticker?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      tapSticker();
    }
  });
  setNfcMode('blank');

  /* ---------- auto play ---------- */
  function restartAuto() {
    window.clearInterval(autoTimer);
    if (!autoOn) return;
    autoTimer = window.setInterval(() => {
      if (index >= slides.length - 1) go(0);
      else next();
    }, 9000);
  }
  function toggleAuto() {
    autoOn = !autoOn;
    autoBtn?.classList.toggle('is-on', autoOn);
    if (autoBtn) autoBtn.textContent = autoOn ? 'AUTO ON' : 'AUTO';
    if (autoOn) restartAuto();
    else window.clearInterval(autoTimer);
  }
  autoBtn?.addEventListener('click', toggleAuto);

  /* ---------- fullscreen ---------- */
  function toggleFull() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }
  fullBtn?.addEventListener('click', toggleFull);

  /* ---------- help ---------- */
  function openHelp() {
    help.hidden = false;
    helpClose?.focus();
  }
  function closeHelp() {
    help.hidden = true;
    helpBtn?.focus();
  }
  helpBtn?.addEventListener('click', openHelp);
  helpClose?.addEventListener('click', closeHelp);
  help?.addEventListener('click', (event) => {
    if (event.target === help) closeHelp();
  });

  /* ---------- keyboard / touch / click ---------- */
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!help.hidden) closeHelp();
      return;
    }
    if (event.target.closest('input, textarea, select')) return;
    switch (event.key) {
      case 'ArrowRight':
      case 'PageDown':
      case ' ':
        event.preventDefault();
        next();
        break;
      case 'ArrowLeft':
      case 'PageUp':
        event.preventDefault();
        prev();
        break;
      case 'Home':
        event.preventDefault();
        go(0);
        break;
      case 'End':
        event.preventDefault();
        go(slides.length - 1);
        break;
      case 'f':
      case 'F':
        event.preventDefault();
        toggleFull();
        break;
      case 'p':
      case 'P':
        event.preventDefault();
        toggleAuto();
        break;
      case '?':
        event.preventDefault();
        openHelp();
        break;
      default:
        break;
    }
  });

  let touchStartX = null;
  let touchStartY = null;
  document.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) return;
    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', (event) => {
    if (touchStartX == null) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    touchStartX = null;
    touchStartY = null;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      if (dx < 0) next();
      else prev();
    }
  }, { passive: true });

  document.addEventListener('click', (event) => {
    if (isInteractive(event.target)) return;
    const slide = event.target.closest('.slide');
    if (!slide) return;
    const rect = slide.getBoundingClientRect();
    const x = event.clientX - rect.left;
    if (x > rect.width * 0.58) next();
    else if (x < rect.width * 0.42) prev();
  });

  /* ---------- boot ---------- */
  const hashMatch = location.hash.match(/slide-(\d+)/);
  if (hashMatch) {
    const initial = Number(hashMatch[1]) - 1;
    index = 0;
    slides[0].classList.remove('is-active');
    slides[0].setAttribute('aria-hidden', 'true');
    go(initial, { hash: false, force: true });
  } else {
    setTheme(slides[0]);
    progress.style.width = `${(1 / slides.length) * 100}%`;
  }
})();
