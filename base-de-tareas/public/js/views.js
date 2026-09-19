import { activitySentence, avatar, calendarCells, dateTime, emptyState, esc, isManager, pageHead, roleLabel, taskRow } from './ui.js';

export function homeView(state) {
  const data = state.dashboard;
  const summary = data?.summary || {};
  const upcoming = data?.upcoming || [];
  const firstName = state.user.name.split(' ')[0];
  return `
    ${pageHead('Resumen de hoy', `Hola, ${firstName}`, 'Aquí tienes lo que necesita tu atención.', isManager(state.group) ? '<button class="button primary" data-action="new-task">＋ Nueva tarea</button>' : '')}
    <section class="summary-grid">
      <article class="summary-card surface danger"><small>Atrasadas</small><strong>${Number(summary.overdue || 0)}</strong></article>
      <article class="summary-card surface accent"><small>Próximos 7 días</small><strong>${Number(summary.next_seven_days || 0)}</strong></article>
      <article class="summary-card surface"><small>Completadas por ti</small><strong>${Number(summary.completed || 0)} <small>de ${Number(summary.total || 0)}</small></strong></article>
    </section>
    <section class="dashboard-grid">
      <details class="panel surface collapsible-panel" open>
        <summary class="panel-head"><h2>Próximas entregas</h2><span class="summary-actions"><a class="text-link" href="#tasks">Ver todas</a><span class="collapse-chevron">⌄</span></span></summary>
        <div class="task-list">${upcoming.length ? upcoming.map(taskRow).join('') : emptyState('✓', 'Todo despejado', 'No tienes entregas próximas ni atrasadas.')}</div>
      </details>
      <details class="panel surface collapsible-panel" open>
        <summary class="panel-head"><h2>Actividad reciente</h2><span class="summary-actions"><button class="text-link" data-action="show-activity">Ver historial</button><span class="collapse-chevron">⌄</span></span></summary>
        <div class="activity-list">
          ${(data?.activity || []).length ? data.activity.map(item => `<div class="activity-item">${avatar(item.user_name, 'small', item.avatar_url, item.avatar_color)}<div><p>${esc(activitySentence(item))}</p><time>${esc(dateTime(item.created_at))}</time></div></div>`).join('') : '<p class="muted">Todavía no hay movimientos en el grupo.</p>'}
        </div>
      </details>
    </section>`;
}

export function tasksView(state) {
  const options = state.classes.map(item => `<option value="${esc(item.id)}" ${state.filters.class_id === item.id ? 'selected' : ''}>${esc(item.name)}</option>`).join('');
  return `
    ${pageHead('Organización', 'Tareas', 'Filtra, encuentra y completa tus entregas.', isManager(state.group) ? '<button class="button primary" data-action="new-task">＋ Nueva tarea</button>' : '')}
    <section class="filters surface">
      <input id="task-search" type="search" placeholder="Buscar tarea…" value="${esc(state.filters.search || '')}">
      <select id="class-filter"><option value="">Todas las materias</option>${options}</select>
      <div class="segmented" id="status-filter">
        <button data-status="" class="${!state.filters.status ? 'active' : ''}">Todas</button>
        <button data-status="pending" class="${state.filters.status === 'pending' ? 'active' : ''}">Pendientes</button>
        <button data-status="completed" class="${state.filters.status === 'completed' ? 'active' : ''}">Completadas</button>
      </div>
    </section>
    <section class="task-table surface">
      ${state.tasks.length ? state.tasks.map(taskRow).join('') : emptyState('⌕', 'No encontramos tareas', 'Prueba con otro filtro o crea la primera tarea del grupo.', isManager(state.group) ? '<button class="button primary" data-action="new-task">Nueva tarea</button>' : '')}
    </section>`;
}

