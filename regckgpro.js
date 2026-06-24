(function (GM_xmlhttpRequest) {
'use strict';
    const request = GM_xmlhttpRequest;

function wait(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }
    
/* ================= MODE CKG UMUM ================= */

const SHEETS = [{
    id: "1zOX229-nq8n0-jCSTMEL1r4CVqW_hYctcpo-5pgjY_E",
    gids: ["0"],
    colNama: 5,
    colTgl: 8,
    colWA: 20,
    colJK: 6,
    colPekerjaan: 22,
    colKelurahan: 17,
    colAlamat: 14,
    colMartial: 21,
    waStatis: true
}];

console.log("MODE: CKG UMUM");

let isProcessing = false;
let loadingEl = null;
/* ================= LOADING SCREEN ================= */
function showLoading(text){
    if(loadingEl) { loadingEl.querySelector('#loadText').innerHTML = text; return; }
    loadingEl = document.createElement("div");
    loadingEl.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;color:#00ff88;font-size:20px;font-weight:bold;text-align:center;flex-direction:column;";
    loadingEl.innerHTML = `<div style="background:#111;padding:30px;border-radius:12px;border:3px solid #00ff88;box-shadow:0 0 20px #00ff88;"><span id="loadText">${text}</span><br><br><div style="margin:auto;border:6px solid #333;border-top:6px solid #00ff88;border-radius:50%;width:50px;height:50px;animation:spin 1s linear infinite;"></div></div>`;
    document.body.appendChild(loadingEl);
}
function hideLoading(){ if(loadingEl){ loadingEl.remove(); loadingEl = null; } }
const style = document.createElement('style'); style.innerHTML = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`; document.head.appendChild(style);

/* ================= LOGIKA DATA & SAFE CLICK ================= */
const normalizeNIK = v => String(v || "").replace(/\D/g, '');

function sikatReactInput(element, value){
    if(!element) return;
    const setter = Object.getOwnPropertyDescriptor(element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype, 'value').set;
    if(setter){
        setter.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles:true }));
        element.dispatchEvent(new Event('change', { bubbles:true }));
    }
}

function forceInject(element, value) {
    if (!element) return;
    element.removeAttribute('disabled');
    element.removeAttribute('readonly');
    sikatReactInput(element, value);
}

function getInput(keyword){
    const inputs = Array.from(document.querySelectorAll("input, textarea"));
    let target = inputs.find(i => (i.placeholder || "").toLowerCase().includes(keyword.toLowerCase()));
    if(target) return target;
    const labels = Array.from(document.querySelectorAll('.ant-form-item-label label'));
    const label = labels.find(l => l.innerText.toLowerCase().includes(keyword.toLowerCase()));
    if (label) {
        const row = label.closest('.ant-form-item');
        if (row) return row.querySelector('input, textarea');
    }
    return null;
}

async function ultraClick(el){
    if(!el) return false;
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width/2;
    const y = rect.top + rect.height/2;
    el.scrollIntoView({ behavior:'smooth', block:'center' });
    await wait(300);
    ['pointerover','mouseover','mouseenter'].forEach(type=>{
        el.dispatchEvent(new MouseEvent(type,{ bubbles:true, clientX:x, clientY:y }));
    });
    await wait(80);
    el.dispatchEvent(new PointerEvent('pointerdown',{ bubbles:true, pointerType:'mouse', clientX:x, clientY:y, isPrimary:true }));
    el.dispatchEvent(new MouseEvent('mousedown',{ bubbles:true, clientX:x, clientY:y }));
    await wait(120);
    el.dispatchEvent(new PointerEvent('pointerup',{ bubbles:true, pointerType:'mouse', clientX:x, clientY:y, isPrimary:true }));
    el.dispatchEvent(new MouseEvent('mouseup',{ bubbles:true, clientX:x, clientY:y }));
    await wait(50);
    el.click();
    return true;
}

async function prosesVerifikasi() {
    while (true) {
        const pilihText = Array.from(
            document.querySelectorAll('.tracking-wide')
        ).find(el =>
            (el.innerText || "").trim() === "Pilih"
        );
        
        const pilihBtn =
            pilihText?.closest('.flex.flex-row.justify-center.gap-2') ||
            pilihText?.parentElement ||
            pilihText;

        if (pilihBtn) {
            await ultraClick(pilihBtn);
            break;
        }
        await wait(500);
    }

    console.log("[BOT] Tombol Pilih berhasil diklik");

    while (true) {
        const daftarBtn = document.querySelector(
            'button.btn-fill-primary-v2'
        );
    
        if (
            daftarBtn &&
            daftarBtn.innerText.includes("Daftarkan dengan NIK")
        ) {
            console.log("[BOT] Tombol Daftarkan ditemukan");
            await ultraClick(daftarBtn);
            break;
        }
        await wait(500);
    }
}

/* ================= TARIK DATA SPREADSHEET ================= */
/* ================= TARIK DATA SPREADSHEET ================= */
// Variabel untuk menyimpan data agar tidak perlu download berulang-ulang
let cachedSheetData = null; 

async function cariData(nikInput){
    const target = normalizeNIK(nikInput);
    console.log("[BOT] Mencari NIK:", target, "di Spreadsheet...");
    
    try {
        // Jika data belum ada di memori, bot akan mendownloadnya dari Google Sheets
        if (!cachedSheetData) {
            console.log("[BOT] Mengunduh database dari Google Sheets...");
            const url = `https://docs.google.com/spreadsheets/d/${SHEETS[0].id}/gviz/tq?tqx=out:json&tq&gid=${SHEETS[0].gids[0]}`;
            const res = await fetch(url);
            const txt = await res.text();
            
            // Membaca format JSON dari Google Visualization API
            const json = JSON.parse(txt.substring(47, txt.length - 2));
            cachedSheetData = json.table.rows;
            console.log("[BOT] Database berhasil diunduh. Total baris:", cachedSheetData.length);
        }

        // Mulai mencocokkan NIK di dalam data yang sudah didownload
        for(const r of cachedSheetData){
            // Memetakan sel data menjadi array string
            const row = r.c.map(x => x ? String(x.v || '') : '');
            
            // Cek apakah NIK cocok (Asumsi NIK ada di kolom index 0, 1, atau 11)
            if(normalizeNIK(row[0]) === target || normalizeNIK(row[1]) === target || normalizeNIK(row[11]) === target){
                console.log("[BOT] Data ditemukan untuk NIK:", target);
                return {
                    nik: target,
                    nama: row[SHEETS[0].colNama] || '',
                    tgl: row[SHEETS[0].colTgl] || '',
                    hp: row[SHEETS[0].colWA] || '',
                    jk: row[SHEETS[0].colJK] || '',
                    alamat: row[SHEETS[0].colAlamat] || '',
                    pekerjaan: row[SHEETS[0].colPekerjaan] || '',
                    kelurahan: row[SHEETS[0].colKelurahan] || '',
                    Martial: row[SHEETS[0].colMartial] || ''
                };
            }
        }
    } catch (e) {
        console.error("[BOT ERROR] Gagal mengunduh atau membaca data Spreadsheet:", e);
    }

    console.warn("[BOT] NIK tidak ditemukan di data spreadsheet.");
    return null; 
}

