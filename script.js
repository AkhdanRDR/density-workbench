// === 1. SIMULATOR LOGIC (Mirrors UnitHelper::resolveStockConversion) ===
const state = {
  whUnit: "gram",
  whScale: 1,
  outUnit: "ml",
  outScale: 1,
  quantity: 1000,
  density: 0.9,
};

const qtyInput = document.getElementById("qtyInput");
const densitySlider = document.getElementById("densitySlider");
const densityValueLabel = document.getElementById("densityValueLabel");
const baseGramsHint = document.getElementById("baseGramsHint");
const outletResultDisplay = document.getElementById("outletResultDisplay");
const outletUnitDisplay = document.getElementById("outletUnitDisplay");
const naiveResultText = document.getElementById("naiveResultText");
const actualResultText = document.getElementById("actualResultText");
const naiveBar = document.getElementById("naiveBar");
const actualBar = document.getElementById("actualBar");
const diffBox = document.getElementById("diffBox");
const diffValueText = document.getElementById("diffValueText");

function formatNum(num, digits = 2) {
  return num.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

// --- Smooth number tween (easeOutCubic), animates from the last shown value ---
const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

function animateNumber(el, to, suffix = "", signed = false, duration = 600) {
  const fmt = (v) => (signed && v > 0 ? "+" : "") + formatNum(v) + suffix;
  const from = el._val ?? to;
  el._val = to;
  cancelAnimationFrame(el._raf);
  if (prefersReducedMotion || from === to) {
    el.textContent = fmt(to);
    return;
  }
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = fmt(from + (to - from) * eased);
    if (t < 1) el._raf = requestAnimationFrame(tick);
  };
  el._raf = requestAnimationFrame(tick);
}

// === Mirror of UnitHelper::isVolumeUnit / isGramUnit / getUnitBaseScale ===
const UNITS = {
  gram: { kind: "mass", scale: 1 },
  g: { kind: "mass", scale: 1 },
  kg: { kind: "mass", scale: 1000 },
  ml: { kind: "volume", scale: 1 },
  l: { kind: "volume", scale: 1000 },
  liter: { kind: "volume", scale: 1000 },
};
const unitInfo = (name) =>
  UNITS[String(name).toLowerCase()] || { kind: "other", scale: 1 };
const isVolumeUnit = (name) => unitInfo(name).kind === "volume";
const isGramUnit = (name) => unitInfo(name).kind === "mass";

// Mirror of UnitHelper::requestWarehouseUnitConvert (UnitConversion.multiply_value lookup)
function requestWarehouseUnitConvert(
  requestUnit,
  outletUnit,
  value,
  multiplyValue,
) {
  if (String(requestUnit).toLowerCase() === String(outletUnit).toLowerCase())
    return value;
  return value * multiplyValue;
}

/**
 * Mirror of UnitHelper::resolveStockConversion()
 * Returns { outlet, warehouse, branch, steps[] }
 *  - outlet    : qty in outlet unit (added to outlet stock)
 *  - warehouse : qty in warehouse unit (deducted from warehouse stock)
 */
function resolveStockConversion({
  outletUnit,
  requestUnit,
  warehouseUnit,
  quantity,
  density,
  multiplyValue = 1,
}) {
  const outletIsVolume = isVolumeUnit(outletUnit);
  const warehouseIsGram = isGramUnit(warehouseUnit);

  // Case 1: warehouse = massa, outlet = volume
  if (outletIsVolume && warehouseIsGram) {
    if (density !== null && density > 0) {
      const baseMassGrams = quantity * unitInfo(warehouseUnit).scale;
      const baseVolumeMl = baseMassGrams / density;
      const outletQty = baseVolumeMl / unitInfo(outletUnit).scale;
      return {
        outlet: outletQty,
        warehouse: quantity,
        branch: "Konversi Berat ke Volume (Pakai Massa Jenis)",
        steps: [
          `Ubah satuan gudang ke gram: ${quantity} × ${unitInfo(warehouseUnit).scale} = ${formatNum(baseMassGrams, 4)} gram`,
          `Bagi dengan massa jenis: ${formatNum(baseMassGrams, 4)} ÷ ${density} = ${formatNum(baseVolumeMl, 4)} ml`,
          `Sesuaikan ke satuan outlet: ${formatNum(baseVolumeMl, 4)} ÷ ${unitInfo(outletUnit).scale} = ${formatNum(outletQty, 4)} ${outletUnit}`,
        ],
      };
    }
    return {
      outlet: quantity,
      warehouse: quantity,
      branch: "Massa Jenis Kosong (Disamakan 1 : 1)",
      steps: [
        "Karena massa jenis belum diisi atau bernilai 0, sistem menyamakan angka pengiriman secara langsung 1 : 1.",
      ],
    };
  }

  // Case 3: Standard unit conversion
  const outletValue = requestWarehouseUnitConvert(
    requestUnit,
    outletUnit,
    quantity,
    multiplyValue,
  );
  const sameUnit =
    String(requestUnit).toLowerCase() === String(outletUnit).toLowerCase();
  return {
    outlet: outletValue,
    warehouse: quantity,
    branch: "Konversi Satuan Standar (Tanpa Massa Jenis)",
    steps: [
      sameUnit
        ? `Satuan permintaan (${requestUnit}) sama dengan satuan outlet (${outletUnit}), sehingga stok outlet bertambah ${quantity} ${outletUnit}.`
        : `Gudang dan outlet sama-sama memakai satuan volume, sehingga massa jenis tidak dipakai. Permintaan dikalikan pengali konversi gudang: ${quantity} × ${multiplyValue} = ${formatNum(outletValue, 4)} ${outletUnit}.`,
      `Stok gudang berkurang sesuai jumlah permintaan: ${quantity} ${requestUnit}.`,
    ],
  };
}

