// ==========================================================================
// BASE DE TAREAS - HISTORIAL Y REGISTRO DE ACTIVIDAD EN VIVO
// ==========================================================================

import { ApiClient } from './api.js';
import { UI } from './ui.js';

export const ActivityManager = {
  activities: [],

  async init() {
    this.bindEvents();
    await this.loadActivity();
  },

  async loadActivity() {
    const container = document.getElementById('activity-feed-container');
    if (container && this.activities.length === 0) {
      container.innerHTML = `
        <div class="loading-spinner-wrap">
          <div class="spinner-glass"></div>
          <p>Cargando historial de actividad...</p>
        </div>
      `;
    }

    try {
      const data = await ApiClient.getActivity(50);
      this.activities = data.activities || [];
      this.render();
    } catch (err) {
      if (container) {
        container.innerHTML = `
          <div class="empty-state-box">
            <span class="empty-icon">⚠️</span>
            <h3 class="empty-title">Error al cargar actividad</h3>
            <p class="empty-desc">${err.message}</p>
          </div>
        `;
      }
    }
  },

  render() {
    const container = document.getElementById('activity-feed-container');
    if (!container) return;

    if (this.activities.length === 0) {
      container.innerHTML = `
        <div class="empty-state-box">
          <span class="empty-icon">⚡</span>
          <h3 class="empty-title">Sin actividad reciente</h3>
          <p class="empty-desc">Las acciones que realicen tú y tus compañeros (crear tareas, completarlas, editar apuntes) se registrarán aquí.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.activities.map(item => {
      const defaultAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(item.user_name || 'Estudiante')}`;
      const avatar = item.user_avatar || defaultAvatar;

      // Badges y textos por tipo de acción
      let badgeClass = 'activity-badge-create';
      let badgeText = 'Nueva Tarea';

      if (item.action_type === 'COMPLETAR_TAREA') {
        badgeClass = 'activity-badge-complete';
        badgeText = 'Tarea Completada ✅';
      } else if (item.action_type === 'DESMARCAR_TAREA') {
        badgeClass = 'activity-badge-edit';
        badgeText = 'Marcó como Pendiente ⏳';
      } else if (item.action_type === 'EDITAR_TAREA') {
        badgeClass = 'activity-badge-edit';
        badgeText = 'Edición de Tarea ✏️';
      } else if (item.action_type === 'ELIMINAR_TAREA') {
        badgeClass = 'activity-badge-delete';
        badgeText = 'Tarea Eliminada 🗑️';
      } else if (item.action_type === 'CREAR_CLASE') {
        badgeClass = 'activity-badge-create';
        badgeText = 'Nueva Materia 📚';
      } else if (item.action_type === 'EDITAR_CLASE') {
        badgeClass = 'activity-badge-edit';
        badgeText = 'Edición de Materia ✏️';
      } else if (item.action_type === 'REGISTRO_USUARIO') {
        badgeClass = 'activity-badge-create';
        badgeText = 'Nuevo Compañero 🎓';
      }

      return `
        <div class="activity-item">
          <img src="${avatar}" alt="${item.user_name || 'Usuario'}" class="activity-user-avatar" onerror="this.src='${defaultAvatar}'">
          <div class="activity-item-content">
            <div class="activity-item-header">
              <span class="activity-user-name">${item.user_name || 'Compañero'}</span>
              <span class="activity-badge ${badgeClass}">${badgeText}</span>
            </div>
            ${item.target_title ? `
              <div style="font-weight: 600; color: #ffffff; font-size: 0.92rem; margin-top: 0.2rem;">
                ${item.target_title}
              </div>
            ` : ''}
            <p class="activity-details-text">${item.details || ''}</p>
            <div class="activity-time-stamp">
              <i data-lucide="clock" style="width: 12px; height: 12px; display: inline-block; vertical-align: middle; margin-right: 3px;"></i>
              ${UI.formatRelativeTime(item.created_at)}
            </div>
          </div>
        </div>
      `;
    }).join('');

    UI.refreshIcons();
  },

  bindEvents() {
    document.getElementById('btn-refresh-activity')?.addEventListener('click', () => {
      UI.showToast('Actualizando historial de actividades...', 'info');
      this.loadActivity();
    });
  }
};