/* ================= ENGINE ALAMAT WILAYAH VUE (BARU) ================= */
async function setAlamatDomisiliVue() {
    console.log("[BOT] Menyetel Alamat Domisili Otomatis...");
    const steps = ["Jawa Barat", "Kota Bandung", "Cibeunying Kidul", "Padasuka"];

    const allElements = Array.from(document.querySelectorAll('div, span'));
    const trigger = allElements.find(el => (el.innerText || "").toLowerCase().trim() === "pilih alamat domisili" && el.children.length === 0);

    if (!trigger) return false;
    await ultraClick(trigger.closest('.cursor-pointer') || trigger);
    await wait(1000);

    for (const step of steps) {
        console.log("[BOT] Memilih wilayah:", step);
        let searchInput = Array.from(document.querySelectorAll('input')).find(el => (el.placeholder || "").toLowerCase().includes("cari"));
        if (searchInput) {
            forceInject(searchInput, step);
            await wait(1500);
        }

        let clicked = false;
        for (let i = 0; i < 15; i++) {
            const options = Array.from(document.querySelectorAll('div.flex.items-center.justify-between')).filter(el => (el.innerText || "").trim().toLowerCase() === step.toLowerCase());
            if (options.length > 0) {
                await ultraClick(options[options.length - 1]);
                clicked = true;
                await wait(1000);
                break;
            }
            await wait(400);
        }
        if(!clicked) {
            console.log("[BOT] Gagal di wilayah:", step);
            break;
        }
    }
}

