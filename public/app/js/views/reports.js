import { api } from '../api.js';
import {
  barChart, emptyState, esc, fmtDate, fmtMoney, fmtPct, fmtShort, icon, loader, plural, refresh, toast, todayISO,
} from '../ui.js';

const period = { preset: 6, from: '', to: '' };

function monthStart(offset) {
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  const pad = (n) => String(n).padStart(2, '0');
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-01`;
}

function resolvePeriod() {
  if (period.from && period.to) return { from: period.from, to: period.to };
  if (period.preset === 1) return { from: monthStart(0), to: todayISO() };
  return { from: monthStart(period.preset - 1), to: todayISO() };
}

function pctText(value) {
  return fmtPct(value);
}

function kpi(label, value, sub, iconName, tone = '') {
  return `<article class="kpi">
    <div class="kpi-top">
      <span class="kpi-label">${esc(label)}</span>
      <span class="kpi-icon ${tone}">${icon(iconName, 17)}</span>
    </div>
    <div class="kpi-value">${value}</div>
    <div class="kpi-sub">${sub}</div>
  </article>`;
}

export async function render(root) {
  root.innerHTML = loader();
  const range = resolvePeriod();
  let report;
  try {
    report = (await api.get('/reports', range)).reports;
  } catch (err) {
    root.innerHTML = `<div class="card"><div class="card-body">${emptyState('alert', 'Не удалось загрузить отчёты', err.message)}</div></div>`;
    return;
  }

  const totals = report.totals;
  const directions = report.directions || [];
  const clients = report.clients || [];
  const managers = report.managers || [];
  const debtors = report.debtors || { summary: {}, items: [] };
  const req = report.requests || {};
  const periodLabel = `${fmtDate(report.period.from, true)} — ${fmtDate(report.period.to, true)}`;

  const monthlyChart = report.monthly && report.monthly.some((m) => m.revenue || m.margin)
    ? barChart(report.monthly, { height: 200 })
    : emptyState('chart', 'Пока нет доставленных рейсов', 'График появится, когда за период будут закрытые перевозки.');

  const directionRows = directions.length
    ? directions.map((item) => `<tr>
        <td><div class="cell-title">${esc(item.route)}</div><div class="cell-sub">${item.trips} ${plural(item.trips, 'рейс', 'рейса', 'рейсов')}</div></td>
        <td class="num">${fmtMoney(item.revenue)}</td>
        <td class="num hide-sm">${fmtMoney(item.margin)}</td>
        <td class="num">${pctText(item.margin_pct)}</td>
        <td class="num hide-sm">${item.rate_per_km ? item.rate_per_km + ' ₽/км' : '—'}</td>
      </tr>`).join('')
    : '<tr><td colspan="5" class="table-empty">За период нет направлений</td></tr>';

  const clientRows = clients.length
    ? clients.map((item) => `<tr>
        <td><div class="cell-title">${esc(item.client)}</div><div class="cell-sub">${item.trips} ${plural(item.trips, 'рейс', 'рейса', 'рейсов')}</div></td>
        <td class="num">${fmtMoney(item.revenue)}</td>
        <td class="num">${pctText(item.margin_pct)}</td>
      </tr>`).join('')
    : '<tr><td colspan="3" class="table-empty">За период нет клиентов</td></tr>';

  const managerRows = managers.length
    ? managers.map((item) => `<tr>
        <td>${esc(item.name)}</td>
        <td class="num">${item.trips}</td>
        <td class="num">${fmtMoney(item.revenue)}</td>
        <td class="num">${fmtMoney(item.margin)}</td>
      </tr>`).join('')
    : '<tr><td colspan="4" class="table-empty">Нет данных по менеджерам</td></tr>';

  const debtorItems = (debtors.items || []).map((item) => `<div class="debtor-row${item.overdue_days > 0 ? ' overdue' : ''}">
      <div class="debtor-main">
        <div class="debtor-name">${esc(item.client_name || item.title)}</div>
        <div class="debtor-meta">${esc(item.title)} · срок ${item.due ? fmtDate(item.due, true) : '—'}</div>
      </div>
      <div class="debtor-sum">
        <b>${fmtMoney(item.debt)}</b>
        <span class="${item.overdue_days > 0 ? 'bad' : ''}">${item.overdue_days > 0 ? `просрочка ${item.overdue_days} ${plural(item.overdue_days, 'день', 'дня', 'дней')}` : 'в срок'}</span>
      </div>
    </div>`).join('');

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="page-title">Отчёты</h1>
        <p class="page-sub">Период: ${periodLabel} · ${totals.trips} ${plural(totals.trips, 'доставленный рейс', 'доставленных рейса', 'доставленных рейсов')}</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-sm" data-print-registry>${icon('note', 14)} Реестр</button>
        <a class="btn btn-sm" href="/api/export/deals?format=xlsx">${icon('upload', 14)} Excel</a>
        <a class="btn btn-sm" href="/api/export/deals?format=csv">${icon('upload', 14)} CSV</a>
      </div>
    </div>

    <div class="period-bar">
      <div class="preset-row">
        ${[1, 3, 6, 12].map((n) => `<button class="preset${period.preset === n && !period.from ? ' active' : ''}" data-preset="${n}">${n === 1 ? 'Этот месяц' : n === 12 ? 'Год' : `${n} мес.`}</button>`).join('')}
      </div>
      <div class="period-dates">
        <label>с <input type="date" data-from value="${esc(report.period.from)}"></label>
        <label>по <input type="date" data-to value="${esc(report.period.to)}"></label>
        <button class="btn btn-sm" data-apply>Показать</button>
      </div>
    </div>

    <div class="kpi-grid reports-kpi">
      ${kpi('Выручка', fmtShort(totals.revenue), `${totals.trips} ${plural(totals.trips, 'рейс', 'рейса', 'рейсов')} · средний чек ${fmtShort(totals.avg_check)}`, 'money', 'green')}
      ${kpi('Расходы', fmtShort(totals.expenses), `включая субподряд и топливо`, 'wallet', 'amber')}
      ${kpi('Маржа', fmtShort(totals.margin), `маржинальность ${pctText(totals.margin_pct)}`, 'chart', 'indigo')}
      ${kpi('Дебиторка', fmtShort(totals.debt), totals.debt_overdue
        ? `<span class="bad">просрочено ${fmtShort(totals.debt_overdue)}</span>`
        : 'все счета в срок', 'money', 'blue')}
    </div>

    <section class="card">
      <div class="card-head">
        <div>
          <div class="card-title">Выручка и маржа по месяцам</div>
          <div class="card-sub">Оплата рейсов учитывается отдельно — ${fmtMoney(totals.paid)} получено за период</div>
        </div>
      </div>
      <div class="card-body">${monthlyChart}</div>
    </section>

    <div class="reports-grid">
      <section class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Рентабельность направлений</div>
            <div class="card-sub">Топ по выручке за период</div>
          </div>
        </div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Направление</th><th class="num">Выручка</th><th class="num hide-sm">Маржа</th><th class="num">Маржа %</th><th class="num hide-sm">Ставка</th></tr></thead>
          <tbody>${directionRows}</tbody>
        </table></div>
      </section>

      <section class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Топ клиентов</div>
            <div class="card-sub">Выручка и маржинальность</div>
          </div>
        </div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Клиент</th><th class="num">Выручка</th><th class="num">Маржа %</th></tr></thead>
          <tbody>${clientRows}</tbody>
        </table></div>
      </section>
    </div>

    <div class="reports-grid">
      <section class="card">
        <div class="card-head">
          <div>
            <div class="card-title">По менеджерам</div>
            <div class="card-sub">Кто сколько закрыл за период</div>
          </div>
        </div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Менеджер</th><th class="num">Рейсы</th><th class="num">Выручка</th><th class="num">Маржа</th></tr></thead>
          <tbody>${managerRows}</tbody>
        </table></div>
      </section>

      <section class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Конверсия заявок</div>
            <div class="card-sub">Заявки, созданные за период</div>
          </div>
        </div>
        <div class="card-body">
          <div class="conversion">
            <div class="conversion-ring" style="--pct:${Math.max(0, Math.min(100, Number(req.conversion) || 0))}">
              <b>${pctText(req.conversion)}</b>
              <span>в рейс</span>
            </div>
            <div class="conversion-stats">
              <div><span>Всего заявок</span><b>${req.total || 0}</b></div>
              <div><span>Преобразовано</span><b class="good">${req.converted || 0}</b></div>
              <div><span>В работе</span><b>${req.open || 0}</b></div>
              <div><span>Отклонено</span><b class="bad">${req.rejected || 0}</b></div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <section class="card">
      <div class="card-head">
        <div>
          <div class="card-title">Должники</div>
          <div class="card-sub">${debtors.summary && debtors.summary.count
            ? `${debtors.summary.count} ${plural(debtors.summary.count, 'счёт', 'счёта', 'счетов')} · ${fmtMoney(debtors.summary.total)}`
            : 'Просроченной дебиторки нет'}</div>
        </div>
      </div>
      <div class="card-body tight">${debtorItems || emptyState('check', 'Все счета оплачены', 'Дебиторская задолженность отсутствует.')}</div>
    </section>
  `;

  root.querySelectorAll('[data-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      period.preset = Number(button.dataset.preset);
      period.from = '';
      period.to = '';
      refresh();
    });
  });

  root.querySelector('[data-apply]').addEventListener('click', () => {
    const from = root.querySelector('[data-from]').value;
    const to = root.querySelector('[data-to]').value;
    if (!from || !to) {
      toast('Укажите начало и конец периода', 'error');
      return;
    }
    if (from > to) {
      toast('Начало периода позже окончания', 'error');
      return;
    }
    period.from = from;
    period.to = to;
    refresh();
  });

  root.querySelector('[data-print-registry]').addEventListener('click', () => {
    const params = new URLSearchParams({ from: report.period.from, to: report.period.to });
    window.open('/api/print/registry?' + params.toString(), '_blank', 'noopener');
  });
}
