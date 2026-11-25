/* Command palette: quick search across deals, clients, requests and tasks. */

import { api } from './api.js';
import { esc, fmtDate, fmtShort, icon, stageMeta } from './ui.js';

let wired = false;
let timer = null;
let lastQuery = '';
let items = [];

const GROUPS = [
  { key: 'deals', title: 'Перевозки', icon: 'deals', route: 'deals' },
  { key: 'clients', title: 'Клиенты', icon: 'clients', route: 'clients' },
  { key: 'requests', title: 'Заявки', icon: 'note', route: 'requests' },
  { key: 'tasks', title: 'Задачи', icon: 'tasks', route: 'tasks' },
];

function overlay() {
  return document.getElementById('search-overlay');
}

function input() {
  return document.getElementById('search-input');
}

function resultsEl() {
  return document.getElementById('search-results');
}

function isOpen() {
  const node = overlay();
  return Boolean(node && !node.classList.contains('hidden'));
}

export function openSearch() {
  const node = overlay();
  if (!node) return;
  node.classList.remove('hidden');
  const field = input();
  field.value = '';
  field.focus();
  lastQuery = '';
  items = [];
  renderHint();
}

export function closeSearch() {
  overlay()?.classList.add('hidden');
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function renderHint() {
  const box = resultsEl();
  if (!box) return;
  box.innerHTML = `<div class="search-hint">
    ${icon('search', 20)}
    <span>Начните вводить название клиента, маршрут или задачу — минимум 2 символа.</span>
  </div>`;
}

function rowHtml(item, index) {
  return `<button type="button" class="search-row${index === 0 ? ' first' : ''}" data-search-index="${index}">
    <span class="search-row-icon">${icon(item.icon, 16)}</span>
    <span class="search-row-main">
      <span class="search-row-title" data-raw>${esc(item.title)}</span>
      <span class="search-row-sub">${esc(item.subtitle || '')}</span>
    </span>
    <span class="search-row-side">${esc(item.side || '')}</span>
  </button>`;
}

function renderResults(data) {
  const box = resultsEl();
  if (!box) return;
  items = [];
  const groups = GROUPS.map((group) => {
    const list = (data[group.key] || []).map((row) => {
      if (group.key === 'deals') {
        const stage = stageMeta(row.stage);
        return {
          title: row.title,
          subtitle: [row.client_name, stage.title].filter(Boolean).join(' · '),
          side: fmtShort(row.amount),
          icon: group.icon,
          route: group.route,
        };
      }
      if (group.key === 'clients') {
        return {
          title: row.name,
          subtitle: [row.industry, row.inn ? 'ИНН ' + row.inn : ''].filter(Boolean).join(' · '),
          side: '',
          icon: group.icon,
          route: group.route,
        };
      }
      if (group.key === 'requests') {
        return {
          title: `${row.route_from} → ${row.route_to}`,
          subtitle: [row.client_name, row.cargo].filter(Boolean).join(' · '),
          side: row.amount ? fmtShort(row.amount) : '',
          icon: group.icon,
          route: group.route,
        };
      }
      return {
        title: row.title,
        subtitle: row.due_date ? 'срок ' + fmtDate(row.due_date) : 'без срока',
        side: row.done ? 'готово' : '',
        icon: group.icon,
        route: group.route,
      };
    });
    return { group, list };
  }).filter((entry) => entry.list.length);

  if (!groups.length) {
    box.innerHTML = `<div class="search-hint">${icon('search', 20)}<span>Ничего не найдено. Попробуйте другой запрос.</span></div>`;
    return;
  }

  let index = 0;
  box.innerHTML = groups.map(({ group, list }) => `
    <div class="search-group">
      <div class="search-group-title">${esc(group.title)} <span>${list.length}</span></div>
      ${list.map((item) => {
        const html = rowHtml({ ...item }, index);
        items.push(item);
        index += 1;
        return html;
      }).join('')}
    </div>`).join('');

  box.querySelectorAll('[data-search-index]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = items[Number(button.dataset.searchIndex)];
      if (!item) return;
      closeSearch();
      location.hash = '#/' + item.route;
    });
  });
}

function search(value) {
  const query = value.trim();
  lastQuery = query;
  if (query.length < 2) {
    renderHint();
    return;
  }
  resultsEl().innerHTML = '<div class="search-loading"><div class="spinner"></div></div>';
  api.get('/search', { q: query }).then((data) => {
    if (query !== lastQuery) return;
    renderResults(data.results || {});
  }).catch((err) => {
    if (query !== lastQuery) return;
    resultsEl().innerHTML = `<div class="search-hint">${icon('alert', 20)}<span>${esc(err.message || 'Не удалось выполнить поиск')}</span></div>`;
  });
}

export function initSearch() {
  if (wired) return;
  wired = true;

  document.getElementById('search-btn')?.addEventListener('click', openSearch);

  const field = input();
  field?.addEventListener('input', () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => search(field.value), 180);
  });

  field?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (items.length) {
        const item = items[0];
        closeSearch();
        location.hash = '#/' + item.route;
      }
    }
  });

  overlay()?.addEventListener('mousedown', (event) => {
    if (event.target === overlay()) closeSearch();
  });

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (isOpen()) closeSearch();
      else openSearch();
      return;
    }
    if (event.key === 'Escape' && isOpen()) closeSearch();
  });
}