/* ================= EKSEKUSI HALAMAN 2 (VUE VERSION) ================= */
    async function eksekusiHalamanDua(data) {
    showLoading("⚡ MENGISI HALAMAN 2... ⚡");

    await wait(2500);

/* ================= ISI STATUS PERNIKAHAN ================= */
console.log("[BOT] Memproses Status Pernikahan:", data.Martial);
let rawPernikahan = (data.Martial || "").trim().toUpperCase();
let textToFindPernikahan = "";

if (rawPernikahan.includes("BELUM")) {
    textToFindPernikahan = "Belum Menikah";
} else if (rawPernikahan.includes("MENIKAH") || rawPernikahan.includes("KAWIN")) {
    textToFindPernikahan = "Menikah";
} else if (rawPernikahan.includes("CERAI HIDUP") || rawPernikahan.includes("CERAI_HIDUP") || rawPernikahan.includes("JANDA") || rawPernikahan.includes("DUDA")) {
    textToFindPernikahan = "Cerai Hidup"; 
} else if (rawPernikahan.includes("CERAI MATI") || rawPernikahan.includes("CERAI_MATI")) {
    textToFindPernikahan = "Cerai Mati";
}

if (textToFindPernikahan !== "") {
    const allElements = Array.from(document.querySelectorAll('span, div.cursor-pointer, label'));
    const triggerPernikahan = allElements.find(el => {
        const txt = (el.innerText || "").toLowerCase().trim();
        return txt === 'pilih status pernikahan' || txt === 'status pernikahan';
    });

    if (triggerPernikahan) {
        const clickableTrigger = triggerPernikahan.closest('.cursor-pointer') || triggerPernikahan;
        await ultraClick(clickableTrigger);
        await wait(1000);

        let optionFound = false;
        for (let i = 0; i < 15; i++) {
            const targetOption = [...document.querySelectorAll('.py-2.px-4.cursor-pointer')].find(el => (el.innerText || '').trim() === textToFindPernikahan);
            if (targetOption) {
                await ultraClick(targetOption);
                console.log("[BOT] Status Pernikahan dipilih:", textToFindPernikahan);
                optionFound = true;
                await wait(1000);
                break;
            }
            await wait(400);
        }
        if (!optionFound) console.log("[BOT] Error: Opsi Status Pernikahan tidak muncul.");
    } else {
        console.log("[BOT] Error: Kotak 'Status Pernikahan' tidak ditemukan.");
    }
}

/* ================= 2. PEKERJAAN ================= */
    console.log("[BOT] Memproses Pekerjaan...");
    let jobTarget = (data.pekerjaan || data.Pekerjaan || "").trim();
    let jobAsli = jobTarget;
    const jobUpper = jobTarget.toUpperCase();

    if (jobUpper.includes("BLM.") || jobUpper.includes("TIDAK BEKERJA")) jobTarget = "Belum/Tidak Bekerja";
    else if (jobUpper.includes("IBU R.TANGGA") || jobUpper.includes("IBU R")) jobTarget = "Ibu Rumah Tangga";
    else if (jobUpper.includes("PEG. NEGERI") || jobUpper.includes("PNS")) jobTarget = "ASN (Kantor Pemerintah)";
    else if (jobUpper.includes("KARYAWAN SWASTA")) jobTarget = "Pegawai Swasta";
    else if (jobUpper.includes("WIRASWASTA")) jobTarget = "Wirausaha/Pekerja Mandiri";
    else if (jobUpper === "BURUH") jobTarget = "Pekerja Pabrik / Buruh";
    else if (jobUpper.includes("NELAYAN")) jobTarget = "Nelayan / Perikanan";
    else if (jobUpper.includes("PETANI")) jobTarget = "Petani / Pekebun";
    else if (jobUpper.includes("TNI/POLRI") || jobUpper.includes("TNI")) jobTarget = "TNI";
    else if (jobUpper.includes("PURNAWIRAWAN")) jobTarget = "Pensiunan";
    else if (jobUpper.includes("LAIN-LAIN") || jobUpper === "PROFESIONAL") jobTarget = "Lainnya";
    
    if (jobTarget) {
        const triggers = Array.from(document.querySelectorAll('div, span'));
        const triggerPekerjaan = triggers.find(el => 
            (el.innerText || "").toLowerCase().trim() === "pilih pekerjaan" ||
            ((el.innerText || "").toLowerCase().trim().includes("pekerjaan") && el.className.includes('cursor-pointer'))
        );

        if (triggerPekerjaan) {
            triggerPekerjaan.click();
            await wait(1200); 

            const splitKata = jobTarget.split(/\s+/); 
            let kataPencarian = jobTarget;
            if (splitKata.length >= 3) kataPencarian = splitKata[0]; 

            const searchInput = document.querySelector('.modal-content input[placeholder*="Cari"], input[placeholder*="Cari"]');
            if (searchInput) {
                forceInject(searchInput, kataPencarian);
                await wait(1500); 
            }

            let optionFound = false;
            for (let i = 0; i < 20; i++) {
                const btn = [...document.querySelectorAll('.modal-content button')].find(x => (x.innerText || "").trim().toLowerCase() === jobTarget.toLowerCase());
                if (btn) {
                    btn.click(); 
                    optionFound = true;
                    await wait(1200); 
                    break;
                }
                await wait(400); 
            }
            if (!optionFound) { document.body.click(); await wait(800); }
        }
    }
    await wait(1500);

    /* ================= 3. ALAMAT DOMISILI ================= */
    console.log("[BOT] Memproses Domisili...");
    showLoading("⚡ MENCARI WILAYAH PADASUKA... ⚡");
    await setAlamatDomisiliVue();
    await wait(2000);

    /* ================= 4. DETAIL DOMISILI ================= */
    console.log("[BOT] Mengisi Detail Alamat...");
    showLoading("⚡ MENYUNTIKKAN DETAIL ALAMAT... ⚡");
    let inpAlamat = document.getElementById('detail-domisili') || document.querySelector('textarea[placeholder*="Jl. Kenanga"]');

    if(inpAlamat){
        inpAlamat.scrollIntoView({ behavior:"smooth", block:"center" });
        await wait(500);
        let alamatTarget = data.alamat || "-";
        forceInject(inpAlamat, alamatTarget);
        await wait(500);
        inpAlamat.dispatchEvent(new Event('input', { bubbles:true }));
        inpAlamat.dispatchEvent(new Event('change', { bubbles:true }));
        inpAlamat.blur();
    }

    hideLoading();
            
    while(true){
        const btnNext2 = Array.from(document.querySelectorAll("button")).find(btn => {
            const txt = (btn.innerText || "").trim();
            return (txt === "Selanjutnya" && !btn.disabled && btn.offsetParent !== null);
        });

        if(btnNext2){
            await ultraClick(btnNext2);
            await wait(3000);
            await prosesVerifikasi();
            break;
        }
        await wait(1000);
    }
}

