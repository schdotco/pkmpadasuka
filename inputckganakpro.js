(function () {
'use strict';

/* =========================================================
   MODUL ESTAFET, AUDIO & HUMANIZED DELAY
========================================================= */
// 1. Mengubah fungsi jeda menjadi tidak tertebak (Anti-Banned)
function randomJeda(min, max) { 
    if(!max) max = min + 300; // Jeda acak +300ms dari waktu asli
    return new Promise(r => setTimeout(r, Math.random() * (max - min) + min)); 
}

// 2. Synthesizer Suara Tanpa File MP3 (Bebas Error CORS)
function playSound(type) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        if (type === 'sukses') { 
            osc.type = 'sine'; osc.frequency.setValueAtTime(880, ctx.currentTime);
            gain.gain.setValueAtTime(0.5, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
            osc.start(); osc.stop(ctx.currentTime + 0.5);
        } else if (type === 'selesai') { 
            osc.type = 'triangle'; osc.frequency.setValueAtTime(523.25, ctx.currentTime); 
            osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.2); 
            osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.4); 
            gain.gain.setValueAtTime(0.5, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1);
            osc.start(); osc.stop(ctx.currentTime + 1);
        }
    } catch(e) {}
}

// 3. Radar Deteksi Umur (Untuk Cabang Anak / Dewasa)
function getKategoriUmur(tglLahir) {
    if (!tglLahir) return 'dewasa';
    let p = tglLahir.split(/[-/]/);
    let y = p[0].length === 4 ? p[0] : (p[2] || new Date().getFullYear());
    return (new Date().getFullYear() - parseInt(y)) < 18 ? 'anak' : 'dewasa';
}

/* =========================================================
   CONFIG - VERSI KHUSUS ANAK / REMAJA (FIXED TARGETS)
========================================================= */
const SHEET_ID = '1-We9wNftLhF2Ttd0ukfKpuK2IhM_YTg-mAeScMeDQNI';
const GIDS = ['1783755807', '1121908280'];

// TARGETS dioptimalkan agar ADAPTIF dan sangat presisi dengan nama menu di ASIK
const TARGETS = [
    { id: 'gizi', txt: 'gizi anak' },
    { id: 'gizi_balita', txt: 'pertumbuhan' },
    { id: 'tensi', txt: 'tekanan darah anak' },
    { id: 'gula', txt: 'pemeriksaan gula darah anak' },
    { id: 'tb', txt: 'x-ray tb' },
    { id: 'frambusia', txt: 'frambusia' },
    { id: 'kusta', txt: 'kusta' },
    { id: 'skabies', txt: 'skabies' },
    { id: 'telinga_mata', txt: 'telinga dan mata' },
    { id: 'gigi', txt: 'pemeriksaan gigi' },
    { id: 'jasmani', txt: 'kebugaran jasmani' }
];

const sleep = ms => new Promise(r => setTimeout(r,ms));
function normalizeNIK(v) { return String(v || '').replace(/\D/g,''); }

/* =========================================================
   SESSION & DYNAMIC TRACKER
========================================================= */
function saveBOT(data) { 
    try { 
        GM_setValue('AUTO_CKG_ANAK_DATA', JSON.stringify(data)); 
        GM_setValue('LAST_USED_NIK', data.nik); // Simpan NIK untuk estafet
    } 
    catch(e) { 
        localStorage.setItem('AUTO_CKG_ANAK_DATA', JSON.stringify(data)); 
        localStorage.setItem('LAST_USED_NIK', data.nik); 
    }
}
function loadBOT() { 
    try { 
        const raw = GM_getValue('AUTO_CKG_ANAK_DATA'); 
        return raw ? JSON.parse(raw) : null; 
    } catch(e) { 
        const raw = localStorage.getItem('AUTO_CKG_ANAK_DATA'); 
        return raw ? JSON.parse(raw) : null; 
    }
}
function clearBOT() { 
    try { GM_deleteValue('AUTO_CKG_ANAK_DATA'); } 
    catch(e) { localStorage.removeItem('AUTO_CKG_ANAK_DATA'); }
}

