// publicaciones.js - Lógica de Posts y Comentarios

var postAuthorProfiles = {};
var postAuthorProfileUnsubscribes = {};
var postAuthorDirectoryUnsubscribe = null;
var postsUnsubscribe = null;

function escapePostHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatPostRelativeTime(timestamp) {
    if (!timestamp) return "Hace un momento";
    const baseSeconds = timestamp.seconds || Math.floor(Date.now() / 1000);
    const diff = Math.max(0, Math.floor(Date.now() / 1000) - baseSeconds);
    if (diff < 60) return "Hace un momento";
    if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
    return `Hace ${Math.floor(diff / 86400)} d`;
}

function getPostHeartIcon(isLiked) {
    return isLiked
        ? `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`
        : `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
}

function getPostCommentIcon() {
    return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>`;
}

function getPostDeleteIcon() {
    return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M8 6V4.8A1.8 1.8 0 0 1 9.8 3h4.4A1.8 1.8 0 0 1 16 4.8V6"></path><path d="M18 6v12.2A2.8 2.8 0 0 1 15.2 21H8.8A2.8 2.8 0 0 1 6 18.2V6"></path><path d="M10 10.2v6"></path><path d="M14 10.2v6"></path></svg>`;
}

function getPostVisibilityMeta(visibility) {
    if (visibility === 'public') {
        return {
            label: 'Publica',
            className: 'is-public'
        };
    }

    return {
        label: 'Privada',
        className: 'is-friends'
    };
}

function renderCommentsMarkup(comments) {
    if (!comments || comments.length === 0) {
        return '<div class="comment comment-empty">Todavía no hay comentarios. Sé el primero en responder.</div>';
    }

    return comments.map(comment => `
        <div class="comment">
            <span class="comment-author">${escapePostHtml(comment.author || 'Usuario')}</span>
            <p class="comment-text">${escapePostHtml(comment.text || '')}</p>
        </div>
    `).join('');
}

async function hydratePostAuthorProfiles(postsToHydrate) {
    if (!db) return;

    const uniqueUids = [...new Set((postsToHydrate || []).map(post => post.uid).filter(Boolean))];
    const missingUids = uniqueUids.filter(uid => !postAuthorProfiles[uid]);

    if (missingUids.length === 0) return;

    const snapshots = await Promise.all(
        missingUids.map(uid => db.collection("usuarios").doc(uid).get().catch(() => null))
    );

    snapshots.forEach((doc, index) => {
        const uid = missingUids[index];
        if (doc && doc.exists) {
            postAuthorProfiles[uid] = doc.data();
        } else {
            postAuthorProfiles[uid] = {};
        }
    });
}

function ensurePostAuthorDirectoryListener() {
    if (!db || !auth || postAuthorDirectoryUnsubscribe) return;

    postAuthorDirectoryUnsubscribe = db.collection("usuarios").onSnapshot(snapshot => {
        const nextProfiles = {};
        snapshot.docs.forEach(doc => {
            nextProfiles[doc.id] = doc.data();
        });
        postAuthorProfiles = nextProfiles;
        renderPosts();
    }, () => {
        postAuthorProfiles = postAuthorProfiles || {};
    });
}

function cleanupPostAuthorProfiles() {
    Object.keys(postAuthorProfileUnsubscribes).forEach(uid => {
        postAuthorProfileUnsubscribes[uid]();
        delete postAuthorProfileUnsubscribes[uid];
    });

    if (postAuthorDirectoryUnsubscribe) {
        postAuthorDirectoryUnsubscribe();
        postAuthorDirectoryUnsubscribe = null;
    }

    postAuthorProfiles = {};
}

function cleanupPostsListener() {
    if (postsUnsubscribe) {
        postsUnsubscribe();
        postsUnsubscribe = null;
    }
}

