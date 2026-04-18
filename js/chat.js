// chat.js - Mensajeria en tiempo real entre usuarios

var chatConversations = [];
var chatSelectedFriendUid = null;
var chatSelectedConversationId = null;
var chatConversationUnsubscribe = null;
var chatMessagesUnsubscribe = null;
var chatUserCache = {};
var chatUserProfileUnsubscribes = {};
var chatSearchTerm = "";
var chatMiniOpen = false;
var chatMiniMode = "inbox";
var chatCurrentMessages = [];
var chatLastReadReceiptKey = "";
var chatSuppressConversationOpenUntil = 0;
var chatLastMobileBackActionAt = 0;
var chatLastMobileBackTriggerAt = 0;
var chatConversationListTouchResetTimeout = null;

var CHAT_EMOJI_OPTIONS = [
    "\uD83D\uDE00",
    "\uD83D\uDE02",
    "\uD83D\uDE0D",
    "\uD83D\uDE2E",
    "\uD83D\uDE0E",
    "\uD83D\uDE22",
    "\uD83D\uDE21",
    "\uD83D\uDE2D",
    "\uD83D\uDE4C",
    "\uD83D\uDC4D",
    "\uD83D\uDC4E",
    "\uD83D\uDC4F",
    "\u2764\uFE0F",
    "\uD83D\uDD25",
    "\u2728",
    "\uD83C\uDF89"
];

function shouldUseChatMiniDock() {
    return !!currentUser && window.innerWidth > 1024;
}

function shouldUseMobileChatFlow() {
    return window.innerWidth <= 600;
}

function setChatMobileView(mode) {
    const modal = document.getElementById('chatModal');
    const sidebar = modal ? modal.querySelector('.chat-sidebar') : null;
    const main = modal ? modal.querySelector('.chat-main') : null;
    if (!modal) return;

    const useMobileFlow = shouldUseMobileChatFlow();
    modal.classList.toggle('chat-mobile-flow', useMobileFlow);
    modal.classList.remove('chat-mobile-list-active', 'chat-mobile-thread-active');

    if (!useMobileFlow) {
        if (sidebar) sidebar.style.display = '';
        if (main) main.style.display = '';
        return;
    }

    if (mode === 'thread') {
        modal.classList.add('chat-mobile-thread-active');
        if (sidebar) sidebar.style.display = 'none';
        if (main) main.style.display = 'flex';
    } else {
        modal.classList.add('chat-mobile-list-active');
        if (sidebar) sidebar.style.display = 'flex';
        if (main) main.style.display = 'none';
    }
}

function syncChatScrollLock() {
    const body = document.body;
    if (!body) return;

    body.classList.toggle('chat-scroll-locked', isChatModalOpen());
}

function suppressMobileChatConversationOpen(durationMs) {
    if (!shouldUseMobileChatFlow()) return;
    chatSuppressConversationOpenUntil = Date.now() + Math.max(0, durationMs || 0);
}

function isMobileChatConversationOpenSuppressed() {
    return shouldUseMobileChatFlow() && Date.now() < chatSuppressConversationOpenUntil;
}

function temporarilyDisableMobileConversationListTouches(durationMs) {
    if (!shouldUseMobileChatFlow()) return;

    const sidebar = document.querySelector('#chatModal .chat-sidebar');
    const list = document.getElementById('chatConversationList');
    if (!sidebar && !list) return;

    if (chatConversationListTouchResetTimeout) {
        clearTimeout(chatConversationListTouchResetTimeout);
        chatConversationListTouchResetTimeout = null;
    }

    if (sidebar) sidebar.style.pointerEvents = 'none';
    if (list) list.style.pointerEvents = 'none';

    chatConversationListTouchResetTimeout = setTimeout(() => {
        if (sidebar) sidebar.style.pointerEvents = '';
        if (list) list.style.pointerEvents = '';
        chatConversationListTouchResetTimeout = null;
    }, Math.max(0, durationMs || 0));
}

function blurActiveChatElement() {
    const activeElement = document.activeElement;
    if (activeElement && typeof activeElement.blur === 'function') {
        activeElement.blur();
    }
}

function stopChatMiniEvent(event) {
    if (!event) return;
    if (typeof event.preventDefault === 'function') event.preventDefault();
    if (typeof event.stopPropagation === 'function') event.stopPropagation();
}

function isClickInsideChatMiniDock(event) {
    if (!event) return false;

    if (typeof event.composedPath === 'function') {
        const path = event.composedPath();
        if (Array.isArray(path) && path.some(node => node && node.id === 'chatMiniDock')) {
            return true;
        }
    }

    const target = event.target;
    return !!(target && typeof target.closest === 'function' && target.closest('#chatMiniDock'));
}

function escapeChatHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function getChatConversationId(uidA, uidB) {
    return [uidA, uidB].sort().join("__");
}

function getChatTimestampValue(timestamp) {
    if (!timestamp) return 0;
    if (timestamp instanceof Date) return timestamp.getTime();
    if (typeof timestamp === 'number') return timestamp;
    if (typeof timestamp.toDate === 'function') return timestamp.toDate().getTime();
    if (typeof timestamp.seconds === 'number') return timestamp.seconds * 1000;
    return 0;
}

function formatChatTimestamp(timestamp) {
    const value = getChatTimestampValue(timestamp);
    if (!value) return "";

    const date = new Date(value);
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();

    if (sameDay) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
}

