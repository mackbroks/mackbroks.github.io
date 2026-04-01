(function () {
  'use strict';

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  /* ----- Page tabs (Projects / About me) — runs before projects block so nav always works ----- */
  function initPageTabs() {
    var tablist = document.querySelector('.page-nav[role="tablist"]');
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