function updateSimulator() {
  const qty = Math.max(0, parseFloat(qtyInput.value) || 0);
  const density = parseFloat(densitySlider.value) || 1;
  state.quantity = qty;
  state.density = density;

  const baseMassGrams = qty * state.whScale;
  const result = resolveStockConversion({
    outletUnit: state.outUnit,
    requestUnit: state.whUnit,
    warehouseUnit: state.whUnit,
    quantity: qty,
    density,
  });
  const outletQty = result.outlet;

  // Naive 1:1 calculation (without density)
  const naiveQty = baseMassGrams / state.outScale;
  const diff = outletQty - naiveQty;

  // Update text outputs
  densityValueLabel.textContent = `${density.toFixed(2)} g/ml`;
  baseGramsHint.textContent = `= ${formatNum(baseMassGrams)} gram`;
  animateNumber(outletResultDisplay, outletQty);
  outletUnitDisplay.textContent = state.outUnit;

  animateNumber(naiveResultText, naiveQty, ` ${state.outUnit}`);
  animateNumber(actualResultText, outletQty, ` ${state.outUnit}`);

  // Update comparison bars proportionally
  const maxVal = Math.max(naiveQty, outletQty, 1);
  naiveBar.style.width = `${Math.min(100, (naiveQty / maxVal) * 92)}%`;
  actualBar.style.width = `${Math.min(100, (outletQty / maxVal) * 92)}%`;

  // Update diff banner
  animateNumber(diffValueText, diff, ` ${state.outUnit}`, true);
  if (Math.abs(diff) < 0.005) {
    diffBox.classList.add("is-neutral");
  } else {
    diffBox.classList.remove("is-neutral");
  }
}

// Warehouse unit buttons
document.querySelectorAll("[data-wh-unit]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll("[data-wh-unit]")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.whUnit = btn.dataset.whUnit;
    state.whScale = parseFloat(btn.dataset.scale);
    updateSimulator();
  });
});

// Outlet unit buttons
document.querySelectorAll("[data-out-unit]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll("[data-out-unit]")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.outUnit = btn.dataset.outUnit;
    state.outScale = parseFloat(btn.dataset.scale);
    updateSimulator();
  });
});

// Density presets
document.querySelectorAll("[data-density]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll("[data-density]")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    densitySlider.value = btn.dataset.density;
    updateSimulator();
  });
});

densitySlider.addEventListener("input", () => {
  document.querySelectorAll("[data-density]").forEach((b) => {
    b.classList.toggle(
      "active",
      parseFloat(b.dataset.density) === parseFloat(densitySlider.value),
    );
  });
  updateSimulator();
});

qtyInput.addEventListener("input", updateSimulator);

document.getElementById("resetSimBtn").addEventListener("click", () => {
  qtyInput.value = 1000;
  densitySlider.value = 0.9;
  document.querySelector('[data-wh-unit="gram"]').click();
  document.querySelector('[data-out-unit="ml"]').click();
  document.querySelector('[data-density="0.90"]').click();
});

