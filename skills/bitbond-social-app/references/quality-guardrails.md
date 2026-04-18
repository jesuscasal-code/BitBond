# BitBond Quality Guardrails

## HTML

Prefer semantic elements already used in the app, especially `nav`, `main`, `aside`, and `button`.
When adding interactive controls, use explicit `type="button"` unless the control should submit a form.
Preserve accessible labels on icon buttons and profile controls.
Avoid adding more inline styles when a reusable class or variable is more appropriate.

## CSS

Use tokens from `css/base.css` before inventing new colors or shadows.
Keep the current visual language:

- cyan primary accents
- deep slate backgrounds
- glass surfaces
- soft borders
- rounded cards
- subtle motion

When styling new components, check desktop and mobile breakpoints.
Prefer extending component CSS files over adding large new style blocks to unrelated files.

## JavaScript

Stay compatible with the current global function pattern.
Export new cross-module functions through `window` only when another file or inline handler needs them.
Escape user-generated content before injecting HTML strings.
Avoid duplicate listeners and remember to clean up Firestore subscriptions where applicable.
Guard DOM queries because some surfaces are conditional.

## Firebase And Data Safety

Preserve ownership fields such as `uid`, `de`, `para`, and `senderId`.
Do not trust client-only gating for sensitive actions.
When modifying writes, compare them against `firestore.rules`.
If a task expands file upload usage, prefer Firebase Storage with stored URLs over large base64 strings in Firestore documents.

## Improvement Priority Checklist

If the user asks to "make it better" without being specific, prefer this order:

1. tighten Firestore rules and ownership validation
2. move heavy media flows toward Firebase Storage
3. reduce duplicated code in `js/perfil.js`
4. improve mobile polish and empty states
5. improve accessibility of icon-only controls and modal flows
6. optimize broad realtime listeners only after correctness is stable

## Testing Mindset

After a change, manually reason through at least these flows:

- login and registration
- profile edit and avatar refresh
- creating a post
- liking and commenting
- following or accepting a request
- opening a profile
- opening chat and unread states
- viewing or creating stories
- switching between desktop and mobile layouts

