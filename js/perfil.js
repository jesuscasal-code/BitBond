// perfil.js - Lógica de Perfil de Usuario y Búsqueda

window.userData = null;

// Escuchar datos del usuario actual
if (auth) {
    auth.onAuthStateChanged(user => {
        if (user) {
            db.collection("usuarios").doc(user.uid).onSnapshot(doc => {
                if (doc.exists) {
                    window.userData = doc.data();
                    if (window.writeCachedUserVisual && currentUser) {
                        const resolvedAvatar = window.resolveUserAvatar
                            ? window.resolveUserAvatar(window.userData, currentUser.uid || currentUser.email, currentUser.photoURL)
                            : (window.userData.avatar || currentUser.photoURL || window.DEFAULT_USER_AVATAR || "");
                        window.writeCachedUserVisual({
                            uid: currentUser.uid,
                            nombre: window.userData.nombre || currentUser.displayName || "Usuario",
                            puesto: window.userData.puesto || "Miembro de BitBond",
                            avatar: resolvedAvatar
                        });
                    }
                    actualizarUIPerfil();
                    if (window.refreshProductSidebar) window.refreshProductSidebar();
                    // Refrescar historias para actualizar el estado de 'visto'
                    if (window.renderStories) window.renderStories();
                }
            });
        }
    });
}

function actualizarUIPerfil() {
    if (!window.userData || !currentUser) return;
    const resolvedAvatar = window.resolveUserAvatar
        ? window.resolveUserAvatar(window.userData, currentUser.uid || currentUser.email, currentUser.photoURL)
        : (window.userData.avatar || currentUser.photoURL || "");

    if (window.applyUserVisualState) {
        window.applyUserVisualState({
            uid: currentUser.uid,
            nombre: window.userData.nombre || currentUser.displayName || "Usuario",
            puesto: window.userData.puesto || "Miembro de BitBond",
            avatar: resolvedAvatar
        });
    }

    // Actualizar datos en la barra lateral
    document.querySelectorAll('.profile-preview h3').forEach(el => {
        el.innerText = window.userData.nombre || currentUser.displayName || "Usuario";
    });
    document.querySelectorAll('.profile-preview p').forEach(el => {
        el.innerText = window.userData.puesto || "Miembro de BitBond";
    });
    document.querySelectorAll('.profile-preview img').forEach(el => {
        el.src = resolvedAvatar;
    });

    // Actualizar avatar en la nav bar
    const navAvatar = document.querySelector('nav .avatar');
    if (navAvatar) {
        navAvatar.src = resolvedAvatar;
    }

    // Forzar repintado de posts para actualizar roles si es necesario
    if (window.renderPosts) window.renderPosts();
}

function abrirEdicionPerfil() {
    if (!currentUser) return;
    const modal = document.getElementById('profileModal');
    const title = document.getElementById('profileModalTitle');
    if (modal) {
        title.innerText = "Editar perfil";
        // Rellenar campos
        const cropperContainer = document.getElementById('cropperContainer');
        if (cropperContainer) cropperContainer.style.display = 'none';
        const preview = document.getElementById('avatarPreview');

        if (window.userData) {
            document.getElementById('userJob').value = window.userData.puesto || "";
            document.getElementById('userBio').value = window.userData.bio || "";

            // Preview actual
            if (preview) {
                preview.src = window.resolveUserAvatar
                    ? window.resolveUserAvatar(window.userData, currentUser.uid || currentUser.email, currentUser.photoURL)
                    : (window.userData.avatar || currentUser.photoURL || "");
            }
        } else {
            document.getElementById('userJob').value = "";
            document.getElementById('userBio').value = "";
            if (preview) preview.src = window.DEFAULT_USER_AVATAR || "";
        }

        const editorName = document.getElementById('profileEditorName');
        const editorEmail = document.getElementById('profileEditorEmail');
        if (editorName) editorName.innerText = (window.userData && window.userData.nombre) || currentUser.displayName || "Usuario";
        if (editorEmail) editorEmail.innerText = currentUser.email || "Sin correo";

        modal.style.display = 'flex';
    }
}

function closeProfileModal() {
    const cropperContainer = document.getElementById('cropperContainer');
    const imageInput = document.getElementById('profileImageInput');
    if (cropperContainer) cropperContainer.style.display = 'none';
    if (imageInput) imageInput.value = '';
    if (profileCropper) {
        profileCropper.destroy();
        profileCropper = null;
    }
    document.getElementById('profileModal').style.display = 'none';
}

