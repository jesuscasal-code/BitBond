// publicaciones.js - Lógica de Posts y Comentarios

// Escucha de posts
if (db) {
    db.collection("posts").onSnapshot(snapshot => {
        posts = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: data.createdAt ? data.createdAt : { seconds: Date.now() / 1000 }
            };
        });
        posts.sort((a, b) => (b.createdAt.seconds || 0) - (a.createdAt.seconds || 0));
        renderPosts();
    }, error => {
        console.error("Error en Firestore:", error);
    });
}

function renderPosts() {
    const container = document.getElementById('post-container');
    if (!container) return;

    // FILTRADO: Mis posts, de mis amigos, o públicos
    const filteredPosts = posts.filter(p => {
        if (!currentUser) return false;
        // Mostrar si: es mío, es amigo, o es público y no soy yo (para evitar duplicados lógicos, aunque el primer chequeo ya lo cubre)
        return p.uid === currentUser.uid || (window.amigos || []).includes(p.uid) || p.visibility === 'public';
    });

    container.innerHTML = filteredPosts.map(post => {
        const likedBy = post.likedBy || [];
        const isLiked = currentUser && likedBy.includes(currentUser.uid);
        const likesCount = likedBy.length;

        const commentsHtml = (post.comments || []).map(c => `
            <div style="background: var(--glass); padding: 0.5rem 1rem; border-radius: 10px; margin-top: 0.5rem; font-size: 0.85rem;">
                <b style="color: var(--primary);">${c.author}:</b> ${c.text}
            </div>
        `).join('');

        // Lógica para botón Seguir
        let followBtnHtml = '';
        if (currentUser && post.uid !== currentUser.uid && !(window.amigos || []).includes(post.uid)) {
            followBtnHtml = `<button class="follow-btn" onclick="enviarSolicitud('${post.uid}', '${post.author}', '${post.avatar}')">Seguir</button>`;
        }

        const heartIcon = isLiked
            ? `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`
            : `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;

        return `
            <div class="card post-card" data-post-id="${post.id}" style="margin-top: 1rem;">
                <div class="post-header" style="justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 1rem; cursor: pointer;" onclick="verPerfilUsuario('${post.uid}')">
                        <img src="${post.avatar}" class="avatar">
                        <div>
                            <h4 style="font-weight: 600;">${post.author}</h4>
                            <p style="color: var(--text-muted); font-size: 0.8rem;">${post.puesto || post.role || 'Miembro de BitBond'}</p>
                        </div>
                    </div>
                    ${followBtnHtml}
                </div>
                
                <div class="post-main-content" ondblclick="handleDoubleTap('${post.id}', event)">
                    <p style="line-height: 1.6; margin: 1rem 0;">${post.content}</p>
                    ${post.image ? `
                        <div class="post-image-container">
                            <img src="${post.image}" class="post-image" style="width:100%; border-radius:12px; margin-bottom:1rem;">
                            <div class="double-tap-heart">❤️</div>
                        </div>
                    ` : ''}
                </div>
                
                <div class="post-actions" style="border-top: 1px solid var(--border); padding-top: 1rem; display: flex; gap: 1.5rem;">
                    <button class="like-btn ${isLiked ? 'liked' : ''}" onclick="likePost('${post.id}')">
                        ${heartIcon}
                        <span>${likesCount}</span>
                    </button>
                    <button class="action-btn" onclick="toggleCommentsUI('${post.id}', this)">💬 ${post.comments ? post.comments.length : 0}</button>
                </div>

                <div id="comment-section-${post.id}" style="display: none; margin-top: 1rem;">
                    <div id="comment-list-${post.id}">${commentsHtml}</div>
                    <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                        <input type="text" id="ipt-${post.id}" class="search-bar" style="width: 100%; font-size: 0.85rem;" placeholder="Escribe un comentario...">
                        <button class="btn btn-primary" onclick="sendComment('${post.id}', this)">Enviar</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
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
            avatar: currentUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.email}`,
            content: content,
            image: window.selectedImageData || null,
            likedBy: [],
            comments: [],
            role: "Miembro de BitBond", // Fallback
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
    const post = posts.find(p => p.id === postId);
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

function handleDoubleTap(postId, event) {
    // Solo disparar si ya no hemos dado like (o siempre, estilo Instagram para re-animar)
    const post = posts.find(p => p.id === postId);
    if (!post) return;

    const likedBy = post.likedBy || [];
    if (!likedBy.includes(currentUser.uid)) {
        likePost(postId);
    }

    // Animación visual del corazón
    const card = event.currentTarget.closest('.card');
    const heart = card.querySelector('.double-tap-heart');
    if (heart) {
        heart.classList.remove('animate');
        void heart.offsetWidth; // Trigger reflow
        heart.classList.add('animate');
    }
}

// Exportar globalmente
window.renderPosts = renderPosts;
window.sendComment = sendComment;
window.submitPost = submitPost;
window.likePost = likePost;
window.handleDoubleTap = handleDoubleTap;
window.toggleCommentsUI = (id, btn) => {
    let el;
    if (btn) {
        el = btn.closest('.card').querySelector(`[id^="comment-section-"]`);
    } else {
        el = document.getElementById(`comment-section-${id}`);
    }
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
};
