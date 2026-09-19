import { api, ApiError } from './api.js';
import { avatar, dateInput, dateTime, emptyState, esc, isManager, roleLabel, taskRow, toast } from './ui.js';
import { announcementsView, calendarView, classesView, homeView, settingsView, tasksView, teamView } from './views.js';

const state = {
  user: null,
  groups: [],
  group: null,
  classes: [],
  tasks: [],
  announcements: [],
  dashboard: null,
  members: [],
  activity: [],
  trash: [],
  view: 'home',
  settingsTab: 'profile',
  expandedClassId: null,
  selectedTopicByClass: {},
  filters: { search: '', class_id: '', status: '' },
  calendarDate: new Date(),
  avatarDraft: undefined,
};

const screens = {
  loading: document.getElementById('loading-screen'),
  auth: document.getElementById('auth-screen'),
  onboarding: document.getElementById('onboarding-screen'),
  app: document.getElementById('app-shell'),
};
const view = document.getElementById('view');
const authFormIds = ['login-form', 'register-form', 'register-code-form', 'forgot-form', 'reset-password-form'];
let resendTimer;

function showScreen(name) {
  Object.entries(screens).forEach(([key, element]) => { element.hidden = key !== name; });
}

function applyTheme(theme = 'system', accentColor = '#4f46e5') {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.setProperty('--primary', accentColor || '#4f46e5');
  document.documentElement.style.setProperty('--primary-soft', `color-mix(in srgb, ${accentColor || '#4f46e5'} 15%, var(--surface))`);
}

function currentView() {
  const requested = location.hash.replace('#', '').split('?')[0];
  return ['home', 'tasks', 'announcements', 'calendar', 'classes', 'team', 'settings'].includes(requested) ? requested : 'home';
}

function setBusy(form, busy) {
  form.querySelectorAll('button, input, textarea, select').forEach(element => { element.disabled = busy; });
}

function formValues(form) {
  return Object.fromEntries([...form.querySelectorAll('input, textarea, select')]
    .filter(element => element.getAttribute('name') && (element.type !== 'checkbox' || element.checked))
    .map(element => [element.getAttribute('name'), element.value]));
}

function showAuthForm(formId, activeTab = formId === 'register-form' || formId === 'register-code-form' ? 'register' : 'login') {
  authFormIds.forEach(id => { document.getElementById(id).hidden = id !== formId; });
  document.querySelectorAll('[data-auth-tab]').forEach(item => item.classList.toggle('active', item.dataset.authTab === activeTab));
}

function startResendCountdown(form, seconds = 60) {
  clearInterval(resendTimer);
  const button = form.querySelector('[data-auth-action$="resend"]');
  if (!button) return;
  let remaining = Number(seconds) || 60;
  button.innerHTML = `Reenviar en <span data-resend-seconds>${remaining}</span> s`;
  const label = button.querySelector('[data-resend-seconds]');
  button.disabled = true;
  label.textContent = remaining;
  const render = () => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(resendTimer);
      button.disabled = false;
      button.textContent = 'Reenviar código';
    } else label.textContent = remaining;
  };
  resendTimer = setInterval(render, 1000);
}

function openCodeForm({ formId, email, resendAfter, testCode }) {
  const form = document.getElementById(formId);
  form.elements.email.value = email;
  form.querySelector(formId === 'register-code-form' ? '[data-code-email]' : '[data-reset-email]').textContent = email;
  if (testCode) form.elements.code.value = testCode;
  showAuthForm(formId);
  startResendCountdown(form, resendAfter);
  form.elements.code.focus();
}

async function finishAuthentication(data) {
  state.user = data.user;
  state.groups = (await api.groups()).groups;
  applyTheme(state.user.theme, state.user.accent_color);
  if (!state.groups.length) showScreen('onboarding');
  else { state.group = state.groups[0]; await enterApp(); }
}

function handleError(error) {
  console.error(error);
  if (error instanceof ApiError && error.status === 401) {
    state.user = null;
    showScreen('auth');
    if (error.code !== 'UNAUTHORIZED') toast(error.message, 'error');
    return;
  }
  toast(error.message || 'Algo salió mal. Intenta de nuevo.', 'error');
}

async function init() {
  bindStaticEvents();
  try {
    const data = await api.me();
    state.user = data.user;
    state.groups = data.groups;
    applyTheme(state.user.theme, state.user.accent_color);
    if (!state.groups.length) {
      showScreen('onboarding');
      return;
    }
    const requestedGroup = new URL(location.href).searchParams.get('group');
    const saved = localStorage.getItem('bdt_group');
    state.group = state.groups.find(group => group.id === requestedGroup && !group.archived_at)
      || state.groups.find(group => group.id === saved && !group.archived_at)
      || state.groups.find(group => !group.archived_at)
      || state.groups[0];
    await enterApp();
  } catch (error) {
    if (error.status === 401) showScreen('auth');
    else handleError(error);
  }
}

async function enterApp() {
  localStorage.setItem('bdt_group', state.group.id);
  showScreen('app');
  syncShell();
  await loadCore();
  await navigate();
  openDeepLink();
}

function syncShell() {
  document.getElementById('current-group-name').textContent = state.group.name;
  document.getElementById('current-group-role').textContent = roleLabel(state.group.role);
  document.getElementById('profile-name').textContent = state.user.name;
  document.getElementById('profile-role').textContent = roleLabel(state.group.role);
  document.getElementById('profile-avatar').outerHTML = avatar(state.user.name, '', state.user.avatar_url, state.user.avatar_color).replace('class="avatar ', 'id="profile-avatar" class="avatar ');
  document.querySelectorAll('.manager-only').forEach(element => { element.hidden = !isManager(state.group); });
}