// === 2. CASE CAROUSEL DATA ===
const casesData = [
  {
    title: "Skenario 1: Berat ke Volume (Gudang Kilogram → Outlet Mililiter)",
    desc: "Gudang menyimpan stok bibit parfum dalam kilogram (berat), sementara outlet menjualnya dalam mililiter (volume). Karena jenis satuannya berbeda, sistem memakai massa jenis untuk menghitung volume cairan yang sebenarnya.",
    params: [
      { key: "Satuan Gudang", val: "kg (1 kg = 1.000 gram)" },
      { key: "Satuan Outlet", val: "ml (mililiter)" },
      { key: "Jumlah Dikirim", val: "1,5 kg" },
      { key: "Massa Jenis (Density)", val: "0,90 g/ml" },
    ],
    result: "Hasil: Stok Outlet +1.666,67 ml  |  Stok Gudang −1,5 kg",
    steps: [
      "Ubah berat dari kilogram ke gram: 1,5 kg × 1.000 = 1.500 gram.",
      "Bagi berat dengan massa jenis agar menjadi mililiter: 1.500 ÷ 0,90 = 1.666,67 ml.",
      "Stok gudang berkurang 1,5 kg, dan stok outlet bertambah 1.666,67 ml.",
    ],
  },
  {
    title: "Skenario 2: Massa Jenis Kosong / Bernilai 0 (Pengaman Hitungan)",
    desc: "Jika data massa jenis pada produk belum diisi oleh admin atau tertulis 0, sistem tidak memaksakan pembagian agar perhitungan tidak error. Sebagai gantinya, angka pengiriman disamakan langsung 1 : 1.",
    params: [
      { key: "Satuan Gudang", val: "gram" },
      { key: "Satuan Outlet", val: "ml" },
      { key: "Jumlah Dikirim", val: "500 gram" },
      { key: "Massa Jenis (Density)", val: "Belum diisi / 0" },
    ],
    result: "Hasil: Stok Outlet +500 ml  |  Stok Gudang −500 gram",
    steps: [
      "Sistem mendeteksi bahwa massa jenis produk masih kosong atau bernilai 0.",
      "Pembagian dengan massa jenis dilewati agar tidak terjadi error perhitungan.",
      "Angka pengiriman langsung dipakai apa adanya: gudang berkurang 500 gram dan outlet bertambah 500 ml.",
    ],
  },
  {
    title: "Skenario 3: Satuan Sejenis (Sama-sama Volume atau Kemasan)",
    desc: "Jika gudang dan outlet sama-sama memakai satuan volume (misalnya Liter ke mL) atau sama-sama barang kemasan (misalnya Box ke Pcs), massa jenis tidak berlaku. Sistem langsung mengalikan permintaan dengan aturan konversi gudang.",
    params: [
      { key: "Satuan Gudang", val: "L (Liter)" },
      { key: "Satuan Outlet", val: "mL (Mililiter)" },
      { key: "Jumlah Permintaan", val: "1,6 L" },
      { key: "Aturan Konversi", val: "1 L = 1.000 mL" },
    ],
    result: "Hasil: Stok Outlet +1.600 mL  |  Stok Gudang −1,6 L",
    steps: [
      "Gudang dan outlet sama-sama memakai satuan volume, sehingga massa jenis diabaikan.",
      "Jumlah permintaan dikalikan pengali konversi gudang: 1,6 × 1.000 = 1.600 mL.",
      "Stok gudang berkurang 1,6 L, dan stok outlet bertambah 1.600 mL.",
    ],
  },
  {
    title:
      "Skenario 4: Satuan Terpisah Milik Gudang & Outlet (Penerjemahan Nama)",
    desc: 'Outlet dan gudang menyimpan daftar satuan masing-masing. Satuan "Box" atau "mL" milik outlet berbeda catatannya dengan milik gudang, dan aturan konversinya bisa berbeda. Sistem mencocokkan nama satuannya di gudang dulu baru mengambil rumus gudang. (Catatan: konversi selalu konversi dari unit product ke unit request. Contoh: product memiliki unit L dan request mL, maka input konversi yang dibutuhkan adalah dari unit L dan tidak perlu menambah dari unit mL)',
    params: [
      { key: "Satuan di Gudang", val: "Box (1 Box = 24 Pcs)" },
      { key: "Satuan di Outlet", val: "Pcs (versi outlet: 1 Box = 20 Pcs)" },
      { key: "Permintaan Outlet", val: "2 Box" },
      { key: "Konversi Dipakai", val: "Versi Gudang (× 24)" },
    ],
    result: "Hasil: Stok Outlet +48 Pcs  |  Stok Gudang −2 Box",
    steps: [
      "01 // SUDAH KLOP: Jika nama & satuan outlet, permintaan, dan gudang sama semua → langsung pakai angka permintaan.",
      "02 // CADANGAN OUTLET: Jika satuan versi gudang tidak ditemukan atau permintaan tidak cocok dengan gudang maupun outlet → pakai aturan konversi milik outlet.",
      "03 // PERMINTAAN = SATUAN OUTLET: Jika outlet minta satuan outlet tapi gudang simpan satuan lain → cari padanan nama di gudang, lalu konversi dari satuan gudang ke outlet.",
      "04 // PERMINTAAN = SATUAN GUDANG: Sistem menerjemahkan nama satuan ke versi gudang dan memakai pengali milik gudang (2 × 24 = 48 Pcs, bukan 40 Pcs).",
    ],
  },
];

let currentCaseIndex = 0;
const caseViewer = document.getElementById("caseViewer");
const caseCounter = document.getElementById("caseCounter");
const caseTabs = document.querySelectorAll(".case-tab");

function renderCase(index, animate = true) {
  currentCaseIndex = index;
  const item = casesData[index];
  caseCounter.textContent = `0${index + 1} / 0${casesData.length}`;

  caseTabs.forEach((tab, idx) => {
    const isActive = idx === index;
    tab.classList.toggle("active", isActive);
    if (isActive && animate && typeof tab.scrollIntoView === "function") {
      tab.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        inline: "center",
        block: "nearest",
      });
    }
  });

  const paramsHtml = item.params
    .map(
      (p) =>
        `<div class="param-item"><span class="param-key">${p.key}</span><span class="param-val">${p.val}</span></div>`,
    )
    .join("");

  const stepsHtml = item.steps
    .map((s) => `<li><span>${s}</span></li>`)
    .join("");

  const html = `
    <div>
      <h3 class="sub-title">${item.title}</h3>
      <p class="body-text">${item.desc}</p>
      <div class="case-params">${paramsHtml}</div>
      <div class="case-result-banner">${item.result}</div>
    </div>
    <div>
      <span class="control-label" style="margin-bottom: 0.5rem;">LANGKAH PERHITUNGAN</span>
      <div class="concept-trace">
        <ul class="trace-list">${stepsHtml}</ul>
      </div>
    </div>
  `;

  if (!animate || prefersReducedMotion) {
    caseViewer.innerHTML = html;
    return;
  }
  // Soft cross-fade: fade out → swap → fade in
  const token = (caseViewer._token = (caseViewer._token || 0) + 1);
  caseViewer.classList.add("is-swapping");
  setTimeout(() => {
    if (token !== caseViewer._token) return;
    caseViewer.innerHTML = html;
    requestAnimationFrame(() => caseViewer.classList.remove("is-swapping"));
  }, 220);
}

caseTabs.forEach((tab) => {
  tab.addEventListener("click", () =>
    renderCase(parseInt(tab.dataset.case, 10)),
  );
});

document.getElementById("prevCaseBtn").addEventListener("click", () => {
  const prev = (currentCaseIndex - 1 + casesData.length) % casesData.length;
  renderCase(prev);
});

