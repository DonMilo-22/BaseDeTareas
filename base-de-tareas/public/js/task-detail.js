// ==========================================================================
// BASE DE TAREAS - MODAL DETALLE DE TAREA, FOTOS Y LISTA DE CUMPLIMIENTO
// ==========================================================================

import { ApiClient } from './api.js';
import { UI } from './ui.js';
import { AuthState } from './auth.js';

export const TaskDetail = {
  currentTask: null,
  onTaskModified: null,

  init(onTaskModifiedCallback) {
    this.onTaskModified = onTaskModifiedCallback;
    this.bindEvents();
  },

  async show(task) {
    this.currentTask = task;
    this.render();
    UI.openModal('modal-task-detail');
  },

  render() {
    if (!this.currentTask) return;
    const task = this.currentTask;

    // 1. Badge de Clase y Tema
    const classBadgeEl = document.getElementById('detail-class-badge');
    if (classBadgeEl) {
      classBadgeEl.innerHTML = `
        <span class="task-class-badge" style="border-color: ${task.class_color || '#6366f1'}; background: ${task.class_color ? task.class_color + '25' : 'rgba(99,102,241,0.2)'};">
          <span>${task.class_icon || '📚'}</span>
          <span>${task.class_name} ${task.class_code ? `(${task.class_code})` : ''}</span>
        </span>
      `;
    }

    const topicBadgeEl = document.getElementById('detail-topic-badge');
    if (topicBadgeEl) {
      topicBadgeEl.textContent = `📌 ${task.topic || 'Tema 1'}`;
    }

    // 2. Título
    const titleEl = document.getElementById('detail-task-title');
    if (titleEl) titleEl.textContent = task.title;

    // 3. Badges de Prioridad y Vencimiento
    const priorityBadgeEl = document.getElementById('detail-priority-badge');
    if (priorityBadgeEl) {
      priorityBadgeEl.className = `priority-badge priority-${task.priority || 'media'}`;
      const labels = { urgente: '🔴 Urgente', alta: '🟠 Alta', media: '🔵 Media', baja: '🟢 Baja' };
      priorityBadgeEl.textContent = labels[task.priority] || '🔵 Media';
    }

    const dueBadgeEl = document.getElementById('detail-due-badge');
    if (dueBadgeEl) {
      const dueInfo = UI.getDueBadgeInfo(task.due_date, task.completed_by_me === 1);
      dueBadgeEl.className = `due-badge ${dueInfo.class}`;
      dueBadgeEl.textContent = `${dueInfo.text} • ${UI.formatDateTime(task.due_date)}`;
    }

    // 4. Botón de Completado Personal
    const btnStatus = document.getElementById('btn-detail-toggle-status');
    if (btnStatus) {
      if (task.completed_by_me === 1) {
        btnStatus.className = 'btn btn-status-toggle completed';
        btnStatus.innerHTML = `
          <i data-lucide="check-circle-2"></i>
          <span>Completada por mí ✓</span>
        `;
      } else {
        btnStatus.className = 'btn btn-status-toggle';
        btnStatus.innerHTML = `
          <i data-lucide="circle"></i>
          <span>Marcar como Completada por mí</span>
        `;
      }
    }

    // 5. Descripción
    const descBox = document.getElementById('detail-description-text');
    if (descBox) {
      descBox.textContent = task.description || 'No se ingresaron instrucciones adicionales para esta tarea.';
    }

    // 6. Galería de Fotos de Referencia
    const photos = Array.isArray(task.photos) ? task.photos : [];
    const photosSection = document.getElementById('detail-photos-section');
    const photosCount = document.getElementById('detail-photos-count');
    const galleryGrid = document.getElementById('detail-photos-gallery');

    if (photosCount) photosCount.textContent = photos.length;

    if (photos.length === 0) {
      if (photosSection) photosSection.style.display = 'none';
    } else {
      if (photosSection) photosSection.style.display = 'flex';
      if (galleryGrid) {
        galleryGrid.innerHTML = photos.map((url, idx) => `
          <div class="gallery-photo-card glass-card" data-img="${url}">
            <img src="${url}" alt="Referencia visual ${idx + 1}" loading="lazy">
            <div class="gallery-photo-zoom-icon">
              <i data-lucide="zoom-in"></i>
            </div>
          </div>
        `).join('');

        // Clic para abrir en Lightbox
        galleryGrid.querySelectorAll('.gallery-photo-card').forEach(card => {
          card.addEventListener('click', () => {
            const src = card.getAttribute('data-img');
            if (src) UI.openLightbox(src);
          });
        });
      }
    }

    // 7. LISTA DE CUMPLIMIENTO DE COMPAÑEROS
    const completions = Array.isArray(task.completions_list) ? task.completions_list : [];
    const completedList = completions.filter(c => c.completed === 1);
    const pendingList = completions.filter(c => c.completed !== 1);

    const totalStudents = completions.length;
    const completedCount = completedList.length;
    const percent = totalStudents > 0 ? Math.round((completedCount / totalStudents) * 100) : 0;

    const summaryEl = document.getElementById('detail-completion-summary');
    if (summaryEl) {
      summaryEl.textContent = `${completedCount} de ${totalStudents} compañeros han completado esta tarea (${percent}%)`;
    }

    const percentPill = document.getElementById('detail-completion-percent');
    if (percentPill) percentPill.textContent = `${percent}%`;

    const barEl = document.getElementById('detail-completion-bar');
    if (barEl) barEl.style.width = `${percent}%`;

    // Lista de alumnos completados
    const completedCol = document.getElementById('detail-completed-students');
    if (completedCol) {
      if (completedList.length === 0) {
        completedCol.innerHTML = `<p class="text-muted" style="font-size: 0.8rem; font-style: italic;">Aún ningún compañero la ha marcado como lista.</p>`;
      } else {
        completedCol.innerHTML = completedList.map(c => {
          const defaultAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(c.name)}`;
          const isMe = AuthState.currentUser?.id === c.user_id;
          const timeText = c.completed_at ? UI.formatRelativeTime(c.completed_at) : 'Completado';
          return `
            <div class="student-status-chip">
              <div class="student-status-left">
                <img src="${c.avatar_url || defaultAvatar}" alt="${c.name}" class="student-avatar-sm" onerror="this.src='${defaultAvatar}'">
                <div>
                  <span class="student-name-text">${c.name} ${isMe ? '<small style="color: var(--accent-cyan);">(Tú)</small>' : ''}</span>
                  <div class="student-time-text">${timeText}</div>
                </div>
              </div>
              <span class="text-success" style="font-weight: 700;">✓</span>
            </div>
          `;
        }).join('');
      }
    }

    // Lista de alumnos pendientes
    const pendingCol = document.getElementById('detail-pending-students');
    if (pendingCol) {
      if (pendingList.length === 0) {
        pendingCol.innerHTML = `<p class="text-success" style="font-size: 0.8rem; font-weight: 600;">🎉 ¡Todos los compañeros han terminado esta tarea!</p>`;
      } else {
        pendingCol.innerHTML = pendingList.map(c => {
          const defaultAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(c.name)}`;
          const isMe = AuthState.currentUser?.id === c.user_id;
          return `
            <div class="student-status-chip">
              <div class="student-status-left">
                <img src="${c.avatar_url || defaultAvatar}" alt="${c.name}" class="student-avatar-sm" onerror="this.src='${defaultAvatar}'">
                <span class="student-name-text">${c.name} ${isMe ? '<small style="color: var(--accent-cyan);">(Tú)</small>' : ''}</span>
              </div>
              <span class="text-warning" style="font-size: 0.8rem; font-weight: 600;">Pendiente</span>
            </div>
          `;
        }).join('');
      }
    }

    // 8. Footer de Auditoría
    const creatorEl = document.getElementById('detail-creator-name');
    if (creatorEl) creatorEl.textContent = task.creator_name || 'Compañero';

    const updatedEl = document.getElementById('detail-updated-at');
    if (updatedEl) updatedEl.textContent = task.updated_at ? UI.formatRelativeTime(task.updated_at) : 'Reciente';

    UI.refreshIcons();
  },

  bindEvents() {
    // Toggle Status Button en el Modal
    const btnStatus = document.getElementById('btn-detail-toggle-status');
    btnStatus?.addEventListener('click', async () => {
      if (!this.currentTask) return;
      if (!AuthState.isAuthenticated) {
        UI.showToast('Debes iniciar sesión para marcar tus tareas.', 'warning');
        UI.openModal('modal-auth');
        return;
      }

      const newStatus = this.currentTask.completed_by_me === 1 ? 0 : 1;
      try {
        await ApiClient.toggleTaskStatus(this.currentTask.id, newStatus);
        this.currentTask.completed_by_me = newStatus;

        // Actualizar completions_list localmente
        const myId = AuthState.currentUser.id;
        const myEntry = this.currentTask.completions_list?.find(c => c.user_id === myId);
        if (myEntry) {
          myEntry.completed = newStatus;
          myEntry.completed_at = newStatus === 1 ? new Date().toISOString() : null;
        }

        this.render();
        UI.showToast(newStatus === 1 ? '¡Tarea marcada como completada! 🎉' : 'Tarea marcada como pendiente.', 'success');

        if (this.onTaskModified) {
          this.onTaskModified();
        }
      } catch (err) {
        UI.showToast(err.message, 'error');
      }
    });

    // Botón de Editar Tarea desde el Detalle
    const btnEdit = document.getElementById('btn-detail-edit');
    btnEdit?.addEventListener('click', () => {
      if (!this.currentTask) return;
      UI.closeModal('modal-task-detail');
      window.dispatchEvent(new CustomEvent('edit-task-request', { detail: this.currentTask }));
    });

    // Botón de Eliminar Tarea desde el Detalle
    const btnDelete = document.getElementById('btn-detail-delete');
    btnDelete?.addEventListener('click', async () => {
      if (!this.currentTask) return;
      const confirmDelete = confirm(`¿Estás seguro de que deseas eliminar la tarea "${this.currentTask.title}"? Esta acción se registrará en el historial del grupo.`);
      if (!confirmDelete) return;

      try {
        await ApiClient.deleteTask(this.currentTask.id);
        UI.closeModal('modal-task-detail');
        UI.showToast('Tarea eliminada correctamente.', 'success');
        if (this.onTaskModified) {
          this.onTaskModified();
        }
      } catch (err) {
        UI.showToast(err.message, 'error');
      }
    });
  }
};
