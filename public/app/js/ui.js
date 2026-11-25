/* Shared UI helpers: icons, formatting, drawers, toasts, dialogs. */

import { getLang } from './i18n.js';

const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/>',
  deals: '<path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  route: '<path d="M9 20l-5.5 2V6L9 4l6 2 5.5-2v16L15 22z"/><path d="M9 4v16M15 6v16"/>',
  box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  clients: '<path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  tasks: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  team: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c1 .3 2 .6 3 .7a2 2 0 0 1 1.6 2z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="M22 7l-10 7L2 7"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  money: '<rect x="2" y="6" width="20" height="12" rx="3"/><circle cx="12" cy="12" r="2.4"/><path d="M6 12h.01M18 12h.01"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/>',
  note: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  repair: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-2.7-2.7z"/><path d="M17 4l3 3"/>',
  gauge: '<path d="M4 19a8 8 0 1 1 16 0"/><path d="M12 15l4-4"/><circle cx="12" cy="19" r="1.4"/>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-2.7-2.7z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  wallet: '<path d="M20 7H5a2 2 0 0 1 0-4h13v4"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1"/><path d="M17 13h.01"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  handshake: '<path d="M11 17l2 2a2 2 0 0 0 3-3l-4-4"/><path d="M14 14l2.5 2.5a2 2 0 0 0 3-3L15 9"/><path d="M8 12l-3 3a2 2 0 0 0 3 3l3-3"/><path d="M2 8l4-4 5 3 5-3 4 4-3 3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};

export function icon(name, size = 18) {
  const body = ICONS[name] || ICONS.note;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

/* ------------------------------------------------------------- formatting */

const moneyFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0,
});

const moneyFormatterEn = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtMoney(value) {
  if (getLang() === 'en') return moneyFormatterEn.format(Number(value) || 0) + ' ₽';
  return moneyFormatter.format(Number(value) || 0).replace(/\u00a0/g, ' ');
}

export function fmtShort(value) {
  const n = Number(value) || 0;
  const trimEn = (str) => str.replace(/\.?0+$/, '');
  const trimRu = (str) => str.replace(/\.?0+$/, '').replace('.', ',');
  const trim = getLang() === 'en' ? trimEn : trimRu;
  if (getLang() === 'en') {
    const abs = Math.abs(n);
    if (abs >= 1e9) return trim((n / 1e9).toFixed(2)) + 'B ₽';
    if (abs >= 1e6) return trim((n / 1e6).toFixed(2)) + 'M ₽';
    if (abs >= 1e3) return Math.round(n / 1e3) + 'K ₽';
    return Math.round(n) + ' ₽';
  }
  if (Math.abs(n) >= 1e9) return trim((n / 1e9).toFixed(2)) + ' млрд ₽';
  if (Math.abs(n) >= 1e6) return trim((n / 1e6).toFixed(2)) + ' млн ₽';
  if (Math.abs(n) >= 1e3) return Math.round(n / 1e3) + ' тыс. ₽';
  return Math.round(n) + ' ₽';
}

/** Percent label: 12.5% in English, 12,5% in Russian. */
export function fmtPct(value) {
  if (value === null || value === undefined || value === '') return '—';
  return String(value).replace('.', getLang() === 'en' ? '.' : ',') + '%';
}

