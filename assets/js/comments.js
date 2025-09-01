---
---
(() => {
  const CANDIDATE_BASES = [
    "{{ '/assets/comments/' | relative_url }}",
    "{{ '/assets/wall/' | relative_url }}",
    "{{ '/wall/' | relative_url }}"
  ];
  const COMMENTS_FILE = 'comments0.html';

  const urlsFor = (pid) =>
    CANDIDATE_BASES.map(b => b.replace(/\/+$/,'') + '/' + pid + '/' + COMMENTS_FILE);

  // Достаём как bytes и ДЕКОДИРУЕМ сами (UTF-8 или windows-1251)
  async function fetchHtmlSmart(url) {
    const r = await fetch(url, { credentials: 'same-origin' });
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();

    // 1) Пытаемся определить win-1251 по <meta charset> в первых байтах
    const head = new Uint8Array(buf.slice(0, 2048));
    let ascii = '';
    for (let i = 0; i < head.length; i++) ascii += (head[i] < 128 ? String.fromCharCode(head[i]) : ' ');
    const hasWin1251Meta = /charset\s*=\s*windows-1251/i.test(ascii);

    // 2) Декодируем: сначала UTF-8, а если видим � — пробуем win-1251
    const decode = (enc) => new TextDecoder(enc).decode(buf);
    let txt = hasWin1251Meta ? decode('windows-1251') : decode('utf-8');

    if (!hasWin1251Meta && txt.includes('�')) {
      // fallback на windows-1251
      txt = decode('windows-1251');
    }
    return txt;
  }

  async function fetchFirst(urls) {
    for (const u of urls) {
      try {
        const html = await fetchHtmlSmart(u);
        if (html) return html;
      } catch (_) {}
    }
    return null;
  }

  function createToggle(pid, label) {
    const btn = document.createElement('button');
    btn.className = 'vkcom-toggle';
    btn.type = 'button';
    btn.textContent = label ?? 'Комментарии';
    btn.setAttribute('data-pid', pid);
    btn.setAttribute('aria-expanded', 'false');
    return btn;
  }

  function mountForArticle(article) {
    const pid = article.getAttribute('data-pid');
    if (!pid || article.__vkcomMounted) return;
    article.__vkcomMounted = true;

    let bar = article.querySelector('.vkcom-bar');
    if (!bar) { bar = document.createElement('div'); bar.className = 'vkcom-bar'; article.appendChild(bar); }
    const btn = createToggle(pid);
    bar.appendChild(btn);

    let box = article.querySelector('.vkcom-box');
    if (!box) { box = document.createElement('div'); box.className = 'vkcom-box'; box.hidden = true; article.appendChild(box); }

    btn.addEventListener('click', async () => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      if (expanded) { btn.setAttribute('aria-expanded', 'false'); box.hidden = true; return; }

      if (!box.__loaded) {
        btn.disabled = true; btn.classList.add('loading');
        const html = await fetchFirst(urlsFor(pid));
        btn.disabled = false; btn.classList.remove('loading');

        if (!html) { btn.textContent = 'Комментарии (нет архива)'; return; }

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');  // парсим уже ПРАВИЛЬНО декодированную строку
        doc.querySelectorAll('script, style, link, meta').forEach(n => n.remove());

        const containers = ['.wrap_page_content', '.post__comments', '.replies', 'body'];
        let wrap = null; for (const sel of containers) { wrap = doc.querySelector(sel); if (wrap) break; }
        if (!wrap) wrap = doc.body;

        let items = wrap.querySelectorAll('.item');
        if (!items.length) items = wrap.querySelectorAll('.reply, .comment, li, div');

        const count = items.length || wrap.children.length;

        const root = document.createElement('div');
        root.className = 'vkcom-list';
        (items.length ? items : wrap.children).forEach(el => root.appendChild(el.cloneNode(true)));

        box.appendChild(root);
        box.__loaded = true;
        btn.textContent = `Комментарии (${count})`;
      }
      btn.setAttribute('aria-expanded', 'true');
      box.hidden = false;
    });
  }

  function bootScope(root) {
    root.querySelectorAll('article.post[data-pid]').forEach(mountForArticle);
  }

  function init() {
    bootScope(document);
    const container = document.getElementById('posts-container') || document.body;
    const obs = new MutationObserver(muts => {
      muts.forEach(m => m.addedNodes.forEach(n => {
        if (n.nodeType === 1) {
          if (n.matches?.('article.post[data-pid]')) mountForArticle(n);
          else bootScope(n);
        }
      }));
    });
    obs.observe(container, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
