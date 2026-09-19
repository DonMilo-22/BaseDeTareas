export const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));

export const initials = name => String(name || 'U').split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();

export const roleLabel = role => ({ admin: 'Administrador', manager: 'Gestor', member: 'Miembro' }[role] || 'Miembro');

export const isManager = group => ['admin', 'manager'].includes(group?.role);

export function dateTime(value, options = {}) {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', ...options,
  }).format(new Date(value));
}

export function dateInput(value) {
  const date = value ? new Date(value) : new Date(Date.now() + 86400000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function relativeDate(value) {
  const target = new Date(value);
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
  const icon = type === 'error' ? '!' : type === 'success' ? '✓' : 'i';
  item.innerHTML = `<strong>${icon}</strong><span>${esc(message)}</span><button aria-label="Cerrar">×</button>`;
  if (action) {
    const button = item.querySelector('button');
    button.textContent = action.label;
    button.addEventListener('click', () => { action.run(); item.remove(); });
  } else {
    item.querySelector('button').addEventListener('click', () => item.remove());
  }
  region.append(item);
  setTimeout(() => item.remove(), action ? 7000 : 4200);
}

export function taskRow(task) {
  const overdue = !Number(task.completed) && new Date(task.due_at) < new Date();
  return `
    <article class="task-row ${Number(task.completed) ? 'is-complete' : ''}" data-task-id="${esc(task.id)}">
      <button class="task-check ${Number(task.completed) ? 'checked' : ''}" data-action="toggle-task" data-task-id="${esc(task.id)}" data-completed="${Number(task.completed) ? '1' : '0'}" aria-label="${Number(task.completed) ? 'Marcar pendiente' : 'Marcar completada'}">${Number(task.completed) ? '✓' : ''}</button>
      <div class="task-main">
        <strong>${esc(task.title)}</strong>
        <small><span class="dot" style="background:${esc(task.class_color || '#6366f1')}"></span>${esc(task.class_name)}${task.topic_name ? ` · ${esc(task.topic_name)}` : ''}</small>
      </div>
      <div class="task-meta">
        ${Number(task.is_important) ? '<span class="pill important">Importante</span>' : ''}
        <time class="${overdue ? 'overdue' : ''}">${esc(relativeDate(task.due_at))}</time>
      </div>
    </article>`;
}

export function emptyState(icon, title, description, action = '') {
  return `<div class="empty-state"><span class="empty-icon">${icon}</span><h2>${esc(title)}</h2><p>${esc(description)}</p>${action}</div>`;
}

export function pageHead(eyebrow, title, subtitle, actions = '') {
  return `<header class="page-head"><div><span class="eyebrow">${esc(eyebrow)}</span><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div><div class="page-actions">${actions}</div></header>`;
}

export function avatar(name, size = '') {
  return `<span class="avatar ${size}">${esc(initials(name))}</span>`;
}

export function calendarCells(monthDate, tasks) {
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
    cells.push(`<div class="calendar-day ${day.getMonth() !== month ? 'outside' : ''} ${day.toDateString() === todayKey ? 'today' : ''}">
      <span class="day-number">${day.getDate()}</span>
      ${dayTasks.slice(0, 3).map(task => `<button class="calendar-task" data-task-id="${esc(task.id)}" style="border-color:${esc(task.class_color || '#6366f1')}">${esc(task.title)}</button>`).join('')}
      ${dayTasks.length > 3 ? `<small class="muted">+${dayTasks.length - 3} más</small>` : ''}
    </div>`);
  }
  return cells.join('');
}
