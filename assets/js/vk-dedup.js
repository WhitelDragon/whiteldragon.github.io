// Оставляет по одной ссылке на каждый vk media id (photo123_456 или video123_456).
// Дублирующиеся ссылки удаляются. Делать это НУЖНО до vk-photos.js.
(function () {
  function mediaId(url) {
    try {
      const u = new URL(url);
      if (!/(^|\.)vk\.com$/i.test(u.hostname)) return null;
      const id = u.pathname.replace(/^\/+/, '').toLowerCase();
      return /^(photo|video)\d+_\d+$/.test(id) ? id : null;
    } catch (_) { return null; }
  }

  function isTrivialParagraph(p, keepWords) {
    const t = (p.textContent || '').trim().toLowerCase();
    if (!t) return true;
    return new RegExp(`^(?:(${keepWords.join('|')})[\\s.,:;!?-]*)+$`, 'i').test(t);
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('article.post').forEach(function (article) {
      const seen = new Set();
      const anchors = Array.from(article.querySelectorAll('a[href]'))
        .filter(a => !!mediaId(a.getAttribute('href') || ''));

      anchors.forEach(a => {
        const id = mediaId(a.getAttribute('href'));
        if (!id) return;
        if (seen.has(id)) {
          // Если это отдельный <p>, пустой кроме ссылки/подписи — удалим целиком, иначе просто ссылку
          const p = a.closest('p');
          if (p && isTrivialParagraph(p, ['вложение','фотография','видео','видеозапись'])) {
            p.remove();
          } else {
            a.remove();
          }
        } else {
          seen.add(id);
        }
      });
    });
  });
})();