async function getChatUsersByIds(uids) {
    const uniqueIds = [...new Set((uids || []).filter(Boolean))];
    const missingIds = uniqueIds.filter(uid => !chatUserCache[uid]);

    if (missingIds.length > 0) {
        const snapshots = await Promise.all(
            missingIds.map(uid => db.collection("usuarios").doc(uid).get().catch(() => null))
        );

        snapshots.forEach((doc, index) => {
            const uid = missingIds[index];
            if (doc && doc.exists) {
                chatUserCache[uid] = {
                    uid: uid,
                    ...doc.data()
                };
            } else {
                chatUserCache[uid] = {
                    uid: uid,
                    nombre: "Usuario",
                    puesto: "Miembro de BitBond",
                    avatar: ""
                };
            }
        });
    }

    return uniqueIds.map(uid => chatUserCache[uid]).filter(Boolean);
}

function refreshChatUserSurfaces(friendUid) {
    const targetUid = friendUid || chatSelectedFriendUid;
    renderChatConversationList();
    renderChatMiniDock();

    if (targetUid && targetUid === chatSelectedFriendUid) {
        updateChatHeader(targetUid);
        updateChatMiniHeader(targetUid);
    }
}

function syncChatUserProfileListeners(uids) {
    const requiredIds = new Set((uids || []).filter(Boolean));

    Object.keys(chatUserProfileUnsubscribes).forEach(uid => {
        if (requiredIds.has(uid)) return;
        chatUserProfileUnsubscribes[uid]();
        delete chatUserProfileUnsubscribes[uid];
        delete chatUserCache[uid];
    });

    requiredIds.forEach(uid => {
        if (chatUserProfileUnsubscribes[uid]) return;

        chatUserProfileUnsubscribes[uid] = db.collection("usuarios").doc(uid).onSnapshot(doc => {
            if (doc && doc.exists) {
                chatUserCache[uid] = {
                    uid: uid,
                    ...doc.data()
                };
            } else {
                chatUserCache[uid] = {
                    uid: uid,
                    nombre: "Usuario",
                    puesto: "Miembro de BitBond",
                    avatar: ""
                };
            }

            refreshChatUserSurfaces(uid);
        }, () => {
            chatUserCache[uid] = chatUserCache[uid] || {
                uid: uid,
                nombre: "Usuario",
                puesto: "Miembro de BitBond",
                avatar: ""
            };
        });
    });
}

function cleanupChatUserProfileListeners() {
    Object.keys(chatUserProfileUnsubscribes).forEach(uid => {
        chatUserProfileUnsubscribes[uid]();
        delete chatUserProfileUnsubscribes[uid];
    });
}

function getChatFriendProfile(friendUid) {
    const cachedProfile = chatUserCache[friendUid] || {
        uid: friendUid,
        nombre: "Usuario",
        puesto: "Miembro de BitBond",
        avatar: ""
    };

    if (window.getResolvedUserProfile) {
        return window.getResolvedUserProfile(cachedProfile, friendUid);
    }

    return cachedProfile;
}

function getChatAvatarFallback(profile) {
    if (window.resolveUserAvatar) {
        return window.resolveUserAvatar(profile || {}, (profile && profile.uid) || (profile && profile.email) || "user");
    }
    return "";
}

function getChatAvatarUrl(profile) {
    if (profile && typeof profile.avatar === 'string' && profile.avatar.trim()) {
        return profile.avatar.trim();
    }

    return getChatAvatarFallback(profile || {});
}

function getChatAvatarOnError(profile) {
    return `this.onerror=null;this.src='${escapeChatHtml(getChatAvatarFallback(profile))}';`;
}

function getChatPeerUid(conversation) {
    return (conversation.participants || []).find(uid => uid !== currentUser.uid);
}

function getOrderedChatConversations() {
    return [...chatConversations].sort((a, b) =>
        getChatTimestampValue(b.updatedAt) - getChatTimestampValue(a.updatedAt)
    );
}

function hasExistingConversationWith(friendUid) {
    const conversationId = getChatConversationId(currentUser.uid, friendUid);
    return chatConversations.some(conversation => conversation.id === conversationId);
}

function canUseChatWith(friendUid) {
    if (!currentUser || !friendUid) return false;
    if (friendUid === currentUser.uid) return false;

    return window.canMessageUser
        ? window.canMessageUser(friendUid)
        : ((window.amigos || []).includes(friendUid) || hasExistingConversationWith(friendUid));
}

function getChatConversationById(conversationId) {
    return chatConversations.find(conversation => conversation.id === conversationId) || null;
}

function getChatReadState(conversation, uid) {
    if (!conversation || !conversation.readState) return {};
    return conversation.readState[uid || (currentUser && currentUser.uid)] || {};
}

function getChatLastMessageValue(conversation) {
    if (!conversation) return 0;
    return getChatTimestampValue(conversation.lastMessageAt || conversation.updatedAt);
}