async function handleGuardarPerfil(event) {
    if (event) event.preventDefault();
    if (!currentUser) return;

    const puesto = document.getElementById('userJob').value;
    const bio = document.getElementById('userBio').value;
    const btn = document.getElementById('saveProfileBtn');
    const finalAvatar = document.getElementById('avatarPreview').src;
    const normalizedAvatar = window.isCustomUserAvatar && window.isCustomUserAvatar(finalAvatar) ? finalAvatar : "";

    try {
        btn.disabled = true;
        btn.innerText = "Guardando...";

        await db.collection("usuarios").doc(currentUser.uid).set({
            nombre: currentUser.displayName,
            nombreLower: (currentUser.displayName || "").toLowerCase(),
            email: currentUser.email,
            avatar: normalizedAvatar,
            puesto: puesto,
            puestoLower: puesto.toLowerCase(),
            bio: bio,
            amigos: window.userData ? (window.userData.amigos || []) : []
        }, { merge: true });

        // Actualizar avatar localmente si es posible
        if (window.userData) {
            window.userData.avatar = normalizedAvatar;
            window.userData.puesto = puesto;
            window.userData.bio = bio;
        }
        actualizarUIPerfil();

        closeProfileModal();
    } catch (e) {
        console.error("Error al guardar perfil:", e);
        alert("Error al guardar: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerText = "Guardar cambios";
    }
}

let profileCropper;
function resetProfileAvatar() {
    const preview = document.getElementById('avatarPreview');
    if (!preview) return;

    preview.src = window.DEFAULT_USER_AVATAR || "";
}

function handleProfilePhotoSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const cropperImg = document.getElementById('cropperImage');
        cropperImg.src = e.target.result;

        document.getElementById('cropperContainer').style.display = 'flex';

        if (profileCropper) profileCropper.destroy();

        profileCropper = new Cropper(cropperImg, {
            aspectRatio: 1,
            viewMode: 1,
            autoCropArea: 1,
            responsive: true,
            ready() {
                // Forzar máscara circular visualmente en el cropper (CSS)
                const cropperBox = document.querySelector('.cropper-face');
                if (cropperBox) {
                    cropperBox.style.borderRadius = '50%';
                }
            }
        });
    };
    reader.readAsDataURL(file);
}

function applyCrop() {
    if (!profileCropper) return;

    const canvas = profileCropper.getCroppedCanvas({
        width: 200,
        height: 200
    });

    document.getElementById('avatarPreview').src = canvas.toDataURL('image/jpeg');
    document.getElementById('cropperContainer').style.display = 'none';
    profileCropper.destroy();
    profileCropper = null;
}

// Lógica de Búsqueda
var searchTimeout;
function ejecutarBusqueda(query) {
    clearTimeout(searchTimeout);
    const resultsContainer = document.getElementById('searchResults');
    const jobFilter = document.getElementById('searchFilterJob').value;

    // Si no hay nada escrito ni seleccionado, esconder resultados
    if (!query.trim() && !jobFilter) {
        resultsContainer.style.display = 'none';
        return;
    }

    searchTimeout = setTimeout(async () => {
        try {
            let q = db.collection("usuarios");
            let docs = [];
            const searchStr = query.trim().toLowerCase();

            if (jobFilter) {
                // Si hay filtro de puesto, filtramos por puesto en Firestore (es exacto del select)
                const snapshot = await q.where("puesto", "==", jobFilter).limit(100).get();
                if (searchStr) {
                    // Y luego filtramos por nombre en memoria (case-insensitive)
                    docs = snapshot.docs.filter(doc => {
                        const nombre = (doc.data().nombre || "").toLowerCase();
                        return nombre.includes(searchStr);
                    });
                } else {
                    docs = snapshot.docs.slice(0, 20);
                }
            } else if (searchStr) {
                // Búsqueda general por Nombre o Puesto
                // Nota: Firestore no permite OR en queries complejas fácilmente con string prefix
                // Usamos una estrategia híbrida: traemos una muestra y filtramos
                const snapshot = await q.limit(100).get();
                docs = snapshot.docs.filter(doc => {
                    const u = doc.data();
                    const nombre = (u.nombre || "").toLowerCase();
                    const puesto = (u.puesto || "").toLowerCase();
                    return nombre.includes(searchStr) || puesto.includes(searchStr);
                });
                docs = docs.slice(0, 15); // Limitar resultados mostrados
            }

            renderResultados(docs, resultsContainer);
        } catch (e) {
            console.error("Error en búsqueda:", e);
            resultsContainer.innerHTML = `<p style="padding: 1rem; font-size: 0.8rem; color: #ff4444; text-align: center;">Error al conectar con la base de datos.</p>`;
            resultsContainer.style.display = 'block';
        }
    }, 300);
}

