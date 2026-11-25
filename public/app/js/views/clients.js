import { api } from '../api.js';
import { state, loadTeam } from '../store.js';
import { openClientForm, openDealForm } from '../forms.js';
import {
  avatar, closeDrawer, confirmDialog, daysAgoText, emptyState, esc, fmtDate,
  fmtPct, fmtShort, icon, loader, openDrawer, ownerCell, plural, refresh, stageChip, toast,
} from '../ui.js';

const filters = { q: '', owner: 'all' };

function clientRow(client) {
  const industry = client.industry || 'Отрасль не указана';
  const sub = client.inn ? `${industry} · ИНН ${client.inn}` : industry;
  return `<tr class="clickable" data-client-id="${client.id}">
    <td>
      <div class="owner-cell">
        ${avatar(client.name, 'sm')}
        <div>
          <div class="cell-title" data-raw>${esc(client.name)}</div>
          <div class="cell-sub" data-raw>${esc(sub)}</div>
        </div>
      </div>
    </td>
    <td class="hide-sm">${client.contacts_count}</td>
    <td>${client.deals_count}${client.open_amount ? ` · ${fmtShort(client.open_amount)}` : ''}</td>
    <td class="hide-sm finance-cell"><b>${fmtShort(client.revenue_total || 0)}</b><span>${client.won_count || 0} доставлено</span></td>
    <td class="finance-cell"><b class="${Number(client.margin) < 0 ? 'bad' : 'good'}">${fmtShort(client.margin || 0)}</b><span>${fmtPct(client.margin_pct)}</span></td>
    <td class="hide-sm">${ownerCell(client.owner_name)}</td>
    <td class="hide-sm">${fmtDate(client.created_at, true)}</td>
  </tr>`;
}

