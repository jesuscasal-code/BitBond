// amigos.js - Logica de seguimiento y amistad

var amigosUnsubscribe = null;
var friendOfMeUnsubscribe = null;
var followersOfMeUnsubscribe = null;
var incomingRequestsUnsubscribe = null;
var outgoingRequestsUnsubscribe = null;
var latestIncomingRequestsSnapshot = null;
var friendshipStateByUid = {};
var pendingIncomingRequests = {};
var pendingOutgoingRequests = {};
var processedIncomingRequestIds = {};
var profileFriendUids = [];
var profileFollowerUids = [];
var reverseFriendUids = [];
var reverseFollowerUids = [];

function uniqueUidList(items) {
    return [...new Set((items || []).filter(Boolean))];
}

function getUserFollowerIds(userData) {
    return uniqueUidList([
        ...((userData && userData.seguidores) || []),
        ...((userData && userData.amigos) || [])
    ]);
}

function cleanupAmigosListeners() {
    if (amigosUnsubscribe) {
        amigosUnsubscribe();
        amigosUnsubscribe = null;
    }
    if (friendOfMeUnsubscribe) {
        friendOfMeUnsubscribe();
        friendOfMeUnsubscribe = null;
    }
    if (followersOfMeUnsubscribe) {
        followersOfMeUnsubscribe();
        followersOfMeUnsubscribe = null;
    }
    if (incomingRequestsUnsubscribe) {
        incomingRequestsUnsubscribe();
        incomingRequestsUnsubscribe = null;
    }
    if (outgoingRequestsUnsubscribe) {
        outgoingRequestsUnsubscribe();
        outgoingRequestsUnsubscribe = null;
    }
}

function updateFriendBadges(count) {
    const badges = [document.getElementById('friendBadge'), document.getElementById('friendBadgeMobile')];
    badges.forEach(badge => {
        if (!badge) return;
        badge.innerText = count;
        badge.style.display = count > 0 ? 'inline-block' : 'none';
    });
}

function refreshFriendshipUi() {
    if (window.renderPosts) window.renderPosts();
    if (window.renderStories) window.renderStories();
    if (window.refreshProductSidebar) window.refreshProductSidebar();
    if (window.renderActivityFeed) window.renderActivityFeed();
    if (window.renderQuickStats) window.renderQuickStats();
    if (window.refreshViewedProfileRelationship) window.refreshViewedProfileRelationship();
    if (window.refreshViewedProfileSocialUi) window.refreshViewedProfileSocialUi();
}

function resetAmigosState() {
    window.amigos = [];
    window.friendshipStateByUid = {};
    window.pendingIncomingRequests = {};
    window.pendingOutgoingRequests = {};
    friendshipStateByUid = {};
    pendingIncomingRequests = {};
    pendingOutgoingRequests = {};
    processedIncomingRequestIds = {};
    profileFriendUids = [];
    profileFollowerUids = [];
    reverseFriendUids = [];
    reverseFollowerUids = [];
    latestIncomingRequestsSnapshot = null;
    updateFriendBadges(0);

    const container = document.getElementById('requestList');
    if (container) {
        container.innerHTML = `<p style="text-align: center; color: var(--text-muted);">No tienes solicitudes pendientes.</p>`;
    }
}

function rebuildFriendshipState() {
    const nextState = {};
    const acceptedFriendUids = new Set([
        ...(profileFriendUids || []),
        ...(profileFollowerUids || []),
        ...(reverseFriendUids || []),
        ...(reverseFollowerUids || [])
    ]);

    window.amigos = [...acceptedFriendUids];

    window.amigos.forEach(uid => {
        if (!uid) return;
        nextState[uid] = { status: 'friends', uid: uid };
    });

    Object.keys(pendingIncomingRequests).forEach(uid => {
        if (!uid || nextState[uid]) return;
        nextState[uid] = {
            status: 'pending_received',
            uid: uid,
            requestId: pendingIncomingRequests[uid].id,
            request: pendingIncomingRequests[uid]
        };
    });

    Object.keys(pendingOutgoingRequests).forEach(uid => {
        if (!uid || nextState[uid]) return;
        nextState[uid] = {
            status: 'pending_sent',
            uid: uid,
            requestId: pendingOutgoingRequests[uid].id,
            request: pendingOutgoingRequests[uid]
        };
    });

    friendshipStateByUid = nextState;
    window.friendshipStateByUid = nextState;
    window.pendingIncomingRequests = pendingIncomingRequests;
    window.pendingOutgoingRequests = pendingOutgoingRequests;
    refreshFriendshipUi();
}

