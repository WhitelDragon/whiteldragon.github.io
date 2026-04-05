// Квадратные превью с раскрытием по клику/Enter
(function () {
  function toggle(fig) {
    fig.classList.toggle('expanded');
    fig.setAttribute('aria-expanded', fig.classList.contains('expanded') ? 'true' : 'false');
    // Lazy-load full image on first expand
    if (fig.classList.contains('expanded')) {
      var img = fig.querySelector('img[data-src]');
      if (img && img.dataset.src) {
        img.src = img.dataset.src;
        delete img.dataset.src;
      }
    }
  }

  document.addEventListener('click', function (e) {
    var fig = e.target.closest && e.target.closest('.media.media-img.expandable.thumb');
    if (!fig) return;
    toggle(fig);
  });

  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.media.media-img.expandable.thumb')) {
      e.preventDefault();
      toggle(e.target);
    }
  });
})();
