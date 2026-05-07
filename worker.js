/**
 * Cloudflare Worker для зеркала blog.whiteldragon.workers.dev.
 *
 * Задача — сделать зеркало САМОИНДЕКСИРУЕМЫМ.
 *
 * Проблема: Jekyll-плагин jekyll-seo-tag хардкодит canonical/og:url из
 * site.url = https://whiteldragon.github.io. Каждая страница на workers.dev
 * приходит с canonical, указывающим на основной сайт. Google видит
 * «Alternate page with proper canonical tag» и не индексирует зеркало.
 *
 * Решение: при запросе через workers.dev переписываем все вхождения
 * `https://whiteldragon.github.io` на `https://<этот-host>` в текстовых
 * ответах (HTML, XML-сайтмап, Atom-feed, robots.txt, JSON-LD). Тогда:
 *   • canonical становится self-referential
 *   • og:url правильный
 *   • sitemap содержит URL зеркала
 *   • feed.xml тоже корректный
 *   • Schema.org JSON-LD ссылается на зеркало
 * Google индексирует зеркало как самостоятельный сайт.
 *
 * Основной сайт whiteldragon.github.io обслуживает GitHub Pages — Worker
 * там не запускается, никаких побочных эффектов на индексацию основного
 * сайта.
 */

const SOURCE_ORIGIN = 'https://whiteldragon.github.io';

export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    const url = new URL(request.url);

    // Без проверки hostname — Worker запускается только на доменах,
    // подключенных к Cloudflare (workers.dev и любые кастомные домены),
    // на GitHub Pages его нет в принципе.
    // Но на всякий случай защищаемся: если кто-то подключил основной
    // домен whiteldragon.github.io к Cloudflare — НЕ переписываем.
    if (url.hostname === 'whiteldragon.github.io') {
      return response;
    }

    // Переписываем только текстовые ответы, где URL встречается как строка.
    const ct = (response.headers.get('content-type') || '').toLowerCase();
    const isRewritable =
      ct.startsWith('text/html') ||
      ct.startsWith('text/xml') ||
      ct.startsWith('application/xml') ||
      ct.startsWith('application/atom') ||
      ct.startsWith('application/rss') ||
      ct.startsWith('application/json') ||
      ct.startsWith('application/ld+json') ||
      (ct.startsWith('text/plain') && url.pathname.endsWith('robots.txt'));

    if (!isRewritable) {
      return response;
    }

    const targetOrigin = `${url.protocol}//${url.hostname}`;
    const body = await response.text();
    const rewritten = body.replaceAll(SOURCE_ORIGIN, targetOrigin);

    // Если тело не изменилось — отдаём оригинал (быстрее, без перепаковки).
    if (rewritten === body) {
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }

    // Переписали тело — нужно убрать заголовки, которые теперь невалидны.
    const newHeaders = new Headers(response.headers);
    newHeaders.delete('content-length'); // длина изменилась
    newHeaders.delete('etag');           // хеш контента изменился

    return new Response(rewritten, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  },
};
