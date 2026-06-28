(function (GM_xmlhttpRequest) {
'use strict';
    const request = GM_xmlhttpRequest;

/* =========================================================
   CONFIG SPREADSHEET
========================================================= */
const SHEET_ID = '15vBz_H8dT9ZxuiEjkdW0VjOZmoCawp2eqtl32gpi0oY';
const GIDS = ['0', '846804574']; // Sesuaikan GID dengan urutan data yang akan diambil

const sleep = ms => new Promise(r => setTimeout(r,ms));
function normalizeNIK(v) { return String(v || '').replace(/\D/g,''); }

/* =========================================================
   HELPER MAPPING JAWABAN MEROKOK
========================================================= */
function jawabanMerokok(v){
    const text = String(v || '').toLowerCase().trim();
    return (text.includes('ya') || text.includes('rokok') || text.includes('perokok')) ? 'ya' : 'tidak';
}

/* =========================================================
   SESSION & DYNAMIC TRACKER
========================================================= */
function saveBOT(data) { GM_setValue('AUTO_SKRINING_DATA', JSON.stringify(data)); }
function loadBOT()     { const raw = GM_getValue('AUTO_SKRINING_DATA'); return raw ? JSON.parse(raw) : null; }
function clearBOT()    { GM_deleteValue('AUTO_SKRINING_DATA'); }

let BOT_RUNNING = false;
let cachedSheetData = null;

/* =========================================================
   UI STATUS FLOATING BOX
========================================================= */
function updateStatus(msg) {
    let box = document.getElementById('bot-status-box');
    if (!box) {
        box = document.createElement('div');
        box.id = 'bot-status-box';
        Object.assign(box.style, {
            position: 'fixed', bottom: '20px', right: '20px',
            backgroundColor: '#1e3a8a', color: 'white', padding: '15px 20px',
            borderRadius: '8px', zIndex: '9999', fontSize: '14px',
            fontWeight: 'bold', boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
            whiteSpace: 'pre-line', transition: 'all 0.3s'
        });
        document.body.appendChild(box);
    }
    box.innerText = msg;
}

/* =========================================================
   MAPPING FORM SKRINING ANAK
========================================================= */
const formSkriningAnak = [
    { id: "frm000110", name: "Faktor Risiko Gula Darah Anak", type: "radio", values: ["PPV00001035", "PPV00000483", "PPV00000485", "PPV00000491", "PPV00000493"] },
    { id: "frm000115", name: "Faktor Risiko Malaria", type: "radio", values: ["PPV00000581", "PPV00000591", "PPV00000607", "PPV00001233"] },
    { id: "frm000180", name: "Faktor Risiko TB - Dewasa & Lansia", type: "radio", values: ["PPV00000883"] },
    { id: "frm000112", name: "Gejala Cemas Remaja", type: "radio", values: ["PPV00000593", "PPV00000599", "PPV00000605"] },
    { id: "frm000125", name: "Gejala Depresi Remaja", type: "radio", values: ["PPV00000627", "PPV00000629", "PPV00000633"] },
    { id: "frm000123", name: "Kesehatan Reproduksi Putri", type: "radio", values: ["PPV00000565", "PPV00000569", "PPV00000571"] }, // Opsional
    { id: "frm000121", name: "Aktivitas Fisik", type: "number", values: ["3", "3"] }, // Default isian: 3 hari dan 3 hari
    { id: "frm000113", name: "Kelayakan Tes Kebugaran", type: "radio", values: ["PPV00000609", "PPV00000639", "PPV00000644", "PPV00000650"] },
    { id: "frm000118", name: "Perilaku Merokok - Anak Sekolah", type: "radio", values: ["PPV00000365", "PPV00000439"] }, // Default "Tidak"
    { id: "frm000114", name: "Faktor Risiko Hepatitis SD", type: "radio", values: ["PPV00000350", "PPV00000352", "PPV00000356", "PPV00000358"] }
];

/* =========================================================
   FUNGSI PENGISIAN FORM OTOMATIS
========================================================= */
async function autoContinueForm() {
    let data = loadBOT();
    if (!data) return;

    updateStatus(`Mengisi Form Skrining Anak...\nPasien: NIK Diproses`);
    
    // Logika custom untuk jawaban merokok jika sumber data Spreadsheet memiliki kolom merokok
    let customMerokok = data.merokok ? jawabanMerokok(data.merokok) : 'tidak';

    for (let form of formSkriningAnak) {
        // Cek apakah tombol form tersedia. Hal ini otomatis menangani filter form Kesehatan Reproduksi (L/P)
        let btnRow = document.querySelector(`#row${form.id} button`);
        
        if (btnRow) { 
            console.log(`[Auto-Bot] Membuka Form: ${form.name}`);
            btnRow.click();
            await sleep(1500); // Tunggu modal load
            
            let currentValues = [...form.values];
            
            // Override data rokok dengan data spesifik dari Spreadsheet jika ada
            if (form.id === "frm000118" && customMerokok === 'ya') {
                currentValues[0] = "PPV00000364"; // Jawaban "Ya" Merokok
            }

            if (form.type === "radio") {
                for (let val of currentValues) {
                    let radio = document.querySelector(`input[type="radio"][value="${val}"]`);
                    if (radio) {
                        radio.click();
                    } else {
                        let radioDecorator = document.querySelector(`input[value="${val}"]`);
                        if(radioDecorator && radioDecorator.nextElementSibling) {
                            radioDecorator.nextElementSibling.click();
                        }
                    }
                    await sleep(100); 
                }
            } else if (form.type === "number") {
                let inputs = document.querySelectorAll('input.sd-input.sd-text[type="number"]');
                for (let i = 0; i < inputs.length; i++) {
                    if (currentValues[i] && inputs[i]) {
                        inputs[i].value = currentValues[i];
                        inputs[i].dispatchEvent(new Event('input', { bubbles: true }));
                        inputs[i].dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    await sleep(100);
                }
            }

            await sleep(500);
            
            // Eksekusi tombol "Kirim" pada modal form
            let btnSubmit = document.querySelector('.sd-navigation__complete-btn');
            if (btnSubmit) {
                btnSubmit.click();
                await sleep(2000); // Tunggu animasi tutup modal dan request sukses
            }
        }
    }
    
    updateStatus('Semua Form Skrining Anak Selesai!\nMenyimpan data...');
    await sleep(2000);
    
    // Cari tombol simpan utama (Simpan Keseluruhan Skrining)
    let finalSaveBtn = Array.from(document.querySelectorAll('button')).find(el => el.innerText.includes('Simpan'));
    if (finalSaveBtn) {
        finalSaveBtn.click();
        clearBOT();
        updateStatus('Data Berhasil Disimpan.\nSilakan lanjut ke pasien berikutnya.');
    }
}

/* =========================================================
   MOCKUP BACKGROUND DOWNLOAD SPREADSHEET (SESUAI SNIPPET)
========================================================= */
async function cariData(nik) {
    // Fungsi simulasi fetch data dari Spreadsheet
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            cachedSheetData = true; 
            resolve(true);
        }, 1000);
    });
}

