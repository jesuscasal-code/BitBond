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
var chatUnreadMessageCountByConversation = {};
var chatLastReadReceiptKey = "";
var chatSuppressConversationOpenUntil = 0;
var chatLastMobileBackActionAt = 0;
var chatLastMobileBackTriggerAt = 0;
var chatConversationListTouchResetTimeout = null;
var chatShouldAutoSelectLatest = false;
var chatDateIndicatorHideTimeout = null;
var chatDateIndicatorFrame = null;
var chatMiniDateIndicatorHideTimeout = null;
var chatMiniDateIndicatorFrame = null;
var chatMessagesTouchStartY = 0;
var chatMobileViewportFrame = null;

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

function syncChatMobileViewport() {
    const modal = document.getElementById('chatModal');
    if (!modal) return;

    if (!isChatModalOpen() || !shouldUseMobileChatFlow()) {
        modal.style.removeProperty('--chat-mobile-vh');
        modal.style.removeProperty('--chat-mobile-offset-top');
        modal.style.removeProperty('--chat-mobile-keyboard-inset');
        return;
    }

    const viewport = window.visualViewport;
    const viewportHeight = viewport ? viewport.height : window.innerHeight;
    const viewportOffsetTop = viewport ? viewport.offsetTop : 0;

    modal.style.setProperty('--chat-mobile-vh', `${Math.round(viewportHeight)}px`);
    modal.style.setProperty('--chat-mobile-offset-top', `${Math.max(0, Math.round(viewportOffsetTop))}px`);
    modal.style.setProperty('--chat-mobile-keyboard-inset', '0px');
}

function syncChatMobileLayoutMetrics() {
    const modal = document.getElementById('chatModal');
    if (!modal) return;

    if (!isChatModalOpen() || !shouldUseMobileChatFlow()) {
        modal.style.removeProperty('--chat-mobile-header-height');
        modal.style.removeProperty('--chat-mobile-composer-height');
        return;
    }

    const header = document.querySelector('#chatConversationView .chat-conversation-header');
    const composer = document.querySelector('#chatConversationView .chat-composer');

    if (header) modal.style.setProperty('--chat-mobile-header-height', `${Math.round(header.offsetHeight)}px`);
    if (composer) modal.style.setProperty('--chat-mobile-composer-height', `${Math.round(composer.offsetHeight)}px`);
}

function ensureLatestChatMessageVisible() {
    if (!shouldUseMobileChatFlow()) return;

    const container = document.getElementById('chatMessages');
    if (!container) return;

    requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
    });
}

function settleLatestChatMessageVisible(delayMs = 0) {
    setTimeout(() => {
        syncChatMobileViewport();
        syncChatMobileLayoutMetrics();
        ensureLatestChatMessageVisible();
    }, Math.max(0, delayMs || 0));
}

function bindChatMobileInputVisibility() {
    const input = document.getElementById('chatMessageInput');
    if (!input || input.dataset.mobileVisibilityBound === 'true') return;

    input.dataset.mobileVisibilityBound = 'true';
    input.addEventListener('focus', () => {
        settleLatestChatMessageVisible(40);
        settleLatestChatMessageVisible(180);
    });
}

function bindChatMobileComposerFocus() {
    const composer = document.querySelector('#chatConversationView .chat-composer');
    const input = document.getElementById('chatMessageInput');
    if (!composer || !input || composer.dataset.mobileFocusBound === 'true') return;

    composer.dataset.mobileFocusBound = 'true';
    composer.addEventListener('pointerdown', event => {
        if (!shouldUseMobileChatFlow()) return;
        if (!(event.target && event.target.closest && event.target.closest('button[type="submit"]'))) return;

        event.preventDefault();
        input.focus({ preventScroll: true });
        sendChatMessage(event);
    });
}

