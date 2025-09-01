---
---
(() => {
  // Базовые пути (Liquid подставит baseurl проекта)
  const MAP_URL = "{{ '/assets/vk_photos/photos.json' | relative_url }}";
  const BASE    = "{{ '/assets/vk_photos/' | relative_url }}";

  // В каких подпапках искать, по порядку
  const FOLDERS = ["1", "2", "3", "4", "5"]; // меняется тут, если добавите 6,7,…

  let photoMap = null;

  const idFromHref = (href) => {
    const m = href && href.match(/photo(\d+_\d+)/);
    return m ? m[1] : null; // "41076938_457250179"
  };

  // Список кандидатов для имени: "2/x.jpg" -> только он; "x.jpg" -> 1..5 и корень
  const candidatesFor = (name) => {
    if (name.includes("/")) return [name];
    const list = FOLDERS.map(f => `${f}/${name}`);
    list.push(name); // на всякий случай поддержим старое размещение в корне
    return list;
  };

  // Картинка с fallback по каталогам 1..5
  const makeImgWithFallback = (name, alt) => {
    const img = document.createElement('img');
    img.loading = 'lazy'; // нативный lazy-loading, поддерживается браузерами. :contentReference[oaicite:2]{index=2}
    img.alt = alt || '';

    const candidates = candidatesFor(name);
    let i = 0;

    const tryNext = () => {
      if (i >= candidates.length) {
        img.removeEventListener('error', tryNext);
        return;
      }
      img.src = BASE + candidates[i++];
    };

    img.addEventListener('error', tryNext);
    img.addEventListener('load', () => img.removeEventListener('error', tryNext), { once: true });
    tryNext(); // старт

    return img;
  };

  const makeFigure = (names, alt) => {
    const fig = document.createElement('figure');
    fig.className = 'post-photo';
    (Array.isArray(names) ? names : [names]).forEach(n => {
      fig.appendChild(makeImgWithFallback(n, alt));
    });
    return fig;
  };

  // Заменяем ссылки vk.com/photo… на локальные <img>
  const replaceIn = (node) => {
    const root = node.querySelectorAll ? node : document;
    const anchors = root.querySelectorAll('a[href*="vk.com/photo"]');
    anchors.forEach(a => {
      const id = idFromHref(a.href);
      if (!id || !photoMap) return;

      const entry = photoMap[id] || photoMap['photo' + id];
      if (!entry) return;

      const fig = makeFigure(entry, a.textContent || id);
      a.replaceWith(fig);
    });
  };

  // Ловим посты, подгружаемые бесконечной прокруткой (MutationObserver) :contentReference[oaicite:3]{index=3}
  const observeNewPosts = () => {
    const container = document.getElementById('posts-container') || document.body;
    const obs = new MutationObserver((muts) => {
      for (const m of muts) m.addedNodes.forEach(n => { if (n.nodeType === 1) replaceIn(n); });
    });
    obs.observe(container, { childList: true, subtree: true });
  };

  async function init() {
    try {
      const r = await fetch(MAP_URL, { cache: 'no-store' });
      if (!r.ok) { console.warn('vk-photos: map fetch failed', r.status); return; }
      photoMap = await r.json();
      window.VKPhotoMap = photoMap; // для проверки в консоли
    } catch (e) {
      console.warn('vk-photos: map load error', e);
      return;
    }
    replaceIn(document);
    observeNewPosts();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