function getCompleted() { 
    try { return JSON.parse(GM_getValue('AUTO_CKG_ANAK_COMPLETED') || '[]'); }
    catch(e) { return JSON.parse(localStorage.getItem('AUTO_CKG_ANAK_COMPLETED') || '[]'); }
}
function addCompleted(id) {
    const arr = getCompleted();
    if(!arr.includes(id)) arr.push(id);
    try { GM_setValue('AUTO_CKG_ANAK_COMPLETED', JSON.stringify(arr)); }
    catch(e) { localStorage.setItem('AUTO_CKG_ANAK_COMPLETED', JSON.stringify(arr)); }
}
function clearCompleted() { 
    try { GM_deleteValue('AUTO_CKG_ANAK_COMPLETED'); }
    catch(e) { localStorage.removeItem('AUTO_CKG_ANAK_COMPLETED'); }
}

/* =========================================================
   INDEXEDDB CACHE HELPER
========================================================= */
const DB_NAME = 'CKG_CACHE_DB';
const STORE_NAME = 'SheetDataStore';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getCacheDB(key) {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        return null;
    }
}

async function setCacheDB(key, value) {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(value, key);
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        return false;
    }
}

/* =========================================================
   DATA MATCHER
========================================================= */
function parseCSV(text) {
    if (!text) return [];
    const rows = [];
    let row = [];
    let current = "";
    let insideQuote = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const next = text[i + 1];

        if (char === '"') {
            if (insideQuote && next === '"') {
                current += '"';
                i++;
            } else {
                insideQuote = !insideQuote;
            }
        } else if (char === ',' && !insideQuote) {
            row.push(current);
            current = "";
        } else if ((char === '\n' || char === '\r') && !insideQuote) {
            if (current || row.length) {
                row.push(current);
                rows.push(row);
                row = [];
                current = "";
            }
        } else {
            current += char;
        }
    }

    if (current || row.length) {
        row.push(current);
        rows.push(row);
    }
    return rows;
}

let cachedSheetData = null;

