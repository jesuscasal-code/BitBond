// interfaz.js - UI, Temas, Modales

function updateProfileUI() {
    if (!currentUser) return;
    document.querySelectorAll('.profile-preview h3').forEach(el => el.innerText = currentUser.displayName || "Usuario");
    document.querySelectorAll('.avatar').forEach(el => {
        if (el.id !== 'imagePreview') {
            el.src = currentUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(currentUser.email)}`;
        }
    });
}

function openModal() { document.getElementById('postModal').style.display = 'flex'; }
function closeModal() {
    document.getElementById('postModal').style.display = 'none';
    const content = document.getElementById('postContent');
    if (content) content.value = '';
    window.selectedImageData = null;
    const preview = document.getElementById('imagePreviewContainer');
    if (preview) preview.style.display = 'none';
}

function openSettings() { document.getElementById('settingsModal').style.display = 'flex'; }
function closeSettings() { document.getElementById('settingsModal').style.display = 'none'; }

function toggleTheme() {
    const isDark = document.getElementById('themeToggle').checked;
    document.body.classList.toggle('light-mode', !isDark);
}

function toggleProfileDropdown(event) {
    if (event) event.stopPropagation();
    const d = document.getElementById('profileDropdown');
    if (d) d.classList.toggle('show');
}

window.onclick = function (event) {
    if (event.target.classList.contains('modal-overlay')) {
        event.target.style.display = 'none';
    }
    const d = document.getElementById('profileDropdown');
    if (d && !event.target.closest('.profile-dropdown')) {
        d.classList.remove('show');
    }
};

window.selectedImageData = null;
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = e => {
            window.selectedImageData = e.target.result;
            const previewContainer = document.getElementById('imagePreviewContainer');
            const previewImg = document.getElementById('imagePreview');
            if (previewContainer) previewContainer.style.display = 'block';
            if (previewImg) previewImg.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

// Exportar globalmente
window.updateProfileUI = updateProfileUI;
window.openModal = openModal;
window.closeModal = closeModal;
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.toggleTheme = toggleTheme;
window.toggleProfileDropdown = toggleProfileDropdown;
window.handleFileSelect = handleFileSelect;
