// /assets/js/search.js
(function () {
  function init() {
    if (typeof PagefindUI !== "function") return;

    const params = new URLSearchParams(location.search);
    const q = params.get("q") || "";
    const sortParam = params.get("sort"); // relevance | date_desc | date_asc

    // Подготовим опцию сортировки только на момент создания UI.
    // Pagefind UI официально принимает объект sort, например { date: "desc" }.
    // См. доки: https://pagefind.app/docs/ui/ (#Sort)
    let sortOption;
    if (sortParam === "date_desc") sortOption = { date: "desc" };
    else if (sortParam === "date_asc") sortOption = { date: "asc" };
    // если relevance — сортировку не передаём вовсе (по умолчанию — релевантность)

    // Создаём UI максимально «по-стандарту», с включёнными миниатюрами.
    const ui = new PagefindUI({
      element: "#pagefind-search",
      showImages: true,     // миниатюры в выдаче (по умолчанию true, но фиксируем явно)
      sort: sortOption,
      // лёгкая подстраховка путей на случай "./img.jpg"
      processResult(result) {
        if (result?.meta?.image && typeof result.meta.image === "string") {
          if (result.meta.image.startsWith("./")) {
            result.meta.image = result.meta.image.slice(1);
          }
        }
        return result;
      },
      resetStyles: false // оставляем твои стили поверх стандартных
    });

    // Внешняя форма «Найти» (верхняя строка) — пробрасываем значение во внутренний инпут UI.
    const form = document.getElementById("search-form");
    const extInput = document.getElementById("q");
    const sortSelect = document.getElementById("sort-order");

    if (extInput) extInput.value = q;

    // Когда UI вставит свой input — проставим стартовый запрос из ?q=
    requestAnimationFrame(() => {
      const internal = document.querySelector('#pagefind-search input[type="search"]');
      if (internal && q) {
        internal.value = q;
        internal.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });

    // Сабмит внешней формы — ищем без перезагрузки страницы
    if (form && extInput) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const val = extInput.value || "";
        const internal = document.querySelector('#pagefind-search input[type="search"]');
        if (internal) {
          internal.value = val;
          internal.dispatchEvent(new Event("input", { bubbles: true }));
        }
        // подправим URL (красиво)
        const usp = new URLSearchParams(location.search);
        if (val) usp.set("q", val); else usp.delete("q");
        if (sortParam) usp.set("sort", sortParam); else usp.delete("sort");
        history.replaceState(null, "", location.pathname + (usp.toString() ? "?" + usp.toString() : ""));
      });
    }

    // Переключатель сортировки — делаем просто: меняем параметр и перезагружаем,
    // т.к. sort применяется только при создании PagefindUI (так стабильнее всего).
    if (sortSelect) {
      sortSelect.value = sortParam || "relevance";
      sortSelect.addEventListener("change", () => {
        const usp = new URLSearchParams(location.search);
        const val = sortSelect.value;
        if (val === "relevance") usp.delete("sort"); else usp.set("sort", val);
        // сохраним текущий запрос, чтобы он не потерялся
        const curQ = (extInput && extInput.value) || q;
        if (curQ) usp.set("q", curQ); else usp.delete("q");
        location.search = usp.toString();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
