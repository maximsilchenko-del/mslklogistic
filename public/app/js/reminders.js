/* Bell with grouped reminders for fleet, repairs and deadlines. */

import { api } from './api.js';
import { esc, fmtDate, icon } from './ui.js';

let cache = { total: 0, groups: [] };
let pending = false;
let opened = false;

function button() {
  return document.getElementById('reminders-btn');
}

function panel() {
  return document.getElementById('reminders-panel');
}

function paintBadge() {
  const badge = document.getElementById('reminders-count');
  if (!badge) return;
  badge.textContent = cache.total > 99 ? '99+' : String(cache.total);
  badge.classList.toggle('hidden', !cache.total);
  if (button()) button().classList.toggle('has-alerts', cache.total > 0);
}

function itemHtml(item) {
  return `<a class="reminder-item reminder-${esc(item.level || 'warning')}" href="#/${esc(item.route || 'dashboard')}"
            data-reminder-route="${esc(item.route || 'dashboard')}">
    <span class="reminder-dot"></span>
    <span class="reminder-main">
      <span class="reminder-title" data-raw>${esc(item.title)}</span>
      ${item.text ? `<span class="reminder-text" data-raw>${esc(item.text)}</span>` : ''}
    </span>
    <span class="reminder-date">${item.date ? fmtDate(item.date, true) : ''}</span>
  </a>`;
}

function renderPanel() {
  const root = panel();
  if (!root) return;
  if (!opened) {
    root.classList.add('hidden');
    return;
  }
  root.classList.remove('hidden');
  if (pending) {
    root.innerHTML = '<div class="reminders-loading"><div class="spinner"></div></div>';
    return;
  }
  const groups = cache.groups || [];
  root.innerHTML = `
    <div class="reminders-head">
      <div>
        <h3>Напоминания</h3>
        <p>${cache.total
          ? `${cache.total} ${cache.total === 1 ? 'требует' : 'требуют'} внимания`
          : 'Всё под контролем'}</p>
      </div>
      <button class="icon-btn" type="button" data-reminders-refresh title="Обновить">${icon('gauge', 16)}</button>
    </div>
    ${groups.length
      ? `<div class="reminders-groups">${groups.map((group) => `
          <section class="reminders-group">
            <div class="reminders-group-head"><span>${esc(group.title)}</span><span class="doc-count">${group.items.length}</span></div>
            ${group.items.map(itemHtml).join('')}
          </section>`).join('')}</div>`
      : `<div class="reminders-empty">${icon('check', 22)}<span>Нет просроченных ТО и оплат, зависших заявок и задач с дедлайном.</span></div>`}
  `;
  root.querySelector('[data-reminders-refresh]')?.addEventListener('click', () => refreshReminders());
  root.querySelectorAll('[data-reminder-route]').forEach((link) => {
    link.addEventListener('click', () => {
      opened = false;
      root.classList.add('hidden');
      const route = link.dataset.reminderRoute;
      if (location.hash === '#/' + route) window.dispatchEvent(new Event('crm:refresh'));
    });
  });
}

export async function refreshReminders() {
  if (!document.getElementById('reminders-btn')) return;
  pending = true;
  if (opened) renderPanel();
  try {
    const data = await api.get('/reminders');
    cache = data.reminders || { total: 0, groups: [] };
  } catch (err) {
    if (err && err.status === 401) return;
    cache = { total: 0, groups: [] };
  } finally {
    pending = false;
    paintBadge();
    if (opened) renderPanel();
  }
}

export function initReminders() {
  const btn = button();
  if (!btn) return;
  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    opened = !opened;
    renderPanel();
    if (opened) refreshReminders();
  });
  panel()?.addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener('click', () => {
    if (!opened) return;
    opened = false;
    panel()?.classList.add('hidden');
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && opened) {
      opened = false;
      panel()?.classList.add('hidden');
    }
  });
  window.addEventListener('hashchange', () => {
    if (!opened) return;
    opened = false;
    panel()?.classList.add('hidden');
  });
  paintBadge();
}

export function clearReminders() {
  cache = { total: 0, groups: [] };
  opened = false;
  paintBadge();
  panel()?.classList.add('hidden');
}