/* ================= SISTEM SEMI AUTO-PILOT ================= */
async function autoPilotSikatHabis(data) {
    showLoading("⚡ AUTO-PILOT AKTIF ⚡<br><span style='font-size:14px;color:#fff;'>Mengisi NIK...</span>");

    const btnTambah = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Tambah Baru') || b.innerText.includes('Tambah Peserta'));
    if (btnTambah && !document.querySelector('.ant-modal-content')) {
        ultraClick(btnTambah);
        await wait(1500);
    }

    const inpNIK = getInput("nik");
    if (inpNIK) {
        forceInject(inpNIK, data.nik);
        await wait(300);
        const btnCek = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Cek NIK') || b.innerText.includes('Cari'));
        if (btnCek) ultraClick(btnCek);
    }

    showLoading("⏳ Menunggu Dukcapil Mereset Form...");
    await wait(5000);
    showLoading("⚡ MENGISI DATA AWAL... ⚡");

    let inpNama = getInput("nama lengkap");
    if (inpNama) forceInject(inpNama, data.nama);

    let cleanHP = (data.hp || "").replace(/^0/, "");
    let inpWA = getInput("whatsapp") || getInput("telepon");
    if (inpWA) forceInject(inpWA, cleanHP);

    /* ================= ISI JK ================= */
    console.log("[BOT] Memproses Jenis Kelamin:", data.jk);
    let rawJK = (data.jk || "").trim().toUpperCase();
    let textToFindJK = "";

    if (rawJK.includes("LAKI") || rawJK === "L" || rawJK === "LK") textToFindJK = "Laki-laki";
    else if (rawJK.includes("PEREM") || rawJK === "P" || rawJK === "PR" || rawJK.includes("WANITA")) textToFindJK = "Perempuan";

    if (textToFindJK !== "") {
        const allElements = Array.from(document.querySelectorAll('span, div.cursor-pointer, label'));
        const triggerJK = allElements.find(el => {
            const txt = (el.innerText || "").toLowerCase().trim();
            return txt === 'pilih jenis kelamin' || txt === 'jenis kelamin';
        });

        if (triggerJK) {
            const clickableTrigger = triggerJK.closest('.cursor-pointer') || triggerJK;
            await ultraClick(clickableTrigger);
            await wait(1000); 

            let optionFound = false;
            for (let i = 0; i < 15; i++) {
                const possibleOptions = Array.from(document.querySelectorAll('*')).filter(el => {
                    return (el.innerText || "").trim() === textToFindJK && el.children.length === 0;
                });

                if (possibleOptions.length > 0) {
                    const targetOption = possibleOptions[possibleOptions.length - 1];
                    await ultraClick(targetOption);
                    optionFound = true;
                    await wait(800);
                    break;
                }
                await wait(400); 
            }
        }
    }

    /* ================= ISI TANGGAL ================= */
    let tglRaw = data.tgl || "";
    if (tglRaw.trim() !== "") {
        let parts = tglRaw.split(/[-/]/);
        if (parts.length === 3) {
            let yyyy, mm, dd;
            if (parts[0].length === 4) { yyyy = parts[0]; mm = parts[1]; dd = parts[2]; }
            else { dd = parts[0]; mm = parts[1]; yyyy = parts[2]; }

            const targetDay = parseInt(dd, 10).toString();
            const targetMonthIdx = parseInt(mm, 10) - 1;
            const targetYear = yyyy;

            const wrappers = Array.from(document.querySelectorAll('.mx-input-wrapper'));
            const targetWrapper = wrappers.find(w => w.innerText.toLowerCase().includes('tanggal lahir'));

            if (targetWrapper) {
                await ultraClick(targetWrapper);
                await wait(800);

                const btnYear = document.querySelector('.mx-btn-current-year');
                if (btnYear) {
                    await ultraClick(btnYear);
                    await wait(600);
                    for (let i = 0; i < 15; i++) {
                        const yearCells = Array.from(document.querySelectorAll('.mx-table-year td'));
                        const cell = yearCells.find(c => c.innerText.trim() === targetYear);
                        if (cell) { await ultraClick(cell); await wait(600); break; }
                        else {
                            const btnPrev = document.querySelector('.mx-btn-icon-double-left') || document.querySelector('.mx-icon-double-left')?.closest('button');
                            if (btnPrev) { await ultraClick(btnPrev); await wait(500); }
                            else break;
                        }
                    }
                }

                if (document.querySelectorAll('.mx-table-month td').length === 0) {
                    const btnMonth = document.querySelector('.mx-btn-current-month');
                    if (btnMonth) { await ultraClick(btnMonth); await wait(600); }
                }

                const monthCells = Array.from(document.querySelectorAll('.mx-table-month td'));
                if (monthCells.length > targetMonthIdx) { await ultraClick(monthCells[targetMonthIdx]); await wait(600); }

                const dateCells = Array.from(document.querySelectorAll('.mx-table-date td:not(.not-current-month):not(.out-in)'));
                const dayCell = dateCells.find(c => c.innerText.trim() === targetDay);
                if (dayCell) { await ultraClick(dayCell); await wait(800); }
            }
        }
    }


    /* ================= AUTO NEXT ================= */
    let btnLanjut = null;
    while(true){
        btnLanjut = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Selanjutnya'));
        if(btnLanjut && !btnLanjut.disabled && !btnLanjut.classList.contains('ant-btn-disabled')){
            break;
        }
        await wait(500);
    }
    await ultraClick(btnLanjut);

    while(true){
        const lanjutBtn = Array.from(document.querySelectorAll('button.btn-fill-primary')).find(btn => (btn.innerText || "").includes("Lanjutkan"));
        if(lanjutBtn){
            await ultraClick(lanjutBtn);
            break;
        }
        await wait(500);
    }

    /* ================= HALAMAN 2 ================= */
    await eksekusiHalamanDua(data);

    /* ================= PENYELESAIAN ================= */
    await tuntaskanRegistrasiDanKonfirmasi();
}

