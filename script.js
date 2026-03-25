(function () {
  'use strict';

  // ---- Dot field background (subtle repulsion) ----
  var canvas = document.getElementById('dot-field');
  var ctx = canvas && canvas.getContext ? canvas.getContext('2d', { alpha: true }) : null;

  var prefersReducedMotion = false;
  try {
    prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_) {}

  var dots = [];
  var mouse = { x: -9999, y: -9999 };

  // Tunables: dense, controlled motion
  var spacing = 18;   // more dots
  var radius = 42;    // smaller influence area
  var strength = 7;   // less push
  var ease = 0.10;    // smooth recovery
  var baseDotSize = 1.15;

  var dpr = 1;
  var cssW = 0;
  var cssH = 0;
  var rafId = 0;

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function setCanvasSize() {
    if (!canvas || !ctx) return;

    var rect = canvas.getBoundingClientRect();
    cssW = Math.max(1, Math.floor(rect.width));
    cssH = Math.max(1, Math.floor(rect.height));

    dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);

    // Draw in CSS pixel coordinates
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function buildDots(width, height) {
    dots.length = 0;
    if (!width || !height) return;

    // Offset so dots aren't clipped hard at edges
    var startX = spacing / 2;
    var startY = spacing / 2;

    for (var y = startY; y < height; y += spacing) {
      for (var x = startX; x < width; x += spacing) {
        dots.push({
          baseX: x,
          baseY: y,
          x: x,
          y: y,
          size: baseDotSize
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

  function animateDotField() {
    if (!ctx || !canvas) return;
    if (prefersReducedMotion) return;
    if (document.hidden) {
      rafId = window.requestAnimationFrame(animateDotField);
      return;
    }

    ctx.clearRect(0, 0, cssW, cssH);

    for (var i = 0; i < dots.length; i++) {
      var dot = dots[i];

      // Distance from cursor to base position (stable)
      var dx = dot.baseX - mouse.x;
      var dy = dot.baseY - mouse.y;
      var dist = Math.hypot(dx, dy);

      var targetX = dot.baseX;
      var targetY = dot.baseY;

      var inside = dist < radius;
      if (inside) {
        var force = (1 - dist / radius) * strength;
        var angle = Math.atan2(dy, dx);
        targetX += Math.cos(angle) * force;
        targetY += Math.sin(angle) * force;
      }

      dot.x += (targetX - dot.x) * ease;
      dot.y += (targetY - dot.y) * ease;

      // Slight color/alpha shift near cursor (premium touch)
      var alpha = inside ? (0.35 + (1 - dist / radius) * 0.55) : 0.30;
      ctx.fillStyle = 'rgba(210, 230, 255, ' + alpha.toFixed(3) + ')';

      ctx.beginPath();
      ctx.arc(dot.x, dot.y, dot.size, 0, Math.PI * 2);
      ctx.fill();
    }

    rafId = window.requestAnimationFrame(animateDotField);
  }

  function initDotField() {
    if (!canvas || !ctx) return;

    // Keep it unobtrusive behind everything.
    canvas.setAttribute('aria-hidden', 'true');

    setCanvasSize();
    buildDots(cssW, cssH);

    // Pointer tracking (covers mouse, pen, trackpads)
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave, { passive: true });
    window.addEventListener('blur', onPointerLeave, { passive: true });

    // Resize handling
    var resizeTimer = 0;
    window.addEventListener('resize', function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        setCanvasSize();
        buildDots(cssW, cssH);
      }, 80);
    });

    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = window.requestAnimationFrame(animateDotField);
  }

  initDotField();

  // Sort project blocks by upload recency: ascending = oldest first (by data-date YYYY-MM-DD)
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

  // Footer: current year
  var yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Image modal: click .media-box img to open, click overlay or close button to exit
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