function isConversationUnread(conversation) {
    if (!currentUser || !conversation) return false;
    if (!conversation.lastMessageSender || conversation.lastMessageSender === currentUser.uid) return false;

    const readState = getChatReadState(conversation, currentUser.uid);
    const lastReadMessageId = readState.lastReadMessageId || "";
    const lastMessageId = conversation.lastMessageId || "";
    if (lastMessageId && lastReadMessageId && lastReadMessageId === lastMessageId) {
        return false;
    }

    const lastMessageValue = getChatLastMessageValue(conversation);
    const lastReadValue = getChatTimestampValue(readState.lastReadAt);

    if (lastMessageValue && lastReadValue) {
        return lastMessageValue > lastReadValue;
    }

    return !!(conversation.lastMessageText || "").trim();
}

function getChatPeerReadState(conversation) {
    const peerUid = getChatPeerUid(conversation);
    return peerUid ? getChatReadState(conversation, peerUid) : {};
}

function isChatMiniThreadVisible() {
    return chatMiniOpen && chatMiniMode === "thread";
}

function isSelectedConversationVisible() {
    return isChatModalOpen() || isChatMiniThreadVisible();
}

function getChatUnreadCount() {
    if (!currentUser) return 0;
    return chatConversations.filter(isConversationUnread).length;
}

function renderChatUnreadBadges() {
    const unreadCount = getChatUnreadCount();
    const badgeIds = ['chatNavBadge', 'chatNavBadgeMobile', 'chatMiniUnreadBadge', 'chatMiniPanelBadge'];

    badgeIds.forEach(id => {
        const badge = document.getElementById(id);
        if (!badge) return;
        badge.innerText = unreadCount;
        badge.style.display = unreadCount > 0 ? 'inline-flex' : 'none';
    });
}

function buildChatConversationMarkup(conversation, options = {}) {
    const peerUid = getChatPeerUid(conversation);
    const profile = getChatFriendProfile(peerUid);
    const previewPrefix = conversation.lastMessageSender === currentUser.uid ? 'Tu: ' : '';
    const previewText = `${previewPrefix}${conversation.lastMessageText || 'Sin mensajes todavía.'}`;
    const updatedLabel = formatChatTimestamp(conversation.lastMessageAt || conversation.updatedAt);
    const isActive = chatSelectedConversationId === conversation.id;
    const isUnread = isConversationUnread(conversation);

    if (options.compact) {
        return `
            <button type="button" class="chat-mini-item ${isUnread ? 'unread' : ''}"
                onclick="openChatMiniConversation('${peerUid}', event)">
                <img src="${escapeChatHtml(getChatAvatarUrl(profile))}" alt="${escapeChatHtml(profile.nombre)}"
                    onerror="${getChatAvatarOnError(profile)}"
                    class="chat-mini-item-avatar">
                <div class="chat-mini-item-content">
                    <div class="chat-mini-item-title">
                        <strong>${escapeChatHtml(profile.nombre)}</strong>
                        <span>${escapeChatHtml(updatedLabel)}</span>
                    </div>
                    <p>${escapeChatHtml(previewText)}</p>
                </div>
                ${isUnread ? '<span class="chat-mini-item-dot"></span>' : ''}
            </button>
        `;
    }

    return `
        <button type="button" class="chat-list-item ${isActive ? 'active' : ''} ${isUnread ? 'unread' : ''}"
            onclick="openChatWithUser('${peerUid}')">
            <img src="${escapeChatHtml(getChatAvatarUrl(profile))}" alt="${escapeChatHtml(profile.nombre)}"
                onerror="${getChatAvatarOnError(profile)}"
                class="chat-user-avatar">
            <div class="chat-list-item-meta">
                <div class="chat-list-item-title">
                    <h4>${escapeChatHtml(profile.nombre)}</h4>
                    <span>${escapeChatHtml(updatedLabel)}</span>
                </div>
                <p class="chat-list-preview">${escapeChatHtml(previewText)}</p>
            </div>
            ${isUnread ? '<span class="chat-status-pill">Nuevo</span>' : ''}
        </button>
    `;
}

function renderChatConversationList() {
    const container = document.getElementById('chatConversationList');
    const count = document.getElementById('chatConversationCount');
    renderChatUnreadBadges();
    if (!container) return;

    if (!currentUser) {
        container.innerHTML = '<div class="chat-empty-mini">Inicia sesión para ver tus conversaciones.</div>';
        if (count) count.innerText = '0 chats';
        return;
    }

    const orderedConversations = getOrderedChatConversations();
    const normalizedQuery = chatSearchTerm.trim().toLowerCase();
    const filteredConversations = orderedConversations.filter(conversation => {
        if (!normalizedQuery) return true;

        const peerUid = getChatPeerUid(conversation);
        const profile = getChatFriendProfile(peerUid);
        const searchableText = [
            profile.nombre || "",
            profile.puesto || "",
            conversation.lastMessageText || ""
        ].join(" ").toLowerCase();

        return searchableText.includes(normalizedQuery);
    });

    if (count) {
        count.innerText = `${filteredConversations.length} chat${filteredConversations.length === 1 ? '' : 's'}`;
    }

    if (orderedConversations.length === 0) {
        container.innerHTML = '<div class="chat-empty-mini">Todavía no tienes conversaciones. Escribe a alguien desde su perfil para iniciar una.</div>';
        return;
    }

    if (filteredConversations.length === 0) {
        container.innerHTML = '<div class="chat-empty-mini">No hay conversaciones que coincidan con tu búsqueda.</div>';
        return;
    }

    container.innerHTML = filteredConversations.map(conversation => buildChatConversationMarkup(conversation)).join('');
}

