import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { 
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut 
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { 
  getDatabase, ref, set, get, child, update, onValue 
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDciAiNKFbh8aoM8joIywSeH9Boml1tK5s",
  authDomain: "aplikasi-jadwal-1d54d.firebaseapp.com",
  databaseURL: "https://aplikasi-jadwal-1d54d-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "aplikasi-jadwal-1d54d",
  storageBucket: "aplikasi-jadwal-1d54d.firebasestorage.app",
  messagingSenderId: "860941812271",
  appId: "1:860941812271:web:458bd63c5b0d2514fcbcda"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

// Login
export async function loginUser(email, password) {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return userCredential.user;
}

// Register
export async function registerUser(name, email, password, isAdmin) {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;
  await set(ref(db, 'users/' + user.uid), { name, email, isAdmin });
}

// Logout
export async function logoutUser() {
  await signOut(auth);
}

// ===== Modal Open & Close =====
btnTambah.addEventListener('click', () => {
  modal.style.display = 'flex';
  modalTitle.textContent = 'Tambah Pegawai';
  btnSimpan.textContent = 'Simpan';
  editId = null;
  namaInput.value = '';
  gelarInput.value = '';
});

btnClose.addEventListener('click', closeModal);

function closeModal() {
  modal.style.display = 'none';
  namaInput.value = '';
  gelarInput.value = '';
  editId = null;
}

// ===== Simpan / Update (Hanya 1 Event Listener!) =====
btnSimpan.onclick = () => {
  const nama = namaInput.value.trim();
  const gelar = gelarInput.value.trim();

  if (!nama) {
    alert('Nama tidak boleh kosong!');
    return;
  }

  if (editId) {
    // MODE EDIT
    update(ref(db, 'pegawai/' + editId), { nama, gelar })
      .then(() => {
        alert('✏️ Data berhasil diperbarui!');
        closeModal();
      })
      .catch(err => alert('Gagal update: ' + err.message));
  } else {
    // MODE TAMBAH
    const newRef = push(ref(db, 'pegawai'));
    set(newRef, { nama, gelar })
      .then(() => {
        alert('✅ Pegawai berhasil ditambahkan!');
        closeModal();
      })
      .catch(err => alert('Gagal simpan: ' + err.message));
  }
};
