import { api } from './api.js';
import { bindLangToggle, initI18n, tr } from './i18n.js';
import { state, loadTeam } from './store.js';
import { avatar, closeDrawer, esc, icon, ROLES, toast } from './ui.js';
import { clearReminders, initReminders, refreshReminders } from './reminders.js';
import { closeSearch, initSearch } from './search.js';
import * as dashboardView from './views/dashboard.js';
import * as requestsView from './views/requests.js';
import * as dealsView from './views/deals.js';
import * as clientsView from './views/clients.js';
import * as tasksView from './views/tasks.js';
import * as teamView from './views/team.js';
import * as tripView from './views/trip.js';
import * as fleetView from './views/fleet.js';
import * as reportsView from './views/reports.js';
import * as contractorsView from './views/contractors.js';
import * as settingsView from './views/settings.js';

const ROUTES = {
  dashboard: { title: 'Главное меню', icon: 'grid', render: dashboardView.render, roles: ['admin', 'head', 'manager'] },
  reports: { title: 'Отчёты', icon: 'chart', render: reportsView.render, roles: ['admin', 'head', 'manager'] },
  requests: { title: 'Заявки', icon: 'note', render: requestsView.render, roles: ['admin', 'head', 'manager'] },
  deals: { title: 'Перевозки', icon: 'deals', render: dealsView.render, roles: ['admin', 'head', 'manager'] },
  clients: { title: 'Клиенты', icon: 'clients', render: clientsView.render, roles: ['admin', 'head', 'manager'] },
  contractors: { title: 'Подрядчики', icon: 'handshake', render: contractorsView.render, roles: ['admin', 'head', 'manager'] },
  tasks: { title: 'Задачи', icon: 'tasks', render: tasksView.render, roles: ['admin', 'head', 'manager'] },
  trip: { title: 'Мои рейсы', icon: 'deals', render: tripView.render, roles: ['driver'] },
  fleet: { title: 'Автопарк', icon: 'repair', render: fleetView.render, roles: ['admin', 'head', 'mechanic'] },
  team: { title: 'Команда', icon: 'team', render: teamView.render, roles: ['admin', 'head'] },
  settings: { title: 'Настройки', icon: 'building', render: settingsView.render, roles: ['admin', 'head'] },
};

function defaultRoute() {
  if (!state.user) return 'deals';
  if (state.user.role === 'driver') return 'trip';
  if (state.user.role === 'mechanic') return 'fleet';
  return 'deals';
}

const loginEl = document.getElementById('login');
const shellEl = document.getElementById('shell');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const loginButton = document.getElementById('login-submit');
const registerForm = document.getElementById('register-form');
const registerError = document.getElementById('register-error');
const registerButton = document.getElementById('register-submit');
const navEl = document.getElementById('nav');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebar-overlay');
const viewEl = document.getElementById('view');

function showLogin() {
  loginEl.classList.remove('hidden');
  shellEl.classList.add('hidden');
  closeDrawer();
}

function showShell() {
  loginEl.classList.add('hidden');
  shellEl.classList.remove('hidden');
}

function closeMobileNav() {
  sidebar.classList.remove('open');
  overlay.classList.remove('show');
}

function navLink(key, route) {
  return `<a href="#/${key}" data-route="${key}">${icon(route.icon, 18)}<span>${route.title}</span></a>`;
}

function renderShell() {
  const user = state.user;
  const allowed = Object.entries(ROUTES).filter(([, route]) => route.roles.includes(user.role));
  const mainKeys = user.role === 'driver'
    ? ['trip']
    : user.role === 'mechanic'
      ? ['fleet']
      : ['dashboard', 'reports', 'requests', 'deals', 'clients', 'contractors', 'tasks', 'fleet'];
  const main = allowed.filter(([key]) => mainKeys.includes(key));
  const admin = allowed.filter(([key]) => !mainKeys.includes(key));

  navEl.innerHTML = `<div class="nav-label">Рабочее пространство</div>`
    + main.map(([key, route]) => navLink(key, route)).join('')
    + (admin.length ? `<div class="nav-label">Доступ и роли</div>` + admin.map(([key, route]) => navLink(key, route)).join('') : '');

  document.getElementById('sidebar-user').innerHTML = `
    ${avatar(user.name, 'lg')}
    <div class="user-card-meta">
      <div class="user-card-name">${esc(user.name)}</div>
      <div class="user-card-role">${ROLES[user.role] || user.role}</div>
    </div>`;

  document.getElementById('topbar-user').innerHTML = `
    ${avatar(user.name, 'sm')}
    <span class="user-name">${esc(user.name)}</span>`;

  document.getElementById('topbar-role').textContent = ROLES[user.role] || user.role;
}

