// Удаляем только ГОЛЫЕ vk photo/video URL внутри <p>, если на тот же ID уже есть <a href="...">.
// Сопроводительный текст в <p> сохраняем. Если после вырезания осталось лишь слово
// "Фотография/Видео/Видеозапись" и пустота — удаляем весь <p>.
// Запускать ДО vk-photos.js.

(function () {
  function normVkMedia(url) {
    try {
      const u = new URL(url);
      if (!/(^|\.)vk\.com$/i.test(u.hostname)) return null;
      const id = u.pathname.replace(/^\/+/, '').toLowerCase();
      // ожидаем строго photo123_456 или video123_456
      return /^(photo|video)\d+_\d+$/.test(id) ? id : null;
    } catch (_) { return null; }
  }

  function cutBareVkMediaInParagraph(p, hasAnchorId) {
    // режем только совпадения, для которых уже есть anchor с тем же media-id
    // оставшиеся vk-ссылки (без якорей) не трогаем — их обработает vk-photos.js
    let html = p.innerHTML;

    // отметим, вырезали ли что-то — чтобы потом проверить "пустую подпись"
    let cutSomething = false;

    html = html.replace(
      /https?:\/\/(?:m\.)?vk\.com\/((?:photo|video)\d+_\d+)/ig,
      (full, id) => {
        const mediaId = String(id).toLowerCase();
        if (hasAnchorId(mediaId)) { cutSomething = true; return ""; }
        return full;
      }
    );

    // нормализуем пробелы после вырезания ссылок
    html = html.replace(/[ \t]{2,}/g, " ")
               .replace(/\s+(\.|,|!|\?|;|:|\))/g, "$1")
               .replace(/\(\s+/g, "(")
               .trim();

    // если осталась только подпись(и) без содержимого — удаляем абзац
    const onlyLabel = (p) => {
      const t = p.textContent.trim().toLowerCase();
      if (!t) return true;
      // допускаем несколько слов "фотография/видео/видеозапись" с пунктуацией
      return /^((фотография|видео|видеозапись)[\s.,:;!?-]*)+$/i.test(t);
    };

    if (cutSomething) {
      // применяем изменения
      if (html.length === 0) {
        p.remove();
        return;
      }
      p.innerHTML = html;
      if (onlyLabel(p)) p.remove();
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('article.post').forEach(function (article) {
      // соберём media-id из якорей внутри статьи
      const anchorIds = new Set(
        Array.from(article.querySelectorAll('a[href]'))
          .map(a => normVkMedia(a.getAttribute('href') || ""))
          .filter(Boolean)
      );
      if (!anchorIds.size) return;

      const hasAnchorId = (id) => anchorIds.has(id);

      // для каждого <p> вырезаем только голые vk-media URL с media-id, уже имеющим якорь
      article.querySelectorAll('p').forEach(p => cutBareVkMediaInParagraph(p, hasAnchorId));
    });
  });
})();
