import { api } from '../api.js';
import { getLang } from '../i18n.js';
import { openDriverTrip, openRepairForm, openRepairReview } from '../forms.js';
import {
  emptyState, esc, fmtDate, fmtQty, icon, loader, plural, repairStatusChip,
  repairUrgencyChip, stageMeta, transportChip,
} from '../ui.js';

function tripCard(deal) {
  const stage = stageMeta(deal.stage);
  return `<article class="trip-card" data-trip-id="${deal.id}" tabindex="0" role="button"
                   aria-label="Открыть рейс ${esc(deal.title)}">
    <div class="trip-card-top">
      <span class="chip stage-${deal.stage}"><span class="dot"></span>${esc(stage.title)}</span>
      <span class="trip-card-date">${icon('calendar', 13)} ${deal.close_date ? (getLang() === 'en' ? 'due ' : 'до ') + fmtDate(deal.close_date) : 'без срока'}</span>
    </div>
    <h2 class="trip-card-route" data-raw>${esc(deal.title)}</h2>
    <div class="trip-card-client">${icon('clients', 14)}<span>${deal.client_name ? `<span data-raw>${esc(deal.client_name)}</span>` : 'Клиент не указан'}</span></div>
    <div class="trip-card-cargo">${transportChip(deal.transport_type)}<span>${deal.cargo ? `<span data-raw>${esc(deal.cargo)}</span>` : 'Груз не указан'}</span></div>
    <div class="trip-card-meta">
      <span>${deal.pickup_date ? 'погрузка ' + fmtDate(deal.pickup_date) : 'погрузка не назначена'}</span>
      ${deal.weight ? `<span>${fmtQty(deal.weight)} т</span>` : ''}
      ${deal.volume ? `<span>${fmtQty(deal.volume)} м³</span>` : ''}
    </div>
    ${deal.delivered_at
      ? `<div class="trip-card-progress done">${icon('check', 13)}<span>Рейс завершён · факт передан в офис</span></div>`
      : deal.departed_at
        ? `<div class="trip-card-progress active">${icon('deals', 13)}<span>В пути · можно отметить выгрузку</span></div>`
        : deal.loaded_at
          ? `<div class="trip-card-progress active">${icon('box', 13)}<span>Погрузка отмечена · отметьте выезд</span></div>`
          : `<div class="trip-card-progress">${icon('check', 13)}<span>Отметьте погрузку, чтобы начать рейс</span></div>`}
    ${deal.vehicle ? `<div class="trip-card-vehicle">${icon('deals', 14)}<span data-raw>${esc(deal.vehicle)}</span></div>` : ''}
    <div class="trip-card-foot">${icon('upload', 14)}<span>Добавить документы</span></div>
  </article>`;
}

function repairCard(repair) {
  return `<article class="my-repair" data-my-repair-id="${repair.id}" tabindex="0" role="button"
                   aria-label="Открыть заявку ${esc(repair.title)}">
    <div class="repair-item-top">
      ${repairStatusChip(repair.status)}
      ${repairUrgencyChip(repair.urgency)}
      <span class="repair-date">${icon('calendar', 12)} ${fmtDate(repair.created_at, true)}</span>
    </div>
    <h3 class="repair-title" data-raw>${esc(repair.title)}</h3>
    <div class="repair-meta"><span data-raw>${icon('deals', 13)} ${esc(repair.vehicle_label)}</span></div>
    ${repair.description ? `<p class="repair-desc" data-raw>${esc(repair.description)}</p>` : ''}
    ${repair.planned_date ? `<p class="repair-meta"><span>${icon('calendar', 13)} план ${fmtDate(repair.planned_date, true)}</span></p>` : ''}
    ${repair.resolution ? `<p class="repair-resolution" data-raw>${icon('check', 13)}<span>${esc(repair.resolution)}</span></p>` : ''}
    ${repair.mechanic_name ? `<div class="repair-mechanic">${icon('repair', 13)} ${esc(repair.mechanic_name)}</div>` : ''}
    <div class="my-repair-foot">
      ${repair.photos_count ? `<span>${icon('camera', 12)} ${repair.photos_count}</span>` : ''}
      ${repair.comments_count ? `<span>${icon('note', 12)} ${repair.comments_count}</span>` : ''}
      <span class="my-repair-open">Открыть ${icon('arrow', 13)}</span>
    </div>
  </article>`;
}

export async function render(root) {
  root.innerHTML = loader();
  let deals = [];
  let repairs = [];
  try {
    const [dealsData, repairsData] = await Promise.all([
      api.get('/deals'),
      api.get('/repairs'),
    ]);
    deals = dealsData.deals || [];
    repairs = repairsData.repairs || [];
  } catch (err) {
    root.innerHTML = `<div class="card"><div class="card-body">${emptyState('alert', 'Не удалось загрузить рейсы', err.message)}</div></div>`;
    return;
  }

  const openRepairs = repairs.filter((repair) => repair.status !== 'done').length;

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="page-title">Мои рейсы</h1>
        <p class="page-sub">${deals.length
          ? `${deals.length} ${plural(deals.length, 'рейс', 'рейса', 'рейсов')} назначено вам. Откройте рейс, чтобы посмотреть маршрут и добавить документы.`
          : 'Здесь появятся перевозки, которые назначит вам офис.'}</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" type="button" data-new-repair>${icon('repair', 16)} Заявка на ремонт</button>
      </div>
    </div>

    ${deals.length
      ? `<div class="trip-grid">${deals.map(tripCard).join('')}</div>`
      : `<section class="card"><div class="card-body">${emptyState(
          'deals',
          'Пока нет назначенных рейсов',
          'Когда менеджер назначит вас водителем перевозки, она появится здесь.',
        )}</div></section>`}

    <section class="driver-repairs">
      <div class="section-row">
        <div>
          <h2 class="section-heading">Мои заявки на ремонт</h2>
          <p class="section-note">${openRepairs
            ? `${openRepairs} ${plural(openRepairs, 'заявка ещё в работе', 'заявки ещё в работе', 'заявок ещё в работе')}.`
            : 'Сообщите механику о неисправности машины.'}</p>
        </div>
        <span class="count-note">${repairs.length} ${plural(repairs.length, 'заявка', 'заявки', 'заявок')}</span>
      </div>
      ${repairs.length
        ? `<div class="my-repair-list">${repairs.map(repairCard).join('')}</div>`
        : `<section class="card"><div class="card-body">${emptyState(
            'repair',
            'Заявок пока нет',
            'Если машина требует ремонта, отправьте заявку — механик увидит её сразу.',
          )}</div></section>`}
    </section>
  `;

  root.querySelector('[data-new-repair]').addEventListener('click', () => openRepairForm());

  root.querySelectorAll('[data-trip-id]').forEach((card) => {
    const open = () => {
      const deal = deals.find((item) => String(item.id) === card.dataset.tripId);
      if (deal) openDriverTrip(deal);
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
  });

  root.querySelectorAll('[data-my-repair-id]').forEach((card) => {
    const open = () => {
      const repair = repairs.find((item) => String(item.id) === card.dataset.myRepairId);
      if (repair) openRepairReview(repair);
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
