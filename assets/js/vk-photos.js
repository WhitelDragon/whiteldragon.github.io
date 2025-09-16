// Находит <a class="vk-attach" href="https://vk.com/photo...">...</a>
// и ЗАМЕНЯЕТ её на <figure class="post-photo">...</figure> ОДИН РАЗ.
(function () {
  const processed = new Set();

  function extractId(href) {
    // примитивно для photo/album/video/doc — если у тебя другой формат, поправим тут
    try {
      const u = new URL(href);
      if (!/^(?:m\.)?vk\.com$/.test(u.hostname)) return null;
      return u.pathname.replace(/^\/+/, ''); // напр. "photo41076938_457250737"
    } catch (_) { return null; }
  }

  function makeFigure(href) {
    const id = extractId(href);
    const fig = document.createElement('figure');
    fig.className = 'post-photo';          // СВОЙ класс, не конфликтует с .media .thumb
    fig.dataset.vkId = id || '';
    const img = document.createElement('img');
    // тут твоя логика сопоставления id -> локальный файл, либо прокси
    // временно показываем ссылку как текст (или подставь свою карту путей)
    img.alt = '';
    img.loading = 'lazy';
    // Если у тебя есть карта id -> /assets/vk_photos/<..>.jpg, поставь сюда конечный src:
    // img.src = '/assets/vk_photos/2/jbS4lfYKC8s.jpg';
    // Fallback — не ломаем вёрстку:
    img.src = href;
    fig.appendChild(img);
    return fig;
  }

  function processAnchor(a) {
    const href = a.getAttribute('href') || '';
    const id = extractId(href);
    if (!id || processed.has(id)) return;
    processed.add(id);
    const fig = makeFigure(href);
    a.replaceWith(fig); // ЗАМЕНЯЕМ, не добавляем рядом (без дублей)
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('a.vk-attach[href^="http"]').forEach(processAnchor);
  });
})();
