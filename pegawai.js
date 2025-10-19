// pegawai.js
import { db } from './app.js';
import { ref, set, push, update, onValue } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";

// === Ambil elemen dari halaman ===
const btnTambah = document.getElementById('btnTambahPegawai');
const modal = document.getElementById('modalPegawai');
const btnClose = document.getElementById('closeModal');
const btnSimpan = document.getElementById('btnSimpanPegawai');
const namaInput = document.getElementById('namaPegawai');
const gelarInput = document.getElementById('gelarPegawai');
const tabelBody = document.getElementById('tabelPegawaiBody');

let editId = null;

// === Fungsi Buka Modal Tambah ===
btnTambah.addEventListener('click', () => {
  modal.style.display = 'flex';
  btnSimpan.textContent = 'Simpan';
  namaInput.value = '';
  gelarInput.value = '';
  editId = null;
});

// === Fungsi Tutup Modal ===
btnClose.addEventListener('click', () => {
  modal.style.display = 'none';
  namaInput.value = '';
  gelarInput.value = '';
  editId = null;
});

// === Simpan Data ke Firebase ===
btnSimpan.addEventListener('click', async () => {
  const nama = namaInput.value.trim();
  const gelar = gelarInput.value.trim();

  if (nama === '') {
    alert('Nama tidak boleh kosong!');
    return;
  }

  try {
    if (editId) {
      // update data yang sudah ada
      await update(ref(db, `pegawai/${editId}`), { nama, gelar });
    } else {
      // tambah data baru
      const newRef = push(ref(db, 'pegawai'));
      await set(newRef, { nama, gelar });
    }

    modal.style.display = 'none';
    namaInput.value = '';
    gelarInput.value = '';
    editId = null;
  } catch (error) {
    console.error('Gagal simpan data:', error);
    alert('Terjadi kesalahan saat menyimpan data.');
  }
});

// === Load data realtime dari Firebase ===
onValue(ref(db, 'pegawai'), (snapshot) => {
  tabelBody.innerHTML = ''; // bersihkan tabel sebelum render ulang
  const data = snapshot.val();
  if (data) {
    Object.keys(data).forEach((id) => {
      const { nama, gelar } = data[id];
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${nama}</td>
        <td>${gelar || ''}</td>
        <td>
          <button class="editBtn" data-id="${id}">Edit</button>
        </td>
      `;
      tabelBody.appendChild(tr);
    });

    // Tambahkan event listener edit setelah render
    document.querySelectorAll('.editBtn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.getAttribute('data-id');
        editData(id);
      });
    });
  }
});

// === Fungsi Edit Data ===
function editData(id) {
  const itemRef = ref(db, `pegawai/${id}`);
  onValue(itemRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      modal.style.display = 'flex';
      namaInput.value = data.nama;
      gelarInput.value = data.gelar || '';
      btnSimpan.textContent = 'Update';
      editId = id;
    }
  }, { onlyOnce: true });
}
