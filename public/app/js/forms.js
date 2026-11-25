/* Reusable create/edit drawers for deals, clients, tasks and users. */

import { api } from './api.js';
import { getLang } from './i18n.js';
import { state, loadTeam } from './store.js';
import {
  avatar, closeDrawer, confirmDialog, esc, fmtDate, fmtDateTime, fmtMoney, fmtPct, fmtQty, formValues, icon,
  isFieldRole, openDrawer, plural, refresh, REPAIR_STATUSES, REPAIR_URGENCIES,
  repairStatusChip, repairUrgencyChip, showFormError, clearFormError, stageMeta, STAGES, todayISO,
  toast, TRANSPORT_TYPES, vehicleText,
} from './ui.js';

function option(value, label, selected) {
  return `<option value="${esc(value)}"${String(selected) === String(value) ? ' selected' : ''}>${esc(label)}</option>`;
}

function teamWithFallback(team, ownerId, ownerName) {
  if (!ownerId || team.some((member) => member.id === ownerId)) return team;
  return [...team, { id: ownerId, name: ownerName || 'Ответственный' }];
}

async function submit(form, button, task) {
  clearFormError(form);
  button.disabled = true;
  const original = button.textContent;
  button.textContent = 'Сохраняем…';
  try {
    await task();
  } catch (err) {
    showFormError(form, err.message || 'Не удалось сохранить изменения');
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function footer(isEdit, saveLabel, deleteLabel = 'Удалить') {
  return `${isEdit ? `<button type="button" class="btn btn-danger btn-sm" data-delete>${icon('trash', 14)} ${deleteLabel}</button>` : ''}
    <span class="spacer"></span>
    <button type="button" class="btn" data-cancel>Отмена</button>
    <button type="submit" class="btn btn-primary" data-save>${esc(saveLabel)}</button>`;
}

function wireFooter(drawer, form, onDelete) {
  drawer.backdrop.querySelector('[data-cancel]').addEventListener('click', closeDrawer);
  const save = drawer.backdrop.querySelector('[data-save]');
  save.addEventListener('click', () => form.requestSubmit());
  const del = drawer.backdrop.querySelector('[data-delete]');
  if (del && onDelete) del.addEventListener('click', onDelete);
}

/* ------------------------------------------------------------- deal documents */

const DOC_KINDS = [
  { id: 'contract', title: 'Договор на перевозку' },
  { id: 'waybill', title: 'Путевой лист' },
  { id: 'shipping', title: 'Товаросопроводительные документы' },
  { id: 'certificate', title: 'Свидетельства и удостоверения' },
  { id: 'invoice', title: 'Счета на оплату' },
  { id: 'other', title: 'Другие документы' },
];

function fmtSize(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) return size + ' Б';
  if (size < 1024 * 1024) return Math.max(1, Math.round(size / 1024)) + ' КБ';
  return (size / (1024 * 1024)).toFixed(1).replace('.', getLang() === 'en' ? '.' : ',') + ' МБ';
}

function docSummary(files) {
  if (!files.length) return 'Пока нет прикреплённых документов';
  const kinds = new Set(files.map((file) => file.kind)).size;
  return `${files.length} ${plural(files.length, 'документ', 'документа', 'документов')} · `
    + `${kinds} ${plural(kinds, 'категория', 'категории', 'категорий')}`;
}

/** Downscale a photo in the browser so uploads stay small and quick. */
function prepareImage(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type)) {
      reject(new Error('это не изображение'));
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      reject(new Error('файл больше 25 МБ'));
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const maxSide = 1600;
        const width = img.naturalWidth || maxSide;
        const height = img.naturalHeight || maxSide;
        const scale = Math.min(1, maxSide / Math.max(width, height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({
          data: canvas.toDataURL('image/jpeg', 0.85),
          filename: file.name.replace(/\.[^.]+$/, '') + '.jpg',
        });
      } catch (err) {
        reject(new Error('не удалось обработать изображение'));
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('не удалось открыть изображение'));
    };
    img.src = objectUrl;
  });
}

/** Upload repair photos one by one; failures are reported without blocking the rest. */
async function uploadRepairPhotos(repairId, files) {
  const list = [...(files || [])];
  let done = 0;
  for (const file of list) {
    try {
      const prepared = await prepareImage(file);
      await api.post(`/repairs/${repairId}/files`, prepared);
      done += 1;
    } catch (err) {
      toast(`«${file.name}»: ${err.message || 'не удалось загрузить фото'}`, 'error');
    }
  }
  return done;
}

function docCard(file) {
  return `<figure class="doc-card">
    <a class="doc-thumb" href="${esc(file.url)}" target="_blank" rel="noopener" title="Открыть фото">
      <img src="${esc(file.url)}" alt="${esc(file.filename)}">
    </a>
    <figcaption>
      <span class="doc-name" title="${esc(file.filename)}">${esc(file.filename)}</span>
      <span class="doc-meta">${fmtSize(file.size)} · ${fmtDate(file.created_at)}</span>
    </figcaption>
    <button type="button" class="icon-btn doc-remove" data-remove-file="${file.id}"
            title="Удалить документ" aria-label="Удалить ${esc(file.filename)}">${icon('trash', 14)}</button>
  </figure>`;
}

async function mountDealFiles(host, deal, opts = {}) {
  const uploadOnly = Boolean(opts.uploadOnly);
  host.innerHTML = `
    <section class="doc-block">
      <div class="doc-head">
        <h3 class="doc-title">${uploadOnly ? 'Добавить документы' : 'Документы перевозки'}</h3>
        <p class="doc-sub" data-doc-summary>${uploadOnly ? 'Выберите категорию и снимите фото документа' : 'Загружаем…'}</p>
      </div>
      <div class="doc-tools">
        <label class="doc-kind">
          <select data-doc-kind aria-label="Категория документа">
            ${DOC_KINDS.map((kind) => option(kind.id, kind.title)).join('')}
          </select>
        </label>
        <label class="doc-pick" data-doc-pick>
          <input type="file" accept="image/*" multiple hidden data-doc-input>
          ${icon('camera', 16)}<span>Добавить фото</span>
        </label>
      </div>
      <p class="doc-hint">${uploadOnly
        ? 'Фото сразу поступят в офис. Просматривать загруженные документы водитель не может.'
        : 'Выберите категорию и прикрепите фото документа — с телефона можно сразу из камеры.'}</p>
      <div class="doc-groups" data-doc-groups${uploadOnly ? ' hidden' : ''}></div>
    </section>`;

  const summaryEl = host.querySelector('[data-doc-summary]');
  const groupsEl = host.querySelector('[data-doc-groups]');
  const kindEl = host.querySelector('[data-doc-kind]');
  const pickEl = host.querySelector('[data-doc-pick]');
  const inputEl = host.querySelector('[data-doc-input]');
  let files = [];
  let sent = 0;

  function paint() {
    summaryEl.textContent = docSummary(files);
    if (!files.length) {
      groupsEl.innerHTML = `<div class="doc-empty">${icon('camera', 18)}
        <span>Пока нет документов. Прикрепите фото договора, путевого листа, ТТН или счёта.</span></div>`;
      return;
    }
    groupsEl.innerHTML = DOC_KINDS.map((kind) => {
      const list = files.filter((file) => file.kind === kind.id);
      if (!list.length) return '';
      return `<div class="doc-group">
        <div class="doc-group-head"><span>${esc(kind.title)}</span><span class="doc-count">${list.length}</span></div>
        <div class="doc-grid">${list.map(docCard).join('')}</div>
      </div>`;
    }).join('');
  }

  async function load() {
    try {
      const data = await api.get('/deals/' + deal.id + '/files');
      files = data.files || [];
      paint();
    } catch (err) {
      summaryEl.textContent = 'Не удалось загрузить документы';
      groupsEl.innerHTML = `<div class="notice">${icon('alert', 16)}<div>${esc(err.message)}</div></div>`;
    }
  }

  async function upload(list) {
    const items = [...(list || [])];
    if (!items.length) return;
    const kind = kindEl.value;
    pickEl.classList.add('busy');
    inputEl.disabled = true;
    let done = 0;
    for (const file of items) {
      try {
        const prepared = await prepareImage(file);
        await api.post('/deals/' + deal.id + '/files', { kind, ...prepared });
        done += 1;
      } catch (err) {
        toast(`«${file.name}»: ${err.message || 'не удалось загрузить'}`, 'error');
      }
    }
    inputEl.disabled = false;
    pickEl.classList.remove('busy');
    if (uploadOnly) {
      if (done) {
        sent += done;
        summaryEl.textContent = `Отправлено в офис: ${sent} ${plural(sent, 'документ', 'документа', 'документов')}`;
        toast(done === 1 ? 'Документ отправлен в офис' : `Отправлено документов: ${done}`, 'success');
      }
      return;
    }
    await load();
    if (done) {
      toast(done === 1 ? 'Документ добавлен' : `Добавлено документов: ${done}`, 'success');
      refresh();
    }
  }

  inputEl.addEventListener('change', () => {
    upload(inputEl.files);
    inputEl.value = '';
  });

  ['dragenter', 'dragover'].forEach((type) => {
    pickEl.addEventListener(type, (event) => {
      event.preventDefault();
      pickEl.classList.add('drop');
    });
  });
  ['dragleave', 'drop'].forEach((type) => {
    pickEl.addEventListener(type, (event) => {
      event.preventDefault();
      pickEl.classList.remove('drop');
    });
  });
  pickEl.addEventListener('drop', (event) => {
    if (event.dataTransfer && event.dataTransfer.files) upload(event.dataTransfer.files);
  });

  if (!uploadOnly) {
    groupsEl.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-remove-file]');
      if (!button) return;
      const id = Number(button.dataset.removeFile);
      const file = files.find((item) => item.id === id);
      if (!file) return;
      const ok = await confirmDialog({
        title: 'Удалить документ?',
        message: `«${file.filename}» будет удалён из перевозки.`,
      });
      if (!ok) return;
      try {
        await api.del('/files/' + id);
        await load();
        refresh();
        toast('Документ удалён', 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    await load();
  }
}


/* ------------------------------------------------------------- deal */

async function mountDealTrip(host, deal) {
  try {
    const detail = (await api.get('/deals/' + deal.id)).deal;
    host.innerHTML = `<section class="deal-trip-block">
      <div class="repair-block-head">
        <h3>Факт выполнения рейса</h3>
        ${detail.delivered_at ? `<span class="chip repair-status-done">${icon('check', 12)} доставлено</span>` : ''}
      </div>
      ${tripProgress(detail)}
      <div class="deal-trip-meta">
        <div><span>Фактический пробег</span><b>${detail.actual_mileage ? fmtQty(detail.actual_mileage) + ' км' : '—'}</b></div>
        <div><span>Топливо</span><b>${detail.fuel_used ? fmtQty(detail.fuel_used) + ' л' : '—'}</b></div>
        <div><span>Комментариев</span><b>${detail.comments.length}</b></div>
      </div>
      ${detail.trip_report ? `<p class="deal-trip-report">${esc(detail.trip_report)}</p>` : ''}
      ${detail.comments.length ? `<div class="thread-list thread-list-compact">${commentsList(detail.comments)}</div>` : ''}
    </section>`;
  } catch (err) {
    host.innerHTML = `<div class="notice">${icon('alert', 15)}<div>${esc(err.message)}</div></div>`;
  }
}

async function mountDealFinance(host, deal) {
  async function paint() {
    let detail;
    try {
      detail = (await api.get('/deals/' + deal.id)).deal;
    } catch (err) {
      host.innerHTML = `<div class="notice">${icon('alert', 15)}<div>${esc(err.message)}</div></div>`;
      return;
    }
    const finance = detail.finance || { by_kind: {}, total: 0, margin: 0, margin_pct: 0, income: detail.amount };
    const expenses = detail.expenses || [];
    const kinds = detail.expense_kinds || { fuel: 'Топливо', toll: 'Платные дороги', repair: 'Ремонт', other: 'Прочее' };
    const marginTone = finance.margin > 0 ? 'good' : finance.margin < 0 ? 'bad' : '';
    const rows = expenses.length
      ? expenses.map((item) => `<div class="finance-row">
          <span class="finance-kind ${esc(item.kind)}">${esc(kinds[item.kind] || item.kind)}</span>
          <span class="finance-note">${esc(item.note || 'Без комментария')}</span>
          <span class="finance-author">${esc(item.author_name || '')}</span>
          <b>${fmtMoney(item.amount)}</b>
          <button class="icon-btn sm" data-del-expense="${item.id}" title="Удалить расход">${icon('trash', 14)}</button>
        </div>`).join('')
      : '<div class="manager-note">Расходов пока нет — добавьте топливо, платные дороги или ремонт.</div>';

    host.innerHTML = `<section class="deal-finance-block">
      <div class="repair-block-head">
        <h3>Финансы рейса</h3>
        <span class="chip finance-margin ${marginTone}">маржа ${fmtMoney(finance.margin)}${finance.margin_pct !== null && finance.margin_pct !== undefined ? ` · ${fmtPct(finance.margin_pct)}` : ''}</span>
      </div>
      <div class="finance-summary">
        <div><span>Доход</span><b>${fmtMoney(finance.income)}</b></div>
        <div><span>Расходы</span><b>${fmtMoney(finance.total)}</b></div>
        <div><span>Маржа</span><b class="${marginTone}">${fmtMoney(finance.margin)}</b></div>
      </div>
      <div class="finance-kinds">
        ${['fuel', 'toll', 'repair', 'other'].map((kind) => `<span class="finance-kind-pill ${kind}">${esc(kinds[kind] || kind)} <b>${fmtMoney(finance.by_kind[kind] || 0)}</b></span>`).join('')}
      </div>
      <div class="finance-list">${rows}</div>
      <form class="finance-add" data-expense-form>
        <select name="kind" aria-label="Вид расхода">
          ${Object.entries(kinds).filter(([kind]) => kind !== 'converted').map(([kind, title]) => `<option value="${esc(kind)}">${esc(title)}</option>`).join('')}
        </select>
        <input name="amount" type="number" min="1" step="any" inputmode="decimal" placeholder="Сумма, ₽" required>
        <input name="note" placeholder="Комментарий" maxlength="200">
        <button type="submit" class="btn btn-sm">${icon('plus', 14)} Расход</button>
      </form>
    </section>`;

    host.querySelector('[data-expense-form]').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = formValues(form);
      const amount = Number(values.amount || 0);
      if (!amount || amount <= 0) {
        toast('Укажите сумму расхода', 'error');
        return;
      }
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        await api.post(`/deals/${deal.id}/expenses`, {
          kind: values.kind,
          amount,
          note: values.note || '',
        });
        toast('Расход добавлен', 'success');
        refresh();
        paint();
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        button.disabled = false;
      }
    });

    host.querySelectorAll('[data-del-expense]').forEach((button) => {
      button.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Удалить расход?',
          message: 'Сумма исчезнет из расчёта маржи по этому рейсу.',
        });
        if (!ok) return;
        try {
          await api.del('/expenses/' + button.dataset.delExpense);
          toast('Расход удалён', 'success');
          refresh();
          paint();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  paint();
}