function syncPostAuthorProfiles(postsToSync) {
    if (!db) return;

    const requiredUids = new Set((postsToSync || []).map(post => post.uid).filter(Boolean));

    Object.keys(postAuthorProfileUnsubscribes).forEach(uid => {
        if (!requiredUids.has(uid)) {
            postAuthorProfileUnsubscribes[uid]();
            delete postAuthorProfileUnsubscribes[uid];
            delete postAuthorProfiles[uid];
        }
    });

    requiredUids.forEach(uid => {
        if (postAuthorProfileUnsubscribes[uid]) return;

        postAuthorProfileUnsubscribes[uid] = db.collection("usuarios").doc(uid).onSnapshot(doc => {
            postAuthorProfiles[uid] = doc && doc.exists ? doc.data() : {};
            renderPosts();
        }, () => {
            postAuthorProfiles[uid] = postAuthorProfiles[uid] || {};
        });
    });
}

function getPostAuthorAvatarFallback(post, cachedProfile) {
    if (window.resolveUserAvatar) {
        return window.resolveUserAvatar(cachedProfile || {}, post.uid || post.author || 'user');
    }
    return window.DEFAULT_USER_AVATAR || "";
}

function buildPostCard(post, options = {}) {
    const likedBy = post.likedBy || [];
    const comments = post.comments || [];
    const isLiked = currentUser && likedBy.includes(currentUser.uid);
    const likesCount = likedBy.length;
    const commentsCount = comments.length;
    const isProfileView = !!options.profileView;
    const cachedProfile = postAuthorProfiles[post.uid] || {};
    const resolvedProfile = window.getResolvedUserProfile
        ? window.getResolvedUserProfile(
            currentUser && post.uid === currentUser.uid ? (window.userData || cachedProfile || {}) : (cachedProfile || {}),
            post.uid,
            currentUser && post.uid === currentUser.uid ? currentUser.photoURL : ''
        )
        : (cachedProfile || {});
    const overrideAvatar = options.avatar || '';
    const overrideAuthor = options.author || '';
    const overrideRole = options.role || '';
    const liveProfileAvatar = window.resolveUserAvatar
        ? window.resolveUserAvatar(
            resolvedProfile,
            post.uid || post.author || 'user',
            currentUser && post.uid === currentUser.uid ? currentUser.photoURL : ''
        )
        : '';
    const ownAuthor = currentUser && post.uid === currentUser.uid && currentUser.displayName
        ? currentUser.displayName
        : '';
    const ownRole = currentUser && post.uid === currentUser.uid && window.userData && window.userData.puesto
        ? window.userData.puesto
        : '';
    const resolvedAvatar = overrideAvatar || liveProfileAvatar || getPostAuthorAvatarFallback(post, cachedProfile);
    const resolvedAuthor = overrideAuthor || resolvedProfile.nombre || ownAuthor || post.author;
    const resolvedRole = overrideRole || resolvedProfile.puesto || ownRole || post.puesto || post.role || 'Miembro de BitBond';
    const isOwnPost = !!(currentUser && post.uid === currentUser.uid);
    const visibilityMeta = getPostVisibilityMeta(post.visibility);

    let followBtnHtml = '';
    if (!isProfileView && currentUser && post.uid !== currentUser.uid && window.buildFriendshipButton) {
        followBtnHtml = window.buildFriendshipButton(post.uid, {
            compact: true,
            name: resolvedAuthor,
            avatar: resolvedAvatar
        });
    }

    const deleteBtnHtml = isOwnPost ? `
        <button
            type="button"
            class="post-delete-btn"
            onclick="event.stopPropagation(); confirmDeletePost('${post.id}')"
            aria-label="Eliminar publicación"
            title="Eliminar publicación"
        >
            ${getPostDeleteIcon()}
        </button>
    ` : '';

    return `
        <div class="card post-card ${isProfileView ? 'profile-post-card' : ''}" data-post-id="${post.id}">
            <div class="post-header post-header-split">
                <div class="post-author-block" onclick="verPerfilUsuario('${post.uid}')">
                    <img src="${escapePostHtml(resolvedAvatar)}" class="avatar" alt="${escapePostHtml(resolvedAuthor)}" loading="lazy" decoding="async">
                    <div class="post-info">
                        <h4>${escapePostHtml(resolvedAuthor)}</h4>
                        <p class="post-meta">${escapePostHtml(resolvedRole)} · ${escapePostHtml(formatPostRelativeTime(post.createdAt))}</p>
                    </div>
                </div>
                <div class="post-header-actions">
                    ${followBtnHtml}
                    ${deleteBtnHtml}
                </div>
            </div>

            <div class="post-main-content" ondblclick="handleDoubleTap('${post.id}', event)">
                <div class="post-content">
                    <p>${escapePostHtml(post.content)}</p>
                    ${post.image ? `
                        <div class="post-image-container">
                            <img src="${escapePostHtml(post.image)}" class="post-image" alt="Imagen de la publicacion" loading="lazy" decoding="async">
                            <div class="double-tap-heart">&#10084;</div>
                        </div>
                    ` : ''}
                </div>
            </div>

            <div class="post-actions">
                <button class="like-btn ${isLiked ? 'liked' : ''}" onclick="likePost('${post.id}')">
                    ${getPostHeartIcon(isLiked)}
                    <span>${likesCount}</span>
                </button>
                <button class="action-btn" onclick="toggleCommentsUI('${post.id}', this)">
                    ${getPostCommentIcon()}
                    <span>${commentsCount}</span>
                </button>
                <span class="post-actions-spacer"></span>
                <span class="post-visibility-badge ${visibilityMeta.className}">${escapePostHtml(visibilityMeta.label)}</span>
            </div>

            <div id="comment-section-${post.id}" class="comment-section" style="display: none;">
                <div id="comment-list-${post.id}">${renderCommentsMarkup(comments)}</div>
                <div class="comment-composer">
                    <input type="text" id="ipt-${post.id}" class="search-bar comment-input" placeholder="Escribe un comentario...">
                    <button class="btn btn-primary comment-submit-btn" onclick="sendComment('${post.id}', this)">Enviar</button>
                </div>
            </div>
        </div>
    `;
}

