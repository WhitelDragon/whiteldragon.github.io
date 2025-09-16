/* assets/js/search.js
   Ожидается, что JSON по /search.json уже загружен (fetch) и отфильтрован.
   Ниже — только рендер одной карточки результата.
*/

function renderSearchResult(hit) {
  const a = document.createElement('a');
  a.className = 'sr-item';
  a.href = hit.url;

  const wrap = document.createElement('div');
  wrap.className = 'sr-inner';

  if (hit.thumb) {
    const t = document.createElement('img');
    t.className = 'sr-thumb';
    t.src = hit.thumb;
    t.alt = '';
    t.loading = 'lazy';
    wrap.appendChild(t);
  }

  const body = document.createElement('div');
  body.className = 'sr-body';

  const h3 = document.createElement('h3');
  h3.className = 'sr-title';
  h3.textContent = hit.title;
  body.appendChild(h3);

  const meta = document.createElement('div');
  meta.className = 'sr-meta';
  meta.textContent = new Date(hit.date).toLocaleDateString('ru-RU', { day:'2-digit', month:'short', year:'numeric' });
  body.appendChild(meta);

  const p = document.createElement('p');
  p.className = 'sr-excerpt';
  p.textContent = hit.excerpt || '';
  body.appendChild(p);

  wrap.appendChild(body);
  a.appendChild(wrap);
  return a;
}

// пример вставки результатов:
async function runSearch(q) {
  const res = await fetch('/search.json');
  const data = await res.json();

  // здесь оставь свой алгоритм сортировки/релевантности;
  // для примера — простая фильтрация по подстроке (регистр неважен)
  const lc = q.trim().toLowerCase();
  const hits = data.filter(p =>
    p.title.toLowerCase().includes(lc) ||
    p.content.toLowerCase().includes(lc)
  );

  const list = document.getElementById('search-results');
  list.innerHTML = '';
  hits.forEach(hit => list.appendChild(renderSearchResult(hit)));
}