async function mountDealPayments(host, deal) {
  async function paint() {
    let data;
    try {
      data = await api.get('/deals/' + deal.id + '/payments');
    } catch (err) {
      host.innerHTML = `<div class="notice">${icon('alert', 15)}<div>${esc(err.message)}</div></div>`;
      return;
    }
    const payments = data.payments || [];
    const summary = data.summary || { paid: 0, debt: 0, status: 'unpaid' };
    const detail = deal;
    const due = detail.payment_due || '';
    const overdue = detail.payment_overdue || (due && summary.debt > 0.01 && due < todayISO());
    const statusLabels = { paid: 'Оплачено', partial: 'Частично оплачено', unpaid: 'Не оплачено' };
    const rows = payments.length
      ? payments.map((payment) => `<div class="payment-row">
          <span class="payment-date">${fmtDate(payment.paid_at, true)}</span>
          <span class="payment-note">${esc(payment.note || 'Без комментария')}</span>
          <span class="payment-author">${esc(payment.author_name || '')}</span>
          <b>${fmtMoney(payment.amount)}</b>
          <button class="icon-btn sm" data-del-payment="${payment.id}" title="Удалить платёж">${icon('trash', 14)}</button>
        </div>`).join('')
      : '<div class="manager-note">Платежей пока нет — добавьте первый, когда клиент оплатит счёт.</div>';

    host.innerHTML = `<section class="deal-payment-block">
      <div class="repair-block-head">
        <h3>Оплата</h3>
        <span class="chip payment-status-${esc(summary.status)}${overdue ? ' payment-overdue' : ''}">
          ${esc(overdue ? 'Просрочено' : (statusLabels[summary.status] || 'Не оплачено'))}
        </span>
      </div>
      <div class="payment-summary">
        <div><span>Счёт</span><b>${fmtMoney(detail.amount)}</b></div>
        <div><span>Оплачено</span><b class="good">${fmtMoney(summary.paid)}</b></div>
        <div><span>Долг</span><b class="${summary.debt > 0 ? 'bad' : ''}">${fmtMoney(summary.debt)}</b></div>
        <div><span>Срок оплаты</span><b class="${overdue ? 'bad' : ''}">${due ? fmtDate(due, true) : '—'}</b></div>
      </div>
      <div class="payment-list">${rows}</div>
      <form class="payment-add" data-payment-form>
        <input name="amount" type="number" min="1" step="any" inputmode="decimal" placeholder="Сумма, ₽" required>
        <input name="paid_at" type="date" value="${todayISO()}" aria-label="Дата платежа">
        <input name="note" placeholder="Комментарий" maxlength="200">
        <button type="submit" class="btn btn-sm">${icon('plus', 14)} Платёж</button>
      </form>
    </section>`;

    host.querySelector('[data-payment-form]').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = formValues(form);
      const amount = Number(values.amount || 0);
      if (!amount || amount <= 0) {
        toast('Укажите сумму платежа', 'error');
        return;
      }
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        await api.post(`/deals/${deal.id}/payments`, {
          amount,
          paid_at: values.paid_at || '',
          note: values.note || '',
        });
        toast('Платёж добавлен', 'success');
        refresh();
        paint();
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        button.disabled = false;
      }
    });

    host.querySelectorAll('[data-del-payment]').forEach((button) => {
      button.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Удалить платёж?',
          message: 'Сумма исчезнет из расчёта оплаты и долга по этому рейсу.',
        });
        if (!ok) return;
        try {
          await api.del('/payments/' + button.dataset.delPayment);
          toast('Платёж удалён', 'success');
          refresh();
          paint();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  paint();
}

