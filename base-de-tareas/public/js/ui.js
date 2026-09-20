export const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));

export const initials = name => String(name || 'U').split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();

export const roleLabel = role => ({ admin: 'Administrador', manager: 'Gestor', member: 'Alumno' }[role] || 'Alumno');

export const isManager = group => ['admin', 'manager'].includes(group?.role);

function contrastText(hexColor) {
  const hex = String(hexColor || '#315a4a').replace('#', '');
  const rgb = hex.length === 3 ? [...hex].map(value => parseInt(value + value, 16)) : [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16));
  const luminance = rgb.map(value => {
    const channel = value / 255;
    return channel <= .03928 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
  return luminance > .42 ? '#17231e' : '#fffaf2';
}

const iconNames = new Set(['home', 'check', 'note', 'calendar', 'book', 'users', 'settings', 'search', 'plus', 'menu', 'close', 'chevron', 'arrow', 'left', 'right', 'more', 'restore']);

export function icon(name, className = '') {
  const safeName = iconNames.has(name) ? name : 'note';
  return `<svg class="${esc(className)}" aria-hidden="true"><use href="#icon-${safeName}"></use></svg>`;
}

export function activitySentence(item) {
  const summary = String(item?.summary || '').trim();
  const name = String(item?.user_name || 'Sistema').trim();
  if (!summary || summary.toLocaleLowerCase('es').startsWith(name.toLocaleLowerCase('es'))) return summary;
  return `${name} ${summary.charAt(0).toLocaleLowerCase('es')}${summary.slice(1)}`;
}

export function parseDate(value) {
  if (value instanceof Date) return new Date(value.getTime());
  const timestamp = String(value ?? '').trim();
  const sqliteUtc = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(timestamp);
  return new Date(sqliteUtc ? `${timestamp.replace(' ', 'T')}Z` : timestamp);
}

export function dateTime(value, options = {}) {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', ...options,
  }).format(parseDate(value));
}

export function dateInput(value) {
  const date = value ? parseDate(value) : new Date(Date.now() + 86400000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function relativeDate(value) {
  const target = parseDate(value);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const days = Math.round((targetDay - today) / 86400000);
  if (days === 0) return `Hoy · ${target.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })}`;
  if (days === 1) return `Mañana · ${target.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })}`;
  if (days === -1) return 'Ayer';
  if (days > 1 && days < 7) return `En ${days} días`;
  if (days < 0) return `Hace ${Math.abs(days)} días`;
  return dateTime(value, { year: target.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

export function toast(message, type = 'info', action) {
  const region = document.getElementById('toast-region');
  const item = document.createElement('div');
  item.className = `toast ${type}`;
  const statusIcon = type === 'success' ? icon('check') : icon('note');
  item.innerHTML = `<strong>${statusIcon}</strong><span>${esc(message)}</span><button aria-label="Cerrar">${icon('close')}</button>`;
  if (action) {
    const button = item.querySelector('button');
    button.textContent = action.label;
    button.addEventListener('click', () => { action.run(); item.remove(); });
  } else {
    item.querySelector('button').addEventListener('click', () => item.remove());
  }
  region.append(item);
  setTimeout(() => item.remove(), action || type === 'error' ? 7000 : 4800);
}

export function taskRow(task) {
  const overdue = !Number(task.completed) && new Date(task.due_at) < new Date();
  return `
    <article class="task-row ${Number(task.completed) ? 'is-complete' : ''}">
      <button class="task-check ${Number(task.completed) ? 'checked' : ''}" data-action="toggle-task" data-toggle-task-id="${esc(task.id)}" data-completed="${Number(task.completed) ? '1' : '0'}" aria-label="${Number(task.completed) ? 'Marcar pendiente' : 'Marcar completada'}">${Number(task.completed) ? icon('check') : ''}</button>
      <button class="task-open" type="button" data-task-id="${esc(task.id)}" aria-label="Abrir tarea: ${esc(task.title)}">
        <span class="task-main">
          <strong>${esc(task.title)}</strong>
          <small><span class="dot" style="background:${esc(task.class_color || '#315a4a')}"></span>${esc(task.class_name)}${task.topic_name ? ` · ${esc(task.topic_name)}` : ''}</small>
        </span>
        <span class="task-meta">
          ${Number(task.is_important) ? '<span class="pill important">Importante</span>' : ''}
          <time class="${overdue ? 'overdue' : ''}">${esc(relativeDate(task.due_at))}</time>
        </span>
      </button>
    </article>`;
}

export function emptyState(iconName, title, description, action = '') {
  return `<div class="empty-state"><span class="empty-icon">${icon(iconName)}</span><h2>${esc(title)}</h2><p>${esc(description)}</p>${action}</div>`;
}

export function pageHead(context, title, subtitle, actions = '') {
  return `<header class="page-head"><div><div class="page-title-row"><h1>${esc(title)}</h1><span class="page-context">${esc(context)}</span></div><p>${esc(subtitle)}</p></div><div class="page-actions">${actions}</div></header>`;
}

export function avatar(name, size = '', imageUrl = '', color = '#315a4a') {
  const style = `--avatar-color:${esc(color || '#315a4a')};--avatar-text:${contrastText(color)}`;
  return imageUrl
    ? `<img class="avatar ${size}" src="${esc(imageUrl)}" alt="Foto de ${esc(name)}" style="${style}">`
    : `<span class="avatar ${size}" style="${style}">${esc(initials(name))}</span>`;
}

export function calendarCells(monthDate, tasks, announcements = []) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const mondayIndex = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - mondayIndex);
  const todayKey = new Date().toDateString();
  const cells = [];
  for (let index = 0; index < 42; index += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    const dayTasks = tasks.filter(task => {
      const due = new Date(task.due_at);
      return due.getFullYear() === day.getFullYear() && due.getMonth() === day.getMonth() && due.getDate() === day.getDate();
    });
    const dayAnnouncements = announcements.filter(item => {
      if (!item.event_at) return false;
      const event = new Date(item.event_at);
      return event.getFullYear() === day.getFullYear() && event.getMonth() === day.getMonth() && event.getDate() === day.getDate();
    });
    cells.push(`<div class="calendar-day ${day.getMonth() !== month ? 'outside' : ''} ${day.toDateString() === todayKey ? 'today' : ''}">
      <span class="day-number">${day.getDate()}</span>
      ${dayTasks.slice(0, 3).map(task => `<button class="calendar-task" data-task-id="${esc(task.id)}" style="--event-color:${esc(task.class_color || '#315a4a')}">${esc(task.title)}</button>`).join('')}
      ${dayAnnouncements.slice(0, Math.max(0, 3 - dayTasks.length)).map(item => `<button class="calendar-task announcement-event" data-announcement-id="${esc(item.id)}">Aviso · ${esc(item.body)}</button>`).join('')}
      ${dayTasks.length + dayAnnouncements.length > 3 ? `<small class="muted">+${dayTasks.length + dayAnnouncements.length - 3} más</small>` : ''}
    </div>`);
  }
  return cells.join('');
}
