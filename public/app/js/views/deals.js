import { api } from '../api.js';
import { getLang } from '../i18n.js';
import { state, loadTeam } from '../store.js';
import { openDealForm } from '../forms.js';
import {
  avatar, emptyState, esc, fmtDate, fmtQty, fmtShort, icon, isFieldRole, loader, plural,
  refresh, stageMeta, STAGES, toast, todayISO, transportChip,
} from '../ui.js';

const filters = { q: '', owner: 'all' };

const PAY_LABELS = { paid: 'оплачено', partial: 'частично', unpaid: 'не оплачено' };

function dealCard(deal, isManager) {
  const late = deal.close_date && deal.close_date < todayISO() && !['won', 'lost'].includes(deal.stage);
  const cargo = deal.cargo || 'Груз не указан';
  const payOverdue = deal.stage === 'won' && deal.debt > 0 && deal.payment_due && deal.payment_due < todayISO();
  const payPill = deal.stage === 'won'
    ? `<span class="pay-pill pay-${esc(deal.payment_status || 'unpaid')}${payOverdue ? ' pay-late' : ''}">${icon('wallet', 11)} ${payOverdue ? 'долг' : (PAY_LABELS[deal.payment_status] || 'не оплачено')}</span>`
    : '';
  return `<article class="deal-card" draggable="true" data-deal-id="${deal.id}" tabindex="0">
    <div class="deal-client">
      ${deal.client_name ? `<span data-raw>${esc(deal.client_name)}</span>` : '<span>Без клиента</span>'}
      ${deal.owner_name ? avatar(deal.owner_name, 'sm') : ''}
    </div>
    <div class="deal-title" data-raw>${esc(deal.title)}</div>
    <div class="deal-cargo">${transportChip(deal.transport_type)}<span data-raw>${esc(cargo)}</span></div>
    <div class="deal-amount">${fmtShort(deal.amount)}${deal.expenses_total ? `<span class="deal-margin ${Number(deal.margin) < 0 ? 'bad' : 'good'}">маржа ${fmtShort(deal.margin)}</span>` : ''}</div>
    <div class="deal-foot">
      <span class="deal-date ${late ? 'late' : ''}">${icon('calendar', 12)} ${deal.close_date ? (getLang() === 'en' ? 'due ' : 'до ') + fmtDate(deal.close_date) : 'без срока'}</span>
      ${payPill}
      ${deal.files_count ? `<span class="deal-docs" title="${deal.files_count} ${plural(deal.files_count, 'документ', 'документа', 'документов')}">${icon('note', 12)} ${deal.files_count}</span>` : ''}
      <span class="deal-weight">${deal.weight ? fmtQty(deal.weight) + ' т' : ''}${isManager ? '' : ' · ' + esc((deal.owner_name || '').split(' ')[0])}</span>
    </div>
  </article>`;
}

