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

  var spacing = 10;
  var influenceRadius = 140;
  var strength = 6;
  var ease = 0.12;
  var baseDotSize = 1.1;
  var maxDotSize = 2.6;
  /** Slow hue drift (rad/s) so the rainbow “moves” over time */
  var hueDrift = 0.04;

  var dpr = 1;
  var cssW = 0;
  var cssH = 0;
  var rafId = 0;
  var hueTime = 0;
  var lastFrame = 0;

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
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

    dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);


    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function buildDots(width, height) {
    dots.length = 0;
    if (!width || !height) return;

    var startX = spacing / 2;
    var startY = spacing / 2;

    for (var y = startY; y < height; y += spacing) {
      for (var x = startX; x < width; x += spacing) {
        dots.push({
          baseX: x,
          baseY: y,
          x: x,
          y: y,
          size: baseDotSize,
          hue: hueFromPosition(x, y, width, height)
        });
      }
    }
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

    var now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    var dt = lastFrame ? (now - lastFrame) * 0.001 : 0;
    if (dt > 0.12) dt = 0.12;
    lastFrame = now;
    hueTime += dt * hueDrift * 360;

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
        var force = (1 - dist * invRadius) * strength;
        targetX += nx * force;
        targetY += ny * force;
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


  var modal = document.getElementById('image-modal');
  var modalImg = modal && modal.querySelector('.image-modal-img');
  var modalBackdrop = modal && modal.querySelector('.image-modal-backdrop');
  var modalClose = modal && modal.querySelector('.image-modal-close');

  function openModal(src, alt) {
    if (!modal || !modalImg) return;
    modalImg.src = src;
    modalImg.alt = alt || '';
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  if (modalBackdrop) modalBackdrop.addEventListener('click', closeModal);
  if (modalClose) modalClose.addEventListener('click', closeModal);

  document.querySelectorAll('.media-box img').forEach(function (img) {
    img.addEventListener('click', function () {
      openModal(this.src, this.alt);
    });
  });
})();
