(function (GM_xmlhttpRequest) {
'use strict';
    const request = GM_xmlhttpRequest;

/* =========================================================
   MODUL AUDIO & DELAY
========================================================= */
const sleep = ms => new Promise(r => setTimeout(r,ms));
function normalizeNIK(v) { return String(v || '').replace(/\D/g,''); }

function playSound(type) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        if (type === 'sukses') { 
            osc.type = 'sine'; osc.frequency.setValueAtTime(880, ctx.currentTime);
            gain.gain.setValueAtTime(0.5, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
            osc.start(); osc.stop(ctx.currentTime + 0.5);
        }
    } catch(e) {}
}

/* =========================================================
   CONFIG SPREADSHEET
========================================================= */
const SHEET_ID = '1-We9wNftLhF2Ttd0ukfKpuK2IhM_YTg-mAeScMeDQNI';
const GIDS = ['1783755807', '1121908280'];

const sleep = ms => new Promise(r => setTimeout(r,ms));
function normalizeNIK(v) { return String(v || '').replace(/\D/g,''); }

/* =========================================================
   HELPER MAPPING JAWABAN MEROKOK
========================================================= */
function jawabanMerokok(v){

    const text =
        String(v || '')
        .toLowerCase()
        .trim();

    return (
        text.includes('ya') ||
        text.includes('rokok') ||
        text.includes('perokok')
    )
        ? 'ya'
        : 'tidak';
}

/* =========================================================
   SESSION & DYNAMIC TRACKER
========================================================= */
function saveBOT(data) { 
    try { GM_setValue('AUTO_SKRINING_DATA', JSON.stringify(data)); } 
    catch(e) { localStorage.setItem('AUTO_SKRINING_DATA', JSON.stringify(data)); }
}
function loadBOT() { 
    try { const raw = GM_getValue('AUTO_SKRINING_DATA'); return raw ? JSON.parse(raw) : null; } 
    catch(e) { const raw = localStorage.getItem('AUTO_SKRINING_DATA'); return raw ? JSON.parse(raw) : null; }
}
function clearBOT() { 
    try { GM_deleteValue('AUTO_SKRINING_DATA'); } 
    catch(e) { localStorage.removeItem('AUTO_SKRINING_DATA'); }
}

function getCompleted() { 
    try { return JSON.parse(GM_getValue('AUTO_SKRINING_COMPLETED') || '[]'); }
    catch(e) { return JSON.parse(localStorage.getItem('AUTO_SKRINING_COMPLETED') || '[]'); }
}
function addCompleted(id) {
    const arr = getCompleted();
    if(!arr.includes(id)) arr.push(id);
    try { GM_setValue('AUTO_SKRINING_COMPLETED', JSON.stringify(arr)); }
    catch(e) { localStorage.setItem('AUTO_SKRINING_COMPLETED', JSON.stringify(arr)); }
}
function clearCompleted() { 
    try { GM_deleteValue('AUTO_SKRINING_COMPLETED'); }
    catch(e) { localStorage.removeItem('AUTO_SKRINING_COMPLETED'); }
}

/* =========================================================
   DATA MATCHER (ANTI ERROR / FORMAT AMAN)
========================================================= */
function parseCSV(text) {
    // PROTEKSI: Jika teks kosong atau gagal load, kembalikan array kosong
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

// ========================================================
// 1. TAMBAHKAN HELPER INDEXEDDB DI LUAR FUNGSI UTAMA
// ========================================================
const DB_NAME = 'CKG_Database';
const STORE_NAME = 'SheetCache';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            e.target.result.createObjectStore(STORE_NAME);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function setCacheDB(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(value, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
}

async function getCacheDB(key) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('CKG_Database', 1);
        request.onsuccess = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('SheetCache')) return resolve(null);
            const tx = db.transaction('SheetCache', 'readonly');
            const req = tx.objectStore('SheetCache').get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        };
        request.onerror = () => resolve(null);
    });
}

