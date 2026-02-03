// historias.js - Lógica de Historias de 24 horas

var allStories = [];
var currentStoryIndex = 0;
var storyTimer = null;

// Escuchar historias
if (db) {
    db.collection("stories").onSnapshot(snapshot => {
        const now = Date.now();
        allStories = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })).filter(s => {
            // Filtrado de 24 h en cliente para seguridad extra
            return (s.expiresAt && s.expiresAt.toDate() > new Date());
        });

        renderStories();
    }, error => {
        console.error("Error en Historias:", error);
    });
}

function renderStories() {
    const container = document.getElementById('storiesContainer');
    if (!container || !currentUser) return;

    // Obtener mis historias vistas de userData
    const seenStories = (window.userData && window.userData.historiasVistas) ? window.userData.historiasVistas : [];

    // Obtener historias de amigos + las mías
    const myFriends = window.amigos || [];
    const visibleStories = allStories.filter(s => s.uid === currentUser.uid || myFriends.includes(s.uid));

    // Agrupar por usuario (estilo Instagram)
    const storiesByUser = {};
    visibleStories.forEach(s => {
        if (!storiesByUser[s.uid]) {
            storiesByUser[s.uid] = {
                uid: s.uid,
                author: s.author,
                avatar: s.avatar,
                stories: [],
                allSeen: true // Por defecto true, si encontramos una no vista cambia
            };
        }
        storiesByUser[s.uid].stories.push(s);
        if (!seenStories.includes(s.id)) {
            storiesByUser[s.uid].allSeen = false;
        }
    });

    // Ordenar: 
    // 1. Tú primero
    // 2. Usuarios con historias nuevas (no vistas)
    // 3. Usuarios con todas las historias vistas (al final)
    const sortedUsers = Object.values(storiesByUser).sort((a, b) => {
        if (a.uid === currentUser.uid) return -1;
        if (b.uid === currentUser.uid) return 1;

        // Si uno tiene historias nuevas y el otro no
        if (a.allSeen !== b.allSeen) {
            return a.allSeen ? 1 : -1;
        }

        // Si ambos están en el mismo estado, ordenar por fecha de la más reciente
        return b.stories[0].createdAt.seconds - a.stories[0].createdAt.seconds;
    });

    // Ver si yo tengo historias
    const myStoriesEntry = storiesByUser[currentUser.uid];
    const myStoriesSeen = myStoriesEntry ? myStoriesEntry.allSeen : true;

    // Botón "Tu historia" (Fusionado si ya tengo historias)
    let html = `
        <div class="story-item" onclick="${myStoriesEntry ? `viewStories('${currentUser.uid}')` : 'createNewStory()'}">
            <div class="story-ring ${myStoriesEntry ? (myStoriesSeen ? 'watched' : '') : 'my-story watched'}" 
                 style="${!myStoriesEntry ? 'opacity:1; background:var(--border);' : ''}">
                <img src="${(window.userData && window.userData.avatar) ? window.userData.avatar : (currentUser.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + currentUser.email)}" class="avatar">
                ${!myStoriesEntry ? '<div class="story-plus-icon">+</div>' : ''}
            </div>
            <span>Tu historia</span>
        </div>
    `;

    // Resto de usuarios (excluyéndome a mí porque ya salgo primero)
    html += sortedUsers.filter(u => u.uid !== currentUser.uid).map(u => `
        <div class="story-item" onclick="viewStories('${u.uid}')">
            <div class="story-ring ${u.allSeen ? 'watched' : ''}">
                <img src="${u.avatar}" class="avatar">
            </div>
            <span>${u.author.split(' ')[0]}</span>
        </div>
    `).join('');

    container.innerHTML = html;
}