export function calendarView(state) {
  const monthName = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(state.calendarDate);
  const agendaItems = [
    ...state.tasks.map(item => ({ ...item, kind: 'task', when: item.due_at })),
    ...state.announcements.filter(item => item.event_at).map(item => ({ ...item, kind: 'announcement', when: item.event_at, title: item.body })),
  ].filter(item => {
    const date = new Date(item.when);
    return date.getFullYear() === state.calendarDate.getFullYear() && date.getMonth() === state.calendarDate.getMonth();
  }).sort((a, b) => new Date(a.when) - new Date(b.when));
  return `
    ${pageHead('Vista mensual', 'Calendario', 'Todas las fechas del grupo en un solo lugar.', '<a class="button secondary" data-export="ics">Añadir a mi calendario</a>')}
    <section class="calendar-shell surface">
      <div class="calendar-head"><button class="icon-button" data-action="calendar-prev" aria-label="Mes anterior">‹</button><h2>${esc(monthName[0].toUpperCase() + monthName.slice(1))}</h2><button class="icon-button" data-action="calendar-next" aria-label="Mes siguiente">›</button></div>
      <div class="calendar-grid">
        ${['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(day => `<div class="calendar-weekday">${day}</div>`).join('')}
        ${calendarCells(state.calendarDate, state.tasks, state.announcements)}
      </div>
      <div class="mobile-agenda">
        ${agendaItems.length ? agendaItems.map(item => `<button class="agenda-item" ${item.kind === 'task' ? `data-task-id="${esc(item.id)}"` : `data-announcement-id="${esc(item.id)}"`}>
          <span class="agenda-date"><strong>${new Date(item.when).getDate()}</strong><small>${esc(new Intl.DateTimeFormat('es-MX', { month: 'short' }).format(new Date(item.when)))}</small></span>
          <span class="agenda-copy"><strong>${esc(item.title)}</strong><small>${item.kind === 'task' ? `${esc(item.class_name)} · ${esc(dateTime(item.when))}` : `Anuncio · ${esc(dateTime(item.when))}`}</small></span>
          <span class="agenda-arrow">›</span>
        </button>`).join('') : emptyState('□', 'No hay fechas este mes', 'Las tareas y anuncios con fecha aparecerán aquí.')}
      </div>
    </section>`;
}

export function announcementsView(state) {
  return `
    ${pageHead('Comunicación del grupo', 'Anuncios', 'Avisos, comentarios y fechas que no necesitan convertirse en tarea.', '<button class="button primary" data-action="new-announcement">＋ Nuevo anuncio</button>')}
    <section class="announcement-list">
      ${state.announcements.length ? state.announcements.map(item => `
        <article class="announcement-card surface" data-announcement-id="${esc(item.id)}">
          <header>${avatar(item.user_name, 'small', item.avatar_url, item.avatar_color)}<div><strong>${esc(item.user_name)}</strong><time>${esc(dateTime(item.created_at))}</time></div></header>
          <p>${esc(item.body)}</p>
          ${item.event_at ? `<div class="announcement-date"><span>□</span><div><small>Fecha del aviso</small><strong>${esc(dateTime(item.event_at, { year: 'numeric' }))}</strong></div></div>` : ''}
          <footer>
            ${item.reminder_id
              ? `<span class="pill success">Correo · ${esc(dateTime(item.remind_at))}</span><button class="button ghost small" data-action="delete-announcement-reminder" data-announcement-id="${esc(item.id)}">Cancelar aviso</button>`
              : `<button class="button secondary small" data-action="announcement-reminder" data-announcement-id="${esc(item.id)}">Recordarme por correo</button>`}
            ${(item.user_id === state.user.id || isManager(state.group)) ? `<span class="spacer"></span><button class="button ghost small" data-action="edit-announcement" data-announcement-id="${esc(item.id)}">Editar</button><button class="button danger small" data-action="delete-announcement" data-announcement-id="${esc(item.id)}">Eliminar</button>` : ''}
          </footer>
        </article>`).join('') : emptyState('◇', 'Todavía no hay anuncios', 'Publica el primer aviso para mantener informado al grupo.', '<button class="button primary" data-action="new-announcement">Crear anuncio</button>')}
    </section>`;
}

export function classesView(state) {
  return `
    ${pageHead('Tu semestre', 'Materias', 'Abre una materia y explora sus unidades sin llenar la pantalla de información.', isManager(state.group) ? '<button class="button primary" data-action="new-class">＋ Nueva materia</button>' : '')}
    <section class="card-grid class-grid">
      ${state.classes.length ? state.classes.map(item => classCard(item, state)).join('') : emptyState('▤', 'Aún no hay materias', isManager(state.group) ? 'Crea las materias del semestre para comenzar.' : 'Un administrador o gestor debe crear la primera materia.', isManager(state.group) ? '<button class="button primary" data-action="new-class">Crear materia</button>' : '')}
    </section>`;
}

