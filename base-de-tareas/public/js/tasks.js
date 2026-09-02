// ==========================================================================
// BASE DE TAREAS - GESTOR DE TAREAS, FILTROS Y FORMULARIOS CON TEMAS Y FOTOS
// ==========================================================================

import { ApiClient } from './api.js';
import { UI } from './ui.js';
import { AuthState } from './auth.js';
import { TaskDetail } from './task-detail.js';

export const TasksManager = {
  tasks: [],
  classes: [],
  filters: {
    class_id: 'todas',
    topic: 'todos',
    status: 'todas',
    priority: 'todas',
    search: '',
    viewMode: 'grid', // 'grid' | 'list'
  },
  formPhotos: [], // Array de URLs o data URLs en el modal de creación
  onDataChanged: null,

  async init(onDataChangedCallback) {
    this.onDataChanged = onDataChangedCallback;
    this.bindEvents();
    await this.loadClasses();
    await this.loadTasks();
  },

  async loadClasses() {
    try {
      const data = await ApiClient.getClasses();
      this.classes = data.classes || [];
      this.renderClassPills();
      this.populateClassSelect();
      this.renderTopicFilter();
    } catch (err) {
      console.error("Error al cargar clases en tasks:", err);
    }
  },

  async loadTasks() {
    const container = document.getElementById('tasks-container');
    if (container && this.tasks.length === 0) {
      container.innerHTML = `
        <div class="loading-spinner-wrap">
          <div class="spinner-glass"></div>
          <p>Cargando tareas y recordatorios...</p>
        </div>
      `;
    }

    try {
      const data = await ApiClient.getTasks(this.filters);
      this.tasks = data.tasks || [];
      this.renderTasks();

      // Actualizar contador del tab
      const badge = document.getElementById('badge-total-tasks');
      if (badge) badge.textContent = this.tasks.length;
    } catch (err) {
      if (container) {
        container.innerHTML = `
          <div class="empty-state-box glass-card">
            <span class="empty-icon">⚠️</span>
            <h3 class="empty-title">Error al cargar tareas</h3>
            <p class="empty-desc">${err.message}</p>
            <button class="btn btn-primary btn-sm" id="btn-retry-tasks">Reintentar</button>
          </div>
        `;
        document.getElementById('btn-retry-tasks')?.addEventListener('click', () => this.loadTasks());
      }
    }
  },

  renderClassPills() {
    const container = document.getElementById('class-filter-pills');
    if (!container) return;

    let html = `
      <button class="class-pill ${this.filters.class_id === 'todas' ? 'active' : ''}" data-class-id="todas">
        <span class="pill-icon">✨</span>
        <span class="pill-name">Todas las materias</span>
      </button>
    `;

    for (const c of this.classes) {
      const isActive = this.filters.class_id === c.id;
      html += `
        <button class="class-pill ${isActive ? 'active' : ''}" data-class-id="${c.id}" style="${isActive ? `border-color: ${c.color}; box-shadow: 0 0 15px ${c.color}40;` : ''}">
          <span class="pill-icon">${c.icon || '📚'}</span>
          <span class="pill-name">${c.name}</span>
          ${c.total_tasks ? `<span class="badge-counter">${c.total_tasks}</span>` : ''}
        </button>
      `;
    }

    container.innerHTML = html;

    container.querySelectorAll('.class-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        this.filters.class_id = btn.getAttribute('data-class-id') || 'todas';
        this.filters.topic = 'todos'; // Resetear tema al cambiar materia
        this.renderClassPills();
        this.renderTopicFilter();
        this.loadTasks();
      });
    });
  },

  renderTopicFilter() {
    const topicSelect = document.getElementById('topic-filter');
    if (!topicSelect) return;

    let topics = [];
    if (this.filters.class_id !== 'todas') {
      const currentClass = this.classes.find(c => c.id === this.filters.class_id);
      topics = currentClass?.topics || ['Tema 1', 'Tema 2', 'Tema 3'];
    } else {
      // Unir todos los temas únicos de todas las clases
      const set = new Set();
      this.classes.forEach(c => {
        (c.topics || ['Tema 1', 'Tema 2', 'Tema 3']).forEach(t => set.add(t));
      });
      topics = Array.from(set);
    }

    let html = `<option value="todos">Todos los temas (${topics.length})</option>`;
    for (const t of topics) {
      html += `<option value="${t}" ${this.filters.topic === t ? 'selected' : ''}>📌 ${t}</option>`;
    }

    topicSelect.innerHTML = html;
  },

  populateClassSelect() {
    const select = document.getElementById('task-form-class');
    if (!select) return;

    if (this.classes.length === 0) {
      select.innerHTML = `<option value="">-- No hay materias disponibles --</option>`;
      return;
    }

    select.innerHTML = this.classes.map(c => `
      <option value="${c.id}">${c.icon || '📚'} ${c.name} ${c.code ? `(${c.code})` : ''}</option>
    `).join('');
  },

  populateTopicSelect(classId, selectedTopic = 'Tema 1') {
    const topicSelect = document.getElementById('task-form-topic');
    if (!topicSelect) return;

    const chosenClass = this.classes.find(c => c.id === classId) || this.classes[0];
    const topics = chosenClass?.topics || ['Tema 1', 'Tema 2', 'Tema 3'];

    topicSelect.innerHTML = topics.map(t => `
      <option value="${t}" ${t === selectedTopic ? 'selected' : ''}>📌 ${t}</option>
    `).join('');

    // Si el topic guardado no está en la lista estándar, agregarlo
    if (selectedTopic && !topics.includes(selectedTopic)) {
      const opt = document.createElement('option');
      opt.value = selectedTopic;
      opt.textContent = `📌 ${selectedTopic}`;
      opt.selected = true;
      topicSelect.appendChild(opt);
    }
  },

  renderTasks() {
    const container = document.getElementById('tasks-container');
    if (!container) return;

    if (this.tasks.length === 0) {
      container.innerHTML = `
        <div class="empty-state-box glass-card">
          <span class="empty-icon">📝</span>
          <h3 class="empty-title">No hay tareas con este filtro</h3>
          <p class="empty-desc">Crea una nueva asignación o cambia el filtro de materia o tema para visualizar otros deberes.</p>
          <button class="btn btn-primary btn-glow" id="btn-empty-new-task">
            <i data-lucide="plus-circle"></i>
            <span>Crear Primera Tarea</span>
          </button>
        </div>
      `;
      document.getElementById('btn-empty-new-task')?.addEventListener('click', () => this.openTaskModal());
      UI.refreshIcons();
      return;
    }

    const isGrid = this.filters.viewMode === 'grid';
    container.className = `tasks-container ${isGrid ? 'tasks-grid' : 'tasks-list'}`;

    container.innerHTML = this.tasks.map(task => {
      const isCompleted = task.completed_by_me === 1;
      const dueInfo = UI.getDueBadgeInfo(task.due_date, isCompleted);
      const photos = Array.isArray(task.photos) ? task.photos : [];
      const completions = Array.isArray(task.completions_list) ? task.completions_list : [];
      const completedUsers = completions.filter(c => c.completed === 1);
      const topicName = task.topic || 'Tema 1';

      // Stack de avatares (máx 4)
      const avatarStack = completedUsers.slice(0, 4).map(c => {
        const defaultAv = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(c.name)}`;
        return `<img src="${c.avatar_url || defaultAv}" alt="${c.name}" title="${c.name}" class="avatar-stack-item" onerror="this.src='${defaultAv}'">`;
      }).join('');

      return `
        <div class="task-card glass-card ${isCompleted ? 'is-completed' : ''}" data-task-id="${task.id}">
          <!-- Cabecera: Materia, Tema y Badges -->
          <div class="task-card-header">
            <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
              <span class="task-class-badge" style="border-color: ${task.class_color || '#6366f1'}; background: ${task.class_color ? task.class_color + '20' : 'rgba(99,102,241,0.15)'};">
                <span>${task.class_icon || '📚'}</span>
                <span>${task.class_name}</span>
              </span>
              <span class="task-topic-badge" title="Tema o Unidad">${topicName}</span>
            </div>

            <div class="task-badges-right">
              <span class="priority-badge priority-${task.priority || 'media'}">
                ${task.priority === 'urgente' ? '🔴 Urgente' : task.priority === 'alta' ? '🟠 Alta' : task.priority === 'media' ? '🔵 Media' : '🟢 Baja'}
              </span>
              <span class="due-badge ${dueInfo.class}">
                ${dueInfo.text}
              </span>
            </div>
          </div>

          <!-- Cuerpo: Checkbox y Título -->
          <div class="task-card-body">
            <div class="glass-checkbox-wrap">
              <div class="glass-checkbox ${isCompleted ? 'checked' : ''}" data-task-id="${task.id}" title="${isCompleted ? 'Marcar como pendiente' : 'Marcar como completada por mí'}">
                <i data-lucide="check"></i>
              </div>
            </div>

            <div class="task-card-text">
              <h3 class="task-card-title">${task.title}</h3>
              ${task.description ? `<p class="task-card-desc">${task.description}</p>` : ''}

              <!-- Miniaturas de Fotos -->
              ${photos.length > 0 ? `
                <div class="task-photos-chips">
                  ${photos.slice(0, 3).map(p => `
                    <img src="${p}" alt="Referencia" class="photo-chip-thumb" loading="lazy">
                  `).join('')}
                  <span class="photo-count-badge">
                    <i data-lucide="image" style="width: 12px; height: 12px; display: inline-block; vertical-align: middle;"></i>
                    ${photos.length} ${photos.length === 1 ? 'foto' : 'fotos'}
                  </span>
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Footer: Cumplimiento de Compañeros y Acciones -->
          <div class="task-card-footer">
            <div class="classmates-avatar-stack" title="${task.total_completed} de ${task.total_students} compañeros la han completado">
              ${avatarStack}
              <span class="avatar-stack-count">${task.total_completed}/${task.total_students} completaron (${task.completion_percent}%)</span>
            </div>

            <div class="task-card-actions">
              <button class="btn btn-glass btn-sm btn-card-detail" data-task-id="${task.id}" title="Ver detalles, fotos y compañeros">
                <i data-lucide="eye"></i>
                <span>Ver</span>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    UI.refreshIcons();

    // Eventos de Checkbox Rápido (Completar/Desmarcar)
    container.querySelectorAll('.glass-checkbox').forEach(chk => {
      chk.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!AuthState.isAuthenticated) {
          UI.showToast('Debes iniciar sesión para marcar tus tareas.', 'warning');
          AuthState.showGateScreen();
          return;
        }

        const taskId = chk.getAttribute('data-task-id');
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;

        const newStatus = task.completed_by_me === 1 ? 0 : 1;

        // Feedback optimista inmediato
        task.completed_by_me = newStatus;
        this.renderTasks();

        try {
          await ApiClient.toggleTaskStatus(taskId, newStatus);
          UI.showToast(newStatus === 1 ? '¡Tarea completada! 🎉' : 'Tarea marcada como pendiente.', 'success');
          if (this.onDataChanged) this.onDataChanged();
          await this.loadTasks();
        } catch (err) {
          UI.showToast(err.message, 'error');
          await this.loadTasks();
        }
      });
    });

    // Eventos para abrir el Modal de Detalle
    container.querySelectorAll('.task-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.glass-checkbox')) return;
        const taskId = card.getAttribute('data-task-id');
        const task = this.tasks.find(t => t.id === taskId);
        if (task) {
          TaskDetail.show(task);
        }
      });
    });
  },

  openTaskModal(task = null) {
    if (!AuthState.isAuthenticated) {
      UI.showToast('Debes iniciar sesión para crear o editar tareas.', 'warning');
      AuthState.showGateScreen();
      return;
    }

    const modalTitle = document.getElementById('task-form-modal-title');
    const idInput = document.getElementById('task-form-id');
    const classSelect = document.getElementById('task-form-class');
    const titleInput = document.getElementById('task-form-title');
    const dueInput = document.getElementById('task-form-due');
    const prioritySelect = document.getElementById('task-form-priority');
    const descInput = document.getElementById('task-form-desc');
    const customTopicInput = document.getElementById('task-form-custom-topic');
    if (customTopicInput) customTopicInput.style.display = 'none';

    this.populateClassSelect();

    if (task) {
      if (modalTitle) modalTitle.textContent = 'Editar Tarea';
      if (idInput) idInput.value = task.id;
      if (classSelect) classSelect.value = task.class_id;
      if (titleInput) titleInput.value = task.title;
      if (dueInput) dueInput.value = UI.formatForInput(task.due_date);
      if (prioritySelect) prioritySelect.value = task.priority || 'media';
      if (descInput) descInput.value = task.description || '';
      this.populateTopicSelect(task.class_id, task.topic || 'Tema 1');
      this.formPhotos = Array.isArray(task.photos) ? [...task.photos] : [];
    } else {
      if (modalTitle) modalTitle.textContent = 'Nueva Tarea';
      if (idInput) idInput.value = '';
      if (titleInput) titleInput.value = '';
      // Fecha límite por defecto: mañana a las 23:59
      const defDue = new Date(Date.now() + 24 * 60 * 60 * 1000);
      defDue.setHours(23, 59, 0, 0);
      if (dueInput) dueInput.value = UI.formatForInput(defDue);
      if (prioritySelect) prioritySelect.value = 'media';
      if (descInput) descInput.value = '';
      const firstClassId = this.classes[0]?.id || '';
      this.populateTopicSelect(firstClassId, 'Tema 1');
      this.formPhotos = [];
    }

    this.renderFormPhotosPreview();
    UI.openModal('modal-task-form');
  },

  renderFormPhotosPreview() {
    const container = document.getElementById('task-form-photos-preview');
    if (!container) return;

    if (this.formPhotos.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = this.formPhotos.map((url, idx) => `
      <div class="photo-preview-item">
        <img src="${url}" alt="Foto ${idx + 1}">
        <button type="button" class="btn-remove-photo" data-idx="${idx}" title="Quitar foto">✕</button>
      </div>
    `).join('');

    container.querySelectorAll('.btn-remove-photo').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        this.formPhotos.splice(idx, 1);
        this.renderFormPhotosPreview();
      });
    });
  },

  bindEvents() {
    // Botón "+ Nueva Tarea"
    document.getElementById('btn-new-task')?.addEventListener('click', () => this.openTaskModal());

    // Evento de Editar Tarea disparado por TaskDetail
    window.addEventListener('edit-task-request', (e) => {
      if (e.detail) this.openTaskModal(e.detail);
    });

    // Cambio dinámico de materia en modal de tarea -> actualiza dropdown de temas
    document.getElementById('task-form-class')?.addEventListener('change', (e) => {
      this.populateTopicSelect(e.target.value);
    });

    // Toggle de tema personalizado en modal de tarea
    document.getElementById('btn-toggle-custom-topic')?.addEventListener('click', () => {
      const customTopicInput = document.getElementById('task-form-custom-topic');
      if (customTopicInput) {
        const isHidden = customTopicInput.style.display === 'none';
        customTopicInput.style.display = isHidden ? 'block' : 'none';
        if (isHidden) customTopicInput.focus();
      }
    });

    // Subida de fotos mediante selector de archivos
    const fileInput = document.getElementById('task-photo-input');
    fileInput?.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        const reader = new FileReader();
        reader.onload = (ev) => {
          this.formPhotos.push(ev.target.result);
          this.renderFormPhotosPreview();
        };
        reader.readAsDataURL(file);
      }
      fileInput.value = '';
    });

    // Subida de fotos mediante URL directa
    document.getElementById('btn-add-photo-url')?.addEventListener('click', () => {
      const urlInput = document.getElementById('task-photo-url-input');
      const url = urlInput?.value.trim();
      if (url) {
        this.formPhotos.push(url);
        urlInput.value = '';
        this.renderFormPhotosPreview();
      }
    });

    // Filtro de Tema
    document.getElementById('topic-filter')?.addEventListener('change', (e) => {
      this.filters.topic = e.target.value;
      this.loadTasks();
    });

    // Filtros de Estado (Todas, Pendientes, Completadas)
    document.querySelectorAll('#status-filter .seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#status-filter .seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.filters.status = btn.getAttribute('data-status') || 'todas';
        this.loadTasks();
      });
    });

    // Filtro de Prioridad
    document.getElementById('priority-filter')?.addEventListener('change', (e) => {
      this.filters.priority = e.target.value;
      this.loadTasks();
    });

    // Alternar Vista Cuadrícula / Lista
    const btnGrid = document.getElementById('btn-view-grid');
    const btnList = document.getElementById('btn-view-list');

    btnGrid?.addEventListener('click', () => {
      btnGrid.classList.add('active');
      btnList?.classList.remove('active');
      this.filters.viewMode = 'grid';
      this.renderTasks();
    });

    btnList?.addEventListener('click', () => {
      btnList.classList.add('active');
      btnGrid?.classList.remove('active');
      this.filters.viewMode = 'list';
      this.renderTasks();
    });

    // Buscador Global
    const searchInput = document.getElementById('global-search-input');
    let searchTimeout = null;
    searchInput?.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        this.filters.search = e.target.value;
        this.loadTasks();
      }, 250);
    });

    // Atajo de teclado ⌘K / Ctrl+K
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInput?.focus();
      }
    });

    // Formulario Guardar Tarea (Crear / Editar)
    const formTask = document.getElementById('form-task');
    formTask?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('task-form-id')?.value;
      const classId = document.getElementById('task-form-class')?.value;
      const title = document.getElementById('task-form-title')?.value.trim();
      const due = document.getElementById('task-form-due')?.value;
      const priority = document.getElementById('task-form-priority')?.value;
      const desc = document.getElementById('task-form-desc')?.value.trim();
      
      const topicSelect = document.getElementById('task-form-topic');
      const customTopicInput = document.getElementById('task-form-custom-topic');
      const topic = (customTopicInput && customTopicInput.style.display !== 'none' && customTopicInput.value.trim())
        ? customTopicInput.value.trim()
        : (topicSelect?.value || 'Tema 1');

      if (!classId || !title || !due) {
        UI.showToast('Por favor completa todos los campos requeridos.', 'warning');
        return;
      }

      const payload = {
        class_id: classId,
        title,
        topic,
        due_date: new Date(due).toISOString(),
        priority,
        description: desc,
        photos: this.formPhotos,
      };

      try {
        if (id) {
          payload.id = id;
          await ApiClient.updateTask(payload);
          UI.showToast('¡Tarea actualizada con éxito!', 'success');
        } else {
          await ApiClient.createTask(payload);
          UI.showToast(`¡Nueva tarea guardada en "${topic}"!`, 'success');
        }

        UI.closeModal('modal-task-form');
        await this.loadTasks();
        if (this.onDataChanged) this.onDataChanged();
      } catch (err) {
        UI.showToast(err.message, 'error');
      }
    });
  }
};
