// interfaz.js - UI, Temas, Modales

var productChromeInitialized = false;
var suggestedUsersCache = [];
var DEFAULT_USER_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Crect width='120' height='120' rx='60' fill='%23182234'/%3E%3Ccircle cx='60' cy='44' r='21' fill='%23f8fafc' fill-opacity='.92'/%3E%3Cpath d='M23 99c7-19 22-30 37-30s30 11 37 30' fill='%23f8fafc' fill-opacity='.92'/%3E%3C/svg%3E";
var USER_VISUAL_CACHE_KEY = "bitbond:user-visual-cache";
var liveUserDirectory = {};
var liveUserDirectoryUnsubscribe = null;

function preloadImage(src) {
    if (!src || src === DEFAULT_USER_AVATAR) return;
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
}

function readCachedUserVisual() {
    try {
        const raw = window.localStorage.getItem(USER_VISUAL_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
        return null;
    }
}

function writeCachedUserVisual(payload) {
    if (!payload || !payload.uid) return;
    try {
        window.localStorage.setItem(USER_VISUAL_CACHE_KEY, JSON.stringify({
            uid: payload.uid,
            nombre: payload.nombre || "",
            puesto: payload.puesto || "",
            avatar: payload.avatar || "",
            updatedAt: Date.now()
        }));
    } catch (error) {
        // Ignorar fallos de almacenamiento local
    }
}

function clearCachedUserVisual() {
    try {
        window.localStorage.removeItem(USER_VISUAL_CACHE_KEY);
    } catch (error) {
        // Ignorar fallos de almacenamiento local
    }
}

function cleanupLiveUserDirectoryListener() {
    if (liveUserDirectoryUnsubscribe) {
        liveUserDirectoryUnsubscribe();
        liveUserDirectoryUnsubscribe = null;
    }
    liveUserDirectory = {};
}

function subscribeLiveUserDirectoryListener() {
    if (!db || !auth || !currentUser || liveUserDirectoryUnsubscribe) return;

    liveUserDirectoryUnsubscribe = db.collection("usuarios").onSnapshot(snapshot => {
        const nextDirectory = {};
        snapshot.docs.forEach(doc => {
            nextDirectory[doc.id] = {
                uid: doc.id,
                ...doc.data()
            };
        });
        liveUserDirectory = nextDirectory;

        if (window.renderPosts) window.renderPosts();
        if (window.renderStories) window.renderStories();
        if (window.renderChatConversationList) window.renderChatConversationList();
        if (window.renderChatMiniDock) window.renderChatMiniDock();
        if (window.rerenderSolicitudes) window.rerenderSolicitudes();
    }, error => {
        console.error("Error al escuchar directorio de usuarios:", error);
    });
}

function getResolvedUserProfile(userData, uid, authPhotoURL) {
    const liveProfile = uid && liveUserDirectory[uid] ? liveUserDirectory[uid] : {};
    const baseProfile = userData && typeof userData === 'object' ? userData : {};
    const mergedProfile = {
        ...baseProfile,
        ...liveProfile
    };

    const avatarValue = typeof mergedProfile.avatar === 'string' ? mergedProfile.avatar.trim() : '';
    const authAvatar = typeof authPhotoURL === 'string' ? authPhotoURL.trim() : '';

    return {
        uid: uid || mergedProfile.uid || "",
        ...mergedProfile,
        avatar: isCustomUserAvatar(avatarValue)
            ? avatarValue
            : (isCustomUserAvatar(authAvatar) ? authAvatar : "")
    };
}

function applyUserVisualState(visualState) {
    if (!visualState) return;

    const displayName = visualState.nombre || "Usuario";
    const displayRole = visualState.puesto || "Miembro de BitBond";
    const displayAvatar = visualState.avatar || DEFAULT_USER_AVATAR;

    document.querySelectorAll('.profile-preview h3').forEach(el => {
        el.innerText = displayName;
    });
    document.querySelectorAll('.profile-preview p').forEach(el => {
        el.innerText = displayRole;
    });
    document.querySelectorAll('.profile-preview img').forEach(el => {
        el.src = displayAvatar;
    });

    const navAvatar = document.querySelector('.profile-dropdown .avatar');
    if (navAvatar) {
        navAvatar.src = displayAvatar;
    }

    preloadImage(displayAvatar);
}

function applyCachedUserVisual(user) {
    const cachedVisual = readCachedUserVisual();
    if (!cachedVisual) return;
    if (user && cachedVisual.uid !== user.uid) return;

    applyUserVisualState(cachedVisual);
}

function updateProfileUI() {
    if (!currentUser) return;

    const visualState = {
        uid: currentUser.uid,
        nombre: (window.userData && window.userData.nombre) || currentUser.displayName || "Usuario",
        puesto: (window.userData && window.userData.puesto) || "Miembro de BitBond",
        avatar: resolveUserAvatar(window.userData || {}, currentUser.uid || currentUser.email, currentUser.photoURL)
    };

    applyUserVisualState(visualState);
    writeCachedUserVisual(visualState);

    renderQuickStats();
    renderActivityFeed();
}

function openModal() { document.getElementById('postModal').style.display = 'flex'; }
function closeModal() {
    document.getElementById('postModal').style.display = 'none';
    const content = document.getElementById('postContent');
    if (content) content.value = '';
    window.selectedImageData = null;
    const preview = document.getElementById('imagePreviewContainer');
    if (preview) preview.style.display = 'none';
}

function resolveAppSection() {
    const profileView = document.getElementById('profileView');
    if (profileView && profileView.style.display === 'flex') return 'profile';
    return 'home';
}

function goToHome() {
    const settingsModal = document.getElementById('settingsModal');
    const requestsModal = document.getElementById('requestsModal');
    const chatModal = document.getElementById('chatModal');
    const mobileSearchModal = document.getElementById('mobileSearchModal');
    const profileDropdown = document.getElementById('profileDropdown');

    if (settingsModal) settingsModal.style.display = 'none';
    if (requestsModal) requestsModal.style.display = 'none';
    if (chatModal) chatModal.style.display = 'none';
    if (mobileSearchModal) mobileSearchModal.style.display = 'none';
    if (profileDropdown) profileDropdown.classList.remove('show');

    if (window.cleanupChatMessagesListener) window.cleanupChatMessagesListener();
    if (window.cerrarPerfilUsuario) {
        window.cerrarPerfilUsuario();
    } else {
        const profileView = document.getElementById('profileView');
        const mainFeed = document.getElementById('mainFeed');
        if (profileView) profileView.style.display = 'none';
        if (mainFeed) mainFeed.style.display = 'flex';
        setActiveNav('home');
    }
}

function setActiveNav(section) {
    const normalizedSection = section || 'home';
    document.body.dataset.currentSection = normalizedSection;
    document.querySelectorAll('[data-nav-target]').forEach(el => {
        const shouldActivate = el.dataset.navTarget === normalizedSection;
        el.classList.toggle('active', shouldActivate);
    });
}

function focusDesktopSearch() {
    const searchContainer = document.getElementById('searchContainer');
    const searchInput = document.getElementById('globalSearch');

    if (searchContainer) searchContainer.classList.add('active');
    if (searchInput) {
        searchInput.focus();
        searchInput.scrollIntoView({ block: 'nearest', inline: 'center' });
    }

    setActiveNav('search');
}

function openSettings() {
    closeProfileDropdown();
    document.getElementById('settingsModal').style.display = 'flex';
    setActiveNav('settings');
}

function closeSettings() {
    document.getElementById('settingsModal').style.display = 'none';
    setActiveNav(resolveAppSection());
}

function toggleTheme() {
    const isDark = document.getElementById('themeToggle').checked;
    document.body.classList.toggle('light-mode', !isDark);
}

function toggleProfileDropdown(event) {
    if (event) event.stopPropagation();
    const d = document.getElementById('profileDropdown');
    const trigger = document.querySelector('.profile-dropdown-trigger');
    if (d) {
        const isOpen = d.classList.toggle('show');
        if (trigger) trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }
}

function closeProfileDropdown() {
    const d = document.getElementById('profileDropdown');
    const trigger = document.querySelector('.profile-dropdown-trigger');
    if (d) d.classList.remove('show');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
}

window.onclick = function (event) {
    if (event.target.classList.contains('modal-overlay')) {
        if (event.target.id === 'settingsModal') {
            closeSettings();
        } else if (event.target.id === 'requestsModal' && window.closeRequestsModal) {
            window.closeRequestsModal();
        } else {
            event.target.style.display = 'none';
        }
    }
    const d = document.getElementById('profileDropdown');
    if (d && !event.target.closest('.profile-dropdown')) {
        closeProfileDropdown();
    }
    if (window.handleGlobalOverlayClick) {
        window.handleGlobalOverlayClick(event);
    }
};

window.selectedImageData = null;
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = e => {
            window.selectedImageData = e.target.result;
            const previewContainer = document.getElementById('imagePreviewContainer');
            const previewImg = document.getElementById('imagePreview');
            if (previewContainer) previewContainer.style.display = 'block';
            if (previewImg) previewImg.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

function formatCompactStat(value) {
    const numericValue = Number(value) || 0;
    if (numericValue >= 1000) {
        return `${(numericValue / 1000).toFixed(1).replace('.0', '')}k`;
    }
    return `${numericValue}`;
}

function isGeneratedAvatar(value) {
    return typeof value === 'string' && value.includes('api.dicebear.com');
}

function isCustomUserAvatar(value) {
    return typeof value === 'string'
        && value.trim() !== ''
        && value.trim() !== DEFAULT_USER_AVATAR
        && !isGeneratedAvatar(value);
}

function resolveUserAvatar(userData, fallbackSeed, authPhotoURL) {
    const resolvedProfile = getResolvedUserProfile(userData, fallbackSeed, authPhotoURL);
    const avatarValue = typeof resolvedProfile.avatar === 'string' ? resolvedProfile.avatar.trim() : '';
    const authAvatar = typeof authPhotoURL === 'string' ? authPhotoURL.trim() : '';

    if (isCustomUserAvatar(avatarValue)) return avatarValue;
    if (isCustomUserAvatar(authAvatar)) return authAvatar;

    return DEFAULT_USER_AVATAR;
}

function initializeProductChrome() {
    if (productChromeInitialized) return;

    const sidebarLinks = document.querySelectorAll('.sidebar-left ul a');
    sidebarLinks.forEach(link => {
        link.classList.add('side-nav-link');
        if (link.textContent.includes('Inicio')) link.dataset.navTarget = 'home';
        if (link.textContent.includes('Solicitudes')) link.dataset.navTarget = 'requests';
        if (link.textContent.includes('Mensajes')) link.dataset.navTarget = 'messages';
        if (link.textContent.includes('Ajustes')) link.dataset.navTarget = 'settings';
    });

    const mobileLinks = document.querySelectorAll('.nav-bottom .nav-bottom-item');
    mobileLinks.forEach(link => {
        const onclickValue = link.getAttribute('onclick') || '';
        if (onclickValue.includes('cerrarPerfilUsuario')) link.dataset.navTarget = 'home';
        if (onclickValue.includes('abrirBuscadorMovil')) link.dataset.navTarget = 'search';
        if (onclickValue.includes('openChatModal')) link.dataset.navTarget = 'messages';
        if (onclickValue.includes('openRequestsModal')) link.dataset.navTarget = 'requests';
        if (onclickValue.includes('openSettings')) link.dataset.navTarget = 'settings';
    });

    const storiesContainer = document.getElementById('storiesContainer');
    if (storiesContainer && !storiesContainer.parentElement.classList.contains('stories-shell')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'stories-shell card';
        wrapper.innerHTML = `
            <div class="section-header">
                <div>
                    <h3>Historias</h3>
                </div>
            </div>
        `;
        storiesContainer.parentNode.insertBefore(wrapper, storiesContainer);
        wrapper.appendChild(storiesContainer);
    }

    const feed = document.getElementById('mainFeed');
    if (feed) {
        const candidateCards = feed.querySelectorAll(':scope > .card');
        const composerCard = candidateCards[0];
        if (composerCard && !composerCard.classList.contains('composer-card')) {
            composerCard.classList.add('composer-card');
            const prompt = composerCard.querySelector('div[style*="background: var(--glass)"]');
            if (prompt) prompt.classList.add('composer-prompt');
        }
    }

    const rightSidebar = document.querySelector('.sidebar-right');
    if (rightSidebar) {
        rightSidebar.innerHTML = `
            <div class="card right-rail-panel">
                <div class="section-header compact">
                    <div>
                        <p class="section-kicker">Radar</p>
                        <h3>Tendencias</h3>
                    </div>
                </div>
                <div class="trending-item">
                    <p style="font-size: 0.8rem; color: var(--text-muted);">#JavaScript</p>
                    <p style="font-weight: 500;">BitBond v1.0 lanzada!</p>
                </div>
                <div class="trending-item">
                    <p style="font-size: 0.8rem; color: var(--text-muted);">#Backend</p>
                    <p style="font-weight: 500;">Los perfiles tech mejor valorados hoy</p>
                </div>
            </div>
            <div class="card right-rail-panel stats-panel">
                <div class="section-header compact">
                    <div>
                        <p class="section-kicker">Resumen</p>
                        <h3>Tu actividad</h3>
                    </div>
                </div>
                <div class="stats-grid">
                    <div class="stat-chip">
                        <span id="quickStatPosts">0</span>
                        <small>Posts</small>
                    </div>
                    <div class="stat-chip">
                        <span id="quickStatFriends">0</span>
                        <small>Amigos</small>
                    </div>
                    <div class="stat-chip">
                        <span id="quickStatChats">0</span>
                        <small>Chats</small>
                    </div>
                </div>
                <div class="activity-stack">
                    <div class="section-header compact">
                        <div>
                            <p class="section-kicker">Ahora</p>
                            <h3>En movimiento</h3>
                        </div>
                    </div>
                    <div id="activityFeedList" class="rail-list">
                        <p class="rail-empty">Cargando actividad...</p>
                    </div>
                </div>
            </div>
            <div class="card right-rail-panel">
                <div class="section-header compact">
                    <div>
                        <p class="section-kicker">Descubre</p>
                        <h3>Personas para seguir</h3>
                    </div>
                </div>
                <div id="suggestedUsersList" class="rail-list">
                    <p class="rail-empty">Cargando sugerencias...</p>
                </div>
            </div>
        `;
    }

    productChromeInitialized = true;
}

function renderQuickStats() {
    const postsEl = document.getElementById('quickStatPosts');
    const friendsEl = document.getElementById('quickStatFriends');
    const chatsEl = document.getElementById('quickStatChats');

    if (!postsEl || !friendsEl || !chatsEl) return;

    const ownPosts = (window.posts || []).filter(post => currentUser && post.uid === currentUser.uid).length;
    const friends = (window.amigos || []).length;
    const chats = Array.isArray(window.chatConversations) ? window.chatConversations.length : 0;

    postsEl.innerText = formatCompactStat(ownPosts);
    friendsEl.innerText = formatCompactStat(friends);
    chatsEl.innerText = formatCompactStat(chats);
}

function renderSuggestedUsers() {
    const container = document.getElementById('suggestedUsersList');
    if (!container) return;

    const suggestions = suggestedUsersCache.slice(0, 3);

    if (suggestions.length === 0) {
        container.innerHTML = '<p class="rail-empty">Ya conoces a casi todo tu circulo. Nada mal.</p>';
        return;
    }

        container.innerHTML = suggestions.map(user => `
        <div class="rail-user-item">
            <img src="${resolveUserAvatar(user, user.uid || user.email)}"
                class="avatar" style="width:42px; height:42px;" alt="${user.nombre}">
            <div class="rail-user-meta">
                <strong>${user.nombre || 'Usuario'}</strong>
                <span>${user.puesto || 'Miembro de BitBond'}</span>
            </div>
            <button class="btn rail-mini-btn" onclick="verPerfilUsuario('${user.uid}')">Perfil</button>
        </div>
    `).join('');
}

async function loadSuggestedUsers() {
    const container = document.getElementById('suggestedUsersList');
    if (!container || !db || !currentUser) return;

    try {
        const snapshot = await db.collection("usuarios").limit(10).get();
        const currentRole = (window.userData && window.userData.puesto) || "";

        suggestedUsersCache = snapshot.docs
            .map(doc => ({ uid: doc.id, ...doc.data() }))
            .filter(user => user.uid !== currentUser.uid && !(window.amigos || []).includes(user.uid))
            .sort((a, b) => {
                const scoreA = a.puesto === currentRole ? 1 : 0;
                const scoreB = b.puesto === currentRole ? 1 : 0;
                return scoreB - scoreA;
            });

        renderSuggestedUsers();
    } catch (error) {
        console.error("Error al cargar sugerencias:", error);
        container.innerHTML = '<p class="rail-empty">No se pudieron cargar sugerencias ahora mismo.</p>';
    }
}

function renderActivityFeed() {
    const container = document.getElementById('activityFeedList');
    if (!container) return;

    const activities = [];
    const pendingRequests = Number(document.getElementById('friendBadge')?.innerText || 0);
    if (pendingRequests > 0) {
        activities.push({
            title: `Tienes ${pendingRequests} solicitud${pendingRequests === 1 ? '' : 'es'} pendiente${pendingRequests === 1 ? '' : 's'}`,
            meta: 'Responderlas mantiene tu red activa'
        });
    }

    const recentChats = window.getOrderedChatConversations
        ? window.getOrderedChatConversations().slice(0, 2)
        : [];

    recentChats.forEach(conversation => {
        if (!window.getChatFriendProfile || !window.getChatPeerUid) return;
        const peerUid = window.getChatPeerUid(conversation);
        const profile = window.getChatFriendProfile(peerUid);
        const preview = conversation.lastMessageText || 'Conversacion lista para continuar';
        activities.push({
            title: `${profile.nombre || 'Tu contacto'} sigue la conversacion`,
            meta: preview.length > 56 ? `${preview.slice(0, 56)}...` : preview
        });
    });

    const recentPosts = (window.posts || [])
        .filter(post => post.uid !== (currentUser && currentUser.uid))
        .slice(0, 3);

    recentPosts.forEach(post => {
        activities.push({
            title: `${post.author || 'Alguien'} ha compartido una novedad`,
            meta: post.content ? `${post.content.slice(0, 60)}${post.content.length > 60 ? '...' : ''}` : (post.puesto || 'Tu red sigue activa')
        });
    });

    const chats = Array.isArray(window.chatConversations) ? window.chatConversations.length : 0;
    if (chats > 0) {
        activities.push({
            title: `${chats} conversaci${chats === 1 ? 'on abierta' : 'ones activas'}`,
            meta: 'Tus mensajes mantienen el pulso de la app'
        });
    }

    if (activities.length === 0) {
        container.innerHTML = '<p class="rail-empty">Tu red empezara a moverse muy pronto.</p>';
        return;
    }

    container.innerHTML = activities.slice(0, 4).map(item => `
        <div class="activity-item">
            <strong>${item.title}</strong>
            <span>${item.meta}</span>
        </div>
    `).join('');
}

async function refreshProductSidebar() {
    initializeProductChrome();
    renderQuickStats();
    renderActivityFeed();
    await loadSuggestedUsers();
}

document.addEventListener('DOMContentLoaded', () => {
    initializeProductChrome();
    applyCachedUserVisual();
    setActiveNav('home');
});

if (auth) {
    auth.onAuthStateChanged(user => {
        if (user) {
            subscribeLiveUserDirectoryListener();
        } else {
            cleanupLiveUserDirectoryListener();
        }
    });
}

initializeProductChrome();

// Exportar globalmente
window.updateProfileUI = updateProfileUI;
window.openModal = openModal;
window.closeModal = closeModal;
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.closeProfileDropdown = closeProfileDropdown;
window.toggleTheme = toggleTheme;
window.toggleProfileDropdown = toggleProfileDropdown;
window.handleFileSelect = handleFileSelect;
window.goToHome = goToHome;
window.resolveAppSection = resolveAppSection;
window.focusDesktopSearch = focusDesktopSearch;
window.DEFAULT_USER_AVATAR = DEFAULT_USER_AVATAR;
window.isCustomUserAvatar = isCustomUserAvatar;
window.getResolvedUserProfile = getResolvedUserProfile;
window.resolveUserAvatar = resolveUserAvatar;
window.applyCachedUserVisual = applyCachedUserVisual;
window.applyUserVisualState = applyUserVisualState;
window.writeCachedUserVisual = writeCachedUserVisual;
window.clearCachedUserVisual = clearCachedUserVisual;
window.setActiveNav = setActiveNav;
window.renderQuickStats = renderQuickStats;
window.renderActivityFeed = renderActivityFeed;
window.refreshProductSidebar = refreshProductSidebar;
