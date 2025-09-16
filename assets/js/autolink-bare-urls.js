// Делает голые http/https ссылки кликабельными в контенте постов,
// КРОМЕ ссылок на VK фото/видео: https://vk.com/photo..., https://vk.com/video...
// (Также пропускаем m.vk.com/photo|video)
//
// Не трогаем уже существующие <a>, а также code/pre/script/style/textarea.
(function () {
  function linkify(container) {
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const text = node.nodeValue;
          if (!text || !/https?:\/\/\S/.test(text)) return NodeFilter.FILTER_REJECT;
          const el = node.parentElement;
          if (!el) return NodeFilter.FILTER_REJECT;
          if (el.closest('a, code, pre, script, style, textarea')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const targets = [];
    while (walker.nextNode()) targets.push(walker.currentNode);

    // Матчим любой http(s) URL, но исключаем vk.com/photo... и vk.com/video... (и m.vk.com/…)
    // Хвостовую пунктуацию (. , ! ? ; : ) выносим за пределы ссылки.
    const rx = /(https?:\/\/(?!(?:m\.)?vk\.com\/(?:photo|video)\b)[^\s<>"')]+)([.,!?;:)]?)/gi;

    targets.forEach(node => {
      const text = node.nodeValue;
      let last = 0, m;
      const frag = document.createDocumentFragment();

      while ((m = rx.exec(text)) !== null) {
        const full = m[0];
        const url  = m[1];
        const trail = m[2] || '';

        // Текст до ссылки
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));

        // Ссылка
        const a = document.createElement('a');
        a.href = url;
        a.textContent = url;
        a.target = '_blank';
        a.rel = 'nofollow ugc noopener';
        frag.appendChild(a);

        // Хвостовая пунктуация (если была)
        if (trail) frag.appendChild(document.createTextNode(trail));

        last = m.index + full.length;
      }

      // Хвост после последнего совпадения
      frag.appendChild(document.createTextNode(text.slice(last)));

      // Замена узла
      node.parentNode.replaceChild(frag, node);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('article.post, .post, .post-content').forEach(linkify);
  });
})();