function renderResultados(docs, container) {
    if (docs.length === 0) {
        container.innerHTML = `<p style="padding: 1rem; font-size: 0.8rem; color: var(--text-muted); text-align: center;">No se encontraron usuarios.</p>`;
    } else {
        container.innerHTML = docs.map(doc => {
            const u = doc.data();
            const fallbackAvatar = window.resolveUserAvatar
                ? window.resolveUserAvatar(u, doc.id)
                : "";
            const avatarUrl = fallbackAvatar;
            // No mostrarse a sí mismo
            if (doc.id === currentUser.uid) return '';

            return `
                <div class="search-result-item" onclick="verPerfilUsuario('${doc.id}')">
                    <div class="avatar-container-search" style="position: relative;">
                        <img src="${avatarUrl}" class="avatar" style="width: 42px; height: 42px; border: 2px solid var(--border); object-fit: cover;" onerror="this.onerror=null;this.src='${fallbackAvatar}';">
                        <div class="online-indicator"></div>
                    </div>
                    <div class="search-result-info">
                        <h4>${u.nombre}</h4>
                        <p>
                            <span class="dot-indicator"></span>
                            ${u.puesto || 'Miembro de BitBond'}
                        </p>
                    </div>
                    <i class="fas fa-chevron-right arrow-icon"></i>
                </div>
            `;
        }).join('');
    }
    container.style.display = 'block';
}

async function verPerfilUsuario(uid) {
    console.log("Abriendo perfil para:", uid);
    if (!uid) {
        console.error("UID es nulo o indefinido");
        return;
    }
    // Para depuración
    // alert("Viendo perfil de: " + uid);

    // Ocultar buscador (por si viene de ahí)
    const resultsContainer = document.getElementById('searchResults');
    if (resultsContainer) resultsContainer.style.display = 'none';
    const mobileResults = document.getElementById('mobileSearchModal');
    if (mobileResults) mobileResults.style.display = 'none';

    try {
        // Cargar datos del usuario
        const userDoc = await db.collection("usuarios").doc(uid).get();
        if (!userDoc.exists) {
            console.warn("Usuario no encontrado:", uid);
            alert("Este perfil aún no ha sido configurado.");
            return;
        }
        const u = userDoc.data();

        // UI: Mostrar sección perfil, ocultar resto
        document.getElementById('mainFeed').style.display = 'none';
        document.getElementById('profileView').style.display = 'flex';
        if (window.setActiveNav) window.setActiveNav('profile');

        // Rellenar datos
        document.getElementById('viewedProfileAvatar').src = window.resolveUserAvatar
            ? window.resolveUserAvatar(u, uid)
            : "";
        document.getElementById('viewedProfileName').innerText = u.nombre || "Usuario";
        document.getElementById('viewedProfileJob').innerText = u.puesto || "Miembro de BitBond";
        document.getElementById('viewedProfileBio').innerText = u.bio || "Sin biografía.";

        // Stats sociales reales
        // 1. Siguiendo: Personas en SU lista de amigos
        document.getElementById('countFollowing').innerText = (u.amigos || []).length;

        // 2. Seguidores: Gente que tiene a ESTE UID en su lista de amigos
        const followersSnapshot = await db.collection("usuarios")
            .where("amigos", "array-contains", uid)
            .get();
        document.getElementById('countFollowers').innerText = followersSnapshot.size;

        // Botón Seguir
        const followBtn = document.getElementById('followBtn');
        const messageBtn = document.getElementById('messageProfileBtn');
        if (uid === currentUser.uid) {
            followBtn.style.display = 'none';
            if (messageBtn) messageBtn.style.display = 'none';
        } else {
            followBtn.style.display = 'block';
            const soyAmigo = (window.amigos || []).includes(uid);
            followBtn.innerText = soyAmigo ? "Amigos" : "Seguir";
            followBtn.onclick = () => {
                if (!soyAmigo && window.enviarSolicitud) {
                    window.enviarSolicitud(uid, u.nombre, window.resolveUserAvatar ? window.resolveUserAvatar(u, uid) : "");
                }
            };

            if (messageBtn) {
                messageBtn.style.display = soyAmigo ? 'inline-flex' : 'none';
                messageBtn.onclick = () => {
                    if (window.openChatEntryPoint) {
                        window.openChatEntryPoint(uid);
                    } else if (window.openChatModal) {
                        window.openChatModal(uid);
                    }
                };
            }
        }

        // Cargar posts del usuario
        renderPostsUsuario(uid);

        // Guardar UID actual para los modales de seguidores/siguiendo
        window.viewedProfileUid = uid;

    } catch (e) {
        console.error("Error al cargar perfil:", e);
    }
}

