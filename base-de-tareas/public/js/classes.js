// ==========================================================================
// BASE DE TAREAS - GESTOR DE MATERIAS Y CLASES
// ==========================================================================

import { ApiClient } from './api.js';
import { UI } from './ui.js';
import { AuthState } from './auth.js';

export const ClassesManager = {
  classes: [],
  selectedColor: '#6366f1',
  selectedIcon: '📚',
  currentTopics: ['Tema 1', 'Tema 2', 'Tema 3'],
  onDataChanged: null,

  async init(onDataChangedCallback) {
    this.onDataChanged = onDataChangedCallback;
    this.bindEvents();
    await this.loadClasses();
  },

  async loadClasses() {
    const container = document.getElementById('classes-container');
    if (container && this.classes.length === 0) {
      container.innerHTML = `
        <div class="loading-spinner-wrap">
          <div class="spinner-glass"></div>
          <p>Cargando materias y clases...</p>
        </div>
      `;
    }

    try {
      const data = await ApiClient.getClasses();
      this.classes = data.classes || [];
      this.render();

      const badge = document.getElementById('badge-total-classes');
      if (badge) badge.textContent = this.classes.length;
    } catch (err) {
      if (container) {
        container.innerHTML = `
          <div class="empty-state-box glass-card">
            <span class="empty-icon">⚠️</span>
            <h3 class="empty-title">Error al cargar materias</h3>
            <p class="empty-desc">${err.message}</p>
          </div>
        `;
      }
    }
  },

  render() {
    const container = document.getElementById('classes-container');
    if (!container) return;

    if (this.classes.length === 0) {
      container.innerHTML = `
        <div class="empty-state-box glass-card">
          <span class="empty-icon">📚</span>
          <h3 class="empty-title">No hay materias registradas</h3>
          <p class="empty-desc">Comienza agregando tu primera materia o clase para organizar las tareas escolares.</p>
          <button class="btn btn-primary btn-glow" id="btn-empty-new-class">
            <i data-lucide="plus-circle"></i>
            <span>Añadir Primera Materia</span>
          </button>
        </div>
      `;
      document.getElementById('btn-empty-new-class')?.addEventListener('click', () => this.openClassModal());
      UI.refreshIcons();
      return;
    }

    container.innerHTML = this.classes.map(c => {
      const progress = c.my_progress_percent || 0;
      const themeColor = c.color || '#6366f1';
      const topicsList = Array.isArray(c.topics) && c.topics.length > 0 ? c.topics : ['Tema 1', 'Tema 2', 'Tema 3'];

      return `
        <div class="class-card glass-card" style="border-top: 3px solid ${themeColor};">
          <div class="class-card-top">
            <div class="class-icon-badge" style="background: ${themeColor}25; border: 1px solid ${themeColor}50;">
              <span>${c.icon || '📚'}</span>
            </div>

            <div class="task-card-actions">
              <button class="icon-btn btn-edit-class" data-class-id="${c.id}" title="Editar materia">
                <i data-lucide="pencil"></i>
              </button>
              <button class="icon-btn text-danger btn-delete-class" data-class-id="${c.id}" title="Eliminar materia">
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </div>

          <div>
            <h3 class="class-title">${c.name}</h3>
            ${c.code ? `<span class="task-class-badge" style="margin-top: 0.3rem;">${c.code}</span>` : ''}
          </div>

          <div class="class-meta-details">
            ${c.teacher ? `
              <div class="class-meta-row">
                <i data-lucide="user-check"></i>
                <span>Prof: <strong>${c.teacher}</strong></span>
              </div>
            ` : ''}
            ${c.schedule ? `
              <div class="class-meta-row">
                <i data-lucide="calendar"></i>
                <span>${c.schedule}</span>
              </div>
            ` : ''}
          </div>

          <!-- Unidades Temáticas de la Materia -->
          <div style="display: flex; flex-direction: column; gap: 0.35rem;">
            <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">
              <i data-lucide="layers" style="width: 12px; height: 12px; display: inline-block; vertical-align: middle;"></i>
              ${topicsList.length} Temas / Unidades:
            </span>
            <div style="display: flex; flex-wrap: wrap; gap: 0.3rem;">
              ${topicsList.slice(0, 4).map(top => `
                <span class="task-topic-badge" style="font-size: 0.7rem; padding: 0.15rem 0.45rem;">${top}</span>
              `).join('')}
              ${topicsList.length > 4 ? `<span style="font-size: 0.7rem; color: var(--text-muted);">+${topicsList.length - 4} más</span>` : ''}
            </div>
          </div>

          <div class="class-card-progress">
            <div class="class-progress-labels">
              <span class="text-muted">Mi progreso: <strong>${c.my_completed_tasks || 0}/${c.total_tasks || 0} tareas</strong></span>
              <strong style="color: ${themeColor}; font-weight: 700;">${progress}%</strong>
            </div>
            <div class="progress-bar-wrap">
              <div class="progress-bar-fill" style="width: ${progress}%; background: ${themeColor};"></div>
            </div>
          </div>

          <button class="btn btn-glass btn-sm btn-filter-class" data-class-id="${c.id}" style="margin-top: auto;">
            <i data-lucide="layers"></i>
            <span>Ver Tareas (${c.total_tasks || 0})</span>
          </button>
        </div>
      `;
    }).join('');

    UI.refreshIcons();

    // Eventos de Editar Clase
    container.querySelectorAll('.btn-edit-class').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const classId = btn.getAttribute('data-class-id');
        const c = this.classes.find(item => item.id === classId);
        if (c) this.openClassModal(c);
      });
    });

    // Eventos de Eliminar Clase
    container.querySelectorAll('.btn-delete-class').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const classId = btn.getAttribute('data-class-id');
        const c = this.classes.find(item => item.id === classId);
        if (!c) return;

        const ok = confirm(`¿Estás seguro de eliminar la clase "${c.name}"? Se borrarán también todas las tareas asociadas.`);
        if (!ok) return;

        try {
          await ApiClient.deleteClass(classId);
          UI.showToast(`Clase "${c.name}" eliminada correctamente.`, 'success');
          await this.loadClasses();
          if (this.onDataChanged) this.onDataChanged();
        } catch (err) {
          UI.showToast(err.message, 'error');
        }
      });
    });

    // Evento "Ver Tareas" -> cambia filtro y tab a tareas
    container.querySelectorAll('.btn-filter-class').forEach(btn => {
      btn.addEventListener('click', () => {
        const classId = btn.getAttribute('data-class-id');
        window.dispatchEvent(new CustomEvent('filter-class-request', { detail: classId }));
      });
    });
  },

  renderFormTopicsList() {
    const list = document.getElementById('class-form-topics-list');
    if (!list) return;

    if (this.currentTopics.length === 0) {
      list.innerHTML = `<span style="font-size: 0.78rem; color: var(--text-muted); font-style: italic;">Sin temas añadidos aún.</span>`;
      return;
    }

    list.innerHTML = this.currentTopics.map((topic, idx) => `
      <div class="topic-tag-chip">
        <span>${topic}</span>
        <button type="button" class="btn-remove-topic" data-idx="${idx}" title="Eliminar tema">✕</button>
      </div>
    `).join('');

    list.querySelectorAll('.btn-remove-topic').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        this.currentTopics.splice(idx, 1);
        this.renderFormTopicsList();
      });
    });
  },

  openClassModal(cls = null) {
    if (!AuthState.isAuthenticated) {
      UI.showToast('Debes iniciar sesión para crear o editar materias.', 'warning');
      UI.openModal('modal-auth');
      return;
    }

    const modalTitle = document.getElementById('class-form-modal-title');
    const idInput = document.getElementById('class-form-id');
    const nameInput = document.getElementById('class-form-name');
    const codeInput = document.getElementById('class-form-code');
    const teacherInput = document.getElementById('class-form-teacher');
    const scheduleInput = document.getElementById('class-form-schedule');

    if (cls) {
      if (modalTitle) modalTitle.textContent = 'Editar Materia';
      if (idInput) idInput.value = cls.id;
      if (nameInput) nameInput.value = cls.name;
      if (codeInput) codeInput.value = cls.code || '';
      if (teacherInput) teacherInput.value = cls.teacher || '';
      if (scheduleInput) scheduleInput.value = cls.schedule || '';
      this.selectedColor = cls.color || '#6366f1';
      this.selectedIcon = cls.icon || '📚';
      this.currentTopics = Array.isArray(cls.topics) && cls.topics.length > 0 ? [...cls.topics] : ['Tema 1', 'Tema 2', 'Tema 3'];
    } else {
      if (modalTitle) modalTitle.textContent = 'Nueva Materia';
      if (idInput) idInput.value = '';
      if (nameInput) nameInput.value = '';
      if (codeInput) codeInput.value = '';
      if (teacherInput) teacherInput.value = '';
      if (scheduleInput) scheduleInput.value = '';
      this.selectedColor = '#6366f1';
      this.selectedIcon = '📚';
      this.currentTopics = ['Tema 1: Fundamentos', 'Tema 2: Desarrollo', 'Tema 3: Proyecto Final'];
    }

    this.renderFormTopicsList();

    // Actualizar selectores visuales de icono y color
    document.querySelectorAll('#class-icon-selector .icon-choice').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-icon') === this.selectedIcon);
    });

    document.querySelectorAll('#class-color-selector .color-choice').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-color') === this.selectedColor);
    });

    UI.openModal('modal-class-form');
  },

  bindEvents() {
    // Botones "+ Nueva Clase"
    document.getElementById('btn-new-class')?.addEventListener('click', () => this.openClassModal());
    document.getElementById('btn-new-class-2')?.addEventListener('click', () => this.openClassModal());

    // Añadir tema en el modal de clase
    const addTopicBtn = document.getElementById('btn-add-class-topic');
    const newTopicInput = document.getElementById('class-form-new-topic-input');

    const handleAddTopic = () => {
      const val = newTopicInput?.value.trim();
      if (val) {
        if (!this.currentTopics.includes(val)) {
          this.currentTopics.push(val);
          this.renderFormTopicsList();
        }
        newTopicInput.value = '';
      }
    };

    addTopicBtn?.addEventListener('click', handleAddTopic);
    newTopicInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddTopic();
      }
    });

    // Selector de Icono
    document.querySelectorAll('#class-icon-selector .icon-choice').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#class-icon-selector .icon-choice').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedIcon = btn.getAttribute('data-icon') || '📚';
      });
    });

    // Selector de Color
    document.querySelectorAll('#class-color-selector .color-choice').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#class-color-selector .color-choice').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedColor = btn.getAttribute('data-color') || '#6366f1';
      });
    });

    // Formulario Guardar Clase
    const formClass = document.getElementById('form-class');
    formClass?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('class-form-id')?.value;
      const name = document.getElementById('class-form-name')?.value.trim();
      const code = document.getElementById('class-form-code')?.value.trim();
      const teacher = document.getElementById('class-form-teacher')?.value.trim();
      const schedule = document.getElementById('class-form-schedule')?.value.trim();

      if (!name) {
        UI.showToast('El nombre de la materia es obligatorio.', 'warning');
        return;
      }

      const payload = {
        name,
        code,
        teacher,
        schedule,
        color: this.selectedColor,
        icon: this.selectedIcon,
        topics: this.currentTopics.length > 0 ? this.currentTopics : ['Tema 1', 'Tema 2', 'Tema 3'],
      };

      try {
        if (id) {
          payload.id = id;
          await ApiClient.updateClass(payload);
          UI.showToast('¡Materia actualizada exitosamente!', 'success');
        } else {
          await ApiClient.createClass(payload);
          UI.showToast('¡Nueva materia añadida con sus temas!', 'success');
        }

        UI.closeModal('modal-class-form');
        await this.loadClasses();
        if (this.onDataChanged) this.onDataChanged();
      } catch (err) {
        UI.showToast(err.message, 'error');
      }
    });
  }
};