async function loadCore() {
  const [classes, tasks, announcements] = await Promise.all([api.classes(state.group.id), api.tasks(state.group.id), api.announcements(state.group.id)]);
  state.classes = classes.classes;
  state.tasks = tasks.tasks;
  state.announcements = announcements.announcements;
  updatePendingBadge();
}

function updatePendingBadge() {
  const pending = state.tasks.filter(task => !Number(task.completed)).length;
  document.getElementById('pending-badge').textContent = pending;
}

async function navigate() {
  state.view = currentView();
  document.querySelectorAll('[data-view]').forEach(link => link.classList.toggle('active', link.dataset.view === state.view));
  view.innerHTML = '<div class="skeleton"></div><div class="skeleton" style="margin-top:12px"></div>';
  try {
    if (state.view === 'home') {
      state.dashboard = await api.dashboard(state.group.id);
      view.innerHTML = homeView(state);
    } else if (state.view === 'tasks') {
      await reloadTasks();
      view.innerHTML = tasksView(state);
    } else if (state.view === 'announcements') {
      await reloadAnnouncements();
      view.innerHTML = announcementsView(state);
    } else if (state.view === 'calendar') {
      await Promise.all([reloadTasks(), reloadAnnouncements()]);
      view.innerHTML = calendarView(state);
    } else if (state.view === 'classes') {
      state.classes = (await api.classes(state.group.id)).classes;
      if (!state.classes.some(item => item.id === state.expandedClassId)) state.expandedClassId = null;
      view.innerHTML = classesView(state);
    } else if (state.view === 'team') {
      state.members = (await api.members(state.group.id)).members;
      view.innerHTML = teamView(state);
    } else {
      if (state.settingsTab === 'trash' && isManager(state.group)) state.trash = (await api.trash(state.group.id)).items;
      if (state.settingsTab === 'activity') state.activity = (await api.activity(state.group.id)).activity;
      view.innerHTML = settingsView(state);
    }
    view.focus({ preventScroll: true });
  } catch (error) {
    handleError(error);
    view.innerHTML = emptyState('!', 'No pudimos cargar esta sección', 'Comprueba tu conexión e inténtalo de nuevo.', '<button class="button secondary" data-action="retry-view">Reintentar</button>');
  }
}

async function reloadTasks() {
  state.tasks = (await api.tasks(state.group.id, state.view === 'tasks' ? state.filters : {})).tasks;
  updatePendingBadge();
}

function bindStaticEvents() {
  document.querySelectorAll('[data-auth-tab]').forEach(button => button.addEventListener('click', () => {
    showAuthForm(button.dataset.authTab === 'login' ? 'login-form' : 'register-form');
  }));

  document.getElementById('login-form').addEventListener('submit', authSubmit('login'));
  document.getElementById('register-form').addEventListener('submit', authSubmit('register'));
  document.getElementById('register-code-form').addEventListener('submit', verifyRegistration);
  document.getElementById('forgot-form').addEventListener('submit', requestPasswordReset);
  document.getElementById('reset-password-form').addEventListener('submit', resetPassword);
  document.querySelectorAll('[data-auth-action]').forEach(button => button.addEventListener('click', handleAuthAction));
  document.querySelectorAll('.auth-code-input').forEach(input => input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 6);
  }));
  document.getElementById('group-create-form').addEventListener('submit', createGroup);
  document.getElementById('group-join-form').addEventListener('submit', joinGroup);
  document.getElementById('task-form').addEventListener('submit', saveTask);
  document.getElementById('class-form').addEventListener('submit', saveClass);
  document.getElementById('announcement-form').addEventListener('submit', saveAnnouncement);
  document.getElementById('announcement-reminder-form').addEventListener('submit', saveAnnouncementReminder);
  document.getElementById('announcement-form').elements.enable_reminder.addEventListener('change', event => {
    document.getElementById('announcement-reminder-time').hidden = !event.target.checked;
    document.getElementById('announcement-form').elements.remind_at.required = event.target.checked;
  });
  document.getElementById('class-delete').addEventListener('click', deleteClass);
  document.getElementById('task-form').elements.class_id.addEventListener('change', updateTopicOptions);
  document.getElementById('onboarding-logout').addEventListener('click', logout);

  document.querySelectorAll('[data-open-dialog]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.openDialog).showModal()));
  document.querySelectorAll('.dialog-close').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    screens.app.classList.toggle('sidebar-collapsed');
    localStorage.setItem('bdt_sidebar', screens.app.classList.contains('sidebar-collapsed') ? 'collapsed' : 'open');
  });
  if (localStorage.getItem('bdt_sidebar') === 'collapsed') screens.app.classList.add('sidebar-collapsed');
  document.getElementById('mobile-menu').addEventListener('click', openMobileMenu);
  document.getElementById('mobile-sidebar-close').addEventListener('click', closeMobileMenu);
  document.getElementById('mobile-backdrop').addEventListener('click', closeMobileMenu);
  document.querySelectorAll('[data-view]').forEach(link => link.addEventListener('click', closeMobileMenu));
  addEventListener('hashchange', navigate);
  addEventListener('popstate', openDeepLink);
  addEventListener('resize', () => { if (innerWidth > 900) closeMobileMenu(); });

  document.getElementById('group-switcher').addEventListener('click', showGroupMenu);
  document.getElementById('profile-button').addEventListener('click', () => { location.hash = 'settings'; state.settingsTab = 'profile'; });
  document.getElementById('quick-add').addEventListener('click', () => openTaskForm());
  document.getElementById('global-search').addEventListener('click', openSearch);
  document.getElementById('global-search-input').addEventListener('input', renderSearchResults);
  addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); }
    if (event.key === 'Escape' && screens.app.classList.contains('mobile-menu-open')) closeMobileMenu();
  });

  view.addEventListener('click', handleViewClick);
  view.addEventListener('change', handleViewChange);
  view.addEventListener('input', handleViewInput);
  view.addEventListener('submit', handleViewSubmit);
  document.getElementById('task-detail-content').addEventListener('click', handleDetailClick);
  document.getElementById('task-detail-content').addEventListener('submit', handleDetailSubmit);

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}