document.getElementById("nextCaseBtn").addEventListener("click", () => {
  const next = (currentCaseIndex + 1) % casesData.length;
  renderCase(next);
});

// === 3. CALCULATION QUIZ (jawaban hitungan) ===
// Setiap soal memakai logika konversi sistem untuk menghitung jawaban yang benar.
const quizData = [
  {
    warehouse: { unit: "L", stock: 2.5, multiply: 1000, note: "1 L = 1000 mL" },
    outlet: { unit: "mL", stock: 8.3 },
    request: { unit: "L", qty: 1.6 },
    density: null,
  },
  {
    warehouse: {
      unit: "L",
      stock: 2.72,
      multiply: 0.23,
      note: "1 L = 0.23 mL",
    },
    outlet: { unit: "mL", stock: 4.14 },
    request: { unit: "L", qty: 1.39 },
    density: null,
  },
  {
    warehouse: {
      unit: "gram",
      stock: 1500,
      multiply: 1,
      note: "massa jenis (density) 0.80 g/ml",
    },
    outlet: { unit: "ml", stock: 250 },
    request: { unit: "gram", qty: 400 },
    density: 0.8,
  },
  {
    warehouse: {
      unit: "kg",
      stock: 4.5,
      multiply: 1,
      note: "massa jenis (density) 0.90 g/ml",
    },
    outlet: { unit: "liter", stock: 0.75 },
    request: { unit: "kg", qty: 1.8 },
    density: 0.9,
  },
  {
    warehouse: {
      unit: "Box",
      stock: 10,
      multiply: 24,
      note: "konversi versi Gudang: 1 Box = 24 Pcs (sedangkan versi Outlet: 1 Box = 20 Pcs)",
    },
    outlet: { unit: "Pcs", stock: 15 },
    request: { unit: "Box", qty: 2 },
    density: null,
    outletTrapMultiply: 20,
  },
  {
    warehouse: {
      unit: "Pcs",
      stock: 100,
      multiply: 1,
      note: "satuan gudang dan outlet sama-sama Pcs (di gudang juga ada aturan 1 Box = 12 Pcs)",
    },
    outlet: { unit: "Pcs", stock: 25 },
    request: { unit: "Pcs", qty: 30 },
    density: null,
    sameAll: true,
  },
].map((q) => {
  const r = resolveStockConversion({
    outletUnit: q.outlet.unit,
    requestUnit: q.request.unit,
    warehouseUnit: q.warehouse.unit,
    quantity: q.request.qty,
    density: q.density,
    multiplyValue: q.warehouse.multiply,
  });
  return {
    ...q,
    result: r,
    answer: {
      warehouse: q.warehouse.stock - r.warehouse,
      outlet: q.outlet.stock + r.outlet,
    },
  };
});

const TOLERANCE = 0.01;
const quizList = document.getElementById("quizList");
const quizScoreText = document.getElementById("quizScoreText");
const quizResults = new Array(quizData.length).fill(false);

const parseAnswer = (v) => parseFloat(String(v).trim().replace(",", "."));
const fmtShort = (n) => parseFloat(n.toFixed(4)).toString();

function updateQuizScore() {
  const correctCount = quizResults.filter(Boolean).length;
  quizScoreText.textContent = `${correctCount} / ${quizData.length}`;
  quizScoreText.classList.remove("bump");
  void quizScoreText.offsetWidth;
  quizScoreText.classList.add("bump");
}

function buildErrorHint(whOk, outOk, q) {
  if (whOk && outOk)
    return "Perhitungan stok gudang dan stok outlet sudah benar.";
  if (!whOk && outOk) {
    return `Angka <strong>stok outlet sudah benar</strong>, namun <strong>stok gudang belum tepat</strong>. Karena gudang mengirim sesuai permintaan (${q.request.qty} ${q.request.unit}), stok awal gudang langsung dikurangi ${q.request.qty} ${q.warehouse.unit}.`;
  }
  if (whOk && !outOk) {
    if (q.density) {
      return `Angka <strong>stok gudang sudah benar</strong>, namun <strong>stok outlet belum tepat</strong>. Karena gudang memakai satuan berat (${q.warehouse.unit}) dan outlet memakai satuan volume (${q.outlet.unit}), ubah jumlah kirim ke gram lalu bagi dengan massa jenis (${q.density} g/ml) dan sesuaikan ke ${q.outlet.unit} sebelum ditambahkan ke stok awal outlet.`;
    }
    if (q.outletTrapMultiply) {
      return `Angka <strong>stok gudang sudah benar</strong>, namun <strong>stok outlet belum tepat</strong>. Karena satuan permintaan (${q.request.unit}) cocok dengan satuan produk di gudang, sistem menerjemahkan satuan ke versi gudang dan memakai <strong>konversi milik Gudang (${q.warehouse.multiply})</strong>, bukan milik Outlet (${q.outletTrapMultiply}).`;
    }
    if (q.sameAll) {
      return `Angka <strong>stok gudang sudah benar</strong>, namun <strong>stok outlet belum tepat</strong>. Karena satuan gudang, outlet, dan permintaan semuanya sama-sama <strong>${q.outlet.unit}</strong>, sistem melewati proses konversi dan langsung memakai angka permintaan (${q.request.qty} ${q.outlet.unit}).`;
    }
    return `Angka <strong>stok gudang sudah benar</strong>, namun <strong>stok outlet belum tepat</strong>. Ingat bahwa satuan gudang dan outlet berbeda (${q.request.unit} ke ${q.outlet.unit}), sehingga jumlah kirim harus dikalikan aturan konversi (${q.warehouse.note}) terlebih dahulu sebelum ditambahkan ke stok awal outlet.`;
  }
  if (q.density) {
    return `Keduanya belum tepat. Konsepnya: <strong>gudang berkurang sebesar jumlah yang dikirim</strong> (${q.request.qty} ${q.warehouse.unit}), sedangkan <strong>outlet bertambah setelah berat kiriman diubah ke volume memakai massa jenis (${q.density} g/ml)</strong>.`;
  }
  if (q.outletTrapMultiply) {
    return `Keduanya belum tepat. Gudang berkurang sebesar permintaan (${q.request.qty} ${q.warehouse.unit}), sedangkan outlet memakai <strong>konversi versi Gudang (${q.warehouse.multiply})</strong> karena satuan permintaan cocok dengan gudang.`;
  }
  if (q.sameAll) {
    return `Keduanya belum tepat. Karena satuan gudang, outlet, dan permintaan sudah sama (${q.outlet.unit}), gudang langsung berkurang ${q.request.qty} dan outlet langsung bertambah ${q.request.qty}.`;
  }
  return `Keduanya belum tepat. Konsepnya: <strong>gudang berkurang sebesar jumlah yang diminta</strong> (${q.request.qty} ${q.warehouse.unit}), sedangkan <strong>outlet bertambah setelah permintaan diubah ke satuan outlet</strong> memakai aturan konversi gudang (${q.warehouse.note}).`;
}