/* ================= FUNGSI BARU: PENYELESAIAN & TIKET ================= */
async function tuntaskanRegistrasiDanKonfirmasi() {
    let tiketEl = null;
    while(true){
        tiketEl = Array.from(document.querySelectorAll('div')).find(el => (el.innerText || "").includes("No. Tiket:"));
        if(tiketEl) break;
        await wait(1000); 
    }
    
    const match = tiketEl.innerText.match(/No\. Tiket:\s*([A-Z0-9-]+)/);
    const kodeTiket = match ? match[1] : null;
    
    const btnTutup = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes("Tutup"));
    if (btnTutup) await ultraClick(btnTutup);
    await wait(1000);

    const inpTiket = document.getElementById("searchNik");
    if (inpTiket && kodeTiket) {
        forceInject(inpTiket, kodeTiket);
        inpTiket.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await wait(2000);
    }

    let btnKonfirmasi = null;
    for(let i=0; i<10; i++){
        btnKonfirmasi = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes("Konfirmasi Hadir"));
        if(btnKonfirmasi) break;
        await wait(500);
    }
    if (btnKonfirmasi) await ultraClick(btnKonfirmasi);
    await wait(1500);

    const checkbox = document.getElementById("verify");
    if (checkbox) await ultraClick(checkbox);
    
    const btnHadirFinal = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes("Hadir"));
    if (btnHadirFinal) await ultraClick(btnHadirFinal);
    await wait(2000);

    let btnSkrining = null;
    for(let i=0; i<10; i++){
        btnSkrining = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes("Periksa Skrining Mandiri"));
        if(btnSkrining) break;
        await wait(500);
    }
    
    if (btnSkrining) {
        await ultraClick(btnSkrining);
        console.log("[BOT] Registrasi tuntas, berpindah ke modul Skrining!");
    }
}


