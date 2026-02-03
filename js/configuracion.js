// configuracion.js - Configuración de Firebase e Inicialización
const firebaseConfig = {
    apiKey: "AIzaSyAu3JtvY_DchShliSx6Kg2Phb9614tYEtI",
    authDomain: "bitbond-app.firebaseapp.com",
    projectId: "bitbond-app",
    storageBucket: "bitbond-app.firebasestorage.app",
    messagingSenderId: "169872493749",
    appId: "1:169872493749:web:e196d5df1b1a2d939842fc",
    measurementId: "G-J4TG3CG4C8"
};

// Globales
var db, auth;
var isLoginMode = true;
var currentUser = null;
var posts = [];

// Inicialización
try {
    if (typeof firebase !== 'undefined') {
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        auth = firebase.auth();

        auth.onAuthStateChanged(user => {
            currentUser = user;
            const authPage = document.getElementById('authPage');
            const mainApp = document.getElementById('mainApp');
            if (user) {
                if (authPage) authPage.style.display = 'none';
                if (mainApp) mainApp.style.display = 'block';
                if (window.updateProfileUI) window.updateProfileUI();
            } else {
                if (authPage) authPage.style.display = 'flex';
                if (mainApp) mainApp.style.display = 'none';
            }
        });
    }
} catch (e) {
    console.error("Fallo crítico al iniciar Firebase:", e);
}