function renderPosts() {
    const container = document.getElementById('post-container');
    if (!container) return;

    const filteredPosts = posts.filter(post => {
        if (!currentUser) return false;
        return post.uid === currentUser.uid
            || (window.areUsersFriends ? window.areUsersFriends(post.uid) : (window.amigos || []).includes(post.uid))
            || post.visibility === 'public';
    });

    if (filteredPosts.length === 0) {
        container.innerHTML = `
            <div class="card feed-empty-state">
                <p class="section-kicker">Tu feed</p>
                <h3>Aún no hay publicaciones para mostrar</h3>
                <p>Empieza compartiendo algo o conecta con mas personas para llenar tu inicio de actividad real.</p>
                <button class="btn btn-primary" onclick="openModal()">Crear publicacion</button>
            </div>
        `;
        return;
    }

    container.innerHTML = filteredPosts.map(post => buildPostCard(post)).join('');
}

function subscribeToPosts() {
    if (!db || !currentUser) return;

    cleanupPostsListener();

    postsUnsubscribe = db.collection("posts").onSnapshot(async snapshot => {
        posts = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: data.createdAt ? data.createdAt : { seconds: Date.now() / 1000 }
            };
        });
        await hydratePostAuthorProfiles(posts);
        syncPostAuthorProfiles(posts);
        posts.sort((a, b) => (b.createdAt.seconds || 0) - (a.createdAt.seconds || 0));
        renderPosts();
        if (window.renderActivityFeed) window.renderActivityFeed();
        if (window.renderQuickStats) window.renderQuickStats();
    }, error => {
        console.error("Error en Firestore:", error);
        if (error && error.code === 'permission-denied') {
            posts = [];
            renderPosts();
        }
    });
}

if (auth) {
    auth.onAuthStateChanged(user => {
        if (user) {
            ensurePostAuthorDirectoryListener();
            subscribeToPosts();
        } else {
            cleanupPostsListener();
            cleanupPostAuthorProfiles();
            posts = [];
            renderPosts();
        }
    });
}

