# BitBond Architecture

## Stack

- Vanilla HTML, CSS, and JavaScript
- Firebase compat SDK loaded from CDN
- Firebase Auth for login and registration
- Cloud Firestore as the main realtime datastore
- Cropper.js for avatar editing

## App Shape

BitBond is a single-page app centered in `index.html`.
Most screens are sections or modals that are shown and hidden rather than routed.
The JavaScript code uses globals plus `window.*` exports so files can call each other directly.

## File Responsibilities

### `index.html`

Contain the app shell, modals, profile view, mobile navigation, and script order.
Inline event handlers are common and expected in the current codebase.

### `js/configuracion.js`

Initialize Firebase and manage the top-level auth state.
Define `db`, `auth`, `currentUser`, `posts`, and `isLoginMode`.

### `js/interfaz.js`

Own shared UI helpers, section navigation, cached profile visuals, sidebar summaries, and generic modal behavior.
This file also centralizes shared avatar resolution and some render coordination.

### `js/autenticacion.js`

Own login, registration, auth mode toggles, and logout.
Registration also seeds the user document in `usuarios`.

### `js/publicaciones.js`

Own feed posts, likes, comments, deletion, and post rendering.
This module depends on user profile data and friendship state for visibility and CTA rendering.

### `js/amigos.js`

Own request sending, acceptance, rejection, friendship state, and related badges.
This file is a core dependency for profile actions, stories visibility, and chat eligibility.

### `js/perfil.js`

Own current user profile syncing, profile editing, search, detailed profile view, follower/following modals, and profile posts.
Treat this file as high-risk because it is long and appears to contain duplicated logic regions.

### `js/chat.js`

Own direct messaging, conversation state, unread tracking, mini dock behavior, and chat modal rendering.
Chat access is connected to friendship state or an existing conversation.

### `js/historias.js`

Own story creation, visibility filtering, viewing flow, and 24-hour expiration handling.
Stories currently store media directly in Firestore documents.

### `firestore.rules`

Define access rules for `usuarios`, `posts`, `solicitudes`, `stories`, `conversations`, and nested `messages`.

## Shared Global State

These globals are used across modules and should be treated carefully:

- `currentUser`
- `window.userData`
- `window.amigos`
- `window.friendshipStateByUid`
- `window.pendingIncomingRequests`
- `window.pendingOutgoingRequests`
- `posts`
- `allStories`
- `chatConversations`

Before changing one of these sources, search all references.

## Coupling Patterns

The main coupling pattern is render fan-out after live updates.
Examples:

- User profile updates trigger sidebar, post, story, and chat surface refreshes
- Friendship state updates refresh posts, stories, profile actions, and badges
- Auth changes toggle the whole app shell

Avoid introducing hidden state that bypasses these refresh paths.