function renderQuiz() {
  quizList.innerHTML = quizData
    .map((q, idx) => {
      const ruleText =
        q.density || q.outletTrapMultiply || q.sameAll
          ? `dengan <strong>${q.warehouse.note}</strong>`
          : `konversi warehouse <strong>${q.warehouse.note}</strong>`;
      const tag = q.density
        ? " // DENSITY"
        : q.outletTrapMultiply || q.sameAll
          ? " // VERSI GUDANG VS OUTLET"
          : "";
      return `
      <div class="quiz-item reveal" data-q-idx="${idx}">
        <span class="quiz-index">SOAL #0${idx + 1}${tag}</span>
        <p class="quiz-question">
          Satuan Warehouse punya product <strong>${q.warehouse.stock} ${q.warehouse.unit}</strong>, ${ruleText}.<br />
          Satuan Outlet punya product <strong>${q.outlet.stock} ${q.outlet.unit}</strong>, request pakai satuan ${q.request.unit} sebesar <strong>${q.request.qty} ${q.request.unit}</strong>.<br />
          Warehouse kirim sesuai request, berapa stock masing-masing?
        </p>
        <form class="quiz-form" novalidate>
          <div class="quiz-field">
            <label class="control-label" for="wh-${idx}">STOK AKHIR WAREHOUSE (${q.warehouse.unit})</label>
            <input type="text" inputmode="decimal" autocomplete="off" id="wh-${idx}" class="input-field mono" placeholder="0.00" />
          </div>
          <div class="quiz-field">
            <label class="control-label" for="out-${idx}">STOK AKHIR OUTLET (${q.outlet.unit})</label>
            <input type="text" inputmode="decimal" autocomplete="off" id="out-${idx}" class="input-field mono" placeholder="0.00" />
          </div>
          <button type="submit" class="btn btn-toggle active interactive quiz-submit">CEK JAWABAN</button>
        </form>
        <div class="quiz-feedback" id="feedback-${idx}"><div class="quiz-feedback-inner"></div></div>
      </div>
    `;
    })
    .join("");

  document.querySelectorAll(".quiz-item").forEach((card) => {
    const idx = parseInt(card.dataset.qIdx, 10);
    const q = quizData[idx];
    const form = card.querySelector(".quiz-form");
    const whInput = card.querySelector(`#wh-${idx}`);
    const outInput = card.querySelector(`#out-${idx}`);
    const feedbackEl = document.getElementById(`feedback-${idx}`);
    const inner = feedbackEl.querySelector(".quiz-feedback-inner");

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const wh = parseAnswer(whInput.value);
      const out = parseAnswer(outInput.value);

      if (Number.isNaN(wh) || Number.isNaN(out)) {
        [whInput, outInput].forEach((i) =>
          i.classList.toggle("is-invalid", Number.isNaN(parseAnswer(i.value))),
        );
        inner.innerHTML = `
          <div>
            <span class="feedback-status is-err">[PERLU DIISI]</span>
            <span>Mohon isi kedua kolom jawaban dengan angka terlebih dahulu (gunakan titik atau koma untuk desimal).</span>
          </div>
        `;
        feedbackEl.classList.add("visible");
        return;
      }

      const whOk = Math.abs(wh - q.answer.warehouse) <= TOLERANCE;
      const outOk = Math.abs(out - q.answer.outlet) <= TOLERANCE;
      const ok = whOk && outOk;
      quizResults[idx] = ok;

      whInput.className = `input-field mono ${whOk ? "is-correct" : "is-wrong"}`;
      outInput.className = `input-field mono ${outOk ? "is-correct" : "is-wrong"}`;

      const r = q.result;
      const hintText = buildErrorHint(whOk, outOk, q);
      const stepsHtml = r.steps
        .map((s) => `<li><span>${s}</span></li>`)
        .join("");
      inner.innerHTML = `
        <div>
          <span class="feedback-status ${ok ? "is-ok" : "is-err"}">${ok ? "[BENAR]" : "[BELUM TEPAT]"}</span>
          <span class="feedback-hint">${hintText}</span>
        </div>
        <div class="concept-trace">
          <ul class="trace-list">
            <li><span><strong>Metode yang dipakai:</strong> ${r.branch}</span></li>
            ${stepsHtml}
            <li><span><strong>Stok akhir warehouse:</strong> ${q.warehouse.stock} − ${fmtShort(r.warehouse)} = <strong>${fmtShort(q.answer.warehouse)} ${q.warehouse.unit}</strong></span></li>
            <li><span><strong>Stok akhir outlet:</strong> ${q.outlet.stock} + ${fmtShort(r.outlet)} = <strong>${fmtShort(q.answer.outlet)} ${q.outlet.unit}</strong></span></li>
          </ul>
        </div>
      `;
      feedbackEl.classList.add("visible");
      updateQuizScore();
    });

    [whInput, outInput].forEach((i) =>
      i.addEventListener("input", () =>
        i.classList.remove("is-invalid", "is-correct", "is-wrong"),
      ),
    );
  });
}

