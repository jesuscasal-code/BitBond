// autenticacion.js - Lógica de Usuario y Auth

function showError(msg) {
    const errorEl = document.getElementById('authErrorMsg');
    if (errorEl) {
        errorEl.innerText = msg;
        errorEl.style.display = 'block';
    } else {
        alert(msg);
    }
}

function clearError() {
    const errorEl = document.getElementById('authErrorMsg');
    if (errorEl) errorEl.style.display = 'none';
}

function changeAuthMode() {
    isLoginMode = !isLoginMode;
    clearError();

    const title = document.getElementById('authTitle');
    const submitBtn = document.getElementById('authSubmitBtn');
    const msgSpan = document.getElementById('authMsg');
    const toggleLink = document.getElementById('toggleAuthMode');
    const usernameField = document.getElementById('usernameField');
    const confirmPasswordField = document.getElementById('confirmPasswordField');

    if (isLoginMode) {
        title.innerText = "Bienvenido";
        submitBtn.innerText = "Entrar";
        msgSpan.innerText = "¿No tienes cuenta?";
        toggleLink.innerText = "Regístrate";
        usernameField.style.display = 'none';
        confirmPasswordField.style.display = 'none';
    } else {
        title.innerText = "Crea tu Cuenta";
        submitBtn.innerText = "Registrarse";
        msgSpan.innerText = "¿Ya tienes cuenta?";
        toggleLink.innerText = "Inicia Sesión";
        usernameField.style.display = 'block';
        confirmPasswordField.style.display = 'block';
    }
}

async function handleAuth(event) {
    if (event) event.preventDefault();
    clearError();

    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const username = document.getElementById('authUsername').value.trim();
    const passwordConfirm = document.getElementById('authPasswordConfirm').value;
    const submitBtn = document.getElementById('authSubmitBtn');

    if (!email || !password) {
        showError("Escribe tu correo y contraseña.");
        return;
    }

    if (!isLoginMode) {
        if (!username) {
            showError("Dinos tu nombre completo.");
            return;
        }
        if (password.length < 8) {
            showError("La contraseña debe tener al menos 8 caracteres.");
            return;
        }
        const specialCharReg = /[!@#$%^&*(),.?":{}|<>]/;
        if (!specialCharReg.test(password)) {
            showError("Añade un símbolo especial (. : ! @ # $)");
            return;
        }
        if (password !== passwordConfirm) {
            showError("Las contraseñas no coinciden.");
            return;
        }
    }

    try {
        submitBtn.disabled = true;
        const originalText = submitBtn.innerText;
        submitBtn.innerText = "Procesando...";

        if (isLoginMode) {
            await auth.signInWithEmailAndPassword(email, password);
        } else {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            await userCredential.user.updateProfile({
                displayName: username
            });

            // Guardar en Firestore con campos de búsqueda optimizados
            await db.collection("usuarios").doc(userCredential.user.uid).set({
                nombre: username,
                nombreLower: username.toLowerCase(),
                email: email,
                puesto: "",
                bio: "",
                avatar: "",
                amigos: [],
                seguidores: [],
                privacidad: "publico",
                profileUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            // En lugar de alert, abrimos la configuración de perfil
            if (window.abrirEdicionPerfil) {
                // Forzar refresco de currentUser para que el siguiente paso tenga los datos
                currentUser = auth.currentUser;
                window.abrirEdicionPerfil();
                // Cambiar a login mode por detrás para cuando cierren el modal
                isLoginMode = true;
                const title = document.getElementById('authTitle');
                const submitBtn2 = document.getElementById('authSubmitBtn');
                if (title) title.innerText = "Bienvenido";
                if (submitBtn2) submitBtn2.innerText = "Entrar";
            } else {
                alert("!Cuenta creada! Inicia sesión.");
                changeAuthMode();
            }
        }
    } catch (error) {
        console.error("Auth Error:", error);
        let msg = "Error: " + error.message;
        if (error.code === 'auth/email-already-in-use') msg = "Este correo ya está registrado.";
        if (
            error.code === 'auth/wrong-password'
            || error.code === 'auth/user-not-found'
            || error.code === 'auth/invalid-credential'
            || error.code === 'auth/invalid-login-credentials'
        ) msg = "No hemos podido validar tus credenciales. Revisa tu correo y contraseña e inténtalo de nuevo.";
        if (error.code === 'auth/invalid-email') msg = "El formato del correo no es válido.";
        showError(msg);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = isLoginMode ? "Entrar" : "Registrarse";
    }
}

function handleSignOut() {
    if (auth) {
        auth.signOut().then(() => {
            window.userData = null;
            window.amigos = [];
            if (window.clearCachedUserVisual) window.clearCachedUserVisual();
            // Recargar para limpiar estados de memoria
            window.location.reload();
        });
    }
}

// Exportar funciones globalmente
window.handleAuth = handleAuth;
window.changeAuthMode = changeAuthMode;
window.handleSignOut = handleSignOut;
