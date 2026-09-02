// ==========================================================================
// BASE DE TAREAS - DIRECTORIO DE COMPAÑEROS Y PROGRESO INDIVIDUAL
// ==========================================================================

import { ApiClient } from './api.js';
import { UI } from './ui.js';
import { AuthState } from './auth.js';

export const ClassmatesManager = {
  users: [],
  onUserSwitched: null,

  async init(onUserSwitchedCallback) {
    this.onUserSwitched = onUserSwitchedCallback;
    await this.loadClassmates();
  },

  async loadClassmates() {
    const container = document.getElementById('classmates-container');
    if (container && this.users.length === 0) {
      container.innerHTML = `
        <div class="loading-spinner-wrap">
          <div class="spinner-glass"></div>
          <p>Cargando lista de compañeros...</p>
        </div>
      `;
    }

    try {
      const data = await ApiClient.getUsers();
      this.users = data.users || [];
      this.render();

      const badge = document.getElementById('badge-total-students');
      if (badge) badge.textContent = this.users.length;
    } catch (err) {
      if (container) {
        container.innerHTML = `
          <div class="empty-state-box">
            <span class="empty-icon">⚠️</span>
            <h3 class="empty-title">Error al cargar compañeros</h3>
            <p class="empty-desc">${err.message}</p>
          </div>
        `;
      }
    }
  },

  render() {
    const container = document.getElementById('classmates-container');
    if (!container) return;

    if (this.users.length === 0) {
      container.innerHTML = `
        <div class="empty-state-box glass-card">
          <span class="empty-icon">👥</span>
          <h3 class="empty-title">No hay compañeros registrados</h3>
        </div>
      `;
      return;
    }

    container.innerHTML = this.users.map(u => {
      const defaultAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(u.name)}`;
      const avatar = u.avatar_url || defaultAvatar;
      const isMe = AuthState.currentUser?.id === u.id;
      const progress = u.progress_percent || 0;

      return `
        <div class="classmate-card glass-card ${isMe ? 'is-current-user' : ''}" style="${isMe ? 'border-color: rgba(99, 102, 241, 0.5); box-shadow: 0 0 25px rgba(99,102,241,0.25);' : ''}">
          <img src="${avatar}" alt="${u.name}" class="classmate-avatar-lg" onerror="this.src='${defaultAvatar}'">

          <div>
            <h3 class="classmate-name">${u.name} ${isMe ? '<span style="font-size: 0.8rem; color: var(--accent-cyan);">(Tú)</span>' : ''}</h3>
            <span class="classmate-email">${u.email}</span>
          </div>

          <div class="classmate-stats-pill">
            <i data-lucide="check-circle-2"></i>
            <span>${u.completed_tasks} de ${u.total_tasks} completadas</span>
          </div>

          <!-- Barra de Progreso Personal del Compañero -->
          <div style="width: 100%; margin-top: 0.35rem;">
            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">
              <span>Avance de entregas</span>
              <strong style="color: #ffffff;">${progress}%</strong>
            </div>
            <div class="progress-bar-wrap">
              <div class="progress-bar-fill fill-gradient-primary" style="width: ${progress}%;"></div>
            </div>
          </div>

          <!-- Botón de Cambio Rápido de Cuenta para pruebas -->
          ${!isMe ? `
            <button class="btn btn-glass btn-sm btn-block btn-switch-to-user" data-email="${u.email}" style="margin-top: auto;">
              <i data-lucide="user-check"></i>
              <span>Cambiar a esta cuenta</span>
            </button>
          ` : `
            <div style="font-size: 0.8rem; color: var(--accent-emerald); font-weight: 600; margin-top: auto;">
              ✓ Cuenta activa actualmente
            </div>
          `}
        </div>
      `;
    }).join('');

    UI.refreshIcons();

    // Eventos para cambiar de cuenta rápidamente
    container.querySelectorAll('.btn-switch-to-user').forEach(btn => {
      btn.addEventListener('click', async () => {
        const email = btn.getAttribute('data-email');
        if (!email) return;

        try {
          const res = await ApiClient.login(email, '123456');
          ApiClient.setToken(res.token);
          AuthState.setUser(res.user);
          UI.showToast(`Has cambiado a la cuenta de ${res.user.name}`, 'success');
          if (this.onUserSwitched) this.onUserSwitched();
        } catch (err) {
          // Si tiene contraseña distinta o es cuenta personalizada, abrir modal
          UI.openModal('modal-auth');
          const emailInput = document.getElementById('login-email');
          if (emailInput) emailInput.value = email;
        }
      });
    });
  }
};
