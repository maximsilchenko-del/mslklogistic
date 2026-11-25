import { api } from '../api.js';
import { openRepairReview, openVehicleDetail, openVehicleForm } from '../forms.js';
import {
  emptyState, esc, fmtDate, fmtQty, icon, loader, plural, repairStatusChip,
  repairUrgencyChip, todayISO,
} from '../ui.js';

function serviceMeta(value) {
  if (!value) return { text: 'не запланировано', late: false };
  return {
    text: fmtDate(value, true),
    late: String(value).slice(0, 10) < todayISO(),
  };
}

function vehicleCard(vehicle) {
  const service = serviceMeta(vehicle.next_service);
  return `<article class="fleet-card" data-vehicle-id="${vehicle.id}" tabindex="0" role="button"
                   aria-label="Открыть карточку ${esc(vehicle.name)}">
    <div class="fleet-top">
      <span class="fleet-icon">${icon('deals', 21)}</span>
      <div class="fleet-name-wrap">
        <h3 class="fleet-name" data-raw>${esc(vehicle.name)}</h3>
        <span class="fleet-plate" data-raw>${vehicle.plate ? esc(vehicle.plate) : 'без номера'}</span>
      </div>
      ${vehicle.kind ? `<span class="chip fleet-kind">${esc(vehicle.kind)}</span>` : ''}
    </div>
    <div class="fleet-meta">
      <div>
        <span>Водитель</span>
        <b>${vehicle.driver_name ? `<span data-raw>${esc(vehicle.driver_name)}</span>` : 'не закреплён'}</b>
      </div>
      <div>
        <span>Пробег</span>
        <b>${vehicle.mileage ? fmtQty(vehicle.mileage) + ' км' : '—'}</b>
      </div>
      <div>
        <span>Следующее ТО</span>
        <b class="${service.late ? 'late' : ''}">${service.text}</b>
      </div>
    </div>
    ${vehicle.insurance_until || vehicle.inspection_until ? `<div class="fleet-docs">
      ${vehicle.insurance_until ? `<span>${icon('note', 12)} страховка до ${fmtDate(vehicle.insurance_until, true)}</span>` : ''}
      ${vehicle.inspection_until ? `<span>${icon('check', 12)} техосмотр до ${fmtDate(vehicle.inspection_until, true)}</span>` : ''}
    </div>` : ''}
    ${vehicle.notes ? `<p class="fleet-note" data-raw>${esc(vehicle.notes)}</p>` : ''}
    <div class="fleet-foot">
      ${vehicle.open_repairs
        ? `<span class="chip repair-open">${icon('repair', 12)} ${vehicle.open_repairs} ${plural(vehicle.open_repairs, 'заявка', 'заявки', 'заявок')} на ремонт</span>`
        : `<span class="fleet-ok">${icon('check', 13)} Без открытых заявок</span>`}
      <span class="fleet-open-hint">${icon('arrow', 15)}</span>
    </div>
  </article>`;
}

function repairItem(repair) {
  return `<article class="repair-item" data-repair-id="${repair.id}" tabindex="0" role="button"
                   aria-label="Открыть заявку ${esc(repair.title)}">
    <div class="repair-item-main">
      <div class="repair-item-top">
        ${repairStatusChip(repair.status)}
        ${repairUrgencyChip(repair.urgency)}
        <span class="repair-date">${icon('calendar', 12)} ${fmtDate(repair.created_at, true)}</span>
      </div>
      <h3 class="repair-title" data-raw>${esc(repair.title)}</h3>
      <div class="repair-meta">
        <span data-raw>${icon('deals', 13)} ${esc(repair.vehicle_label)}</span>
        ${repair.driver_name ? `<span>${icon('clients', 13)} ${esc(repair.driver_name)}</span>` : ''}
      </div>
      ${repair.description ? `<p class="repair-desc" data-raw>${esc(repair.description)}</p>` : ''}
      ${repair.resolution ? `<p class="repair-resolution" data-raw>${icon('check', 13)}<span>${esc(repair.resolution)}</span></p>` : ''}
    </div>
    <span class="repair-open-hint">${icon('arrow', 16)}</span>
  </article>`;
}

export async function render(root) {
  root.innerHTML = loader();
  let vehicles = [];
  let repairs = [];
  try {
    const [vehiclesData, repairsData] = await Promise.all([
      api.get('/vehicles'),
      api.get('/repairs'),
    ]);
    vehicles = vehiclesData.vehicles || [];
    repairs = repairsData.repairs || [];
  } catch (err) {
    root.innerHTML = `<div class="card"><div class="card-body">${emptyState('alert', 'Не удалось загрузить автопарк', err.message)}</div></div>`;
    return;
  }

  const open = repairs.filter((repair) => repair.status !== 'done').length;
  const closed = repairs.filter((repair) => repair.status === 'done').length;
  const subtitle = [
    `${vehicles.length} ${plural(vehicles.length, 'машина', 'машины', 'машин')}`,
    `${open} ${plural(open, 'открытая заявка', 'открытые заявки', 'открытых заявок')}`,
    closed ? `${closed} ${plural(closed, 'выполненная', 'выполненные', 'выполненных')}` : '',
  ].filter(Boolean).join(' · ');

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="page-title">Автопарк</h1>
        <p class="page-sub">${esc(subtitle)}</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" type="button" data-new-vehicle>${icon('plus', 16)} Новая машина</button>
      </div>
    </div>

    <section class="fleet-section">
      <div class="section-row">
        <div>
          <h2 class="section-heading">Машины автопарка</h2>
          <p class="section-note">Все машины, закреплённые водители и состояние ремонта.</p>
        </div>
        <span class="count-note">${vehicles.length} ${plural(vehicles.length, 'единица', 'единицы', 'единиц')} техники</span>
      </div>
      ${vehicles.length
        ? `<div class="fleet-grid">${vehicles.map(vehicleCard).join('')}</div>`
        : `<section class="card"><div class="card-body">${emptyState(
            'deals',
            'В автопарке пока нет машин',
            'Машины появятся здесь, когда автопарк будет заполнен.',
          )}</div></section>`}
    </section>

    <section class="card repair-card">
      <div class="card-head">
        <div>
          <h2 class="card-title">Заявки на ремонт</h2>
          <p class="card-sub">Обращения водителей · ${open} ${plural(open, 'в работе', 'в работе', 'в работе')}</p>
        </div>
        ${open ? `<span class="chip repair-open">${open} ${plural(open, 'открытая', 'открытые', 'открытых')}</span>` : ''}
      </div>
      <div class="repair-list">
        ${repairs.length
          ? repairs.map(repairItem).join('')
          : `<div class="repair-empty">${emptyState(
              'repair',
              'Заявок пока нет',
              'Когда водитель сообщит о неисправности, заявка появится здесь.',
            )}</div>`}
      </div>
    </section>
  `;

  root.querySelector('[data-new-vehicle]').addEventListener('click', () => openVehicleForm());

  root.querySelectorAll('[data-vehicle-id]').forEach((card) => {
    const openCard = () => openVehicleDetail(card.dataset.vehicleId);
    card.addEventListener('click', openCard);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openCard();
      }
    });
  });

  root.querySelectorAll('[data-repair-id]').forEach((card) => {
    const openCard = () => {
      const repair = repairs.find((item) => String(item.id) === card.dataset.repairId);
      if (repair) openRepairReview(repair);
    };
    card.addEventListener('click', openCard);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openCard();
      }
    });
  });
}
