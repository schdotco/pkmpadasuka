(function () {
'use strict';

/* =========================================================
   CONFIG
========================================================= */
const SHEET_ID = '15vBz_H8dT9ZxuiEjkdW0VjOZmoCawp2eqtl32gpi0oY';
const GID = '0';

const TARGETS = [
    { id: 'gizi', txt: 'gizi (bb' },
    { id: 'gula', txt: 'gula darah' },
    { id: 'tensi', txt: 'tekanan darah' },
    { id: 'frambusia', txt: 'frambusia' },
    { id: 'kusta', txt: 'kusta' },
    { id: 'skabies', txt: 'skabies' },
    { id: 'telinga_mata', txt: 'telinga dan mata' },
    { id: 'karies', txt: 'karies' },
    { id: 'periodontal', txt: 'periodontal' },
    { id: 'puma', txt: 'puma' }, 
    { id: 'kanker_paru', txt: 'skrining kanker paru' }
];

const sleep = ms => new Promise(r => setTimeout(r,ms));
function normalizeNIK(v) { return String(v || '').replace(/\D/g,''); }

/* =========================================================
   SESSION & DYNAMIC TRACKER (FIXED UNTUK LOADER EKSTERNAL)
========================================================= */
function saveBOT(data) { 
    try { GM_setValue('AUTO_CKG_DATA', JSON.stringify(data)); } 
    catch(e) { localStorage.setItem('AUTO_CKG_DATA', JSON.stringify(data)); }
}
function loadBOT() { 
    try { 
        const raw = GM_getValue('AUTO_CKG_DATA'); 
        return raw ? JSON.parse(raw) : null; 
    } catch(e) { 
        const raw = localStorage.getItem('AUTO_CKG_DATA'); 
        return raw ? JSON.parse(raw) : null; 
    }
}
function clearBOT() { 
    try { GM_deleteValue('AUTO_CKG_DATA'); } 
    catch(e) { localStorage.removeItem('AUTO_CKG_DATA'); }
}

function getCompleted() { 
    try { return JSON.parse(GM_getValue('AUTO_CKG_COMPLETED') || '[]'); }
    catch(e) { return JSON.parse(localStorage.getItem('AUTO_CKG_COMPLETED') || '[]'); }
}
function addCompleted(id) {
    const arr = getCompleted();
    if(!arr.includes(id)) arr.push(id);
    try { GM_setValue('AUTO_CKG_COMPLETED', JSON.stringify(arr)); }
    catch(e) { localStorage.setItem('AUTO_CKG_COMPLETED', JSON.stringify(arr)); }
}
function clearCompleted() { 
    try { GM_deleteValue('AUTO_CKG_COMPLETED'); }
    catch(e) { localStorage.removeItem('AUTO_CKG_COMPLETED'); }
}

/* =========================================================
   DATA MATCHER (OPTIMASI DENGAN CACHE)
========================================================= */
let cachedSheetData = null;

async function cariData(nikInput){
    try {
        const target = normalizeNIK(nikInput);
        if (!cachedSheetData) {
            updateStatus("MENGUNDUH DATA SPREADSHEET...");
            const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${GID}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('Gagal terhubung ke Google Sheet');
            const txt = await res.text();
            cachedSheetData = JSON.parse(txt.substring(47, txt.length - 2)).table.rows;
        }

        for(const r of cachedSheetData){
            const cells = r.c.map(x => x ? String(x.v || '') : '');
            if(normalizeNIK(cells[0] || cells[1] || cells[2]) === target || cells.find(col => normalizeNIK(col) === target)){
                return {
                    nik: target,
                    nama: cells[7] || '',
                    sistole: cells[37] || '120',
                    diastole: cells[38] || '80',
                    bb: cells[40] || '60',
                    tb: cells[41] || '165',
                    lp: cells[43] || '80',
                    gula: cells[58] || '110',
                    mata: cells[70] || 'Tidak',
                    merokok: cells[71] || 'Tidak',
                };
            }
        }
        return null; 
    } catch (error) {
        console.error("Terjadi masalah jaringan:", error);
        updateStatus("ERROR JARINGAN: Cek Koneksi");
        return null; 
    }
}

/* =========================================================
   DOM INTERACTOR CORE
========================================================= */
function triggerClick(el){
    if(!el) return;
    el.scrollIntoView({ behavior:'smooth', block:'center' });
    const rect = el.getBoundingClientRect();
    ['pointerdown','mousedown','pointerup','mouseup','click'].forEach(type=>{
        el.dispatchEvent(new MouseEvent(type,{ bubbles:true, cancelable:true, clientX: rect.left + 5, clientY: rect.top + 5 }));
    });
    el.click();
}

function forceInject(element, value) {
    if (!element) return;
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    nativeSetter.call(element, value);
    if (element._valueTracker) {
        element._valueTracker.setValue('');
    }
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
    element.blur();
}

/* =========================================================
   SURVEYJS DROPDOWN & RADIO ENGINE
========================================================= */
async function selectDropdownSurveyJS(optionText) {
    let success = false;
    const dropdownTrigger = document.querySelector('.sd-dropdown, .sv-dropdown');
    if (dropdownTrigger) {
        triggerClick(dropdownTrigger);
        await sleep(1000);
        const searchInput = document.querySelector('input[type="text"][role="combobox"], input[aria-expanded="true"]');
        if (searchInput) { forceInject(searchInput, 't'); await sleep(500); }
        const targetOpt = [...document.querySelectorAll('.sv-list__item-body, .sd-list__item-body')].find(el =>
            el.innerText.toLowerCase().includes(optionText.toLowerCase())
        );
        if (targetOpt) {
            triggerClick(targetOpt);
            await sleep(500);
            success = true;
        } else triggerClick(dropdownTrigger); 
    }
    return success;
}

async function pilihSemuaRadioLimit(text, limit = 99, exact = false) {
    let clicked = 0;
    const items = [...document.querySelectorAll('label, .ant-radio-wrapper, .sd-item, .sv-item')];
    
    for (const el of items) {
        if (clicked >= limit) break;
        const txt = (el.innerText || '').trim().toLowerCase();
        const target = text.toLowerCase();
        const isMatch = exact ? (txt === target) : txt.includes(target);
        
        if (isMatch) {
            const radio = el.querySelector('input[type="radio"]');
            const questionContainer = el.closest('.sd-question, .sv-question, [role="radiogroup"]');
            let isQuestionAnswered = false;
            if (questionContainer) {
                const allRadiosInQuestion = questionContainer.querySelectorAll('input[type="radio"]');
                isQuestionAnswered = Array.from(allRadiosInQuestion).some(r => r.checked);
            }

            if (radio && !isQuestionAnswered) {
                radio.click();
                radio.dispatchEvent(new Event('change', { bubbles: true }));
                radio.dispatchEvent(new Event('input', { bubbles: true }));
                await sleep(600);
                clicked++;
            }
        }
    }
    return clicked;
}

async function isiRadioSurveyJS(soalSelector, teksJawaban) {
    const questions = [...document.querySelectorAll('.sd-question, .sv-question')];
    const targetQ = questions.find(q => q.innerText.toLowerCase().includes(soalSelector.toLowerCase()));
    if (!targetQ) return false;
    const labels = [...targetQ.querySelectorAll('label')];
    const targetLabel = labels.find(l => l.innerText.toLowerCase().includes(teksJawaban.toLowerCase()));
    if (targetLabel) {
        const input = targetLabel.querySelector('input[type="radio"]');
        if (input && !input.checked) {
            input.click(); input.checked = true;
            input.dispatchEvent(new Event('mousedown', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('click', { bubbles: true }));
            await sleep(800);
            return true;
        }
    }
    return false;
}

async function handleTelingaMata(data) {
    updateStatus('MENGISI: TELINGA & MATA...');
    await isiRadioSurveyJS('serumen impaksi', 'tidak ada serumen impaksi');
    await sleep(500);
    await selectDropdownSurveyJS('tidak ada infeksi');
    await sleep(500);
    await isiRadioSurveyJS('tajam pendengaran', 'normal');
    await sleep(500);

   console.log('[MATA]', JSON.stringify(data.mata));
   updateStatus('MATA: ' + JSON.stringify(data.mata));
    if ((data.mata || '').toLowerCase() === 'ya') {
        await isiRadioSurveyJS('tajam penglihatan', 'curiga gangguan penglihatan');
        await sleep(1500);
        await isiRadioSurveyJS('hasil pemeriksaan visus', 'gangguan penglihatan ringan');
    } else {
        await isiRadioSurveyJS('tajam penglihatan', 'normal (visus 6/6 - 6/12)');
    }

    await sleep(500);
    await isiRadioSurveyJS('pupil', 'normal');
}

/* =========================================================
   KLIK KIRIM & VALIDASI
========================================================= */
function isFormValid() {
    const questions = document.querySelectorAll('.sd-question, .sv-question');
    for (let q of questions) {
        const pertanyaan = q.innerText.toLowerCase();
        if (
            pertanyaan.includes('pinhole') ||
            pertanyaan.includes('funduskopi') ||
            pertanyaan.includes('foto torax') ||
            pertanyaan.includes('foto toraks')
        ) {
            continue;
        }

        const radios = q.querySelectorAll('input[type="radio"]');
        if (radios.length > 0) {
            const hasSelected = Array.from(radios).some(r => r.checked);
            if (!hasSelected) {
                return { valid: false, container: q };
            }
        }
    }
    return { valid: true };
}

async function klikKirim() {
    updateStatus('Validasi form...');
    await sleep(2000);
    let check = isFormValid();
   while (!check.valid) {
        updateStatus('Mengisi soal kosong...');
        const labels = check.container.querySelectorAll('label');
        for (let l of labels) {
            let labelText = l.innerText.toLowerCase();
            if (labelText.includes('normal') || labelText.includes('tidak')) {
                const input = l.querySelector('input[type="radio"]');
                if (input && !input.checked) {
                    input.click();
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    await sleep(800);
                    break; 
                }
            }
        }
        await sleep(1000);
        check = isFormValid(); 
   }
   const btn = document.querySelector('.sd-navigation__complete-btn') ||
                [...document.querySelectorAll('button')].find(b => (b.innerText||'').toLowerCase().includes('kirim'));
    if (btn) {
        updateStatus('Mengirim data...');
        btn.click();
        await sleep(4000);
        return true;
    } else {
        updateStatus('Tombol kirim tidak ketemu!');
        return false;
    }
}

/* =========================================================
   FORM FILLER LOGIC
========================================================= */
async function autoContinueForm() {
    const data = loadBOT();
    if (!data) {
        updateStatus('IDLE / Siap Digunakan');
        return;
    }

    BOT_RUNNING = true;
    updateStatus('MENGISI FORM...');
    await sleep(4000);

    const title = document.body.innerText.toLowerCase();
    const realInputs = [...document.querySelectorAll('input')].filter(el =>
        (!el.type || el.type === 'text' || el.type === 'number') && !el.closest('.ant-select') && !el.closest('.sd-dropdown')
    );

    let currentId = null;

    if(title.includes('gizi (bb') || title.includes('lingkar perut')){
        currentId = 'gizi'; updateStatus('MENGISI TAHAP: GIZI');
        const inputBB = document.querySelector('input[placeholder*="satuan kg" i]') || document.querySelector('input[placeholder*="Berat Badan" i]') || realInputs[0];
        const inputTB = document.querySelector('input[placeholder*="tinggi badan" i]') || realInputs[1];
        const inputLP = realInputs.find(el => (el.placeholder || '').toLowerCase().includes('hasil pengukuran') && !(el.placeholder || '').toLowerCase().includes('tinggi badan')) || realInputs[2];
        
        if(inputBB) forceInject(inputBB, data.bb); await sleep(800);
        if(inputTB) forceInject(inputTB, data.tb); await sleep(800);
        if(inputLP) forceInject(inputLP, data.lp); await sleep(1000);
    }
    else if(title.includes('gula darah')){
        currentId = 'gula'; updateStatus('MENGISI TAHAP: GULA DARAH');
        await pilihSemuaRadioLimit('tidak', 99, true); await sleep(800);
        if(realInputs[0]) forceInject(realInputs[0], data.gula); await sleep(1000);
    }
    else if(title.includes('tekanan darah')){
        currentId = 'tensi'; updateStatus('MENGISI TAHAP: TEKANAN DARAH');
        await pilihSemuaRadioLimit('tidak', 99, true); await sleep(800);
        const inSistol = document.querySelector('input[placeholder*="Sistolik" i]') || realInputs[0];
        const inDiastol = document.querySelector('input[placeholder*="Diastolik" i]') || realInputs[1];
        if(inSistol) forceInject(inSistol, data.sistole); await sleep(800);
        if(inDiastol) forceInject(inDiastol, data.diastole); await sleep(1000);
    }
    else if(title.includes('frambusia')){
        currentId = 'frambusia'; updateStatus('MENGISI TAHAP: FRAMBUSIA');
        await pilihSemuaRadioLimit('tidak ada', 99, false);
        await selectDropdownSurveyJS('tidak ada');
    }
    else if(title.includes('kusta')){
        currentId = 'kusta'; updateStatus('MENGISI TAHAP: KUSTA');
        await selectDropdownSurveyJS('tidak ada');
    }
    else if(title.includes('skabies')){
        currentId = 'skabies'; updateStatus('MENGISI TAHAP: SKABIES');
        await selectDropdownSurveyJS('tidak ada');
    }
    else if(title.includes('telinga dan mata')){
        currentId = 'telinga_mata';
        await handleTelingaMata(data);
    }
    else if(title.includes('karies')){
        currentId = 'karies'; updateStatus('MENGISI TAHAP: KARIES');
        await pilihSemuaRadioLimit('tidak', 1, true);
        await selectDropdownSurveyJS('tidak', 1);
    }
    else if(title.includes('periodontal')){
        currentId = 'periodontal'; updateStatus('MENGISI TAHAP: PERIODONTAL');
        await pilihSemuaRadioLimit('tidak', 2, true);
        await selectDropdownSurveyJS('tidak', 2);
    }
    else if(title.includes('skrining kanker paru') && (title.includes('riwayat merokok') || title.includes('skrining kanker paru'))) {
        currentId = 'kanker_paru'; 
        updateStatus('MENGISI TAHAP: KANKER PARU');
        await sleep(2000);

        let isPerokok = (data.merokok || '').toLowerCase().includes('ya') || 
                        (data.merokok || '').toLowerCase().includes('rokok');

        await isiRadioSurveyJS('didiagnosis atau menderita kanker', 'tidak pernah didiagnosis');
        await isiRadioSurveyJS('ada anggota keluarga yang menderita kanker', 'tidak ada keluarga');

        if (isPerokok) {
            await isiRadioSurveyJS('riwayat merokok', 'perokok aktif');
        } else {
            await isiRadioSurveyJS('riwayat merokok', 'tidak pernah merokok');
        }

        await isiRadioSurveyJS('zat karsinogenik', 'Tidak tempat kerja mengandung zat karsinogenik');
        await isiRadioSurveyJS('berpotensi tinggi', 'Tidak memiliki tempat tinggal berpotensi tinggi');
        await isiRadioSurveyJS('dalam rumah yang tidak sehat', 'Memiliki lingkungan dalam rumah yang sehat');
        await isiRadioSurveyJS('penyakit paru kronik', 'tidak pernah didiagnosis penyakit paru kronik');
        await sleep(500);
    }
    else if(title.includes('puma') || title.includes('ppok')){
        currentId = 'puma'; updateStatus('MENGISI TAHAP: PPOK (PUMA)');

        let isPerokok = (data.merokok || '').toLowerCase().includes('ya') || 
                        (data.merokok || '').toLowerCase().includes('rokok');

        await isiRadioSurveyJS('mempunyai riwayat merokok', isPerokok ? 'iya' : 'tidak');
        await sleep(400);

        await isiRadioSurveyJS('napas pendek', 'tidak');
        await isiRadioSurveyJS('mempunyai dahak', 'tidak');
        await isiRadioSurveyJS('batuk saat sedang tidak menderita', 'tidak');
        await isiRadioSurveyJS('spirometri', 'tidak');
        await sleep(500);
    }

    if(currentId) addCompleted(currentId);
    await klikKirim();
    updateStatus('Menunggu sistem pindah halaman...');
}

/* =========================================================
   TRACKER ROUTER
========================================================= */
function getNextTarget(){
    const completed = getCompleted();
    const btns = [...document.querySelectorAll('button')].filter(btn => {
        const text = (btn.innerText || '').toLowerCase();
        return text.includes('input data') || text.includes('mulai pemeriksaan');
    });
    
    for(let btn of btns){
        let parent = btn.parentElement;
        for(let i=0; i<10; i++){
            if(!parent) break;
            const txt = (parent.innerText || '').replace(/\s+/g,' ').trim().toLowerCase();
            const found = TARGETS.find(t => txt.includes(t.txt));
            if(found && !completed.includes(found.id)){
                return { btn: btn, id: found.id, title: found.txt };
            } else if(found) break;
            parent = parent.parentElement;
        }
    }
    return null;
}

async function mainLoopCKG(data){
    updateStatus('MENCARI ANTRIAN...');
    await sleep(2000); 
    
    let nextItem = getNextTarget();
    
    if(!nextItem) {
        console.warn("Tombol tidak ketemu, mencoba scan ulang dalam 2 detik...");
        await sleep(2000);
        nextItem = getNextTarget();
    }

    if(!nextItem){
        clearBOT(); clearCompleted(); BOT_RUNNING = false;
        updateStatus('SELESAI SEMUA PEMERIKSAAN'); 
        // alert('BOT SUKSES INPUT SEMUA PEMERIKSAAN'); // Alert dimatikan agar mode Auto-Pilot berjalan lancar tanpa terhenti
        return;
    }
    
    updateStatus('MEMBUKA TARGET:\n' + nextItem.title.toUpperCase());
    await sleep(1000);
    
    // 1. Klik Tombol "Input Data" / "Mulai Pemeriksaan"
    triggerClick(nextItem.btn);

    // 2. --- BYPASS POP-UP KONFIRMASI TANGGAL ---
    updateStatus('Konfirmasi Tanggal...');
    for(let i=0; i<15; i++){
        await sleep(500);
        const modalText = document.body.innerText.toLowerCase();
        
        if(modalText.includes("konfirmasi tanggal pemeriksaan")) {
            const btnSimpan = Array.from(document.querySelectorAll('button')).find(b => 
                (b.innerText || "").trim() === "Simpan" && 
                b.offsetParent !== null
            );
            
            if(btnSimpan){
                btnSimpan.click();
                console.log("[BOT] Tanggal Pemeriksaan berhasil dikonfirmasi.");
                break; 
            }
        }
    }
}

/* =========================================================
   PENGGANTI UI (HANYA MENCETAK LOG DI CONSOLE)
========================================================= */
let BOT_RUNNING = false;

function updateStatus(text){ 
    console.log("[INPUT CKG BOT] " + text); 
}

function stopBOT(){ 
    BOT_RUNNING = false; 
    clearBOT(); 
    clearCompleted(); 
    updateStatus('BOT DIHENTIKAN. DATA DIRESET.'); 
}

/* =========================================================
   INIT / PINTU UTAMA & JEMBATAN MASTER UI
========================================================= */
async function waitForElement(selector, timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (document.querySelector(selector)) return true;
        await sleep(500);
    }
    return false;
}

(async () => {
    const isFormPage = location.href.includes('form') || location.href.includes('form.kemkes.go.id');
    const isReady = await waitForElement(isFormPage ? 'input' : 'button', 10000); 
    
    if (isReady) {
        if(isFormPage){
            await autoContinueForm();
        } else {
            let data = loadBOT();

            // JEMBATAN KE MASTER UI LAUNCHER:
            let isMasterRunning = false;
            let masterNIK = '';
            try {
                isMasterRunning = GM_getValue('BOT_RUNNING_STATE', false);
                masterNIK = GM_getValue('MASTER_NIK_INPUT', '');
            } catch(e) {}

            // Jika Master UI aktif dan menyuruh bot bekerja tapi data belum ada
            if (!data && isMasterRunning && masterNIK.length >= 16) {
                updateStatus('Mendapat instruksi dari Master UI. Mengunduh data...');
                data = await cariData(masterNIK);
                if (data) {
                    saveBOT(data);
                    clearCompleted();
                } else {
                    updateStatus('Data NIK Master tidak ditemukan di spreadsheet Input CKG.');
                }
            }

            // Jika data berhasil diamankan (dari Resume atau dari Master UI)
            if(data){
                BOT_RUNNING = true;
                updateStatus('MELANJUTKAN OTOMATIS...\nJangan tekan apapun');
                await sleep(1000);
                await mainLoopCKG(data);
            } else {
                updateStatus('IDLE / Menunggu perintah atau data dari Master UI');

                // --- FITUR PRE-LOAD BACKGROUND SEJATI ---
                if (!cachedSheetData) {
                    cariData('000').then(() => {
                        if (!BOT_RUNNING) {
                            updateStatus('Database Siap (Cache Penuh)!');
                        }
                    }).catch(err => {
                        console.error("Gagal pre-load data dari background:", err);
                    });
                }
                // ----------------------------------------
            }
        }
    } else {
        updateStatus('GAGAL: Halaman lambat dimuat (Timeout)');
    }
})();
   
})();
