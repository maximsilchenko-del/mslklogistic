import { api } from '../api.js';
import { state } from '../store.js';
import { openUserForm } from '../forms.js';
import { avatar, emptyState, esc, fmtDate, icon, loader, plural, ROLES, toast } from '../ui.js';

export async function render(root) {
  root.innerHTML = loader();
  let users = [];
  try {
    users = (await api.get('/users')).users;
  } catch (err) {
    root.innerHTML = `<div class="card"><div class="card-body">${emptyState('alert', 'Не удалось загрузить команду', err.message)}</div></div>`;
    return;
  }

  const isAdmin = state.user.role === 'admin';
  const activeCount = users.filter((user) => user.active).length;
  const staff = users.filter((user) => user.role === 'manager').length;
  const heads = users.filter((user) => user.role === 'head').length;
  const drivers = users.filter((user) => user.role === 'driver').length;
  const mechanics = users.filter((user) => user.role === 'mechanic').length;

  const rows = users.map((user) => `<tr class="${isAdmin ? 'clickable' : ''}" data-user-id="${user.id}">
    <td>
      <div class="owner-cell">
        ${avatar(user.name, 'sm')}
        <div>
          <div class="cell-title">${esc(user.name)}${user.id === state.user.id ? ' <span class="chip" style="margin-left:4px">это вы</span>' : ''}</div>
          <div class="cell-sub">${esc(user.email)}</div>
        </div>
      </div>
    </td>
    <td><span class="chip role-${user.role}">${ROLES[user.role] || user.role}</span></td>
    <td><span class="chip ${user.active ? 'status-on' : 'status-off'}">${user.active ? 'Активен' : 'Отключён'}</span></td>
    <td class="hide-sm">${fmtDate(user.created_at, true)}</td>
    ${isAdmin ? `<td style="text-align:right"><span class="icon-btn sm" title="Изменить">${icon('edit', 15)}</span></td>` : ''}
  </tr>`).join('');

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="page-title">Команда</h1>
        <p class="page-sub">${users.length} ${plural(users.length, 'участник', 'участника', 'участников')} · ${activeCount} ${plural(activeCount, 'активен', 'активны', 'активны')} · ${heads} ${plural(heads, 'руководитель', 'руководителя', 'руководителей')} · ${staff} ${plural(staff, 'менеджер', 'менеджера', 'менеджеров')}${drivers ? ` · ${drivers} ${plural(drivers, 'водитель', 'водителя', 'водителей')}` : ''}${mechanics ? ` · ${mechanics} ${plural(mechanics, 'механик', 'механика', 'механиков')}` : ''}</p>
      </div>
      ${isAdmin ? `<div class="page-actions"><button class="btn btn-primary" data-new-user>${icon('plus', 16)} Добавить пользователя</button></div>` : ''}
    </div>

    ${isAdmin ? '' : `<div class="notice" style="margin-bottom:16px">${icon('alert', 16)}<div>Режим просмотра: управление пользователями и ролями доступно администратору.</div></div>`}

    <section class="card">
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Пользователь</th>
              <th>Роль</th>
              <th>Статус</th>
              <th class="hide-sm">В системе с</th>
              ${isAdmin ? '<th></th>' : ''}
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="5">${emptyState('team', 'Нет пользователей', '')}</td></tr>`}</tbody>
        </table>
      </div>
    </section>
  `;

  if (isAdmin) {
    root.querySelector('[data-new-user]').addEventListener('click', () => openUserForm());
    root.querySelectorAll('[data-user-id]').forEach((row) => {
      row.addEventListener('click', () => {
        const user = users.find((item) => String(item.id) === row.dataset.userId);
        if (user) openUserForm(user);
      });
    });
  }
}