function renderChatMiniDock() {
    const dock = document.getElementById('chatMiniDock');
    const avatarStack = document.getElementById('chatMiniAvatarStack');
    const list = document.getElementById('chatMiniConversationList');
    const launcher = document.getElementById('chatMiniLauncher');
    const panel = document.getElementById('chatMiniPanel');
    const inboxView = document.getElementById('chatMiniInboxView');
    const threadView = document.getElementById('chatMiniThreadView');

    if (!dock || !avatarStack || !list || !launcher || !panel || !inboxView || !threadView) return;

    const shouldHide = !shouldUseChatMiniDock();
    dock.style.display = shouldHide ? 'none' : 'flex';
    if (shouldHide) {
        chatMiniOpen = false;
        chatMiniMode = "inbox";
        return;
    }

    const orderedConversations = getOrderedChatConversations();
    renderChatUnreadBadges();

    avatarStack.innerHTML = orderedConversations.slice(0, 3).map(conversation => {
        const peerUid = getChatPeerUid(conversation);
        const profile = getChatFriendProfile(peerUid);
        return `
            <img src="${escapeChatHtml(getChatAvatarUrl(profile))}" alt="${escapeChatHtml(profile.nombre)}"
                onerror="${getChatAvatarOnError(profile)}"
                class="chat-mini-stack-avatar">
        `;
    }).join('');

    launcher.classList.toggle('has-conversations', orderedConversations.length > 0);
    dock.classList.toggle('open', chatMiniOpen);
    panel.style.display = chatMiniOpen ? 'flex' : 'none';
    inboxView.style.display = chatMiniMode === 'inbox' ? 'flex' : 'none';
    threadView.style.display = chatMiniMode === 'thread' ? 'flex' : 'none';

    if (orderedConversations.length === 0) {
        list.innerHTML = '<div class="chat-empty-mini">Todavía no tienes conversaciones.</div>';
        return;
    }

    list.innerHTML = orderedConversations
        .slice(0, 6)
        .map(conversation => buildChatConversationMarkup(conversation, { compact: true }))
        .join('');
}

function toggleChatMiniInbox(event) {
    if (!currentUser) return;
    stopChatMiniEvent(event);
    closeChatEmojiPickers();

    chatMiniOpen = !chatMiniOpen;
    if (chatMiniOpen) {
        chatMiniMode = "inbox";
    }
    renderChatMiniDock();
}

function maybeCleanupChatMessagesListener() {
    if (!isChatModalOpen() && !isChatMiniThreadVisible()) {
        cleanupChatMessagesListener();
        chatCurrentMessages = [];
    }
}

function closeChatMiniInbox() {
    chatMiniOpen = false;
    chatMiniMode = "inbox";
    closeChatEmojiPickers();
    maybeCleanupChatMessagesListener();
    renderChatMiniDock();
}

function openChatMiniInbox(event) {
    if (!currentUser) return;
    stopChatMiniEvent(event);
    closeChatEmojiPickers();

    chatMiniOpen = true;
    chatMiniMode = "inbox";
    renderChatMiniDock();
}

async function openChatEntryPoint(friendUid, event) {
    stopChatMiniEvent(event);

    if (shouldUseChatMiniDock()) {
        if (friendUid) {
            await openChatMiniConversation(friendUid);
        } else {
            openChatMiniInbox();
        }

        if (window.setActiveNav) window.setActiveNav('messages');
        return;
    }

    await openChatModal(friendUid || null, {
        autoSelectLatest: !friendUid
    });
}

async function expandChatFromMini(friendUid, event) {
    stopChatMiniEvent(event);
    closeChatMiniInbox();
    await openChatModal(friendUid || null, {
        autoSelectLatest: false
    });
}

function backToChatMiniInbox(event) {
    stopChatMiniEvent(event);
    chatMiniMode = "inbox";
    closeChatEmojiPickers();
    maybeCleanupChatMessagesListener();
    renderChatMiniDock();
}

function backToChatConversationList(event) {
    const now = Date.now();
    if (now - chatLastMobileBackActionAt < 250) {
        stopChatMiniEvent(event);
        return;
    }
    chatLastMobileBackActionAt = now;

    stopChatMiniEvent(event);
    closeChatEmojiPickers();
    blurActiveChatElement();
    chatSelectedFriendUid = null;
    chatSelectedConversationId = null;
    cleanupChatMessagesListener();
    suppressMobileChatConversationOpen(900);
    setChatMobileView('list');
    temporarilyDisableMobileConversationListTouches(650);
    renderChatConversationList();
}

function handleChatMobileBackButton(event) {
    const now = Date.now();
    if (now - chatLastMobileBackTriggerAt < 400) {
        stopChatMiniEvent(event);
        return;
    }

    chatLastMobileBackTriggerAt = now;
    if (event && event.type === 'touchstart' && typeof event.preventDefault === 'function') {
        event.preventDefault();
    }

    backToChatConversationList(event);
}

function bindChatMobileBackButton() {
    const button = document.getElementById('chatMobileBackBtn');
    if (!button || button.dataset.bound === 'true') return;

    button.dataset.bound = 'true';
    button.addEventListener('touchstart', handleChatMobileBackButton, { passive: false });
    button.addEventListener('click', handleChatMobileBackButton);
}