function classCard(item, state) {
  const expanded = state.expandedClassId === item.id;
  const selectedTopicId = state.selectedTopicByClass[item.id] || null;
  const selectedTopic = item.topics.find(topic => topic.id === selectedTopicId);
  const topicTasks = selectedTopic
    ? state.tasks.filter(task => task.class_id === item.id && task.topic_id === selectedTopic.id)
    : [];
  const subtitle = [item.code, item.teacher].filter(Boolean).join(' · ') || 'Toca para consultar la materia';
  const detail = value => esc(value || 'Sin especificar');
  return `
    <article class="class-card surface ${expanded ? 'expanded' : ''}" data-class-id="${esc(item.id)}" style="--class-color:${esc(item.color)}">
      <div class="class-card-accent" aria-hidden="true"></div>
      <header class="class-card-head">
        <button class="class-card-toggle" type="button" data-action="toggle-class" data-class-id="${esc(item.id)}" aria-expanded="${expanded}" aria-label="${expanded ? 'Cerrar' : 'Abrir'} ${esc(item.name)}">
          <span class="class-icon">${esc(item.name[0])}</span>
          <span class="class-card-title"><strong>${esc(item.name)}</strong><small>${esc(subtitle)}</small></span>
          <span class="class-chevron" aria-hidden="true">⌄</span>
        </button>
        ${isManager(state.group) ? `<button class="icon-button class-edit" type="button" data-action="edit-class" data-class-id="${esc(item.id)}" aria-label="Editar ${esc(item.name)}" title="Editar materia">···</button>` : ''}
      </header>
      <div class="class-data">
        <div><strong>${Number(item.completed_count)}</strong><small>Completadas por ti</small></div>
        <div><strong>${Number(item.task_count)}</strong><small>Tareas</small></div>
        <div><strong>${item.topics.length}</strong><small>Unidades</small></div>
      </div>
      ${expanded ? `
        <section class="class-expanded">
          <div class="class-info-grid">
            <div><small>Clave</small><strong>${detail(item.code)}</strong></div>
            <div><small>Profesor</small><strong>${detail(item.teacher)}</strong></div>
            <div><small>Horario</small><strong>${detail(item.schedule)}</strong></div>
            <div><small>Aula</small><strong>${detail(item.room)}</strong></div>
          </div>
          <details class="class-units" open>
            <summary><span><strong>Unidades y temas</strong><small>Selecciona uno para mostrar únicamente sus tareas.</small></span><span class="collapse-chevron">⌄</span></summary>
            ${item.topics.length ? `
              <div class="class-topic-buttons">
                ${item.topics.map(topic => `<button type="button" class="class-topic-button ${topic.id === selectedTopicId ? 'active' : ''}" data-action="select-class-topic" data-class-id="${esc(item.id)}" data-topic-id="${esc(topic.id)}" aria-pressed="${topic.id === selectedTopicId}"><span>${esc(topic.name)}</span><b>${state.tasks.filter(task => task.class_id === item.id && task.topic_id === topic.id).length}</b></button>`).join('')}
              </div>
              <div class="class-topic-tasks">
                ${selectedTopic
                  ? `<div class="class-topic-heading"><div><span class="eyebrow">Tareas de la unidad</span><h3>${esc(selectedTopic.name)}</h3></div><span class="pill">${topicTasks.length}</span></div>${topicTasks.length ? topicTasks.map(taskRow).join('') : emptyState('✓', 'No hay tareas en esta unidad', 'Cuando se agregue una tarea con este tema aparecerá aquí.')}`
                  : `<div class="class-topic-placeholder"><span>↖</span><div><strong>Elige una unidad o tema</strong><p>Las tareas permanecerán ocultas hasta que selecciones una opción.</p></div></div>`}
              </div>`
              : `<div class="class-topic-placeholder"><span>＋</span><div><strong>Esta materia no tiene unidades</strong><p>Un administrador o gestor puede agregarlas desde el menú de tres puntos.</p></div></div>`}
          </details>
        </section>` : ''}
    </article>`;
}