function authSubmit(type) {
  return async event => {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(form, true);
    try {
      const values = formValues(form);
      if (type === 'register') values.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Mexico_City';
      if (type === 'register') {
        const data = await api.register(values);
        openCodeForm({ formId: 'register-code-form', email: data.email, resendAfter: data.resend_after, testCode: data.test_code });
        toast('Te enviamos un código. Revisa también la carpeta de spam.', 'success');
      } else {
        const data = await api.login(values);
        await finishAuthentication(data);
        form.reset();
      }
    } catch (error) { handleError(error); }
    finally { setBusy(form, false); }
  };
}

async function verifyRegistration(event) {
  event.preventDefault();
  const form = event.currentTarget;
  setBusy(form, true);
  try {
    const data = await api.verifyRegistration(formValues(form));
    clearInterval(resendTimer);
    await finishAuthentication(data);
    document.getElementById('register-form').reset();
    form.reset();
    toast('Correo verificado. Tu cuenta ya está lista.', 'success');
  } catch (error) { handleError(error); }
  finally { setBusy(form, false); }
}

async function requestPasswordReset(event) {
  event.preventDefault();
  const form = event.currentTarget;
  setBusy(form, true);
  try {
    const email = form.elements.email.value;
    const data = await api.forgotPassword(email);
    openCodeForm({ formId: 'reset-password-form', email, resendAfter: data.resend_after, testCode: data.test_code });
    toast(data.message, 'success');
  } catch (error) { handleError(error); }
  finally { setBusy(form, false); }
}

async function resetPassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  setBusy(form, true);
  try {
    const values = formValues(form);
    const data = await api.resetPassword(values);
    clearInterval(resendTimer);
    showAuthForm('login-form');
    document.getElementById('login-form').elements.email.value = values.email;
    document.getElementById('login-form').elements.password.focus();
    form.reset();
    toast(data.message, 'success');
  } catch (error) { handleError(error); }
  finally { setBusy(form, false); }
}

async function handleAuthAction(event) {
  const action = event.currentTarget.dataset.authAction;
  if (action === 'forgot') {
    const email = document.getElementById('login-form').elements.email.value;
    showAuthForm('forgot-form');
    document.getElementById('forgot-form').elements.email.value = email;
    document.getElementById('forgot-form').elements.email.focus();
    return;
  }
  if (action === 'login') {
    clearInterval(resendTimer);
    showAuthForm('login-form');
    return;
  }
  if (action === 'register-back') {
    clearInterval(resendTimer);
    showAuthForm('register-form');
    return;
  }

  const isRegistration = action === 'register-resend';
  const form = document.getElementById(isRegistration ? 'register-code-form' : 'reset-password-form');
  setBusy(form, true);
  let resendAfter;
  try {
    const email = form.elements.email.value;
    const data = isRegistration ? await api.resendRegistrationCode(email) : await api.forgotPassword(email);
    form.elements.code.value = data.test_code || '';
    resendAfter = data.resend_after;
    toast('Enviamos un código nuevo. El anterior dejó de funcionar.', 'success');
  } catch (error) { handleError(error); }
  finally {
    setBusy(form, false);
    if (resendAfter) startResendCountdown(form, resendAfter);
  }
}

async function createGroup(event) {
  event.preventDefault();
  const form = event.currentTarget;
  setBusy(form, true);
  try {
    const data = await api.createGroup(formValues(form));
    state.groups = (await api.groups()).groups;
    state.group = state.groups.find(group => group.id === data.group.id);
    form.closest('dialog').close(); form.reset();
    await enterApp();
    toast('Grupo creado. Ya puedes compartir el código de invitación.', 'success');
  } catch (error) { handleError(error); }
  finally { setBusy(form, false); }
}

async function joinGroup(event) {
  event.preventDefault();
  const form = event.currentTarget;
  setBusy(form, true);
  try {
    const data = await api.joinGroup(formValues(form).code);
    state.groups = (await api.groups()).groups;
    state.group = state.groups.find(group => group.id === data.group.id);
    form.closest('dialog').close(); form.reset();
    await enterApp();
    toast(`Te uniste a ${data.group.name}.`, 'success');
  } catch (error) { handleError(error); }
  finally { setBusy(form, false); }
}

