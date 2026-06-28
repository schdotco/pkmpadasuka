(function () {
'use strict';

/* =========================================================
   CONFIG SPREADSHEET
========================================================= */
const SHEET_ID = '15vBz_H8dT9ZxuiEjkdW0VjOZmoCawp2eqtl32gpi0oY';
const GIDS = ['0', '846804574']; // Sesuaikan dengan GID sheet Anda

const sleep = ms => new Promise(r => setTimeout(r,ms));
function normalizeNIK(v) { return String(v || '').replace(/\D/g,''); }

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
   HELPER UTILITIES
========================================================= */
async function waitForElement(selector, timeout = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        let el = document.querySelector(selector);
        if (el) return el;
        await sleep(100);
    }
    return null;
}

function setInputValue(inputEl, val) {
    if(!inputEl || val === undefined || val === null || val === '') return;
    inputEl.value = val;
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
}

/* =========================================================
   FUNGSI ADAPTIF (AUTO-DETECT JAWABAN)
========================================================= */
async function fillFormAdaptive(formId, data) {
    // 1. ISI TEXT/NUMBER DARI DATA SPREADSHEET (BB, TB, Tensi, GDS)
    let numberInputs = document.querySelectorAll('input.sd-input.sd-text[type="number"]');
    if (formId === 'frm000119') { // Gizi (BB & TB)
        if (numberInputs[0] && data.bb) setInputValue(numberInputs[0], data.bb);
        if (numberInputs[1] && data.tb) setInputValue(numberInputs[1], data.tb);
    } else if (formId === 'frm000266') { // Tensi (Sistol & Diastol)
        if (numberInputs[0] && data.sistol) setInputValue(numberInputs[0], data.sistol);
        if (numberInputs[1] && data.diastol) setInputValue(numberInputs[1], data.diastol);
    } else if (formId === 'frm000197') { // Gula Darah Remaja (GDS)
        if (numberInputs[0] && data.gds) setInputValue(numberInputs[0], data.gds);
    }
    await sleep(200);

    // 2. ADAPTIF ISI RADIO BUTTONS (Cari kata Tidak/Normal/Bukan)
    const radiogroups = document.querySelectorAll('[role="radiogroup"]');
    for (let group of radiogroups) {
        // Cek jika sudah terisi manual sebelumnya
        if (group.querySelector('input[type="radio"]:checked')) continue; 

        const items = Array.from(group.querySelectorAll('.sd-item.sd-radio'));
        let clicked = false;
        
        // Prioritas kata kunci untuk jawaban aman/sehat
        const targetWords = ['tidak ada', 'tidak', 'normal', 'bukan', 'negatif'];
        
        for (let word of targetWords) {
            let match = items.find(el => {
                let textEl = el.querySelector('.sv-string-viewer');
                let text = textEl ? textEl.innerText.trim().toLowerCase() : el.innerText.trim().toLowerCase();
                return text === word || text.includes(word);
            });
            
            if (match) {
                let radioControl = match.querySelector('input[type="radio"]');
                if(radioControl) { radioControl.click(); }
                else { match.click(); } // klik container-nya
                clicked = true;
                break;
            }
        }
        
        // Fallback: Jika pertanyaan tidak punya opsi di atas, klik item yang paling akhir (Biasanya susunan Ya/Tidak, index 1 adalah Tidak)
        if (!clicked && items.length > 0) {
            let lastItem = items[items.length - 1];
            let radioControl = lastItem.querySelector('input[type="radio"]');
            if(radioControl) { radioControl.click(); }
            else { lastItem.click(); }
        }
        await sleep(100);
    }

    // 3. ADAPTIF ISI DROPDOWN SURVEYJS (Kusta, Skabies, Kebugaran, dll)
    const dropdowns = document.querySelectorAll('.sd-input.sd-dropdown');
    for (let dd of dropdowns) {
        // Skip jika dropdown sudah memiliki isian
        const filterInput = dd.querySelector('input.sd-dropdown__filter-string-input');
        if (filterInput && filterInput.value.trim() !== '') continue; 
        
        const valueSpan = dd.querySelector('.sd-dropdown__value span.sv-string-viewer');
        if (valueSpan && valueSpan.innerText.trim() !== '' && valueSpan.innerText.trim() !== 'Pilih...') continue;

        // Buka menu dropdown
        dd.click(); 
        await sleep(400); 

        // Cari pop-up list yang muncul
        const popups = document.querySelectorAll('.sv-popup--show-pointer .sv-list__item, .sv-popup--dropdown .sv-list__item');
        if (popups.length > 0) {
            // Filter item yang tidak di hidden
            let listItems = Array.from(popups).filter(el => el.style.display !== 'none'); 
            let clicked = false;
            
            // Prioritas kata kunci dropdown
            const ddTargets = ['tidak ada', 'normal', 'baik', 'negatif'];
            for (let word of ddTargets) {
                let match = listItems.find(el => el.innerText.toLowerCase().includes(word));
                if (match) {
                    match.click();
                    clicked = true;
                    break;
                }
            }
            // Fallback: jika pilihan tidak ada yang cocok, pilih baris paling atas
            if (!clicked && listItems.length > 0) {
                listItems[0].click(); 
            }
        }
        await sleep(200);
    }
}

/* =========================================================
   FUNGSI UTAMA LOOP PENGISIAN FORM
========================================================= */
async function autoContinueForm() {
    let data = loadBOT();
    if (!data) return;

    updateStatus(`Mengisi Form Input Anak...\nPasien: NIK Diproses`);

    // Master List ID Form Layanan Anak
    const formList = [
        "frm000119", // Gizi
        "frm000266", // Tensi
        "frm000197", // Gula Darah Remaja
        "frm000199", // Frambusia
        "frm000198", // Kusta
        "frm000201", // Skabies
        "frm000137", // Telinga dan Mata
        "frm000131", // Gigi
        "frm000128", // Kebugaran Jasmani
        "frm000257", // Hepatitis
        "frm000117", // Malaria
        "frm000186", // Kadar CO (Merokok)
        "frm000182", // TB (Faktor Risiko)
        "frm000184"  // TB (Pemeriksaan)
    ];

    for (let fId of formList) {
        let btnRow = document.querySelector(`#row${fId} button`);
        if (btnRow) { 
            // Cek apabila status form tersebut sudah hijau ("Selesai diperiksa")
            let rowParent = btnRow.closest('.w-full.grid');
            if (rowParent && rowParent.innerText.includes('Selesai diperiksa')) {
                continue; // Skip jika sudah selesai
            }
            
            console.log(`[Auto-Bot] Membuka Form: ${fId}`);
            btnRow.click();
            
            let isModal = await waitForElement('.sd-page', 3000);
            if (isModal) {
                await sleep(1500); // Waktu render pop-up form
                
                // --- Jalankan Fitur Auto-Detect Adaptif ---
                await fillFormAdaptive(fId, data);
                // ------------------------------------------

                await sleep(500);
                
                // Cari dan klik tombol submit
                let btnSubmit = document.querySelector('.sd-navigation__complete-btn');
                if (btnSubmit) {
                    btnSubmit.click();
                    await sleep(2000); 
                }
            }
        }
    }
    
    updateStatus('Semua Form Input Anak Selesai!\nMenyimpan data...');
    await sleep(2000);
    
    // Auto click "Simpan" utama secara otomatis jika tugas selesai
    let finalSaveBtn = Array.from(document.querySelectorAll('button')).find(el => el.innerText.includes('Simpan') && !el.className.includes('sd-navigation'));
    if (finalSaveBtn) {
        finalSaveBtn.click();
        clearBOT();
        updateStatus('Data Berhasil Disimpan.\nSilakan lanjut ke pasien berikutnya.');
    } else {
        clearBOT();
        updateStatus('Selesai.\nSilakan klik Simpan secara manual jika tombol gagal tertangkap.');
    }
}

/* =========================================================
   MOCKUP BACKGROUND LOAD SPREADSHEET (Sesuai v3)
========================================================= */
async function cariData(nik) {
    return new Promise((resolve) => {
        setTimeout(() => {
            cachedSheetData = true; 
            resolve(true);
        }, 1000);
    });
}

async function mainLoop(data) {
    console.log("Melanjutkan loop...");
}

/* =========================================================
   MAIN OBSERVER / INTERVAL
========================================================= */
setInterval(async () => {
    // Deteksi container utama tabel form (Berfungsi di Menu Dewasa & Menu Anak)
    const isFormPage = document.querySelector('#tableLayanan') || document.querySelector('.table-pemeriksaan-mandiri'); 
    const isMainPage = document.querySelector('body'); 
    
    // Mencegah looping tumpang tindih
    if (BOT_RUNNING) return;

    if (isFormPage) {
        BOT_RUNNING = true;
        await autoContinueForm();
        BOT_RUNNING = false;
    } else if (isMainPage) {
        const data = loadBOT();
        if(data){
            BOT_RUNNING = true;
            updateStatus('MELANJUTKAN OTOMATIS...\nMencari Form Berikutnya');
            await sleep(3000);
            await mainLoop(data);
        } else {
            updateStatus('IDLE | Menyiapkan Data\nMasukkan NIK lalu Tunggu Database Siap');
        }

        if (!cachedSheetData) {
            cariData('000').then(() => {
                if (!BOT_RUNNING) {
                    updateStatus('Database Siap!\nKlik START');
                }
            }).catch(err => {
                console.error("Gagal mendownload data:", err);
            });
        }
    }
}, 2000); // Beban interval dimanage per 2 detik agar komputer/browser tidak berat

})();
