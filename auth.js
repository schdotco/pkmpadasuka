import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { 
  getAuth, signInWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { 
  getDatabase, ref, get, child 
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";

// Konfigurasi Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDciAiNKFbh8aoM8joIywSeH9Boml1tK5s",
  authDomain: "aplikasi-jadwal-1d54d.firebaseapp.com",
  databaseURL: "https://aplikasi-jadwal-1d54d-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "aplikasi-jadwal-1d54d",
  storageBucket: "aplikasi-jadwal-1d54d.firebasestorage.app",
  messagingSenderId: "860941812271",
  appId: "1:860941812271:web:458bd63c5b0d2514fcbcda"
};

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// LOGIN FORM
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();

    try {
      // 🔑 Login Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 📝 Ambil data user dari Realtime Database untuk cek isAdmin
      const snapshot = await get(child(ref(db), 'users/' + user.uid));
      if (snapshot.exists()) {
        const userData = snapshot.val();
        if (userData.isAdmin) {
          alert('✅ Login berhasil sebagai Admin');
          window.location.href = "admin-dashboard.html";
        } else {
          alert('✅ Login berhasil sebagai Pegawai');
          window.location.href = "dashboard.html";
        }
      } else {
        alert("⚠️ Data user tidak ditemukan di database.");
      }

    } catch (error) {
      alert('❌ Login gagal: ' + error.message);
    }
  });
}