function updateChatMiniHeader(friendUid) {
    const profile = getChatFriendProfile(friendUid);
    const avatar = document.getElementById('chatMiniThreadAvatar');
    const name = document.getElementById('chatMiniThreadName');
    const meta = document.getElementById('chatMiniThreadMeta');

    if (avatar) {
        avatar.onerror = function () {
            this.onerror = null;
            this.src = getChatAvatarFallback(profile);
        };
        avatar.src = getChatAvatarUrl(profile);
    }
    if (name) name.innerText = profile.nombre || "Usuario";
    if (meta) meta.innerText = profile.puesto || "Miembro de BitBond";
}

function resetChatMiniThread() {
    const messages = document.getElementById('chatMiniMessages');
    const input = document.getElementById('chatMiniMessageInput');
    closeChatEmojiPickers();
    chatCurrentMessages = [];
    if (messages) messages.innerHTML = '<div class="chat-empty-mini">Todavía no hay mensajes.</div>';
    if (input) input.value = '';
    setChatMobileView('list');
}

function resetChatView() {
    const emptyState = document.getElementById('chatEmptyState');
    const conversationView = document.getElementById('chatConversationView');
    const messages = document.getElementById('chatMessages');
    const input = document.getElementById('chatMessageInput');

    closeChatEmojiPickers();
    chatCurrentMessages = [];
    if (emptyState) emptyState.style.display = 'flex';
    if (conversationView) conversationView.style.display = 'none';
    if (messages) messages.innerHTML = '<div class="chat-empty-mini">Todavía no hay mensajes.</div>';
    if (input) input.value = '';
}

function scrollChatToBottom() {
    const messages = document.getElementById('chatMessages');
    if (!messages) return;
    messages.scrollTop = messages.scrollHeight;
}

function getLatestChatMessage(messages) {
    if (!Array.isArray(messages) || messages.length === 0) return null;
    return messages[messages.length - 1];
}

function getLastSentMessageIndex(messages) {
    if (!Array.isArray(messages)) return -1;

    for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (messages[index] && messages[index].senderId === (currentUser && currentUser.uid)) {
            return index;
        }
    }

    return -1;
}

function getChatMessageDeliveryStatus(message, conversation) {
    if (!currentUser || !message || message.senderId !== currentUser.uid) return "";

    const createdAtValue = getChatTimestampValue(message.createdAt);
    if (!createdAtValue) {
        return "Enviando";
    }

    const peerReadState = getChatPeerReadState(conversation);
    if (!peerReadState) return "Enviado";

    if (peerReadState.lastReadMessageId && peerReadState.lastReadMessageId === message.id) {
        return "Visto";
    }

    const peerReadValue = getChatTimestampValue(peerReadState.lastReadAt);
    if (peerReadValue && peerReadValue >= createdAtValue) {
        return "Visto";
    }

    return "Enviado";
}

function buildChatMessagesMarkup(messages, options = {}) {
    if (!messages || messages.length === 0) {
        return '<div class="chat-empty-mini">Rompe el hielo y envía el primer mensaje.</div>';
    }

    const conversation = options.conversation || getChatConversationById(chatSelectedConversationId);
    const lastSentMessageIndex = getLastSentMessageIndex(messages);

    return messages.map((message, index) => {
        const isMine = message.senderId === currentUser.uid;
        const timeLabel = formatChatTimestamp(message.createdAt);
        const statusLabel = isMine && index === lastSentMessageIndex
            ? getChatMessageDeliveryStatus(message, conversation)
            : "";
        const metaLabel = [timeLabel, statusLabel].filter(Boolean).join(' · ');

        return `
            <div class="${options.compact ? 'chat-mini-message-row' : 'chat-message-row'} ${isMine ? 'sent' : 'received'}">
                <div class="${options.compact ? 'chat-mini-bubble' : 'chat-bubble'} ${isMine ? 'sent' : 'received'}">
                    <p>${escapeChatHtml(message.text)}</p>
                    <span class="${options.compact ? 'chat-mini-message-time' : 'chat-message-time'} ${statusLabel === 'Visto' ? 'is-seen' : ''}">${escapeChatHtml(metaLabel)}</span>
                </div>
            </div>
        `;
    }).join('');
}

function renderChatMessages(messages) {
    const container = document.getElementById('chatMessages');
    const miniContainer = document.getElementById('chatMiniMessages');
    const conversation = getChatConversationById(chatSelectedConversationId);
    chatCurrentMessages = Array.isArray(messages) ? messages : [];

    if (container) {
        container.innerHTML = buildChatMessagesMarkup(messages, { conversation: conversation });
    }
    if (miniContainer) {
        miniContainer.innerHTML = buildChatMessagesMarkup(messages, { compact: true, conversation: conversation });
    }

    scrollChatToBottom();
    const miniMessages = document.getElementById('chatMiniMessages');
    if (miniMessages) miniMessages.scrollTop = miniMessages.scrollHeight;
}

function updateConversationReadStateLocally(conversationId, lastReadMessageId, lastReadAt) {
    const conversation = getChatConversationById(conversationId);
    if (!conversation || !currentUser) return;

    if (!conversation.readState) {
        conversation.readState = {};
    }

    conversation.readState[currentUser.uid] = {
        ...(conversation.readState[currentUser.uid] || {}),
        lastReadMessageId: lastReadMessageId || conversation.lastMessageId || "",
        lastReadAt: lastReadAt || new Date()
    };

    renderChatConversationList();
    renderChatMiniDock();
    renderChatMessages(chatCurrentMessages);
}

