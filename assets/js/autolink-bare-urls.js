(function () {
  function linkify(container) {
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
          // если нет http/https — мимо
          if (!/https?:\/\/\S/.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
          // пропускаем запрещённые контейнеры
          const el = node.parentElement;
          if (!el || el.closest('a, code, pre, script, style, textarea')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const targets = [];
    while (walker.nextNode()) targets.push(walker.currentNode);

    // игнорируем vk.com — их обработает vk-photos.js (после VkFix у ссылок будет class="vk-attach")
    const rx = /(https?:\/\/(?!(?:m\.)?vk\.com\/)[^\s<>"')]+)([.,!?;:)]?)/g;

    targets.forEach(node => {
      const text = node.nodeValue;
      let last = 0, m;
      const frag = document.createDocumentFragment();

      while ((m = rx.exec(text)) !== null) {
        const [full, url, trail] = m;
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
