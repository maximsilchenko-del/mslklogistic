import { api } from '../api.js';
import { state, loadTeam } from '../store.js';
import { openTaskForm } from '../forms.js';
import {
  dueLabel, emptyState, esc, icon, loader, priorityChip, refresh, toast, todayISO,
} from '../ui.js';

let activeFilter = 'all';

const FILTERS = [
  { id: 'all', title: 'Все' },
  { id: 'today', title: 'Сегодня' },
  { id: 'overdue', title: 'Просроченные' },
  { id: 'done', title: 'Выполненные' },
];

function bucketOf(task) {
  if (task.done) return 'done';
  const due = task.due_date ? String(task.due_date).slice(0, 10) : '';
  if (!due) return 'nodue';
  if (due < todayISO()) return 'overdue';
  if (due === todayISO()) return 'today';
  return 'upcoming';
}

function taskRow(task, showAssignee) {
  const due = dueLabel(task.due_date, task.done);
  const meta = [
    priorityChip(task.priority),
    `<span class="${due.late ? 'late' : ''}">${icon('calendar', 12)} ${esc(due.text)}</span>`,
  ];
  if (task.client_name) meta.push(`<span data-raw>${esc(task.client_name)}</span>`);
  if (task.deal_title) meta.push(`<span data-raw>· ${esc(task.deal_title)}</span>`);
  if (showAssignee && task.assignee_name) meta.push(`<span data-raw>· ${esc(task.assignee_name)}</span>`);

  return `<div class="task-row ${task.done ? 'done' : ''}">
    <button class="task-check" data-task-toggle="${task.id}" aria-label="${task.done ? 'Вернуть в работу' : 'Выполнить задачу'}">${icon('check', 11)}</button>
    <div class="task-main">
      <div class="task-title" data-task-open="${task.id}" data-raw>${esc(task.title)}</div>
      <div class="task-meta">${meta.join(' ')}</div>
    </div>
  </div>`;
}

export async function render(root) {
  root.innerHTML = loader();
  let tasks = [];
  try {
    const [tasksData] = await Promise.all([
      api.get('/tasks'),
      state.user.role === 'manager' ? Promise.resolve(null) : loadTeam(),
    ]);
    tasks = tasksData.tasks;
  } catch (err) {
    root.innerHTML = `<div class="card"><div class="card-body">${emptyState('alert', 'Не удалось загрузить задачи', err.message)}</div></div>`;
    return;
  }

  const byId = new Map(tasks.map((task) => [String(task.id), task]));
  const showAssignee = state.user.role !== 'manager';
  const open = tasks.filter((task) => !task.done);
  const overdue = tasks.filter((task) => bucketOf(task) === 'overdue');
  const today = tasks.filter((task) => bucketOf(task) === 'today');

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="page-title">Задачи</h1>
        <p class="page-sub">${open.length} активных · ${today.length} на сегодня${overdue.length ? ` · <span style="color:var(--danger);font-weight:600">${overdue.length} просрочено</span>` : ''}</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" data-new-task>${icon('plus', 16)} Новая задача</button>
      </div>
    </div>

    <div class="toolbar">
      <div class="segmented" data-filters>
        ${FILTERS.map((filter) => `<button type="button" class="${activeFilter === filter.id ? 'active' : ''}" data-filter="${filter.id}">${filter.title}</button>`).join('')}
      </div>
    </div>

    <section class="card" data-tasks-card></section>
  `;

  const card = root.querySelector('[data-tasks-card]');
  const filtersEl = root.querySelector('[data-filters]');

  function paint() {
    const visible = tasks.filter((task) => {
      if (activeFilter === 'all') return true;
      if (activeFilter === 'today') return bucketOf(task) === 'today';
      if (activeFilter === 'overdue') return bucketOf(task) === 'overdue';
      if (activeFilter === 'done') return task.done;
      return true;
    });

    if (!visible.length) {
      const messages = {
        all: ['Задач пока нет', 'Создайте задачу, чтобы держать следующий шаг под контролем.'],
        today: ['На сегодня задач нет', 'Отличная возможность заняться перевозками.'],
        overdue: ['Просроченных задач нет', 'Все сроки соблюдены.'],
        done: ['Выполненных задач пока нет', 'Отмечайте задачи галочкой, и они появятся здесь.'],
      };
      const [title, text] = messages[activeFilter] || messages.all;
      card.innerHTML = emptyState('tasks', title, text);
    } else if (activeFilter === 'all') {
      const groups = [
        { id: 'overdue', title: 'Просроченные' },
        { id: 'today', title: 'Сегодня' },
        { id: 'upcoming', title: 'Предстоящие' },
        { id: 'nodue', title: 'Без срока' },
        { id: 'done', title: 'Выполненные' },
      ];
      card.innerHTML = groups.map((group) => {
        const items = visible.filter((task) => bucketOf(task) === group.id);
        if (!items.length) return '';
        return `<div class="task-section-title">${group.title}<span class="count">${items.length}</span></div>
          <div class="card-body tight">${items.map((task) => taskRow(task, showAssignee)).join('')}</div>`;
      }).join('');
    } else {
      card.innerHTML = `<div class="card-body tight">${visible.map((task) => taskRow(task, showAssignee)).join('')}</div>`;
    }

    card.querySelectorAll('[data-task-toggle]').forEach((button) => {
      button.addEventListener('click', async () => {
        const task = byId.get(button.dataset.taskToggle);
        if (!task) return;
        try {
          await api.patch('/tasks/' + task.id, { done: !task.done });
          toast(task.done ? 'Задача возвращена в работу' : 'Задача выполнена', 'success');
          refresh();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });

    card.querySelectorAll('[data-task-open]').forEach((title) => {
      title.addEventListener('click', () => {
        const task = byId.get(title.dataset.taskOpen);
        if (task) openTaskForm(task);
      });
    });
  }

  filtersEl.querySelectorAll('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      activeFilter = button.dataset.filter;
      filtersEl.querySelectorAll('[data-filter]').forEach((item) => {
        item.classList.toggle('active', item.dataset.filter === activeFilter);
      });
      paint();
    });
  });

  root.querySelector('[data-new-task]').addEventListener('click', () => openTaskForm());
  paint();
}