function showGroupMenu() {
  const dialog = document.getElementById('group-menu-dialog');
  document.getElementById('group-menu-content').innerHTML = `
    ${state.groups.filter(group => !group.archived_at).map(group => `<button class="menu-item ${group.id === state.group.id ? 'active' : ''}" data-group-id="${esc(group.id)}"><span><strong>${esc(group.name)}</strong><br><small>${esc(roleLabel(group.role))}</small></span>${group.id === state.group.id ? '✓' : ''}</button>`).join('')}
    <div class="menu-separator"></div>
    <button class="menu-item" data-menu-action="create">＋ Crear grupo</button>
    <button class="menu-item" data-menu-action="join">→ Unirme con código</button>`;
  dialog.showModal();
  dialog.onclick = async event => {
    const groupButton = event.target.closest('[data-group-id]');
    if (groupButton) {
      state.group = state.groups.find(group => group.id === groupButton.dataset.groupId);
      dialog.close();
      await enterApp();
    }
    const action = event.target.closest('[data-menu-action]')?.dataset.menuAction;
    if (action) { dialog.close(); document.getElementById(`group-${action}-dialog`).showModal(); }
  };
}

function openMobileMenu() {
  screens.app.classList.add('mobile-menu-open');
  document.body.classList.add('mobile-menu-visible');
  document.getElementById('mobile-menu').setAttribute('aria-expanded', 'true');
  document.getElementById('mobile-sidebar-close').focus({ preventScroll: true });
}

function closeMobileMenu() {
  screens.app.classList.remove('mobile-menu-open');
  document.body.classList.remove('mobile-menu-visible');
  document.getElementById('mobile-menu').setAttribute('aria-expanded', 'false');
}

async function handleViewClick(event) {
  const action = event.target.closest('[data-action]')?.dataset.action;
  const taskElement = event.target.closest('[data-task-id]');
  if (action === 'new-task') return openTaskForm();
  if (action === 'new-class') return openClassForm();
  if (action === 'new-announcement') return openAnnouncementForm();
  if (action === 'edit-announcement') return openAnnouncementForm(state.announcements.find(item => item.id === event.target.closest('[data-announcement-id]').dataset.announcementId));
  if (action === 'delete-announcement') return deleteAnnouncement(event.target.closest('[data-announcement-id]').dataset.announcementId);
  if (action === 'announcement-reminder') return openAnnouncementReminder(event.target.closest('[data-announcement-id]').dataset.announcementId);
  if (action === 'delete-announcement-reminder') return deleteAnnouncementReminder(event.target.closest('[data-announcement-id]').dataset.announcementId);
  if (action === 'leave-group') return leaveGroup();
  if (action === 'purge-task') return purgeTask(event.target.closest('[data-action]'));
  if (action === 'remove-avatar') { state.avatarDraft = null; renderAvatarPreview(); return; }
  if (action === 'retry-view') return navigate();
  if (action === 'copy-code') return copyCode();
  if (action === 'logout') return logout();
  if (action === 'show-activity') { state.settingsTab = 'activity'; location.hash = 'settings'; return; }
  if (action === 'calendar-prev' || action === 'calendar-next') {
    state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() + (action === 'calendar-next' ? 1 : -1), 1);
    view.innerHTML = calendarView(state); return;
  }
  if (action === 'toggle-class') {
    const classId = event.target.closest('[data-class-id]').dataset.classId;
    state.expandedClassId = state.expandedClassId === classId ? null : classId;
    if (state.expandedClassId) state.selectedTopicByClass[classId] = null;
    view.innerHTML = classesView(state);
    return;
  }
  if (action === 'select-class-topic') {
    const button = event.target.closest('[data-action]');
    const current = state.selectedTopicByClass[button.dataset.classId];
    state.selectedTopicByClass[button.dataset.classId] = current === button.dataset.topicId ? null : button.dataset.topicId;
    view.innerHTML = classesView(state);
    return;
  }
  if (action === 'edit-class') return openClassForm(state.classes.find(item => item.id === event.target.closest('[data-class-id]').dataset.classId));
  if (action === 'remove-member') return removeMember(event.target.closest('[data-action]'));
  if (action === 'restore-item') return restoreItem(event.target.closest('[data-action]'));
  if (action === 'toggle-task') {
    event.stopPropagation();
    const button = event.target.closest('[data-action]');
    return toggleTask(button.dataset.taskId, button.dataset.completed !== '1');
  }
  const exportLink = event.target.closest('[data-export]');
  if (exportLink) { exportLink.href = api.exportUrl(state.group.id, exportLink.dataset.export); exportLink.download = ''; }
  if (taskElement && !event.target.closest('button[data-action]')) openTaskDetail(taskElement.dataset.taskId);
  const announcementElement = event.target.closest('.calendar-task[data-announcement-id], .agenda-item[data-announcement-id]');
  if (announcementElement) location.hash = 'announcements';
}

async function handleViewChange(event) {
  if (event.target.id === 'avatar-file' && event.target.files?.[0]) {
    try { state.avatarDraft = await compressAvatar(event.target.files[0]); renderAvatarPreview(); }
    catch (error) { handleError(error); }
  }
  if (event.target.id === 'class-filter') { state.filters.class_id = event.target.value; await refreshTasksView(); }
  if (event.target.matches('[data-action="change-role"]')) {
    try { await api.updateRole(state.group.id, event.target.dataset.userId, event.target.value); toast('Permiso actualizado.', 'success'); state.members = (await api.members(state.group.id)).members; view.innerHTML = teamView(state); }
    catch (error) { handleError(error); await navigate(); }
  }
}