function parseIso(value) {
  if (!value) return null;
  const str = String(value);
  const date = new Date(str.length === 10 ? str + 'T00:00:00' : str);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function fmtDate(value, withYear = false) {
  const date = parseIso(value);
  if (!date) return '—';
  const english = getLang() === 'en';
  let out = english
    ? `${MONTHS_EN[date.getMonth()]} ${date.getDate()}`
    : `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  const year = date.getFullYear();
  if (withYear || year !== new Date().getFullYear()) out += english ? `, ${year}` : ` ${year}`;
  return out;
}

export function fmtDateTime(value) {
  const date = parseIso(value);
  if (!date) return '';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const english = getLang() === 'en';
  if (sameDay) return (english ? 'today, ' : 'сегодня, ') + time;
  if (date.toDateString() === yesterday.toDateString()) return (english ? 'yesterday, ' : 'вчера, ') + time;
  return fmtDate(value, true);
}

export function relTime(value) {
  const date = parseIso(value);
  if (!date) return '';
  const diff = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(diff / 60000);
  const english = getLang() === 'en';
  if (minutes < 1) return english ? 'just now' : 'только что';
  if (minutes < 60) return minutes + (english ? ' min ago' : ' мин назад');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + (english ? ' h ago' : ' ч назад');
  const days = Math.floor(hours / 24);
  if (days < 7) return days + (english ? ' d ago' : ' дн назад');
  return fmtDate(value);
}

export function todayISO() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

export function isOverdue(value, done = false) {
  if (!value || done) return false;
  return String(value).slice(0, 10) < todayISO();
}

export function dueLabel(value, done = false) {
  const english = getLang() === 'en';
  if (!value) return { text: english ? 'no due date' : 'без срока', late: false };
  const date = parseIso(value);
  if (!date) return { text: english ? 'no due date' : 'без срока', late: false };
  if (done) return { text: fmtDate(value), late: false };
  const today = new Date(todayISO() + 'T00:00:00');
  const days = Math.round((date - today) / 86400000);
  if (days < 0) {
    return { text: english ? `overdue by ${Math.abs(days)} d.` : `просрочено на ${Math.abs(days)} дн.`, late: true };
  }
  if (days === 0) return { text: english ? 'today' : 'сегодня', late: false };
  if (days === 1) return { text: english ? 'tomorrow' : 'завтра', late: false };
  return { text: fmtDate(value), late: false };
}

export function daysAgoText(value) {
  const date = parseIso(value);
  if (!date) return '';
  const english = getLang() === 'en';
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days <= 0) return english ? 'today' : 'сегодня';
  if (days === 1) return english ? 'yesterday' : 'вчера';
  if (days < 30) return english ? `${days} d. ago` : `${days} дн. назад`;
  if (days < 365) return english ? `${Math.floor(days / 30)} mo ago` : `${Math.floor(days / 30)} мес. назад`;
  return english ? `${Math.floor(days / 365)} y ago` : `${Math.floor(days / 365)} г. назад`;
}

export function greeting() {
  const hour = new Date().getHours();
  const english = getLang() === 'en';
  if (hour < 5) return english ? 'Good night' : 'Доброй ночи';
  if (hour < 12) return english ? 'Good morning' : 'Доброе утро';
  if (hour < 18) return english ? 'Good afternoon' : 'Добрый день';
  return english ? 'Good evening' : 'Добрый вечер';
}

/* ------------------------------------------------------------- people */

const AVATAR_COLORS = [
  'linear-gradient(135deg,#6366f1,#8b5cf6)',
  'linear-gradient(135deg,#0ea5e9,#2563eb)',
  'linear-gradient(135deg,#f59e0b,#f97316)',
  'linear-gradient(135deg,#10b981,#059669)',
  'linear-gradient(135deg,#ec4899,#db2777)',
  'linear-gradient(135deg,#8b5cf6,#d946ef)',
  'linear-gradient(135deg,#14b8a6,#0891b2)',
  'linear-gradient(135deg,#ef4444,#f97316)',
];

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function avatarColor(name) {
  const str = String(name || '');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) hash = (hash * 31 + str.charCodeAt(i)) % 997;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function avatar(name, cls = '') {
  return `<span class="avatar ${cls}" style="background:${avatarColor(name)}" title="${esc(name)}">${esc(initials(name))}</span>`;
}

export const ROLES = {
  admin: 'Администратор',
  head: 'Руководитель',
  manager: 'Менеджер',
  driver: 'Водитель',
  mechanic: 'Механик',
};

export function isFieldRole(role) {
  return role === 'driver' || role === 'mechanic';
}

export const STAGES = [
  { id: 'lead', title: 'Новые заявки', color: '#7c8db5', soft: '#eef1f7' },
  { id: 'qualified', title: 'Расчёт', color: '#2f6fe4', soft: '#eaf2ff' },
  { id: 'proposal', title: 'Подтверждено', color: '#7c4ddb', soft: '#f2edff' },
  { id: 'negotiation', title: 'В пути', color: '#b5760f', soft: '#fdf3e3' },
  { id: 'won', title: 'Доставлено', color: '#0f8f63', soft: '#e8f7f0' },
  { id: 'lost', title: 'Отменено', color: '#7b8095', soft: '#f2f3f6' },
];

export function stageMeta(stage) {
  return STAGES.find((s) => s.id === stage) || STAGES[0];
}

export function stageChip(stage) {
  const meta = stageMeta(stage);
  return `<span class="chip stage-${meta.id}"><span class="dot" style="background:${meta.color}"></span>${meta.title}</span>`;
}

export const PRIORITIES = { low: 'Низкий', normal: 'Обычный', high: 'Высокий' };

export function priorityChip(priority) {
  return `<span class="chip pr-${priority}">${PRIORITIES[priority] || 'Обычный'}</span>`;
}

export const REPAIR_STATUSES = {
  new: 'Новая',
  in_progress: 'В работе',
  done: 'Выполнена',
};

export const REPAIR_URGENCIES = {
  low: 'Не срочно',
  normal: 'Обычная',
  high: 'Срочно',
};

export function repairStatusChip(status) {
  return `<span class="chip repair-status-${status}">${REPAIR_STATUSES[status] || 'Новая'}</span>`;
}

export function repairUrgencyChip(urgency) {
  return `<span class="chip pr-${urgency}">${REPAIR_URGENCIES[urgency] || 'Обычная'}</span>`;
}

export function vehicleText(vehicle) {
  return [vehicle.name, vehicle.plate].filter(Boolean).join(', ');
}

export const TRANSPORT_TYPES = [
  { id: 'ftl', short: 'FTL', title: 'Отдельная машина' },
  { id: 'ltl', short: 'LTL', title: 'Сборный груз' },
  { id: 'ref', short: 'Реф', title: 'Рефрижератор' },
  { id: 'container', short: 'Контейнер', title: 'Контейнер' },
];

export function transportMeta(type) {
  return TRANSPORT_TYPES.find((item) => item.id === type) || TRANSPORT_TYPES[0];
}

export function transportChip(type) {
  const meta = transportMeta(type);
  return `<span class="chip transport">${meta.short}</span>`;
}

const qtyFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const qtyFormatterEn = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

/** Russian plural form: plural(2, 'рейс', 'рейса', 'рейсов') → 'рейса'. */
export function plural(n, one, few, many) {
  const abs = Math.abs(Number(n) || 0) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

export function fmtQty(value) {
  const formatter = getLang() === 'en' ? qtyFormatterEn : qtyFormatter;
  return formatter.format(Number(value) || 0).replace(/\u00a0/g, ' ');
}

export function routeText(deal) {
  const from = deal.route_from || '';
  const to = deal.route_to || '';
  if (!from && !to) return deal.title || '';
  return `${from} → ${to}`;
}

export function ownerCell(name) {
  if (!name) return '<span style="color:var(--muted)">—</span>';
  return `<span class="owner-cell">${avatar(name, 'sm')}${esc(name)}</span>`;
}

/* ------------------------------------------------------------- charts */

export function barChart(series, opts = {}) {
  const items = (series || []).filter(Boolean);
  if (!items.length) return '';
  const width = 560;
  const height = opts.height || 190;
  const padTop = 14;
  const padBottom = 24;
  const padSide = 6;
  const plotH = height - padTop - padBottom;
  const max = Math.max(1, ...items.map((item) => Math.max(Number(item.revenue || 0), Number(item.margin || 0))));
  const groupW = (width - padSide * 2) / items.length;
  const barW = Math.max(3, Math.min(16, groupW / 3.2));
  const y = (value) => padTop + plotH - (Math.max(0, value) / max) * plotH;
  const every = Math.ceil(items.length / 8);
  const grid = [0.25, 0.5, 0.75, 1].map((ratio) => {
    const gy = padTop + plotH - plotH * ratio;
    return `<line class="chart-grid" x1="${padSide}" x2="${width - padSide}" y1="${gy.toFixed(1)}" y2="${gy.toFixed(1)}"/>`
      + `<text class="chart-tick" x="${padSide + 2}" y="${(gy - 3).toFixed(1)}">${fmtShort(max * ratio)}</text>`;
  }).join('');
  const bars = items.map((item, index) => {
    const cx = padSide + groupW * index + groupW / 2;
    const revenue = Number(item.revenue || 0);
    const margin = Number(item.margin || 0);
    const revH = Math.max(1, (revenue / max) * plotH);
    const marH = Math.max(0, (Math.max(margin, 0) / max) * plotH);
    const label = index % every === 0 || index === items.length - 1
      ? `<text class="chart-label" x="${cx.toFixed(1)}" y="${height - 6}">${esc(item.label || '')}</text>`
      : '';
    return `<g><title>${esc(item.label || '')}: выручка ${fmtShort(revenue)} · маржа ${fmtShort(margin)}</title>
      <rect class="chart-revenue" x="${(cx - barW - 1).toFixed(1)}" y="${(padTop + plotH - revH).toFixed(1)}"
            width="${barW.toFixed(1)}" height="${revH.toFixed(1)}" rx="2.5"/>
      <rect class="chart-margin" x="${(cx + 1).toFixed(1)}" y="${(padTop + plotH - marH).toFixed(1)}"
            width="${barW.toFixed(1)}" height="${marH.toFixed(1)}" rx="2.5"/>
      ${label}</g>`;
  }).join('');
  return `<div class="bar-chart">
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Выручка и маржа по периодам">
      ${grid}${bars}
    </svg>
    <div class="chart-legend">
      <span><i class="legend-revenue"></i>Выручка</span>
      <span><i class="legend-margin"></i>Маржа</span>
    </div>
  </div>`;
}

/* ------------------------------------------------------------- states */

export function emptyState(iconName, title, text, actionHtml = '') {
  return `<div class="empty">
    <span class="empty-icon">${icon(iconName, 20)}</span>
    <span class="empty-title">${esc(title)}</span>
    ${text ? `<span class="empty-text">${esc(text)}</span>` : ''}
    ${actionHtml}
  </div>`;
}

export function loader() {
  return '<div class="loading"><div class="spinner"></div></div>';
}

/* ------------------------------------------------------------- forms */

export function formValues(form) {
  const data = {};
  new FormData(form).forEach((value, key) => { data[key] = value; });
  form.querySelectorAll('input[type="checkbox"][name]').forEach((box) => { data[box.name] = box.checked; });
  return data;
}

export function showFormError(form, message) {
  const box = form.querySelector('.form-error');
  if (!box) return;
  box.textContent = message;
  box.classList.add('show');
}

export function clearFormError(form) {
  const box = form.querySelector('.form-error');
  if (box) box.classList.remove('show');
}

/* ------------------------------------------------------------- drawer */

let activeDrawer = null;

export function openDrawer({ title, subtitle = '', body = '', footer = '' }) {
  closeDrawer();
  const root = document.getElementById('drawer-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'drawer-backdrop';
  backdrop.innerHTML = `
    <aside class="drawer" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header class="drawer-head">
        <div>
          <h2 class="drawer-title">${esc(title)}</h2>
          ${subtitle ? `<p class="drawer-sub">${esc(subtitle)}</p>` : ''}
        </div>
        <button class="icon-btn" data-drawer-close aria-label="Закрыть">${icon('x', 18)}</button>
      </header>
      <div class="drawer-body"></div>
      ${footer ? `<footer class="drawer-foot">${footer}</footer>` : ''}
    </aside>`;

  const bodyEl = backdrop.querySelector('.drawer-body');
  bodyEl.innerHTML = body;

  const onKey = (event) => { if (event.key === 'Escape') closeDrawer(); };
  const onBackdrop = (event) => { if (event.target === backdrop) closeDrawer(); };
  backdrop.addEventListener('mousedown', onBackdrop);
  backdrop.querySelector('[data-drawer-close]').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';

  root.appendChild(backdrop);
  const drawer = { backdrop, body: bodyEl, panel: backdrop.querySelector('.drawer') };
  activeDrawer = { ...drawer, onKey, onBackdrop };
  return drawer;
}

export function closeDrawer() {
  if (!activeDrawer) return;
  document.removeEventListener('keydown', activeDrawer.onKey);
  activeDrawer.backdrop.remove();
  document.body.style.overflow = '';
  activeDrawer = null;
}

/* ------------------------------------------------------------- dialog */

export function confirmDialog({ title, message, confirmText = 'Удалить', danger = true }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" role="alertdialog" aria-modal="true">
        <h3>${esc(title)}</h3>
        <p>${esc(message)}</p>
        <div class="modal-actions">
          <button class="btn" data-cancel>Отмена</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${esc(confirmText)}</button>
        </div>
      </div>`;
    const finish = (value) => {
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onKey = (event) => { if (event.key === 'Escape') finish(false); };
    backdrop.querySelector('[data-cancel]').addEventListener('click', () => finish(false));
    backdrop.querySelector('[data-confirm]').addEventListener('click', () => finish(true));
    backdrop.addEventListener('mousedown', (event) => { if (event.target === backdrop) finish(false); });
    document.addEventListener('keydown', onKey);
    root.appendChild(backdrop);
    backdrop.querySelector('[data-confirm]').focus();
  });
}

/* ------------------------------------------------------------- toast */

export function toast(message, type = '') {
  const root = document.getElementById('toast-root');
  const node = document.createElement('div');
  node.className = 'toast ' + type;
  node.textContent = message;
  root.appendChild(node);
  setTimeout(() => {
    node.style.transition = 'opacity .2s';
    node.style.opacity = '0';
    setTimeout(() => node.remove(), 220);
  }, 3200);
}

export function refresh() {
  window.dispatchEvent(new Event('crm:refresh'));
}
