// ==========================================================================
// BASE DE TAREAS - ORQUESTADOR PRINCIPAL DE LA APLICACIÓN
// ==========================================================================

import { ApiClient } from './api.js';
import { UI } from './ui.js';
import { AuthState } from './auth.js';
import { TasksManager } from './tasks.js';
import { TaskDetail } from './task-detail.js';
import { ClassesManager } from './classes.js';
import { ActivityManager } from './activity.js';
import { ClassmatesManager } from './classmates.js';

class App {
  static async init() {
    console.log("Iniciando Base de Tareas...");

    // 1. Configurar Modales globales y backdrop clicks
    this.setupModalDismissals();

    // 2. Navegación por pestañas (Tabs)
    this.setupTabsNavigation();

    // 3. Inicializar Módulos
    const refreshAll = async () => {
      await Promise.all([
        this.loadDashboardStats(),
        TasksManager.loadTasks(),
        ClassesManager.loadClasses(),
        ActivityManager.loadActivity(),
        ClassmatesManager.loadClassmates(),
      ]);
    };

    TaskDetail.init(() => refreshAll());

    await AuthState.init(async () => {
      await refreshAll();
    });

    await Promise.all([
      TasksManager.init(() => refreshAll()),
      ClassesManager.init(() => refreshAll()),
      ActivityManager.init(),
      ClassmatesManager.init(() => refreshAll()),
    ]);

    // 4. Cargar Estadísticas del Dashboard
    await this.loadDashboardStats();

    // 5. Escuchar evento de filtrado rápido desde materias
    window.addEventListener('filter-class-request', (e) => {
      const classId = e.detail;
      this.switchTab('tab-tasks');
      TasksManager.filters.class_id = classId;
      TasksManager.renderClassPills();
      TasksManager.loadTasks();
    });

    // 6. Botón Logo para ir al inicio
    document.getElementById('btn-home')?.addEventListener('click', () => {
      this.switchTab('tab-tasks');
      TasksManager.filters.class_id = 'todas';
      TasksManager.filters.status = 'todas';
      TasksManager.renderClassPills();
      TasksManager.loadTasks();
    });

    // 7. Actualizar año / hora en pie de página
    const timeDisplay = document.getElementById('system-time-display');
    if (timeDisplay) {
      const yr = new Date().getFullYear();
      timeDisplay.textContent = `© ${yr} Base de Tareas • Todos los derechos reservados`;
    }

    UI.refreshIcons();
    console.log("Base de Tareas lista y conectada.");
  }

  // Cargar Métricas y KPIs del Dashboard Superior
  static async loadDashboardStats() {
    try {
      const stats = await ApiClient.getStats();

      // Card 1: Mis tareas
      const myCompEl = document.getElementById('stat-my-completed');
      const totalCountEl = document.getElementById('stat-total-count');
      const percentRingEl = document.getElementById('stat-my-percent');
      if (myCompEl) myCompEl.textContent = stats.myCompletedTasks;
      if (totalCountEl) totalCountEl.textContent = `/ ${stats.totalTasks} tareas`;
      if (percentRingEl) percentRingEl.textContent = `${stats.myProgressPercent}%`;

      // Card 2: Mi progreso personal
      const phraseEl = document.getElementById('stat-status-phrase');
      const myBarEl = document.getElementById('stat-my-bar');
      if (phraseEl) {
        if (stats.myPendingTasks === 0 && stats.totalTasks > 0) {
          phraseEl.textContent = '¡Todo completado! 🎉';
        } else if (stats.myProgressPercent >= 70) {
          phraseEl.textContent = `Vas excelente (${stats.myPendingTasks} rest.)`;
        } else if (stats.myProgressPercent >= 40) {
          phraseEl.textContent = `En progreso (${stats.myPendingTasks} rest.)`;
        } else {
          phraseEl.textContent = `${stats.myPendingTasks} pendientes`;
        }
      }
      if (myBarEl) myBarEl.style.width = `${stats.myProgressPercent}%`;

      // Card 3: Tareas Urgentes en 48h
      const urgentEl = document.getElementById('stat-urgent-count');
      const urgentSubEl = document.getElementById('stat-urgent-subtext');
      if (urgentEl) urgentEl.textContent = stats.urgentTasksCount;
      if (urgentSubEl) {
        urgentSubEl.textContent = stats.urgentTasksCount === 1 ? '1 entrega prioritaria' : `${stats.urgentTasksCount} entregas prioritarias`;
      }

      // Card 4: Promedio del Grupo
      const groupPercentEl = document.getElementById('stat-group-percent');
      const groupBarEl = document.getElementById('stat-group-bar');
      if (groupPercentEl) groupPercentEl.textContent = `${stats.groupProgressPercent}%`;
      if (groupBarEl) groupBarEl.style.width = `${stats.groupProgressPercent}%`;
    } catch (err) {
      console.warn("Error al actualizar estadísticas del dashboard:", err);
    }
  }

  // Navegación por pestañas (Tabs)
  static setupTabsNavigation() {
    const tabButtons = document.querySelectorAll('.app-tabs-nav .tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTabId = btn.getAttribute('data-tab');
        if (targetTabId) {
          this.switchTab(targetTabId);
        }
      });
    });
  }

  static switchTab(tabId) {
    // Actualizar botones
    document.querySelectorAll('.app-tabs-nav .tab-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
    });

    // Actualizar paneles
    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === tabId);
    });

    UI.refreshIcons();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Cierre de modales
  static setupModalDismissals() {
    // Botones con clase .modal-close-btn
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-modal');
        if (modalId) {
          UI.closeModal(modalId);
        } else {
          UI.closeAllModals();
        }
      });
    });

    // Clic en el fondo oscuro del modal para cerrar
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('active');
          overlay.setAttribute('aria-hidden', 'true');
          document.body.style.overflow = '';
        }
      });
    });

    // Tecla Escape para cerrar modales
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        UI.closeAllModals();
      }
    });
  }
}

// Iniciar aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