let searchTimer;
function handleViewInput(event) {
  if (event.target.name === 'avatar_color') { renderAvatarPreview(); return; }
  if (event.target.name === 'accent_color') { applyTheme(state.user.theme, event.target.value); return; }
  if (event.target.id !== 'task-search') return;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => { state.filters.search = event.target.value; await refreshTasksView(); }, 250);
}

async function handleViewSubmit(event) {
  event.preventDefault();
  if (event.target.id === 'profile-form') {
    const form = event.target; const values = formValues(form); values.email_notifications = form.elements.email_notifications.checked;
    values.avatar_url = state.avatarDraft === undefined ? state.user.avatar_url : state.avatarDraft;
    try { const data = await api.updateProfile(values); state.user = data.user; state.avatarDraft = undefined; applyTheme(state.user.theme, state.user.accent_color); syncShell(); toast('Perfil actualizado.', 'success'); view.innerHTML = settingsView(state); }
    catch (error) { handleError(error); }
  }
  if (event.target.id === 'group-settings-form') {
    try { await api.updateGroup(state.group.id, formValues(event.target)); state.groups = (await api.groups()).groups; state.group = state.groups.find(group => group.id === state.group.id); syncShell(); toast('Grupo actualizado.', 'success'); view.innerHTML = settingsView(state); }
    catch (error) { handleError(error); }
  }
}

view.addEventListener('click', async event => {
  const status = event.target.closest('[data-status]');
  if (status) { state.filters.status = status.dataset.status; await refreshTasksView(); }
  const setting = event.target.closest('[data-settings]');
  if (setting) {
    state.settingsTab = setting.dataset.settings;
    if (state.settingsTab === 'trash' && isManager(state.group)) state.trash = (await api.trash(state.group.id)).items;
    if (state.settingsTab === 'activity') state.activity = (await api.activity(state.group.id)).activity;
    view.innerHTML = settingsView(state);
  }
});

async function refreshTasksView() {
  await reloadTasks();
  view.innerHTML = tasksView(state);
}

async function reloadAnnouncements() {
  state.announcements = (await api.announcements(state.group.id)).announcements;
}

async function toggleTask(taskId, completed) {
  try {
    await api.completeTask(state.group.id, taskId, completed);
    const task = state.tasks.find(item => item.id === taskId); if (task) task.completed = Number(completed);
    updatePendingBadge();
    if (state.view === 'home') { state.dashboard = await api.dashboard(state.group.id); view.innerHTML = homeView(state); }
    else if (state.view === 'tasks') view.innerHTML = tasksView(state);
    else if (state.view === 'classes') {
      state.classes = (await api.classes(state.group.id)).classes;
      view.innerHTML = classesView(state);
    } else view.innerHTML = calendarView(state);
    toast(completed ? 'Tarea completada.' : 'Tarea marcada como pendiente.', 'success');
  } catch (error) { handleError(error); }
}

function populateClassOptions(selectedId) {
  const select = document.getElementById('task-form').elements.class_id;
  select.innerHTML = state.classes.map(item => `<option value="${esc(item.id)}" ${item.id === selectedId ? 'selected' : ''}>${esc(item.name)}</option>`).join('');
  updateTopicOptions();
}

function updateTopicOptions(selectedId = '') {
  const form = document.getElementById('task-form');
  const item = state.classes.find(cls => cls.id === form.elements.class_id.value);
  form.elements.topic_id.innerHTML = `<option value="">Sin tema</option>${(item?.topics || []).map(topic => `<option value="${esc(topic.id)}" ${topic.id === selectedId ? 'selected' : ''}>${esc(topic.name)}</option>`).join('')}`;
}

async function openTaskForm(task) {
  if (!isManager(state.group)) return;
  if (!state.classes.length) { toast('Primero crea una materia.', 'error'); location.hash = 'classes'; return; }
  const form = document.getElementById('task-form');
  form.reset();
  form.elements.id.value = task?.id || '';
  document.getElementById('task-form-title').textContent = task ? 'Editar tarea' : 'Nueva tarea';
  let subtasks = [];
  if (task) {
    try { subtasks = (await api.task(state.group.id, task.id)).subtasks; } catch (error) { handleError(error); return; }
  }
  populateClassOptions(task?.class_id || state.classes[0].id);
  updateTopicOptions(task?.topic_id || '');
  form.elements.title.value = task?.title || '';
  form.elements.description.value = task?.description || '';
  form.elements.due_at.value = dateInput(task?.due_at);
  form.elements.is_important.checked = Boolean(Number(task?.is_important));
  form.elements.subtasks.value = subtasks.map(item => item.title).join('\n');
  document.getElementById('task-dialog').showModal();
}

async function saveTask(event) {
  event.preventDefault();
  const form = event.currentTarget; setBusy(form, true);
  try {
    const values = formValues(form);
    const id = values.id; delete values.id;
    values.topic_id = values.topic_id || null;
    values.due_at = new Date(values.due_at).toISOString();
    values.is_important = form.elements.is_important.checked;
    values.subtasks = values.subtasks.split('\n').map(item => item.trim()).filter(Boolean);
    if (id) await api.updateTask(state.group.id, id, values); else await api.createTask(state.group.id, values);
    form.closest('dialog').close();
    await loadCore(); await navigate();
    toast(id ? 'Tarea actualizada.' : 'Tarea creada.', 'success');
  } catch (error) { handleError(error); }
  finally { setBusy(form, false); }
}

