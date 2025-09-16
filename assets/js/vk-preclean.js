// Удаляет дубли до вставки картинок:
// если в статье есть <a href="https://vk.com/(photo|video)<id>">,
// то <p>, где встречается такой же "голый" URL (photo|video), удаляем.
// Запускать ДО vk-photos.js.

(function () {
  function normVkMedia(url) {
    try {
      const u = new URL(url);
      // только vk.com и m.vk.com
      if (!/(^|\.)vk\.com$/i.test(u.hostname)) return null;
      // интересуют только photo|video
      const m = u.pathname.replace(/^\/+/, '').match(/^(photo|video)\d+_\d+$/i);
      return m ? m[0].toLowerCase() : null; // например "photo41076938_457251035"
    } catch (_) { return null; }
  }

  // извлекаем все media-id из текста абзаца (голые URL)
  function findRawVkIds(text) {
    const out = [];
    const rx = /https?:\/\/(?:m\.)?vk\.com\/((?:photo|video)\d+_\d+)/ig;
    let m;
    while ((m = rx.exec(text)) !== null) {
      out.push(m[1].toLowerCase());
    }
    return out;
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('article.post').forEach(function (article) {
      // Шаг 1: соберём ID из <a href="…"> внутри статьи
      const anchorIds = new Set(
        Array.from(article.querySelectorAll('a[href]'))
          .map(a => normVkMedia(a.getAttribute('href')))
          .filter(Boolean)
      );
      if (!anchorIds.size) return;

      // Шаг 2: удалим <p>, где есть голые URL на те же ID
      Array.from(article.querySelectorAll('p')).forEach(function (p) {
        const ids = findRawVkIds(p.textContent || '');
        if (!ids.length) return;
        // есть пересечение с уже имеющимися якорями?
        if (ids.some(id => anchorIds.has(id))) {
          p.remove();
        }
      });
    });
  });
})();