export async function openDealForm(deal = null, opts = {}) {
  const isEdit = Boolean(deal);
  let clients = [];
  let team = [];
  let contractors = [];
  try {
    const [clientsData] = await Promise.all([api.get('/clients'), loadTeam()]);
    clients = clientsData.clients;
    team = state.team;
    const contractorsData = await api.get('/contractors', { active: 1 });
    contractors = contractorsData.contractors || [];
  } catch (err) {
    toast(err.message, 'error');
    return;
  }

  if (!clients.length) {
    openDrawer({
      title: 'Сначала добавьте клиента',
      subtitle: 'Перевозка всегда привязана к клиенту',
      body: `<div class="notice">${icon('alert', 16)}<div>В базе пока нет клиентов. Создайте первого клиента — после этого можно будет добавить перевозку.</div></div>`,
      footer: `<span class="spacer"></span><button type="button" class="btn" data-cancel>Отмена</button><button type="button" class="btn btn-primary" data-create-client>Создать клиента</button>`,
    }).backdrop.addEventListener('click', (event) => {
      if (event.target.closest('[data-cancel]')) closeDrawer();
      if (event.target.closest('[data-create-client]')) {
        closeDrawer();
        openClientForm(null, { onSaved: () => openDealForm(deal, opts) });
      }
    });
    return;
  }

  const selectedClient = deal ? deal.client_id : (opts.clientId || clients[0].id);
  const selectedStage = deal ? deal.stage : (opts.stage || 'lead');
  const owners = team.filter((member) => !isFieldRole(member.role));
  const selectedOwner = teamWithFallback(owners, deal ? deal.owner_id : state.user.id, deal ? deal.owner_name : state.user.name);
  const ownerField = state.user.role === 'manager'
    ? ''
    : `<div class="field"><label>Ответственный</label><select name="owner_id">
         ${selectedOwner.map((m) => option(m.id, m.name, deal ? deal.owner_id : state.user.id)).join('')}
       </select></div>`;
  const drivers = team.filter((member) => member.role === 'driver');
  const driverField = `<div class="field">
      <label for="deal-driver">Водитель</label>
      <select id="deal-driver" name="driver_id">
        <option value="">Не назначен</option>
        ${drivers.map((member) => option(member.id, member.name, deal ? deal.driver_id : '')).join('')}
      </select>
      ${!drivers.length
        ? '<p class="field-hint">Добавьте в команду пользователя с ролью «Водитель», чтобы назначить его на рейс.</p>'
        : deal && deal.driver && !deal.driver_id
          ? `<p class="field-hint">Сейчас указан: ${esc(deal.driver)} — без учётной записи.</p>`
          : ''}
    </div>`;

  const drawer = openDrawer({
    title: isEdit ? 'Перевозка' : 'Новая перевозка',
    subtitle: isEdit ? `${deal.title} · обновлено ${fmtDate(deal.updated_at)}` : 'Маршрут, груз и стоимость',
    body: `
      <form id="deal-form" class="form" novalidate>
        <div class="form-error"></div>
        <div class="field">
          <label for="deal-client">Клиент</label>
          <select id="deal-client" name="client_id">
            ${clients.map((c) => option(c.id, c.name, selectedClient)).join('')}
          </select>
        </div>
        <div class="form-row">
          <div class="field">
            <label for="deal-from">Откуда</label>
            <input id="deal-from" name="route_from" value="${esc(deal ? deal.route_from : '')}" placeholder="${getLang() === 'en' ? 'Moscow' : 'Москва'}" required>
          </div>
          <div class="field">
            <label for="deal-to">Куда</label>
            <input id="deal-to" name="route_to" value="${esc(deal ? deal.route_to : '')}" placeholder="${getLang() === 'en' ? 'Saint Petersburg' : 'Санкт-Петербург'}" required>
          </div>
        </div>
        <div class="form-row">
          <div class="field">
            <label for="deal-cargo">Груз</label>
            <input id="deal-cargo" name="cargo" value="${esc(deal ? deal.cargo : '')}" placeholder="${getLang() === 'en' ? 'Building materials, 18 pallets' : 'Стройматериалы, 18 паллет'}">
          </div>
          <div class="field">
            <label for="deal-transport">Тип перевозки</label>
            <select id="deal-transport" name="transport_type">
              ${TRANSPORT_TYPES.map((t) => option(t.id, `${t.short} — ${t.title}`, deal ? deal.transport_type : 'ftl')).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="field">
            <label for="deal-weight">Вес, т</label>
            <input id="deal-weight" name="weight" type="number" min="0" step="0.1" inputmode="decimal"
                   value="${deal && deal.weight ? deal.weight : ''}" placeholder="0">
          </div>
          <div class="field">
            <label for="deal-volume">Объём, м³</label>
            <input id="deal-volume" name="volume" type="number" min="0" step="0.1" inputmode="decimal"
                   value="${deal && deal.volume ? deal.volume : ''}" placeholder="0">
          </div>
        </div>
        <div class="form-row">
          <div class="field">
            <label for="deal-pickup">Дата погрузки</label>
            <input id="deal-pickup" name="pickup_date" type="date" value="${esc(deal && deal.pickup_date ? deal.pickup_date : '')}">
          </div>
          <div class="field">
            <label for="deal-close">Дата доставки</label>
            <input id="deal-close" name="close_date" type="date" value="${esc(deal && deal.close_date ? deal.close_date : '')}">
          </div>
        </div>
        <div class="form-row three">
          <div class="field">
            <label for="deal-amount">Стоимость, ₽</label>
            <input id="deal-amount" name="amount" type="number" min="0" step="any" inputmode="decimal"
                   value="${deal ? deal.amount : ''}" placeholder="0">
          </div>
          <div class="field">
            <label for="deal-distance">Расстояние, км</label>
            <input id="deal-distance" name="distance_km" type="number" min="0" step="1" inputmode="decimal"
                   value="${deal && deal.distance_km ? deal.distance_km : ''}" placeholder="0">
          </div>
          <div class="field">
            <label for="deal-stage">Этап</label>
            <select id="deal-stage" name="stage">
              ${STAGES.map((s) => option(s.id, s.title, selectedStage)).join('')}
            </select>
          </div>
        </div>
        ${ownerField}
        <div class="form-row">
          ${driverField}
          <div class="field">
            <label for="deal-vehicle">Транспорт</label>
            <input id="deal-vehicle" name="vehicle" value="${esc(deal ? deal.vehicle : '')}" placeholder="${getLang() === 'en' ? 'Volvo FH, ABC 123' : 'Volvo FH, А123ВС 77'}">
          </div>
        </div>
        <div class="form-row">
          <div class="field">
            <label for="deal-contractor">Субподрядчик</label>
            <select id="deal-contractor" name="contractor_id">
              <option value="">Своими силами</option>
              ${contractors
                .filter((c) => c.active !== false || (deal && Number(deal.contractor_id) === c.id))
                .map((c) => option(c.id, c.name + (c.rate ? ` · ${fmtMoney(c.rate)}` : ''), deal ? deal.contractor_id : '')).join('')}
            </select>
            <p class="field-hint">Перевозчик, которому отдаём рейс. Его ставка идёт в расходы.</p>
          </div>
          <div class="field">
            <label for="deal-contractor-cost">Стоимость подряда, ₽</label>
            <input id="deal-contractor-cost" name="contractor_cost" type="number" min="0" step="any" inputmode="decimal"
                   value="${deal && deal.contractor_cost ? deal.contractor_cost : ''}" placeholder="0">
          </div>
        </div>
        <div class="form-row">
          <div class="field">
            <label for="deal-payment-due">Срок оплаты клиентом</label>
            <input id="deal-payment-due" name="payment_due" type="date" value="${esc(deal && deal.payment_due ? deal.payment_due : '')}">
          </div>
        </div>
        <div class="field">
          <label for="deal-notes">Заметки</label>
          <textarea id="deal-notes" name="notes" placeholder="Адреса, температурный режим, договорённости">${esc(deal ? deal.notes : '')}</textarea>
        </div>
      </form>
      ${isEdit
        ? `<div class="print-links">
             <span class="print-links-label">${icon('note', 15)} Документы</span>
             <button type="button" class="btn btn-sm" data-print="contract">Договор</button>
             <button type="button" class="btn btn-sm" data-print="invoice">Счёт</button>
             <button type="button" class="btn btn-sm" data-print="act">Акт</button>
             <button type="button" class="btn btn-sm" data-print="waybill">Путевой лист</button>
           </div>
           <div class="payment-host" data-payment-host></div>
           <div class="finance-host" data-finance-host></div>
           <div class="trip-host" data-trip-host></div><div class="doc-host" data-doc-host></div>`
        : `<div class="doc-note">${icon('note', 15)}<span>Фото договора, путевого листа и других документов можно прикрепить сразу после сохранения перевозки.</span></div>`}`,
    footer: `${isEdit ? `<button type="button" class="btn btn-danger btn-sm" data-delete>${icon('trash', 14)} Удалить</button>
        <button type="button" class="btn btn-sm" data-duplicate>${icon('copy', 14)} Повторить рейс</button>` : ''}
      <span class="spacer"></span>
      <button type="button" class="btn" data-cancel>Отмена</button>
      <button type="submit" class="btn btn-primary" data-save>${isEdit ? 'Сохранить' : 'Создать перевозку'}</button>`,
  });

  const form = drawer.body.querySelector('form');
  wireFooter(drawer, form);

  const contractorEl = form.querySelector('[name="contractor_id"]');
  const contractorCostEl = form.querySelector('[name="contractor_cost"]');
  if (contractorEl && contractorCostEl) {
    contractorEl.addEventListener('change', () => {
      const picked = contractors.find((c) => String(c.id) === contractorEl.value);
      if (picked && picked.rate && !Number(contractorCostEl.value || 0)) {
        contractorCostEl.value = picked.rate;
      }
    });
  }

  if (isEdit) {
    mountDealPayments(drawer.body.querySelector('[data-payment-host]'), deal);
    mountDealFinance(drawer.body.querySelector('[data-finance-host]'), deal);
    mountDealTrip(drawer.body.querySelector('[data-trip-host]'), deal);
    mountDealFiles(drawer.body.querySelector('[data-doc-host]'), deal);
    drawer.body.querySelectorAll('[data-print]').forEach((button) => {
      button.addEventListener('click', () => {
        window.open(`/api/print/${button.dataset.print}/${deal.id}`, '_blank', 'noopener');
      });
    });
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = formValues(form);
    const payload = {
      client_id: Number(values.client_id),
      route_from: values.route_from,
      route_to: values.route_to,
      cargo: values.cargo,
      transport_type: values.transport_type,
      weight: Number(values.weight || 0),
      volume: Number(values.volume || 0),
      distance_km: Number(values.distance_km || 0),
      pickup_date: values.pickup_date || '',
      close_date: values.close_date || '',
      amount: Number(values.amount || 0),
      stage: values.stage,
      driver_id: values.driver_id ? Number(values.driver_id) : null,
      vehicle: values.vehicle,
      notes: values.notes,
      payment_due: values.payment_due || '',
      contractor_id: values.contractor_id ? Number(values.contractor_id) : null,
      contractor_cost: Number(values.contractor_cost || 0),
      owner_id: values.owner_id ? Number(values.owner_id) : undefined,
    };
    submit(form, drawer.backdrop.querySelector('[data-save]'), async () => {
      if (isEdit) await api.patch('/deals/' + deal.id, payload);
      else await api.post('/deals', payload);
      closeDrawer();
      toast(isEdit ? 'Перевозка обновлена' : 'Перевозка создана', 'success');
      refresh();
      if (opts.onSaved) opts.onSaved();
    });
  });

  const del = drawer.backdrop.querySelector('[data-delete]');
  if (del) {
    del.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Удалить перевозку?',
        message: `Перевозка «${deal.title}» будет удалена без возможности восстановления.`,
      });
      if (!ok) return;
      try {
        await api.del('/deals/' + deal.id);
        closeDrawer();
        toast('Перевозка удалена', 'success');
        refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  const duplicate = drawer.backdrop.querySelector('[data-duplicate]');
  if (duplicate) {
    duplicate.addEventListener('click', async () => {
      duplicate.disabled = true;
      try {
        const data = await api.post('/deals/' + deal.id + '/duplicate');
        closeDrawer();
        toast(`Создан повтор рейса №${data.deal.id}`, 'success');
        refresh();
        if (opts.onDuplicated) opts.onDuplicated(data.deal);
      } catch (err) {
        duplicate.disabled = false;
        toast(err.message, 'error');
      }
    });
  }
}

function tripStep(label, at, done, active) {
  return `<div class="trip-step ${done ? 'done' : ''} ${active ? 'active' : ''}">
    <span class="trip-step-dot">${done ? icon('check', 12) : ''}</span>
    <span class="trip-step-label">${esc(label)}</span>
    <span class="trip-step-time">${at ? fmtDateTime(at) : (active ? 'следующий шаг' : '—')}</span>
  </div>`;
}

function tripProgress(deal) {
  const delivered = Boolean(deal.delivered_at);
  return `<div class="trip-steps">
    ${tripStep('Погрузка', deal.loaded_at, Boolean(deal.loaded_at || delivered), !deal.loaded_at && !delivered)}
    ${tripStep('Выезд', deal.departed_at, Boolean(deal.departed_at || delivered), Boolean(deal.loaded_at) && !deal.departed_at && !delivered)}
    ${tripStep('Выгрузка', deal.delivered_at, delivered, Boolean(deal.departed_at) && !delivered)}
  </div>`;
}

function nextTripAction(deal) {
  if (deal.delivered_at || deal.stage === 'won') return null;
  if (deal.stage === 'lost') return null;
  if (!deal.loaded_at) return { action: 'loaded', label: 'Отметить погрузку', hint: 'Зафиксируем время загрузки' };
  if (!deal.departed_at) return { action: 'departed', label: 'Отметить выезд', hint: 'Машина выехала с погрузки' };
  return { action: 'delivered', label: 'Отметить выгрузку', hint: 'Завершим рейс и передадим факт в офис' };
}

