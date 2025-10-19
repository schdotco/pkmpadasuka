import { db } from './app.js';
import { ref, push, set, onValue, update, remove } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";

const modal = document.getElementById('modalPegawai');
const btnTambah = document.getElementById('btnTambahPegawai');
const btnSimpan = document.getElementById('btnSimpanPegawai');
const btnClose = document.getElementById('closeModal');
const namaInput = document.getElementById('namaPegawai');
const gelarInput = document.getElementById('gelarPegawai');
const tableBody = document.getElementById('pegawaiTableBody');
const modalTitle = document.getElementById('modalTitle');
const searchInput = document.getElementById('searchInput');

let editId = null;
let semuaPegawai = [];

// 🌀 Buat elemen loading spinner
const loadingRow = document.createElement('tr');
loadingRow.innerHTML = `
  <td colspan="4" style="text-align:center; padding:20px;">
    <div class="spinner"></div>
    <p>Sedang memuat data...</p>
  </td>
`;
tableBody.appendChild(loadingRow);

// 🟦 Modal Tambah
btnTambah.addEventListener('click', () => {
  modal.style.display = 'flex';
  modalTitle.textContent = 'Tambah Pegawai';
  btnSimpan.textContent = 'Simpan';
  editId = null;
  namaInput.value = '';
  gelarInput.value = '';
});

// 🟥 Modal Tutup
btnClose.addEventListener('click', () => {
  modal.style.display = 'none';
  namaInput.value = '';
  gelarInput.value = '';
  editId = null;
});

// 🟩 Simpan / Update Data
btnSimpan.addEventListener('click', () => {
  const nama = namaInput.value.trim();
  const gelar = gelarInput.value.trim();

  if (!nama) {
    alert('Nama tidak boleh kosong!');
    return;
  }

  if (editId) {
    update(ref(db, 'pegawai/' + editId), { nama, gelar })
      .then(() => {
        alert('✏️ Data berhasil diperbarui!');
        modal.style.display = 'none';
        namaInput.value = '';
        gelarInput.value = '';
        editId = null;
      })
      .catch(err => alert('Gagal update: ' + err.message));
  } else {
    const newRef = push(ref(db, 'pegawai'));
    set(newRef, { nama, gelar })
      .then(() => {
        alert('✅ pegawai berhasil ditambahkan!');
        modal.style.display = 'none';
        namaInput.value = '';
        gelarInput.value = '';
      })
      .catch(err => alert('Gagal simpan: ' + err.message));
  }
});

// 🟨 Ambil Data Realtime
const dataRef = ref(db, 'pegawai'); // huruf "P" sesuai database
onValue(dataRef, (snapshot) => {
  semuaPegawai = [];
  snapshot.forEach(child => {
    semuaPegawai.push({
      id: child.key,
      ...child.val()
    });
  });
  renderTable(semuaPegawai);
});

// 📝 Render Table
function renderTable(data) {
  tableBody.innerHTML = '';
  if (data.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = `
      <td colspan="4" style="text-align:center; padding:15px; color:#666;">
        Tidak ada data pegawai
      </td>
    `;
    tableBody.appendChild(emptyRow);
    return;
  }

  let no = 1;
  data.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${no++}</td>
      <td>${item.nama}</td>
      <td>${item.gelar || '-'}</td>
      <td>
        <button class="action-btn edit-btn" data-id="${item.id}">✏️</button>
        <button class="action-btn delete-btn" data-id="${item.id}">🗑️</button>
      </td>
    `;
    tableBody.appendChild(tr);
  });

  // Event Edit
  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const data = semuaPegawai.find(p => p.id === id);
      editId = id;
      namaInput.value = data.nama;
      gelarInput.value = data.gelar || '';
      modalTitle.textContent = 'Edit Pegawai';
      btnSimpan.textContent = 'Update';
      modal.style.display = 'flex';
    });
  });

  // Event Delete
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      if (confirm('Apakah yakin ingin menghapus data ini?')) {
        remove(ref(db, 'pegawai/' + id))
          .then(() => alert('🗑️ Data berhasil dihapus!'))
          .catch(err => alert('Gagal hapus: ' + err.message));
      }
    });
  });
}

// 🔍 Pencarian realtime
searchInput.addEventListener('input', () => {
  const keyword = searchInput.value.toLowerCase();
  const filtered = semuaPegawai.filter(item =>
    item.nama.toLowerCase().includes(keyword) ||
    (item.gelar && item.gelar.toLowerCase().includes(keyword))
  );
  renderTable(filtered);
});