async function abrirModalSeguidores() {
    const uid = window.viewedProfileUid;
    if (!uid) return;

    const modal = document.getElementById('userListModal');
    const title = document.getElementById('userListModalTitle');
    const content = document.getElementById('userListContent');

    title.innerText = "Seguidores";
    content.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding: 1rem;">Cargando...</p>';
    modal.style.display = 'flex';

    try {
        const snapshot = await db.collection("usuarios")
            .where("amigos", "array-contains", uid)
            .get();

        renderUserList(snapshot.docs, content);
    } catch (e) {
        console.error("Error al cargar seguidores:", e);
        content.innerHTML = '<p style="text-align:center; color:#ff4444; padding: 1rem;">Error al cargar seguidores.</p>';
    }
}

async function abrirModalSiguiendo() {
    const uid = window.viewedProfileUid;
    if (!uid) return;

    const modal = document.getElementById('userListModal');
    const title = document.getElementById('userListModalTitle');
    const content = document.getElementById('userListContent');

    title.innerText = "Siguiendo";
    content.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding: 1rem;">Cargando...</p>';
    modal.style.display = 'flex';

    try {
        const userDoc = await db.collection("usuarios").doc(uid).get();
        const amigos = userDoc.data().amigos || [];

        if (amigos.length === 0) {
            content.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding: 1rem;">No sigue a nadie todavía.</p>';
            return;
        }

        // Firestore 'in' query supports up to 10-30 IDs depending on version/limits. 
        // For simplicity and to avoid complex chunking for now, we limit to first 10.
        const snapshot = await db.collection("usuarios")
            .where(firebase.firestore.FieldPath.documentId(), 'in', amigos.slice(0, 30))
            .get();

        renderUserList(snapshot.docs, content);
    } catch (e) {
        console.error("Error al cargar siguiendo:", e);
        content.innerHTML = '<p style="text-align:center; color:#ff4444; padding: 1rem;">Error al cargar lista.</p>';
    }
}

function renderUserList(docs, container) {
    if (docs.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding: 1rem;">No hay usuarios para mostrar.</p>';
        return;
    }

        container.innerHTML = docs.map(doc => {
            const u = doc.data();
            const avatarUrl = window.resolveUserAvatar
                ? window.resolveUserAvatar(u, doc.id)
                : "";
            return `
                <div class="search-result-item" onclick="verPerfilUsuario('${doc.id}'); closeUserListModal();">
                    <img src="${avatarUrl}" class="avatar" style="width: 40px; height: 40px;">
                    <div class="search-result-info">
                        <h4>${u.nombre}</h4>
                    <p>${u.puesto || 'Miembro'}</p>
                </div>
            </div>
        `;
    }).join('');
}

function closeUserListModal() {
    document.getElementById('userListModal').style.display = 'none';
}

function cerrarPerfilUsuario() {
    document.getElementById('profileView').style.display = 'none';
    document.getElementById('mainFeed').style.display = 'flex';
    if (window.setActiveNav) window.setActiveNav('home');
}