export async function openDriverTrip(initialDeal) {
  let deal;
  try {
    deal = (await api.get('/deals/' + initialDeal.id)).deal;
  } catch (err) {
    toast(err.message, 'error');
    return;
  }
  const stage = stageMeta(deal.stage);
  const transport = TRANSPORT_TYPES.find((item) => item.id === deal.transport_type);
  const next = nextTripAction(deal);
  const drawer = openDrawer({
    title: deal.title,
    subtitle: 'Рейс · маршрут, отметки, факт и документы',
    body: `
      <div class="trip-drawer-head">
        <span class="chip stage-${deal.stage}"><span class="dot"></span>${esc(stage.title)}</span>
        ${deal.close_date ? `<span class="trip-drawer-date">${icon('calendar', 14)} доставка ${fmtDate(deal.close_date, true)}</span>` : ''}
      </div>
      ${tripProgress(deal)}
      <div class="info-grid">
        <div><div class="info-label">Клиент</div><div class="info-value">${esc(deal.client_name || '—')}</div></div>
        <div><div class="info-label">Транспорт</div><div class="info-value">${esc(deal.vehicle || (transport ? transport.title : '—'))}</div></div>
        <div><div class="info-label">Погрузка</div><div class="info-value">${deal.pickup_date ? fmtDate(deal.pickup_date, true) : '—'}</div></div>
        <div><div class="info-label">Доставка</div><div class="info-value">${deal.close_date ? fmtDate(deal.close_date, true) : '—'}</div></div>
        <div><div class="info-label">Вес</div><div class="info-value">${deal.weight ? fmtQty(deal.weight) + ' т' : '—'}</div></div>
        <div><div class="info-label">Объём</div><div class="info-value">${deal.volume ? fmtQty(deal.volume) + ' м³' : '—'}</div></div>
        <div class="info-full"><div class="info-label">Груз</div><div class="info-value">${esc(deal.cargo || '—')}</div></div>
        ${deal.notes ? `<div class="info-full"><div class="info-label">Заметки</div><div class="info-value" data-raw>${esc(deal.notes)}</div></div>` : ''}
      </div>

      <section class="trip-fact">
        <div class="repair-block-head">
          <h3>Факт по рейсу</h3>
          ${deal.delivered_at ? `<span class="chip repair-status-done">${icon('check', 12)} доставлено</span>` : ''}
        </div>
        <form class="form trip-fact-form" id="trip-fact-form" novalidate>
          <div class="form-error"></div>
          <div class="form-row">
            <div class="field">
              <label for="trip-mileage">Фактический пробег, км</label>
              <input id="trip-mileage" name="actual_mileage" type="number" min="0" step="1" inputmode="numeric"
                     value="${deal.actual_mileage ? deal.actual_mileage : ''}" placeholder="0">
            </div>
            <div class="field">
              <label for="trip-fuel">Топливо, л</label>
              <input id="trip-fuel" name="fuel_used" type="number" min="0" step="0.1" inputmode="decimal"
                     value="${deal.fuel_used ? deal.fuel_used : ''}" placeholder="0">
            </div>
          </div>
          <div class="field">
            <label for="trip-report">Что важно знать офису</label>
            <textarea id="trip-report" name="trip_report" maxlength="4000"
                      placeholder="Задержки, состояние груза, фактическое время выгрузки">${esc(deal.trip_report || '')}</textarea>
          </div>
          <div class="trip-fact-actions">
            <button class="btn btn-sm" type="submit" data-save-facts>${icon('check', 14)} Сохранить факт</button>
          </div>
        </form>
      </section>

      <section class="repair-block">
        <div class="repair-block-head"><h3>Комментарии к рейсу</h3><span class="doc-count">${deal.comments.length}</span></div>
        <div class="thread-list" data-thread-list>${commentsList(deal.comments)}</div>
        ${commentFormHtml('Например, прибыл на выгрузку, жду оформления')}
      </section>

      <div class="doc-host" data-doc-host></div>
    `,
    footer: `${next ? `<button type="button" class="btn btn-primary" data-trip-action="${next.action}">${icon('check', 15)} ${esc(next.label)}</button>` : ''}
      <button type="button" class="btn" data-report-repair>${icon('repair', 15)} Неисправность</button>
      <span class="spacer"></span><button type="button" class="btn" data-close>Закрыть</button>`,
  });

  drawer.backdrop.querySelector('[data-close]').addEventListener('click', closeDrawer);
  drawer.backdrop.querySelector('[data-report-repair]').addEventListener('click', () => {
    openRepairForm({ vehicleText: deal.vehicle });
  });
  mountDealFiles(drawer.body.querySelector('[data-doc-host]'), deal, { uploadOnly: true });

  const actionButton = drawer.backdrop.querySelector('[data-trip-action]');
  if (actionButton) {
    actionButton.addEventListener('click', async () => {
      const titles = {
        loaded: ['Отметить погрузку?', 'Зафиксируем время погрузки и переведём рейс в статус «В пути».'],
        departed: ['Отметить выезд?', 'Машина выехала с погрузки. Теперь можно отметить выгрузку.'],
        delivered: ['Завершить рейс?', 'Отметим выгрузку, рейс перейдёт в «Доставлено», а факт увидит офис.'],
      };
      const [title, message] = titles[actionButton.dataset.tripAction];
      const ok = await confirmDialog({ title, message, confirmText: 'Отметить', danger: false });
      if (!ok) return;
      actionButton.disabled = true;
      try {
        const data = await api.patch('/deals/' + deal.id + '/trip', { action: actionButton.dataset.tripAction });
        toast('Отметка сохранена', 'success');
        refresh();
        closeDrawer();
        openDriverTrip(data.deal);
      } catch (err) {
        actionButton.disabled = false;
        toast(err.message, 'error');
      }
    });
  }

  const factForm = drawer.body.querySelector('#trip-fact-form');
  factForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = formValues(factForm);
    const button = factForm.querySelector('[data-save-facts]');
    button.disabled = true;
    try {
      const data = await api.patch('/deals/' + deal.id + '/trip', {
        actual_mileage: Number(values.actual_mileage || 0),
        fuel_used: Number(values.fuel_used || 0),
        trip_report: values.trip_report,
      });
      deal = data.deal;
      toast('Факт по рейсу сохранён', 'success');
      refresh();
    } catch (err) {
      showFormError(factForm, err.message);
    } finally {
      button.disabled = false;
    }
  });

  const threadList = drawer.body.querySelector('[data-thread-list]');
  const commentForm = drawer.body.querySelector('[data-comment-form]');
  commentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = commentForm.elements.text.value.trim();
    if (!text) return;
    const button = commentForm.querySelector('button');
    button.disabled = true;
    try {
      const data = await api.post('/deals/' + deal.id + '/comments', { text });
      deal.comments.push(data.comment);
      threadList.innerHTML = commentsList(deal.comments);
      const count = threadList.closest('.repair-block')?.querySelector('.doc-count');
      if (count) count.textContent = deal.comments.length;
      commentForm.reset();
      toast('Комментарий добавлен', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      button.disabled = false;
    }
  });
}

/* ------------------------------------------------------------- repairs */

function findVehicle(vehicles, text) {
  const target = String(text || '').trim().toLowerCase();
  if (!target) return null;
  return vehicles.find((vehicle) => {
    const label = vehicleText(vehicle).trim().toLowerCase();
    const plate = String(vehicle.plate || '').trim().toLowerCase();
    const name = String(vehicle.name || '').trim().toLowerCase();
    return label === target || (plate && target.includes(plate)) || (!plate && name === target);
  }) || null;
}

export async function openRepairForm(opts = {}) {
  let vehicles = [];
  try {
    vehicles = (await api.get('/vehicles')).vehicles || [];
  } catch (err) {
    toast(err.message, 'error');
    return;
  }

  if (!vehicles.length) {
    const drawer = openDrawer({
      title: 'Заявка на ремонт',
      subtitle: 'В автопарке пока нет машин',
      body: `<div class="notice">${icon('alert', 16)}<div>Обратитесь в офис: в автопарке ещё нет машин, поэтому заявку на ремонт сейчас создать нельзя.</div></div>`,
      footer: '<span class="spacer"></span><button type="button" class="btn" data-close>Закрыть</button>',
    });
    drawer.backdrop.querySelector('[data-close]').addEventListener('click', closeDrawer);
    return;
  }

  const selected = opts.vehicleText
    ? findVehicle(vehicles, opts.vehicleText)
    : vehicles.find((vehicle) => vehicle.driver_id === state.user.id) || null;
  const drawer = openDrawer({
    title: 'Заявка на ремонт',
    subtitle: 'Механик увидит обращение и возьмёт машину в работу',
    body: `
      <form id="repair-form" class="form" novalidate>
        <div class="form-error"></div>
        <div class="field">
          <label for="repair-vehicle">Машина</label>
          <select id="repair-vehicle" name="vehicle_id" required>
            ${vehicles.map((vehicle) => option(
              vehicle.id,
              vehicleText(vehicle),
              selected ? selected.id : vehicles[0].id,
            )).join('')}
          </select>
        </div>
        <div class="field">
          <label for="repair-title">Что случилось</label>
          <input id="repair-title" name="title" placeholder="Стук в подвеске, не работает реф…" maxlength="200" required>
        </div>
        <div class="field">
          <label for="repair-urgency">Срочность</label>
          <select id="repair-urgency" name="urgency">
            ${Object.entries(REPAIR_URGENCIES).map(([id, title]) => option(id, title, 'normal')).join('')}
          </select>
        </div>
        <div class="field">
          <label for="repair-description">Подробности</label>
          <textarea id="repair-description" name="description" maxlength="2000"
                    placeholder="Когда появилась неисправность, что уже проверили, можно ли ехать"></textarea>
        </div>
        <div class="field">
          <label>Фото неисправности</label>
          <label class="photo-pick">
            <input type="file" accept="image/*" multiple hidden data-repair-photos>
            ${icon('camera', 16)}<span>Прикрепить фото</span>
          </label>
          <p class="field-hint" data-photo-count>Можно приложить до 5 фото — механику будет проще оценить поломку.</p>
        </div>
      </form>`,
    footer: footer(false, 'Отправить механику'),
  });

  const form = drawer.body.querySelector('form');
  wireFooter(drawer, form);
  const photoInput = form.querySelector('[data-repair-photos]');
  photoInput.addEventListener('change', () => {
    const count = photoInput.files.length;
    form.querySelector('[data-photo-count]').textContent = count
      ? `Выбрано ${count} ${plural(count, 'фото', 'фото', 'фото')}`
      : 'Можно приложить до 5 фото — механику будет проще оценить поломку.';
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = formValues(form);
    const photos = [...photoInput.files].slice(0, 5);
    const payload = {
      vehicle_id: Number(values.vehicle_id),
      title: values.title,
      urgency: values.urgency,
      description: values.description,
    };
    submit(form, drawer.backdrop.querySelector('[data-save]'), async () => {
      const data = await api.post('/repairs', payload);
      const repairId = data.repair && data.repair.id;
      let uploaded = 0;
      if (repairId && photos.length) uploaded = await uploadRepairPhotos(repairId, photos);
      closeDrawer();
      toast(uploaded
        ? `Заявка отправлена механику · фото: ${uploaded}`
        : 'Заявка на ремонт отправлена механику', 'success');
      refresh();
    });
  });
}