function enterApp(user) {
  state.user = user;
  showShell();
  renderShell();
  const searchBtn = document.getElementById('search-btn');
  if (searchBtn) searchBtn.classList.toggle('hidden', user.role === 'driver' || user.role === 'mechanic');
  if (!location.hash) history.replaceState(null, '', '#/' + defaultRoute());
  if (user.role !== 'driver' && user.role !== 'mechanic') loadTeam();
  refreshReminders();
  window.scrollTo(0, 0);
  handleRoute();
}

let lastRoute = null;

async function handleRoute() {
  if (!state.user) return;
  const raw = location.hash.replace(/^#\/?/, '') || 'deals';
  const route = ROUTES[raw];
  if (!route) {
    history.replaceState(null, '', '#/' + defaultRoute());
    handleRoute();
    return;
  }
  if (!route.roles.includes(state.user.role)) {
    history.replaceState(null, '', '#/' + defaultRoute());
    handleRoute();
    return;
  }

  if (lastRoute !== raw) window.scrollTo(0, 0);
  lastRoute = raw;

  document.querySelectorAll('#nav a').forEach((link) => {
    link.classList.toggle('active', link.dataset.route === raw);
  });
  document.getElementById('crumb-current').textContent = tr(route.title);
  document.title = `${tr(route.title)} · mslklogistic`;

  const page = document.createElement('div');
  page.className = 'page';
  viewEl.replaceChildren(page);
  closeMobileNav();

  try {
    await route.render(page);
  } catch (err) {
    page.innerHTML = `<div class="card"><div class="card-body">
      <div class="empty">
        <span class="empty-icon">${icon('alert', 20)}</span>
        <span class="empty-title">Что-то пошло не так</span>
        <span class="empty-text">${esc(err.message || 'Не удалось открыть раздел')}</span>
      </div>
    </div></div>`;
  }
}

function bindStaticHandlers() {
  function setAuthMode(mode) {
    const registration = mode === 'register';
    loginForm.classList.toggle('hidden', registration);
    registerForm.classList.toggle('hidden', !registration);
    loginError.classList.remove('show');
    registerError.classList.remove('show');
    const focus = document.getElementById(registration ? 'reg-name' : 'email');
    if (focus) focus.focus();
  }

  document.getElementById('show-register').addEventListener('click', () => setAuthMode('register'));
  document.getElementById('show-login').addEventListener('click', () => setAuthMode('login'));

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    loginError.classList.remove('show');
    loginButton.disabled = true;
    loginButton.textContent = 'Входим…';
    try {
      const { user } = await api.post('/auth/login', { email, password });
      loginForm.reset();
      enterApp(user);
    } catch (err) {
      loginError.textContent = err.message || 'Не удалось войти';
      loginError.classList.add('show');
    } finally {
      loginButton.disabled = false;
      loginButton.textContent = 'Войти';
    }
  });

  registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    registerError.classList.remove('show');
    registerButton.disabled = true;
    registerButton.textContent = 'Создаём…';
    try {
      const { user } = await api.post('/auth/register', { name, email, password });
      registerForm.reset();
      setAuthMode('login');
      enterApp(user);
    } catch (err) {
      registerError.textContent = err.message || 'Не удалось создать аккаунт';
      registerError.classList.add('show');
    } finally {
      registerButton.disabled = false;
      registerButton.textContent = 'Создать аккаунт';
    }
  });

  document.querySelectorAll('.demo-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.getElementById('email').value = chip.dataset.email;
      document.getElementById('password').value = chip.dataset.password;
      loginError.classList.remove('show');
    });
  });

  document.getElementById('logout').addEventListener('click', async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      /* ignore */
    }
    state.user = null;
    state.team = [];
    clearReminders();
    closeSearch();
    history.replaceState(null, '', location.pathname);
    showLogin();
  });

  document.getElementById('burger').addEventListener('click', () => {
    sidebar.classList.add('open');
    overlay.classList.add('show');
  });
  overlay.addEventListener('click', closeMobileNav);

  window.addEventListener('hashchange', () => {
    if (state.user) handleRoute();
  });

  window.addEventListener('crm:refresh', () => {
    if (state.user) {
      handleRoute();
      refreshReminders();
    }
  });

  window.addEventListener('auth:expired', () => {
    if (!state.user) return;
    state.user = null;
    state.team = [];
    clearReminders();
    showLogin();
    toast('Сессия истекла — войдите снова', 'error');
  });
}

async function boot() {
  initI18n();
  bindLangToggle();
  bindStaticHandlers();
  initReminders();
  initSearch();
  try {
    const { user } = await api.get('/auth/me');
    if (user) enterApp(user);
    else showLogin();
  } catch (err) {
    showLogin();
  }
  document.getElementById('boot').classList.add('hidden');
}

boot();