// === 4. REQUEST WAREHOUSE UNIT CONVERT EXPLORER ===
const WHC_PRESETS = {
  "req-eq-wh": {
    wh: "Box",
    out: "Pcs",
    req: "Box",
    val: 2,
    whMult: 24,
    outMult: 20,
    unitsExist: true,
    whConvExist: true,
    outConvExist: true,
  },
  "req-eq-out": {
    wh: "Box",
    out: "Pcs",
    req: "Pcs",
    val: 2,
    whMult: 24,
    outMult: 20,
    unitsExist: true,
    whConvExist: true,
    outConvExist: true,
  },
  "all-same": {
    wh: "mL",
    out: "mL",
    req: "mL",
    val: 250,
    whMult: 1,
    outMult: 1,
    unitsExist: true,
    whConvExist: true,
    outConvExist: true,
  },
  neither: {
    wh: "Kg",
    out: "Kg",
    req: "Gram",
    val: 500,
    whMult: 1,
    outMult: 1000,
    unitsExist: true,
    whConvExist: false,
    outConvExist: true,
  },
  missing: {
    wh: "L",
    out: "L",
    req: "mL",
    val: 500,
    whMult: 1,
    outMult: 1000,
    unitsExist: false,
    whConvExist: false,
    outConvExist: true,
  },
};