function openClassForm(item) {
  const form = document.getElementById('class-form'); form.reset();
  form.elements.id.value = item?.id || '';
  document.getElementById('class-form-title').textContent = item ? 'Editar materia' : 'Nueva materia';
  for (const field of ['name', 'code', 'teacher', 'room', 'schedule', 'color']) if (item) form.elements[field].value = item[field] || '';
  form.elements.color.value = item?.color || '#6366f1';
  form.elements.topics.value = (item?.topics || []).map(topic => topic.name).join('\n');
  document.getElementById('class-delete').hidden = !item;
  document.getElementById('class-dialog').showModal();
}

async function saveClass(event) {
  event.preventDefault();
  const form = event.currentTarget; setBusy(form, true);
  try {
    const values = formValues(form); const id = values.id; delete values.id;
    values.topics = values.topics.split('\n').map(item => item.trim()).filter(Boolean);
    if (id) await api.updateClass(state.group.id, id, values); else await api.createClass(state.group.id, values);
    form.closest('dialog').close(); state.classes = (await api.classes(state.group.id)).classes; await navigate();
    toast(id ? 'Materia actualizada.' : 'Materia creada.', 'success');
  } catch (error) { handleError(error); }
  finally { setBusy(form, false); }
}

async function openTaskDetail(taskId) {
  try {
    const data = await api.task(state.group.id, taskId);
    renderTaskDetail(data);
    document.getElementById('task-detail-dialog').showModal();
    const url = new URL(location.href);
    url.searchParams.set('group', state.group.id);
    url.searchParams.set('task', taskId);
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  } catch (error) { handleError(error); }
}

function renderTaskDetail(data) {
  const { task } = data;
  document.getElementById('task-detail-content').innerHTML = `
    <div class="detail-hero">
      <div style="display:flex;justify-content:space-between;gap:12px"><span class="pill"><span class="dot" style="background:${esc(task.class_color)}"></span>${esc(task.class_name)}</span><button class="icon-button" data-detail-action="close">×</button></div>
      <h2>${esc(task.title)}</h2><p class="muted">Entrega ${esc(dateTime(task.due_at))}</p>
      <div class="detail-actions"><button class="button ${Number(task.completed) ? 'secondary' : 'primary'}" data-detail-action="toggle" data-completed="${Number(task.completed)}">${Number(task.completed) ? '✓ Completada' : 'Marcar completada'}</button>${isManager(state.group) ? '<button class="button secondary" data-detail-action="edit">Editar</button><button class="button danger" data-detail-action="delete">Eliminar</button>' : ''}</div>
    </div>
    <div class="detail-sections">
      ${task.description ? `<section class="detail-section"><h3>Instrucciones</h3><p style="white-space:pre-wrap;line-height:1.65">${esc(task.description)}</p></section>` : ''}
      <section class="detail-section"><h3>Pasos</h3><div class="checklist">${data.subtasks.length ? data.subtasks.map(item => `<label><input type="checkbox" data-detail-action="subtask" data-subtask-id="${esc(item.id)}" ${Number(item.completed) ? 'checked' : ''}><span>${esc(item.title)}</span></label>`).join('') : '<p class="muted">Esta tarea no tiene pasos adicionales.</p>'}</div></section>
      <section class="detail-section"><h3>Recordatorios</h3><div class="stack-sm">${data.reminders.length ? data.reminders.map(item => `<div class="setting-row"><div><strong>${esc(dateTime(item.remind_at))}</strong><p>${esc(item.status === 'scheduled' ? 'Correo programado' : item.status === 'pending' ? 'En cola para programarse' : item.status === 'failed' ? 'No se pudo programar' : item.status)}</p></div><button class="button ghost small" data-detail-action="delete-reminder" data-reminder-id="${esc(item.id)}">Cancelar</button></div>`).join('') : '<p class="muted">No tienes recordatorios para esta tarea.</p>'}</div><form class="inline-form" id="reminder-form"><input type="datetime-local" name="remind_at" min="${dateInput(new Date(Date.now() + 120000))}" required><button class="button secondary">Programar correo</button></form></section>
      <section class="detail-section"><h3>Comentarios</h3><div>${data.comments.length ? data.comments.map(comment => `<div class="comment">${avatar(comment.user_name, 'small')}<div class="comment-bubble"><small><strong>${esc(comment.user_name)}</strong> · ${esc(dateTime(comment.created_at))}</small><p>${esc(comment.body)}</p></div></div>`).join('') : '<p class="muted">Todavía no hay comentarios.</p>'}</div><form class="inline-form" id="comment-form"><input name="body" maxlength="2000" placeholder="Escribe una aclaración…" required><button class="button secondary">Enviar</button></form></section>
      <section class="detail-section"><h3>Archivos y enlaces</h3>${data.attachments.length ? data.attachments.map(item => `<p><a class="text-link" href="${esc(item.url)}" target="_blank" rel="noopener">↗ ${esc(item.name)}</a></p>`).join('') : '<p class="muted">No hay archivos adjuntos.</p>'}${isManager(state.group) ? '<form class="inline-form" id="attachment-form"><input name="name" placeholder="Nombre del archivo" required><input name="url" type="url" placeholder="https://…" required><button class="button secondary">Añadir</button></form>' : ''}</section>
      ${data.member_progress.length ? `<section class="detail-section"><h3>Avance del equipo</h3><div class="class-topics">${data.member_progress.map(member => `<span class="pill ${member.completed_at ? 'success' : ''}">${esc(member.name)} ${member.completed_at ? '✓' : '·'}</span>`).join('')}</div></section>` : ''}
    </div>`;
  document.getElementById('task-detail-content').dataset.taskId = task.id;
  document.getElementById('task-detail-content')._task = task;
}