function photoGrid(photos) {
  if (!photos || !photos.length) {
    return `<div class="repair-photo-empty">${icon('camera', 18)}<span>Фото неисправности пока нет.</span></div>`;
  }
  return `<div class="repair-photo-grid">${photos.map((photo) => `
    <a class="repair-photo" href="${esc(photo.url)}" target="_blank" rel="noopener" title="${esc(photo.filename)}">
      <img src="${esc(photo.url)}" alt="${esc(photo.filename)}" loading="lazy">
      <span>${photo.uploader_name ? esc(photo.uploader_name) : ''} · ${fmtDate(photo.created_at)}</span>
    </a>`).join('')}</div>`;
}

function commentsList(comments) {
  if (!comments || !comments.length) {
    return `<div class="thread-empty">Пока нет комментариев — напишите первым.</div>`;
  }
  return comments.map((comment) => `
    <article class="thread-comment">
      <div class="thread-head">
        ${avatar(comment.author_name || 'Пользователь', 'sm')}
        <span class="thread-author">${esc(comment.author_name || 'Пользователь')}</span>
        <span class="thread-time">${fmtDateTime(comment.created_at)}</span>
      </div>
      <p data-raw>${esc(comment.text).replace(/\n/g, '<br>')}</p>
    </article>`).join('');
}

function commentFormHtml(placeholder = 'Комментарий или уточнение по заявке') {
  return `<form class="thread-form" data-comment-form>
    <textarea name="text" rows="2" maxlength="2000" placeholder="${esc(placeholder)}" required></textarea>
    <button class="btn btn-sm" type="submit">${icon('arrow', 14)} Отправить</button>
  </form>`;
}

export async function openRepairReview(repair, opts = {}) {
  let detail = repair;
  try {
    detail = (await api.get('/repairs/' + repair.id)).repair;
  } catch (err) {
    toast(err.message, 'error');
    return;
  }
  const isDriver = state.user.role === 'driver' || opts.readonly;
  const drawer = openDrawer({
    title: detail.title,
    subtitle: `${detail.vehicle_label} · ${fmtDate(detail.created_at, true)}`,
    body: `
      <div class="repair-review-tags">
        <span class="chip repair-status-${detail.status}">${REPAIR_STATUSES[detail.status] || 'Новая'}</span>
        <span class="chip pr-${detail.urgency}">${REPAIR_URGENCIES[detail.urgency] || 'Обычная'}</span>
        ${detail.photos.length ? `<span class="chip repair-photo-chip">${icon('camera', 12)} ${detail.photos.length}</span>` : ''}
      </div>
      <div class="info-grid">
        <div><div class="info-label">Водитель</div><div class="info-value">${esc(detail.driver_name || '—')}</div></div>
        <div><div class="info-label">Отправлена</div><div class="info-value">${fmtDate(detail.created_at, true)}</div></div>
        <div><div class="info-label">Механик</div><div class="info-value">${esc(detail.mechanic_name || '—')}</div></div>
        <div><div class="info-label">Закрыта</div><div class="info-value">${detail.closed_at ? fmtDate(detail.closed_at, true) : '—'}</div></div>
        ${detail.description ? `<div class="info-full"><div class="info-label">Описание</div><div class="info-value" data-raw>${esc(detail.description)}</div></div>` : ''}
        ${detail.planned_date ? `<div><div class="info-label">Плановая дата</div><div class="info-value">${fmtDate(detail.planned_date, true)}</div></div>` : ''}
        ${detail.parts ? `<div><div class="info-label">Запчасти</div><div class="info-value" data-raw>${esc(detail.parts)}</div></div>` : ''}
        ${!isDriver && detail.cost ? `<div><div class="info-label">Стоимость</div><div class="info-value">${fmtMoney(detail.cost)}</div></div>` : ''}
      </div>

      <section class="repair-block">
        <div class="repair-block-head">
          <h3>Фото неисправности</h3>
          <label class="photo-pick photo-pick-sm">
            <input type="file" accept="image/*" multiple hidden data-photo-upload>
            ${icon('camera', 14)}<span>Добавить</span>
          </label>
        </div>
        <div data-photo-host>${photoGrid(detail.photos)}</div>
      </section>

      ${isDriver ? '' : `<form id="repair-review-form" class="form" novalidate>
        <div class="form-error"></div>
        <div class="form-row">
          <div class="field">
            <label for="repair-status">Статус заявки</label>
            <select id="repair-status" name="status">
              ${Object.entries(REPAIR_STATUSES).map(([id, title]) => option(id, title, detail.status)).join('')}
            </select>
          </div>
          <div class="field">
            <label for="repair-planned">Плановая дата</label>
            <input id="repair-planned" name="planned_date" type="date" value="${esc(detail.planned_date || '')}">
          </div>
        </div>
        <div class="form-row">
          <div class="field">
            <label for="repair-parts">Запчасти</label>
            <input id="repair-parts" name="parts" maxlength="500" value="${esc(detail.parts || '')}" placeholder="Что нужно заменить">
          </div>
          <div class="field">
            <label for="repair-cost">Стоимость, ₽</label>
            <input id="repair-cost" name="cost" type="number" min="0" step="any" inputmode="decimal"
                   value="${detail.cost ? detail.cost : ''}" placeholder="0">
          </div>
        </div>
        <div class="field">
          <label for="repair-resolution">Что сделано</label>
          <textarea id="repair-resolution" name="resolution" maxlength="2000"
                    placeholder="Осмотр, ремонт, какие детали заменили">${esc(detail.resolution || '')}</textarea>
        </div>
      </form>`}

      <section class="repair-block">
        <div class="repair-block-head"><h3>Комментарии</h3><span class="doc-count">${detail.comments.length}</span></div>
        <div class="thread-list" data-thread-list>${commentsList(detail.comments)}</div>
        ${commentFormHtml()}
      </section>
    `,
    footer: isDriver
      ? '<span class="spacer"></span><button type="button" class="btn" data-close>Закрыть</button>'
      : footer(false, 'Сохранить'),
  });

  const photoInput = drawer.body.querySelector('[data-photo-upload]');
  photoInput.addEventListener('change', async () => {
    const files = [...photoInput.files].slice(0, 5);
    photoInput.value = '';
    if (!files.length) return;
    const host = drawer.body.querySelector('[data-photo-host]');
    host.classList.add('busy');
    const done = await uploadRepairPhotos(detail.id, files);
    try {
      detail = (await api.get('/repairs/' + detail.id)).repair;
      host.innerHTML = photoGrid(detail.photos);
      drawer.body.querySelector('.repair-photo-chip')?.remove();
    } catch (err) {
      toast(err.message, 'error');
    }
    host.classList.remove('busy');
    if (done) {
      toast(done === 1 ? 'Фото добавлено' : `Добавлено фото: ${done}`, 'success');
      refresh();
    }
  });

  const threadList = drawer.body.querySelector('[data-thread-list]');
  const commentForm = drawer.body.querySelector('[data-comment-form]');
  commentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = commentForm.elements.text.value.trim();
    if (!text) return;
    const button = commentForm.querySelector('button');
    button.disabled = true;
    try {
      const data = await api.post('/repairs/' + detail.id + '/comments', { text });
      detail.comments.push(data.comment);
      threadList.innerHTML = commentsList(detail.comments);
      const count = threadList.closest('.repair-block')?.querySelector('.doc-count');
      if (count) count.textContent = detail.comments.length;
      commentForm.reset();
      toast('Комментарий добавлен', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  if (isDriver) {
    drawer.backdrop.querySelector('[data-close]').addEventListener('click', closeDrawer);
    return;
  }

  const form = drawer.body.querySelector('#repair-review-form');
  wireFooter(drawer, form);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = formValues(form);
    submit(form, drawer.backdrop.querySelector('[data-save]'), async () => {
      await api.patch('/repairs/' + detail.id, {
        status: values.status,
        resolution: values.resolution,
        planned_date: values.planned_date || '',
        parts: values.parts,
        cost: Number(values.cost || 0),
      });
      closeDrawer();
      toast('Заявка на ремонт обновлена', 'success');
      refresh();
    });
  });
}

/* ------------------------------------------------------------- fleet */

function historyItem(repair) {
  return `<article class="history-item" data-history-repair="${repair.id}" tabindex="0" role="button"
                   aria-label="Открыть заявку ${esc(repair.title)}">
    <div class="history-item-top">
      ${repairStatusChip(repair.status)}
      <span class="history-date">${icon('calendar', 12)} ${fmtDate(repair.closed_at || repair.created_at, true)}</span>
      ${repair.cost ? `<span class="history-cost">${fmtMoney(repair.cost)}</span>` : ''}
    </div>
    <h4>${esc(repair.title)}</h4>
    ${repair.parts ? `<p class="history-parts">${icon('wrench', 13)} ${esc(repair.parts)}</p>` : ''}
    ${repair.resolution ? `<p class="history-resolution" data-raw>${icon('check', 13)} ${esc(repair.resolution)}</p>` : ''}
    <div class="history-meta">
      ${repair.mechanic_name ? `<span>${esc(repair.mechanic_name)}</span>` : ''}
      ${repair.planned_date ? `<span>план ${fmtDate(repair.planned_date, true)}</span>` : ''}
    </div>
  </article>`;
}