export function openClientDetail(clientId) {
  let current = null;
  const drawer = openDrawer({ title: 'Клиент', subtitle: 'Загрузка…', body: loader() });

  async function paint() {
    let client;
    try {
      client = (await api.get('/clients/' + clientId)).client;
    } catch (err) {
      drawer.body.innerHTML = `<div class="notice">${icon('alert', 16)}<div>${esc(err.message)}</div></div>`;
      return;
    }
    if (!drawer.backdrop.isConnected) return;
    current = client;

    drawer.panel.querySelector('.drawer-title').textContent = client.name;
    drawer.panel.querySelector('.drawer-sub').textContent =
      `${client.industry || 'Отрасль не указана'} · в базе ${daysAgoText(client.created_at)}`;

    const openAmount = client.deals
      .filter((deal) => !['won', 'lost'].includes(deal.stage))
      .reduce((sum, deal) => sum + Number(deal.amount || 0), 0);

    const dealsList = client.deals.length
      ? client.deals.map((deal) => `<button type="button" class="mini-item" data-open-deal="${deal.id}" style="font:inherit;text-align:left;cursor:pointer">
          <div class="mini-main">
            <div class="mini-title" data-raw>${esc(deal.title)}</div>
            <div class="mini-sub" data-raw>${esc([deal.cargo, deal.owner_name, fmtDate(deal.updated_at)].filter(Boolean).join(' · '))}</div>
          </div>
          ${stageChip(deal.stage)}
          <span class="mini-side">${fmtShort(deal.amount)}</span>
        </button>`).join('')
      : '<div class="manager-note">Перевозок пока нет</div>';

    const contactsList = client.contacts.length
      ? client.contacts.map((contact) => `<div class="mini-item">
          ${avatar(contact.name, 'sm')}
          <div class="mini-main">
            <div class="mini-title" data-raw>${esc(contact.name)}</div>
            <div class="mini-sub" data-raw>${esc([contact.position, contact.phone, contact.email].filter(Boolean).join(' · ')) || '—'}</div>
          </div>
          <button class="icon-btn sm" data-del-contact="${contact.id}" title="Удалить контакт">${icon('trash', 14)}</button>
        </div>`).join('')
      : '<div class="manager-note">Добавьте первого контактного представителя</div>';

    drawer.body.innerHTML = `
      <div class="detail-hero">
        ${avatar(client.name, 'xl')}
        <div style="flex:1;min-width:0">
          <div class="detail-name" data-raw>${esc(client.name)}</div>
          <div class="detail-sub">${client.contacts_count || client.contacts.length} ${plural(client.contacts.length, 'контакт', 'контакта', 'контактов')} · ${client.deals.length} ${plural(client.deals.length, 'перевозка', 'перевозки', 'перевозок')}</div>
        </div>
        <button class="btn btn-sm" data-edit-client>${icon('edit', 14)} Изменить</button>
      </div>

      <div class="info-grid">
        <div>
          <div class="info-label">Телефон</div>
          <div class="info-value" data-raw>${client.phone ? `<a href="tel:${esc(client.phone)}">${esc(client.phone)}</a>` : '—'}</div>
        </div>
        <div>
          <div class="info-label">Email</div>
          <div class="info-value" data-raw>${client.email ? `<a href="mailto:${esc(client.email)}">${esc(client.email)}</a>` : '—'}</div>
        </div>
        <div>
          <div class="info-label">ИНН</div>
          <div class="info-value" data-raw>${esc(client.inn || '—')}</div>
        </div>
        <div>
          <div class="info-label">Сайт</div>
          <div class="info-value" data-raw>${client.website ? `<a href="https://${esc(client.website)}" target="_blank" rel="noopener">${esc(client.website)}</a>` : '—'}</div>
        </div>
        <div>
          <div class="info-label">Ответственный</div>
          <div class="info-value" data-raw>${esc(client.owner_name || '—')}</div>
        </div>
        <div>
          <div class="info-label">В базе с</div>
          <div class="info-value" data-raw>${fmtDate(client.created_at, true)}</div>
        </div>
        <div class="info-full">
          <div class="info-label">Адрес</div>
          <div class="info-value" data-raw>${esc(client.address || '—')}</div>
        </div>
        ${client.notes ? `<div class="info-full">
          <div class="info-label">Заметки</div>
          <div class="info-value" data-raw style="white-space:pre-wrap">${esc(client.notes)}</div>
        </div>` : ''}
      </div>

      <div class="section-block">
        <div class="section-head">
          <span class="section-title">Финансы по клиенту</span>
        </div>
        <div class="finance-summary">
          <div><span>Выручка</span><b>${fmtShort(client.finance.revenue)}</b></div>
          <div><span>Расходы</span><b>${fmtShort(client.finance.expenses)}</b></div>
          <div><span>Маржа</span><b class="${client.finance.margin < 0 ? 'bad' : 'good'}">${fmtShort(client.finance.margin)}${client.finance.margin_pct != null ? ` · ${fmtPct(client.finance.margin_pct)}` : ''}</b></div>
        </div>
        <div class="count-note" style="margin-top:6px">Считаются только доставленные перевозки клиента.</div>
      </div>

      <div class="section-block">
        <div class="section-head">
          <span class="section-title">Перевозки · ${client.deals.length}</span>
          ${openAmount ? `<span class="count-note">${fmtShort(openAmount)} в работе</span>` : ''}
        </div>
        <div class="mini-list">${dealsList}</div>
      </div>

      <div class="section-block">
        <div class="section-head"><span class="section-title">Контакты · ${client.contacts.length}</span></div>
        <div class="mini-list">${contactsList}</div>
        <form class="contact-form" data-contact-form>
          <div class="field"><label>Имя</label><input name="name" placeholder="Иван Петров" required></div>
          <div class="field"><label>Должность</label><input name="position" placeholder="Директор"></div>
          <div class="field"><label>Телефон</label><input name="phone" placeholder="+7 …"></div>
          <div class="field"><label>Email</label><input name="email" placeholder="mail@company.ru"></div>
          <div class="span2 form-error"></div>
          <div class="span2">
            <button type="submit" class="btn btn-sm">${icon('plus', 14)} Добавить контакт</button>
          </div>
        </form>
      </div>
    `;

    drawer.body.querySelector('[data-edit-client]').addEventListener('click', () => {
      closeDrawer();
      openClientForm(client);
    });

    drawer.body.querySelectorAll('[data-open-deal]').forEach((button) => {
      button.addEventListener('click', () => {
        const deal = client.deals.find((item) => String(item.id) === button.dataset.openDeal);
        if (deal) openDealForm({ ...deal, client_name: client.name });
      });
    });

    drawer.body.querySelectorAll('[data-del-contact]').forEach((button) => {
      button.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Удалить контакт?',
          message: 'Контактное лицо будет удалено из карточки клиента.',
        });
        if (!ok) return;
        try {
          await api.del('/contacts/' + button.dataset.delContact);
          toast('Контакт удалён', 'success');
          refresh();
          paint();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });

    const contactForm = drawer.body.querySelector('[data-contact-form]');
    contactForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = {
        name: contactForm.querySelector('[name="name"]').value,
        position: contactForm.querySelector('[name="position"]').value,
        phone: contactForm.querySelector('[name="phone"]').value,
        email: contactForm.querySelector('[name="email"]').value,
      };
      const errorBox = contactForm.querySelector('.form-error');
      errorBox.classList.remove('show');
      if (!values.name.trim()) {
        errorBox.textContent = 'Укажите имя контакта';
        errorBox.classList.add('show');
        return;
      }
      try {
        await api.post(`/clients/${clientId}/contacts`, values);
        toast('Контакт добавлен', 'success');
        refresh();
        paint();
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.classList.add('show');
      }
    });
  }

  paint();
}

