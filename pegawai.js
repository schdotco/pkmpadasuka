// js/pegawai.js
import { db } from './app.js';
import { ref, set, push, update, onValue } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";

// Ambil elemen
const btnTambah = document.getElementById('btnTambahPegawai');
const modal = document.getElementById('modalPegawai');
const btnClose = document.getElementById('closeModal');
const btnSimpan = document.getElementById('btnSimpanPegawai');
const namaInput = document.getElementById('namaPegawai');
const gelarInput = document.getElementById('gelarPegawai');
const tabelBody = document.getElementById('tabelPegawaiBody');

let editId = null;

// Open modal
btnTambah.addEventListener('click', () => {
  modal.style.display = 'flex';
  btnSimpan.textContent = 'Simpan';
  namaInput.value = '';
  gelarInput.value = '';
  editId = null;
});

// Close modal
btnClose.addEventListener('click', () => {
  modal.style.display = 'none';
});

// Simpan data
btnSimpan.addEventListener('click', async () => {
  const nama = namaInput.value.trim();
  const gelar = gelarInput.value.trim();

  if (nama === '') {
    alert('Nama tidak boleh kosong');
    return;
  }

  const pegawaiRef = ref(db, 'pegawai');
  if (editId) {
    await update(ref(db, `pegawai/${editId}`), { nama, gelar });
  } else {
    const newRef = push(pegawaiRef);
    await set(newRef, { nama, gelar });
  }

  modal.style.display = 'none';
});

// Load data realtime
onValue(ref(db, 'pegawai'), (snapshot) => {
  tabelBody.innerHTML = '';
  const data = snapshot.val();
  if (data) {
    Object.keys(data).forEach((id) => {
      const { nama, gelar } = data[id];
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${nama}</td>
        <td>${gelar || ''}</td>
        <td>
          <button class="edit" data-id="${id}">Edit</button>
        </td>
      `;
      tabelBody.appendChild(tr);
    });
  }
});
