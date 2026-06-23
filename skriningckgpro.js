(function (GM_xmlhttpRequest) {
'use strict';
    const request = GM_xmlhttpRequest;

/* =========================================================
   CONFIG SPREADSHEET
========================================================= */
const SHEET_ID = '15vBz_H8dT9ZxuiEjkdW0VjOZmoCawp2eqtl32gpi0oY';
const GID = '0';

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
function clearBOT() { GM_deleteValue('AUTO_SKRINING_DATA'); GM_deleteValue('CKG_MODE'); }

function getCompleted() { return JSON.parse(GM_getValue('AUTO_SKRINING_COMPLETED') || '[]'); }
function addCompleted(id) {
    const arr = getCompleted();
    if(!arr.includes(id)) arr.push(id);
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
        if (char === '"') {
            if (insideQuote && next === '"') { current += '"'; i++; } 
            else { insideQuote = !insideQuote; }
        } 
        else if (char === ',' && !insideQuote) { row.push(current); current = ""; } 
        else if ((char === '\n' || char === '\r') && !insideQuote) {
            if (current || row.length) { row.push(current); rows.push(row); row = []; current = ""; }
        } else { current += char; }
    }
    if (current || row.length) { row.push(current); rows.push(row); }
    return rows;
}
    
let cachedSheetData = null;

async function cariData(nikInput) {
    const target = normalizeNIK(nikInput);
    if (!cachedSheetData) {
        console.log('[CACHE MISS] Download spreadsheet');
        const csv = await new Promise(resolve => {
            request({
                method: "GET",
                url: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`,
                timeout: 30000,
                onload: r => resolve(r.responseText || ""),
                onerror: () => resolve("")
            });
        });
        cachedSheetData = parseCSV(csv);
        console.log('[CACHE READY]', cachedSheetData.length, 'baris');
    } else {
        console.log('[CACHE HIT] Pakai data RAM');
    }

    const rows = cachedSheetData;
    for (let i = 1; i < rows.length; i++) {
        const nikSheet = normalizeNIK(rows[i][11]);
        if (nikSheet === target) {
            return {
                nik: target,
                perkawinan: rows[i][26] || 'Belum Menikah',
                merokok: (rows[i][71] || '').trim(),
                jiwa1: (rows[i][72] || '').trim(), 
                jiwa2: (rows[i][73] || '').trim(), 
                jiwa3: (rows[i][74] || '').trim(), 
                jiwa4: (rows[i][75] || '').trim()  
            };
        }
    }
    return null;
}

/* =========================================================
   DOM INTERACTOR (SURVEYJS SAFE)
========================================================= */
async function fillRadioSurveyJS(soalText, jawabanText) {
    try {
        const questions = [...document.querySelectorAll('.sd-question, .sv-question, .sd-element, [data-name]')];
        const allElements = [...document.querySelectorAll('*')];
        
        const aliases = {
            'faktor risiko tb': ['faktor risiko tb', 'tuberkulosis', 'tb', 'batuk', 'kontak erat', 'kontak dengan penderita'],
            'kesehatan jiwa': ['depresi', 'cemas', 'merasa sedih', 'minat melakukan aktivitas'],
            'kanker leher rahim': ['kanker leher rahim', 'serviks', 'pap smear', 'iva'],
            'gejala kanker paru': ['batuk dalam jangka waktu yang lama', 'batuk berdarah', 'sesak napas', 'nyeri dada', 'leher bengkak', 'benjolan pada leher', 'tidak sembuh-sembuh']
        };

        const keywords = aliases[soalText] || [soalText];
        const questionNode = allElements.find(el => {
            const txt = (el.textContent || '').toLowerCase();
            return keywords.some(k => txt.includes(k.toLowerCase()));
        });
        
        if (!questionNode) return false;
        
        const targetQ = questionNode.closest('.sd-element') || questionNode.closest('[data-name]') || questionNode.closest('.sd-question') || questionNode;
        if (!targetQ) return false;

        const items = [...targetQ.querySelectorAll('.sd-item, .sv-item')];
        const targetItem = items.find(el => {
            const txt = (el.innerText || '').toLowerCase().trim();
            const target = jawabanText.toLowerCase().trim();
            if (target === 'menikah' && txt === 'belum menikah') return false;
            return txt === target || txt.includes(target);
        });

        if (targetItem) {
            const input = targetItem.querySelector('input[type="radio"]');
            targetItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            const radioDecorator = targetItem.querySelector('.sd-radio__decorator, .sd-item__decorator');
            if (radioDecorator) radioDecorator.click();
            
            if (input) {
                input.checked = true;
                input.dispatchEvent(new Event('input', { bubbles:true }));
                input.dispatchEvent(new Event('change', { bubbles:true }));
            }
            await sleep(500);
            return true;
        }
    } catch(e) { console.error("Error mengisi radio:", e); }
    return false;
}

async function selectDropdownContext(soalText, optionText, typeChar = 't') {
    try {
        const questions = [...document.querySelectorAll('.sd-question, .sv-question, .sd-element, [data-name]')];
        const targetQ = questions.find(q => {
            const qText = (q.innerText || '').toLowerCase();
            return qText.includes(soalText.toLowerCase()) || soalText.toLowerCase().includes(qText);
        });

        if (!targetQ) return false;

        const dropdown = targetQ.querySelector('.sd-dropdown, .sv-dropdown');
        if (!dropdown) return false;

        dropdown.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
        const targetOpt = opts.find(el => (el.innerText || '').toLowerCase().includes(optionText.toLowerCase()));

        if (targetOpt) {
            targetOpt.click();
            await sleep(500);
            if (document.activeElement) document.activeElement.blur();
            return true;
        }
        dropdown.click();
    } catch (e) { console.error('Error selectDropdownContext:', e); }
    return false;
}

async function pilihAktivitasFisikOpsi1() {
    const combo = document.querySelector('#sq_103i_0, .sd-dropdown__filter-string-input');
    if (!combo) return false;
    combo.click();
    await sleep(1000);
    const options = [...document.querySelectorAll('.sd-list__item-body, .sv-list__item-body')];
    if (options.length > 0) {
        options[0].click(); 
        await sleep(500);
        return true;
    }
    return false;
}

async function isiSemuaRadioTidak() {
    const items = [...document.querySelectorAll('.sd-item, .sv-item')];
    for (const item of items) {
        const txt = (item.innerText || '').toLowerCase().trim();
        if (txt === 'tidak') {
            const radio = item.querySelector('.sd-radio__decorator') || item.querySelector('.sd-item__decorator');
            if (radio) {
                radio.click();
                await sleep(200);
            }
        }
    }
}

async function isiKesehatanJiwa(data) {
    const j1 = data.jiwa1 || ''; const j2 = data.jiwa2 || '';
    const j3 = data.jiwa3 || ''; const j4 = data.jiwa4 || '';
    const semuaPertanyaan = [...document.querySelectorAll('.sd-question, .sd-element')];

    for (const q of semuaPertanyaan) {
        const text = (q.innerText || '').toLowerCase();
        let jawabanSheet = '';

        if (text.includes('bersemangat')) jawabanSheet = j1;
        else if (text.includes('murung') || text.includes('putus asa')) jawabanSheet = j2;
        else if (text.includes('gugup') || text.includes('cemas')) jawabanSheet = j3;
        else if (text.includes('khawatir') || text.includes('mengendalikan')) jawabanSheet = j4;

        if (jawabanSheet.trim() !== '') {
            let kataKunci = '';
            const teksJawaban = jawabanSheet.toLowerCase();
            
            if (teksJawaban.includes('tidak')) kataKunci = 'tidak';
            else if (teksJawaban.includes('kurang')) kataKunci = 'kurang';
            else if (teksJawaban.includes('lebih')) kataKunci = 'lebih';
            else if (teksJawaban.includes('hampir')) kataKunci = 'hampir';

            if (kataKunci !== '') {
                const pilihan = [...q.querySelectorAll('.sd-item, .sv-item')];
                const targetPilihan = pilihan.find(el => (el.innerText || '').toLowerCase().includes(kataKunci));

                if (targetPilihan) {
                    const radio = targetPilihan.querySelector('.sd-radio__decorator') || targetPilihan.querySelector('.sd-item__decorator') || targetPilihan.querySelector('input[type="radio"]');
                    if (radio) {
                        radio.click();
                        await sleep(400); 
                    }
                }
            }
        }
    }
}

async function isiTetanusCatin() {
    const judul = document.body.innerText.toLowerCase();
    if (!judul.includes('riwayat imunisasi tetanus')) return false;

    updateStatus('Mengisi Imunisasi Tetanus Catin...');
    await selectDropdownContext('pernah mendapatkan imunisasi tetanus', 'pernah imunisasi tetanus tetapi tidak ingat berapa kali');
    await sleep(1000);

    const btnKirim = document.querySelector('.sd-navigation__complete-btn') || 
                     [...document.querySelectorAll('button,input[type="button"]')].find(el => (el.value || el.innerText || '').toLowerCase().includes('kirim'));
    if (btnKirim) {
        btnKirim.click();
        await sleep(3000);
    }
    return true;
}

/* =========================================================
   FUNGSI BARU: BYPASS PENGATURAN PELAYANAN
========================================================= */
async function bypassPengaturanPelayanan() {
    const modalText = document.body.innerText.toLowerCase();
    if (!modalText.includes("pengaturan pelayanan") || !modalText.includes("lokasi pelaksanaan")) {
        return false; 
    }

    updateStatus("Mengonfirmasi Lokasi...");
    
    // 1. Klik checkbox Lokasi sama dengan puskesmas
    const checkboxVisual = document.querySelector('div#sameLocation.check') || document.getElementById('sameLocation');
    if (checkboxVisual) {
        checkboxVisual.click();
        await sleep(1000); 
    }

    // 2. Klik Simpan jika tombol sudah aktif
    for (let i = 0; i < 10; i++) {
        const btnSimpan = Array.from(document.querySelectorAll('div, button')).find(el => 
            (el.innerText || "").trim() === "Simpan" && 
            !el.className.includes("bg-disabled") && 
            !el.className.includes("cursor-not-allowed")
        );

        if (btnSimpan) {
            btnSimpan.click();
            console.log("[BOT] Pengaturan Pelayanan berhasil disimpan.");
            await sleep(2500); 
            break;
        }
        await sleep(500); 
    }
}

/* =========================================================
   CORE LOGIC SKRINING MANDIRI 
========================================================= */
async function handleSkriningMandiri(data) {
    const pageText = document.body.innerText.toLowerCase();

    // 1. STATUS PERKAWINAN 
    if (pageText.includes('status perkawinan')) {
        updateStatus('Status di Sheet: ' + data.perkawinan); 
        await sleep(1000); 

        if (data.perkawinan && data.perkawinan !== 'Data Kosong') {
            let p = data.perkawinan.toLowerCase();
            let target = 'Menikah'; 
            if (p.includes('belum')) target = 'Belum Menikah';
            else if (p.includes('cerai')) target = 'Cerai'; 
            
            updateStatus('Mengisi: ' + target);
            await fillRadioSurveyJS('status perkawinan', target);
            await sleep(1000);
        } else {
            updateStatus('Data Perkawinan Kosong!');
            await sleep(1000);
        }
    }
    
    // FAKTOR RISIKO TB
    if (pageText.includes('faktor risiko tb') || pageText.includes('tuberkulosis')) {
        await fillRadioSurveyJS('faktor risiko tb', 'tidak batuk');
        await fillRadioSurveyJS('faktor risiko tb', 'tidak');
    }
    
    // 2. DISABILITAS
    if (pageText.includes('disabilitas')) {
        await fillRadioSurveyJS('disabilitas', 'non disabilitas');
    }

    // KESEHATAN JIWA
    if (pageText.includes('2 minggu terakhir') || pageText.includes('kesehatan jiwa')) {
        await isiKesehatanJiwa(data); 
    }

    // 3. KANKER LEHER RAHIM
    if (pageText.includes('kanker leher rahim')) {
        let p = (data.perkawinan || '').toLowerCase();
        let isYes = p.includes('menikah') || p.includes('cerai') || (p.includes('kawin') && !p.includes('belum'));
        await fillRadioSurveyJS('kanker leher rahim', isYes ? 'ya' : 'tidak');
    }

    // 4. MEROKOK & KANKER
    if (pageText.includes('merokok') || pageText.includes('kanker paru')) {
        const statusMerokok = jawabanMerokok(data.merokok); 
        const semuaPertanyaan = [...document.querySelectorAll('.sd-question, .sd-element')];
        
        for (const q of semuaPertanyaan) {
            const text = (q.innerText || '').toLowerCase();
            let targetJawaban = '';

            if (text.includes('setahun terakhir')) targetJawaban = statusMerokok;
            else if (text.includes('15 tahun terakhir')) targetJawaban = statusMerokok;
            else if (text.includes('menghirup asap rokok') || text.includes('terpapar asap rokok')) targetJawaban = statusMerokok;
            else if (text.includes('jenis rokok apa yang dikonsumsi')) targetJawaban = 'konvensional';
            else if (text.includes('kanker paru pada keluarga') || text.includes('batuk dalam jangka waktu') || text.includes('tbc atau ppok')) {
                targetJawaban = 'tidak';
            }

            if (targetJawaban !== '') {
                const pilihan = [...q.querySelectorAll('.sd-item, .sv-item')];
                const targetPilihan = pilihan.find(el => (el.innerText || '').toLowerCase().includes(targetJawaban));
                
                if (targetPilihan) {
                    const radio = targetPilihan.querySelector('.sd-radio__decorator') || targetPilihan.querySelector('.sd-item__decorator') || targetPilihan.querySelector('input[type="radio"]');
                    if (radio) {
                        radio.click();
                        const inputAsli = targetPilihan.querySelector('input[type="radio"]');
                        if (inputAsli) {
                            inputAsli.checked = true;
                            inputAsli.dispatchEvent(new Event('input', { bubbles:true }));
                            inputAsli.dispatchEvent(new Event('change', { bubbles:true }));
                        }
                        await sleep(300); 
                    }
                }
            }
        }
    }

    // 7. SAPU BERSIH 
    const questions = document.querySelectorAll('.sd-question, .sv-question, .sd-element, [data-name]');
    questions.forEach(q => {
        let isAnswered = false;
        q.querySelectorAll('input[type="radio"]').forEach(radio => { if (radio.checked) isAnswered = true; });
        if (isAnswered) return;

        let qText = (q.innerText||'').toLowerCase();
        if (qText.match(/aktivitas fisik/)) return; 

        q.querySelectorAll('label').forEach(l => {
            let txt = (l.innerText||'').toLowerCase().trim();
            if (txt === 'tidak' || txt === 'normal' || txt === 'tidak ada') {
                let i = l.querySelector('input[type="radio"]');
                if (i && !i.checked) { 
                    i.click(); 
                    i.checked = true; 
                    i.dispatchEvent(new Event('input', { bubbles:true }));
                    i.dispatchEvent(new Event('change', { bubbles:true }));
                }
            }
        });
    });

    // 6. AKTIVITAS FISIK
    if (pageText.includes('aktivitas fisik')) {
        updateStatus('Mengisi Aktivitas Fisik...');
        const dropdowns = [...document.querySelectorAll('.sd-dropdown, .sv-dropdown')];
        for (let i = 0; i < dropdowns.length; i++) {
            const currentDropdown = dropdowns[i];
            if (!currentDropdown) continue;
            currentDropdown.scrollIntoView({ behavior: 'smooth', block: 'center' });
            currentDropdown.click();
            await sleep(1200);

            const opsiTidak = [...document.querySelectorAll('li.sv-list__item, li.sd-list__item')].filter(li => li.innerText.trim().toLowerCase() === 'tidak');
            if (opsiTidak[i]) {
                opsiTidak[i].click();
                opsiTidak[i].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                await sleep(500);
            } else {
                break;
            }
        }
    }

    // 7. NAVIGASI 
    await sleep(1500); 
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
            if (document.body.innerText.toLowerCase().includes('riwayat imunisasi tetanus')) {
                await isiTetanusCatin();
            } else {
                await handleSkriningMandiri(data);
            }
        } catch(e) {
            console.error("Error bypass:", e);
            updateStatus("Melewati error, mencoba ulang...");
        }
        await sleep(2000);
    }
}

/* =========================================================
   DASHBOARD TRACKER 
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

async function mainLoop(data) {
    updateStatus('MENCARI ANTRIAN...');

    while (BOT_RUNNING && location.hostname.includes('sehatindonesiaku')) {
        let nextItem = null;

        for (let i = 0; i < 3; i++) {
            nextItem = getNextTarget(); 
            if (nextItem) break; 
            console.log("Tombol belum muncul, mencoba lagi (percobaan " + (i+1) + ")...");
            await sleep(2000);
        }

        if (!nextItem) {
            BOT_RUNNING = false;
            clearBOT();
            clearCompleted();
            updateStatus('SELESAI SEMUA TARGET.\nSilakan ganti NIK untuk pasien baru.');
            // alert('Semua antrian pemeriksaan selesai!'); // Alert dimatikan agar tidak mengganggu UI
            break;
        }

        updateStatus('MEMBUKA TARGET:\n' + nextItem.title.toUpperCase());
        addCompleted(nextItem.id); 
        nextItem.btn.click();
        await sleep(5000); 
    }
}

/* =========================================================
   PENGGANTI UI LAMA (HANYA MENCETAK LOG DI CONSOLE)
========================================================= */
// Fungsi diubah untuk mencetak status ke Console, bukan UI box.
function updateStatus(text){ 
    console.log("[SKRINING BOT] " + text); 
}

function stopBOT(){ 
    BOT_RUNNING = false; 
    clearBOT(); 
    clearCompleted(); 
    updateStatus('BOT DIHENTIKAN & NIK DIHAPUS.'); 
}

/* =========================================================
   INIT / PINTU UTAMA
========================================================= */

setTimeout(async ()=>{
    const isFormPage = location.hostname.includes('form.kemkes.go.id');
    const isMainPage = location.hostname.includes('sehatindonesiaku');

    if(isFormPage) {
        await autoContinueForm();
    } else if (isMainPage) {
        
        // Cek data bot yang disiapkan oleh modul regckg atau script lain
        let data = loadBOT();
        
        // JEMBATAN KE MASTER UI LAUNCHER:
        // Jika tidak ada data Skrining tersimpan, tapi Launcher menyuruh bot berjalan...
        const isMasterRunning = GM_getValue('BOT_RUNNING_STATE', false);
        const masterNIK = GM_getValue('MASTER_NIK_INPUT', '');

        if (!data && isMasterRunning && masterNIK.length >= 16) {
            updateStatus('Mendapat instruksi dari Master UI. Mengunduh data...');
            data = await cariData(masterNIK);
            if(data) {
                saveBOT(data);
                clearCompleted();
            } else {
                updateStatus('Data NIK Master tidak ditemukan di spreadsheet Skrining.');
            }
        }

        // Jika data berhasil diamankan (baik dari resume maupun dari Master UI)
        if(data){
            BOT_RUNNING = true;
            updateStatus('MELANJUTKAN OTOMATIS...\nMenyiapkan Pelayanan');
            
            await sleep(2000); // Tunggu UI website termuat

            // --- EKSEKUSI KLIK LOKASI & SIMPAN ---
            await bypassPengaturanPelayanan();
            // -------------------------------------

            updateStatus('Mencari Form Berikutnya...');
            await mainLoop(data);
        } else {
            updateStatus('IDLE / Menunggu perintah atau data dari Master UI');
        }

        // --- FITUR PRE-LOAD BACKGROUND SEJATI ---
        if (!cachedSheetData) {
            cariData('000').then(() => {
                if (!BOT_RUNNING) {
                    updateStatus('Database Siap (Cache Penuh)!');
                }
            }).catch(err => {
                console.error("Gagal mendownload background data:", err);
            });
        }
        // ---------------------------------------------------
    }
}, 1500);

})(typeof GM_xmlhttpRequest !== "undefined" ? GM_xmlhttpRequest : null);