function getFriendshipState(uid) {
    if (!uid) return { status: 'none', uid: uid };
    if (currentUser && uid === currentUser.uid) return { status: 'self', uid: uid };
    return friendshipStateByUid[uid] || { status: 'none', uid: uid };
}

function areUsersFriends(uid) {
    return getFriendshipState(uid).status === 'friends';
}

function canMessageUser(uid) {
    if (!uid || !currentUser || uid === currentUser.uid) return false;
    if (areUsersFriends(uid)) return true;
    return typeof window.hasExistingConversationWith === 'function'
        ? window.hasExistingConversationWith(uid)
        : false;
}

function getFriendshipButtonConfig(uid) {
    const state = getFriendshipState(uid);
    if (state.status === 'self') {
        return {
            label: '',
            uiState: 'self',
            className: 'is-hidden',
            disabled: true
        };
    }

    if (state.status === 'friends') {
        return {
            label: 'Amigos',
            uiState: 'friends',
            className: 'is-friends',
            disabled: true
        };
    }

    if (state.status === 'pending_sent' || state.status === 'pending_received') {
        return {
            label: 'Pendiente',
            uiState: 'pending',
            className: 'is-pending',
            disabled: state.status === 'pending_sent'
        };
    }

    return {
        label: 'Seguir',
        uiState: 'follow',
        className: 'is-follow',
        disabled: false
    };
}

function applyFriendshipButtonState(button, uid, metadata) {
    if (!button) return;

    const config = getFriendshipButtonConfig(uid);
    button.dataset.uid = uid || '';
    button.dataset.name = metadata && metadata.name ? metadata.name : '';
    button.dataset.avatar = metadata && metadata.avatar ? metadata.avatar : '';
    button.dataset.state = config.uiState;
    button.innerText = config.label;
    button.disabled = !!config.disabled;
    button.className = `btn friendship-btn ${config.className}`.trim();
    button.style.display = config.uiState === 'self' ? 'none' : 'inline-flex';
    button.onclick = function () {
        handleFriendshipAction(button);
    };
}

function buildFriendshipButton(uid, options) {
    const metadata = options || {};
    const config = getFriendshipButtonConfig(uid);
    if (config.uiState === 'self') return '';

    const classes = `friendship-btn ${options && options.compact ? 'is-compact' : ''} ${config.className}`.trim();
    return `
        <button
            type="button"
            class="btn ${classes}"
            data-uid="${escapeFriendshipHtml(uid)}"
            data-name="${escapeFriendshipHtml(metadata.name || '')}"
            data-avatar="${escapeFriendshipHtml(metadata.avatar || '')}"
            data-state="${escapeFriendshipHtml(config.uiState)}"
            ${config.disabled ? 'disabled' : ''}
            onclick="window.handleFriendshipAction(this)">
            ${escapeFriendshipHtml(config.label)}
        </button>
    `;
}

function escapeFriendshipHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function renderSolicitudes(snapshot) {
    const container = document.getElementById('requestList');
    if (!container) return;

    if (!snapshot || snapshot.empty) {
        container.innerHTML = `<p style="text-align: center; color: var(--text-muted);">No tienes solicitudes pendientes.</p>`;
        return;
    }

    container.innerHTML = snapshot.docs.map(doc => {
        const req = doc.data();
        const liveProfile = window.getResolvedUserProfile
            ? window.getResolvedUserProfile({ nombre: req.deNombre, avatar: req.deAvatar }, req.de)
            : { nombre: req.deNombre, avatar: req.deAvatar };
        const requestAvatar = window.resolveUserAvatar
            ? window.resolveUserAvatar(liveProfile, req.de)
            : (req.deAvatar || "");
        return `
            <div class="request-item">
                <div class="request-info">
                    <img src="${escapeFriendshipHtml(requestAvatar)}" class="avatar request-avatar">
                    <div>
                        <b class="request-name">${escapeFriendshipHtml(liveProfile.nombre || req.deNombre || 'Usuario')}</b>
                    </div>
                </div>
                <div class="request-actions">
                    <button class="btn request-action-btn accept" onclick="aceptarSolicitud('${doc.id}', '${req.de}')">Aceptar</button>
                    <button class="btn request-action-btn reject" onclick="rechazarSolicitud('${doc.id}')">Rechazar</button>
                </div>
            </div>
        `;
    }).join('');
}

