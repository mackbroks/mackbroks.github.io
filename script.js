(function () {
  'use strict';

  var canvas = document.getElementById('dot-field');
  var ctx = canvas && canvas.getContext ? canvas.getContext('2d', { alpha: true }) : null;

  var prefersReducedMotion = false;
  try {
    prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_) {}

  var dots = [];
  var mouse = { x: -9999, y: -9999 };

  var spacing = 9;
  /** Larger = bigger “ring” of dots and more open space near the cursor */
  var influenceRadius = 210;
  /** Radial push: outward from cursor (stronger = clearer empty disk) */
  var strength = 17;
  /**
   * Clockwise tangential offset (screen coords, y-down). Perpendicular to radial is (-ny, nx).
   * Weight peaks at mid-radius so the swirl hugs the “ring”, not the center.
   */
  var spinStrength = 7;
  /** How quickly dots reach their pushed position (higher = snappier hole) */
  var ease = 0.18;
  /** Smaller dots = sharper circular edge; max still pops near cursor */
  var baseDotSize = 0.75;
  var maxDotSize = 2.1;
  /** Slow hue drift (rad/s) so the rainbow “moves” over time */
  var hueDrift = 0.04;

  /** ~30 fps target: stay under this for steady-state frames (measured in rAF). */
  var ADAPTIVE_FRAME_BUDGET_MS = 33;
  /** Allow quality to creep back up only when comfortably below budget. */
  var ADAPTIVE_RELAX_MS = 24;
  var ADAPTIVE_EMA_ALPHA = 0.14;
  var ADAPTIVE_COOLDOWN_MS = 400;
  var ADAPTIVE_WARMUP_FRAMES = 15;
  var ADAPTIVE_BAD_FRAMES_TO_DOWNGRADE = 2;
  var ADAPTIVE_GOOD_FRAMES_TO_UPGRADE = 48;

  /**
   * Each tier: [angleStepDeg, spacingMult, dprCap].
   * Degrade left→right when over budget; upgrade when sustained headroom.
   */
  var ADAPTIVE_TIERS = [
    [1, 1, 2],
    [2, 1, 2],
    [2, 1.25, 2],
    [3, 1.25, 2],
    [3, 1.5, 2],
    [4, 1.5, 2],
    [6, 1.5, 2],
    [6, 2, 2],
    [6, 2, 1]
  ];
  var ADAPTIVE_TIER_MAX = ADAPTIVE_TIERS.length - 1;

  var adaptiveTier = 0;
  var adaptivePendingTier = -1;
  var adaptiveFrameTimeEma = 0;
  var adaptiveFrameCount = 0;
  var adaptiveBadStreak = 0;
  var adaptiveGoodStreak = 0;
  var adaptiveLastTierChange = 0;

  var dpr = 1;
  var cssW = 0;
  var cssH = 0;
  var rafId = 0;
  var hueTime = 0;
  var lastFrame = 0;

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function getAdaptiveAngleStep() {
    return ADAPTIVE_TIERS[adaptiveTier][0];
  }

  function getAdaptiveSpacingMult() {
    return ADAPTIVE_TIERS[adaptiveTier][1];
  }

  function getAdaptiveDprCap() {
    return ADAPTIVE_TIERS[adaptiveTier][2];
  }

  function applyPendingAdaptiveTier() {
    if (adaptivePendingTier < 0) return;
    if (adaptivePendingTier === adaptiveTier) {
      adaptivePendingTier = -1;
      return;
    }
    adaptiveTier = clamp(adaptivePendingTier, 0, ADAPTIVE_TIER_MAX);
    adaptivePendingTier = -1;
    adaptiveLastTierChange = typeof performance !== 'undefined' ? performance.now() : Date.now();
    adaptiveFrameTimeEma = 0;
    adaptiveBadStreak = 0;
    adaptiveGoodStreak = 0;
    setCanvasSize();
    buildDots(cssW, cssH);
  }

  function considerAdaptiveTier(elapsedMs) {
    if (prefersReducedMotion) return;
    adaptiveFrameCount++;
    if (adaptiveFrameTimeEma <= 0) {
      adaptiveFrameTimeEma = elapsedMs;
    } else {
      adaptiveFrameTimeEma += ADAPTIVE_EMA_ALPHA * (elapsedMs - adaptiveFrameTimeEma);
    }
    if (adaptiveFrameCount <= ADAPTIVE_WARMUP_FRAMES) return;

    var now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (
      adaptiveLastTierChange > 0 &&
      now - adaptiveLastTierChange < ADAPTIVE_COOLDOWN_MS
    ) {
      return;
    }
    if (adaptivePendingTier >= 0) return;

    if (adaptiveFrameTimeEma > ADAPTIVE_FRAME_BUDGET_MS) {
      adaptiveBadStreak++;
      adaptiveGoodStreak = 0;
      if (adaptiveBadStreak >= ADAPTIVE_BAD_FRAMES_TO_DOWNGRADE && adaptiveTier < ADAPTIVE_TIER_MAX) {
        adaptivePendingTier = adaptiveTier + 1;
        adaptiveBadStreak = 0;
      }
    } else if (adaptiveFrameTimeEma < ADAPTIVE_RELAX_MS) {
      adaptiveGoodStreak++;
      adaptiveBadStreak = 0;
      if (adaptiveGoodStreak >= ADAPTIVE_GOOD_FRAMES_TO_UPGRADE && adaptiveTier > 0) {
        adaptivePendingTier = adaptiveTier - 1;
        adaptiveGoodStreak = 0;
      }
    } else {
      adaptiveBadStreak = 0;
      adaptiveGoodStreak = Math.max(0, adaptiveGoodStreak - 1);
    }
  }

  /** Stable rainbow per grid cell (plus optional time drift in draw) */
  function hueFromPosition(x, y, w, h) {
    if (!w || !h) return 0;
    var nx = x / w;
    var ny = y / h;
    return (nx * 320 + ny * 160) % 360;
  }

  function setCanvasSize() {
    if (!canvas || !ctx) return;

    var rect = canvas.getBoundingClientRect();
    cssW = Math.max(1, Math.floor(rect.width));
    cssH = Math.max(1, Math.floor(rect.height));

    dpr = clamp(window.devicePixelRatio || 1, 1, getAdaptiveDprCap());
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);


    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * Polar grid from viewport center: angular step and radial step scale with adaptive tier.
   * Points outside the rect are skipped (corners).
   */
  function buildDots(width, height) {
    dots.length = 0;
    if (!width || !height) return;

    var angleStepDeg = getAdaptiveAngleStep();
    var dr = spacing * getAdaptiveSpacingMult();

    var cx = width * 0.5;
    var cy = height * 0.5;
    var maxR = Math.hypot(Math.max(cx, width - cx), Math.max(cy, height - cy)) + dr;
    var jitter = 0.55;
    var degToRad = Math.PI / 180;

    function pushDot(bx, by) {
      var jx = (Math.random() - 0.5) * 2 * jitter;
      var jy = (Math.random() - 0.5) * 2 * jitter;
      bx += jx;
      by += jy;
      dots.push({
        baseX: bx,
        baseY: by,
        x: bx,
        y: by,
        size: baseDotSize,
        hue: hueFromPosition(bx, by, width, height)
      });
    }

    for (var r = dr; r <= maxR; r += dr) {
      for (var deg = 0; deg < 360; deg += angleStepDeg) {
        var rad = deg * degToRad;
        var bx = cx + r * Math.cos(rad);
        var by = cy + r * Math.sin(rad);
        if (bx < 0 || bx >= width || by < 0 || by >= height) continue;
        pushDot(bx, by);
      }
    }

    pushDot(cx, cy);
  }

  function onPointerMove(e) {
    if (!canvas) return;
    var rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  }

  function onPointerLeave() {
    mouse.x = -9999;
    mouse.y = -9999;
  }

  function drawStaticReducedMotion() {
    if (!ctx || !canvas) return;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, cssW, cssH);
    for (var i = 0; i < dots.length; i++) {
      var dot = dots[i];
      var h = dot.hue % 360;
      ctx.fillStyle = 'hsl(' + h.toFixed(1) + ', 18%, 14%)';
      ctx.beginPath();
      ctx.arc(dot.baseX, dot.baseY, baseDotSize, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function animateDotField() {
    if (!ctx || !canvas) return;
    if (prefersReducedMotion) {
      drawStaticReducedMotion();
      return;
    }
    if (document.hidden) {
      rafId = window.requestAnimationFrame(animateDotField);
      return;
    }

    applyPendingAdaptiveTier();

    var now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    var dt = lastFrame ? (now - lastFrame) * 0.001 : 0;
    if (dt > 0.12) dt = 0.12;
    lastFrame = now;
    hueTime += dt * hueDrift * 360;

    var frameStart = typeof performance !== 'undefined' ? performance.now() : Date.now();

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, cssW, cssH);

    var radiusSq = influenceRadius * influenceRadius;
    var invRadius = 1 / influenceRadius;

    for (var i = 0; i < dots.length; i++) {
      var dot = dots[i];

      var dx = dot.baseX - mouse.x;
      var dy = dot.baseY - mouse.y;
      var distSq = dx * dx + dy * dy;

      var targetX = dot.baseX;
      var targetY = dot.baseY;

      var inside = distSq < radiusSq;
      var dist = 0;
      if (inside) {
        dist = Math.sqrt(distSq);
        var nx = dx / (dist || 1);
        var ny = dy / (dist || 1);
        var t = 1 - dist * invRadius;
        var radial = t * strength;
        targetX += nx * radial;
        targetY += ny * radial;
        var edge = dist * invRadius;
        var ring = 4 * edge * (1 - edge);
        var spin = spinStrength * ring;
        targetX += -ny * spin;
        targetY += nx * spin;
      }

      dot.x += (targetX - dot.x) * ease;
      dot.y += (targetY - dot.y) * ease;

      var engagement = 0;
      if (inside) {
        engagement = 1 - dist * invRadius;
        engagement = engagement * engagement;
      }

      var h = (dot.hue + hueTime) % 360;
      if (h < 0) h += 360;
      var sat = 12 + engagement * 82;
      var light = 10 + engagement * 58;
      ctx.fillStyle = 'hsl(' + h.toFixed(1) + ', ' + sat.toFixed(1) + '%, ' + light.toFixed(1) + '%)';

      var rDot = baseDotSize + (maxDotSize - baseDotSize) * engagement;
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, rDot, 0, Math.PI * 2);
      ctx.fill();
    }

    var elapsedFrame =
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - frameStart;
    considerAdaptiveTier(elapsedFrame);

    rafId = window.requestAnimationFrame(animateDotField);
  }

  function initDotField() {
    if (!canvas || !ctx) return;

      canvas.setAttribute('aria-hidden', 'true');

    setCanvasSize();
    buildDots(cssW, cssH);

  
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave, { passive: true });
    window.addEventListener('blur', onPointerLeave, { passive: true });

    var resizeTimer = 0;
    window.addEventListener('resize', function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        setCanvasSize();
        buildDots(cssW, cssH);
        if (prefersReducedMotion) drawStaticReducedMotion();
      }, 80);
    });

    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = window.requestAnimationFrame(animateDotField);
  }

  initDotField();

  /* ----- Page tabs (Projects / About me) — runs before projects block so nav always works ----- */
  function initPageTabs() {
    var tablist = document.querySelector('.page-nav-inner[role="tablist"]');
    if (!tablist) return;

    var tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
    var panels = tabs.map(function (t) {
      var id = t.getAttribute('aria-controls');
      return id ? document.getElementById(id) : null;
    });

    function setHashForIndex(index) {
      if (typeof history === 'undefined' || !history.replaceState) return;
      var base = location.pathname + location.search;
      if (index === 1) {
        history.replaceState(null, '', base + '#about');
      } else {
        history.replaceState(null, '', base);
      }
    }

    function select(index) {
      var i = clamp(index, 0, tabs.length - 1);
      tabs.forEach(function (tab, j) {
        var selected = j === i;
        tab.setAttribute('aria-selected', selected ? 'true' : 'false');
        tab.tabIndex = selected ? 0 : -1;
        if (panels[j]) {
          panels[j].hidden = !selected;
        }
      });
      setHashForIndex(i);
    }

    function indexFromHash() {
      if (location.hash === '#about') return 1;
      return 0;
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () {
        select(i);
      });
      tab.addEventListener('keydown', function (e) {
        var next = i;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          next = (i + 1) % tabs.length;
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          next = (i - 1 + tabs.length) % tabs.length;
        } else if (e.key === 'Home') {
          next = 0;
        } else if (e.key === 'End') {
          next = tabs.length - 1;
        } else {
          return;
        }
        e.preventDefault();
        select(next);
        tabs[next].focus();
      });
    });

    window.addEventListener('hashchange', function () {
      select(indexFromHash());
    });

    select(indexFromHash());
  }

  initPageTabs();

  var container = document.getElementById('projects');
  if (!container) return;

  var blocks = Array.from(container.querySelectorAll('.project-block'));
  blocks.sort(function (a, b) {
    var dateA = a.getAttribute('data-date') || '0000-00-00';
    var dateB = b.getAttribute('data-date') || '0000-00-00';
    return dateA.localeCompare(dateB);
  });

  blocks.forEach(function (block) {
    container.appendChild(block);
  });

  var yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ----- Media modal (root): image or video fullscreen ----- */
  var modal = document.getElementById('media-modal');
  var modalImg = modal && modal.querySelector('.media-modal-img');
  var modalVideo = modal && modal.querySelector('.media-modal-video');
  var modalBackdrop = modal && modal.querySelector('.media-modal-backdrop');
  var modalClose = modal && modal.querySelector('.media-modal-close');

  function showModalImage(src, alt) {
    if (!modal || !modalImg || !modalVideo) return;
    modalVideo.pause();
    modalVideo.removeAttribute('src');
    modalVideo.hidden = true;
    modalImg.hidden = false;
    modalImg.src = src;
    modalImg.alt = alt || '';
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function showModalVideo(src) {
    if (!modal || !modalImg || !modalVideo) return;
    modalImg.removeAttribute('src');
    modalImg.alt = '';
    modalImg.hidden = true;
    modalVideo.hidden = false;
    modalVideo.src = src;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    var p = modalVideo.play();
    if (p && typeof p.catch === 'function') p.catch(function () {});
  }

  function closeMediaModal() {
    if (!modal || !modalVideo) return;
    modalVideo.pause();
    modalVideo.removeAttribute('src');
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  if (modalBackdrop) modalBackdrop.addEventListener('click', closeMediaModal);
  if (modalClose) modalClose.addEventListener('click', closeMediaModal);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal && modal.classList.contains('is-open')) {
      closeMediaModal();
    }
  });

  document.querySelectorAll('.carousel-embed--zoom').forEach(function (img) {
    img.addEventListener('click', function () {
      showModalImage(this.src, this.alt);
    });
  });

  document.querySelectorAll('.carousel-fullscreen').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var slide = btn.closest('.carousel-slide');
      var v = slide && slide.querySelector('video.carousel-embed');
      if (v && v.src) showModalVideo(v.src);
    });
  });

  /* ----- Carousels ----- */
  function initCarousel(root) {
    var viewport = root.querySelector('.carousel-viewport');
    var track = root.querySelector('.carousel-track');
    var slides = track ? track.querySelectorAll('.carousel-slide') : [];
    var prev = root.querySelector('.carousel-prev');
    var next = root.querySelector('.carousel-next');
    var currEl = root.querySelector('.carousel-curr');
    var totalEl = root.querySelector('.carousel-total');
    var n = slides.length;
    var index = 0;

    if (!track || !viewport || n === 0) return;

    root.style.setProperty('--carousel-slides', String(n));
    root.setAttribute('data-slide-count', String(n));
    if (totalEl) totalEl.textContent = String(n);
    if (n <= 1) {
      if (prev) prev.disabled = true;
      if (next) next.disabled = true;
      return;
    }

    function apply() {
      var pct = -(index / n) * 100;
      track.style.transform = 'translateX(' + pct + '%)';
      if (currEl) currEl.textContent = String(index + 1);
      if (prev) prev.disabled = index <= 0;
      if (next) next.disabled = index >= n - 1;
    }

    if (prev) {
      prev.addEventListener('click', function () {
        index = Math.max(0, index - 1);
        apply();
      });
    }
    if (next) {
      next.addEventListener('click', function () {
        index = Math.min(n - 1, index + 1);
        apply();
      });
    }

    apply();
  }

  document.querySelectorAll('[data-carousel]').forEach(initCarousel);
})();