async function handleDetailClick(event) {
  const target = event.target.closest('[data-detail-action]'); if (!target) return;
  const action = target.dataset.detailAction; const container = document.getElementById('task-detail-content'); const task = container._task;
  try {
    if (action === 'close') return closeTaskDetail();
    if (action === 'toggle') { await api.completeTask(state.group.id, task.id, target.dataset.completed !== '1'); await loadCore(); const detail = await api.task(state.group.id, task.id); renderTaskDetail(detail); }
    if (action === 'subtask') await api.completeSubtask(state.group.id, task.id, target.dataset.subtaskId, target.checked);
    if (action === 'edit') { closeTaskDetail(); await openTaskForm(task); }
    if (action === 'delete' && confirm(`¿Mover "${task.title}" a la papelera?`)) { await api.deleteTask(state.group.id, task.id); closeTaskDetail(); await loadCore(); await navigate(); toast('Tarea movida a la papelera.', 'success'); }
    if (action === 'delete-reminder') { await api.deleteReminder(state.group.id, task.id, target.dataset.reminderId); renderTaskDetail(await api.task(state.group.id, task.id)); toast('Recordatorio cancelado.', 'success'); }
  } catch (error) { handleError(error); }
}

async function handleDetailSubmit(event) {
  event.preventDefault();
  const form = event.target; const taskId = document.getElementById('task-detail-content').dataset.taskId;
  setBusy(form, true);
  try {
    const values = formValues(form);
    if (form.id === 'comment-form') await api.addComment(state.group.id, taskId, values.body);
    if (form.id === 'reminder-form') await api.addReminder(state.group.id, taskId, new Date(values.remind_at).toISOString());
    if (form.id === 'attachment-form') await api.addAttachment(state.group.id, taskId, values);
    renderTaskDetail(await api.task(state.group.id, taskId));
    toast(form.id === 'reminder-form' ? 'Correo programado.' : 'Información añadida.', 'success');
  } catch (error) { handleError(error); }
  finally { setBusy(form, false); }
}