export function teamView(state) {
  const canEdit = state.group.role === 'admin';
  return `
    ${pageHead('Personas y permisos', 'Equipo', 'Consulta quién forma parte del grupo y quién puede administrarlo.', canEdit ? `<button class="button secondary" data-action="copy-code">Copiar código · ${esc(state.group.join_code)}</button>` : '')}
    <section class="card-grid">
      ${state.members.map(member => `
        <article class="member-card surface">
          <div class="member-card-head">${avatar(member.name, 'large', member.avatar_url, member.avatar_color)}<div class="member-meta"><h2>${esc(member.name)}${member.id === state.user.id ? ' <span class="pill">Tú</span>' : ''}</h2><p>${Number(member.completed_tasks || 0)} tareas completadas</p></div></div>
          <div class="setting-row"><div><strong>Permiso</strong><p>${esc(roleLabel(member.role))}</p></div>
            ${canEdit && member.id !== state.user.id ? `<div class="inline-actions"><select class="role-select" data-action="change-role" data-user-id="${esc(member.id)}"><option value="member" ${member.role === 'member' ? 'selected' : ''}>Alumno</option><option value="manager" ${member.role === 'manager' ? 'selected' : ''}>Gestor</option><option value="admin" ${member.role === 'admin' ? 'selected' : ''}>Administrador</option></select><button class="button ghost small" data-action="remove-member" data-user-id="${esc(member.id)}" data-user-name="${esc(member.name)}">Quitar</button></div>` : `<span class="pill role">${esc(roleLabel(member.role))}</span>`}
          </div>
        </article>`).join('')}
    </section>`;
}

export function settingsView(state) {
  const tab = state.settingsTab;
  return `
    ${pageHead('Preferencias', 'Ajustes', 'Controla tu experiencia y la información del grupo.')}
    <section class="settings-layout">
      <nav class="settings-nav surface">
        <button data-settings="profile" class="${tab === 'profile' ? 'active' : ''}">Mi perfil</button>
        <button data-settings="group" class="${tab === 'group' ? 'active' : ''}">Grupo</button>
        <button data-settings="activity" class="${tab === 'activity' ? 'active' : ''}">Actividad</button>
        <button data-settings="data" class="${tab === 'data' ? 'active' : ''}">Datos</button>
        ${isManager(state.group) ? `<button data-settings="trash" class="${tab === 'trash' ? 'active' : ''}">Papelera</button>` : ''}
      </nav>
      <article class="settings-content surface">${settingsContent(state)}</article>
    </section>`;
}