export async function render(root) {
  root.innerHTML = loader();
  let clients = [];
  let team = [];
  try {
    const [clientsData] = await Promise.all([
      api.get('/clients'),
      state.user.role === 'manager' ? Promise.resolve(null) : loadTeam(),
    ]);
    clients = clientsData.clients;
    team = state.team;
  } catch (err) {
    root.innerHTML = `<div class="card"><div class="card-body">${emptyState('alert', 'Не удалось загрузить клиентов', err.message)}</div></div>`;
    return;
  }

  if (filters.owner !== 'all' && !team.some((member) => String(member.id) === filters.owner)) {
    filters.owner = 'all';
  }

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="page-title">Клиенты</h1>
        <p class="page-sub">${clients.length} ${plural(clients.length, 'компания', 'компании', 'компаний')} в базе · нажмите на строку, чтобы открыть карточку</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" data-new-client>${icon('plus', 16)} Новый клиент</button>
      </div>
    </div>

    <div class="toolbar">
      <label class="search">
        ${icon('search', 16)}
        <input type="search" placeholder="Поиск: название, отрасль, ИНН" data-search value="${esc(filters.q)}">
      </label>
      ${state.user.role === 'manager' ? '' : `<select class="select" data-owner-filter>
        <option value="all">Все ответственные</option>
        ${team.map((member) => `<option value="${member.id}"${filters.owner === String(member.id) ? ' selected' : ''}>${esc(member.name)}</option>`).join('')}
      </select>`}
      <span class="toolbar-spacer"></span>
      <div class="req-toolbar">
        <button class="btn btn-sm" data-import>${icon('upload', 14)} Импорт</button>
        <a class="btn btn-sm" href="/api/clients/import/template" title="Скачать шаблон CSV">${icon('note', 14)} Шаблон</a>
        <button class="btn btn-sm" data-export="csv">${icon('upload', 14)} CSV</button>
        <button class="btn btn-sm" data-export="xlsx">${icon('upload', 14)} Excel</button>
        <input type="file" accept=".csv,.xlsx" hidden data-import-input>
      </div>
      <span class="count-note" data-count></span>
    </div>

    <section class="card">
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Клиент</th>
              <th class="hide-sm">Контакты</th>
              <th>Перевозки</th>
              <th class="hide-sm">Выручка</th>
              <th>Маржа</th>
              <th class="hide-sm">Ответственный</th>
              <th class="hide-sm">В базе с</th>
            </tr>
          </thead>
          <tbody data-rows></tbody>
        </table>
      </div>
    </section>
  `;

  const tbody = root.querySelector('[data-rows]');
  const countEl = root.querySelector('[data-count]');
  const searchEl = root.querySelector('[data-search]');
  const ownerEl = root.querySelector('[data-owner-filter]');

  function paint() {
    const q = filters.q.trim().toLowerCase();
    const list = clients.filter((client) => {
      if (filters.owner !== 'all' && String(client.owner_id) !== filters.owner) return false;
      if (!q) return true;
      return `${client.name} ${client.industry || ''} ${client.inn || ''} ${client.email || ''} ${client.phone || ''}`
        .toLowerCase().includes(q);
    });

    countEl.textContent = `${list.length} из ${clients.length}`;
    tbody.innerHTML = list.length
      ? list.map(clientRow).join('')
      : `<tr><td colspan="7">${emptyState('clients', 'Клиенты не найдены', 'Попробуйте изменить запрос или добавьте нового клиента.')}</td></tr>`;

    tbody.querySelectorAll('[data-client-id]').forEach((row) => {
      row.addEventListener('click', () => openClientDetail(Number(row.dataset.clientId)));
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

  root.querySelector('[data-new-client]').addEventListener('click', () => openClientForm());
  root.querySelectorAll('[data-export]').forEach((button) => {
    button.addEventListener('click', () => {
      window.location.assign(`/api/export/clients?format=${button.dataset.export}`);
    });
  });

  const importButton = root.querySelector('[data-import]');
  const importInput = root.querySelector('[data-import-input]');
  importButton.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files[0];
    importInput.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast('Файл больше 5 МБ', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const content = String(reader.result || '').split(',')[1] || '';
      importButton.disabled = true;
      importButton.textContent = 'Импортируем…';
      try {
        const data = await api.post('/clients/import', { filename: file.name, content });
        const parts = [`Добавлено клиентов: ${data.created}`];
        if (data.skipped) parts.push(`пропущено: ${data.skipped}`);
        toast(parts.join(' · '), data.created ? 'success' : 'error');
        if (data.errors && data.errors.length) {
          toast(`Строка ${data.errors[0].row}: ${data.errors[0].message}`, 'error');
        }
        refresh();
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        importButton.disabled = false;
        importButton.innerHTML = `${icon('upload', 14)} Импорт`;
      }
    };
    reader.onerror = () => toast('Не удалось прочитать файл', 'error');
    reader.readAsDataURL(file);
  });

  paint();
}