// Crear nueva historia (usando un input invisible)
function createNewStory() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Comprimir/Convertir a base64 para demo (en prod usar storage)
        const reader = new FileReader();
        reader.onload = async (readerEvent) => {
            const base64 = readerEvent.target.result;

            try {
                await db.collection("stories").add({
                    uid: currentUser.uid,
                    author: currentUser.displayName || "Usuario",
                    avatar: (window.userData && window.userData.avatar) ? window.userData.avatar : (currentUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.email}`),
                    media: base64,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    expiresAt: firebase.firestore.Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000))
                });
            } catch (err) {
                console.error("Error al subir historia:", err);
            }
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

var currentViewingUserStories = [];

function viewStories(uid) {
    const user = allStories.filter(s => s.uid === uid);
    if (user.length === 0) return;

    currentViewingUserStories = user.sort((a, b) => a.createdAt.seconds - b.createdAt.seconds);
    currentStoryIndex = 0;

    document.getElementById('storyViewer').style.display = 'flex';
    showStory();
}

function showStory() {
    clearTimeout(storyTimer);
    const story = currentViewingUserStories[currentStoryIndex];
    if (!story) {
        closeStoryViewer();
        return;
    }

    // Marcar como vista en Firestore
    if (currentUser && story.uid !== currentUser.uid) {
        db.collection("usuarios").doc(currentUser.uid).update({
            historiasVistas: firebase.firestore.FieldValue.arrayUnion(story.id)
        }).catch(err => console.error("Error al marcar historia vista:", err));
    }

    // Actualizar UI del viewer
    document.getElementById('storyImage').src = story.media;

    const header = document.querySelector('.story-header');
    if (header) {
        header.onclick = story.uid === currentUser.uid ? () => { createNewStory(); closeStoryViewer(); } : null;
        header.style.cursor = story.uid === currentUser.uid ? 'pointer' : 'default';
        header.innerHTML = `
            <img src="${story.avatar}" class="avatar" style="width: 32px; height: 32px; border: 2px solid white;">
            <div style="display:flex; flex-direction:column; gap:2px;">
                <span style="font-weight: 600; font-size: 0.9rem;">${story.author} ${story.uid === currentUser.uid ? '(Tú)' : ''}</span>
                <small style="opacity: 0.8; font-size: 0.75rem;">${story.createdAt ? calcularTiempo(story.createdAt) : "Ahora"}</small>
            </div>
            ${story.uid === currentUser.uid ? '<small style="margin-left:auto; background:rgba(255,255,255,0.2); padding:2px 8px; border-radius:10px; font-size:0.7rem;">Añadir +</small>' : ''}
        `;
    }

    // Barras de progreso
    const progressContainer = document.getElementById('storyProgress');
    progressContainer.innerHTML = currentViewingUserStories.map((_, i) => `
        <div class="story-progress-bar">
            <div class="story-progress-fill" style="width: ${i < currentStoryIndex ? '100%' : '0%'}"></div>
        </div>
    `).join('');

    const currentFill = progressContainer.querySelectorAll('.story-progress-fill')[currentStoryIndex];

    // Animación
    let start = null;
    const duration = 5000; // 5 seg por historia

    function animate(timestamp) {
        if (!start) start = timestamp;
        const progress = timestamp - start;
        const percent = Math.min((progress / duration) * 100, 100);

        if (currentFill) currentFill.style.width = percent + '%';

        if (progress < duration) {
            storyTimer = requestAnimationFrame(animate);
        } else {
            nextStory();
        }
    }
    storyTimer = requestAnimationFrame(animate);
}

function nextStory() {
    currentStoryIndex++;
    if (currentStoryIndex < currentViewingUserStories.length) {
        showStory();
    } else {
        closeStoryViewer();
    }
}

function closeStoryViewer() {
    clearTimeout(storyTimer);
    cancelAnimationFrame(storyTimer);
    document.getElementById('storyViewer').style.display = 'none';
}

function calcularTiempo(timestamp) {
    const date = timestamp.toDate();
    const dif = (Date.now() - date.getTime()) / 1000;
    if (dif < 60) return "ahora";
    if (dif < 3600) return Math.floor(dif / 60) + "m";
    return Math.floor(dif / 3600) + "h";
}

// Exportar
window.createNewStory = createNewStory;
window.viewStories = viewStories;
window.closeStoryViewer = closeStoryViewer;
window.renderStories = renderStories;