function settingsContent(state) {
  if (state.settingsTab === 'profile') return `
    <h2>Mi perfil</h2><p class="muted">Información personal y preferencias.</p>
    <form id="profile-form" class="stack-md">
      <div class="profile-editor"><div id="profile-preview">${avatar(state.user.name, 'large', state.user.avatar_url, state.user.avatar_color)}</div><div><label class="button secondary small" for="avatar-file">Subir foto</label><input id="avatar-file" type="file" accept="image/png,image/jpeg,image/webp" hidden><button type="button" class="button ghost small" data-action="remove-avatar">Quitar foto</button><small>La imagen se optimiza antes de guardarse.</small></div></div>
      <label>Nombre<input name="name" value="${esc(state.user.name)}" required></label>
      <div class="form-grid"><label>Color del avatar<input name="avatar_color" type="color" value="${esc(state.user.avatar_color || '#4f46e5')}"></label><label>Color principal de la página<input name="accent_color" type="color" value="${esc(state.user.accent_color || '#4f46e5')}"></label></div>
      <label>Zona horaria<input name="timezone" value="${esc(state.user.timezone)}" required></label>
      <div class="setting-row"><div><strong>Recordatorios por correo</strong><p>Permite programar correos personales para tus tareas.</p></div><input class="toggle" name="email_notifications" type="checkbox" ${Number(state.user.email_notifications) ? 'checked' : ''}></div>
      <div class="setting-row"><div><strong>Tema</strong><p>Elige cómo se verá la aplicación.</p></div><select name="theme" class="role-select"><option value="system" ${state.user.theme === 'system' ? 'selected' : ''}>Sistema</option><option value="light" ${state.user.theme === 'light' ? 'selected' : ''}>Claro</option><option value="dark" ${state.user.theme === 'dark' ? 'selected' : ''}>Oscuro</option></select></div>
      <button class="button primary" type="submit">Guardar cambios</button>
    </form>
    <div class="danger-zone"><h3>Sesión</h3><p class="muted">Cierra tu sesión en este dispositivo.</p><button class="button danger" data-action="logout">Cerrar sesión</button></div>`;

  if (state.settingsTab === 'group') return `
    <h2>Grupo</h2><p class="muted">Configuración compartida de ${esc(state.group.name)}.</p>
    <div class="setting-row"><div><strong>Código de invitación</strong><p>Compártelo solo con integrantes del salón.</p></div><button class="button secondary" data-action="copy-code">${esc(state.group.join_code)}</button></div>
    <div class="setting-row"><div><strong>Tu permiso</strong><p>${esc(roleLabel(state.group.role))}</p></div><span class="pill role">${esc(roleLabel(state.group.role))}</span></div>
    ${state.group.role === 'admin' ? `<form id="group-settings-form" class="stack-md"><label>Nombre<input name="name" value="${esc(state.group.name)}" required></label><label>Descripción<textarea name="description">${esc(state.group.description || '')}</textarea></label><button class="button primary">Actualizar grupo</button></form>` : ''}
    <div class="danger-zone"><h3>Salir del grupo</h3><p class="muted">Dejarás de ver sus materias, tareas y anuncios. Si eres el único administrador, primero deberás asignar otro.</p><button class="button danger" data-action="leave-group">Salir de este grupo</button></div>`;

  if (state.settingsTab === 'data') return `
    <h2>Exportar información</h2><p class="muted">Conserva una copia o añade las entregas a tu calendario.</p>
    <div class="setting-row"><div><strong>Calendario</strong><p>Archivo compatible con Google Calendar, Outlook y Apple Calendar.</p></div><a class="button secondary" data-export="ics">Descargar .ics</a></div>
    <div class="setting-row"><div><strong>Hoja de cálculo</strong><p>Lista de tareas en formato CSV.</p></div><a class="button secondary" data-export="csv">Descargar .csv</a></div>
    <div class="setting-row"><div><strong>Respaldo</strong><p>Datos del grupo y tu progreso en JSON.</p></div><a class="button secondary" data-export="json">Descargar .json</a></div>`;

  if (state.settingsTab === 'activity') return `
    <h2>Actividad del grupo</h2><p class="muted">Los movimientos más recientes, en orden cronológico.</p>
    <div class="activity-list activity-full">${state.activity.length ? state.activity.map(item => `<div class="activity-item">${avatar(item.user_name || 'Sistema', 'small', item.avatar_url, item.avatar_color)}<div><p>${esc(activitySentence(item))}</p><time>${esc(dateTime(item.created_at))}</time></div></div>`).join('') : '<p class="muted">Todavía no hay movimientos en el grupo.</p>'}</div>`;

  return `
    <h2>Papelera</h2><p class="muted">Recupera elementos eliminados por un gestor.</p>
    <div class="task-list">${state.trash.length ? state.trash.map(item => `<div class="task-row"><span class="empty-icon" style="width:36px;height:36px;margin:0">${item.type === 'task' ? '✓' : '▤'}</span><div class="task-main"><strong>${esc(item.name)}</strong><small>${esc(item.context || (item.type === 'task' ? 'Tarea' : 'Materia'))} · ${esc(dateTime(item.deleted_at))}</small></div><div class="inline-actions"><button class="button secondary small" data-action="restore-item" data-type="${esc(item.type)}" data-id="${esc(item.id)}">Restaurar</button>${item.type === 'task' ? `<button class="button danger small" data-action="purge-task" data-id="${esc(item.id)}" data-name="${esc(item.name)}">Borrar definitivamente</button>` : ''}</div></div>`).join('') : emptyState('♲', 'La papelera está vacía', 'Los elementos eliminados aparecerán aquí.')}</div>`;
}
