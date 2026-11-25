import { api } from '../api.js';
import { state, loadTeam } from '../store.js';
import { openRequestForm } from '../forms.js';
import {
  emptyState, esc, fmtDate, fmtQty, fmtShort, icon, isFieldRole, loader, plural,
  refresh, toast, transportChip, confirmDialog,
} from '../ui.js';

const STATUSES = [
  { id: 'new', title: 'Новые', color: '#7c8db5' },
  { id: 'calculating', title: 'Расчёт', color: '#2f6fe4' },
  { id: 'sent', title: 'Отправлено', color: '#7c4ddb' },
  { id: 'accepted', title: 'Принято', color: '#b5760f' },
  { id: 'converted', title: 'В рейсе', color: '#0f8f63' },
  { id: 'rejected', title: 'Отклонено', color: '#7b8095' },
];

const filters = { q: '', owner: 'all' };

function requestCard(item) {
  const margin = Number(item.amount || 0) - Number(item.cost_price || 0);
  const marginPct = item.amount ? (margin / Number(item.amount)) * 100 : 0;
  return `<article class="req-card" data-request-id="${item.id}" tabindex="0">
    <div class="req-route" data-raw>${icon('route', 13)} ${esc(item.route_from)} → ${esc(item.route_to)}</div>
    <div class="req-client">${item.client_name ? `<span data-raw>${esc(item.client_name)}</span>` : 'Клиент не выбран'}</div>
    <div class="req-meta">
      <span>${transportChip(item.transport_type)} ${item.distance_km ? fmtQty(item.distance_km) + ' км' : '—'}</span>
      <span>${fmtDate(item.updated_at)}</span>
    </div>
    <div class="req-meta">
      <span class="req-amount">${fmtShort(item.amount)}</span>
      <span class="req-calc ${margin >= 0 ? 'good' : 'bad'}">${margin >= 0 ? '+' : ''}${fmtShort(margin)} · ${Math.round(marginPct)}%</span>
    </div>
    ${item.status !== 'converted' && item.client_id
      ? `<button type="button" class="btn btn-sm" data-convert="${item.id}">${icon('arrow', 13)} В рейс</button>`
      : item.deal_id
        ? `<span class="chip status-on">рейс #${item.deal_id}</span>`
        : ''}
  </article>`;
}

export async function render(root) {
  root.innerHTML = loader();
  let requests = [];
  let team = [];
  try {
    const [data] = await Promise.all([
      api.get('/requests'),
      state.user.role === 'manager' ? Promise.resolve(null) : loadTeam(),
    ]);
    requests = data.requests;
    team = state.team;
  } catch (err) {
    root.innerHTML = `<div class="card"><div class="card-body">${emptyState('alert', 'Не удалось загрузить заявки', err.message)}</div></div>`;
    return;
  }

  if (filters.owner !== 'all' && !team.some((member) => String(member.id) === filters.owner)) {
    filters.owner = 'all';
  }

  const isManager = state.user.role === 'manager';
  const byId = new Map(requests.map((item) => [String(item.id), item]));

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="page-title">Заявки на перевозку</h1>
        <p class="page-sub">Воронка входящих заявок: расчёт ставки, наценка и преобразование в рейс</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" data-new-request>${icon('plus', 16)} Новая заявка</button>
      </div>
    </div>

    <div class="toolbar">
      <label class="search">
        ${icon('search', 16)}
        <input type="search" placeholder="Поиск по маршруту, грузу или клиенту" data-search value="${esc(filters.q)}">
      </label>
      ${isManager ? '' : `<select class="select" data-owner-filter>
        <option value="all">Все ответственные</option>
        ${team.filter((member) => !isFieldRole(member.role)).map((member) => `<option value="${member.id}"${filters.owner === String(member.id) ? ' selected' : ''}>${esc(member.name)}</option>`).join('')}
      </select>`}
      <span class="toolbar-spacer"></span>
      <span class="count-note" data-count></span>
    </div>

    <div class="req-board" data-board></div>
  `;

  const board = root.querySelector('[data-board]');
  const countEl = root.querySelector('[data-count]');
  const searchEl = root.querySelector('[data-search]');
  const ownerEl = root.querySelector('[data-owner-filter]');

  function visible() {
    const q = filters.q.trim().toLowerCase();
    return requests.filter((item) => {
      if (filters.owner !== 'all' && String(item.owner_id) !== filters.owner) return false;
      if (!q) return true;
      const haystack = `${item.route_from} ${item.route_to} ${item.cargo || ''} ${item.client_name || ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }

  function paint() {
    const list = visible();
    const total = list.filter((item) => item.status !== 'rejected').reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const fresh = list.filter((item) => item.status === 'new' || item.status === 'calculating').length;
    countEl.textContent = `${list.length} ${plural(list.length, 'заявка', 'заявки', 'заявок')} · ${fresh} в расчёте · ${fmtShort(total)}`;

    board.innerHTML = STATUSES.map((status) => {
      const column = list.filter((item) => item.status === status.id);
      const sum = column.reduce((acc, item) => acc + Number(item.amount || 0), 0);
      return `<section class="req-col">
        <header class="req-col-head">
          <span class="dot" style="background:${status.color}"></span>
          <span>${status.title}</span>
          <span class="col-count">${column.length}</span>
        </header>
        ${sum ? `<div class="req-calc" style="padding:0 4px 8px">${fmtShort(sum)}</div>` : ''}
        <div class="req-cards">
          ${column.length ? column.map(requestCard).join('') : '<div class="col-empty">Пусто</div>'}
        </div>
      </section>`;
    }).join('');

    bindBoard();
  }

  function bindBoard() {
    board.querySelectorAll('[data-request-id]').forEach((card) => {
      card.addEventListener('click', () => {
        const item = byId.get(card.dataset.requestId);
        if (item) openRequestForm(item);
      });
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          const item = byId.get(card.dataset.requestId);
          if (item) openRequestForm(item);
        }
      });
    });

    board.querySelectorAll('[data-convert]').forEach((button) => {
      button.addEventListener('click', async (event) => {
        event.stopPropagation();
        const item = byId.get(button.dataset.convert);
        if (!item) return;
        const ok = await confirmDialog({
          title: 'Преобразовать в рейс?',
          message: `Заявка ${item.route_from} → ${item.route_to} станет перевозкой на этапе «Подтверждено».`,
          confirmText: 'Создать рейс',
          danger: false,
        });
        if (!ok) return;
        button.disabled = true;
        try {
          const result = await api.post(`/requests/${item.id}/convert`);
          toast(`Заявка ${item.route_from} → ${item.route_to} стала рейсом #${result.deal.id}`, 'success');
          refresh();
        } catch (err) {
          toast(err.message, 'error');
          button.disabled = false;
        }
      });
    });
  }

  searchEl.addEventListener('input', () => {
    filters.q = searchEl.value;
    paint();
  });

  if (ownerEl) {
    ownerEl.addEventListener('change', () => {
      filters.owner = ownerEl.value;
      paint();
    });
  }

  root.querySelector('[data-new-request]').addEventListener('click', () => openRequestForm(null));
  paint();
}