// ========================================================
// 2. KODE FUNGSI CARI DATA YANG SUDAH DIOPTIMASI & DIGABUNG
// ========================================================
async function cariData(nikInput) {
    try {
        const target = normalizeNIK(nikInput);
        
        // --- TAHAP 1: SIAPKAN DATA (DARI RAM, INDEXEDDB, ATAU DOWNLOAD) ---
        if (!cachedSheetData || cachedSheetData.length === 0) {
            
            let savedCache = null;
            let cacheTime = 0;
            const EXPIRATION_TIME = 4 * 60 * 60 * 1000; // Cache bertahan 4 jam
            const now = Date.now();

            // Cek IndexedDB
            try {
                savedCache = await getCacheDB('CKG_SHEET_DATA');
                cacheTime = await getCacheDB('CKG_SHEET_TIME') || 0;
            } catch(e) {
                console.warn("Gagal membaca IndexedDB", e);
            }

            // Gunakan Cache jika valid
            if (savedCache && savedCache.length > 0 && (now - cacheTime < EXPIRATION_TIME)) {
                console.log('[CACHE READY] Memuat data dari IndexedDB (Cepat)...');
                cachedSheetData = savedCache;
            } 
            // Download jika tidak ada/expired
            else {
                updateStatus("MENGUNDUH DATA SPREADSHEET...");
                cachedSheetData = [];

                for (const gid of GIDS) {
                    console.log('Download sheet gid:', gid);
                    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
                    
                    const res = await fetch(url);
                    if (!res.ok) {
                        console.warn(`[WARNING] Gagal terhubung ke GID: ${gid}`);
                        continue;
                    }
                    
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

                // Simpan ke IndexedDB
                try {
                    await setCacheDB('CKG_SHEET_DATA', cachedSheetData);
                    await setCacheDB('CKG_SHEET_TIME', now);
                    console.log('[CACHE SAVED] Data berhasil disimpan ke IndexedDB.');
                } catch(e) {
                    console.warn("Gagal menyimpan ke IndexedDB, data hanya di RAM sementara.", e);
                }
            }
        }
        
        // --- TAHAP 2: PROSES PENCARIAN NIK ---
        
        // PROTEKSI: Pastikan array cachedSheetData valid dan punya data selain header
        if (!cachedSheetData || cachedSheetData.length < 2) {
            console.warn("Data sheet kosong atau gagal dimuat.");
            return null;
        }

        // Loop pencarian menggunakan cachedSheetData
        for (let i = 1; i < cachedSheetData.length; i++) {
            const row = cachedSheetData[i];

            // PROTEKSI: Jika ada baris "sampah" atau kolom tidak cukup panjang
            if (!row || row.length < 12) continue;

            const nikSheet = normalizeNIK(row[11]);

            if (nikSheet === target) {
                // --- DEBUGGER: Menampilkan data mentah ke Console ---
                console.log("=== DEBUG DATA PADA BARIS INI ===");
                console.log("Target NIK:", target);
                console.log("Panjang array baris (total kolom):", row.length);
                console.log("Isi Kolom 72 (Jiwa 1):", row[72]);
                console.log("Isi Kolom 73 (Jiwa 2):", row[73]);
                console.log("Isi Kolom 74 (Jiwa 3):", row[74]);
                console.log("Isi Kolom 75 (Jiwa 4):", row[75]);
                console.log("================================");
                
                return {
                    nik: target,
                    perkawinan: row[26] || 'Belum Menikah',
                    merokok: (row[71] || '').trim(),
                    jiwa1: (row[72] || '').trim(), 
                    jiwa2: (row[73] || '').trim(), 
                    jiwa3: (row[74] || '').trim(), 
                    jiwa4: (row[75] || '').trim()  
                };
            }
        }
        
        // Jika looping selesai tapi NIK tidak ditemukan
        return null;

    } catch (error) { 
        console.error("Terjadi kesalahan saat mencari data:", error);
        return null;
    }
}
    
/* =========================================================
   DOM INTERACTOR (SURVEYJS SAFEe)
========================================================= */
// FUNGSI BARU: forceInject (Untuk menyuntik angka ke dalam kotak)
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

async function fillRadioSurveyJS(soalText, jawabanText) {
    try {

        const questions = [
            ...document.querySelectorAll(
                '.sd-question, .sv-question, .sd-element, [data-name]'
            )
        ];

        const allElements = [
            ...document.querySelectorAll('*')
        ];
        
const aliases = {
    'faktor risiko tb': [
        'faktor risiko tb',
        'tuberkulosis',
        'tb',
        'batuk',
        'kontak erat',
        'kontak dengan penderita'
    ],
    
    'kesehatan jiwa': [
        'depresi',
        'cemas',
        'merasa sedih',
        'minat melakukan aktivitas'
    ],

    'kanker leher rahim': [
        'kanker leher rahim',
        'serviks',
        'pap smear',
        'iva'
    ],

        'gejala kanker paru': [
        'batuk dalam jangka waktu yang lama',
        'batuk berdarah',
        'sesak napas',
        'nyeri dada',
        'leher bengkak',
        'benjolan pada leher',
        'tidak sembuh-sembuh'
    ]
};

const keywords = aliases[soalText] || [soalText];

const questionNode = allElements.find(el => {

    const txt = (el.textContent || '').toLowerCase();

    return keywords.some(k =>
        txt.includes(k.toLowerCase())
    );
});
        
        if (!questionNode) {
            console.warn('Soal tidak ditemukan:', soalText);
                console.log(
        [...document.querySelectorAll('.sd-question')]
            .map(q => q.innerText)
    );
            return false;
        }
        
        const targetQ =
            questionNode.closest('.sd-element') ||
            questionNode.closest('[data-name]') ||
            questionNode.closest('.sd-question') ||
            questionNode;

        console.log(
            '[DEBUG SOAL]',
            soalText,
            questions.map(x => (x.innerText || '').split('\n')[0]).slice(0, 20)
        );

        if (!targetQ) {
            console.warn("Soal tidak ditemukan:", soalText);
            return false;
        }

        const items = [...targetQ.querySelectorAll('.sd-item, .sv-item')];

        const opsiTersedia = items.map(i => i.innerText.trim());
        console.log("Opsi ditemukan di web (" + soalText + "):", opsiTersedia);

        const targetItem = items.find(el => {
            const txt = (el.innerText || '').toLowerCase().trim();
            const target = jawabanText.toLowerCase().trim();

            // 1. Logika Pencegahan: Jika mencari 'menikah' tapi teksnya 'belum menikah', tolak!
            if (target === 'menikah' && txt === 'belum menikah') {
                return false;
            }

            // 2. Pencocokan: Kembalikan true jika sama persis ATAU mengandung kata tersebut
            return txt === target || txt.includes(target);
        });

        if (targetItem) {

            const input = targetItem.querySelector(
                'input[type="radio"]'
            );

            targetItem.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });

        const radioDecorator =
            targetItem.querySelector(
                '.sd-radio__decorator, .sd-item__decorator'
            );
        
        if (radioDecorator) {
            radioDecorator.click();
        }
        
        if (input) {
        
            input.checked = true;
        
            input.dispatchEvent(
                new Event('input', { bubbles:true })
            );
        
            input.dispatchEvent(
                new Event('change', { bubbles:true })
            );
        }

            console.log('[AI] Berhasil mengisi:', jawabanText);

            await sleep(500);

            return true;
        }

    } catch(e) {
        console.error("Error mengisi radio:", e);
    }

    return false;
}