export async function openVehicleDetail(vehicleId) {
  let vehicle;
  try {
    vehicle = (await api.get('/vehicles/' + vehicleId)).vehicle;
  } catch (err) {
    toast(err.message, 'error');
    return;
  }
  const serviceLabels = { overdue: 'ТО просрочено', soon: 'Скоро ТО', ok: 'ТО по плану', none: 'ТО не запланировано' };
  const drawer = openDrawer({
    title: vehicle.name,
    subtitle: `${vehicle.plate || 'без номера'}${vehicle.kind ? ' · ' + vehicle.kind : ''}`,
    body: `
      <div class="vehicle-detail-head">
        <span class="chip service-${vehicle.service_state}">${icon('gauge', 13)} ${serviceLabels[vehicle.service_state] || ''}</span>
        ${vehicle.summary.repairs_open ? `<span class="chip repair-open">${vehicle.summary.repairs_open} ${plural(vehicle.summary.repairs_open, 'открытая заявка', 'открытые заявки', 'открытых заявок')}</span>` : ''}
        <span class="chip fleet-kind">${vehicle.year || '—'} г.</span>
      </div>
      <div class="info-grid">
        <div><div class="info-label">Водитель</div><div class="info-value">${esc(vehicle.driver_name || 'не закреплён')}</div></div>
        <div><div class="info-label">Пробег</div><div class="info-value">${fmtQty(vehicle.mileage)} км</div></div>
        <div><div class="info-label">Интервал ТО</div><div class="info-value">каждые ${fmtQty(vehicle.service_interval)} км</div></div>
        <div><div class="info-label">Следующее ТО</div><div class="info-value">${vehicle.next_service ? fmtDate(vehicle.next_service, true) : '—'}</div></div>
        <div><div class="info-label">Страховка до</div><div class="info-value">${vehicle.insurance_until ? fmtDate(vehicle.insurance_until, true) : '—'}</div></div>
        <div><div class="info-label">Техосмотр до</div><div class="info-value">${vehicle.inspection_until ? fmtDate(vehicle.inspection_until, true) : '—'}</div></div>
        <div class="info-full"><div class="info-label">VIN</div><div class="info-value mono">${esc(vehicle.vin || '—')}</div></div>
        ${vehicle.notes ? `<div class="info-full"><div class="info-label">Заметки</div><div class="info-value" data-raw>${esc(vehicle.notes)}</div></div>` : ''}
      </div>

      <div class="vehicle-summary">
        <div><span>Ремонтов</span><b>${vehicle.summary.repairs_total}</b></div>
        <div><span>В работе</span><b>${vehicle.summary.repairs_open}</b></div>
        <div><span>Расходы на ремонт</span><b>${fmtMoney(vehicle.summary.cost_total)}</b></div>
      </div>

      <section class="vehicle-history">
        <div class="repair-block-head">
          <h3>История обслуживания</h3>
          <span class="doc-count">${vehicle.history.length}</span>
        </div>
        ${vehicle.history.length
          ? `<div class="history-list">${vehicle.history.map(historyItem).join('')}</div>`
          : `<div class="repair-photo-empty">${icon('repair', 18)}<span>Ремонтов и замен ещё не было.</span></div>`}
      </section>
    `,
    footer: `<button type="button" class="btn" data-close>Закрыть</button><span class="spacer"></span>
      <button type="button" class="btn btn-primary" data-edit-vehicle>${icon('edit', 15)} Редактировать</button>`,
  });
  drawer.backdrop.querySelector('[data-close]').addEventListener('click', closeDrawer);
  drawer.backdrop.querySelector('[data-edit-vehicle]').addEventListener('click', () => {
    openVehicleForm(vehicle, { onSaved: () => openVehicleDetail(vehicle.id) });
  });
  drawer.body.querySelectorAll('[data-history-repair]').forEach((card) => {
    const openRepair = () => {
      const repair = vehicle.history.find((item) => String(item.id) === card.dataset.historyRepair);
      if (repair) openRepairReview(repair);
    };
    card.addEventListener('click', openRepair);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openRepair();
      }
    });
  });
}

export async function openVehicleForm(vehicle = null, opts = {}) {
  const isEdit = Boolean(vehicle && vehicle.id);
  let drivers = [];
  try {
    drivers = (await api.get('/drivers')).drivers || [];
  } catch (err) {
    toast(err.message, 'error');
    return;
  }
  const value = (key, fallback = '') => esc(vehicle && vehicle[key] !== undefined && vehicle[key] !== null ? vehicle[key] : fallback);
  const drawer = openDrawer({
    title: isEdit ? 'Карточка машины' : 'Новая машина',
    subtitle: isEdit ? `${vehicle.plate || 'без номера'} · пробег ${fmtQty(vehicle.mileage)} км` : 'Основные данные, обслуживание и документы',
    body: `
      <form id="vehicle-form" class="form" novalidate>
        <div class="form-error"></div>
        <div class="form-row">
          <div class="field">
            <label for="vehicle-name">Марка и модель</label>
            <input id="vehicle-name" name="name" maxlength="120" value="${value('name')}" placeholder="Volvo FH" required>
          </div>
          <div class="field">
            <label for="vehicle-plate">Госномер</label>
            <input id="vehicle-plate" name="plate" maxlength="40" value="${value('plate')}" placeholder="${getLang() === 'en' ? 'ABC 123' : 'А123ВС 77'}">
          </div>
        </div>
        <div class="form-row">
          <div class="field">
            <label for="vehicle-kind">Тип</label>
            <input id="vehicle-kind" name="kind" maxlength="80" value="${value('kind')}" placeholder="Тягач, рефрижератор…">
          </div>
          <div class="field">
            <label for="vehicle-year">Год выпуска</label>
            <input id="vehicle-year" name="year" type="number" min="0" max="2100" inputmode="numeric"
                   value="${vehicle && vehicle.year ? vehicle.year : ''}" placeholder="2023">
          </div>
        </div>
        <div class="field">
          <label for="vehicle-vin">VIN</label>
          <input id="vehicle-vin" name="vin" maxlength="40" value="${value('vin')}" placeholder="${getLang() === 'en' ? '17 characters' : '17 символов'}">
        </div>
        <div class="form-row">
          <div class="field">
            <label for="vehicle-mileage">Пробег, км</label>
            <input id="vehicle-mileage" name="mileage" type="number" min="0" step="any" inputmode="numeric"
                   value="${vehicle && vehicle.mileage ? vehicle.mileage : ''}" placeholder="0">
          </div>
          <div class="field">
            <label for="vehicle-interval">Интервал ТО, км</label>
            <input id="vehicle-interval" name="service_interval" type="number" min="1000" step="any" inputmode="numeric"
                   value="${vehicle && vehicle.service_interval ? vehicle.service_interval : 15000}">
          </div>
        </div>
        <div class="form-row">
          <div class="field">
            <label for="vehicle-service">Следующее ТО</label>
            <input id="vehicle-service" name="next_service" type="date" value="${value('next_service')}">
          </div>
          <div class="field">
            <label for="vehicle-driver">Закреплённый водитель</label>
            <select id="vehicle-driver" name="driver_id">
              <option value="">Не закреплён</option>
              ${drivers.map((driver) => option(driver.id, driver.name, vehicle ? vehicle.driver_id : '')).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="field">
            <label for="vehicle-insurance">Страховка до</label>
            <input id="vehicle-insurance" name="insurance_until" type="date" value="${value('insurance_until')}">
          </div>
          <div class="field">
            <label for="vehicle-inspection">Техосмотр до</label>
            <input id="vehicle-inspection" name="inspection_until" type="date" value="${value('inspection_until')}">
          </div>
        </div>
        <div class="field">
          <label for="vehicle-notes">Заметки</label>
          <textarea id="vehicle-notes" name="notes" maxlength="2000"
                    placeholder="Особенности машины, температурный режим, документы">${value('notes')}</textarea>
        </div>
      </form>`,
    footer: footer(isEdit, isEdit ? 'Сохранить' : 'Добавить машину'),
  });

  const form = drawer.body.querySelector('form');
  wireFooter(drawer, form, isEdit ? async () => {
    const ok = await confirmDialog({
      title: 'Удалить машину?',
      message: `«${vehicleText(vehicle)}» будет удалена из автопарка. Машины с историей ремонтов удалить нельзя.`,
    });
    if (!ok) return;
    try {
      await api.del('/vehicles/' + vehicle.id);
      closeDrawer();
      toast('Машина удалена из автопарка', 'success');
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  } : null);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = formValues(form);
    const payload = {
      name: values.name,
      plate: values.plate,
      kind: values.kind,
      vin: values.vin,
      year: Number(values.year || 0),
      mileage: Number(values.mileage || 0),
      service_interval: Number(values.service_interval || 15000),
      next_service: values.next_service || '',
      insurance_until: values.insurance_until || '',
      inspection_until: values.inspection_until || '',
      driver_id: values.driver_id ? Number(values.driver_id) : null,
      notes: values.notes,
    };
    submit(form, drawer.backdrop.querySelector('[data-save]'), async () => {
      if (isEdit) await api.patch('/vehicles/' + vehicle.id, payload);
      else await api.post('/vehicles', payload);
      closeDrawer();
      toast(isEdit ? 'Карточка машины обновлена' : 'Машина добавлена в автопарк', 'success');
      refresh();
      if (opts.onSaved) opts.onSaved();
    });
  });
}

/* ------------------------------------------------------------- client */

/* ------------------------------------------------------------- transport request */

const REQUEST_STATUS_OPTIONS = [
  { id: 'new', title: 'Новая' },
  { id: 'calculating', title: 'Расчёт' },
  { id: 'sent', title: 'Отправлено' },
  { id: 'accepted', title: 'Принято' },
  { id: 'rejected', title: 'Отклонено' },
];