function traceRequestWarehouseUnitConvert({
  whUnit,
  outUnit,
  reqUnit,
  value,
  whMultiply,
  outMultiply,
  unitsExist,
  whConvExist,
  outConvExist,
}) {
  const whLower = whUnit.toLowerCase();
  const outLower = outUnit.toLowerCase();
  const reqLower = reqUnit.toLowerCase();

  const allSameName = outLower === reqLower && outLower === whLower;
  const hasMissingUnits = !unitsExist;
  const isNotCurrentUnit = whLower !== reqLower;
  const isNotOutletUnit = outLower !== reqLower;
  const isSameReqAndOut = !hasMissingUnits && reqLower === outLower;

  let badge = "";
  let explain = "";
  let resultVal = value;
  let sourceLabel = "";
  let steps = [];
  let mappingOut = unitsExist
    ? `"${outUnit}" (Outlet) → padanan "${outUnit}" (Gudang)`
    : `"${outUnit}" (Outlet) → tidak ada di Gudang`;
  let mappingReq = unitsExist
    ? `"${reqUnit}" (Request) → padanan "${reqUnit}" (Gudang)`
    : `"${reqUnit}" (Request) → tidak ada di Gudang`;

  // 1. Sudah Klop (L283-284)
  if (allSameName) {
    badge = "01 // SUDAH KLOP (SKIP KONVERSI)";
    sourceLabel = "Tanpa Konversi (1 : 1)";
    explain = `Satuan produk di outlet, satuan permintaan, dan satuan di gudang sama-sama <strong>${outUnit}</strong>. Sistem tidak perlu menerjemahkan atau mencari konversi: angka permintaan langsung dipakai apa adanya.`;
    resultVal = value;
    mappingOut = `"${outUnit}" (Outlet) = "${whUnit}" (Gudang)`;
    mappingReq = `"${reqUnit}" (Request) = langsung cocok`;
    steps = [
      `Nama satuan outlet, permintaan, dan gudang semuanya sama (${outUnit}).`,
      `Konversi dilewati: stok gudang berkurang ${fmtShort(value)} ${whUnit} dan stok outlet bertambah ${fmtShort(resultVal)} ${outUnit}.`,
    ];
  } else if (hasMissingUnits || (isNotCurrentUnit && isNotOutletUnit)) {
    // 2. Data Gudang Tidak Ditemukan / Tidak Relevan (L38-40 -> Fallback convertToBaseUnit milik Outlet)
    const reason = hasMissingUnits
      ? "satuan versi gudang tidak ditemukan untuk nama satuan outlet/permintaan tersebut"
      : `satuan yang diminta (${reqUnit}) tidak sama dengan satuan di gudang (${whUnit}) maupun di outlet (${outUnit})`;

    badge = "02 // FALLBACK KE KONVERSI OUTLET";
    sourceLabel = outConvExist
      ? `Konversi Milik Outlet (÷ ${outMultiply})`
      : "Outlet Tanpa Konversi (1 : 1)";
    explain = `Karena ${reason}, sistem tidak bisa memakai konversi gudang dan beralih memakai <strong>konversi milik Outlet</strong> (${outUnit} &harr; ${reqUnit}).`;
    resultVal =
      !outConvExist || outLower === reqLower
        ? value
        : value / (outMultiply || 1);
    steps = [
      `Pengecekan gudang gagal/tidak relevan karena ${reason}.`,
      outConvExist && outLower !== reqLower
        ? `Sistem memakai aturan konversi di sisi Outlet (${outMultiply}) untuk mengubah ${value} ${reqUnit} ke satuan produk outlet (${outUnit}): ${value} ÷ ${outMultiply} = ${fmtShort(resultVal)} ${outUnit}.`
        : `Aturan konversi di sisi Outlet belum ada atau satuannya sama, sehingga angka tetap ${fmtShort(resultVal)} ${outUnit}.`,
    ];
  } else if (isSameReqAndOut) {
    // 3. Request = Satuan Outlet, tapi Gudang simpan satuan berbeda (L42-45)
    if (whConvExist) {
      badge = "03 // PERMINTAAN = SATUAN OUTLET";
      sourceLabel = `Konversi Milik Gudang (${whUnit} → ${outUnit}, × ${whMultiply})`;
      explain = `Outlet meminta dalam satuan yang sama dengan produk outlet (<strong>${reqUnit}</strong>), tetapi di gudang stok fisiknya disimpan dalam <strong>${whUnit}</strong>. Sistem menerjemahkan "${outUnit}" ke versi gudang, lalu mengalikan dengan <strong>konversi milik Gudang</strong> (<strong>${whUnit} &rarr; ${outUnit}</strong>).`;
      resultVal = value * whMultiply;
      steps = [
        `Outlet & permintaan sama-sama ${outUnit}, sedangkan stok gudang disimpan dalam ${whUnit}.`,
        `Sistem mencari padanan "${outUnit}" di daftar satuan Gudang.`,
        `Sistem memakai konversi milik Gudang dari ${whUnit} → ${outUnit} (pengali ${whMultiply}, mengabaikan aturan milik Outlet ${outMultiply}): ${value} × ${whMultiply} = ${fmtShort(resultVal)} ${outUnit}.`,
      ];
    } else {
      badge = "02 // GUDANG TANPA KONVERSI → FALLBACK OUTLET";
      sourceLabel = outConvExist ? `Konversi Milik Outlet` : "1 : 1";
      explain = `Padanan nama satuan ditemukan di gudang, tetapi rumus konversi milik gudang (${whUnit} &rarr; ${outUnit}) belum diisi sehingga beralih ke konversi milik Outlet.`;
      resultVal = value;
      steps = [
        `Padanan satuan "${outUnit}" ada di gudang, namun aturan konversi milik Gudang kosong.`,
        `Sistem jatuh ke cadangan konversi milik Outlet (nilai sementara: ${fmtShort(resultVal)} ${outUnit}).`,
      ];
    }
  } else {
    // 4. Request = Satuan Gudang, berbeda dari Outlet (L46-50)
    if (whConvExist) {
      badge = "04 // PERMINTAAN = SATUAN GUDANG";
      sourceLabel = `Konversi Milik Gudang (${reqUnit} → ${outUnit}, × ${whMultiply})`;
      explain = `Outlet meminta dalam satuan yang sama dengan gudang (<strong>${reqUnit}</strong>), berbeda dari satuan outlet (<strong>${outUnit}</strong>). Sistem menerjemahkan kedua nama satuan ke versi gudang lalu memakai <strong>konversi milik Gudang</strong> (pengali <strong>${whMultiply}</strong>, bukan ${outMultiply} milik Outlet).`;
      resultVal = value * whMultiply;
      steps = [
        `Permintaan (${reqUnit}) cocok dengan satuan produk di gudang (${whUnit}), bukan satuan outlet (${outUnit}).`,
        `Sistem menerjemahkan "${reqUnit}" dan "${outUnit}" menjadi ID satuan milik Gudang.`,
        `Sistem memakai konversi milik Gudang (${whMultiply}) dan mengabaikan konversi versi Outlet (${outMultiply}): ${value} × ${whMultiply} = ${fmtShort(resultVal)} ${outUnit}.`,
      ];
    } else {
      badge = "02 // GUDANG TANPA KONVERSI → FALLBACK OUTLET";
      sourceLabel = outConvExist
        ? `Konversi Milik Outlet (÷ ${outMultiply})`
        : "1 : 1";
      explain = `Satuan sudah diterjemahkan ke versi gudang, tetapi aturan konversi milik Gudang (${reqUnit} &rarr; ${outUnit}) belum ada, sehingga sistem jatuh ke konversi milik Outlet.`;
      resultVal =
        !outConvExist || outLower === reqLower
          ? value
          : value / (outMultiply || 1);
      steps = [
        `Aturan konversi milik Gudang untuk ${reqUnit} → ${outUnit} tidak ditemukan.`,
        outConvExist && outLower !== reqLower
          ? `Sistem beralih ke konversi cadangan milik Outlet: ${value} ÷ ${outMultiply} = ${fmtShort(resultVal)} ${outUnit}.`
          : `Konversi cadangan milik Outlet juga kosong, angka tetap ${fmtShort(resultVal)} ${outUnit}.`,
      ];
    }
  }

  return {
    mapping: [
      { label: "Penerjemahan Satuan Outlet", val: mappingOut },
      { label: "Penerjemahan Satuan Request", val: mappingReq },
    ],
    flags: [
      {
        key: "Padanan satuan di Gudang",
        val: hasMissingUnits ? "Tidak ditemukan" : "Ditemukan",
        state: hasMissingUnits ? "is-warn" : "is-true",
      },
      {
        key: "Permintaan = Gudang?",
        val: !isNotCurrentUnit ? "Ya, sama" : "Tidak sama",
        state: !isNotCurrentUnit ? "is-true" : "is-false",
      },
      {
        key: "Permintaan = Outlet?",
        val: !isNotOutletUnit ? "Ya, sama" : "Tidak sama",
        state: !isNotOutletUnit ? "is-true" : "is-false",
      },
      { key: "Sumber konversi dipakai", val: sourceLabel, state: "is-false" },
    ],
    badge,
    explain,
    resultVal,
    outUnit,
    steps,
  };
}

