// assets/js/search.js

// ----- helpers -----
function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}
function setParam(name, value) {
  const url = new URL(window.location.href);
  if (value && String(value).length) url.searchParams.set(name, value);
  else url.searchParams.delete(name);
  history.replaceState(null, "", url.toString());
}

// ----- state -----
let lastQuery = getParam("q") || "";
let lastSort  = getParam("sort") || "relevance"; // relevance | date_desc | date_asc
let searchUI  = null;

// ----- DOM ready -----
window.addEventListener("DOMContentLoaded", () => {
  const sortSelect = document.getElementById("sort-order");
  if (sortSelect) sortSelect.value = lastSort;

  // Создаём UI с учётом выбранной сортировки
  createUI();

  // Если q уже есть в URL — сразу запускаем поиск
  if (lastQuery) {
    // Небольшая задержка, чтобы инпут успел появиться
    requestAnimationFrame(() => {
      restoreInputValue();
      searchUI.triggerSearch(lastQuery);
    });
  }

  // Слежение за DOM: убрать префикс "Date:" в выдаче
  const resultsContainer = document.getElementById("pagefind-search");
  if (resultsContainer) {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          // Удаляем "Date: " в метаданных даты
          node.querySelectorAll('[data-pagefind-ui-meta="date"]').forEach((el) => {
            el.textContent = el.textContent.replace(/^Date:\s*/, "");
          });
          // Если появился новый инпут поиска — привязываем listener
          const input = node.matches?.('input[type="search"]')
            ? node
            : node.querySelector?.('#pagefind-search input[type="search"]');
          if (input && !input.dataset.listenerAttached) {
            attachInputListener(input);
          }
        }
      }
    });
    observer.observe(resultsContainer, { childList: true, subtree: true });
  }

  // Смена сортировки
  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      lastSort = sortSelect.value;
      setParam("sort", lastSort === "relevance" ? "" : lastSort);

      // Сохраняем текущий текст запроса из инпута (на всякий)
      const input = document.querySelector('#pagefind-search input[type="search"]');
      if (input) lastQuery = input.value || lastQuery;

      // Пересоздаём UI с новой сортировкой и восстанавливаем запрос
      if (searchUI) searchUI.destroy();
      createUI();
      requestAnimationFrame(() => {
        restoreInputValue();
        if (lastQuery) searchUI.triggerSearch(lastQuery);
      });
    });
  }
});

// ----- functions -----
function createUI() {
  const baseOpts = {
    element: "#pagefind-search",
    showImages: true,
    pageSize: 10,
    translations: {
      placeholder: "Искать по сайту…",
      zero_results: "Ничего не найдено",
      clear_search: "Очистить",
      load_more: "Показать ещё",
    },
  };

  if (lastSort === "date_desc") {
    baseOpts.sort = { date: "desc" };
  } else if (lastSort === "date_asc") {
    baseOpts.sort = { date: "asc" };
  }
  searchUI = new PagefindUI(baseOpts);

  // Как только инпут появится — проставим значение и listener
  requestAnimationFrame(() => {
    const input = document.querySelector('#pagefind-search input[type="search"]');
    if (input) {
      restoreInputValue();
      attachInputListener(input);
    }
  });
}

function restoreInputValue() {
  const input = document.querySelector('#pagefind-search input[type="search"]');
  if (input && input.value !== lastQuery) {
    input.value = lastQuery;
  }
}

function attachInputListener(input) {
  if (!input || input.dataset.listenerAttached) return;
  input.dataset.listenerAttached = "1";
  input.addEventListener("input", () => {
    lastQuery = input.value || "";
    // Синхронизируем адресную строку
    setParam("q", lastQuery);
  }, { passive: true });
}
