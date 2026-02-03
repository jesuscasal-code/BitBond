// amigos.js - Lógica de Seguimiento y Amistad

var amigos = []; // UIDs de personas aceptadas

// Escuchar cambios en mi perfil para obtener lista de amigos
function escucharAmigos() {
    if (!currentUser) return;

    db.collection("usuarios").doc(currentUser.uid).onSnapshot(doc => {
        if (doc.exists) {
            window.amigos = doc.data().amigos || [];
        } else {
            // Inicializar documento de usuario si no existe
            db.collection("usuarios").doc(currentUser.uid).set({
                amigos: [],
                nombre: currentUser.displayName,
                email: currentUser.email
            });
            window.amigos = [];
        }
        // Repintar posts cuando cambia la lista de amigos
        if (window.renderPosts) window.renderPosts();
    });
}

// Escuchar solicitudes pendientes para el badge
function escucharSolicitudes() {
    if (!currentUser) return;

    db.collection("solicitudes")
        .where("para", "==", currentUser.uid)
        .where("estado", "==", "pendiente")
        .onSnapshot(snapshot => {
            const num = snapshot.size;
            const badges = [document.getElementById('friendBadge'), document.getElementById('friendBadgeMobile')];
            badges.forEach(badge => {
                if (badge) {
                    badge.innerText = num;
                    badge.style.display = num > 0 ? 'inline-block' : 'none';
                }
            });
            renderSolicitudes(snapshot);
        });
}

function renderSolicitudes(snapshot) {
    const container = document.getElementById('requestList');
    if (!container) return;

    if (snapshot.empty) {
        container.innerHTML = `<p style="text-align: center; color: var(--text-muted);">No tienes solicitudes pendientes.</p>`;
        return;
    }

    container.innerHTML = snapshot.docs.map(doc => {
        const req = doc.data();
        return `
            <div class="request-item">
                <div class="request-info">
                    <img src="${req.deAvatar}" class="avatar" style="width:35px; height:35px;">
                    <div>
                        <b style="font-size:0.9rem;">${req.deNombre}</b>
                    </div>
                </div>
                <div class="request-actions">
                    <button class="btn btn-primary" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" onclick="aceptarSolicitud('${doc.id}', '${req.de}')">Aceptar</button>
                    <button class="btn" style="padding: 0.3rem 0.6rem; font-size: 0.8rem; background: rgba(255,0,0,0.1); color: #ff4444;" onclick="rechazarSolicitud('${doc.id}')"> Rechazar</button>
                </div>
            </div>
        `;
    }).join('');
}

async function enviarSolicitud(targetUid, targetNombre, targetAvatar) {
    if (!currentUser) return;

    // Evitar enviarse a sí mismo
    if (targetUid === currentUser.uid) return;

    try {
        await db.collection("solicitudes").add({
            de: currentUser.uid,
            deNombre: currentUser.displayName || "Usuario",
            deAvatar: currentUser.photoURL || "",
            para: targetUid,
            estado: "pendiente",
            fecha: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert("¡Solicitud enviada!");
    } catch (e) {
        console.error("Error al enviar solicitud:", e);
    }
}

async function aceptarSolicitud(requestId, deUid) {
    try {
        // 1. Borrar solicitud
        await db.collection("solicitudes").doc(requestId).delete();

        // 2. Añadir a mi lista de amigos
        await db.collection("usuarios").doc(currentUser.uid).update({
            amigos: firebase.firestore.FieldValue.arrayUnion(deUid)
        });

        // 3. Añadirme a la lista de amigos del otro (amistad mutua simple)
        await db.collection("usuarios").doc(deUid).set({
            amigos: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
        }, { merge: true });

    } catch (e) {
        console.error("Error al aceptar solicitud:", e);
    }
}

async function rechazarSolicitud(requestId) {
    try {
        await db.collection("solicitudes").doc(requestId).delete();
    } catch (e) {
        console.error("Error al rechazar:", e);
    }
}

// UI Modals
function openRequestsModal() { document.getElementById('requestsModal').style.display = 'flex'; }
function closeRequestsModal() { document.getElementById('requestsModal').style.display = 'none'; }

// Inicializar listeners cuando el usuario cambie
if (auth) {
    auth.onAuthStateChanged(user => {
        if (user) {
            escucharAmigos();
            escucharSolicitudes();
        }
    });
}

// Exportar
window.enviarSolicitud = enviarSolicitud;
window.aceptarSolicitud = aceptarSolicitud;
window.rechazarSolicitud = rechazarSolicitud;
window.openRequestsModal = openRequestsModal;
window.closeRequestsModal = closeRequestsModal;
