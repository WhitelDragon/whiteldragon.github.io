// Делает кликабельными все http/https ссылки в тексте.
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

    // Любой http(s) URL. Хвостовую пунктуацию выносим за ссылку.
    const rx = /(https?:\/\/[^\s<>"')]+)([.,!?;:)]?)/g;

    targets.forEach(node => {
      const text = node.nodeValue;
      let last = 0, m;
      const frag = document.createDocumentFragment();

      while ((m = rx.exec(text)) !== null) {
        const full = m[0];
        const url  = m[1];
        const trail = m[2] || '';
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        const a = document.createElement('a');
        a.href = url;
        a.textContent = url;
        a.target = '_blank';
        a.rel = 'nofollow ugc noopener';
        frag.appendChild(a);
        if (trail) frag.appendChild(document.createTextNode(trail));
        last = m.index + full.length;
      }
      frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(frag, node);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('article.post, .post, .post-content').forEach(linkify);
  });
})();
