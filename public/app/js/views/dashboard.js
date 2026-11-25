import { api } from '../api.js';
import { getLang } from '../i18n.js';
import { state } from '../store.js';
import { openDealForm, openTaskForm } from '../forms.js';
import {
  avatar, barChart, dueLabel, emptyState, esc, fmtMoney, fmtPct, fmtShort, greeting,
  icon, loader, ownerCell, plural, refresh, relTime, stageChip, STAGES, toast,
} from '../ui.js';

const FEED_ICONS = {
  deal: 'deals',
  won: 'check',
  client: 'building',
  task: 'tasks',
  user: 'team',
  note: 'note',
};

function kpi(label, value, sub, iconName, tone) {
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
  let data;
  try {
    data = (await api.get('/dashboard')).dashboard;
  } catch (err) {
    root.innerHTML = `<div class="card"><div class="card-body">${emptyState('alert', 'Не удалось загрузить главное меню', err.message)}</div></div>`;
    return;
  }

  const totals = data.totals;
  const dealsById = new Map(data.recent_deals.map((deal) => [String(deal.id), deal]));
  const tasksById = new Map(data.my_tasks.map((task) => [String(task.id), task]));
  const maxAmount = Math.max(...STAGES.map((stage) => (data.pipeline[stage.id] || {}).amount || 0), 1);
  const dateLine = new Intl.DateTimeFormat(getLang() === 'en' ? 'en-US' : 'ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  const dateText = dateLine.charAt(0).toUpperCase() + dateLine.slice(1);
  const firstName = (state.user.name || '').split(' ')[0];
  const overdueNote = totals.tasks_overdue
    ? ` · <span class="warn">${totals.tasks_overdue} просрочено</span>`
    : '';

  const pipelineRows = STAGES.map((stage) => {
    const info = data.pipeline[stage.id] || { count: 0, amount: 0 };
    const width = info.amount > 0 ? Math.max(3, Math.round((info.amount / maxAmount) * 100)) : 0;
    return `<div class="pipe-row">
      <span class="pipe-name"><span class="dot" style="background:${stage.color}"></span>${stage.title}</span>
      <span class="track"><span class="fill" style="width:${width}%;background:${stage.color}"></span></span>
      <span class="pipe-side">${fmtShort(info.amount)}<small>${info.count}</small></span>
    </div>`;
  }).join('');

  const recentRows = data.recent_deals.map((deal) => `<tr class="clickable" data-deal-id="${deal.id}">
      <td>
        <div class="cell-title" data-raw>${esc(deal.title)}</div>
        <div class="cell-sub">${deal.cargo ? `<span data-raw>${esc(deal.cargo)}</span>` : 'Груз не указан'} · ${deal.client_name ? `<span data-raw>${esc(deal.client_name)}</span>` : 'Без клиента'}</div>
      </td>
      <td>${stageChip(deal.stage)}</td>
      <td class="num">${fmtMoney(deal.amount)}</td>
      <td class="hide-sm">${ownerCell(deal.owner_name)}</td>
    </tr>`).join('');

  const taskRows = data.my_tasks.map((task) => {
    const due = dueLabel(task.due_date, false);
    return `<div class="task-row" data-task-row="${task.id}">
      <button class="task-check" data-task-toggle="${task.id}" aria-label="Выполнить задачу">${icon('check', 11)}</button>
      <div class="task-main">
        <div class="task-title" data-task-open="${task.id}" data-raw>${esc(task.title)}</div>
        <div class="task-meta">
          <span class="${due.late ? 'late' : ''}">${icon('calendar', 12)} ${esc(due.text)}</span>
          ${task.client_name ? `<span data-raw>· ${esc(task.client_name)}</span>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');

  const feedItems = data.feed.map((item) => `<div class="feed-item">
      <span class="feed-icon ${esc(item.kind)}">${icon(FEED_ICONS[item.kind] || 'note', 15)}</span>
      <div>
        <div class="feed-text" data-raw>${esc(item.text)}</div>
        <div class="feed-time">${esc(item.actor_name || 'Система')} · ${esc(relTime(item.created_at))}</div>
      </div>
    </div>`).join('');

  const leadersHtml = data.leaders && data.leaders.length
    ? `<div class="leaders" style="margin-top:16px">
        ${data.leaders.map((leader, index) => `<div class="leader">
          ${avatar(leader.name, 'lg')}
          <div class="leader-meta">
            <div class="leader-name">${esc(leader.name)}</div>
            <div class="leader-sum">${fmtShort(leader.won_amount)} · ${leader.won_count} ${plural(leader.won_count, 'перевозка', 'перевозки', 'перевозок')}</div>
          </div>
          <span class="leader-rank">#${index + 1}</span>
        </div>`).join('')}
      </div>`
    : '';

  const weekly = data.weekly || [];
  const chartHtml = weekly.some((week) => week.revenue || week.margin)
    ? barChart(weekly, { height: 200 })
    : emptyState('chart', 'Пока нет закрытых рейсов', 'График появится после первой доставленной перевозки.');

  const attention = data.attention || { total: 0, items: [] };
  const attentionHtml = attention.items.length
    ? attention.items.map((item) => `<a class="attention-item attention-${esc(item.level || 'warning')}" href="#/${esc(item.route || 'dashboard')}">
        <span class="attention-dot"></span>
        <span class="attention-main">
          <span class="attention-title">${esc(item.title)}</span>
          ${item.text ? `<span class="attention-text">${esc(item.text)}</span>` : ''}
        </span>
        <span class="attention-group">${esc(item.group || '')}</span>
      </a>`).join('')
    : `<div class="attention-empty">${icon('check', 18)}<span>Просрочек, долгов и зависших заявок нет — всё под контролем.</span></div>`;

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="page-title">${greeting()}, ${esc(firstName)}</h1>
        <p class="page-sub">${esc(dateText)} · вот что происходит в перевозках</p>
      </div>
      <div class="page-actions">
        <button class="btn" data-new-task>${icon('tasks', 15)} Задача</button>
        <button class="btn btn-primary" data-new-deal>${icon('plus', 16)} Новая перевозка</button>
      </div>
    </div>

    <div class="kpi-grid">
      ${kpi('Выручка', fmtShort(totals.won_amount), `${totals.won_count} ${plural(totals.won_count, 'доставленная перевозка', 'доставленные перевозки', 'доставленных перевозок')}`, 'money', 'green')}
      ${kpi('Перевозки в работе', fmtShort(totals.pipeline_amount), `${totals.pipeline_count} ${plural(totals.pipeline_count, 'заявка', 'заявки', 'заявок')} в работе`, 'deals', 'indigo')}
      ${kpi('Клиенты', totals.clients, totals.new_clients ? `<span class="good">+${totals.new_clients}</span> за 30 дней` : 'в клиентской базе', 'clients', 'blue')}
      ${kpi('Задачи в работе', totals.tasks_open, `${totals.tasks_today} на сегодня${overdueNote}`, 'tasks', 'amber')}
    </div>

    <div class="dash-overview">
      <section class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Выручка и маржа по неделям</div>
            <div class="card-sub">Доставленные перевозки · последние 8 недель · долг ${fmtShort(totals.debt_total || 0)}</div>
          </div>
          <a class="btn btn-sm" href="#/reports">Отчёты ${icon('arrow', 14)}</a>
        </div>
        <div class="card-body">${chartHtml}</div>
      </section>

      <section class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Требует внимания</div>
            <div class="card-sub">${attention.total
              ? `${attention.total} ${plural(attention.total, 'сигнал', 'сигнала', 'сигналов')}`
              : 'Нет срочных дел'}</div>
          </div>
          <a class="btn btn-sm" href="#/reports">Дебиторка</a>
        </div>
        <div class="card-body tight">${attentionHtml}</div>
      </section>
    </div>

    <div class="dash-grid">
      <div class="stack">
        <section class="card">
          <div class="card-head">
            <div>
              <div class="card-title">Этапы перевозок</div>
              <div class="card-sub">Стоимость перевозок по этапам</div>
            </div>
            <a class="btn btn-sm" href="#/deals">Открыть канбан ${icon('arrow', 14)}</a>
          </div>
          <div class="card-body">${pipelineRows}</div>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <div class="card-title">Финансы доставленных перевозок</div>
              <div class="card-sub">Доход, расходы и итоговая маржа</div>
            </div>
            <a class="btn btn-sm" href="#/deals">Перевозки ${icon('arrow', 14)}</a>
          </div>
          <div class="card-body">
            <div class="dash-finance">
              <div><span>Доход</span><b>${fmtShort(totals.won_amount)}</b></div>
              <div><span>Расходы</span><b>${fmtShort(totals.won_expenses || 0)}</b></div>
              <div><span>Маржа</span><b class="${Number(totals.won_margin) < 0 ? 'bad' : 'good'}">${fmtShort(totals.won_margin || 0)}</b></div>
              <div class="dash-finance-note">${totals.won_count
                ? `Средняя маржинальность ${fmtPct(totals.won_margin_pct ?? 0)} · ${totals.won_count} ${plural(totals.won_count, 'рейс', 'рейса', 'рейсов')}`
                : 'Доставленных перевозок пока нет — маржа появится после закрытия первого рейса.'}</div>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div class="card-title">Последние перевозки</div>
            <a class="btn btn-sm" href="#/deals">Все перевозки</a>
          </div>
          ${data.recent_deals.length
            ? `<div class="table-wrap"><table class="table">
                 <thead><tr><th>Перевозка</th><th>Этап</th><th class="num">Стоимость</th><th class="hide-sm">Ответственный</th></tr></thead>
                 <tbody>${recentRows}</tbody>
               </table></div>`
            : emptyState('deals', 'Перевозок пока нет', 'Создайте первую перевозку, чтобы увидеть её здесь.')}
        </section>
      </div>

      <div class="stack">
        <section class="card">
          <div class="card-head">
            <div>
              <div class="card-title">Мои задачи</div>
              <div class="card-sub">${data.my_tasks.length ? 'Ближайшие напоминания' : 'Всё под контролем'}</div>
            </div>
            <a class="btn btn-sm" href="#/tasks">Все</a>
          </div>
          <div class="card-body tight">
            ${data.my_tasks.length ? taskRows : emptyState('tasks', 'Нет активных задач', 'Добавьте задачу, чтобы не забыть про следующий шаг.')}
          </div>
        </section>

        <section class="card">
          <div class="card-head"><div class="card-title">Лента событий</div></div>
          <div class="card-body tight">${feedItems || emptyState('note', 'Событий пока нет', '')}</div>
        </section>
      </div>
    </div>
    ${leadersHtml}
  `;

  root.querySelector('[data-new-deal]').addEventListener('click', () => openDealForm());
  root.querySelector('[data-new-task]').addEventListener('click', () => openTaskForm());

  root.querySelectorAll('[data-deal-id]').forEach((row) => {
    row.addEventListener('click', () => {
      const deal = dealsById.get(row.dataset.dealId);
      if (deal) openDealForm(deal);
    });
  });

  root.querySelectorAll('[data-task-toggle]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await api.patch('/tasks/' + button.dataset.taskToggle, { done: true });
        toast('Задача выполнена', 'success');
        refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });

  root.querySelectorAll('[data-task-open]').forEach((title) => {
    title.addEventListener('click', () => {
      const task = tasksById.get(title.dataset.taskOpen);
      if (task) openTaskForm(task);
    });
  });
}