export async function openRequestForm(request = null, opts = {}) {
  const isEdit = Boolean(request);
  let clients = [];
  let team = [];
  try {
    const [clientsData] = await Promise.all([api.get('/clients'), loadTeam()]);
    clients = clientsData.clients;
    team = state.team;
  } catch (err) {
    toast(err.message, 'error');
    return;
  }

  const owners = team.filter((member) => !isFieldRole(member.role));
  const selectedOwner = teamWithFallback(owners, request ? request.owner_id : state.user.id,
    request ? request.owner_name : state.user.name);
  const ownerField = state.user.role === 'manager'
    ? ''
    : `<div class="field"><label>Ответственный</label><select name="owner_id">
         ${selectedOwner.map((member) => option(member.id, member.name, request ? request.owner_id : state.user.id)).join('')}
       </select></div>`;
  const converted = Boolean(request && (request.status === 'converted' || request.deal_id));
  const statusField = converted
    ? `<div class="field"><label>Статус</label><input value="В рейсе #${request.deal_id}" disabled></div>`
    : `<div class="field"><label for="request-status">Статус</label><select id="request-status" name="status">
         ${REQUEST_STATUS_OPTIONS.map((status) => option(status.id, status.title, request ? request.status : 'new')).join('')}
       </select></div>`;

  const drawer = openDrawer({
    title: isEdit ? 'Заявка на перевозку' : 'Новая заявка',
    subtitle: isEdit
      ? `${request.route_from} → ${request.route_to} · обновлено ${fmtDate(request.updated_at)}`
      : 'Маршрут, расстояние и расчёт ставки',
    body: `
      <form id="request-form" class="form" novalidate>
        <div class="form-error"></div>
        <div class="field">
          <label for="request-client">Клиент</label>
          <select id="request-client" name="client_id">
            <option value="">Не выбран — уточним позже</option>
            ${clients.map((client) => option(client.id, client.name, request ? request.client_id : '')).join('')}
          </select>
          <p class="field-hint">Для преобразования заявки в рейс клиент обязателен.</p>
        </div>
        <div class="form-row">
          <div class="field">
            <label for="request-from">Откуда</label>
            <input id="request-from" name="route_from" value="${esc(request ? request.route_from : '')}" placeholder="${getLang() === 'en' ? 'Moscow' : 'Москва'}" required ${converted ? 'disabled' : ''}>
          </div>
          <div class="field">
            <label for="request-to">Куда</label>
            <input id="request-to" name="route_to" value="${esc(request ? request.route_to : '')}" placeholder="${getLang() === 'en' ? 'Kazan' : 'Казань'}" required ${converted ? 'disabled' : ''}>
          </div>
        </div>
        <div class="form-row">
          <div class="field">
            <label for="request-cargo">Груз</label>
            <input id="request-cargo" name="cargo" value="${esc(request ? request.cargo : '')}" placeholder="${getLang() === 'en' ? 'Building materials, 18 pallets' : 'Стройматериалы, 18 паллет'}" ${converted ? 'disabled' : ''}>
          </div>
          <div class="field">
            <label for="request-transport">Тип машины</label>
            <select id="request-transport" name="transport_type" ${converted ? 'disabled' : ''}>
              ${TRANSPORT_TYPES.map((type) => option(type.id, `${type.short} — ${type.title}`, request ? request.transport_type : 'ftl')).join('')}
            </select>
          </div>
        </div>
        <div class="form-row three">
          <div class="field">
            <label for="request-distance">Расстояние, км</label>
            <input id="request-distance" name="distance_km" type="number" min="0" step="1" inputmode="decimal"
                   value="${request && request.distance_km ? request.distance_km : ''}" placeholder="0" ${converted ? 'disabled' : ''}>
          </div>
          <div class="field">
            <label for="request-weight">Вес, т</label>
            <input id="request-weight" name="weight" type="number" min="0" step="0.1" inputmode="decimal"
                   value="${request && request.weight ? request.weight : ''}" placeholder="0" ${converted ? 'disabled' : ''}>
          </div>
          <div class="field">
            <label for="request-volume">Объём, м³</label>
            <input id="request-volume" name="volume" type="number" min="0" step="0.1" inputmode="decimal"
                   value="${request && request.volume ? request.volume : ''}" placeholder="0" ${converted ? 'disabled' : ''}>
          </div>
        </div>
        <div class="form-row three">
          <div class="field">
            <label for="request-cost">Себестоимость, ₽</label>
            <input id="request-cost" name="cost_price" type="number" min="0" step="any" inputmode="decimal"
                   value="${request ? request.cost_price : ''}" placeholder="0" ${converted ? 'disabled' : ''}>
          </div>
          <div class="field">
            <label for="request-markup">Наценка, %</label>
            <input id="request-markup" name="markup_pct" type="number" min="0" max="1000" step="any" inputmode="decimal"
                   value="${request ? request.markup_pct : ''}" placeholder="25" ${converted ? 'disabled' : ''}>
          </div>
          <div class="field">
            <label for="request-amount">Ставка клиенту, ₽</label>
            <input id="request-amount" name="amount" type="number" min="0" step="any" inputmode="decimal"
                   value="${request ? request.amount : ''}" placeholder="0" ${converted ? 'disabled' : ''}>
          </div>
        </div>
        <div class="calc-preview" data-calc>
          <div><span>Себестоимость</span><b data-calc-cost>—</b></div>
          <div><span>Наценка</span><b data-calc-markup>—</b></div>
          <div><span>Маржа рейса</span><b data-calc-margin>—</b></div>
        </div>
        <div class="form-row">
          ${statusField}
          ${ownerField}
        </div>
        <div class="field">
          <label for="request-note">Комментарий</label>
          <textarea id="request-note" name="note" placeholder="Пожелания клиента, сроки, условия" ${converted ? 'disabled' : ''}>${esc(request ? request.note : '')}</textarea>
        </div>
      </form>`,
    footer: `${isEdit && !converted ? `<button type="button" class="btn btn-danger btn-sm" data-delete>${icon('trash', 14)} Удалить</button>` : ''}
      <span class="spacer"></span>
      ${isEdit && !converted ? `<button type="button" class="btn" data-convert>${icon('arrow', 14)} В рейс</button>` : ''}
      <button type="button" class="btn" data-cancel>Закрыть</button>
      ${converted ? '' : `<button type="submit" class="btn btn-primary" data-save>${isEdit ? 'Сохранить' : 'Создать заявку'}</button>`}`,
  });

  const form = drawer.body.querySelector('form');
  const costEl = form.querySelector('[name="cost_price"]');
  const markupEl = form.querySelector('[name="markup_pct"]');
  const amountEl = form.querySelector('[name="amount"]');
  const calc = {
    cost: drawer.body.querySelector('[data-calc-cost]'),
    markup: drawer.body.querySelector('[data-calc-markup]'),
    margin: drawer.body.querySelector('[data-calc-margin]'),
  };

  function updateCalc() {
    const cost = Number(costEl.value || 0);
    const markup = Number(markupEl.value || 0);
    const amount = Number(amountEl.value || 0);
    const margin = amount - cost;
    const marginPct = amount ? (margin / amount) * 100 : 0;
    calc.cost.textContent = fmtMoney(cost);
    calc.markup.textContent = fmtMoney(amount - cost) + (markup ? ` · ${fmtPct(markup)}` : '');
    calc.margin.textContent = `${margin >= 0 ? '+' : ''}${fmtMoney(margin)}${amount ? ` · ${Math.round(marginPct)}%` : ''}`;
    calc.margin.className = margin >= 0 ? 'good' : 'bad';
  }

  function recalcAmount() {
    const cost = Number(costEl.value || 0);
    const markup = Number(markupEl.value || 0);
    amountEl.value = Math.round(cost * (1 + markup / 100));
    updateCalc();
  }

  costEl.addEventListener('input', recalcAmount);
  markupEl.addEventListener('input', recalcAmount);
  amountEl.addEventListener('input', updateCalc);
  updateCalc();

  drawer.backdrop.querySelector('[data-cancel]').addEventListener('click', closeDrawer);
  const save = drawer.backdrop.querySelector('[data-save]');
  if (save) {
    save.addEventListener('click', () => form.requestSubmit());
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = formValues(form);
      const payload = {
        client_id: values.client_id ? Number(values.client_id) : null,
        route_from: values.route_from,
        route_to: values.route_to,
        cargo: values.cargo,
        transport_type: values.transport_type,
        distance_km: Number(values.distance_km || 0),
        weight: Number(values.weight || 0),
        volume: Number(values.volume || 0),
        cost_price: Number(values.cost_price || 0),
        markup_pct: Number(values.markup_pct || 0),
        amount: Number(values.amount || 0),
        status: values.status || 'new',
        note: values.note,
      };
      if (values.owner_id) payload.owner_id = Number(values.owner_id);
      submit(form, save, async () => {
        if (isEdit) await api.patch('/requests/' + request.id, payload);
        else await api.post('/requests', payload);
        closeDrawer();
        toast(isEdit ? 'Заявка обновлена' : 'Заявка создана', 'success');
        refresh();
        if (opts.onSaved) opts.onSaved();
      });
    });
  }

  const del = drawer.backdrop.querySelector('[data-delete]');
  if (del) {
    del.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Удалить заявку?',
        message: `Заявка ${request.route_from} → ${request.route_to} будет удалена.`,
      });
      if (!ok) return;
      try {
        await api.del('/requests/' + request.id);
        closeDrawer();
        toast('Заявка удалена', 'success');
        refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  const convertButton = drawer.backdrop.querySelector('[data-convert]');
  if (convertButton) {
    convertButton.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Преобразовать в рейс?',
        message: `Заявка ${request.route_from} → ${request.route_to} станет перевозкой на этапе «Подтверждено».`,
        confirmText: 'Создать рейс',
        danger: false,
      });
      if (!ok) return;
      convertButton.disabled = true;
      try {
        const result = await api.post(`/requests/${request.id}/convert`);
        closeDrawer();
        toast(`Создан рейс #${result.deal.id} · ${result.deal.title}`, 'success');
        refresh();
        if (opts.onConverted) opts.onConverted(result.deal);
      } catch (err) {
        convertButton.disabled = false;
        toast(err.message, 'error');
      }
    });
  }
}

/* ------------------------------------------------------------- client */

export async function openClientForm(client = null, opts = {}) {
  const isEdit = Boolean(client);
  let team = [];
  if (state.user.role !== 'manager') {
    try {
      await loadTeam();
      team = teamWithFallback(
        state.team.filter((member) => !isFieldRole(member.role)),
        client ? client.owner_id : null,
        client ? client.owner_name : '',
      );
    } catch (err) {
      team = [];
    }
  }
  const ownerField = state.user.role === 'manager'
    ? ''
    : `<div class="field"><label for="client-owner">Ответственный</label><select id="client-owner" name="owner_id">
         ${team.map((m) => option(m.id, m.name, client ? client.owner_id : state.user.id)).join('')}
       </select></div>`;

  const drawer = openDrawer({
    title: isEdit ? 'Клиент' : 'Новый клиент',
    subtitle: isEdit ? `В базе с ${fmtDate(client.created_at, true)}` : 'Компания или организация',
    body: `
      <form id="client-form" class="form" novalidate>
        <div class="form-error"></div>
        <div class="field">
          <label for="client-name">Название компании</label>
          <input id="client-name" name="name" value="${esc(client ? client.name : '')}" placeholder="${getLang() === 'en' ? 'Romashka LLC' : 'ООО «Ромашка»'}" required>
        </div>
        <div class="form-row">
          <div class="field">
            <label for="client-industry">Отрасль</label>
            <input id="client-industry" name="industry" value="${esc(client ? client.industry : '')}" placeholder="Производство, ритейл, фармацевтика…">
          </div>
          <div class="field">
            <label for="client-inn">ИНН</label>
            <input id="client-inn" name="inn" value="${esc(client ? client.inn : '')}" inputmode="numeric" placeholder="10 или 12 цифр">
          </div>
        </div>
        <div class="form-row">
          <div class="field">
            <label for="client-phone">Телефон</label>
            <input id="client-phone" name="phone" value="${esc(client ? client.phone : '')}" placeholder="+7 ...">
          </div>
          <div class="field">
            <label for="client-email">Email</label>
            <input id="client-email" name="email" type="email" value="${esc(client ? client.email : '')}" placeholder="info@company.ru">
          </div>
        </div>
        <div class="form-row">
          <div class="field">
            <label for="client-site">Сайт</label>
            <input id="client-site" name="website" value="${esc(client ? client.website : '')}" placeholder="company.ru">
          </div>
          <div class="field">
            <label for="client-address">Адрес</label>
            <input id="client-address" name="address" value="${esc(client ? client.address : '')}" placeholder="Город, улица, дом">
          </div>
        </div>
        ${ownerField}
        <div class="field">
          <label for="client-notes">Заметки</label>
          <textarea id="client-notes" name="notes" placeholder="Особенности, история, договорённости">${esc(client ? client.notes : '')}</textarea>
        </div>
      </form>`,
    footer: footer(isEdit, isEdit ? 'Сохранить' : 'Создать клиента'),
  });

  const form = drawer.body.querySelector('form');
  wireFooter(drawer, form);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = formValues(form);
    const payload = {
      name: values.name,
      industry: values.industry,
      inn: values.inn,
      phone: values.phone,
      email: values.email,
      website: values.website,
      address: values.address,
      notes: values.notes,
    };
    if (values.owner_id) payload.owner_id = Number(values.owner_id);
    submit(form, drawer.backdrop.querySelector('[data-save]'), async () => {
      if (isEdit) await api.patch('/clients/' + client.id, payload);
      else await api.post('/clients', payload);
      closeDrawer();
      toast(isEdit ? 'Клиент обновлён' : 'Клиент создан', 'success');
      refresh();
      if (opts.onSaved) opts.onSaved();
    });
  });

  const del = drawer.backdrop.querySelector('[data-delete]');
  if (del) {
    del.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Удалить клиента?',
        message: `Клиент «${client.name}», его контакты и привязки к перевозкам будут удалены.`,
      });
      if (!ok) return;
      try {
        await api.del('/clients/' + client.id);
        closeDrawer();
        toast('Клиент удалён', 'success');
        refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }
}