async function selectDropdownContext(soalText, optionText, typeChar = 't') {
    try {

        const questions = [
            ...document.querySelectorAll(
                '.sd-question, .sv-question, .sd-element, [data-name]'
            )
        ];

        const targetQ = questions.find(q => {
            const qText = (q.innerText || '').toLowerCase();

            return qText.includes(soalText.toLowerCase()) ||
                   soalText.toLowerCase().includes(qText);
        });

        console.log('[DEBUG CARI DROPDOWN]', soalText, !!targetQ);

        if (!targetQ) {
            console.warn('Dropdown tidak ditemukan:', soalText);
            return false;
        }

        const dropdown = targetQ.querySelector(
            '.sd-dropdown, .sv-dropdown'
        );

        if (!dropdown) {
            console.warn('Elemen dropdown tidak ditemukan:', soalText);
            return false;
        }

        dropdown.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });

        dropdown.click();

        await sleep(1000);

        const search = document.querySelector(
            'input[type="text"][role="combobox"], input[aria-expanded="true"]'
        );

        if (search && typeChar) {

            search.focus();

            search.value = typeChar;

            search.dispatchEvent(
                new Event('input', { bubbles: true })
            );

            search.dispatchEvent(
                new Event('change', { bubbles: true })
            );

            await sleep(1000);
        }

        const opts = [
            ...document.querySelectorAll(
                '.sv-list__item-body, .sd-list__item-body'
            )
        ];

        console.log(
            '[DEBUG OPSI DROPDOWN]',
            opts.map(x => x.innerText.trim())
        );

        const targetOpt = opts.find(el =>
            (el.innerText || '')
                .toLowerCase()
                .includes(optionText.toLowerCase())
        );

        if (targetOpt) {

            targetOpt.click();

            await sleep(500);

            if (document.activeElement) {
                document.activeElement.blur();
            }

            console.log(
                '[AI] Dropdown terisi:',
                optionText
            );

            return true;
        }

        console.warn(
            '[AI] Opsi dropdown tidak ditemukan:',
            optionText
        );

        dropdown.click();

    } catch (e) {
        console.error(
            'Error selectDropdownContext:',
            e
        );
    }

    return false;
}

async function pilihAktivitasFisikOpsi1() {

    const combo = document.querySelector(
        '#sq_103i_0, .sd-dropdown__filter-string-input'
    );

    if (!combo) {
        console.warn('Dropdown aktivitas fisik tidak ditemukan');
        return false;
    }

    combo.click();

    await sleep(1000);

    const options = [
        ...document.querySelectorAll(
            '.sd-list__item-body, .sv-list__item-body'
        )
    ];

    console.log(
        '[OPSI AKTIVITAS]',
        options.map(x => x.innerText.trim())
    );

    if (options.length > 0) {

        options[0].click(); // pilih opsi nomor 1

        await sleep(500);

        return true;
    }

    return false;
}

async function isiSemuaRadioTidak() {

    const items = [
        ...document.querySelectorAll('.sd-item, .sv-item')
    ];

    for (const item of items) {

        const txt = (item.innerText || '').toLowerCase().trim();

        if (txt === 'tidak') {

            const radio =
                item.querySelector('.sd-radio__decorator') ||
                item.querySelector('.sd-item__decorator');

            if (radio) {
                radio.click();
                await sleep(200);
            }
        }
    }
}