async function sendComment(postId, btn) {
    let input;
    if (btn) {
        input = btn.closest('.card').querySelector('input[type="text"]');
    } else {
        input = document.getElementById(`ipt-${postId}`);
    }

    if (!input || !input.value.trim() || !currentUser) return;

    try {
        await db.collection("posts").doc(postId).update({
            comments: firebase.firestore.FieldValue.arrayUnion({
                author: currentUser.displayName || "Usuario",
                text: input.value.trim(),
                uid: currentUser.uid
            })
        });
        input.value = '';
    } catch (e) {
        console.error("Error al comentar:", e);
    }
}

async function submitPost() {
    const content = document.getElementById('postContent').value;
    if (!content.trim() && !window.selectedImageData) return;
    if (!currentUser) return;

    const submitBtn = document.getElementById('submitBtn');
    try {
        if (submitBtn) submitBtn.disabled = true;

        await db.collection("posts").add({
            author: currentUser.displayName || "Usuario",
            avatar: (window.userData && window.isCustomUserAvatar && window.isCustomUserAvatar(window.userData.avatar))
                ? window.userData.avatar
                : "",
            content: content,
            image: window.selectedImageData || null,
            likedBy: [],
            comments: [],
            role: "Miembro de BitBond",
            puesto: (window.userData && window.userData.puesto) ? window.userData.puesto : "Miembro",
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            uid: currentUser.uid,
            visibility: document.getElementById('postVisibility').value || 'public'
        });

        if (window.closeModal) window.closeModal();
    } catch (e) {
        console.error("Error al publicar:", e);
        alert("Hubo un error: " + e.message);
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

async function likePost(postId) {
    if (!currentUser) return;

    const postRef = db.collection("posts").doc(postId);
    const post = posts.find(item => item.id === postId);
    if (!post) return;

    const likedBy = post.likedBy || [];
    const isLiked = likedBy.includes(currentUser.uid);

    try {
        if (isLiked) {
            await postRef.update({
                likedBy: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
            });
        } else {
            await postRef.update({
                likedBy: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
            });
        }
    } catch (e) {
        console.error("Error al dar like:", e);
    }
}

async function confirmDeletePost(postId) {
    if (!currentUser || !db || !postId) return;

    let post = posts.find(item => item.id === postId);

    if (!post) {
        try {
            const doc = await db.collection("posts").doc(postId).get();
            if (!doc.exists) return;
            post = { id: doc.id, ...doc.data() };
        } catch (e) {
            console.error("Error al validar la publicación antes de eliminar:", e);
            return;
        }
    }

    if (!post || post.uid !== currentUser.uid) return;

    const confirmed = window.confirm("¿Seguro que quieres eliminar esta publicación? Esta acción no se puede deshacer.");
    if (!confirmed) return;

    try {
        await db.collection("posts").doc(postId).delete();
    } catch (e) {
        console.error("Error al eliminar la publicación:", e);
        alert("No se pudo eliminar la publicación. Inténtalo de nuevo.");
    }
}

function handleDoubleTap(postId, event) {
    const post = posts.find(item => item.id === postId);
    if (!post) return;

    const likedBy = post.likedBy || [];
    if (!likedBy.includes(currentUser.uid)) {
        likePost(postId);
    }

    const card = event.currentTarget.closest('.card');
    const heart = card.querySelector('.double-tap-heart');
    if (heart) {
        heart.classList.remove('animate');
        void heart.offsetWidth;
        heart.classList.add('animate');
    }
}

window.renderPosts = renderPosts;
window.sendComment = sendComment;
window.submitPost = submitPost;
window.likePost = likePost;
window.handleDoubleTap = handleDoubleTap;
window.buildPostCard = buildPostCard;
window.confirmDeletePost = confirmDeletePost;
window.formatPostRelativeTime = formatPostRelativeTime;
window.getPostCommentIcon = getPostCommentIcon;
window.toggleCommentsUI = (id, btn) => {
    let el;
    if (btn) {
        el = btn.closest('.card').querySelector(`[id^="comment-section-"]`);
    } else {
        el = document.getElementById(`comment-section-${id}`);
    }
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
};