function closeTaskDetail() {
  document.getElementById('task-detail-dialog').close();
  const url = new URL(location.href);
  url.searchParams.delete('task');
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

function openDeepLink() {
  const taskId = new URL(location.href).searchParams.get('task');
  if (taskId) openTaskDetail(taskId);
}

function openSearch() {
  const dialog = document.getElementById('search-dialog'); const input = document.getElementById('global-search-input');
  input.value = ''; renderSearchResults(); dialog.showModal(); setTimeout(() => input.focus(), 0);
}

function renderSearchResults() {
  const term = document.getElementById('global-search-input').value.trim().toLowerCase();
  const results = state.tasks.filter(task => !term || task.title.toLowerCase().includes(term) || String(task.description).toLowerCase().includes(term)).slice(0, 12);
  const container = document.getElementById('global-search-results');
  container.innerHTML = results.length ? results.map(taskRow).join('') : emptyState('⌕', 'Sin resultados', 'Prueba con otras palabras.');
  container.querySelectorAll('[data-task-id]').forEach(item => item.addEventListener('click', event => { if (event.target.closest('[data-action]')) return; document.getElementById('search-dialog').close(); openTaskDetail(item.dataset.taskId); }));
}

async function restoreItem(button) {
  try {
    if (button.dataset.type === 'task') await api.restoreTask(state.group.id, button.dataset.id);
    else await api.restoreClass(state.group.id, button.dataset.id);
    state.trash = (await api.trash(state.group.id)).items; view.innerHTML = settingsView(state); toast('Elemento restaurado.', 'success');
  } catch (error) { handleError(error); }
}

async function purgeTask(button) {
  if (!confirm(`¿Borrar "${button.dataset.name}" definitivamente? Esta acción no se puede deshacer.`)) return;
  try {
    await api.purgeTask(state.group.id, button.dataset.id);
    state.trash = (await api.trash(state.group.id)).items;
    view.innerHTML = settingsView(state);
    toast('La tarea fue eliminada definitivamente.', 'success');
  } catch (error) { handleError(error); }
}

function openAnnouncementForm(item) {
  const form = document.getElementById('announcement-form');
  form.reset();
  form.elements.id.value = item?.id || '';
  form.elements.body.value = item?.body || '';
  form.elements.event_at.value = item?.event_at ? dateInput(item.event_at) : '';
  form.elements.enable_reminder.checked = false;
  document.getElementById('announcement-form-title').textContent = item ? 'Editar anuncio' : 'Nuevo anuncio';
  document.getElementById('announcement-reminder-toggle').hidden = Boolean(item);
  document.getElementById('announcement-reminder-time').hidden = true;
  form.elements.remind_at.required = false;
  form.elements.remind_at.value = dateInput(new Date(Date.now() + 60 * 60 * 1000));
  document.getElementById('announcement-dialog').showModal();
}

async function saveAnnouncement(event) {
  event.preventDefault();
  const form = event.currentTarget; setBusy(form, true);
  try {
    const values = formValues(form); const id = values.id; delete values.id; delete values.enable_reminder;
    values.event_at = values.event_at ? new Date(values.event_at).toISOString() : null;
    if (!id && form.elements.enable_reminder.checked) values.remind_at = new Date(form.elements.remind_at.value).toISOString();
    else delete values.remind_at;
    if (id) await api.updateAnnouncement(state.group.id, id, values);
    else await api.createAnnouncement(state.group.id, values);
    form.closest('dialog').close();
    await reloadAnnouncements();
    view.innerHTML = announcementsView(state);
    toast(id ? 'Anuncio actualizado.' : 'Anuncio publicado.', 'success');
  } catch (error) { handleError(error); }
  finally { setBusy(form, false); }
}

function openAnnouncementReminder(announcementId) {
  const announcement = state.announcements.find(item => item.id === announcementId);
  const form = document.getElementById('announcement-reminder-form');
  form.reset(); form.elements.announcement_id.value = announcementId;
  const minimum = new Date(Date.now() + 2 * 60 * 1000);
  const suggested = announcement?.event_at
    ? new Date(Math.min(new Date(announcement.event_at).getTime() - 60 * 60 * 1000, Date.now() + 60 * 60 * 1000))
    : new Date(Date.now() + 60 * 60 * 1000);
  form.elements.remind_at.min = dateInput(minimum);
  form.elements.remind_at.value = dateInput(suggested > minimum ? suggested : minimum);
  document.getElementById('announcement-reminder-dialog').showModal();
}

async function saveAnnouncementReminder(event) {
  event.preventDefault();
  const form = event.currentTarget; setBusy(form, true);
  try {
    await api.addAnnouncementReminder(state.group.id, form.elements.announcement_id.value, new Date(form.elements.remind_at.value).toISOString());
    form.closest('dialog').close(); await reloadAnnouncements(); view.innerHTML = announcementsView(state);
    toast('Recordatorio programado.', 'success');
  } catch (error) { handleError(error); }
  finally { setBusy(form, false); }
}

async function deleteAnnouncementReminder(announcementId) {
  try {
    await api.deleteAnnouncementReminder(state.group.id, announcementId);
    await reloadAnnouncements(); view.innerHTML = announcementsView(state);
    toast('Recordatorio cancelado.', 'success');
  } catch (error) { handleError(error); }
}

async function deleteAnnouncement(announcementId) {
  if (!confirm('¿Eliminar este anuncio para todo el grupo?')) return;
  try {
    await api.deleteAnnouncement(state.group.id, announcementId);
    await reloadAnnouncements(); view.innerHTML = announcementsView(state);
    toast('Anuncio eliminado.', 'success');
  } catch (error) { handleError(error); }
}

async function leaveGroup() {
  if (!confirm(`¿Salir de "${state.group.name}"? Dejarás de ver toda su información.`)) return;
  try {
    await api.leaveGroup(state.group.id, state.user.id);
    state.groups = (await api.groups()).groups;
    state.group = state.groups.find(group => !group.archived_at) || null;
    if (!state.group) showScreen('onboarding');
    else await enterApp();
    toast('Saliste del grupo.', 'success');
  } catch (error) { handleError(error); }
}

function renderAvatarPreview() {
  const container = document.getElementById('profile-preview');
  if (!container) return;
  const form = document.getElementById('profile-form');
  container.innerHTML = avatar(state.user.name, 'large', state.avatarDraft === undefined ? state.user.avatar_url : state.avatarDraft, form?.elements.avatar_color.value || state.user.avatar_color);
}

function compressAvatar(file) {
  if (!file.type.match(/^image\/(?:png|jpeg|webp)$/)) return Promise.reject(new Error('Elige una imagen PNG, JPG o WebP.'));
  if (file.size > 8 * 1024 * 1024) return Promise.reject(new Error('La imagen es demasiado grande. El máximo es 8 MB.'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('La imagen no es válida.'));
      image.onload = () => {
        const size = 256; const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
        const context = canvas.getContext('2d');
        const crop = Math.min(image.width, image.height); const x = (image.width - crop) / 2; const y = (image.height - crop) / 2;
        context.drawImage(image, x, y, crop, crop, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', .82));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function deleteClass() {
  const form = document.getElementById('class-form');
  const classId = form.elements.id.value;
  const item = state.classes.find(cls => cls.id === classId);
  if (!item || !confirm(`¿Mover "${item.name}" y sus tareas a la papelera?`)) return;
  setBusy(form, true);
  try {
    await api.deleteClass(state.group.id, classId);
    form.closest('dialog').close();
    await loadCore();
    await navigate();
    toast('Materia movida a la papelera.', 'success');
  } catch (error) { handleError(error); }
  finally { setBusy(form, false); }
}

async function removeMember(button) {
  if (!confirm(`¿Quitar a ${button.dataset.userName} del grupo?`)) return;
  try {
    await api.removeMember(state.group.id, button.dataset.userId);
    state.members = (await api.members(state.group.id)).members;
    view.innerHTML = teamView(state);
    toast('La persona fue retirada del grupo.', 'success');
  } catch (error) { handleError(error); }
}

async function copyCode() {
  await navigator.clipboard.writeText(state.group.join_code);
  toast('Código de invitación copiado.', 'success');
}

async function logout() {
  try { await api.logout(); } catch {}
  state.user = null; state.groups = []; state.group = null; localStorage.removeItem('bdt_group');
  closeMobileMenu();
  showScreen('auth');
}

init();