export async function render(root) {
  root.innerHTML = loader();
  let deals = [];
  let team = [];
  try {
    const [dealsData] = await Promise.all([
      api.get('/deals'),
      state.user.role === 'manager' ? Promise.resolve(null) : loadTeam(),
    ]);
    deals = dealsData.deals;
    team = state.team;
  } catch (err) {
    root.innerHTML = `<div class="card"><div class="card-body">${emptyState('alert', 'Не удалось загрузить перевозки', err.message)}</div></div>`;
    return;
  }

  if (filters.owner !== 'all' && !team.some((member) => String(member.id) === filters.owner)) {
    filters.owner = 'all';
  }

  const byId = new Map(deals.map((deal) => [String(deal.id), deal]));
  const isManager = state.user.role === 'manager';

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="page-title">Перевозки</h1>
        <p class="page-sub">Перетаскивайте карточки между этапами — статус перевозки сохраняется сразу</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-sm" data-export="csv">${icon('upload', 14)} CSV</button>
        <button class="btn btn-sm" data-export="xlsx">${icon('upload', 14)} Excel</button>
        <button class="btn btn-primary" data-new-deal>${icon('plus', 16)} Новая перевозка</button>
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

    <div class="board" data-board></div>
  `;

  const board = root.querySelector('[data-board]');
  const countEl = root.querySelector('[data-count]');
  const searchEl = root.querySelector('[data-search]');
  const ownerEl = root.querySelector('[data-owner-filter]');

  function visible() {
    const q = filters.q.trim().toLowerCase();
    return deals.filter((deal) => {
      if (q) {
        const haystack = `${deal.title} ${deal.route_from || ''} ${deal.route_to || ''} ${deal.cargo || ''} ${deal.client_name || ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filters.owner !== 'all' && String(deal.owner_id) !== filters.owner) return false;
      return true;
    });
  }

  let justDragged = false;
  let dragId = null;

  function paint() {
    const list = visible();
    const total = list.reduce((sum, deal) => sum + Number(deal.amount || 0), 0);
    countEl.textContent = `${list.length} ${plural(list.length, 'перевозка', 'перевозки', 'перевозок')} · ${fmtShort(total)}`;

    board.innerHTML = STAGES.map((stage) => {
      const stageDeals = list.filter((deal) => deal.stage === stage.id);
      const stageSum = stageDeals.reduce((sum, deal) => sum + Number(deal.amount || 0), 0);
      return `<section class="col" data-col="${stage.id}">
        <header class="col-head">
          <span class="dot" style="background:${stage.color}"></span>
          <span class="col-title">${stage.title}</span>
          <span class="col-count">${stageDeals.length}</span>
          <span class="col-sum">${stageSum ? fmtShort(stageSum) : '—'}</span>
          <button class="col-add" data-add-stage="${stage.id}" title="Добавить перевозку на этапе «${stage.title}»">${icon('plus', 15)}</button>
        </header>
        <div class="col-body" data-stage="${stage.id}">
          ${stageDeals.length ? stageDeals.map((deal) => dealCard(deal, isManager)).join('') : '<div class="col-empty">Перетащите перевозку сюда</div>'}
        </div>
      </section>`;
    }).join('');

    bindBoard();
  }

  function bindBoard() {
    board.querySelectorAll('[data-add-stage]').forEach((button) => {
      button.addEventListener('click', () => openDealForm(null, { stage: button.dataset.addStage }));
    });

    board.querySelectorAll('.deal-card').forEach((card) => {
      card.addEventListener('click', () => {
        if (justDragged) return;
        const deal = byId.get(card.dataset.dealId);
        if (deal) openDealForm(deal);
      });
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          const deal = byId.get(card.dataset.dealId);
          if (deal) openDealForm(deal);
        }
      });
      card.addEventListener('dragstart', (event) => {
        dragId = card.dataset.dealId;
        justDragged = true;
        event.dataTransfer.setData('text/plain', dragId);
        event.dataTransfer.effectAllowed = 'move';
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        dragId = null;
        setTimeout(() => { justDragged = false; }, 120);
      });
    });

    board.querySelectorAll('.col-body').forEach((body) => {
      const stage = body.dataset.stage;
      body.addEventListener('dragover', (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        body.classList.add('drag-over');
      });
      body.addEventListener('dragleave', (event) => {
        if (!body.contains(event.relatedTarget)) body.classList.remove('drag-over');
      });
      body.addEventListener('drop', async (event) => {
        event.preventDefault();
        body.classList.remove('drag-over');
        const id = event.dataTransfer.getData('text/plain') || dragId;
        const deal = byId.get(String(id));
        if (!deal || deal.stage === stage) return;
        try {
          await api.patch('/deals/' + deal.id, { stage });
          toast(`«${deal.title}» → ${stageMeta(stage).title}`, 'success');
          refresh();
        } catch (err) {
          toast(err.message, 'error');
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

  root.querySelector('[data-new-deal]').addEventListener('click', () => openDealForm(null, { stage: 'lead' }));
  root.querySelectorAll('[data-export]').forEach((button) => {
    button.addEventListener('click', () => {
      window.location.assign(`/api/export/deals?format=${button.dataset.export}`);
    });
  });

  paint();
}