async function isiKesehatanJiwa(data) {
    // 1. Fallback keamanan
    const j1 = data.jiwa1 || '';
    const j2 = data.jiwa2 || '';
    const j3 = data.jiwa3 || '';
    const j4 = data.jiwa4 || '';

    const semuaPertanyaan = [...document.querySelectorAll('.sd-question, .sd-element')];

    for (const q of semuaPertanyaan) {
        const text = (q.innerText || '').toLowerCase();
        let jawabanSheet = '';

        // 2. Deteksi Soal
        if (text.includes('bersemangat')) {
            jawabanSheet = j1;
        } else if (text.includes('murung') || text.includes('putus asa')) {
            jawabanSheet = j2;
        } else if (text.includes('gugup') || text.includes('cemas')) {
            jawabanSheet = j3;
        } else if (text.includes('khawatir') || text.includes('mengendalikan')) {
            jawabanSheet = j4;
        }

        // 3. Eksekusi Pencarian Jawaban
        if (jawabanSheet.trim() !== '') {
            let kataKunci = '';
            const teksJawaban = jawabanSheet.toLowerCase();
            
            if (teksJawaban.includes('tidak')) kataKunci = 'tidak';
            else if (teksJawaban.includes('kurang')) kataKunci = 'kurang';
            else if (teksJawaban.includes('lebih')) kataKunci = 'lebih';
            else if (teksJawaban.includes('hampir')) kataKunci = 'hampir';

            if (kataKunci !== '') {
                const pilihan = [...q.querySelectorAll('.sd-item, .sv-item, label')];
                const targetPilihan = pilihan.find(el => (el.innerText || '').toLowerCase().includes(kataKunci));

                if (targetPilihan) {
                    console.log(`[BOT] ✅ Menemukan jawaban "${kataKunci}" untuk soal.`);
                    
                    targetPilihan.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await sleep(300);

                    // ==========================================
                    // STRATEGI SUPER CLICKER SURVEYJS
                    // ==========================================
                    
                    // 1. Cari elemen bulatan spesifik (decorator)
                    const decorator = targetPilihan.querySelector('.sd-radio__decorator, .sd-item__decorator, .sv-item__decorator');
                    if (decorator) {
                        // Jika bulatan ketemu, klik bulatannya!
                        decorator.click(); 
                    } else {
                        // Jika tidak ada, klik pembungkusnya
                        targetPilihan.click(); 
                    }

                    // 2. Eksekusi langsung ke input rahasianya
                    const inputAsli = targetPilihan.querySelector('input[type="radio"]');
                    if (inputAsli) {
                        inputAsli.click(); // Paksa klik input
                        inputAsli.checked = true; // Centang paksa
                        
                        // Kirim sinyal ke Vue/SurveyJS bahwa data sudah berubah
                        inputAsli.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                        inputAsli.dispatchEvent(new Event('input', { bubbles: true }));
                        inputAsli.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    // ==========================================

                    await sleep(600); // Wajib ada agar web punya waktu untuk menampilkan efek klik
                }
            }
        }
    }
}

async function isiTetanusCatin() {

    const judul = document.body.innerText.toLowerCase();

    if (!judul.includes('riwayat imunisasi tetanus')) {
        return false;
    }

    updateStatus('Mengisi Imunisasi Tetanus Catin...');

    await selectDropdownContext(
        'pernah mendapatkan imunisasi tetanus',
        'pernah imunisasi tetanus tetapi tidak ingat berapa kali'
    );

    await sleep(1000);

    const btnKirim =
        document.querySelector('.sd-navigation__complete-btn') ||
        [...document.querySelectorAll('button,input[type="button"]')]
            .find(el =>
                (el.value || el.innerText || '')
                    .toLowerCase()
                    .includes('kirim')
            );

    if (btnKirim) {
        btnKirim.click();
        await sleep(3000);
    }

    return true;
}

async function isiImunisasiBalita() {
    const judul = document.body.innerText.toLowerCase();
    if (!judul.includes('riwayat imunisasi rutin balita')) return false;

    updateStatus('Mengisi Imunisasi Balita Berantai...');

    let jumlahSoalTerjawab = 0;
    let maksimalLoop = 0;

    // Loop selama ada penambahan soal baru di layar (maksimal 20 kali putaran agar aman)
    while (maksimalLoop < 20) {
        maksimalLoop++;

        // 1. Ambil semua kerangka pertanyaan yang ADA DI LAYAR SAAT INI
        const semuaSoal = [...document.querySelectorAll('.sd-question, .sv-question, .sd-element')]
            .filter(q => q.offsetParent !== null); // pastikan kerangka soalnya terlihat

        // Jika jumlah soal di layar sama dengan yang sudah kita kerjakan, antrian habis!
        if (semuaSoal.length === 0 || semuaSoal.length === jumlahSoalTerjawab) {
            console.log("[BOT] Tidak ada soal baru yang muncul. Selesai.");
            break; 
        }

        // 2. HANYA memproses soal-soal BARU
        for (let i = jumlahSoalTerjawab; i < semuaSoal.length; i++) {
            const soalSaatIni = semuaSoal[i];
            
            soalSaatIni.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await sleep(500);

            // --- TANGANI DROPDOWN ---
            const dropdown = soalSaatIni.querySelector('.sd-dropdown, .sv-dropdown');
            if (dropdown) {
                // PENGAMAN: Cek jika kotak dropdown sudah berisi tulisan "Ya" / "Sudah", maka skip
                const teksKotak = (dropdown.innerText || '').toLowerCase().trim();
                if (teksKotak === 'ya' || teksKotak === 'sudah' || teksKotak.includes('ya') || teksKotak.includes('sudah')) {
                    console.log(`[BOT] Soal ke-${i+1} sudah terisi sebelumnya.`);
                    continue;
                }

                dropdown.click(); // Buka menu popup
                await sleep(800); // Jeda wajib agar popup SurveyJS selesai dirender

                // KUNCI UTAMA PERBAIKAN: Ambil HANYA opsi yang BENAR-BENAR MUNCUL DI LAYAR saat ini
                const opsiList = [...document.querySelectorAll('.sv-list__item-body, .sd-list__item-body, .sv-list__item, .sd-list__item')]
                    .filter(el => {
                        const rect = el.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0; // Filter Anti-Elemen Hantu
                    });

                const targetOpsi = opsiList.find(el => {
                    const txt = (el.innerText || '').toLowerCase().trim();
                    return txt === 'ya' || txt === 'sudah';
                });

                if (targetOpsi) {
                    // Klik dengan teknik yang lebih dalam agar sistem Vue/SurveyJS merespons
                    targetOpsi.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                    targetOpsi.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                    targetOpsi.click();
                    
                    console.log(`[BOT] Menjawab Dropdown soal ke-${i+1} dengan Ya/Sudah`);
                } else {
                    console.log(`[BOT] Opsi tidak ditemukan untuk soal ke-${i+1}, menutup menu.`);
                    dropdown.click(); // Tutup kembali
                }
            } 
            // --- TANGANI RADIO BUTTON (Jaga-jaga jika Kemenkes ubah format) ---
            else {
                const radioItems = [...soalSaatIni.querySelectorAll('.sd-item, .sv-item')];
                for (const item of radioItems) {
                    const txt = (item.innerText || '').toLowerCase().trim();
                    if (txt === 'ya' || txt === 'sudah') {
                        const decorator = item.querySelector('.sd-radio__decorator, .sd-item__decorator') || item;
                        decorator.click();
                        console.log(`[BOT] Menjawab Radio soal ke-${i+1} dengan Ya/Sudah`);
                        break;
                    }
                }
            }

            // WAJIB: Tunggu animasi web Kemenkes memuat soal baru ke bawahnya
            await sleep(1000); 
        }

        // 3. Update catatan jumlah soal
        jumlahSoalTerjawab = semuaSoal.length;
    }

    // Cari dan Klik Tombol Kirim / Lanjut
    await sleep(1000);
    const btnKirim = document.querySelector('.sd-navigation__complete-btn') || 
                     [...document.querySelectorAll('button,input[type="button"]')].find(b => (b.innerText||'').toLowerCase().match(/lanjut|kirim/));

    if (btnKirim) {
        btnKirim.click();
        await sleep(3500); // Tunggu loading submit
    }

    return true;
}

/* =========================================================
   CORE LOGIC SKRINING MANDIRI (REVISI STATUS PERKAWINAN)
========================================================= */
async function handleSkriningMandiri(data) {
    // Deteksi teks apa saja yang ada di halaman ini
    const pageText = document.body.innerText.toLowerCase();

    // 1. STATUS PERKAWINAN (Hanya jalan jika ada kata 'perkawinan' di layar)
        if (pageText.includes('status perkawinan')) {
        updateStatus('Status di Sheet: ' + data.perkawinan); 
        await sleep(1000); 

        if (data.perkawinan && data.perkawinan !== 'Data Kosong') {
            let p = data.perkawinan.toLowerCase();
            
            // Jadikan 'Menikah' sebagai default jika kata kuncinya hanya 'menikah'
            let target = 'Menikah'; 

            // Jika mengandung kata 'belum', ubah jadi 'Belum Menikah'
            if (p.includes('belum')) {
                target = 'Belum Menikah';
            } 
            // Jika mengandung kata 'janda', 'duda', atau 'cerai', ubah jadi 'Cerai Hidup'
            else if (p.includes('janda') || p.includes('duda') || p.includes('cerai')) {
                target = 'Cerai Hidup'; 
            }
            
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
        await isiKesehatanJiwa(data); // <-- Tambahkan parameter 'data' di dalam kurung ini
    }

    // 3. KANKER LEHER RAHIM
    if (pageText.includes('kanker leher rahim')) {
        let p = (data.perkawinan || '').toLowerCase();
        let isYes = p.includes('menikah') || p.includes('cerai') || (p.includes('kawin') && !p.includes('belum'));
        await fillRadioSurveyJS('kanker leher rahim', isYes ? 'ya' : 'tidak');
    }

// 4. MEROKOK & KANKER
    if (pageText.includes('merokok') || pageText.includes('kanker paru')) {
        const statusMerokok = jawabanMerokok(data.merokok); // Akan bernilai 'ya' atau 'tidak'
        
        const semuaPertanyaan = [...document.querySelectorAll('.sd-question, .sd-element')];
        
        for (const q of semuaPertanyaan) {
            const text = (q.innerText || '').toLowerCase();
            let targetJawaban = '';

            // -- Kanker Paru 1 & Perilaku Merokok 1 --
            if (text.includes('setahun terakhir')) {
                targetJawaban = statusMerokok;
            } 
            // -- Kanker Paru 2 --
            else if (text.includes('15 tahun terakhir')) {
                targetJawaban = statusMerokok;
            } 
            // -- Kanker Paru 3 & Perilaku Merokok 5 --
            else if (text.includes('menghirup asap rokok') || text.includes('terpapar asap rokok')) {
                targetJawaban = statusMerokok;
            } 
            // -- Perilaku Merokok 2 --
            else if (text.includes('jenis rokok apa yang dikonsumsi')) {
                targetJawaban = 'konvensional';
            }
            // -- Sisa Kanker Paru (Default: Tidak) --
            else if (text.includes('kanker paru pada keluarga') || 
                     text.includes('batuk dalam jangka waktu') || 
                     text.includes('tbc atau ppok')) {
                targetJawaban = 'tidak';
            }

            // Eksekusi Klik Target
            if (targetJawaban !== '') {
                const pilihan = [...q.querySelectorAll('.sd-item, .sv-item')];
                const targetPilihan = pilihan.find(el => 
                    (el.innerText || '').toLowerCase().includes(targetJawaban)
                );
                
                if (targetPilihan) {
                    const radio = targetPilihan.querySelector('.sd-radio__decorator') ||
                                  targetPilihan.querySelector('.sd-item__decorator') ||
                                  targetPilihan.querySelector('input[type="radio"]');

                    if (radio) {
                        radio.click();
                        
                        // Pengaman ganda agar tidak di-overwrite oleh fitur Sapu Bersih
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

// 7. SAPU BERSIH (Isi radio yang KOSONG menjadi default)
    const questions = document.querySelectorAll('.sd-question, .sv-question, .sd-element, [data-name]');
    questions.forEach(q => {
        let isAnswered = false;
        const radios = q.querySelectorAll('input[type="radio"]');
        
        // Jika soal ini tidak punya pilihan radio button, lewati
        if (radios.length === 0) return;

        radios.forEach(radio => {
            if (radio.checked) isAnswered = true;
        });

        if (isAnswered) return;

        let qText = (q.innerText||'').toLowerCase();
        
        // PERBAIKAN: Persempit kata kunci skip agar tidak salah melewati soal jantung/PJK
        if (qText.includes('berapa hari anda aktif secara fisik') || qText.includes('jumlah hari aktif')) return; 

        q.querySelectorAll('label').forEach(l => {
            let txt = (l.innerText||'').toLowerCase().trim();
            if (txt === 'tidak' || txt === 'normal' || txt === 'tidak ada') {
                let i = l.querySelector('input[type="radio"]');
                if (i && !i.checked) { 
                    // PERBAIKAN: Klik bagian bulatan decorator agar SurveyJS merespons dengan benar
                    const decorator = l.querySelector('.sd-radio__decorator, .sd-item__decorator') || l;
                    decorator.click(); 
                    
                    i.checked = true; 
                    i.dispatchEvent(new Event('input', { bubbles:true }));
                    i.dispatchEvent(new Event('change', { bubbles:true }));
                }
            }
        });
    });

// 8. AKTIVITAS FISIK
    if (pageText.includes('aktivitas fisik')) {
        updateStatus('Mengisi Aktivitas Fisik...');
        
        // --- TAMBAHAN BARU: Jika soal berupa isian manual (angka) ---
        const inputAngka = [...document.querySelectorAll('input[type="number"]')];
        if (inputAngka.length > 0) {
            // Jika ketemu kotak angka, suntikkan angka 3 (rentang normal)
            if (inputAngka[0]) forceInject(inputAngka[0], '3');
            await sleep(500);
            if (inputAngka[1]) forceInject(inputAngka[1], '3');
            await sleep(500);
        }

        // --- SCRIPT ASLI: Jika soal berupa Dropdown ---
        const dropdowns = [...document.querySelectorAll('.sd-dropdown, .sv-dropdown')];
        for (let i = 0; i < dropdowns.length; i++) {
            const currentDropdown = dropdowns[i];
            if (!currentDropdown) continue;
            currentDropdown.scrollIntoView({ behavior: 'smooth', block: 'center' });
            currentDropdown.click();
            await sleep(1200);

            const opsiTidak = [...document.querySelectorAll('li.sv-list__item, li.sd-list__item')]
                .filter(li => li.innerText.trim().toLowerCase() === 'tidak');

            if (opsiTidak[i]) {
                opsiTidak[i].click();
                opsiTidak[i].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                await sleep(500);
            } else {
                break;
            }
        }
    }

    // 7. NAVIGASI (Cari tombol Lanjut atau Kirim)
    await sleep(1500); // Waktu jeda dipersingkat karena bot sudah tahu apa yang harus diklik
    const btnNext = document.querySelector('.sd-navigation__next-btn, .sd-navigation__complete-btn') ||
                    [...document.querySelectorAll('button')].find(b => (b.innerText||'').toLowerCase().match(/lanjut|kirim/));

    if (btnNext) {
        btnNext.click();
        await sleep(3500);
    }
}

/* =========================================================
   FORM LOOP ROUTER (FIXED)
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
            // DEFENSIVE CHECK: Tunggu sampai kerangka soal SurveyJS benar-benar muncul di layar
            const formReady = document.querySelector('.sd-question, .sv-question, .sd-element');
            
            if (!formReady) {
                updateStatus('Menunggu form dimuat...');
                await sleep(1500);
                continue; // Jangan lanjut ke bawah, putar ulang loop sampai form muncul
            }

            // Setelah form dipastikan muncul, baru kita baca teks halamannya
            const pageText = document.body.innerText.toLowerCase();

            if (pageText.includes('riwayat imunisasi rutin balita')) {
                // Eksekusi Imunisasi Balita hardcode Ya/Sudah
                await isiImunisasiBalita();
            } else if (pageText.includes('riwayat imunisasi tetanus')) {
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

async function mainLoop(data) {
    updateStatus('MENCARI ANTRIAN...');

    // Pastikan loop hanya jalan jika BOT_RUNNING = true
    while (BOT_RUNNING && location.hostname.includes('sehatindonesiaku')) {
        
        // GUNAKAN 'let' supaya nilainya bisa diupdate di dalam loop
        let nextItem = null;

        // --- RE-TRY LOGIC ---
        // Mencoba mencari tombol hingga 3 kali
        for (let i = 0; i < 3; i++) {
            nextItem = getNextTarget(); // Sekarang aman karena let
            if (nextItem) break; 
            
            console.log("Tombol belum muncul, mencoba lagi (percobaan " + (i+1) + ")...");
            await sleep(2000);
        }

        // Jika setelah 3 kali tetap tidak ketemu
        if (!nextItem) {
            BOT_RUNNING = false;
            clearBOT();
            clearCompleted();
            updateStatus('SELESAI SEMUA TARGET.\nSilakan ganti NIK untuk pasien baru.');
            alert('Semua antrian pemeriksaan selesai!');
            break;
        }

        updateStatus('MEMBUKA TARGET:\n' + nextItem.title.toUpperCase());
        addCompleted(nextItem.id); 
        
        // Klik tombol
        nextItem.btn.click();
        
        // Tunggu form muncul
        await sleep(5000); 
    }
}

/* =========================================================
   UI MODERN & DRAGGABLE
========================================================= */
// Tambahan variabel LOOP_ACTIVE agar bot tidak bertabrakan saat pindah halaman
let LOOP_ACTIVE = false; 

function updateStatus(text){ const el = document.getElementById('bot-status'); if(el) el.innerText = text; }
function stopBOT(){ BOT_RUNNING = false; LOOP_ACTIVE = false; clearBOT(); clearCompleted(); updateStatus('BOT DIHENTIKAN & NIK DIHAPUS.'); }

function syncUI() {
    const data = loadBOT();
    const btnStart = document.getElementById('run-bot');
    const btnNext = document.getElementById('next-bot');
    const inputNik = document.getElementById('nik-bot');
    const estafetWrap = document.getElementById('estafet-wrap');

    if (!btnStart || !btnNext || !inputNik || !estafetWrap) return;

    if (data) {
        btnStart.style.display = 'none';
        btnNext.style.display = 'block';
        estafetWrap.style.display = 'flex'; // Munculkan tombol Estafet
        inputNik.value = data.nik || '';
        inputNik.disabled = true;
        updateStatus('SIAP. KLIK "SELANJUTNYA"');
    } else {
        btnStart.style.display = 'block';
        btnNext.style.display = 'none';
        estafetWrap.style.display = 'none'; // Sembunyikan Estafet
        inputNik.value = '';
        inputNik.disabled = false;
        updateStatus('INISIALISASI...');
    }
}

function createUI(){
    if(document.getElementById('auto-ckg-ui')) return;
    const box = document.createElement('div'); box.id = 'auto-ckg-ui';
    box.innerHTML = `
        <div id="drag-handle">SKRINING PADASUKA (MANUAL)</div>
        <div id="bot-status">INISIALISASI...</div>
        <input id="nik-bot" placeholder="Masukkan NIK">
        
        <div id="btn-wrap">
            <button id="run-bot">START DATA</button>
            <button id="next-bot" style="display:none; background:#f59e0b; color:#000;">⏩ SELANJUTNYA</button>
            <button id="stop-bot">BATAL</button>
        </div>

        <!-- TOMBOL ESTAFET BARU -->
        <div id="estafet-wrap" style="display:none; gap:8px; margin-top:8px;">
            <button id="btn-to-input" style="flex:1; background:#10b981; color:#fff; border:none; padding:8px; border-radius:8px; cursor:pointer; font-weight:bold; transition:0.2s;">DEWASA ⏭️</button>
            <button id="btn-to-anak" style="flex:1; background:#eab308; color:#fff; border:none; padding:8px; border-radius:8px; cursor:pointer; font-weight:bold; transition:0.2s;">ANAK ⏭️</button>
        </div>
    `;
    const style = document.createElement('style');
    style.innerHTML = `
        #auto-ckg-ui {
            position: fixed; top: 100px; right: 20px; width: 300px;
            background: rgba(15, 15, 15, 0.95); backdrop-filter: blur(15px);
            border: 1px solid rgba(0, 200, 255, 0.5); border-radius: 16px;
            z-index: 2147483647; 
            padding: 15px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            font-family: 'Segoe UI', sans-serif; color: white; cursor: default;
        }
        #drag-handle { padding: 5px; text-align: center; font-weight: bold; color: #00c8ff; cursor: move; margin-bottom: 10px; border-bottom: 1px solid #333; }
        #bot-status { background: rgba(0,0,0,0.4); border-radius: 8px; padding: 10px; min-height: 50px; margin-bottom: 10px; color: #00c8ff; font-size: 13px; text-align: center; white-space: pre-wrap; font-weight:bold; }
        #nik-bot { width: 100%; box-sizing: border-box; padding: 10px; border: none; border-radius: 8px; background: #333; color: white; margin-bottom: 10px; text-align:center; font-weight:bold; }
        #btn-wrap { display: flex; gap: 8px; }
        #run-bot, #stop-bot, #next-bot { flex: 1; border: none; padding: 10px; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.2s; }
        #run-bot { background: #00c8ff; color: #000; }
        #run-bot:hover { background: #009acc; }
        #stop-bot { background: #ff4444; color: white; }
        #btn-to-input:hover { background: #059669; }
        #btn-to-anak:hover { background: #ca8a04; }
    `;
    document.head.appendChild(style); document.body.appendChild(box);

    const handle = document.getElementById('drag-handle');
    if(handle){
        let isDragging = false, offsetX, offsetY;
        handle.onmousedown = (e)=>{ isDragging = true; offsetX = e.clientX - box.offsetLeft; offsetY = e.clientY - box.offsetTop; };
        document.onmousemove = (e)=>{ if(isDragging){ box.style.left = (e.clientX - offsetX) + 'px'; box.style.top = (e.clientY - offsetY) + 'px'; box.style.right = 'auto'; } };
        document.onmouseup = ()=>{ isDragging = false; };
    }

    // 1. TOMBOL START (Mengunci Data & Siap Eksekusi)
    document.getElementById('run-bot').onclick = async ()=>{
        const nik = document.getElementById('nik-bot').value;
        if(!nik) return alert('Masukkan NIK');

        updateStatus('MENCARI NIK DI DATABASE LOKAL...');
        const data = await cariData(nik);

        if(!data) return; // Jika kosong, fungsi cariData sudah menampilkan Alert

        saveBOT(data);
        clearCompleted(); 
        syncUI();
        playSound('sukses');
    };

    // 2. TOMBOL SELANJUTNYA (Satu kali klik, satu aksi)
    document.getElementById('next-bot').onclick = async () => {
        if (IS_PROCESSING) return; 
        
        const data = loadBOT();
        if (!data) return stopBOT();

        IS_PROCESSING = true;
        const btnNext = document.getElementById('next-bot');
        const oldText = btnNext.innerHTML;
        btnNext.innerHTML = "⏳ DIPROSES...";
        btnNext.style.background = "#d97706"; // Warna loading

        try {
            if (location.hostname.includes('form.kemkes.go.id')) {
                updateStatus('⚡ Mengisi Formulir...');
                await eksekusiIsiFormulir(data);
            } else if (location.hostname.includes('sehatindonesiaku')) {
                updateStatus('🔍 Mencari Menu...');
                await eksekusiMenuSelanjutnya();
            }
        } catch (e) {
            console.error(e);
            updateStatus('Terjadi kesalahan. Coba klik kembali.');
        }

        btnNext.innerHTML = oldText;
        btnNext.style.background = "#f59e0b";
        IS_PROCESSING = false;
    };
    
    // 3. TOMBOL ESTAFET LANGSUNG KE INPUT (BYPASS)
    document.getElementById('btn-to-input').onclick = () => {
        const nik = document.getElementById('nik-bot').value;
        if(!confirm('Anda yakin ingin pindah ke Modul INPUT DEWASA?')) return;
        
        // Simpan NIK Estafet
        try { GM_setValue('PASIEN_AKTIF', JSON.stringify({ nik: nik, kategori: 'dewasa' })); }
        catch(e) { localStorage.setItem('PASIEN_AKTIF', JSON.stringify({ nik: nik, kategori: 'dewasa' })); }
        
        // Ganti Setelan Launcher agar membuka Input Dewasa
        try { GM_setValue('CKG_MODE', 'input'); }
        catch(e) { localStorage.setItem('CKG_MODE', 'input'); }
        
        clearBOT(); clearCompleted();
        updateStatus('Beralih ke Input Dewasa...');
        setTimeout(() => location.reload(), 500); // Reload halaman agar Launcher menyuntik skrip yang baru
    };

    document.getElementById('btn-to-anak').onclick = () => {
        const nik = document.getElementById('nik-bot').value;
        if(!confirm('Anda yakin ingin pindah ke Modul INPUT ANAK?')) return;
        
        // Simpan NIK Estafet
        try { GM_setValue('PASIEN_AKTIF', JSON.stringify({ nik: nik, kategori: 'anak' })); }
        catch(e) { localStorage.setItem('PASIEN_AKTIF', JSON.stringify({ nik: nik, kategori: 'anak' })); }
        
        // Ganti Setelan Launcher agar membuka Input Anak
        try { GM_setValue('CKG_MODE', 'input_anak'); }
        catch(e) { localStorage.setItem('CKG_MODE', 'input_anak'); }
        
        clearBOT(); clearCompleted();
        updateStatus('Beralih ke Input Anak...');
        setTimeout(() => location.reload(), 500); // Reload halaman agar Launcher menyuntik skrip yang baru
    };

    // 4. TOMBOL BATAL (Mematikan Segala Proses)
    document.getElementById('stop-bot').onclick = () => {
        stopBOT();
        alert('Bot berhasil dibatalkan. Memori NIK dihapus.');
    };

    syncUI();
}

/* =========================================================
   INIT / SUPERVISOR OBSERVER (ANTI MACET SPA)
========================================================= */
// 1. Amankan UI agar selalu muncul
setInterval(createUI, 1000);

let isDownloadingBackground = false;

// 2. Supervisor Loop (Berjalan setiap 2 detik memantau URL tanpa henti)
========================================================= */
setInterval(() => {
    createUI(); // Pastikan UI selalu ada

    // Cek memori lemparan dari form pendaftaran
    let estafetRaw = null;
    try { estafetRaw = GM_getValue('PASIEN_AKTIF'); } catch(e) { estafetRaw = localStorage.getItem('PASIEN_AKTIF'); }

    const curData = loadBOT();
    
    // Jika ada data lemparan, dan kita sedang belum menjalankan NIK apapun
    if (estafetRaw && !curData) {
        const estafet = JSON.parse(estafetRaw);
        
        // Hapus memori estafet agar tidak terpicu berkali-kali
        try { GM_deleteValue('PASIEN_AKTIF'); } catch(e) { localStorage.removeItem('PASIEN_AKTIF'); }

        if (estafet.kategori === 'dewasa') {
            const inputNik = document.getElementById('nik-bot');
            const btnStart = document.getElementById('run-bot');
            if (inputNik && btnStart) {
                inputNik.value = estafet.nik;
                btnStart.click(); // Klik start otomatis (Data tersimpan & Tombol Selanjutnya Muncul)
            }
        }
    }
}, 2000);

})(typeof GM_xmlhttpRequest !== "undefined" ? GM_xmlhttpRequest : null);