function renderSolicitudesFromPendingState() {
    const docs = Object.values(pendingIncomingRequests || {});

    if (docs.length === 0) {
        renderSolicitudes(null);
        return;
    }

    renderSolicitudes({
        empty: false,
        docs: docs.map(request => ({
            id: request.id,
            data() {
                return request;
            }
        }))
    });
}

function rerenderSolicitudes() {
    renderSolicitudesFromPendingState();
}

function hydrateIncomingRequests(snapshot) {
    const nextRequests = {};
    const activeRequestIds = {};

    snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (!data.de) return;
        activeRequestIds[doc.id] = true;
        if (processedIncomingRequestIds[doc.id]) return;
        nextRequests[data.de] = { id: doc.id, ...data };
    });

    Object.keys(processedIncomingRequestIds).forEach(requestId => {
        if (!activeRequestIds[requestId]) {
            delete processedIncomingRequestIds[requestId];
        }
    });

    pendingIncomingRequests = nextRequests;
    latestIncomingRequestsSnapshot = snapshot;
    updateFriendBadges(Object.keys(nextRequests).length);
    renderSolicitudesFromPendingState();
    rebuildFriendshipState();
}

function hydrateOutgoingRequests(snapshot) {
    const nextRequests = {};
    snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (!data.para) return;
        nextRequests[data.para] = { id: doc.id, ...data };
    });
    pendingOutgoingRequests = nextRequests;
    rebuildFriendshipState();
}

function escucharAmigos() {
    if (!currentUser) return;
    if (amigosUnsubscribe) amigosUnsubscribe();

    amigosUnsubscribe = db.collection("usuarios").doc(currentUser.uid).onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data() || {};
            profileFriendUids = uniqueUidList(data.amigos || []);
            profileFollowerUids = uniqueUidList(data.seguidores || []);
        } else {
            db.collection("usuarios").doc(currentUser.uid).set({
                amigos: [],
                seguidores: [],
                nombre: currentUser.displayName,
                email: currentUser.email
            }, { merge: true });
            profileFriendUids = [];
            profileFollowerUids = [];
        }
        rebuildFriendshipState();
    });
}

function escucharQuienMeTieneComoAmigo() {
    if (!currentUser) return;
    if (friendOfMeUnsubscribe) friendOfMeUnsubscribe();

    friendOfMeUnsubscribe = db.collection("usuarios")
        .where("amigos", "array-contains", currentUser.uid)
        .onSnapshot(snapshot => {
            reverseFriendUids = snapshot.docs
                .map(doc => doc.id)
                .filter(uid => uid && uid !== currentUser.uid);
            rebuildFriendshipState();
        }, error => {
            console.error("Error al escuchar relaciones inversas:", error);
            reverseFriendUids = [];
            rebuildFriendshipState();
        });
}

function escucharQuienMeTieneComoSeguidor() {
    if (!currentUser) return;
    if (followersOfMeUnsubscribe) followersOfMeUnsubscribe();

    followersOfMeUnsubscribe = db.collection("usuarios")
        .where("seguidores", "array-contains", currentUser.uid)
        .onSnapshot(snapshot => {
            reverseFollowerUids = snapshot.docs
                .map(doc => doc.id)
                .filter(uid => uid && uid !== currentUser.uid);
            rebuildFriendshipState();
        }, error => {
            console.error("Error al escuchar siguiendo inverso:", error);
            reverseFollowerUids = [];
            rebuildFriendshipState();
        });
}

function escucharSolicitudesRecibidas() {
    if (!currentUser) return;
    if (incomingRequestsUnsubscribe) incomingRequestsUnsubscribe();

    incomingRequestsUnsubscribe = db.collection("solicitudes")
        .where("para", "==", currentUser.uid)
        .where("estado", "==", "pendiente")
        .onSnapshot(snapshot => {
            hydrateIncomingRequests(snapshot);
        });
}

function escucharSolicitudesEnviadas() {
    if (!currentUser) return;
    if (outgoingRequestsUnsubscribe) outgoingRequestsUnsubscribe();

    outgoingRequestsUnsubscribe = db.collection("solicitudes")
        .where("de", "==", currentUser.uid)
        .where("estado", "==", "pendiente")
        .onSnapshot(snapshot => {
            hydrateOutgoingRequests(snapshot);
        });
}

