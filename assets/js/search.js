// /assets/js/search.js
const els = {
  q: document.getElementById("q"),
  form: document.getElementById("search-form"),
  sort: document.getElementById("sort"),
  list: document.getElementById("search-results"),
  stats: document.getElementById("search-stats"),
};

const urlParams = new URLSearchParams(location.search);
const initialQuery = (urlParams.get("q") || "").trim();
if (initialQuery) els.q.value = initialQuery;

// Простая защита от двойной инициализации
let pagefindReadyPromise = null;
function pagefindReady() {
  if (!pagefindReadyPromise) {
    pagefindReadyPromise = new Promise(async (resolve) => {
      // Дождемся загрузки /pagefind/pagefind.js, если подключен async
      if (!("pagefind" in window)) {
        await new Promise((r) => {
          const check = () => ("pagefind" in window ? r() : setTimeout(check, 20));
          check();
        });
      }
      // Инициализируем API
      await window.pagefind.init?.();
      resolve(window.pagefind);
    });
  }
  return pagefindReadyPromise;
}

// Подтягиваем индекс для превью (url -> thumb)
let thumbsByUrl = null;
async function loadThumbIndex() {
  if (thumbsByUrl) return thumbsByUrl;
  try {
    const res = await fetch("/search.json", { cache: "no-store" });
    const data = await res.json();
    thumbsByUrl = new Map();
    for (const item of data.results || data) {
      if (!item.url) continue;
      thumbsByUrl.set(item.url.replace(location.origin, ""), item.thumb || "");
      // На всякий — и абсолютный тоже
      thumbsByUrl.set(item.url, item.thumb || "");
    }
  } catch (e) {
    thumbsByUrl = new Map();
  }
  return thumbsByUrl;
}

function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("ru-RU", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch { return ""; }
}

function resultItemTemplate({ url, title, excerpt, date, thumb }) {
  const a = document.createElement("a");
  a.className = "sr-item";
  a.href = url;

  const inner = document.createElement("div");
  inner.className = "sr-inner";

  if (thumb) {
    const img = document.createElement("img");
    img.className = "sr-thumb";
    img.loading = "lazy";
    img.decoding = "async";
    img.src = thumb;
    img.alt = title || "";
    inner.appendChild(img);
  }

  const body = document.createElement("div");
  body.className = "sr-body";

  const h3 = document.createElement("h3");
  h3.className = "sr-title";
  h3.textContent = title || url;
  body.appendChild(h3);

  if (date) {
    const meta = document.createElement("div");
    meta.className = "sr-meta";
    meta.textContent = fmtDate(date);
    body.appendChild(meta);
  }

  if (excerpt) {
    const p = document.createElement("p");
    p.className = "sr-excerpt";
    p.textContent = excerpt;
    body.appendChild(p);
  }

  inner.appendChild(body);
  a.appendChild(inner);
  return a;
}

async function runSearch(q, sortMode) {
  els.list.innerHTML = "";
  els.stats.textContent = "";

  if (!q) {
    els.stats.textContent = "Введите запрос для поиска.";
    return;
  }

  const [pf, thumbs] = await Promise.all([pagefindReady(), loadThumbIndex()]);

  // Опции сортировки Pagefind: по умолчанию релевантность, иначе сорт по дате
  // Для сортировки Pagefind требует, чтобы страницы были помечены data-pagefind-sort="date"
  // на этапе генерации. :contentReference[oaicite:1]{index=1}
  const options = {};
  if (sortMode === "date_desc") options.sort = { date: "desc" };
  if (sortMode === "date_asc") options.sort = { date: "asc" };

  const search = await pf.search(q, options); // возвращает ids и счетчики. :contentReference[oaicite:2]{index=2}
  const count = search?.results?.length || 0;
  els.stats.textContent = count ? `Найдено: ${count}` : "Ничего не найдено.";

  for (const hit of search.results) {
    const data = await hit.data(); // получаем url, title, meta, excerpt. :contentReference[oaicite:3]{index=3}
    const url = data.url;
    const title = data.meta?.title || data.title || "";
    const excerpt = (data.excerpt || "").replace(/\s+/g, " ").trim();
    const date = data.meta?.date || data.meta?.updated || "";

    // Превью: берем из search.json (если его нет — можно позже перейти на data-pagefind-meta="image[src]")
    // Pagefind также поддерживает image через метаданные. :contentReference[oaicite:4]{index=4}
    const thumb = thumbs.get(url) || "";

    els.list.appendChild(resultItemTemplate({ url, title, excerpt, date, thumb }));
  }
}

// submit + смена сортировки
els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = (els.q.value || "").trim();
  const sortMode = els.sort.value;
  const u = new URL(location.href);
  u.searchParams.set("q", q);
  history.replaceState({}, "", u);
  runSearch(q, sortMode);
});

els.sort.addEventListener("change", () => {
  runSearch((els.q.value || "").trim(), els.sort.value);
});

// первый запуск
if (initialQuery) {
  // установить сортировку из сохраненного ?sort=...
  const sortParam = urlParams.get("sort");
  if (sortParam && ["relevance", "date_desc", "date_asc"].includes(sortParam)) {
    els.sort.value = sortParam;
  }
  runSearch(initialQuery, els.sort.value);
}
