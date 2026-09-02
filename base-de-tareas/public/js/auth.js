// ==========================================================================
// BASE DE TAREAS - GESTOR DE AUTENTICACIÓN Y PERFIL DE USUARIO
// ==========================================================================

import { ApiClient } from './api.js';
import { UI } from './ui.js';

export const AuthState = {
  currentUser: null,
  isAuthenticated: false,
  onUserChanged: null,
  gateAvatarBase64: null,
  editAvatarBase64: null,

  async init(onUserChangedCallback) {
    this.onUserChanged = onUserChangedCallback;
    this.bindEvents();

    const token = ApiClient.getToken();
    if (token) {
      try {
        const data = await ApiClient.getMe();
        this.setUser(data.user);
        this.showAppScreen();
        return;
      } catch (err) {
        console.warn("Token inválido o expirado.");
        ApiClient.setToken(null);
      }
    }

    // Si no está autenticado, mostrar pantalla de bloqueo Gate y ocultar dashboard
    this.showGateScreen();
  },

  showAppScreen() {
    const gateScreen = document.getElementById('auth-gate-screen');
    const appLayout = document.getElementById('app');
    if (gateScreen) gateScreen.style.display = 'none';
    if (appLayout) appLayout.style.display = 'flex';
  },

  showGateScreen() {
    const gateScreen = document.getElementById('auth-gate-screen');
    const appLayout = document.getElementById('app');
    if (gateScreen) gateScreen.style.display = 'flex';
    if (appLayout) appLayout.style.display = 'none';
  },

  setUser(user) {
    this.currentUser = user;
    this.isAuthenticated = !!user;
    if (user) {
      this.showAppScreen();
      this.renderNavUser();
    } else {
      this.showGateScreen();
      this.renderLoggedOutNav();
    }
    if (this.onUserChanged) {
      this.onUserChanged(user);
    }
  },

  renderNavUser() {
    const container = document.getElementById('user-menu-container');
    if (!container) return;

    if (!this.currentUser) {
      this.renderLoggedOutNav();
      return;
    }

    const defaultAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(this.currentUser.name)}`;
    const avatar = this.currentUser.avatar_url || defaultAvatar;

    container.innerHTML = `
      <div class="user-chip" id="btn-toggle-user-menu" title="Opciones de cuenta">
        <img src="${avatar}" alt="${this.currentUser.name}" class="user-avatar-img" onerror="this.src='${defaultAvatar}'">
        <div class="user-chip-info">
          <span class="user-chip-name">${this.currentUser.name}</span>
          <span class="user-chip-role">Estudiante</span>
        </div>
        <i data-lucide="chevron-down" style="width: 14px; height: 14px; color: var(--text-muted);"></i>
      </div>

      <div class="user-dropdown-menu" id="user-dropdown">
        <button class="dropdown-item" id="btn-open-edit-profile">
          <i data-lucide="user"></i>
          <span>Editar mi Perfil</span>
        </button>
        <button class="dropdown-item" id="btn-open-switch-account">
          <i data-lucide="repeat"></i>
          <span>Cambiar de Cuenta</span>
        </button>
        <div class="dropdown-divider"></div>
        <button class="dropdown-item text-danger" id="btn-logout">
          <i data-lucide="log-out"></i>
          <span>Cerrar Sesión</span>
        </button>
      </div>
    `;

    UI.refreshIcons();

    // Toggle dropdown
    const btnToggle = document.getElementById('btn-toggle-user-menu');
    const dropdown = document.getElementById('user-dropdown');

    btnToggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown?.classList.toggle('active');
    });

    // Cerrar dropdown al hacer click fuera
    document.addEventListener('click', () => {
      dropdown?.classList.remove('active');
    });

    // Eventos del dropdown
    document.getElementById('btn-open-edit-profile')?.addEventListener('click', () => {
      this.openEditProfileModal();
    });

    document.getElementById('btn-open-switch-account')?.addEventListener('click', () => {
      UI.openModal('modal-auth');
    });

    document.getElementById('btn-logout')?.addEventListener('click', () => {
      this.logout();
    });
  },

  renderLoggedOutNav() {
    const container = document.getElementById('user-menu-container');
    if (!container) return;

    container.innerHTML = `
      <button class="btn btn-primary btn-glow" id="btn-open-login">
        <i data-lucide="log-in"></i>
        <span>Iniciar Sesión</span>
      </button>
    `;

    UI.refreshIcons();

    document.getElementById('btn-open-login')?.addEventListener('click', () => {
      UI.openModal('modal-auth');
    });
  },

  async login(email, password) {
    try {
      const data = await ApiClient.login(email, password);
      ApiClient.setToken(data.token);
      this.setUser(data.user);
      UI.closeModal('modal-auth');
      UI.showToast(`¡Bienvenido, ${data.user.name}!`, 'success');
    } catch (err) {
      UI.showToast(err.message, 'error');
    }
  },

  async register(name, email, password, avatar_url) {
    try {
      const data = await ApiClient.register(name, email, password, avatar_url);
      ApiClient.setToken(data.token);
      this.setUser(data.user);
      UI.closeModal('modal-auth');
      UI.showToast(`¡Cuenta creada con éxito! Bienvenido, ${data.user.name}.`, 'success');
    } catch (err) {
      UI.showToast(err.message, 'error');
    }
  },

  logout() {
    ApiClient.setToken(null);
    this.currentUser = null;
    this.isAuthenticated = false;
    this.renderLoggedOutNav();
    if (this.onUserChanged) {
      this.onUserChanged(null);
    }
    UI.showToast('Sesión cerrada correctamente.', 'info');
    UI.openModal('modal-auth');
  },

  openEditProfileModal() {
    if (!this.currentUser) return;
    const nameInput = document.getElementById('edit-profile-name');
    const avatarUrlInput = document.getElementById('edit-profile-avatar-url');
    const avatarPreview = document.getElementById('edit-profile-avatar-preview');
    const avatarFileInput = document.getElementById('edit-profile-avatar-file');

    this.editAvatarBase64 = null;
    const defaultAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(this.currentUser.name)}`;
    const currentAvatar = this.currentUser.avatar_url || defaultAvatar;

    if (nameInput) nameInput.value = this.currentUser.name;
    if (avatarUrlInput) avatarUrlInput.value = this.currentUser.avatar_url?.startsWith('data:') ? '' : (this.currentUser.avatar_url || '');
    if (avatarPreview) avatarPreview.src = currentAvatar;

    avatarUrlInput?.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      if (avatarPreview) {
        avatarPreview.src = val || defaultAvatar;
      }
      this.editAvatarBase64 = null;
    });

    avatarFileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          this.editAvatarBase64 = ev.target.result;
          if (avatarPreview) avatarPreview.src = ev.target.result;
          if (avatarUrlInput) avatarUrlInput.value = '';
        };
        reader.readAsDataURL(file);
      }
    });

    UI.openModal('modal-edit-profile');
  },

  bindEvents() {
    // --- PANTALLA GATE DE AUTENTICACIÓN ---
    const gateTabLogin = document.getElementById('gate-tab-login');
    const gateTabRegister = document.getElementById('gate-tab-register');
    const gateFormLogin = document.getElementById('gate-form-login');
    const gateFormRegister = document.getElementById('gate-form-register');
    const gateAvatarFile = document.getElementById('gate-reg-avatar-file');
    const gateAvatarPreview = document.getElementById('gate-reg-avatar-preview');

    gateTabLogin?.addEventListener('click', () => {
      gateTabLogin.classList.add('active');
      gateTabRegister?.classList.remove('active');
      gateFormLogin?.classList.add('active');
      gateFormRegister?.classList.remove('active');
    });

    gateTabRegister?.addEventListener('click', () => {
      gateTabRegister.classList.add('active');
      gateTabLogin?.classList.remove('active');
      gateFormRegister?.classList.add('active');
      gateFormLogin?.classList.remove('active');
    });

    // Subida de foto en registro Gate
    gateAvatarFile?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          this.gateAvatarBase64 = ev.target.result;
          if (gateAvatarPreview) gateAvatarPreview.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      }
    });

    gateFormLogin?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('gate-login-email')?.value.trim();
      const password = document.getElementById('gate-login-password')?.value;
      if (email && password) {
        await this.login(email, password);
      }
    });

    gateFormRegister?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('gate-reg-name')?.value.trim();
      const email = document.getElementById('gate-reg-email')?.value.trim();
      const password = document.getElementById('gate-reg-password')?.value;
      const avatar = this.gateAvatarBase64 || null;

      if (name && email && password) {
        await this.register(name, email, password, avatar);
      }
    });

    // Cuentas Demo de Acceso Rápido (Funciona en Gate y en modales)
    document.querySelectorAll('.demo-user-chip').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const email = btn.getAttribute('data-email');
        const pwd = btn.getAttribute('data-pwd');
        if (email && pwd) {
          await this.login(email, pwd);
        }
      });
    });

    // Formulario de Edición de Perfil
    const formEditProfile = document.getElementById('form-edit-profile');
    formEditProfile?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('edit-profile-name')?.value.trim();
      const avatarUrl = document.getElementById('edit-profile-avatar-url')?.value.trim();
      const finalAvatar = this.editAvatarBase64 || avatarUrl || null;

      if (!name) return;

      try {
        const res = await ApiClient.updateProfile(name, finalAvatar);
        if (res.token) ApiClient.setToken(res.token);
        this.setUser(res.user);
        UI.closeModal('modal-edit-profile');
        UI.showToast('¡Perfil actualizado con éxito!', 'success');
      } catch (err) {
        UI.showToast(err.message, 'error');
      }
    });
  }
};
