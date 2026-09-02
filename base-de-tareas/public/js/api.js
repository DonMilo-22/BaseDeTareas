// ==========================================================================
// BASE DE TAREAS - CLIENTE DE API FETCH CON TOKEN JWT
// ==========================================================================

const API_BASE = '/api';

export class ApiClient {
  static getToken() {
    return localStorage.getItem('bdt_token');
  }

  static setToken(token) {
    if (token) {
      localStorage.setItem('bdt_token', token);
    } else {
      localStorage.removeItem('bdt_token');
    }
  }

  static async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const token = this.getToken();

    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `Error ${response.status}: ${response.statusText}`);
      }

      return data;
    } catch (err) {
      console.error(`Error en llamada API (${endpoint}):`, err);
      throw err;
    }
  }

  // --- AUTENTICACIÓN ---
  static login(email, password) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  static register(name, email, password, avatar_url) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, avatar_url }),
    });
  }

  static getMe() {
    return this.request('/auth/me', { method: 'GET' });
  }

  static updateProfile(name, avatar_url) {
    return this.request('/auth/me', {
      method: 'PUT',
      body: JSON.stringify({ name, avatar_url }),
    });
  }

  // --- CLASES / MATERIAS ---
  static getClasses() {
    return this.request('/classes', { method: 'GET' });
  }

  static createClass(data) {
    return this.request('/classes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  static updateClass(data) {
    return this.request('/classes', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  static deleteClass(id) {
    return this.request('/classes', {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    });
  }

  // --- TAREAS ---
  static getTasks(filters = {}) {
    const params = new URLSearchParams();
    if (filters.class_id && filters.class_id !== 'todas') params.append('class_id', filters.class_id);
    if (filters.status && filters.status !== 'todas') params.append('status', filters.status);
    if (filters.priority && filters.priority !== 'todas') params.append('priority', filters.priority);
    if (filters.search) params.append('search', filters.search);

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/tasks${query}`, { method: 'GET' });
  }

  static createTask(data) {
    return this.request('/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  static updateTask(data) {
    return this.request('/tasks', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  static deleteTask(id) {
    return this.request('/tasks', {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    });
  }

  static toggleTaskStatus(taskId, completed) {
    return this.request('/tasks/status', {
      method: 'POST',
      body: JSON.stringify({ task_id: taskId, completed }),
    });
  }

  // --- ACTIVIDAD Y ESTADÍSTICAS ---
  static getActivity(limit = 40) {
    return this.request(`/activity?limit=${limit}`, { method: 'GET' });
  }

  static getStats() {
    return this.request('/stats', { method: 'GET' });
  }

  static getUsers() {
    return this.request('/users', { method: 'GET' });
  }
}