function initWhConvert() {
  const whSel = document.getElementById("whcWarehouseUnit");
  const outSel = document.getElementById("whcOutletUnit");
  const reqSel = document.getElementById("whcRequestUnit");
  const valInput = document.getElementById("whcValueInput");
  const whMultInput = document.getElementById("whcMultiplyInput");
  const outMultInput = document.getElementById("whcOutletMultiplyInput");
  const unitsExistChk = document.getElementById("whcUnitsExist");
  const whConvExistChk = document.getElementById("whcConvExist");
  const outConvExistChk = document.getElementById("whcOutletConvExist");
  const presetBtns = document.querySelectorAll("[data-whc-preset]");

  const badgeEl = document.getElementById("whcBranchBadge");
  const mappingEl = document.getElementById("whcMapping");
  const flagsEl = document.getElementById("whcFlags");
  const explainEl = document.getElementById("whcExplain");
  const bannerEl = document.getElementById("whcResultBanner");
  const traceEl = document.getElementById("whcCodeTrace");

  if (!whSel || !flagsEl || !traceEl) return;

  const render = () => {
    const data = traceRequestWarehouseUnitConvert({
      whUnit: whSel.value,
      outUnit: outSel.value,
      reqUnit: reqSel.value,
      value: Math.max(0, parseFloat(valInput.value) || 0),
      whMultiply: Math.max(0, parseFloat(whMultInput.value) || 0),
      outMultiply: Math.max(0, parseFloat(outMultInput?.value) || 0),
      unitsExist: unitsExistChk.checked,
      whConvExist: whConvExistChk.checked,
      outConvExist: outConvExistChk ? outConvExistChk.checked : true,
    });

    badgeEl.textContent = data.badge;
    if (mappingEl) {
      mappingEl.innerHTML = data.mapping
        .map(
          (m) =>
            `<div class="whc-map-card"><span>${m.label}</span><strong>${m.val}</strong></div>`,
        )
        .join("");
    }
    flagsEl.innerHTML = data.flags
      .map(
        (f) =>
          `<div class="whc-flag"><span class="param-key">${f.key}</span><span class="whc-flag-val ${f.state}">${f.val}</span></div>`,
      )
      .join("");
    explainEl.innerHTML = data.explain;
    bannerEl.textContent = `Stok yang masuk ke outlet: ${fmtShort(data.resultVal)} ${data.outUnit}`;
    traceEl.innerHTML = `<ul class="trace-list">${data.steps.map((s) => `<li><span>${s}</span></li>`).join("")}</ul>`;
  };

  const clearPresets = () =>
    presetBtns.forEach((b) => b.classList.remove("active"));

  presetBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = WHC_PRESETS[btn.dataset.whcPreset];
      if (!p) return;
      clearPresets();
      btn.classList.add("active");
      whSel.value = p.wh;
      outSel.value = p.out;
      reqSel.value = p.req;
      valInput.value = p.val;
      whMultInput.value = p.whMult;
      if (outMultInput) outMultInput.value = p.outMult;
      unitsExistChk.checked = p.unitsExist;
      whConvExistChk.checked = p.whConvExist;
      if (outConvExistChk) outConvExistChk.checked = p.outConvExist;
      render();
    });
  });

  [
    whSel,
    outSel,
    reqSel,
    valInput,
    whMultInput,
    outMultInput,
    unitsExistChk,
    whConvExistChk,
    outConvExistChk,
  ]
    .filter(Boolean)
    .forEach((el) => {
      el.addEventListener("input", () => {
        clearPresets();
        render();
      });
      el.addEventListener("change", () => {
        clearPresets();
        render();
      });
    });

  render();
}

// === 5. SCROLL REVEAL & NAV HIGHLIGHT ===
function initReveal() {
  const targets = document.querySelectorAll(".reveal");
  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("in-view"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.04, rootMargin: "0px 0px -20px 0px" },
  );
  targets.forEach((el, i) => {
    el.style.setProperty("--reveal-delay", `${(i % 4) * 60}ms`);
    io.observe(el);
  });
}

function initNavSpy() {
  const navLinks = document.querySelectorAll(".main-nav .nav-link");
  const sections = document.querySelectorAll("section[id]");
  if (!navLinks.length || !sections.length) return;

  const setActive = (id) => {
    navLinks.forEach((link) => {
      link.classList.toggle("active", link.getAttribute("href") === `#${id}`);
    });
  };

  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      const targetId = link.getAttribute("href")?.slice(1);
      if (targetId) setActive(targetId);
    });
  });

  if (!("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setActive(entry.target.id);
      });
    },
    { rootMargin: "-35% 0px -55% 0px" },
  );
  sections.forEach((sec) => io.observe(sec));
}

// Initialize all modules
updateSimulator();
renderCase(0, false);
initWhConvert();
renderQuiz();
initReveal();
initNavSpy();