async function cariData(nikInput) {
    try {
        const target = normalizeNIK(nikInput);
        
        if (!cachedSheetData || cachedSheetData.length === 0) {
            
            let savedCache = null;
            let cacheTime = 0;
            const EXPIRATION_TIME = 4 * 60 * 60 * 1000; 
            const now = Date.now();

            try {
                savedCache = await getCacheDB('CKG_SHEET_DATA');
                cacheTime = await getCacheDB('CKG_SHEET_TIME') || 0;
            } catch(e) {
                console.warn("Gagal membaca IndexedDB", e);
            }

            if (savedCache && savedCache.length > 0 && (now - cacheTime < EXPIRATION_TIME)) {
                console.log('[CACHE READY] Memuat data dari IndexedDB...');
                cachedSheetData = savedCache;
            } 
            else {
                updateStatus("MENGUNDUH DATA SPREADSHEET...");
                cachedSheetData = [];
                
                for (const gid of GIDS) {
                    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
                    const res = await fetch(url);
                    if (!res.ok) continue;
                    
                    const csvText = await res.text();
                    if (!csvText) continue;
                    
                    const rows = parseCSV(csvText);
                    if (rows && rows.length > 1) {
                        if (cachedSheetData.length === 0) {
                            cachedSheetData = rows;
                        } else {
                            for (let i = 1; i < rows.length; i++) {
                                cachedSheetData.push(rows[i]);
                            }
                        }
                    }
                }
                
                console.log('[DOWNLOAD SELESAI]', cachedSheetData.length, 'baris didapat.');

                try {
                    await setCacheDB('CKG_SHEET_DATA', cachedSheetData);
                    await setCacheDB('CKG_SHEET_TIME', now);
                    console.log('[INFO] Database besar berhasil disimpan ke IndexedDB agar aman dari limit RAM.');
                } catch(e) {
                    console.warn("Gagal menyimpan ke IndexedDB.", e);
                }
            }
        }

        const rows = cachedSheetData;
        if (!rows || rows.length < 2) return null;
        
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            
            if (!row || row.length < 10) continue; 
            
            const cells = row.map(col => String(col || '').trim());
            const rawNik = (cells.length > 2) ? (cells[0] || cells[1] || cells[2]) : '';
            
            if (normalizeNIK(rawNik) === target || cells.some(col => normalizeNIK(col) === target)) {
                return {
                    nik: target, 
                    nama: cells[7] || '', 
                    sistole: cells[37] || '',
                    diastole: cells[38] || '', 
                    bb: cells[40] || '', 
                    tb: cells[41] || '',
                    lp: cells[43] || '', 
                    gula: cells[58] || '100',
                    mata: cells[70] || 'Tidak', 
                    merokok: cells[71] || '' 
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
   SURVEYJS ENGINE: RADIO & DROPDOWN MULTIPLE
========================================================= */
async function selectDropdownSurveyJS(optionText) {
    let success = false;
    const dropdownTrigger = document.querySelector('.sd-dropdown, .sv-dropdown');
    if (dropdownTrigger) {
        dropdownTrigger.click();
        await sleep(1200); 

        const allOptions = [...document.querySelectorAll('.sv-list__item-body, .sd-list__item-body')];
        const targetOpt = allOptions.find(el => 
            (el.innerText || '').toLowerCase().includes(optionText.toLowerCase())
        );

        if (targetOpt) {
            targetOpt.click(); 
            await sleep(800);
            success = true;
        } else {
            dropdownTrigger.click();
        }
    }
    return success;
}

async function isiDropdownSurveyJS(soalSelector, optionText) {
    let success = false;
    const questions = [...document.querySelectorAll('.sd-question, .sv-question')];
    
    const targetQ = questions.find(q => (q.innerText || '').toLowerCase().includes(soalSelector.toLowerCase()));
    if (!targetQ) return false;

    const valEl = targetQ.querySelector('.sd-dropdown__value, input.sd-dropdown__filter-string-input');
    if (valEl && (valEl.value || valEl.innerText || '').toLowerCase().includes(optionText.toLowerCase())) {
        return true; 
    }

    const dropdownTrigger = targetQ.querySelector('.sd-dropdown, .sv-dropdown');
    
    if (dropdownTrigger) {
        dropdownTrigger.scrollIntoView({ behavior: 'smooth', block: 'center' });
        dropdownTrigger.click(); 
        await sleep(850); 

        const allOptions = [...document.querySelectorAll('.sv-list__item-body, .sd-list__item-body')];
        const targetOpt = allOptions.find(el => 
            el.offsetParent !== null && 
            (el.innerText || '').toLowerCase().includes(optionText.toLowerCase())
        );

        if (targetOpt) {
            targetOpt.click(); 
            await sleep(800);
            success = true;
        } else {
            dropdownTrigger.click(); 
        }
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

async function handleTelingaMataAnak(data) {
    updateStatus('MENGISI: SKRINING TELINGA & MATA ANAK...');

    await isiDropdownSurveyJS('daya dengar', 'sesuai umur');
    await sleep(800);

    if ((data.mata || '').toLowerCase() === 'ya') {
        await isiDropdownSurveyJS('daya lihat', 'anak kurang');
    } else {
        await isiDropdownSurveyJS('daya lihat', 'anak baik');
    }
    await sleep(800);

    await isiDropdownSurveyJS('serumen impaksi', 'tidak ada serumen');
    await sleep(800);

    await isiDropdownSurveyJS('infeksi telinga', 'tidak ada infeksi');
    await sleep(800);

    if ((data.mata || '').toLowerCase() === 'ya') {
        await isiDropdownSurveyJS('selaput mata merah', 'curiga kelainan');
    } else {
        await isiDropdownSurveyJS('selaput mata merah', 'normal');
    }
    await sleep(800);
}

async function handleTelingaMataBalita(data) {
    updateStatus('MENGISI: SKRINING TELINGA & MATA BALITA...');
    await sleep(800);

    const jawabanBalita = [
        "Sesuai Umur", 
        ((data.mata || '').toLowerCase() === 'ya' ? "Daya lihat anak kurang" : "Daya lihat anak baik"), 
        "Tidak ada serumen impaksi", 
        "Tidak ada infeksi telinga", 
        "Normal"
    ];

    const semuaSoal = [...document.querySelectorAll('.sd-question, .sv-question, .sd-element')].filter(q => q.offsetParent !== null);

    for (let i = 0; i < semuaSoal.length; i++) {
        const soal = semuaSoal[i];
        const targetJawaban = jawabanBalita[i];
        
        if (!targetJawaban) continue;

        soal.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await sleep(500);

        const dropdown = soal.querySelector('.sd-dropdown, .sv-dropdown');
        if (dropdown) {
            const teksKotak = (dropdown.innerText || '').toLowerCase().trim();
            if (teksKotak.includes(targetJawaban.toLowerCase())) {
                continue;
            }

            dropdown.click();
            await sleep(800);

            const allOptions = [...document.querySelectorAll('.sv-list__item-body, .sd-list__item-body, .sv-list__item, .sd-list__item')]
                .filter(el => {
                    const rect = el.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                });

            const targetOpt = allOptions.find(el => 
                (el.innerText || '').toLowerCase().trim().includes(targetJawaban.toLowerCase())
            );

            if (targetOpt) {
                targetOpt.click();
                console.log(`[BOT] Sukses mengisi pertanyaan balita ke-${i + 1} dengan: "${targetJawaban}"`);
                await sleep(1200);
            } else {
                dropdown.click();
                await sleep(500);
            }
        }
    }
    await sleep(800);
}

async function handlePemeriksaanGigi() {
    updateStatus('MENGISI TAHAP: PEMERIKSAAN GIGI...');
    
    await pilihSemuaRadioLimit('tidak', 99, false);
    await sleep(500);
    await pilihSemuaRadioLimit('normal', 99, false);
    await sleep(500);
    await pilihSemuaRadioLimit('tidak ada', 99, false);
    await sleep(500);

    const dropdowns = [...document.querySelectorAll('.sd-dropdown, .sv-dropdown')];
    
    for (let i = 0; i < dropdowns.length; i++) {
        const drop = dropdowns[i];
        if (!drop) continue;

        drop.scrollIntoView({ behavior: 'smooth', block: 'center' });
        drop.click();
        await sleep(800); 

        const options = [...document.querySelectorAll('.sv-list__item-body, .sd-list__item-body')];
        const targetOpt = options.find(el => {
            if (el.offsetParent === null) return false; 
            const txt = (el.innerText || '').toLowerCase().trim();
            return txt.includes('tidak') || txt.includes('normal') || txt.includes('sehat');
        });

        if (targetOpt) {
            targetOpt.click();
            await sleep(500);
        } else {
            drop.click(); 
            await sleep(300);
        }
    }
}

/* =========================================================
   KLIK KIRIM & VALIDASI SAPU BERSIH 
========================================================= */
function isFormValid() {
    const questions = document.querySelectorAll('.sd-question, .sv-question');
    for (let q of questions) {
        if (q.offsetParent === null) continue;

        const pertanyaan = (q.innerText || '').toLowerCase();
        if (pertanyaan.includes('pinhole') || pertanyaan.includes('funduskopi') ||
            pertanyaan.includes('foto torax') || pertanyaan.includes('foto toraks')) {
            continue;
        }

        const radios = q.querySelectorAll('input[type="radio"]');
        if (radios.length > 0) {
            const hasSelected = Array.from(radios).some(r => r.checked);
            if (!hasSelected) return { valid: false, container: q };
        }

        const dropdowns = q.querySelectorAll('.sd-dropdown, .sv-dropdown');
        for (let dd of dropdowns) {
            const valText = (dd.innerText || '').toLowerCase().trim();
            if (valText === 'select...' || valText === 'pilih...' || valText === '') {
                return { valid: false, container: q };
            }
        }
    }
    return { valid: true };
}

async function klikKirim() {
    updateStatus('Mengirim data form...');
    await sleep(800);

    const btn = document.querySelector('.sd-navigation__complete-btn') ||
                [...document.querySelectorAll('button')].find(b => (b.innerText || '').toLowerCase().includes('kirim'));
    
    if (!btn) {
        updateStatus('Tombol kirim tidak ketemu!');
        return false;
    }

    const currentUrl = location.href;

    btn.click();
    updateStatus('Menunggu respon validasi...');

    let isSuccess = false;
    for (let i = 0; i < 8; i++) {
        await sleep(500);
        if (location.href !== currentUrl || !document.body.contains(btn)) {
            isSuccess = true;
            break;
        }
    }

    if (isSuccess) {
        updateStatus('Kirim Berhasil! Berpindah halaman...');
        await sleep(1000);
        return true;
    } else {
        updateStatus('⚠️ Validasi Gagal!\nCek tanda merah pada soal yang belum terjawab.');
        return false;
    }
}

/* =========================================================
   FORM FILLER LOGIC (ADAPTIF 10 TARGET UTAMA)
========================================================= */
async function autoContinueForm() {
    const data = loadBOT();
    if (!data) {
        updateStatus('IDLE\nSiap Digunakan');
        return;
    }

    BOT_RUNNING = true;
    updateStatus('MENUNGGU FORM DIMUAT...');
    
    for(let i = 0; i < 10; i++) {
        if(document.querySelector('.sd-question, .sv-question, input')) break;
        await sleep(800);
    }
    await sleep(800); 

    const title = document.body.innerText.toLowerCase();
    const realInputs = [...document.querySelectorAll('input')].filter(el =>
        (!el.type || el.type === 'text' || el.type === 'number') && !el.closest('.ant-select') && !el.closest('.sd-dropdown')
    );

    let currentId = null;

    if (title.includes('telinga dan mata')) {
        currentId = 'telinga_mata';
        
        if (title.includes('skrining telinga dan mata - balita') || title.includes('balita dan anak prasekolah')) {
            updateStatus('MENGISI TAHAP: TELINGA & MATA (BALITA)');
            await handleTelingaMataBalita(data); 
        } else {
            updateStatus('MENGISI TAHAP: TELINGA & MATA (ANAK/DEWASA)');
            await pilihSemuaRadioLimit('normal', 99, false); 
            await sleep(800);
            await pilihSemuaRadioLimit('tidak', 99, false); 
            await sleep(800);
        }
    }
    else if (title.includes('skrining pertumbuhan - balita') || title.includes('balita dan anak prasekolah')) {
        currentId = 'gizi_balita'; 
        updateStatus('MENGISI TAHAP: SKRINING PERTUMBUHAN BALITA');
        
        const inputBB = document.querySelector('input[placeholder*="kilogram" i]') || realInputs[0];
        if (inputBB) forceInject(inputBB, data.bb); 
        await sleep(800);

        const inputTB = document.querySelector('input[placeholder*="tinggi badan" i]') || realInputs[1];
        if (inputTB) forceInject(inputTB, data.tb); 
        await sleep(800);

        await isiDropdownSurveyJS('posisi pengukuran', 'berdiri');
        await sleep(800);

        await isiDropdownSurveyJS('lingkar kepala', 'normal');
        await sleep(800);
    }
    else if(title.includes('telinga dan mata')) {
        currentId = 'telinga_mata';
        
        if (title.includes('skrining telinga dan mata - balita')) {
            updateStatus('MENGISI TAHAP: TELINGA & MATA (BALITA)');
            await handleTelingaMataBalita(data); 
        } else {
            updateStatus('MENGISI TAHAP: TELINGA & MATA (ANAK/DEWASA/LANSIA)');
            await pilihSemuaRadioLimit('normal', 99, false); 
            await sleep(800);
            await pilihSemuaRadioLimit('tidak', 99, false); 
            await sleep(800);
        }
    }
    else if (title.includes('gizi anak') || title.includes('imt/u')) {
        currentId = 'gizi'; updateStatus('MENGISI TAHAP: GIZI ANAK');
        
        const inputBB = document.querySelector('input[placeholder*="satuan kg" i]') || document.querySelector('input[placeholder*="Berat Badan" i]') || realInputs[0];
        const inputTB = document.querySelector('input[placeholder*="tinggi badan" i]') || realInputs[1];
        const inputLP = realInputs.find(el => (el.placeholder || '').toLowerCase().includes('hasil pengukuran') && !(el.placeholder || '').toLowerCase().includes('tinggi badan')) || realInputs[2];
        
        if (inputBB) forceInject(inputBB, data.bb); await sleep(800);
        if (inputTB) forceInject(inputTB, data.tb); await sleep(800);
        if (inputLP) forceInject(inputLP, data.lp); await sleep(850);
    }
    else if(title.includes('pemeriksaan gula darah anak')){
        currentId = 'gula'; updateStatus('MENGISI TAHAP: PEMERIKSAAN GULA DARAH ANAK');
        await pilihSemuaRadioLimit('tidak', 99, true); 
        await sleep(800);
        const inputGula = document.querySelector('input[placeholder*="Isi sesuai hasil" i]') || realInputs[0];
        if (inputGula) forceInject(inputGula, data.gula);
        await sleep(800);
    }
    else if(title.includes('tekanan darah anak')){
        currentId = 'tensi'; updateStatus('MENGISI TAHAP: TEKANAN DARAH ANAK');
        await pilihSemuaRadioLimit('tidak', 99, true); await sleep(800);
        const inSistol = document.querySelector('input[placeholder*="Sistolik" i]') || realInputs[0];
        const inDiastol = document.querySelector('input[placeholder*="Diastolik" i]') || realInputs[1];
        if(inSistol) forceInject(inSistol, data.sistole); await sleep(800);
        if(inDiastol) forceInject(inDiastol, data.diastole); await sleep(850);
    }
    else if(title.includes('x-ray tb')){
        currentId = 'tb'; updateStatus('MENGISI TAHAP: TUBERKULOSIS ANAK');
        await pilihSemuaRadioLimit('tidak batuk', 1, false); 
        await sleep(800);
        await pilihSemuaRadioLimit('tidak', 99, true); 
        await sleep(800);
    }
   else if(title.includes('frambusia')){
        currentId = 'frambusia'; updateStatus('MENGISI TAHAP: FRAMBUSIA');
        await pilihSemuaRadioLimit('tidak', 99, false);
        await selectDropdownSurveyJS('tidak ada');
    }
    else if(title.includes('kusta')){
        currentId = 'kusta'; updateStatus('MENGISI TAHAP: KUSTA');
        await pilihSemuaRadioLimit('tidak', 99, false); 
        await selectDropdownSurveyJS('tidak ada');
    }
    else if(title.includes('skabies')){
        currentId = 'skabies'; updateStatus('MENGISI TAHAP: SKABIES');
        await pilihSemuaRadioLimit('tidak', 99, false);
        await selectDropdownSurveyJS('tidak ada');
    }
   else if(title.includes('pemeriksaan gigi')){
        currentId = 'gigi'; 
        await handlePemeriksaanGigi();
    }
   else if(title.includes('kebugaran jasmani')){
        currentId = 'jasmani'; updateStatus('MENGISI TAHAP: KEBUGARAN JASMANI');
        
        let bb = parseFloat(data.bb) || 0;
        let tb = parseFloat(data.tb) || 0;
        
        let hasilKebugaran = 'Baik'; 

        if (bb > 0 && tb > 0) {
            let imt = bb / ((tb / 100) * (tb / 100)); 
            
            if (imt >= 18.5 && imt <= 22.9) {
                hasilKebugaran = 'Baik';
            } else if ((imt >= 17.0 && imt < 18.5) || (imt > 22.9 && imt <= 24.9)) {
                hasilKebugaran = 'Cukup';
            } else if ((imt >= 16.0 && imt < 17.0) || (imt > 24.9 && imt <= 29.9)) {
                hasilKebugaran = 'Kurang';
            } else if (imt < 16.0 || imt > 29.9) {
                hasilKebugaran = 'Kurang';
            }
        }
        
        await isiDropdownSurveyJS('kebugaran jasmani', hasilKebugaran);
        await sleep(800);
    }
    
    if (!currentId) {
        const foundTarget = TARGETS.find(t => title.includes(t.txt));
        if (foundTarget) {
            currentId = foundTarget.id;
            updateStatus(`MENGISI TAHAP: ${foundTarget.txt.toUpperCase()}`);
        }
    }

    if(currentId) addCompleted(currentId);
    
    let finalSaveBtn = Array.from(document.querySelectorAll('button')).find(el => el.innerText.includes('Simpan') && !el.className.includes('sd-navigation'));
    if (finalSaveBtn) {
        finalSaveBtn.click();
        clearBOT();
        
        try { GM_deleteValue('PASIEN_AKTIF'); } catch(e) { localStorage.removeItem('PASIEN_AKTIF'); }
        playSound('selesai'); 
        
        // Perbarui status dan sinkronkan UI agar tombol estafet muncul
        updateStatus('Data Anak Berhasil Disimpan & Selesai!\nSilakan pilih menu selanjutnya.'); 
        syncUI();
    }
}

/* =========================================================
   TRACKER ROUTER
========================================================= */
function getNextTarget(){
    const completed = getCompleted();
    const btns = [...document.querySelectorAll('button')].filter(btn => (btn.innerText || '').toLowerCase().includes('input data'));
    for(let btn of btns){
        let parent = btn.parentElement;
        for(let i=0; i<6; i++){
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
    await sleep(1000); 
    
    let nextItem = getNextTarget();
    
    if(!nextItem) {
        await sleep(1000);
        nextItem = getNextTarget();
    }

    if(!nextItem){
        clearBOT(); clearCompleted(); BOT_RUNNING = false;
        try { GM_deleteValue('PASIEN_AKTIF'); } catch(e) { localStorage.removeItem('PASIEN_AKTIF'); }
        playSound('selesai');

        updateStatus('SELESAI SEMUA PEMERIKSAAN\nSilakan pilih menu selanjutnya.'); 
        syncUI();

        alert('BOT ANAK/REMAJA SUKSES INPUT SEMUA PEMERIKSAAN!');
        return;
    }
    
    updateStatus('MEMBUKA TARGET:\n' + nextItem.title.toUpperCase());
    await sleep(800);
    triggerClick(nextItem.btn);
}

/* =========================================================
   UI MODERN & DRAGGABLE (DENGAN ESTAFET)
========================================================= */
let BOT_RUNNING = false;
function updateStatus(text){ const el = document.getElementById('bot-status'); if(el) el.innerText = text; }

function stopBOT(){ 
    BOT_RUNNING = false; 
    clearBOT(); 
    clearCompleted(); 
    try { GM_deleteValue('LAST_USED_NIK'); } catch(e) { localStorage.removeItem('LAST_USED_NIK'); }
    updateStatus('BOT DIHENTIKAN. DATA DIRESET.'); 
    syncUI();
}

function syncUI() {
    const data = loadBOT();
    const btnStart = document.getElementById('run-bot');
    const inputNik = document.getElementById('nik-bot');
    const estafetWrap = document.getElementById('estafet-wrap');
    const statusEl = document.getElementById('bot-status');

    if (!btnStart || !inputNik || !estafetWrap) return;

    if (data) {
        btnStart.style.display = 'none'; 
        estafetWrap.style.display = 'none'; 
        inputNik.value = data.nik || ''; 
        inputNik.disabled = true;
    } else {
        btnStart.style.display = 'block'; 
        
        let lastNik = null;
        try { lastNik = GM_getValue('LAST_USED_NIK'); } catch(e) { lastNik = localStorage.getItem('LAST_USED_NIK'); }
        
        if (lastNik) {
            estafetWrap.style.display = 'flex';
            if (inputNik.value === '') inputNik.value = lastNik; 
            inputNik.disabled = false;
        } else {
            estafetWrap.style.display = 'none'; 
            inputNik.value = ''; 
            inputNik.disabled = false; 
            if(statusEl && !statusEl.innerText.includes('DIHENTIKAN')) {
                updateStatus('Siap Digunakan. Masukkan NIK.');
            }
        }
    }
}

function createUI(){
    if(document.getElementById('auto-ckg-ui')) return;
    const box = document.createElement('div'); box.id = 'auto-ckg-ui';
    box.innerHTML = `
        <div id="drag-handle">INPUT CKG ANAK & REMAJA</div>
        <div id="bot-status">Menyiapkan Database, Klik Start !...</div>
        <input id="nik-bot" placeholder="Masukkan NIK">
        <div id="btn-wrap">
            <button id="run-bot">START</button><button id="stop-bot">BATAL</button>
        </div>
        <div id="estafet-wrap" style="display:none; gap:8px; margin-top:8px;">
            <button id="btn-to-skrining" style="flex:1; background:#3b82f6; color:#fff; border:none; padding:8px; border-radius:8px; cursor:pointer; font-weight:bold; transition:0.2s;">⏮️ SKRINING</button>
            <button id="btn-to-daftar" style="flex:1; background:#6b7280; color:#fff; border:none; padding:8px; border-radius:8px; cursor:pointer; font-weight:bold; transition:0.2s;">🔙 DAFTAR</button>
        </div>
    `;
    const style = document.createElement('style');
    style.innerHTML = `
        #auto-ckg-ui {
            position: fixed; top: 100px; right: 20px; width: 300px;
            background: rgba(15, 15, 15, 0.85); backdrop-filter: blur(15px);
            border: 1px solid rgba(255, 204, 0, 0.3); border-radius: 16px;
            z-index: 999999999; padding: 15px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            font-family: 'Segoe UI', sans-serif; color: white; cursor: default;
        }
        #drag-handle {
            padding: 5px; text-align: center; font-weight: bold; color: #ffcc00;
            cursor: move; margin-bottom: 10px; border-bottom: 1px solid #333;
        }
        #bot-status {
            background: rgba(0,0,0,0.3); border-radius: 8px; padding: 10px;
            min-height: 50px; margin-bottom: 10px; color: #ffcc00;
            font-size: 13px; text-align: center; white-space: pre-wrap;
        }
        #nik-bot {
            width: 100%; box-sizing: border-box; padding: 10px; border: none;
            border-radius: 8px; background: #333; color: white; margin-bottom: 10px;
        }
        #btn-wrap { display: flex; gap: 8px; }
        #run-bot, #stop-bot {
            flex: 1; border: none; padding: 10px; border-radius: 8px;
            font-weight: bold; cursor: pointer; transition: 0.2s;
        }
        #run-bot { background: #ffcc00; color: #000; }
        #run-bot:hover { background: #e6b800; }
        #stop-bot { background: #ff4444; color: white; }
        #btn-to-skrining:hover { background: #2563eb; }
        #btn-to-daftar:hover { background: #4b5563; }
    `;
    document.head.appendChild(style); document.body.appendChild(box);

    const handle = document.getElementById('drag-handle');
    if(handle){
        let isDragging = false, offsetX, offsetY;
        handle.onmousedown = (e)=>{ isDragging = true; offsetX = e.clientX - box.offsetLeft; offsetY = e.clientY - box.offsetTop; };
        document.onmousemove = (e)=>{ if(isDragging){ box.style.left = (e.clientX - offsetX) + 'px'; box.style.top = (e.clientY - offsetY) + 'px'; box.style.right = 'auto'; } };
        document.onmouseup = ()=>{ isDragging = false; };
    }

    document.getElementById('run-bot').onclick = async ()=>{
        if(BOT_RUNNING) return alert('BOT SEDANG BERJALAN');
        const nik = document.getElementById('nik-bot').value;
        if(!nik) return alert('Masukkan NIK');

        updateStatus('MENGAMBIL DATA SPREADSHEET...');
        const data = await cariData(nik);
        if(!data) return updateStatus('DATA TIDAK DITEMUKAN');

        BOT_RUNNING = true; saveBOT(data); clearCompleted();
        syncUI();
        
        updateStatus('MEMULAI BOT ANAK...');
        await sleep(500); await mainLoopCKG(data);
    };
    
    document.getElementById('stop-bot').onclick = stopBOT;

    // Logika Tombol Estafet ke Skrining
    const btnSkrining = document.getElementById('btn-to-skrining');
    if (btnSkrining) {
        btnSkrining.onclick = () => {
            const nik = document.getElementById('nik-bot').value;
            if(!confirm('Anda yakin ingin kembali ke Modul SKRINING?')) return;
            
            clearBOT(); clearCompleted(); 
            try { GM_deleteValue('LAST_USED_NIK'); } catch(e) { localStorage.removeItem('LAST_USED_NIK'); }
            
            try { 
                GM_setValue('PASIEN_AKTIF', JSON.stringify({ nik: nik, kategori: 'skrining' })); 
                GM_setValue('CKG_MODE', 'skrining'); 
            } catch(e) {
                localStorage.setItem('PASIEN_AKTIF', JSON.stringify({ nik: nik, kategori: 'skrining' }));
                localStorage.setItem('CKG_MODE', 'skrining');
            }
            
            updateStatus('Beralih ke Skrining...'); 
            setTimeout(() => location.reload(), 500); 
        };
    }
    
    // Logika Tombol Kembali ke Daftar (Reset Total)
    const btnDaftar = document.getElementById('btn-to-daftar');
    if (btnDaftar) {
        btnDaftar.onclick = () => {
            if(!confirm('Anda yakin ingin mereset memori dan kembali ke daftar awal?')) return;
            
            clearBOT(); clearCompleted(); 
            try { 
                GM_deleteValue('LAST_USED_NIK');
                GM_deleteValue('PASIEN_AKTIF');
                GM_deleteValue('CKG_MODE');
            } catch(e) { 
                localStorage.removeItem('LAST_USED_NIK');
                localStorage.removeItem('PASIEN_AKTIF');
                localStorage.removeItem('CKG_MODE');
            }
            
            updateStatus('Membersihkan data & memuat ulang...'); 
            setTimeout(() => location.reload(), 500); 
        };
    }
    
    syncUI();
}

/* =========================================================
   INIT / AUTO RESUME OBSERVER
========================================================= */
setInterval(createUI, 1000);

async function waitForElement(selector, timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (document.querySelector(selector)) return true;
        await sleep(500);
    }
    return false;
}

setInterval(async () => {
    const isFormPage = document.querySelector('#tableLayanan') || document.querySelector('.table-pemeriksaan-mandiri'); 
    const isMainPage = document.querySelector('body'); 
    if (BOT_RUNNING) return;

    if (isFormPage) {
        BOT_RUNNING = true;
        await autoContinueForm();
        BOT_RUNNING = false;
    } else if (isMainPage) {
        let data = loadBOT();
        
        let estafetRaw = null;
        try { estafetRaw = GM_getValue('PASIEN_AKTIF'); } catch(e) { estafetRaw = localStorage.getItem('PASIEN_AKTIF'); }
        if (estafetRaw && !data) {
            const estafet = JSON.parse(estafetRaw);
            if (estafet.kategori === 'anak') {
                updateStatus('Estafet Anak Diterima. Mengunduh data...');
                data = await cariData(estafet.nik); 
                if (data) saveBOT(data);
                playSound('sukses');
            }
        }

         if(data){
            BOT_RUNNING = true;
            updateStatus('MELANJUTKAN OTOMATIS...\nMencari Form Berikutnya');
            await mainLoopCKG(data); 
        }
    }
}, 2000);
})();
