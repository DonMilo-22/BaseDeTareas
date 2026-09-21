export class ApiError extends Error {
  constructor(message, status, code, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (!response.ok) throw new ApiError('La respuesta del servidor no fue válida.', response.status, 'INVALID_RESPONSE');
    return response;
  }
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error?.message || 'No se pudo completar la operación.', response.status, data.error?.code, data.error?.details);
  return data;
}

const json = (method, body) => ({ method, body: JSON.stringify(body) });
const groupPath = (groupId, suffix = '') => `/api/groups/${encodeURIComponent(groupId)}${suffix}`;

export const api = {
  register: data => request('/api/auth/register', json('POST', data)),
  verifyRegistration: data => request('/api/auth/register/verify', json('POST', data)),
  resendRegistrationCode: email => request('/api/auth/register/resend', json('POST', { email })),
  forgotPassword: email => request('/api/auth/password/forgot', json('POST', { email })),
  resetPassword: data => request('/api/auth/password/reset', json('POST', data)),
  login: data => request('/api/auth/login', json('POST', data)),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  me: () => request('/api/auth/me'),
  updateProfile: data => request('/api/auth/me', json('PATCH', data)),
  deleteAccount: () => request('/api/auth/me', { method: 'DELETE' }),
  pushConfig: () => request('/api/push/config'),
  subscribePush: subscription => request('/api/push/subscriptions', json('POST', subscription)),
  unsubscribePush: endpoint => request('/api/push/subscriptions', json('DELETE', { endpoint })),
  testPush: () => request('/api/push/test', { method: 'POST' }),

  groups: () => request('/api/groups'),
  createGroup: data => request('/api/groups', json('POST', data)),
  joinGroup: code => request('/api/groups/join', json('POST', { code })),
  updateGroup: (id, data) => request(groupPath(id), json('PATCH', data)),
  dashboard: id => request(groupPath(id, '/dashboard')),
  members: id => request(groupPath(id, '/members')),
  updateRole: (id, userId, role) => request(groupPath(id, `/members/${userId}`), json('PATCH', { role })),
  removeMember: (id, userId) => request(groupPath(id, `/members/${userId}`), { method: 'DELETE' }),
  leaveGroup: (id, userId) => request(groupPath(id, `/members/${userId}`), { method: 'DELETE' }),

  classes: id => request(groupPath(id, '/classes')),
  createClass: (id, data) => request(groupPath(id, '/classes'), json('POST', data)),
  updateClass: (id, classId, data) => request(groupPath(id, `/classes/${classId}`), json('PATCH', data)),
  deleteClass: (id, classId) => request(groupPath(id, `/classes/${classId}`), { method: 'DELETE' }),
  restoreClass: (id, classId) => request(groupPath(id, `/classes/${classId}/restore`), { method: 'POST' }),

  tasks: (id, filters = {}) => {
    const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value != null));
    return request(groupPath(id, `/tasks${params.size ? `?${params}` : ''}`));
  },
  task: (id, taskId) => request(groupPath(id, `/tasks/${taskId}`)),
  createTask: (id, data) => request(groupPath(id, '/tasks'), json('POST', data)),
  updateTask: (id, taskId, data) => request(groupPath(id, `/tasks/${taskId}`), json('PATCH', data)),
  deleteTask: (id, taskId) => request(groupPath(id, `/tasks/${taskId}`), { method: 'DELETE' }),
  restoreTask: (id, taskId) => request(groupPath(id, `/tasks/${taskId}/restore`), { method: 'POST' }),
  completeTask: (id, taskId, completed) => request(groupPath(id, `/tasks/${taskId}/completion`), json('PUT', { completed })),
  completeSubtask: (id, taskId, subtaskId, completed) => request(groupPath(id, `/tasks/${taskId}/subtasks/${subtaskId}/completion`), json('PUT', { completed })),
  addComment: (id, taskId, body) => request(groupPath(id, `/tasks/${taskId}/comments`), json('POST', { body })),
  addAttachment: (id, taskId, data) => request(groupPath(id, `/tasks/${taskId}/attachments`), json('POST', data)),
  addReminder: (id, taskId, remind_at) => request(groupPath(id, `/tasks/${taskId}/reminders`), json('POST', { remind_at })),
  deleteReminder: (id, taskId, reminderId) => request(groupPath(id, `/tasks/${taskId}/reminders/${reminderId}`), { method: 'DELETE' }),

  activity: id => request(groupPath(id, '/activity')),
  trash: id => request(groupPath(id, '/trash')),
  purgeTask: (id, taskId) => request(groupPath(id, `/trash/tasks/${taskId}`), { method: 'DELETE' }),
  announcements: id => request(groupPath(id, '/announcements')),
  createAnnouncement: (id, data) => request(groupPath(id, '/announcements'), json('POST', data)),
  updateAnnouncement: (id, announcementId, data) => request(groupPath(id, `/announcements/${announcementId}`), json('PATCH', data)),
  deleteAnnouncement: (id, announcementId) => request(groupPath(id, `/announcements/${announcementId}`), { method: 'DELETE' }),
  addAnnouncementReminder: (id, announcementId, remind_at) => request(groupPath(id, `/announcements/${announcementId}/reminder`), json('POST', { remind_at })),
  deleteAnnouncementReminder: (id, announcementId) => request(groupPath(id, `/announcements/${announcementId}/reminder`), { method: 'DELETE' }),
  personalReminders: id => request(groupPath(id, '/personal-reminders')),
  createPersonalReminder: (id, data) => request(groupPath(id, '/personal-reminders'), json('POST', data)),
  updatePersonalReminder: (id, reminderId, data) => request(groupPath(id, `/personal-reminders/${reminderId}`), json('PATCH', data)),
  deletePersonalReminder: (id, reminderId) => request(groupPath(id, `/personal-reminders/${reminderId}`), { method: 'DELETE' }),
  semesters: id => request(groupPath(id, '/semesters')),
  exportUrl: (id, format) => groupPath(id, `/export?format=${format}`),
};