/* ================= UI KONTROL & DRAGGABLE LOGIC ================= */
window.runRegisterCKG = async function(nik){
    let val = String(nik || '').replace(/\D/g,'');
    if (val.length !== 16) {
        console.error("[BOT] NIK tidak valid:", val);
        return false;
    }
    if (isProcessing) return false;
    isProcessing = true;

    try {
        console.log("[BOT] Mencari tombol Daftar Baru...");
        
        // --- PERBAIKAN: MENEMBUS LAYER MASK/OVERLAY SECARA NATIVE ---
        let daftarBaruBtn = null;
        const elements = document.querySelectorAll('div, button, span');
        for (let el of elements) {
            // Cek text murni di dalam tag tersebut
            if ((el.innerText || el.textContent || "").trim() === "Daftar Baru") {
                // Ambil parent button-nya, atau gunakan elemen itu sendiri
                daftarBaruBtn = el.closest('button') || el;
                if (daftarBaruBtn.offsetParent !== null) {
                    break; // Tombol ketemu dan tampil di layar
                }
            }
        }

        if (daftarBaruBtn) {
            console.log("[BOT] Tombol Daftar Baru ditemukan. Memaksa Klik Native...");
            
            // Menggunakan klik native bawaan JS.
            // Cara ini langsung men-trigger Event DOM tanpa menggunakan koordinat XY,
            // sehingga elemen <rect class="mask target"> di atasnya TIDAK akan menghalangi klik.
            daftarBaruBtn.click();
            
            // Fallback memicu Event jika click() murni diblokir kerangka Vue
            daftarBaruBtn.dispatchEvent(new Event('click', { bubbles: true }));
            
            await wait(2500); // Tunggu form NIK muncul
        } else {
            console.log("[BOT] Tombol Daftar Baru tidak ditemukan atau form sudah terbuka.");
        }
        // -----------------------------------------------------------

        console.log("[BOT] Menunggu kolom NIK muncul...");
        let inpPortal = null;
        
        // Loop tunggu kolom NIK sampai 10 detik
        for(let i = 0; i < 10; i++){
            // Mencari input dengan placeholder NIK atau class ant-input
            inpPortal = document.querySelector('input[placeholder*="NIK" i], input[name="nik" i], .ant-input');
            if (inpPortal && inpPortal.offsetParent !== null) break;
            await wait(1000);
        }

        if (!inpPortal) {
            throw new Error("Kolom NIK gagal muncul setelah 10 detik.");
        }

        console.log("[BOT] Kolom NIK ditemukan, mengisi data:", val);
        forceInject(inpPortal, val);
        await wait(1000);

        // Cari tombol Cari/Cek
        const btnCek = Array.from(document.querySelectorAll('button')).find(el => 
            (el.innerText || "").toLowerCase().includes("cek") || 
            (el.innerText || "").toLowerCase().includes("cari")
        );

        if (btnCek) {
            console.log("[BOT] Mengklik tombol Cari/Cek...");
            btnCek.click();
        } else {
            console.warn("[BOT] Tombol Cari/Cek tidak ditemukan.");
        }

        await wait(3000);

        // Ambil data
        const data = await cariData(val);
        if (data) {
            await autoPilotSikatHabis(data);
            return true;
        } else {
            console.error("[BOT] Gagal melanjutkan: Data Spreadsheet tidak ada.");
            return false;
        }

    } catch (err) {
        console.error("[BOT ERROR]", err);
        return false;
    } finally {
        isProcessing = false;
    }
};

/* ================= JEMBATAN KE MASTER UI (OTOMATIS RUN) ================= */
setTimeout(() => {
    try {
        const isBotActive = GM_getValue('BOT_RUNNING_STATE', false);
        const masterNIK = GM_getValue('MASTER_NIK_INPUT', '');
        
        // Jika Master Launcher mengirim NIK dan Bot statusnya aktif, langsung eksekusi
        if (isBotActive && masterNIK.length >= 16) {
            console.log("[BOT] Terhubung dengan Master UI! Otomatis memproses NIK:", masterNIK);
            window.runRegisterCKG(masterNIK);
        }
    } catch (e) {
        console.log("[BOT] Jembatan Master UI tidak aktif/terjadi error:", e);
    }
}, 2500); // Tunggu website selesai loading (2.5 detik)

})(typeof GM_xmlhttpRequest !== "undefined" ? GM_xmlhttpRequest : null);
