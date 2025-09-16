// Удаляет дубли: если в статье есть <a href="https://vk.com/photo|video...">,
// то соседний <p> с таким же "голым" VK-URL (photo|video) удаляем.
// Делать это НУЖНО до запуска vk-photos.js.

(function () {
  function isVkMediaUrl(u) {
    return /^https?:\/\/(?:m\.)?vk\.com\/(?:photo|video)\b/i.test(u);
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('article.post').forEach(function (article) {
      // 1) Собираем все href якорей на vk photo/video
      const hrefs = new Set(
        Array.from(article.querySelectorAll('a[href]'))
          .map(a => a.getAttribute('href'))
          .filter(h => h && isVkMediaUrl(h))
      );
      if (!hrefs.size) return;

      // 2) Удаляем <p>, где встречается "голый" vk photo/video URL,
      //     если такой же href есть среди якорей (во избежание дубля)
      Array.from(article.querySelectorAll('p')).forEach(function (p) {
        const text = (p.textContent || "").trim();
        if (!text) return;

        // найдём все vk photo|video URL в этом <p>
        const matches = text.match(/https?:\/\/(?:m\.)?vk\.com\/(?:photo|video)[^\s<)]+/ig);
        if (!matches || !matches.length) return;

        // если хотя бы один из них уже есть как <a href="..."> — удаляем параграф
        if (matches.some(u => hrefs.has(u))) {
          p.remove();
        }
      });
    });
  });
})();