/* ------------------------------------------------------------- task */

export async function openTaskForm(task = null, opts = {}) {
  const isEdit = Boolean(task);
  let clients = [];
  let deals = [];
  try {
    const [clientsData, dealsData] = await Promise.all([api.get('/clients'), api.get('/deals'), loadTeam()]);
    clients = clientsData.clients;
    deals = dealsData.deals;
  } catch (err) {
    toast(err.message, 'error');
    return;
  }

  const assigneeField = state.user.role === 'manager'
    ? ''
    : `<div class="field"><label for="task-assignee">Ответственный</label><select id="task-assignee" name="assignee_id">
         ${state.team.filter((m) => !isFieldRole(m.role)).map((m) => option(m.id, m.name, task ? task.assignee_id : state.user.id)).join('')}
       </select></div>`;

  const drawer = openDrawer({
    title: isEdit ? 'Задача' : 'Новая задача',
    subtitle: isEdit ? `Создана ${fmtDate(task.created_at, true)}` : 'Что и когда нужно сделать',
    body: `
      <form id="task-form" class="form" novalidate>
        <div class="form-error"></div>
        <div class="field">
          <label for="task-title">Задача</label>
          <input id="task-title" name="title" value="${esc(task ? task.title : '')}" placeholder="Позвонить клиенту, отправить КП…" required>
        </div>
        <div class="form-row">
          <div class="field">
            <label for="task-due">Срок</label>
            <input id="task-due" name="due_date" type="date" value="${esc(task ? task.due_date : todayISO())}">
          </div>
          <div class="field">
            <label for="task-priority">Приоритет</label>
            <select id="task-priority" name="priority">
              ${option('low', 'Низкий', task ? task.priority : 'normal')}
              ${option('normal', 'Обычный', task ? task.priority : 'normal')}
              ${option('high', 'Высокий', task ? task.priority : 'normal')}
            </select>
          </div>
        </div>
        ${assigneeField}
        <div class="form-row">
          <div class="field">
            <label for="task-client">Клиент</label>
            <select id="task-client" name="client_id">
              <option value="">— не привязан —</option>
              ${clients.map((c) => option(c.id, c.name, task ? task.client_id : '')).join('')}
            </select>
          </div>
          <div class="field">
            <label for="task-deal">Перевозка</label>
            <select id="task-deal" name="deal_id">
              <option value="">— не привязана —</option>
              ${deals.map((d) => option(d.id, d.title, task ? task.deal_id : '')).join('')}
            </select>
          </div>
        </div>
        <div class="field">
          <label for="task-notes">Детали</label>
          <textarea id="task-notes" name="notes" placeholder="Что нужно сделать, договорённости">${esc(task ? task.notes : '')}</textarea>
        </div>
      </form>`,
    footer: footer(isEdit, isEdit ? 'Сохранить' : 'Создать задачу'),
  });

  const form = drawer.body.querySelector('form');
  wireFooter(drawer, form);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = formValues(form);
    const payload = {
      title: values.title,
      due_date: values.due_date || '',
      priority: values.priority,
      notes: values.notes,
      client_id: values.client_id ? Number(values.client_id) : null,
      deal_id: values.deal_id ? Number(values.deal_id) : null,
    };
    if (values.assignee_id) payload.assignee_id = Number(values.assignee_id);
    submit(form, drawer.backdrop.querySelector('[data-save]'), async () => {
      if (isEdit) await api.patch('/tasks/' + task.id, payload);
      else await api.post('/tasks', payload);
      closeDrawer();
      toast(isEdit ? 'Задача обновлена' : 'Задача создана', 'success');
      refresh();
      if (opts.onSaved) opts.onSaved();
    });
  });

  const del = drawer.backdrop.querySelector('[data-delete]');
  if (del) {
    del.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Удалить задачу?',
        message: `Задача «${task.title}» будет удалена.`,
      });
      if (!ok) return;
      try {
        await api.del('/tasks/' + task.id);
        closeDrawer();
        toast('Задача удалена', 'success');
        refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }
}

/* ------------------------------------------------------------- contractor */

export async function openContractorForm(contractor = null, opts = {}) {
  const isEdit = Boolean(contractor);
  const value = (key, fallback = '') => esc(contractor && contractor[key] !== undefined && contractor[key] !== null
    ? contractor[key] : fallback);
  const drawer = openDrawer({
    title: isEdit ? 'Подрядчик' : 'Новый подрядчик',
    subtitle: isEdit ? 'Перевозчик на субподряде' : 'Кому передаём рейсы',
    body: `
      <form id="contractor-form" class="form" novalidate>
        <div class="form-error"></div>
        <div class="field">
          <label for="contractor-name">Название</label>
          <input id="contractor-name" name="name" value="${value('name')}" placeholder="${getLang() === 'en' ? 'IP Sokolov or TransLine LLC' : 'ИП Соколов или ООО «ТрансЛайн»'}" maxlength="200" required>
        </div>
        <div class="form-row">
          <div class="field">
            <label for="contractor-inn">ИНН</label>
            <input id="contractor-inn" name="inn" value="${value('inn')}" inputmode="numeric" placeholder="10 или 12 цифр">
          </div>
          <div class="field">
            <label for="contractor-rate">Ставка по умолчанию, ₽</label>
            <input id="contractor-rate" name="rate" type="number" min="0" step="any" inputmode="decimal"
                   value="${contractor && contractor.rate ? contractor.rate : ''}" placeholder="0">
          </div>
        </div>
        <div class="field">
          <label for="contractor-contact">Контактное лицо</label>
          <input id="contractor-contact" name="contact" value="${value('contact')}" placeholder="${getLang() === 'en' ? 'Name and position' : 'Имя и должность'}" maxlength="200">
        </div>
        <div class="form-row">
          <div class="field">
            <label for="contractor-phone">Телефон</label>
            <input id="contractor-phone" name="phone" value="${value('phone')}" placeholder="+7 ..." maxlength="60">
          </div>
          <div class="field">
            <label for="contractor-email">Email</label>
            <input id="contractor-email" name="email" type="email" value="${value('email')}" placeholder="carrier@company.ru" maxlength="200">
          </div>
        </div>
        <div class="field">
          <label for="contractor-notes">Заметки</label>
          <textarea id="contractor-notes" name="notes" maxlength="2000"
                    placeholder="Типы машин, регионы работы, условия">${value('notes')}</textarea>
        </div>
        ${isEdit ? `<label class="form-check"><input type="checkbox" name="active" ${contractor.active !== false ? 'checked' : ''}> Подрядчик активен</label>` : ''}
      </form>`,
    footer: footer(isEdit, isEdit ? 'Сохранить' : 'Добавить подрядчика'),
  });

  const form = drawer.body.querySelector('form');
  wireFooter(drawer, form);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = formValues(form);
    const payload = {
      name: values.name,
      inn: values.inn,
      contact: values.contact,
      phone: values.phone,
      email: values.email,
      rate: Number(values.rate || 0),
      notes: values.notes,
    };
    if (isEdit) payload.active = Boolean(values.active);
    submit(form, drawer.backdrop.querySelector('[data-save]'), async () => {
      if (isEdit) await api.patch('/contractors/' + contractor.id, payload);
      else await api.post('/contractors', payload);
      closeDrawer();
      toast(isEdit ? 'Подрядчик обновлён' : 'Подрядчик добавлен', 'success');
      refresh();
      if (opts.onSaved) opts.onSaved();
    });
  });

  const del = drawer.backdrop.querySelector('[data-delete]');
  if (del) {
    del.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Удалить подрядчика?',
        message: `«${contractor.name}» будет удалён. Если он указан в перевозках, отключите его вместо удаления.`,
      });
      if (!ok) return;
      try {
        await api.del('/contractors/' + contractor.id);
        closeDrawer();
        toast('Подрядчик удалён', 'success');
        refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }
}

/* ------------------------------------------------------------- user */

export async function openUserForm(user = null) {
  if (state.user.role !== 'admin') return;
  const isEdit = Boolean(user);

  const drawer = openDrawer({
    title: isEdit ? 'Пользователь' : 'Новый пользователь',
    subtitle: isEdit ? 'Права доступа и данные учётной записи' : 'Добавьте участника команды',
    body: `
      <form id="user-form" class="form" novalidate>
        <div class="form-error"></div>
        <div class="field">
          <label for="user-name">Имя и фамилия</label>
          <input id="user-name" name="name" value="${esc(user ? user.name : '')}" placeholder="Иван Петров" required>
        </div>
        <div class="field">
          <label for="user-email">Email</label>
          <input id="user-email" name="email" type="email" value="${esc(user ? user.email : '')}" placeholder="ivan@company.ru" required>
        </div>
        <div class="field">
          <label for="user-role">Роль</label>
          <select id="user-role" name="role">
            ${option('manager', 'Менеджер — видит только своих клиентов и перевозки', user ? user.role : 'manager')}
            ${option('head', 'Руководитель — видит всю команду и данные', user ? user.role : 'manager')}
            ${option('admin', 'Администратор — полный доступ и управление пользователями', user ? user.role : 'manager')}
            ${option('driver', 'Водитель — видит только свой рейс без сумм, может добавлять документы', user ? user.role : 'manager')}
            ${option('mechanic', 'Механик — видит автопарк и заявки водителей на ремонт', user ? user.role : 'manager')}
          </select>
        </div>
        <div class="field">
          <label for="user-password">Пароль</label>
          <input id="user-password" name="password" type="password" placeholder="${isEdit ? 'Оставьте пустым, чтобы не менять' : 'Минимум 6 символов'}" ${isEdit ? '' : 'required'}>
        </div>
        ${isEdit ? `<label class="form-check"><input type="checkbox" name="active" ${user.active ? 'checked' : ''}> Учётная запись активна</label>` : ''}
      </form>`,
    footer: footer(isEdit, isEdit ? 'Сохранить' : 'Добавить пользователя'),
  });

  const form = drawer.body.querySelector('form');
  wireFooter(drawer, form);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = formValues(form);
    const payload = {
      name: values.name,
      email: values.email,
      role: values.role,
    };
    if (values.password) payload.password = values.password;
    if (isEdit) payload.active = Boolean(values.active);
    submit(form, drawer.backdrop.querySelector('[data-save]'), async () => {
      if (isEdit) await api.patch('/users/' + user.id, payload);
      else await api.post('/users', payload);
      state.team = [];
      closeDrawer();
      toast(isEdit ? 'Пользователь обновлён' : 'Пользователь добавлен', 'success');
      refresh();
    });
  });

  const del = drawer.backdrop.querySelector('[data-delete]');
  if (del) {
    del.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Удалить пользователя?',
        message: `Учётная запись «${user.name}» будет удалена. Связанные перевозки и клиенты останутся в системе.`,
      });
      if (!ok) return;
      try {
        await api.del('/users/' + user.id);
        state.team = [];
        closeDrawer();
        toast('Пользователь удалён', 'success');
        refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }
}