// Cargar posts del usuario
async function renderPostsUsuario(uid) {
    const container = document.getElementById('userPostsFeed');
    if (!container) return;

    container.innerHTML = '<p style="text-align:center; color:var(--text-muted);">Cargando publicaciones...</p>';

    try {
        // Usamos onSnapshot para que los likes/comentarios en el perfil sean en tiempo real
        db.collection("posts")
            .where("uid", "==", uid)
            .limit(20)
            .onSnapshot(snapshot => {
                const postsArray = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                // Filtrar por visibilidad si no es nuestro propio perfil
                const filteredPosts = postsArray.filter(p => {
                    if (uid === currentUser.uid) return true; // Mis posts siempre los veo
                    if (p.visibility === 'public') return true; // Públicos siempre se ven
                    const soyAmigo = (window.amigos || []).includes(uid);
                    if (soyAmigo) return true; // Amigos ven todo
                    return false;
                });

                filteredPosts.sort((a, b) => {
                    const dateA = a.createdAt ? (a.createdAt.seconds || 0) : 0;
                    const dateB = b.createdAt ? (b.createdAt.seconds || 0) : 0;
                    return dateB - dateA;
                });

                const countEl = document.getElementById('countPosts');
                if (countEl) countEl.innerText = filteredPosts.length;

                if (filteredPosts.length === 0) {
                    container.innerHTML = '<p style="text-align:center; color:var(--text-muted); margin-top:2rem;">No hay publicaciones visibles para ti.</p>';
                    return;
                }

                const profileAvatar = document.getElementById('viewedProfileAvatar')?.src || '';

                container.innerHTML = filteredPosts.map(p => {
                    const likedBy = p.likedBy || [];
                    const isLiked = currentUser && likedBy.includes(currentUser.uid);
                    const likesCount = likedBy.length;
                    const commentsHtml = (p.comments || []).map(c => `
                        <div style="background: var(--glass); padding: 0.5rem 1rem; border-radius: 10px; margin-top: 0.5rem; font-size: 0.85rem;">
                            <b style="color: var(--primary);">${c.author}:</b> ${c.text}
                        </div>
                    `).join('');

                    const heartIcon = isLiked
                        ? `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`
                        : `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;

                    return `
                        <div class="card post" data-post-id="${p.id}" style="margin-top: 1rem;">
                            <div class="post-header">
                                <img src="${profileAvatar || p.avatar}" class="avatar" style="width:40px; height:40px;">
                                <div class="post-info">
                                    <h4 style="font-weight: 600;">${p.author}</h4>
                                    <small style="color: var(--text-muted);">${p.createdAt ? new Date(p.createdAt.toDate()).toLocaleString() : 'Recién publicado'}</small>
                                </div>
                            </div>
                            <div class="post-main-content" ondblclick="window.handleDoubleTap && window.handleDoubleTap('${p.id}', event)">
                                <div class="post-content" style="margin-top: 1rem;">
                                    <p style="line-height: 1.6;">${p.content}</p>
                                    ${p.image ? `
                                        <div class="post-image-container">
                                            <img src="${p.image}" class="post-image" style="width:100%; border-radius:12px; margin-top:1rem;">
                                            <div class="double-tap-heart">❤️</div>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>

                            <div class="post-actions" style="border-top: 1px solid var(--border); padding-top: 1rem; display: flex; gap: 1.5rem; margin-top: 1rem;">
                                <button class="like-btn ${isLiked ? 'liked' : ''}" onclick="window.likePost && window.likePost('${p.id}')">
                                    ${heartIcon}
                                    <span>${likesCount}</span>
                                </button>
                            <button class="action-btn" onclick="window.toggleCommentsUI && window.toggleCommentsUI('${p.id}', this)">💬 ${p.comments ? p.comments.length : 0}</button>
                        </div>

                        <div id="comment-section-${p.id}" style="display: none; margin-top: 1rem;">
                            <div id="comment-list-${p.id}">${commentsHtml}</div>
                            <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                                <input type="text" id="ipt-${p.id}" class="search-bar" style="width: 100%; font-size: 0.85rem;" placeholder="Escribe un comentario...">
                                <button class="btn btn-primary" onclick="window.sendComment && window.sendComment('${p.id}', this)">Enviar</button>
                            </div>
                        </div>
                        </div>
                    `;
                }).join('');
            });

    } catch (e) {
        console.error("Error cargar posts usuario:", e);
        container.innerHTML = '<p style="text-align:center; color:#ff4444;">Error al cargar las publicaciones.</p>';
    }
}

// Cerrar resultados al hacer clic fuera
window.addEventListener('click', (e) => {
    if (!e.target.closest('.search-bar')) {
        const results = document.getElementById('searchResults');
        if (results) results.style.display = 'none';
    }
});

// Visibilidad dinámica de filtros
function showSearchFilters() {
    document.getElementById('searchContainer').classList.add('active');
    if (window.setActiveNav) window.setActiveNav('search');
}

function hideSearchFilters() {
    // Timeout para permitir hacer clic en el select antes de ocultar
    setTimeout(() => {
        const query = document.getElementById('globalSearch').value;
        const job = document.getElementById('searchFilterJob').value;
        // Solo ocultar si no hay búsqueda activa ni filtro seleccionado
        if (!query.trim() && !job && !document.activeElement.closest('#searchFilterJob')) {
            document.getElementById('searchContainer').classList.remove('active');
            if (window.setActiveNav) window.setActiveNav(window.resolveAppSection ? window.resolveAppSection() : 'home');
        }
    }, 200);
}

// Buscador Móvil (Lupa)
let selectedMobileJob = "";

function abrirBuscadorMovil() {
    document.getElementById('mobileSearchModal').style.display = 'flex';
    document.getElementById('mobileSearchInput').focus();
    renderFiltrosMovil();
    if (window.setActiveNav) window.setActiveNav('search');
}

function cerrarBuscadorMovil() {
    document.getElementById('mobileSearchModal').style.display = 'none';
    if (window.setActiveNav) window.setActiveNav(window.resolveAppSection ? window.resolveAppSection() : 'home');
}

function renderFiltrosMovil() {
    const jobs = ["Frontend", "Backend", "Fullstack", "DevOps", "QA", "UI/UX", "Data"];
    const container = document.getElementById('mobileJobFilters');
    container.innerHTML = jobs.map(job => `
        <div class="filter-tag ${selectedMobileJob.startsWith(job) ? 'active' : ''}" 
             onclick="toggleFiltroMovil('${job}')">${job}</div>
    `).join('');
}

function toggleFiltroMovil(job) {
    // Conversión a valor real de la DB para simplificar
    const realJobs = {
        "Frontend": "Frontend Developer",
        "Backend": "Backend Developer",
        "Fullstack": "Fullstack Engineer",
        "DevOps": "DevOps Specialist",
        "QA": "QA Engineer",
        "UI/UX": "UI/UX Designer",
        "Data": "Data Scientist"
    };

    const realJobName = realJobs[job];
    selectedMobileJob = selectedMobileJob === realJobName ? "" : realJobName;
    renderFiltrosMovil();
    ejecutarBusquedaMovil(document.getElementById('mobileSearchInput').value);
}

async function ejecutarBusquedaMovil(query) {
    const resultsContainer = document.getElementById('mobileSearchResults');
    if (!query.trim() && !selectedMobileJob) {
        resultsContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted); margin-top: 2rem;">Escribe algo o elige un puesto para buscar...</p>';
        return;
    }

    try {
        let q = db.collection("usuarios");
        let docs = [];
        const searchStr = query.trim().toLowerCase();

        if (selectedMobileJob) {
            const snapshot = await q.where("puesto", "==", selectedMobileJob).limit(100).get();
            if (searchStr) {
                docs = snapshot.docs.filter(doc => {
                    const u = doc.data();
                    const nombre = (u.nombre || "").toLowerCase();
                    const puesto = (u.puesto || "").toLowerCase();
                    return nombre.includes(searchStr) || puesto.includes(searchStr);
                });
            } else {
                docs = snapshot.docs.slice(0, 20);
            }
        } else if (searchStr) {
            const snapshot = await q.limit(100).get();
            docs = snapshot.docs.filter(doc => {
                const u = doc.data();
                const nombre = (u.nombre || "").toLowerCase();
                const puesto = (u.puesto || "").toLowerCase();
                return nombre.includes(searchStr) || puesto.includes(searchStr);
            });
            docs = docs.slice(0, 15);
        }

        renderResultados(docs, resultsContainer);
    } catch (e) {
        console.error("Error búsqueda móvil:", e);
    }
}

// Exportar
window.abrirModalSeguidores = abrirModalSeguidores;
window.abrirModalSiguiendo = abrirModalSiguiendo;
window.closeUserListModal = closeUserListModal;
window.cerrarPerfilUsuario = cerrarPerfilUsuario;
window.abrirEdicionPerfil = abrirEdicionPerfil;
window.resetProfileAvatar = resetProfileAvatar;
window.handleProfilePhotoSelect = handleProfilePhotoSelect;
window.applyCrop = applyCrop;
window.handleGuardarPerfil = handleGuardarPerfil;
window.closeProfileModal = closeProfileModal;
window.ejecutarBusqueda = ejecutarBusqueda;
window.verPerfilUsuario = verPerfilUsuario;
window.showSearchFilters = showSearchFilters;
window.hideSearchFilters = hideSearchFilters;
window.abrirBuscadorMovil = abrirBuscadorMovil;
window.cerrarBuscadorMovil = cerrarBuscadorMovil;
window.toggleFiltroMovil = toggleFiltroMovil;
window.ejecutarBusquedaMovil = ejecutarBusquedaMovil;
