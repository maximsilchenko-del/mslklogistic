import { api } from '../api.js';
import { openContractorForm } from '../forms.js';
import { emptyState, esc, fmtMoney, icon, loader, plural, refresh, toast } from '../ui.js';

const filters = { q: '' };

export async function render(root) {
  root.innerHTML = loader();
  let contractors = [];
  try {
    contractors = (await api.get('/contractors')).contractors || [];
  } catch (err) {
    root.innerHTML = `<div class="card"><div class="card-body">${emptyState('alert', 'Не удалось загрузить подрядчиков', err.message)}</div></div>`;
    return;
  }

  const active = contractors.filter((item) => item.active !== false);
  const totalCost = contractors.reduce((sum, item) => sum + Number(item.cost_total || 0), 0);

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="page-title">Подрядчики</h1>
        <p class="page-sub">Перевозчики на субподряде: ставки, контакты и расходы по рейсам</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" data-new-contractor>${icon('plus', 16)} Новый подрядчик</button>
      </div>
    </div>

    <div class="toolbar">
      <label class="search">
        ${icon('search', 16)}
        <input type="search" placeholder="Поиск по названию, ИНН или контакту" data-search value="${esc(filters.q)}">
      </label>
      <span class="toolbar-spacer"></span>
      <span class="count-note">${active.length} ${plural(active.length, 'активный', 'активных', 'активных')} · расходы ${fmtMoney(totalCost)}</span>
    </div>

    <div class="contractor-grid" data-grid></div>
  `;

  const grid = root.querySelector('[data-grid]');
  const searchEl = root.querySelector('[data-search]');

  function paint() {
    const q = filters.q.trim().toLowerCase();
    const list = contractors.filter((item) => {
      if (!q) return true;
      return `${item.name} ${item.inn || ''} ${item.contact || ''} ${item.phone || ''}`.toLowerCase().includes(q);
    });
    if (!list.length) {
      grid.innerHTML = emptyState('handshake', q ? 'Ничего не найдено' : 'Подрядчиков пока нет',
        q ? 'Попробуйте изменить запрос.' : 'Добавьте перевозчика, которому передаёте рейсы.');
      return;
    }
    grid.innerHTML = list.map((item) => `<article class="contractor-card${item.active === false ? ' inactive' : ''}" data-contractor="${item.id}" tabindex="0">
      <div class="contractor-head">
        <div>
          <div class="contractor-name" data-raw>${esc(item.name)}</div>
          <div class="contractor-inn" data-raw>${item.inn ? 'ИНН ' + esc(item.inn) : 'ИНН не указан'}</div>
        </div>
        <span class="chip ${item.active === false ? '' : 'repair-status-done'}">${item.active === false ? 'отключён' : 'активен'}</span>
      </div>
      <div class="contractor-meta">
        ${item.contact ? `<span data-raw>${icon('users', 13)} ${esc(item.contact)}</span>` : ''}
        ${item.phone ? `<span>${icon('phone', 13)} ${esc(item.phone)}</span>` : ''}
        ${item.email ? `<span>${icon('mail', 13)} ${esc(item.email)}</span>` : ''}
      </div>
      <div class="contractor-stats">
        <div><span>Ставка</span><b>${item.rate ? fmtMoney(item.rate) : '—'}</b></div>
        <div><span>Рейсов</span><b>${item.deals_count || 0}</b></div>
        <div><span>Расходы</span><b>${fmtMoney(item.cost_total || 0)}</b></div>
      </div>
      ${item.notes ? `<p class="contractor-notes" data-raw>${esc(item.notes)}</p>` : ''}
    </article>`).join('');
    grid.querySelectorAll('[data-contractor]').forEach((card) => {
      const open = () => {
        const contractor = contractors.find((item) => String(item.id) === card.dataset.contractor);
        if (contractor) openContractorForm(contractor, { onSaved: () => refresh() });
      };
      card.addEventListener('click', open);
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      });
    });
  }

  searchEl.addEventListener('input', () => {
    filters.q = searchEl.value;
    paint();
  });

  root.querySelector('[data-new-contractor]').addEventListener('click', () => openContractorForm());
  paint();
}