async function markConversationAsRead(conversationId, latestMessage) {
    if (!currentUser || !conversationId || !isSelectedConversationVisible()) return;

    const conversation = getChatConversationById(conversationId);
    if (!conversation || !isConversationUnread(conversation)) return;

    const latestMessageId = (latestMessage && latestMessage.id) || conversation.lastMessageId || "";
    const nextReceiptKey = `${conversationId}:${latestMessageId}`;
    if (chatLastReadReceiptKey === nextReceiptKey) return;

    chatLastReadReceiptKey = nextReceiptKey;
    updateConversationReadStateLocally(conversationId, latestMessageId, new Date());

    try {
        await db.collection("conversations").doc(conversationId).set({
            readState: {
                [currentUser.uid]: {
                    lastReadAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastReadMessageId: latestMessageId
                }
            }
        }, { merge: true });
    } catch (error) {
        chatLastReadReceiptKey = "";
        console.error("Error al marcar conversación como leída:", error);
    }
}

function updateChatHeader(friendUid) {
    const profile = getChatFriendProfile(friendUid);
    const avatar = document.getElementById('chatHeaderAvatar');
    const name = document.getElementById('chatHeaderName');
    const meta = document.getElementById('chatHeaderMeta');
    const emptyState = document.getElementById('chatEmptyState');
    const conversationView = document.getElementById('chatConversationView');

    if (avatar) {
        avatar.onerror = function () {
            this.onerror = null;
            this.src = getChatAvatarFallback(profile);
        };
        avatar.src = getChatAvatarUrl(profile);
    }
    if (name) name.innerText = profile.nombre || "Usuario";
    if (meta) meta.innerText = profile.puesto || "Miembro de BitBond";
    if (emptyState) emptyState.style.display = 'none';
    if (conversationView) conversationView.style.display = 'flex';
}

function cleanupChatMessagesListener() {
    if (chatMessagesUnsubscribe) {
        chatMessagesUnsubscribe();
        chatMessagesUnsubscribe = null;
    }
    chatLastReadReceiptKey = "";
}

async function subscribeToChatMessages(conversationId) {
    cleanupChatMessagesListener();

    chatMessagesUnsubscribe = db.collection("conversations")
        .doc(conversationId)
        .collection("messages")
        .orderBy("createdAt")
        .onSnapshot(snapshot => {
            const messages = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            renderChatMessages(messages);
            if (conversationId === chatSelectedConversationId) {
                markConversationAsRead(conversationId, getLatestChatMessage(messages));
            }
        }, error => {
            console.error("Error al escuchar mensajes:", error);
        });
}

async function openChatWithUser(friendUid) {
    if (!currentUser || !friendUid) return;
    if (isMobileChatConversationOpenSuppressed()) return;

    if (friendUid === currentUser.uid) {
        return;
    }

    if (!canUseChatWith(friendUid)) {
        alert("No se pudo abrir el chat con este usuario.");
        return;
    }

    await getChatUsersByIds([friendUid]);

    chatSelectedFriendUid = friendUid;
    chatSelectedConversationId = getChatConversationId(currentUser.uid, friendUid);
    closeChatEmojiPickers();

    updateChatHeader(friendUid);
    renderChatConversationList();
    setChatMobileView('thread');
    await subscribeToChatMessages(chatSelectedConversationId);

    const input = document.getElementById('chatMessageInput');
    if (input) input.focus();
}

async function openChatMiniConversation(friendUid, event) {
    stopChatMiniEvent(event);
    if (!currentUser || !friendUid) return;
    if (!canUseChatWith(friendUid)) return;

    await getChatUsersByIds([friendUid]);

    chatSelectedFriendUid = friendUid;
    chatSelectedConversationId = getChatConversationId(currentUser.uid, friendUid);
    chatMiniOpen = true;
    chatMiniMode = "thread";
    closeChatEmojiPickers();

    updateChatMiniHeader(friendUid);
    renderChatMiniDock();
    await subscribeToChatMessages(chatSelectedConversationId);

    const input = document.getElementById('chatMiniMessageInput');
    if (input) input.focus();
}

function cleanupConversationListener() {
    if (chatConversationUnsubscribe) {
        chatConversationUnsubscribe();
        chatConversationUnsubscribe = null;
    }
}

function subscribeToChatConversations() {
    cleanupConversationListener();

    if (!currentUser) return;

    chatConversationUnsubscribe = db.collection("conversations")
        .where("participants", "array-contains", currentUser.uid)
        .onSnapshot(async snapshot => {
            chatConversations = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            const peerIds = chatConversations
                .map(conversation => getChatPeerUid(conversation))
                .filter(Boolean);

            await getChatUsersByIds(peerIds);
            syncChatUserProfileListeners(peerIds);
            renderChatConversationList();
            renderChatMiniDock();
            if (window.renderQuickStats) window.renderQuickStats();
            if (window.renderActivityFeed) window.renderActivityFeed();

            if (!shouldUseMobileChatFlow() && !chatSelectedFriendUid && chatConversations.length > 0 && isChatModalOpen()) {
                const latestConversation = getOrderedChatConversations()[0];
                const peerUid = getChatPeerUid(latestConversation);
                if (peerUid) openChatWithUser(peerUid);
            }
        }, error => {
            console.error("Error al escuchar conversaciones:", error);
        });
}