async function findActiveRequestBetween(uidA, uidB) {
    const [outgoingSnapshot, incomingSnapshot] = await Promise.all([
        db.collection("solicitudes")
            .where("de", "==", uidA)
            .where("para", "==", uidB)
            .where("estado", "==", "pendiente")
            .limit(1)
            .get(),
        db.collection("solicitudes")
            .where("de", "==", uidB)
            .where("para", "==", uidA)
            .where("estado", "==", "pendiente")
            .limit(1)
            .get()
    ]);

    if (!outgoingSnapshot.empty) {
        const doc = outgoingSnapshot.docs[0];
        return { direction: 'outgoing', id: doc.id, ...doc.data() };
    }

    if (!incomingSnapshot.empty) {
        const doc = incomingSnapshot.docs[0];
        return { direction: 'incoming', id: doc.id, ...doc.data() };
    }

    return null;
}

function applyOptimisticOutgoingRequest(targetUid, payload) {
    pendingOutgoingRequests = {
        ...pendingOutgoingRequests,
        [targetUid]: {
            id: payload.id || `temp-${targetUid}`,
            ...payload
        }
    };
    rebuildFriendshipState();
}

async function enviarSolicitud(targetUid, targetNombre, targetAvatar) {
    if (!currentUser || !targetUid || targetUid === currentUser.uid) return getFriendshipState(targetUid);

    const currentState = getFriendshipState(targetUid);
    if (currentState.status === 'friends' || currentState.status === 'pending_sent') {
        return currentState;
    }
    if (currentState.status === 'pending_received') {
        openRequestsModal();
        return currentState;
    }

    try {
        const activeRequest = await findActiveRequestBetween(currentUser.uid, targetUid);

        if (activeRequest) {
            if (activeRequest.direction === 'outgoing') {
                applyOptimisticOutgoingRequest(targetUid, activeRequest);
            } else {
                pendingIncomingRequests = {
                    ...pendingIncomingRequests,
                    [targetUid]: activeRequest
                };
                rebuildFriendshipState();
                openRequestsModal();
            }
            return getFriendshipState(targetUid);
        }

        const payload = {
            de: currentUser.uid,
            deNombre: currentUser.displayName || "Usuario",
            deAvatar: window.resolveUserAvatar
                ? window.resolveUserAvatar(window.userData || {}, currentUser.uid || currentUser.email, currentUser.photoURL)
                : "",
            para: targetUid,
            paraNombre: targetNombre || "",
            paraAvatar: targetAvatar || "",
            estado: "pendiente",
            fecha: firebase.firestore.FieldValue.serverTimestamp()
        };

        applyOptimisticOutgoingRequest(targetUid, payload);
        const newDoc = await db.collection("solicitudes").add(payload);
        pendingOutgoingRequests[targetUid] = { id: newDoc.id, ...payload };
        rebuildFriendshipState();
        return getFriendshipState(targetUid);
    } catch (e) {
        delete pendingOutgoingRequests[targetUid];
        rebuildFriendshipState();
        console.error("Error al enviar solicitud:", e);
        return { status: 'none', uid: targetUid };
    }
}

async function aceptarSolicitud(requestId, deUid) {
    if (!currentUser || !requestId || !deUid) return;

    const previousIncomingRequests = { ...pendingIncomingRequests };

    try {
        processedIncomingRequestIds[requestId] = true;
        delete pendingIncomingRequests[deUid];
        updateFriendBadges(Object.keys(pendingIncomingRequests).length);
        rebuildFriendshipState();
        rerenderSolicitudes();

        const relatedRequestsSnapshot = await db.collection("solicitudes")
            .where("de", "==", deUid)
            .where("para", "==", currentUser.uid)
            .get();

        const reverseRequestsSnapshot = await db.collection("solicitudes")
            .where("de", "==", currentUser.uid)
            .where("para", "==", deUid)
            .get();

        const duplicateDeleteBatch = db.batch();
        const requestRefsToDelete = {};

        relatedRequestsSnapshot.docs.forEach(doc => {
            const data = doc.data() || {};
            if (data.estado && data.estado !== 'pendiente') return;
            processedIncomingRequestIds[doc.id] = true;
            requestRefsToDelete[doc.id] = doc.ref;
        });

        reverseRequestsSnapshot.docs.forEach(doc => {
            const data = doc.data() || {};
            if (data.estado && data.estado !== 'pendiente') return;
            processedIncomingRequestIds[doc.id] = true;
            requestRefsToDelete[doc.id] = doc.ref;
        });

        if (!requestRefsToDelete[requestId]) {
            requestRefsToDelete[requestId] = db.collection("solicitudes").doc(requestId);
        }

        Object.keys(requestRefsToDelete).forEach(id => {
            duplicateDeleteBatch.delete(requestRefsToDelete[id]);
        });

        await duplicateDeleteBatch.commit();

        await db.collection("usuarios").doc(currentUser.uid).set({
            seguidores: firebase.firestore.FieldValue.arrayUnion(deUid),
            amigos: firebase.firestore.FieldValue.arrayRemove(deUid)
        }, { merge: true });
    } catch (e) {
        pendingIncomingRequests = previousIncomingRequests;
        delete processedIncomingRequestIds[requestId];
        updateFriendBadges(Object.keys(pendingIncomingRequests).length);
        rebuildFriendshipState();
        rerenderSolicitudes();
        console.error("Error al aceptar solicitud:", e);
    }
}

