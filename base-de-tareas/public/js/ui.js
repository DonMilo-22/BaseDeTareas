// ==========================================================================
// BASE DE TAREAS - UTILIDADES DE UI, TOASTS, FECHAS Y MODALES
// ==========================================================================

export const UI = {
  // Inicializar Lucide Icons
  refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  },

  // Mostrar Notificación Toast
  showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconName = 'info';
    if (type === 'success') iconName = 'check-circle';
    if (type === 'error') iconName = 'alert-circle';
    if (type === 'warning') iconName = 'alert-triangle';

    toast.innerHTML = `
      <i data-lucide="${iconName}" class="toast-icon"></i>
      <div class="toast-text">${message}</div>
    `;

    container.appendChild(toast);
    this.refreshIcons();

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(50px)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  // Abrir Modal
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      this.refreshIcons();
    }
  },

  // Cerrar Modal
  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }
  },

  // Cerrar Todos los Modales
  closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
    });
    document.body.style.overflow = '';
  },

  // Visor Lightbox para imágenes
  openLightbox(src) {
    const img = document.getElementById('lightbox-img');
    if (img) {
      img.src = src;
      this.openModal('modal-lightbox');
    }
  },

  // Formato de Fecha y Hora en Español (ej: "Vie 5 Sep, 11:59 PM")
  formatDateTime(dateStr) {
    if (!dateStr) return 'Sin fecha';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    return date.toLocaleDateString('es-ES', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  },

  // Formato para input datetime-local (YYYY-MM-DDTHH:mm)
  formatForInput(dateStr) {
    const d = dateStr ? new Date(dateStr) : new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  // Formato de Vencimiento relativo para Badges (ej: "Vence hoy", "Faltan 2 días", "Atrasada")
  getDueBadgeInfo(dueDateStr, isCompleted = false) {
    if (!dueDateStr) return { text: 'Sin fecha', class: 'due-normal' };
    if (isCompleted) return { text: 'Entregada', class: 'due-normal' };

    const now = new Date();
    const due = new Date(dueDateStr);
    const diffMs = due.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = Math.ceil(diffHours / 24);

    if (diffMs < 0) {
      const daysAgo = Math.abs(diffDays);
      return {
        text: `⚠️ Atrasada por ${daysAgo === 0 ? 'horas' : `${daysAgo}d`}`,
        class: 'due-urgent',
      };
    }

    if (diffHours <= 24) {
      const hoursLeft = Math.max(1, Math.round(diffHours));
      return {
        text: `⏳ Vence hoy (${hoursLeft}h)`,
        class: 'due-today',
      };
    }

    if (diffDays === 1) {
      return {
        text: '⏳ Vence mañana',
        class: 'due-today',
      };
    }

    if (diffDays <= 3) {
      return {
        text: `⏳ Faltan ${diffDays} días`,
        class: 'due-normal',
      };
    }

    return {
      text: `📅 ${due.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`,
      class: 'due-normal',
    };
  },

  // Formato de Tiempo Relativo (ej: "Hace 5 minutos", "Ayer a las 14:00")
  formatRelativeTime(dateStr) {
    if (!dateStr) return '';
    const now = new Date();
    const past = new Date(dateStr);
    const diffSeconds = Math.floor((now.getTime() - past.getTime()) / 1000);

    if (diffSeconds < 60) return 'Hace un momento';
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `Hace ${diffMinutes} min`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `Hace ${diffHours} h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return `Ayer a las ${past.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
    if (diffDays < 7) return `Hace ${diffDays} días`;

    return past.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
};