function isChatModalOpen() {
    const modal = document.getElementById('chatModal');
    return !!modal && modal.style.display === 'flex';
}

async function openChatModal(friendUid, options = {}) {
    const modal = document.getElementById('chatModal');
    const dock = document.getElementById('chatMiniDock');
    const searchInput = document.getElementById('chatSearchInput');
    const autoSelectLatest = options.autoSelectLatest !== undefined ? options.autoSelectLatest : !friendUid;
    const shouldAutoSelectLatest = shouldUseMobileChatFlow() ? !!friendUid : autoSelectLatest;
    if (!modal) return;

    closeChatMiniInbox();
    closeChatEmojiPickers();
    if (dock) dock.style.display = 'none';

    if (!friendUid && !autoSelectLatest) {
        chatSelectedFriendUid = null;
        chatSelectedConversationId = null;
        cleanupChatMessagesListener();
    }

    modal.style.display = 'flex';
    if (window.setActiveNav) window.setActiveNav('messages');
    renderChatConversationList();
    setChatMobileView(friendUid ? 'thread' : 'list');
    syncChatScrollLock();
    if (searchInput) searchInput.focus();

    if (friendUid) {
        await openChatWithUser(friendUid);
        return;
    }

    if (shouldAutoSelectLatest && chatConversations.length > 0) {
        const latestConversation = getOrderedChatConversations()[0];
        const peerUid = latestConversation ? getChatPeerUid(latestConversation) : null;
        if (peerUid) {
            await openChatWithUser(peerUid);
            return;
        }
    }

    if (!chatSelectedFriendUid) {
        resetChatView();
    }
}

function closeChatModal() {
    const modal = document.getElementById('chatModal');
    if (modal) modal.style.display = 'none';

    chatSelectedFriendUid = null;
    chatSelectedConversationId = null;
    chatSearchTerm = "";
    closeChatEmojiPickers();
    cleanupChatMessagesListener();
    resetChatView();
    setChatMobileView('list');
    renderChatConversationList();
    if (window.setActiveNav) window.setActiveNav(window.resolveAppSection ? window.resolveAppSection() : 'home');

    const searchInput = document.getElementById('chatSearchInput');
    if (searchInput) searchInput.value = '';
    syncChatScrollLock();
    renderChatMiniDock();
}

async function persistChatMessage(friendUid, text) {
    const conversationId = getChatConversationId(currentUser.uid, friendUid);
    const conversationRef = db.collection("conversations").doc(conversationId);
    const messageRef = conversationRef.collection("messages").doc();
    const previewText = text.length > 110 ? text.slice(0, 107) + "..." : text;
    const participants = [currentUser.uid, friendUid].sort();
    const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();

    const conversationSnapshot = await conversationRef.get().catch(() => null);
    const conversationPayload = {
        participants: participants,
        updatedAt: serverTimestamp,
        lastMessageText: previewText,
        lastMessageSender: currentUser.uid,
        lastMessageId: messageRef.id,
        lastMessageAt: serverTimestamp,
        readState: {
            [currentUser.uid]: {
                lastReadAt: serverTimestamp,
                lastReadMessageId: messageRef.id
            }
        }
    };

    if (!conversationSnapshot || !conversationSnapshot.exists) {
        await conversationRef.set({
            participants: participants,
            createdAt: serverTimestamp,
            updatedAt: serverTimestamp,
            lastMessageText: previewText,
            lastMessageSender: currentUser.uid,
            lastMessageAt: serverTimestamp,
            readState: {
                [currentUser.uid]: {
                    lastReadAt: serverTimestamp,
                    lastReadMessageId: messageRef.id
                }
            }
        }, { merge: true });
    }

    await messageRef.set({
        senderId: currentUser.uid,
        text: text,
        createdAt: serverTimestamp
    });

    await conversationRef.set(conversationPayload, { merge: true });
}

async function sendChatMiniMessage(event) {
    if (event) event.preventDefault();

    if (!currentUser || !chatSelectedFriendUid) return;
    if (!canUseChatWith(chatSelectedFriendUid)) return;

    const input = document.getElementById('chatMiniMessageInput');
    const text = input ? input.value.trim() : "";
    if (!text) return;

    try {
        await persistChatMessage(chatSelectedFriendUid, text);
        if (input) input.value = '';
        closeChatEmojiPickers();
    } catch (error) {
        console.error("Error al enviar mensaje mini:", error);
    }
}

function handleChatInputKeydown(event) {
    if (!event) return;

    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendChatMessage();
    }
}

async function sendChatMessage(event) {
    if (event) event.preventDefault();

    if (!currentUser || !chatSelectedFriendUid) return;
    if (!canUseChatWith(chatSelectedFriendUid)) {
        alert("Ese usuario ya no esta disponible para chatear.");
        return;
    }

    const input = document.getElementById('chatMessageInput');
    const text = input ? input.value.trim() : "";
    if (!text) return;

    try {
        await persistChatMessage(chatSelectedFriendUid, text);
        if (input) input.value = '';
        closeChatEmojiPickers();
        scrollChatToBottom();
    } catch (error) {
        console.error("Error al enviar mensaje:", error);
        alert("No se pudo enviar el mensaje. Revisa las reglas de Firestore y vuelve a intentarlo.");
    }
}

