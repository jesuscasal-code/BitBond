# External Best Practices

Use these official references when a task needs current web or Firebase guidance beyond the local codebase.

## Firebase

- Firestore security rule conditions: https://firebase.google.com/docs/firestore/security/rules-conditions
- Common insecure Firestore rule patterns: https://firebase.google.com/docs/firestore/security/insecure-rules
- Cloud Storage file uploads on web: https://firebase.google.com/docs/storage/web/upload-files
- Cloud Storage file downloads on web: https://firebase.google.com/docs/storage/web/download-files

## MDN

- `<button>` element guidance: https://developer.mozilla.org/docs/Web/HTML/Reference/Elements/button

## Practical Inferences For BitBond

These are inferences based on the official docs above and the current BitBond codebase:

- Storing media as base64 in Firestore is workable for demos but not ideal for a production social app with many images
- Rules that allow any authenticated user to update shared content are a likely risk and should be narrowed by ownership and field validation
- Explicit button types and accessible names matter because the UI uses many icon-first controls and modal actions