async function rechazarSolicitud(requestId) {
    if (!requestId) return;

    try {
        processedIncomingRequestIds[requestId] = true;
        const incomingEntry = Object.entries(pendingIncomingRequests)
            .find(([, request]) => request && request.id === requestId);

        if (incomingEntry) {
            delete pendingIncomingRequests[incomingEntry[0]];
            updateFriendBadges(Object.keys(pendingIncomingRequests).length);
            rebuildFriendshipState();
            rerenderSolicitudes();
        }

        const requestRef = db.collection("solicitudes").doc(requestId);
        const requestDoc = await requestRef.get();
        const requestData = requestDoc.exists ? requestDoc.data() : null;

        if (requestData && requestData.de && requestData.para) {
            const duplicatesSnapshot = await db.collection("solicitudes")
                .where("de", "==", requestData.de)
                .where("para", "==", requestData.para)
                .where("estado", "==", "pendiente")
                .get();

            const batch = db.batch();
            duplicatesSnapshot.docs.forEach(doc => {
                processedIncomingRequestIds[doc.id] = true;
                batch.delete(doc.ref);
            });
            if (duplicatesSnapshot.empty) {
                batch.delete(requestRef);
            }
            await batch.commit();
            return;
        }

        await requestRef.delete();
    } catch (e) {
        console.error("Error al rechazar:", e);
    }
}

function handleFriendshipAction(buttonOrElement) {
    const button = buttonOrElement && buttonOrElement.tagName ? buttonOrElement : null;
    const uid = button ? button.dataset.uid : buttonOrElement;
    if (!uid) return;

    const state = getFriendshipState(uid);
    if (state.status === 'none') {
        const name = button ? button.dataset.name : '';
        const avatar = button ? button.dataset.avatar : '';
        enviarSolicitud(uid, name, avatar);
        return;
    }

    if (state.status === 'pending_received') {
        openRequestsModal();
    }
}

function openRequestsModal() {
    document.getElementById('requestsModal').style.display = 'flex';
    if (window.setActiveNav) window.setActiveNav('requests');
}

function closeRequestsModal() {
    document.getElementById('requestsModal').style.display = 'none';
    if (window.setActiveNav) window.setActiveNav(window.resolveAppSection ? window.resolveAppSection() : 'home');
}

if (auth) {
    auth.onAuthStateChanged(user => {
        if (user) {
            escucharAmigos();
            escucharQuienMeTieneComoAmigo();
            escucharQuienMeTieneComoSeguidor();
            escucharSolicitudesRecibidas();
            escucharSolicitudesEnviadas();
        } else {
            cleanupAmigosListeners();
            resetAmigosState();
            refreshFriendshipUi();
        }
    });
}

window.enviarSolicitud = enviarSolicitud;
window.aceptarSolicitud = aceptarSolicitud;
window.rechazarSolicitud = rechazarSolicitud;
window.openRequestsModal = openRequestsModal;
window.closeRequestsModal = closeRequestsModal;
window.rerenderSolicitudes = rerenderSolicitudes;
window.getFriendshipState = getFriendshipState;
window.areUsersFriends = areUsersFriends;
window.canMessageUser = canMessageUser;
window.getFriendshipButtonConfig = getFriendshipButtonConfig;
window.applyFriendshipButtonState = applyFriendshipButtonState;
window.buildFriendshipButton = buildFriendshipButton;
window.handleFriendshipAction = handleFriendshipAction;
window.getUserFollowerIds = getUserFollowerIds;