function handleChatSearchInput(value) {
    chatSearchTerm = String(value || "");
    renderChatConversationList();
}

function getChatEmojiPickerElement(mode) {
    return document.getElementById(mode === 'mini' ? 'chatEmojiPickerMini' : 'chatEmojiPickerMain');
}

function getChatInputElement(mode) {
    return document.getElementById(mode === 'mini' ? 'chatMiniMessageInput' : 'chatMessageInput');
}

function buildChatEmojiPickerMarkup(mode) {
    return CHAT_EMOJI_OPTIONS.map(emoji => `
        <button type="button" class="chat-emoji-option" data-emoji="${emoji}"
            onclick="insertChatEmoji('${mode}', this.dataset.emoji, event)">${emoji}</button>
    `).join('');
}

function ensureChatEmojiPickersRendered() {
    ['main', 'mini'].forEach(mode => {
        const picker = getChatEmojiPickerElement(mode);
        if (!picker || picker.dataset.ready === 'true') return;
        picker.innerHTML = buildChatEmojiPickerMarkup(mode);
        picker.dataset.ready = 'true';
    });
}

function closeChatEmojiPickers(exceptMode) {
    ['main', 'mini'].forEach(mode => {
        if (exceptMode && exceptMode === mode) return;
        const picker = getChatEmojiPickerElement(mode);
        if (picker) picker.style.display = 'none';
    });
}

function toggleChatEmojiPicker(mode, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    ensureChatEmojiPickersRendered();
    const picker = getChatEmojiPickerElement(mode);
    if (!picker) return;

    const shouldOpen = picker.style.display !== 'grid';
    closeChatEmojiPickers(mode);
    picker.style.display = shouldOpen ? 'grid' : 'none';
}

function insertTextIntoInput(input, text) {
    if (!input) return;

    const start = input.selectionStart || input.value.length;
    const end = input.selectionEnd || input.value.length;
    const nextValue = `${input.value.slice(0, start)}${text}${input.value.slice(end)}`;
    input.value = nextValue;
    input.focus();

    const nextCaret = start + text.length;
    if (typeof input.setSelectionRange === 'function') {
        input.setSelectionRange(nextCaret, nextCaret);
    }
}

function insertChatEmoji(mode, emoji, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const input = getChatInputElement(mode);
    insertTextIntoInput(input, emoji);
    closeChatEmojiPickers();
}

function handleGlobalOverlayClick(event) {
    if (event.target && event.target.id === 'chatModal') {
        closeChatModal();
        return;
    }

    if (!(event.target && event.target.closest && event.target.closest('.chat-emoji-shell'))) {
        closeChatEmojiPickers();
    }

    if (chatMiniOpen && !isClickInsideChatMiniDock(event)) {
        closeChatMiniInbox();
    }
}

if (auth) {
    auth.onAuthStateChanged(user => {
        currentUser = user || null;
        cleanupConversationListener();
        cleanupChatMessagesListener();
        cleanupChatUserProfileListeners();

        if (user) {
            subscribeToChatConversations();
            renderChatMiniDock();
        } else {
            chatConversations = [];
            chatUserCache = {};
            chatSelectedFriendUid = null;
            chatSelectedConversationId = null;
            chatSearchTerm = "";
            chatMiniMode = "inbox";
            closeChatMiniInbox();
            resetChatView();
            resetChatMiniThread();
            renderChatConversationList();
            renderChatMiniDock();
        }
    });
}

window.addEventListener('resize', () => {
    renderChatMiniDock();
    if (window.innerWidth <= 1024) {
        closeChatMiniInbox();
    }

    if (isChatModalOpen()) {
        setChatMobileView(chatSelectedFriendUid ? 'thread' : 'list');
    }
    syncChatScrollLock();
});

ensureChatEmojiPickersRendered();
bindChatMobileBackButton();

window.openChatModal = openChatModal;
window.closeChatModal = closeChatModal;
window.cleanupChatMessagesListener = cleanupChatMessagesListener;
window.openChatWithUser = openChatWithUser;
window.sendChatMessage = sendChatMessage;
window.handleChatInputKeydown = handleChatInputKeydown;
window.handleChatSearchInput = handleChatSearchInput;
window.handleGlobalOverlayClick = handleGlobalOverlayClick;
window.toggleChatMiniInbox = toggleChatMiniInbox;
window.closeChatMiniInbox = closeChatMiniInbox;
window.openChatMiniInbox = openChatMiniInbox;
window.openChatEntryPoint = openChatEntryPoint;
window.expandChatFromMini = expandChatFromMini;
window.openChatMiniConversation = openChatMiniConversation;
window.backToChatMiniInbox = backToChatMiniInbox;
window.backToChatConversationList = backToChatConversationList;
window.sendChatMiniMessage = sendChatMiniMessage;
window.toggleChatEmojiPicker = toggleChatEmojiPicker;
window.insertChatEmoji = insertChatEmoji;
window.getOrderedChatConversations = getOrderedChatConversations;
window.getChatFriendProfile = getChatFriendProfile;
window.getChatPeerUid = getChatPeerUid;
window.getChatUnreadCount = getChatUnreadCount;
window.renderChatConversationList = renderChatConversationList;
window.renderChatMiniDock = renderChatMiniDock;
window.hasExistingConversationWith = hasExistingConversationWith;
