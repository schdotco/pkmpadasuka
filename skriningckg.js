(function (GM_xmlhttpRequest) {
'use strict';
      const request = GM_xmlhttpRequest;
   
/* =========================================================
   CONFIG SPREADSHEET
========================================================= */
const SHEET_ID = '1kDShNBXFk3QtrrGaEX0fTjmRd1zGjb0s9n21a_1oHSM';
const GID = '250649365';

const sleep = ms => new Promise(r => setTimeout(r,ms));
function normalizeNIK(v) { return String(v || '').replace(/\D/g,''); }

/* =========================================================
   SESSION & DYNAMIC TRACKER
========================================================= */
      function saveBOT(data) { GM_setValue('AUTO_SKRINING_DATA', JSON.stringify(data)); }
    function loadBOT() { const raw = GM_getValue('AUTO_SKRINING_DATA'); return raw ? JSON.parse(raw) : null; }
    function clearBOT() { GM_deleteValue('AUTO_SKRINING_DATA'); }

    function getCompleted() { return JSON.parse(GM_getValue('AUTO_SKRINING_COMPLETED') || '[]'); }
    function addCompleted(id) {
        const arr = getCompleted();
        if (!arr.includes(id)) arr.push(id);
        GM_setValue('AUTO_SKRINING_COMPLETED', JSON.stringify(arr));
    }
    function clearCompleted() { GM_deleteValue('AUTO_SKRINING_COMPLETED'); }

/* =========================================================
   DATA MATCHER (ANTI ERROR / FORMAT AMAN)
========================================================= */
function parseCSV(text) {
        const rows = []; let row = []; let current = ""; let insideQuote = false;
        for (let i = 0; i < text.length; i++) {
            const char = text[i]; const next = text[i + 1];
            if (char === '"') { if (insideQuote && next === '"') { current += '"'; i++; } else { insideQuote = !insideQuote; } }
            else if (char === ',' && !insideQuote) { row.push(current); current = ""; }
            else if ((char === '\n' || char === '\r') && !insideQuote) { if (current || row.length) { row.push(current); rows.push(row); row = []; current = ""; } }
            else { current += char; }
        }
        if (current || row.length) { row.push(current); rows.push(row); }
        return rows;
    }

    async function cariData(nikInput) {
        const target = normalizeNIK(nikInput);
        // Menggunakan request yang sudah disuntikkan dari Launcher
        return new Promise(resolve => {
            request({
                method: "GET", 
                url: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`,
                timeout: 10000, 
                onload: r => {
                    const rows = parseCSV(r.responseText);
                    for (let i = 1; i < rows.length; i++) {
                        if (rows[i].some(col => normalizeNIK(col) === target)) {
                            return resolve({
                                nik: target,
                                perkawinan: rows[i][14] || 'Belum Kawin'
                            });
                        }
                    }
                    resolve(null);
                },
                onerror: () => resolve(null)
            });
        });
    }

/* =========================================================
   DOM INTERACTOR (SURVEYJS SAFE)
========================================================= */
async function fillRadioSurveyJS(soalText, jawabanText) {
    try {
        const questions = [...document.querySelectorAll('.sd-question, .sv-question')];
        const targetQ = questions.find(q => (q.innerText||'').toLowerCase().includes(soalText.toLowerCase()));

        if (!targetQ) {
            console.warn("Soal tidak ditemukan:", soalText);
            return false;
        }

        // Temukan elemen wrapper item (biasanya .sd-item atau .sv-item)
        const items = [...targetQ.querySelectorAll('.sd-item, .sv-item')];

        // Debug: Log semua opsi yang terdeteksi agar kita tahu isinya apa
        const opsiTersedia = items.map(i => i.innerText.trim());
        console.log("Opsi ditemukan di web (" + soalText + "):", opsiTersedia);

        const targetItem = items.find(el => (el.innerText||'').toLowerCase().trim() === jawabanText.toLowerCase());

        if (targetItem) {
            const input = targetItem.querySelector('input[type="radio"]');
            if (input) {
                // Scroll agar terlihat
                targetItem.scrollIntoView({ behavior: 'smooth', block: 'center' });

                // Urutan eksekusi wajib agar state SurveyJS terupdate
                input.click();
                input.checked = true;
                input.dispatchEvent(new Event('mousedown', { bubbles: true }));
                input.dispatchEvent(new Event('mouseup', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('click', { bubbles: true }));

                console.log("[AI] Berhasil mengisi:", jawabanText);
                await sleep(500);
                return true;
            }
        }
    } catch(e) { console.error("Error mengisi radio:", e); }
    return false;
}

async function selectDropdownContext(soalText, optionText, typeChar = 't') {
    try {
        const questions = [...document.querySelectorAll('.sd-question, .sv-question')];
        const targetQ = questions.find(q => (q.innerText||'').toLowerCase().includes(soalText.toLowerCase()));

        if (targetQ) {
            const dropdown = targetQ.querySelector('.sd-dropdown, .sv-dropdown');
            if (dropdown) {
                dropdown.scrollIntoView({ behavior:'smooth', block:'center' });
                dropdown.click();
                await sleep(1000);

                const search = document.querySelector('input[type="text"][role="combobox"], input[aria-expanded="true"]');
                if (search && typeChar) {
                    search.focus();
                    search.value = typeChar;
                    search.dispatchEvent(new Event('input', { bubbles: true }));
                    search.dispatchEvent(new Event('change', { bubbles: true }));
                    await sleep(1000);
                }

                const opts = [...document.querySelectorAll('.sv-list__item-body, .sd-list__item-body')];
                const targetOpt = opts.find(el => (el.innerText||'').toLowerCase().includes(optionText.toLowerCase()));
                if (targetOpt) {
                    targetOpt.click();
                    await sleep(500);

                    // --- TRIK TAB KEY: Memicu event blur agar form memvalidasi data ---
                    document.activeElement.blur();
                    console.log("[AI] Dropdown terisi & Blur dipicu (seperti TAB).");
                    return true;
                } else {
                    dropdown.click();
                }
            }
        }
    } catch(e) { console.error(e); }
    return false;
}

/* =========================================================
   CORE LOGIC SKRINING MANDIRI (REVISI STATUS PERKAWINAN)
========================================================= */
async function handleSkriningMandiri(data) {
    updateStatus('Mengisi form...');
    await sleep(1500);


    // 1. STATUS PERKAWINAN (SMART MAPPER)
    if (data.perkawinan) {
        let p = data.perkawinan.toLowerCase();
        let target = 'menikah'; // Default sesuaikan dengan hasil Console

        if (p.includes('belum')) target = 'belum menikah';
        else if (p.includes('cerai hidup')) target = 'cerai hidup';
        else if (p.includes('cerai mati')) target = 'cerai mati';

        await fillRadioSurveyJS('status perkawinan', target);
    }
    // 2. DISABILITAS
    await fillRadioSurveyJS('disabilitas', 'non disabilitas');

    // 3. KANKER LEHER RAHIM (LOGIKA KONDISIONAL)
    // Jika menikah atau cerai, jawab YA. Selain itu TIDAK.
    let p = (data.perkawinan || '').toLowerCase();
    let isYes = p.includes('menikah') || p.includes('cerai') || (p.includes('kawin') && !p.includes('belum'));

    console.log("[DEBUG] Perkawinan:", p, "-> Kanker Leher Rahim:", isYes ? "YA" : "TIDAK");
    await fillRadioSurveyJS('kanker leher rahim', isYes ? 'ya' : 'tidak');

    // 4. KESEHATAN JIWA
    await fillRadioSurveyJS('kesehatan jiwa', 'tidak sama sekali');

    // 5. SAPU BERSIH (Isi semua radio yang kosong menjadi 'Tidak'/'Normal')
    const questions = document.querySelectorAll('.sd-question, .sv-question');
    questions.forEach(q => {
        // PENTING: Tambahkan 'kanker leher rahim' di daftar pengecualian di bawah ini!
        let qText = (q.innerText||'').toLowerCase();
        if (qText.match(/perkawinan|disabilitas|kesehatan jiwa|aktivitas fisik|kanker leher rahim/)) return;

        q.querySelectorAll('label').forEach(l => {
            let txt = (l.innerText||'').toLowerCase().trim();
            if (txt === 'tidak' || txt === 'normal' || txt === 'tidak ada') {
                let i = l.querySelector('input[type="radio"]');
                if (i && !i.checked) { i.click(); i.checked = true; }
            }
        });
    });

    // 6. AKTIVITAS FISIK (Isi & Pastikan terisi)
const activityQ = [...document.querySelectorAll('.sd-question, .sv-question')].find(q => (q.innerText||'').toLowerCase().includes('aktivitas fisik'));
    if (activityQ) {
        // Cek apakah dropdown sudah berisi 'tidak'
        const dropdown = activityQ.querySelector('.sd-dropdown, .sv-dropdown');
        if (dropdown && !(dropdown.innerText||'').toLowerCase().includes('tidak')) {
            updateStatus('Mengisi Aktivitas Fisik: Tidak...');
            await selectDropdownContext('aktivitas fisik', 'tidak', 't');
        }
    }

    // 7. NAVIGASI (Cari tombol Lanjut atau Kirim)
    await sleep(2000);
    const btnNext = document.querySelector('.sd-navigation__next-btn, .sd-navigation__complete-btn') ||
                    [...document.querySelectorAll('button')].find(b => (b.innerText||'').toLowerCase().match(/lanjut|kirim/));

    if (btnNext) {
        btnNext.click();
        await sleep(3500);
    }
}

/* =========================================================
   FORM LOOP ROUTER
========================================================= */
let BOT_RUNNING = false;

async function autoContinueForm(){
    const data = loadBOT();
    if(!data) return;

    BOT_RUNNING = true;
    updateStatus('MEMULAI PENGISIAN...');
    await sleep(3000);

    while (BOT_RUNNING && location.host.includes("form.kemkes.go.id")) {
        try {
            await handleSkriningMandiri(data);
        } catch(e) {
            console.error("Error bypass:", e);
            updateStatus("Melewati error, mencoba ulang...");
        }
        await sleep(2000);
    }
}

/* =========================================================
   DASHBOARD TRACKER (FITUR UTAMA CKG)
========================================================= */
function getNextTarget(){
    const completed = getCompleted();
    const btns = [...document.querySelectorAll('button')].filter(btn => {
        const txt = (btn.innerText || '').toLowerCase();
        return txt.includes('skrining mandiri') || txt.includes('input data') || txt.includes('tambah');
    });

    for(let btn of btns){
        let parent = btn.parentElement;
        for(let i=0; i<6; i++){
            if(!parent) break;
            let txt = (parent.innerText || '').replace(/\s+/g, ' ').trim().toLowerCase();
            // Buat ID unik berdasarkan teks di baris tabel/kotak tersebut
            if (txt.length > 10) {
                let id = txt.substring(0, 35);
                if(!completed.includes(id)){
                    return { btn: btn, id: id, title: txt.substring(0, 25) };
                }
                break;
            }
            parent = parent.parentElement;
        }
    }
    return null;
}

async function mainLoop(data){
    while (BOT_RUNNING && location.hostname.includes('sehatindonesiaku')) {
        const nextItem = getNextTarget();

        if(!nextItem){
            BOT_RUNNING = false;
            updateStatus('SELESAI SEMUA TARGET.\nSilakan ganti NIK untuk pasien baru.');
            // Bot berhenti, tetapi NIK tidak dihapus agar bisa dicek!
            break;
        }

        updateStatus('MEMBUKA TARGET:\n' + nextItem.title.toUpperCase());
        addCompleted(nextItem.id); // Tandai sudah diklik
        await sleep(2000);
        nextItem.btn.click();
        await sleep(4000);
    }
}

/* =========================================================
   UI MODERN & DRAGGABLE
========================================================= */
function updateStatus(text){ const el = document.getElementById('bot-status'); if(el) el.innerText = text; }
function stopBOT(){ BOT_RUNNING = false; clearBOT(); clearCompleted(); updateStatus('BOT DIHENTIKAN & NIK DIHAPUS.'); }

function createUI(){
    if(document.getElementById('auto-ckg-ui')) return;
    const box = document.createElement('div'); box.id = 'auto-ckg-ui';
    box.innerHTML = `
        <div id="drag-handle">SKRINING MANDIRI AI</div>
        <div id="bot-status">INISIALISASI...</div>
        <input id="nik-bot" placeholder="Masukkan NIK">
        <div id="btn-wrap">
            <button id="run-bot">START</button><button id="stop-bot">BATAL</button>
        </div>
    `;
    const style = document.createElement('style');
    style.innerHTML = `
        #auto-ckg-ui {
            position: fixed; top: 100px; right: 20px; width: 300px;
            background: rgba(15, 15, 15, 0.95); backdrop-filter: blur(15px);
            border: 1px solid rgba(0, 200, 255, 0.5); border-radius: 16px;
            z-index: 999999999; padding: 15px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            font-family: 'Segoe UI', sans-serif; color: white; cursor: default;
        }
        #drag-handle { padding: 5px; text-align: center; font-weight: bold; color: #00c8ff; cursor: move; margin-bottom: 10px; border-bottom: 1px solid #333; }
        #bot-status { background: rgba(0,0,0,0.4); border-radius: 8px; padding: 10px; min-height: 50px; margin-bottom: 10px; color: #00c8ff; font-size: 13px; text-align: center; white-space: pre-wrap; }
        #nik-bot { width: 100%; box-sizing: border-box; padding: 10px; border: none; border-radius: 8px; background: #333; color: white; margin-bottom: 10px; }
        #btn-wrap { display: flex; gap: 8px; }
        #run-bot, #stop-bot { flex: 1; border: none; padding: 10px; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.2s; }
        #run-bot { background: #00c8ff; color: #000; }
        #run-bot:hover { background: #009acc; }
        #stop-bot { background: #ff4444; color: white; }
    `;
    document.head.appendChild(style); document.body.appendChild(box);

// Ambil Data NIK Lama (Agar Tidak Hilang)
const savedData = loadBOT();
if(savedData && savedData.nik){
    document.getElementById('nik-bot').value = savedData.nik;
}

/* ================= DRAGGABLE ================= */

/* ================= DRAGGABLE ================= */

const handle = document.getElementById('drag-handle');

let isDragging = false;
let offsetX = 0;
let offsetY = 0;

handle.addEventListener('mousedown', (e) => {

    isDragging = true;

    const rect = box.getBoundingClientRect();

    // ubah posisi awal dari right menjadi left
    box.style.left = rect.left + 'px';
    box.style.top = rect.top + 'px';
    box.style.right = 'auto';

    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    box.style.opacity = '0.85';

    e.preventDefault();
});

document.addEventListener('mousemove', (e) => {

    if (!isDragging) return;

    box.style.left = (e.clientX - offsetX) + 'px';
    box.style.top = (e.clientY - offsetY) + 'px';
});

document.addEventListener('mouseup', () => {

    isDragging = false;
    box.style.opacity = '1';
});

/* ================= BUTTON ================= */

document.getElementById('run-bot').onclick = async ()=>{

    if(BOT_RUNNING) return alert('BOT SEDANG BERJALAN');

    const nik = document.getElementById('nik-bot').value;

    if(!nik) return alert('Masukkan NIK');

    updateStatus('MENCARI NIK DI SPREADSHEET...');

    const data = await cariData(nik);

    if(!data){
        return updateStatus('NIK TIDAK DITEMUKAN DI GOOGLE SHEETS');
    }

    BOT_RUNNING = true;

    saveBOT(data);

    clearCompleted();

    updateStatus(`Data Ketemu!\nPerkawinan: ${data.perkawinan}`);

    await sleep(1500);

    await mainLoop(data);
};

document.getElementById('stop-bot').onclick = stopBOT;
}

/* =========================================================
   INIT / PINTU UTAMA
========================================================= */
setInterval(createUI, 1000);

setTimeout(async ()=>{
    const isFormPage = location.hostname.includes('form.kemkes.go.id');
    const isMainPage = location.hostname.includes('sehatindonesiaku');

    if(isFormPage) {
        await autoContinueForm();
    } else if (isMainPage) {
        const data = loadBOT();
        if(data){
            BOT_RUNNING = true;
            updateStatus('MELANJUTKAN OTOMATIS...\nMencari Form Berikutnya');
            await sleep(3000);
            await mainLoop(data);
        } else {
            updateStatus('IDLE\nMasukkan NIK lalu klik START');
        }
    }
}, 1500);

})(typeof GM_xmlhttpRequest !== "undefined" ? GM_xmlhttpRequest : null);
