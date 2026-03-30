// Linkifies plain http/https URLs and turns YouTube video links into embedded previews.
// Existing <a> tags are left alone unless they point to a YouTube video.
(function () {
  function getYouTubeVideoId(rawUrl) {
    if (!rawUrl) return null;

    let url;
    try {
      url = new URL(rawUrl, window.location.href);
    } catch (_) {
      return null;
    }

    var host = url.hostname.replace(/^www\./, '').replace(/^m\./, '').toLowerCase();
    var pathname = url.pathname.replace(/\/+$/, '');

    if (host === 'youtu.be') {
      var shortId = pathname.split('/').filter(Boolean)[0];
      return shortId || null;
    }

    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (pathname.indexOf('/watch') === 0) {
        return url.searchParams.get('v');
      }

      if (pathname.indexOf('/shorts/') === 0) {
        return pathname.split('/')[2] || null;
      }

      if (pathname.indexOf('/embed/') === 0 || pathname.indexOf('/v/') === 0) {
        return pathname.split('/')[2] || null;
      }
    }

    return null;
  }

  function getStartTime(rawUrl) {
    try {
      var parsed = new URL(rawUrl, window.location.href);
      return parsed.searchParams.get('start') || parsed.searchParams.get('t') || '';
    } catch (_) {
      return '';
    }
  }

  function buildYouTubeEmbed(id, label, start) {
    var figure = document.createElement('figure');
    figure.className = 'media media-youtube youtube-embed';

    var card = document.createElement('a');
    card.className = 'youtube-card';
    card.href =
      'https://www.youtube.com/watch?v=' +
      encodeURIComponent(id) +
      (start ? '&t=' + encodeURIComponent(start) : '');
    card.target = '_blank';
    card.rel = 'nofollow noopener noreferrer';
    card.setAttribute('aria-label', label || 'YouTube preview');

    var img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = label || 'YouTube preview';
    img.src = 'https://i.ytimg.com/vi/' + encodeURIComponent(id) + '/hqdefault.jpg';

    var overlay = document.createElement('span');
    overlay.className = 'youtube-card-overlay';

    var play = document.createElement('span');
    play.className = 'youtube-play';
    play.setAttribute('aria-hidden', 'true');

    var text = document.createElement('span');
    text.className = 'youtube-card-text';
    text.textContent = 'Открыть на YouTube';

    overlay.appendChild(play);
    overlay.appendChild(text);
    card.appendChild(img);
    card.appendChild(overlay);
    figure.appendChild(card);
    return figure;
  }

  function replaceStandaloneYouTubeAnchors(container) {
    var anchors = container.querySelectorAll('a[href]');
    anchors.forEach(function (a) {
      var id = getYouTubeVideoId(a.href);
      if (!id) return;

      var label = a.getAttribute('aria-label') || a.getAttribute('title') || a.textContent.trim() || 'YouTube preview';
      var preview = buildYouTubeEmbed(id, label, getStartTime(a.href));

      var parent = a.parentElement;
      if (parent && parent.tagName === 'P' && parent.childNodes.length === 1) {
        parent.parentNode.replaceChild(preview, parent);
        return;
      }

      if (parent) {
        parent.insertBefore(preview, a);
        a.remove();
      }
    });
  }

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

    // Any http(s) URL. Punctuation after the URL is left outside the link.
    const rx = /(https?:\/\/[^\s<>"')]+)([.,!?;:)]?)/g;

    targets.forEach(node => {
      const text = node.nodeValue;
      let last = 0, m;
      const frag = document.createDocumentFragment();

      while ((m = rx.exec(text)) !== null) {
        const full = m[0];
        const url = m[1];
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
    document.querySelectorAll('article.post, .post, .post-content').forEach(function (container) {
      linkify(container);
      replaceStandaloneYouTubeAnchors(container);
    });
  });
})();
