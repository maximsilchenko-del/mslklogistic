import { api } from '../api.js';
import { state } from '../store.js';
import { emptyState, esc, icon, loader, toast } from '../ui.js';

export async function render(root) {
  root.innerHTML = loader();
  let company;
  try {
    company = (await api.get('/company')).company;
  } catch (err) {
    root.innerHTML = `<div class="card"><div class="card-body">${emptyState('alert', 'Не удалось загрузить настройки', err.message)}</div></div>`;
    return;
  }

  const isAdmin = state.user.role === 'admin';
  const lines = [
    ['Организация', company.legal],
    ['ИНН / КПП', `${company.inn} / ${company.kpp}`],
    ['ОГРН', company.ogrn],
    ['Адрес', company.address],
    ['Телефон', company.phone],
    ['Email', company.email],
    ['Банк', company.bank],
    ['Расчётный счёт', company.account],
    ['Корр. счёт', company.corr],
    ['БИК', company.bik],
  ];

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="page-title">Настройки</h1>
        <p class="page-sub">Реквизиты для документов, выгрузки и резервная копия базы</p>
      </div>
    </div>

    <div class="settings-grid">
      <div class="stack">
        <section class="card">
          <div class="card-head">
            <div>
              <div class="card-title">Реквизиты компании</div>
              <div class="card-sub">Подставляются в договор, счёт и путевой лист</div>
            </div>
            <span class="chip">${icon('building', 13)} ${esc(company.name)}</span>
          </div>
          <div class="card-body">
            <div class="settings-lines">
              ${lines.map(([label, value]) => `<div class="settings-line"><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join('')}
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <div class="card-title">Выгрузки</div>
              <div class="card-sub">CSV открывается в Excel и «МойОфис», XLSX — с готовым форматированием</div>
            </div>
          </div>
          <div class="card-body">
            <div class="req-toolbar">
              <button class="btn btn-sm" data-export="deals" data-format="csv">${icon('upload', 14)} Перевозки CSV</button>
              <button class="btn btn-sm" data-export="deals" data-format="xlsx">${icon('upload', 14)} Перевозки Excel</button>
              <button class="btn btn-sm" data-export="clients" data-format="csv">${icon('upload', 14)} Клиенты CSV</button>
              <button class="btn btn-sm" data-export="clients" data-format="xlsx">${icon('upload', 14)} Клиенты Excel</button>
            </div>
            <p class="field-hint" style="margin-top:10px">В выгрузку попадают доход, топливо, платные дороги, ремонт, прочие расходы и маржа по каждому рейсу.</p>
          </div>
        </section>
      </div>

      <div class="stack">
        <section class="card">
          <div class="card-head">
            <div>
              <div class="card-title">Резервная копия</div>
              <div class="card-sub">Полная копия базы одной кнопкой</div>
            </div>
            <span class="kpi-icon green">${icon('team', 17)}</span>
          </div>
          <div class="card-body">
            <p class="field-hint" style="margin:0 0 12px">Файл <b>.db</b> содержит всех пользователей, клиентов, перевозки, расходы, заявки и документы. Сохраните его в надёжном месте — копию можно открыть этим же приложением.</p>
            ${isAdmin
              ? `<button class="btn btn-primary" data-backup>${icon('upload', 15)} Скачать резервную копию</button>`
              : `<div class="notice">${icon('alert', 15)}<div>Резервную копию может скачать только администратор.</div></div>`}
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div class="card-title">Печать документов</div>
          </div>
          <div class="card-body">
            <p class="field-hint" style="margin:0">Откройте перевозку — в карточке есть кнопки «Договор», «Счёт» и «Путевой лист». Документ откроется в новой вкладке с готовой формой А4 и кнопкой печати.</p>
          </div>
        </section>
      </div>
    </div>
  `;

  root.querySelectorAll('[data-export]').forEach((button) => {
    button.addEventListener('click', () => {
      window.location.assign(`/api/export/${button.dataset.export}?format=${button.dataset.format}`);
    });
  });

  const backup = root.querySelector('[data-backup]');
  if (backup) {
    backup.addEventListener('click', () => {
      toast('Готовим резервную копию…', 'success');
      window.location.assign('/api/backup');
    });
  }
}