async function mainLoop(data) {
    // Logika pindah halaman jika diperlukan
    console.log("Melanjutkan loop...");
}

/* =========================================================
   MAIN OBSERVER / INTERVAL
========================================================= */
setInterval(async () => {
    // Penanda Halaman berdasarkan class atau url
    const isMainPage = document.querySelector('body'); // Ganti dengan selector halaman utama ASIK jika spesifik
    const isFormPage = document.querySelector('.table-pemeriksaan-mandiri'); 
    
    // Jangan tumpuk task jika BOT masih berjalan 
    if (BOT_RUNNING) return;

    if (isFormPage) {
        BOT_RUNNING = true;
        await autoContinueForm();
        BOT_RUNNING = false;
    } else if (isMainPage) {
        
        // 1. Cek apakah ada data pasien yang belum selesai dikerjakan
        const data = loadBOT();
        if(data){
            BOT_RUNNING = true;
            updateStatus('MELANJUTKAN OTOMATIS...\nMencari Form Berikutnya');
            await sleep(3000);
            await mainLoop(data);
        } else {
            // Tampilan default agar pop-up langsung aktif tanpa nge-freeze
            updateStatus('Menyiapkan Data\nMasukkan NIK lalu Tunggu sampai Database siap sebelum klik START');
        }

        // --- 2. FITUR PRE-LOAD BACKGROUND SEJATI ---
        if (!cachedSheetData) {
            cariData('000').then(() => {
                if (!BOT_RUNNING) {
                    updateStatus('Database Siap !\nklik START');
                }
            }).catch(err => {
                console.error("Gagal mendownload background data:", err);
            });
        }
    }
}, 2000); // 2000ms untuk meringankan beban script agar UI tidak freezing

})(typeof GM_xmlhttpRequest !== "undefined" ? GM_xmlhttpRequest : null);
