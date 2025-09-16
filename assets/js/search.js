// /assets/js/search.js

// ---------- helpers ----------
function getParam(name) { return new URLSearchParams(location.search).get(name); }
function setParam(name, val) {
  const u = new URL(location.href);
  if (val && String(val).length) u.searchParams.set(name, val);
  else u.searchParams.delete(name);
  history.replaceState(null, "", u.toString());
}
function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("ru-RU", { year: "numeric", month: "short", day: "2-digit" });
  } catch { return ""; }
}

// ---------- state ----------
let lastQuery = (getParam("q") || "").trim();
let lastSort  = getParam("sort") || "relevance"; // relevance | date_desc | date_asc

const els = {
  form:  document.getElementById("search-form"),
  input: document.getElementById("q"),
  sort:  document.getElementById("sort"),
  stats: document.getElementById("search-stats"),
  list:  document.getElementById("search-results"),
};

// ---------- pagefind bootstrap ----------
let pagefindReadyPromise = null;
function pagefindReady() {
  if (!pagefindReadyPromise) {
    pagefindReadyPromise = new Promise(async (resolve) => {
      // дождемся window.pagefind из async-скрипта
      if (!("pagefind" in window)) {
        await new Promise(r => {
          const tick = () => ("pagefind" in window ? r() : setTimeout(tick, 20));
          tick();
        });
      }
      await window.pagefind.init?.();
      resolve(window.pagefind);
    });
  }
  return pagefindReadyPromise;
}

// ---------- thumb index (url -> thumb) ----------
let thumbsByUrl = null;
async function loadThumbIndex() {
  if (thumbsByUrl) return thumbsByUrl;
  try {
    const resp = await fetch("/search.json", { cache: "no-store" });
    const json = await resp.json();
    const arr = json.results || json || [];
    thumbsByUrl = new Map();
    for (const it of arr) {
      if (!it?.url) continue;
      const thumb = it.thumb || "";
      // кладем и относительный, и абсолютный ключ на всякий случай
      thumbsByUrl.set(it.url, thumb);
      try {
        const rel = new URL(it.url, location.origin);
        thumbsByUrl.set(rel.pathname, thumb);
      } catch {}
    }
  } catch {
    thumbsByUrl = new Map();
  }
  return thumbsByUrl;
}

// ---------- rendering ----------
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
    p.textContent = excerpt.replace(/\s+/g, " ").trim();
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
    els.stats.textContent = "Введите запрос…";
    return;
  }

  const [pf, thumbs] = await Promise.all([pagefindReady(), loadThumbIndex()]);

  const options = {};
  if (sortMode === "date_desc") options.sort = { date: "desc" };
  if (sortMode === "date_asc")  options.sort = { date: "asc" };

  const search = await pf.search(q, options);
  const total = search?.results?.length || 0;
  els.stats.textContent = total ? `Найдено: ${total}` : "Ничего не найдено.";

  for (const hit of search.results) {
    const data = await hit.data(); // { url, excerpt, meta, … }
    const url   = data.url;
    const title = data.meta?.title || data.title || "";
    const date  = data.meta?.date  || data.meta?.updated || "";
    const thumb = thumbs.get(url) || "";
    const node  = resultItemTemplate({ url, title, excerpt: data.excerpt || "", date, thumb });
    els.list.appendChild(node);
  }
}

// ---------- wiring ----------
if (els.input) els.input.value = lastQuery || "";
if (els.sort)  els.sort.value = lastSort;

els.form?.addEventListener("submit", (e) => {
  e.preventDefault();
  lastQuery = (els.input.value || "").trim();
  setParam("q", lastQuery);
  setParam("sort", els.sort?.value || "relevance");
  runSearch(lastQuery, els.sort?.value || "relevance");
});

els.sort?.addEventListener("change", () => {
  lastSort = els.sort.value;
  setParam("sort", lastSort);
  runSearch((els.input.value || "").trim(), lastSort);
});

// первый запуск по ?q=
if (lastQuery) runSearch(lastQuery, lastSort);
