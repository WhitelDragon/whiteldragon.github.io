// /assets/js/search.js
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const searchContainer = document.getElementById('pagefind-search');
  if (!searchContainer) return;

  const externalForm = document.getElementById('search-form');
  const externalInput = document.getElementById('q');
  const sortSelect = document.getElementById('sort-order');

  // Получаем ?q= из адресной строки
  const params = new URLSearchParams(location.search);
  const initialTerm = params.get('q') || '';

  // Функция создания UI с нужной сортировкой
  let uiInstance = null;
  function buildUI(sortMode) {
    // Очищаем контейнер перед пересозданием
    searchContainer.innerHTML = '';

    // Подбираем объект сортировки для Pagefind
    // Требует наличия data-pagefind-sort="date:YYYY-MM-DD" на страницах (у нас есть):contentReference[oaicite:2]{index=2}.
    let sortOption = undefined;
    if (sortMode === 'date_desc') sortOption = { date: 'desc' };
    if (sortMode === 'date_asc') sortOption = { date: 'asc' };
    // relevance — сортировка по умолчанию, не передаём sort вовсе

    uiInstance = new PagefindUI({
      element: "#pagefind-search",
      showImages: true,                         // включаем миниатюры
      sort: sortOption,                         // передаём сортировку, если задана
      processResult: function (result) {        // подстраховка путей к изображениям
        if (result.meta && result.meta.image) {
          const img = result.meta.image;
          if (typeof img === 'string' && !img.startsWith('http') && !img.startsWith('/')) {
            result.meta.image = '/' + img;
          }
        }
        return result;
      }
    });

    // Синхронизируем внешний input с внутренним Pagefind UI
    const syncTerm = (term) => {
      // Дождёмся, пока UI вставит свой input
      requestAnimationFrame(() => {
        const internalInput = $('#pagefind-search input[type="search"]');
        if (!internalInput) return;
        internalInput.value = term;
        internalInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };

    // Если уже есть запрос — применяем его
    if (initialTerm) syncTerm(initialTerm);
  }

  // Инициализируем UI с текущей сортировкой
  const initialSort = (sortSelect && sortSelect.value) || 'relevance';
  buildUI(initialSort);

  // Обработчик «Найти» для внешней формы
  if (externalForm && externalInput) {
    externalForm.addEventListener('submit', (e) => {
      e.preventDefault();
      // Обновим адресную строку (красивая навигация)
      const q = externalInput.value || '';
      const order = (sortSelect && sortSelect.value) || 'relevance';
      const usp = new URLSearchParams(location.search);
      if (q) usp.set('q', q); else usp.delete('q');
      usp.set('sort', order);
      history.replaceState(null, '', `${location.pathname}?${usp.toString()}`);

      // Передадим запрос во внутренний input Pagefind UI
      const internalInput = $('#pagefind-search input[type="search"]');
      if (internalInput) {
        internalInput.value = q;
        internalInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }

  // Пересоздание UI при смене сортировки
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      buildUI(sortSelect.value);
      // После перестройки — протолкнём текущий запрос
      const q = (externalInput && externalInput.value) || initialTerm || '';
      if (q) {
        const internalInput = $('#pagefind-search input[type="search"]');
        if (internalInput) {
          internalInput.value = q;
          internalInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    });

    // Прочитаем ?sort= из URL при первом входе
    const sortFromUrl = params.get('sort');
    if (sortFromUrl && sortFromUrl !== sortSelect.value) {
      sortSelect.value = sortFromUrl;
      // buildUI(initial) уже вызван выше с initialSort; при различии пользователь увидит выпадашку в нужном положении
    }
  }
})();
