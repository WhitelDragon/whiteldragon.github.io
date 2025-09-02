// assets/js/search.js

// Функция для получения параметра q из URL
function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// Инициализация Pagefind UI
window.addEventListener('DOMContentLoaded', () => {
  const searchQuery = getQueryParam('q') || "";  
  // Создаём Pagefind UI без сортировки (по умолчанию - релевантность)
  let searchUI = new PagefindUI({
    element: "#pagefind-search",
    showImages: true,
    pageSize: 10,
    translations: {
      placeholder: "Искать по сайту…",
      zero_results: "Ничего не найдено",
      clear_search: "Очистить",
      load_more: "Показать ещё"
    }
    // sort не указываем, чтобы сначала была релевантность
  });
  // Если при загрузке уже есть запрос в URL, выполняем поиск
  if (searchQuery) {
    searchUI.triggerSearch(searchQuery);
  }

  // Отслеживаем изменения DOM, чтобы удалить префикс "Date:" в метаданных даты
  const resultsContainer = document.getElementById('pagefind-search');
  if (resultsContainer) {
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) { // элемент
            const dateMetaElems = node.querySelectorAll('[data-pagefind-ui-meta="date"]');
            dateMetaElems.forEach(elem => {
              // Удаляем "Date: " в начале текста, если есть
              elem.textContent = elem.textContent.replace(/^Date:\s*/, '');
            });
          }
        });
      });
    });
    observer.observe(resultsContainer, { childList: true, subtree: true });
  }

  // Обработчик изменения сортировки
  const sortSelect = document.getElementById('sort-order');
  sortSelect.addEventListener('change', () => {
    const sortValue = sortSelect.value;
    // Получаем текущий поисковый запрос из поля ввода Pagefind UI
    const currentQuery = document.querySelector('#pagefind-search input[type="search"]')?.value || "";

    // Удаляем старый UI и создаём новый с нужной сортировкой
    searchUI.destroy();
    if (sortValue === 'relevance') {
      // Релевантность (без параметра sort)
      searchUI = new PagefindUI({
        element: "#pagefind-search",
        showImages: true,
        pageSize: 10,
        translations: {
          placeholder: "Искать по сайту…",
          zero_results: "Ничего не найдено",
          clear_search: "Очистить",
          load_more: "Показать ещё"
        }
      });
    } else if (sortValue === 'date_desc') {
      // Новые сначала (сортировка по дате по убыванию)
      searchUI = new PagefindUI({
        element: "#pagefind-search",
        showImages: true,
        pageSize: 10,
        sort: { date: "desc" },
        translations: {
          placeholder: "Искать по сайту…",
          zero_results: "Ничего не найдено",
          clear_search: "Очистить",
          load_more: "Показать ещё"
        }
      });
    } else if (sortValue === 'date_asc') {
      // Старые сначала (сортировка по дате по возрастанию)
      searchUI = new PagefindUI({
        element: "#pagefind-search",
        showImages: true,
        pageSize: 10,
        sort: { date: "asc" },
        translations: {
          placeholder: "Искать по сайту…",
          zero_results: "Ничего не найдено",
          clear_search: "Очистить",
          load_more: "Показать ещё"
        }
      });
    }
    // Запускаем поиск заново с тем же запросом (если он не пустой)
    if (currentQuery) {
      searchUI.triggerSearch(currentQuery);
    }
  });
});
