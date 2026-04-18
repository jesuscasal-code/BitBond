---
name: bitbond-social-app
description: Extend, refactor, debug, and polish the BitBond social network project built with vanilla HTML, CSS, JavaScript, Firebase Auth, and Cloud Firestore. Use when working in this repo on feed, profiles, friendship flows, search, stories, chat, responsive UI, Firebase rules, or general app quality. Use especially when Codex needs to preserve the current single-page architecture, global window APIs, visual style, and Firestore-backed social features while making the app safer, cleaner, and more production-ready.
---

# BitBond Social App

Understand the existing architecture before changing behavior.
Preserve the current product identity: a tech-focused social network with a polished glassmorphism UI, global JS modules, and Firebase-backed realtime features.
Prefer small, compatible improvements over framework rewrites.

## Quick Start

Inspect these files first:

- `index.html`
- `js/configuracion.js`
- `js/interfaz.js`
- `js/publicaciones.js`
- `js/amigos.js`
- `js/perfil.js`
- `js/chat.js`
- `js/historias.js`
- `firestore.rules`
- `css/base.css`
- `css/diseño.css`

Read the matching reference file when needed:

- For structure and coupling: `references/architecture.md`
- For feature expectations: `references/feature-map.md`
- For implementation guardrails: `references/quality-guardrails.md`
- For official web and Firebase guidance to consult when needed: `references/external-best-practices.md`

## Workflow

Follow this order:

1. Identify the affected feature and its source file ownership.
2. Check whether the feature depends on shared globals such as `currentUser`, `window.userData`, `window.amigos`, or global render helpers.
3. Confirm whether the change affects Firestore data shape, security rules, or UI state synchronization.
4. Make the smallest coherent change that preserves current behavior on desktop and mobile.
5. Verify that related surfaces still update correctly after the change.

## Architecture Rules

Treat BitBond as a single-page app with progressive modal and section toggles, not a router-based app.
Keep the current global module pattern unless the task explicitly asks for a larger refactor.
When adding logic, prefer extending the responsible feature file instead of scattering behavior across unrelated modules.

Respect the current script loading order from `index.html`:

1. `js/configuracion.js`
2. `js/interfaz.js`
3. `js/autenticacion.js`
4. `js/publicaciones.js`
5. `js/amigos.js`
6. `js/perfil.js`
7. `js/chat.js`
8. `js/historias.js`

Do not introduce imports, bundlers, or framework assumptions unless the user explicitly wants a migration.

## Feature Expectations

Preserve and improve these product behaviors:

- Authentication with login and registration
- User profile editing with avatar, bio, and role
- Feed with posts, images, comments, likes, and visibility
- Friendship/request flow that gates some social interactions
- Search by name and role
- Public profile view and social counters
- Stories with 24-hour expiry
- Direct messaging and unread states
- Desktop and mobile navigation parity
- Dark and light theme support

When implementing new features, fit them into these existing interaction patterns before inventing a new one.

## Quality Priorities

Prioritize these improvements when relevant:

1. Data integrity and Firestore rule safety
2. Compatibility with current globals and live listeners
3. Mobile responsiveness
4. Accessibility and semantic HTML
5. Performance on large feeds and image-heavy usage
6. Reducing duplication in large files, especially `js/perfil.js`

## Guardrails

Prefer `button type="button"` for interactive controls that are not form submits.
Escape user-generated content before inserting HTML.
Keep optimistic UI conservative unless rollback behavior is clear.
Avoid breaking live Firestore listeners and unsubscribe flows.
Do not silently change collection names or document shapes.
If a feature stores large base64 payloads in Firestore, treat that as technical debt and prefer Firebase Storage for production-grade media handling.
If editing `firestore.rules`, validate ownership and allowed field mutations instead of broad authenticated access.

## When Improving The Codebase

Use these heuristics:

- Refactor only the touched area unless repeated pain clearly justifies a larger cleanup.
- If `js/perfil.js` is involved, search for duplicated blocks before editing because the file has overlapping logic sections.
- Reuse existing UI tokens and CSS variables from `css/base.css`.
- Keep the visual direction consistent with the current cyan, slate, glass, and soft-shadow style.
- Favor resilient empty states, loading states, and failure handling over flashy rewrites.

## Definition Of Done

Before considering a task complete, verify:

- The affected flow still works for authenticated users
- Related badges, counters, or profile surfaces stay in sync
- The change behaves correctly on mobile and desktop
- The app does not rely on unescaped user HTML
- New controls remain keyboard-usable
- Data writes still align with `firestore.rules`

