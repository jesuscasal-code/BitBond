# BitBond Feature Map

## Product Identity

BitBond is a social network oriented to tech professionals.
The interface language is Spanish.
The UX mixes social features with a polished startup-style presentation.

## Core Collections

### `usuarios`

Expected fields seen in the app include:

- `nombre`
- `nombreLower`
- `email`
- `puesto`
- `puestoLower`
- `bio`
- `avatar`
- `privacidad`
- `amigos`
- `seguidores`
- `historiasVistas`
- `profileUpdatedAt`

### `posts`

Expected fields seen in the app include:

- `uid`
- `author`
- `avatar`
- `content`
- `image`
- `createdAt`
- `likedBy`
- `comments`
- `visibility`
- `puesto`

### `solicitudes`

Expected fields seen in the app include:

- `de`
- `para`
- `deNombre`
- `deAvatar`
- `estado`
- `createdAt`

### `stories`

Expected fields seen in the app include:

- `uid`
- `author`
- `avatar`
- `media`
- `createdAt`
- `expiresAt`

### `conversations`

Expected fields seen in the app include:

- `participants`
- `lastMessageText`
- `lastMessageAt`
- `lastMessageId`
- `lastMessageSender`
- `updatedAt`
- `readState`

Messages live in `conversations/{conversationId}/messages`.

## Current Social Rules In The App Layer

- Feed posts are filtered by visibility and friendship relationship
- Stories are visible to the current user and their friends
- Messaging is allowed for friends or for users with an existing conversation
- Follow and request buttons adapt to friendship state
- Profiles expose message actions only when the relationship allows it

## Mobile Surfaces

Important mobile-specific surfaces already exist:

- Bottom navigation
- Mobile search modal
- Modal-first interaction model on smaller screens

Any new feature should work without relying on sidebars.

## Sensitive Areas

Treat these as likely improvement targets:

1. Media stored as base64 in Firestore instead of Firebase Storage
2. Firestore rules that allow broad updates for authenticated users in some collections
3. Long, duplicated profile logic in `js/perfil.js`
4. Heavy use of inline handlers and global DOM lookups
5. Potential render cost from many broad `usuarios` snapshot listeners