function clearChatInputValue(input) {
    if (!input) return;

    input.value = '';
    input.defaultValue = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

function bindChatMobileMessagesOverscrollGuard() {
    const container = document.getElementById('chatMessages');
    if (!container || container.dataset.mobileOverscrollBound === 'true') return;

    container.dataset.mobileOverscrollBound = 'true';

    container.addEventListener('touchstart', event => {
        if (!shouldUseMobileChatFlow()) return;
        const touch = event.touches && event.touches[0];
        chatMessagesTouchStartY = touch ? touch.clientY : 0;
    }, { passive: true });

    container.addEventListener('touchmove', event => {
        if (!shouldUseMobileChatFlow()) return;
        const touch = event.touches && event.touches[0];
        if (!touch) return;

        const currentY = touch.clientY;
        const deltaY = currentY - chatMessagesTouchStartY;
        const scrollTop = container.scrollTop;
        const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
        const isAtTop = scrollTop <= 0;
        const isAtBottom = scrollTop >= maxScrollTop - 1;
        const hasScrollableContent = container.scrollHeight > container.clientHeight + 1;

        if (!hasScrollableContent || (isAtTop && deltaY > 0) || (isAtBottom && deltaY < 0)) {
            event.preventDefault();
        }
    }, { passive: false });
}

function syncChatMobileKeyboardLayout() {
    if (chatMobileViewportFrame) {
        cancelAnimationFrame(chatMobileViewportFrame);
    }

    chatMobileViewportFrame = requestAnimationFrame(() => {
        chatMobileViewportFrame = null;
        syncChatMobileViewport();
        syncChatMobileLayoutMetrics();
        ensureLatestChatMessageVisible();
    });
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

function formatChatMessageTime(timestamp) {
    const value = getChatTimestampValue(timestamp);
    if (!value) return "";

    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatChatTimestamp(timestamp) {
    const value = getChatTimestampValue(timestamp);
    if (!value) return "";

    const date = new Date(value);
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    const timeLabel = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (sameDay) {
        return timeLabel;
    }

    return `${date.toLocaleDateString([], { day: '2-digit', month: '2-digit' })} ${timeLabel}`;
}

function capitalizeChatLabel(value) {
    if (!value) return "";
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatChatScrollDateLabel(timestamp) {
    const value = getChatTimestampValue(timestamp);
    if (!value) return "";

    const date = new Date(value);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((today.getTime() - targetDay.getTime()) / 86400000);

    if (diffDays <= 0) return "Hoy";
    if (diffDays === 1) return "Ayer";
    if (diffDays < 7) {
        return capitalizeChatLabel(date.toLocaleDateString('es-ES', { weekday: 'long' }));
    }

    return date.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit'
    });
}

function getChatDayKey(timestamp) {
    const value = getChatTimestampValue(timestamp);
    if (!value) return "";

    const date = new Date(value);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function getChatDeliveryStatusClass(statusLabel) {
    if (statusLabel === 'Visto') return 'is-seen';
    if (statusLabel === 'Enviado') return 'is-sent';
    if (statusLabel === 'Enviando') return 'is-pending';
    return '';
}

function getChatDeliveryIconMarkup(statusLabel) {
    const statusClass = getChatDeliveryStatusClass(statusLabel);
    if (!statusClass) return '';

    const pathMarkup = statusLabel === 'Enviando'
        ? '<path d="M7 12.5 10.1 15.6 17 8.7"></path>'
        : '<path d="M4.5 12.5 7.6 15.6 14.5 8.7"></path><path d="M10 12.5 13.1 15.6 20 8.7"></path>';

    return `
        <span class="chat-delivery-icon ${statusClass}" aria-label="${escapeChatHtml(statusLabel)}" title="${escapeChatHtml(statusLabel)}">
            <svg viewBox="0 0 24 24" aria-hidden="true">
                ${pathMarkup}
            </svg>
        </span>
    `;
}

function ensureChatDateIndicator() {
    const conversationView = document.getElementById('chatConversationView');
    if (!conversationView) return null;

    let indicator = document.getElementById('chatDateIndicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'chatDateIndicator';
        indicator.className = 'chat-date-indicator';
        conversationView.appendChild(indicator);
    }

    return indicator;
}

function hideChatDateIndicator() {
    const indicator = document.getElementById('chatDateIndicator');
    if (!indicator) return;
    indicator.classList.remove('show');
}

function ensureChatMiniDateIndicator() {
    const threadView = document.getElementById('chatMiniThreadView');
    if (!threadView) return null;

    let indicator = document.getElementById('chatMiniDateIndicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'chatMiniDateIndicator';
        indicator.className = 'chat-mini-date-indicator';
        threadView.appendChild(indicator);
    }

    return indicator;
}

function hideChatMiniDateIndicator() {
    const indicator = document.getElementById('chatMiniDateIndicator');
    if (!indicator) return;
    indicator.classList.remove('show');
}

function getChatElementVisibleRatio(element, container) {
    if (!element || !container) return 0;

    const elementRect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const visibleTop = Math.max(elementRect.top, containerRect.top);
    const visibleBottom = Math.min(elementRect.bottom, containerRect.bottom);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);
    const elementHeight = Math.max(1, elementRect.height);

    return visibleHeight / elementHeight;
}

function isChatElementVisibleInContainer(element, container, threshold = 0) {
    if (!element || !container) return false;

    const elementRect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    return elementRect.bottom > containerRect.top + threshold
        && elementRect.top < containerRect.bottom - threshold;
}

function hasVisibleChatDaySeparator(container) {
    if (!container) return false;

    const separators = container.querySelectorAll('.chat-day-separator');
    return Array.from(separators).some(separator => (
        getChatElementVisibleRatio(separator, container) >= 0.7
    ));
}

function getVisibleChatMessageTimestamp(container) {
    if (!container) return 0;

    const rows = container.querySelectorAll('.chat-message-row[data-message-timestamp]');

    for (const row of rows) {
        if (isChatElementVisibleInContainer(row, container, 8)) {
            return Number(row.dataset.messageTimestamp || 0);
        }
    }

    const lastRow = rows.length > 0 ? rows[rows.length - 1] : null;
    return lastRow ? Number(lastRow.dataset.messageTimestamp || 0) : 0;
}

function hasVisibleChatMiniDaySeparator(container) {
    if (!container) return false;

    const separators = container.querySelectorAll('.chat-mini-day-separator');
    return Array.from(separators).some(separator => (
        getChatElementVisibleRatio(separator, container) >= 0.7
    ));
}

function getVisibleChatMiniMessageTimestamp(container) {
    if (!container) return 0;

    const rows = container.querySelectorAll('.chat-mini-message-row[data-message-timestamp]');

    for (const row of rows) {
        if (isChatElementVisibleInContainer(row, container, 8)) {
            return Number(row.dataset.messageTimestamp || 0);
        }
    }

    const lastRow = rows.length > 0 ? rows[rows.length - 1] : null;
    return lastRow ? Number(lastRow.dataset.messageTimestamp || 0) : 0;
}

function showChatDateIndicator() {
    const container = document.getElementById('chatMessages');
    const indicator = ensureChatDateIndicator();
    if (!container || !indicator) return;

    if (hasVisibleChatDaySeparator(container)) {
        hideChatDateIndicator();
        return;
    }

    const timestampValue = getVisibleChatMessageTimestamp(container);
    const label = formatChatScrollDateLabel(timestampValue);
    if (!label) return;

    indicator.innerText = label;
    const header = document.querySelector('#chatConversationView .chat-conversation-header');
    const headerHeight = header ? header.offsetHeight : 0;
    indicator.style.top = `${headerHeight + 12}px`;
    indicator.classList.add('show');

    if (chatDateIndicatorHideTimeout) {
        clearTimeout(chatDateIndicatorHideTimeout);
    }

    chatDateIndicatorHideTimeout = setTimeout(() => {
        hideChatDateIndicator();
    }, 2200);
}

function bindChatMessagesScrollIndicator() {
    const container = document.getElementById('chatMessages');
    if (!container || container.dataset.dateIndicatorBound === 'true') return;

    container.dataset.dateIndicatorBound = 'true';
    container.addEventListener('scroll', () => {
        if (container.scrollHeight <= container.clientHeight) return;

        if (chatDateIndicatorFrame) {
            cancelAnimationFrame(chatDateIndicatorFrame);
        }

        chatDateIndicatorFrame = requestAnimationFrame(() => {
            chatDateIndicatorFrame = null;
            showChatDateIndicator();
        });
    }, { passive: true });
}

function showChatMiniDateIndicator() {
    const container = document.getElementById('chatMiniMessages');
    const indicator = ensureChatMiniDateIndicator();
    if (!container || !indicator) return;

    if (hasVisibleChatMiniDaySeparator(container)) {
        hideChatMiniDateIndicator();
        return;
    }

    const timestampValue = getVisibleChatMiniMessageTimestamp(container);
    const label = formatChatScrollDateLabel(timestampValue);
    if (!label) return;

    indicator.innerText = label;
    const header = document.querySelector('#chatMiniThreadView .chat-mini-thread-header');
    const headerHeight = header ? header.offsetHeight : 0;
    indicator.style.top = `${headerHeight + 8}px`;
    indicator.classList.add('show');

    if (chatMiniDateIndicatorHideTimeout) {
        clearTimeout(chatMiniDateIndicatorHideTimeout);
    }

    chatMiniDateIndicatorHideTimeout = setTimeout(() => {
        hideChatMiniDateIndicator();
    }, 1800);
}

function bindChatMiniMessagesScrollIndicator() {
    const container = document.getElementById('chatMiniMessages');
    if (!container || container.dataset.dateIndicatorBound === 'true') return;

    container.dataset.dateIndicatorBound = 'true';
    container.addEventListener('scroll', () => {
        if (container.scrollHeight <= container.clientHeight) return;

        if (chatMiniDateIndicatorFrame) {
            cancelAnimationFrame(chatMiniDateIndicatorFrame);
        }

        chatMiniDateIndicatorFrame = requestAnimationFrame(() => {
            chatMiniDateIndicatorFrame = null;
            showChatMiniDateIndicator();
        });
    }, { passive: true });
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

function upsertChatConversationLocally(conversation) {
    if (!conversation || !conversation.id) return;

    const existingIndex = chatConversations.findIndex(item => item.id === conversation.id);
    if (existingIndex >= 0) {
        chatConversations[existingIndex] = {
            ...chatConversations[existingIndex],
            ...conversation
        };
    } else {
        chatConversations = [conversation, ...chatConversations];
    }

    renderChatConversationList();
    renderChatMiniDock();
    if (window.renderQuickStats) window.renderQuickStats();
    if (window.renderActivityFeed) window.renderActivityFeed();
}

function registerLocalSentMessage(friendUid, text, messageId) {
    if (!currentUser || !friendUid || !messageId) return;

    const conversationId = getChatConversationId(currentUser.uid, friendUid);
    const now = new Date();
    const previewText = text.length > 110 ? text.slice(0, 107) + "..." : text;

    upsertChatConversationLocally({
        id: conversationId,
        participants: [currentUser.uid, friendUid].sort(),
        updatedAt: now,
        lastMessageText: previewText,
        lastMessageSender: currentUser.uid,
        lastMessageId: messageId,
        lastMessageAt: now,
        readState: {
            ...(getChatConversationById(conversationId)?.readState || {}),
            [currentUser.uid]: {
                lastReadAt: now,
                lastReadMessageId: messageId
            }
        }
    });

    if (chatSelectedConversationId === conversationId) {
        const hasMessage = chatCurrentMessages.some(message => message.id === messageId);
        if (!hasMessage) {
            renderChatMessages([
                ...chatCurrentMessages,
                {
                    id: messageId,
                    senderId: currentUser.uid,
                    text: text,
                    createdAt: now
                }
            ]);
        }
    }
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

async function countUnreadMessagesForConversation(conversation) {
    if (!currentUser || !conversation || !conversation.id || !isConversationUnread(conversation)) return 0;

    const peerUid = getChatPeerUid(conversation);
    const readState = getChatReadState(conversation, currentUser.uid);
    const lastReadMessageId = readState.lastReadMessageId || "";
    const lastReadValue = getChatTimestampValue(readState.lastReadAt);

    const snapshot = await db.collection("conversations")
        .doc(conversation.id)
        .collection("messages")
        .orderBy("createdAt")
        .get()
        .catch(() => null);

    if (!snapshot) return isConversationUnread(conversation) ? 1 : 0;

    const messages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));

    let unreadMessages = messages;
    if (lastReadMessageId) {
        const lastReadIndex = messages.findIndex(message => message.id === lastReadMessageId);
        if (lastReadIndex >= 0) {
            unreadMessages = messages.slice(lastReadIndex + 1);
        }
    } else if (lastReadValue) {
        unreadMessages = messages.filter(message => getChatTimestampValue(message.createdAt) > lastReadValue);
    }

    return unreadMessages.filter(message => message.senderId === peerUid).length;
}

async function refreshUnreadMessageCounts(conversations) {
    const nextCounts = {};

    await Promise.all((conversations || []).map(async conversation => {
        if (!isConversationUnread(conversation)) {
            nextCounts[conversation.id] = 0;
            return;
        }

        nextCounts[conversation.id] = await countUnreadMessagesForConversation(conversation);
    }));

    chatUnreadMessageCountByConversation = nextCounts;
}

function getConversationUnreadMessageCount(conversation) {
    if (!conversation || !conversation.id || !isConversationUnread(conversation)) return 0;
    return chatUnreadMessageCountByConversation[conversation.id] || 1;
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
    const unreadMessageCount = getConversationUnreadMessageCount(conversation);

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
            ${isUnread ? `<span class="chat-status-pill">${unreadMessageCount}</span>` : ''}
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
    if (window.closeProfileDropdown) window.closeProfileDropdown();

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
    hideChatDateIndicator();
    hideChatMiniDateIndicator();
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
    hideChatDateIndicator();
    hideChatMiniDateIndicator();
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
    let previousDayKey = "";

    return messages.map((message) => {
        const isMine = message.senderId === currentUser.uid;
        const timeLabel = formatChatMessageTime(message.createdAt);
        const statusLabel = isMine
            ? getChatMessageDeliveryStatus(message, conversation)
            : "";
        const statusClass = getChatDeliveryStatusClass(statusLabel);
        const deliveryIconMarkup = isMine ? getChatDeliveryIconMarkup(statusLabel) : '';
        const timestampValue = getChatTimestampValue(message.createdAt);
        const dayKey = getChatDayKey(message.createdAt);
        const daySeparatorClass = options.compact ? 'chat-mini-day-separator' : 'chat-day-separator';
        const shouldRenderDaySeparator = dayKey && dayKey !== previousDayKey;
        const daySeparatorMarkup = shouldRenderDaySeparator
            ? `<div class="${daySeparatorClass}"><span>${escapeChatHtml(formatChatScrollDateLabel(message.createdAt))}</span></div>`
            : '';

        if (dayKey) {
            previousDayKey = dayKey;
        }

        return `
            ${daySeparatorMarkup}
            <div class="${options.compact ? 'chat-mini-message-row' : 'chat-message-row'} ${isMine ? 'sent' : 'received'}" data-message-timestamp="${timestampValue}">
                <div class="${options.compact ? 'chat-mini-bubble' : 'chat-bubble'} ${isMine ? 'sent' : 'received'}">
                    <p>${escapeChatHtml(message.text)}</p>
                    <span class="${options.compact ? 'chat-mini-message-time' : 'chat-message-time'} ${statusClass}">
                        <span class="chat-message-time-label">${escapeChatHtml(timeLabel)}</span>
                        ${deliveryIconMarkup}
                    </span>
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

    bindChatMessagesScrollIndicator();
    bindChatMiniMessagesScrollIndicator();
    bindChatMobileInputVisibility();
    bindChatMobileComposerFocus();
    bindChatMobileMessagesOverscrollGuard();
    hideChatDateIndicator();
    hideChatMiniDateIndicator();
    syncChatMobileLayoutMetrics();
    scrollChatToBottom();
    ensureLatestChatMessageVisible();
    const miniMessages = document.getElementById('chatMiniMessages');
    if (miniMessages) miniMessages.scrollTop = miniMessages.scrollHeight;
}

function clearChatMessagesWhileLoading() {
    const container = document.getElementById('chatMessages');
    const miniContainer = document.getElementById('chatMiniMessages');

    chatCurrentMessages = [];
    if (container) {
        container.innerHTML = '';
        container.scrollTop = 0;
    }
    if (miniContainer) {
        miniContainer.innerHTML = '';
        miniContainer.scrollTop = 0;
    }
    hideChatDateIndicator();
    hideChatMiniDateIndicator();
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
    chatUnreadMessageCountByConversation[conversationId] = 0;

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
            if (conversationId !== chatSelectedConversationId) return;

            const messages = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            renderChatMessages(messages);
            markConversationAsRead(conversationId, getLatestChatMessage(messages));
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
    cleanupChatMessagesListener();
    clearChatMessagesWhileLoading();

    updateChatHeader(friendUid);
    renderChatConversationList();
    setChatMobileView('thread');
    await subscribeToChatMessages(chatSelectedConversationId);

    const input = document.getElementById('chatMessageInput');
    if (input && !shouldUseMobileChatFlow()) input.focus();
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
            await refreshUnreadMessageCounts(chatConversations);
            renderChatConversationList();
            renderChatMiniDock();
            if (chatSelectedConversationId && chatCurrentMessages.length > 0) {
                renderChatMessages(chatCurrentMessages);
            }
            if (window.renderQuickStats) window.renderQuickStats();
            if (window.renderActivityFeed) window.renderActivityFeed();

            if (!shouldUseMobileChatFlow() && !chatSelectedFriendUid && chatConversations.length > 0 && isChatModalOpen()) {
                const latestConversation = getOrderedChatConversations()[0];
                const peerUid = getChatPeerUid(latestConversation);
                if (chatShouldAutoSelectLatest && peerUid) openChatWithUser(peerUid);
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
    const autoSelectLatest = options.autoSelectLatest !== undefined ? options.autoSelectLatest : false;
    const shouldAutoSelectLatest = shouldUseMobileChatFlow() ? !!friendUid : autoSelectLatest;
    if (!modal) return;
    chatShouldAutoSelectLatest = !!shouldAutoSelectLatest;
    if (window.closeProfileDropdown) window.closeProfileDropdown();

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
    if (!options.skipHistory && window.pushAppHistoryState) {
        window.pushAppHistoryState('chat', {
            friendUid: friendUid || null,
            autoSelectLatest: !!autoSelectLatest
        });
    }
    renderChatConversationList();
    setChatMobileView(friendUid ? 'thread' : 'list');
    syncChatScrollLock();
    syncChatMobileViewport();
    syncChatMobileLayoutMetrics();
    if (shouldUseMobileChatFlow()) {
        blurActiveChatElement();
    } else if (searchInput) {
        searchInput.focus();
    }

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

function closeChatModal(options = {}) {
    const modal = document.getElementById('chatModal');
    if (modal) modal.style.display = 'none';

    chatSelectedFriendUid = null;
    chatSelectedConversationId = null;
    chatSearchTerm = "";
    chatShouldAutoSelectLatest = false;
    closeChatEmojiPickers();
    cleanupChatMessagesListener();
    resetChatView();
    setChatMobileView('list');
    renderChatConversationList();
    if (window.setActiveNav) window.setActiveNav(window.resolveAppSection ? window.resolveAppSection() : 'home');

    const searchInput = document.getElementById('chatSearchInput');
    if (searchInput) searchInput.value = '';
    syncChatScrollLock();
    syncChatMobileViewport();
    syncChatMobileLayoutMetrics();
    renderChatMiniDock();

    if (!options.skipHistory && window.history && window.history.state && window.history.state.bitbondView === 'chat') {
        window.history.back();
    }
}

async function persistChatMessage(friendUid, text, options = {}) {
    const conversationId = getChatConversationId(currentUser.uid, friendUid);
    const conversationRef = db.collection("conversations").doc(conversationId);
    const messageRef = conversationRef.collection("messages").doc();
    const previewText = text.length > 110 ? text.slice(0, 107) + "..." : text;
    const participants = [currentUser.uid, friendUid].sort();
    const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();

    if (options.optimistic) {
        registerLocalSentMessage(friendUid, text, messageRef.id);
    }

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
            lastMessageId: messageRef.id,
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

    if (!options.optimistic) {
        registerLocalSentMessage(friendUid, text, messageRef.id);
    }
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
    const useMobileFlow = shouldUseMobileChatFlow();

    if (useMobileFlow) {
        clearChatInputValue(input);
    }
    closeChatEmojiPickers();
    if (input && useMobileFlow) {
        input.focus({ preventScroll: true });
        settleLatestChatMessageVisible(20);
    }

    try {
        await persistChatMessage(chatSelectedFriendUid, text, { optimistic: useMobileFlow });
        if (!useMobileFlow) {
            clearChatInputValue(input);
        }
        if (input && useMobileFlow) {
            input.focus({ preventScroll: true });
            settleLatestChatMessageVisible(60);
        }
        scrollChatToBottom();
    } catch (error) {
        if (input && !input.value) {
            input.value = text;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
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
    syncChatMobileViewport();
    syncChatMobileLayoutMetrics();
});

if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncChatMobileKeyboardLayout);
}

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
