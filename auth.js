// js/auth.js
import { auth, db } from "./app.js";
import { signInWithEmailAndPassword, onAuthStateChanged } 
  from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { ref, get, child } 
  from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";

// 🔒 Jika sudah login → langsung arahkan ke dashboard sesuai role
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      const snapshot = await get(child(ref(db), "users/" + user.uid));
      if (snapshot.exists()) {
        const userData = snapshot.val();
        if (userData.isAdmin) {
          window.location.href = "admin-dashboard.html";
        } else {
          window.location.href = "dashboard.html";
        }
      }
    } catch (err) {
      console.error("❌ Gagal memuat data pengguna:", err);
    }
  }
});

// 🧩 Form Login
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    if (!email || !password) {
      alert("⚠️ Mohon isi email dan password.");
      return;
    }

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const snapshot = await get(child(ref(db), "users/" + user.uid));
      if (snapshot.exists()) {
        const userData = snapshot.val();
        if (userData.isAdmin) {
          alert("✅ Login berhasil sebagai Admin");
          window.location.href = "admin-dashboard.html";
        } else {
          alert("✅ Login berhasil sebagai Pegawai");
          window.location.href = "dashboard.html";
        }
      } else {
        alert("⚠️ Data pengguna tidak ditemukan di database.");
      }

    } catch (error) {
      let msg = "❌ Login gagal: ";
      switch (error.code) {
        case "auth/invalid-email": msg += "Format email tidak valid."; break;
        case "auth/user-not-found": msg += "Akun tidak ditemukan."; break;
        case "auth/wrong-password": msg += "Password salah."; break;
        default: msg += error.message;
      }
      alert(msg);
    }
  });
}
