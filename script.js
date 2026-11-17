// === 1. SIMULATOR LOGIC (Mirrors UnitHelper::resolveStockConversion) ===
const state = {
  whUnit: 'gram',
  whScale: 1,
  outUnit: 'ml',
  outScale: 1,
  quantity: 1000,
  density: 0.90
};

const qtyInput = document.getElementById('qtyInput');
const densitySlider = document.getElementById('densitySlider');
const densityValueLabel = document.getElementById('densityValueLabel');
const baseGramsHint = document.getElementById('baseGramsHint');
const outletResultDisplay = document.getElementById('outletResultDisplay');
const outletUnitDisplay = document.getElementById('outletUnitDisplay');
const naiveResultText = document.getElementById('naiveResultText');
const actualResultText = document.getElementById('actualResultText');
const naiveBar = document.getElementById('naiveBar');
const actualBar = document.getElementById('actualBar');
const diffBox = document.getElementById('diffBox');
const diffValueText = document.getElementById('diffValueText');

function formatNum(num, digits = 2) {
  return num.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

// --- Smooth number tween (easeOutCubic), animates from the last shown value ---
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function animateNumber(el, to, suffix = '', signed = false, duration = 600) {
  const fmt = v => (signed && v > 0 ? '+' : '') + formatNum(v) + suffix;
  const from = el._val ?? to;
  el._val = to;
  cancelAnimationFrame(el._raf);
  if (prefersReducedMotion || from === to) {
    el.textContent = fmt(to);
    return;
  }
  const start = performance.now();
  const tick = now => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = fmt(from + (to - from) * eased);
    if (t < 1) el._raf = requestAnimationFrame(tick);
  };
  el._raf = requestAnimationFrame(tick);
}

// === Mirror of UnitHelper::isVolumeUnit / isGramUnit / getUnitBaseScale ===
const UNITS = {
  gram:  { kind: 'mass',   scale: 1 },
  g:     { kind: 'mass',   scale: 1 },
  kg:    { kind: 'mass',   scale: 1000 },
  ml:    { kind: 'volume', scale: 1 },
  l:     { kind: 'volume', scale: 1000 },
  liter: { kind: 'volume', scale: 1000 }
};
const unitInfo = name => UNITS[String(name).toLowerCase()] || { kind: 'other', scale: 1 };
const isVolumeUnit = name => unitInfo(name).kind === 'volume';
const isGramUnit = name => unitInfo(name).kind === 'mass';

// Mirror of UnitHelper::requestWarehouseUnitConvert (UnitConversion.multiply_value lookup)
function requestWarehouseUnitConvert(requestUnit, outletUnit, value, multiplyValue) {
  if (String(requestUnit).toLowerCase() === String(outletUnit).toLowerCase()) return value;
  return value * multiplyValue;
}

/**
 * Mirror of UnitHelper::resolveStockConversion()
 * Returns { outlet, warehouse, branch, steps[] }
 *  - outlet    : qty in outlet unit (added to outlet stock)
 *  - warehouse : qty in warehouse unit (deducted from warehouse stock)
 */
function resolveStockConversion({ outletUnit, requestUnit, warehouseUnit, quantity, density, multiplyValue = 1 }) {
  const outletIsVolume = isVolumeUnit(outletUnit);
  const warehouseIsGram = isGramUnit(warehouseUnit);

  // Case 1: warehouse = massa, outlet = volume
  if (outletIsVolume && warehouseIsGram) {
    if (density !== null && density > 0) {
      const baseMassGrams = quantity * unitInfo(warehouseUnit).scale;
      const baseVolumeMl = baseMassGrams / density;
      const outletQty = baseVolumeMl / unitInfo(outletUnit).scale;
      return {
        outlet: outletQty, warehouse: quantity, branch: 'Konversi Berat ke Volume (Pakai Massa Jenis)',
        steps: [
          `Ubah satuan gudang ke gram: ${quantity} × ${unitInfo(warehouseUnit).scale} = ${formatNum(baseMassGrams, 4)} gram`,
          `Bagi dengan massa jenis: ${formatNum(baseMassGrams, 4)} ÷ ${density} = ${formatNum(baseVolumeMl, 4)} ml`,
          `Sesuaikan ke satuan outlet: ${formatNum(baseVolumeMl, 4)} ÷ ${unitInfo(outletUnit).scale} = ${formatNum(outletQty, 4)} ${outletUnit}`
        ]
      };
    }
    return {
      outlet: quantity, warehouse: quantity, branch: 'Massa Jenis Kosong (Disamakan 1 : 1)',
      steps: ['Karena massa jenis belum diisi atau bernilai 0, sistem menyamakan angka pengiriman secara langsung 1 : 1.']
    };
  }

  // Case 3: Standard unit conversion
  const outletValue = requestWarehouseUnitConvert(requestUnit, outletUnit, quantity, multiplyValue);
  const sameUnit = String(requestUnit).toLowerCase() === String(outletUnit).toLowerCase();
  return {
    outlet: outletValue, warehouse: quantity, branch: 'Konversi Satuan Standar (Tanpa Massa Jenis)',
    steps: [
      sameUnit
        ? `Satuan permintaan (${requestUnit}) sama dengan satuan outlet (${outletUnit}), sehingga stok outlet bertambah ${quantity} ${outletUnit}.`
        : `Gudang dan outlet sama-sama memakai satuan volume, sehingga massa jenis tidak dipakai. Permintaan dikalikan pengali konversi gudang: ${quantity} × ${multiplyValue} = ${formatNum(outletValue, 4)} ${outletUnit}.`,
      `Stok gudang berkurang sesuai jumlah permintaan: ${quantity} ${requestUnit}.`
    ]
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
    density
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
    diffBox.classList.add('is-neutral');
  } else {
    diffBox.classList.remove('is-neutral');
  }
}

// Warehouse unit buttons
document.querySelectorAll('[data-wh-unit]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-wh-unit]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.whUnit = btn.dataset.whUnit;
    state.whScale = parseFloat(btn.dataset.scale);
    updateSimulator();
  });
});

// Outlet unit buttons
document.querySelectorAll('[data-out-unit]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-out-unit]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.outUnit = btn.dataset.outUnit;
    state.outScale = parseFloat(btn.dataset.scale);
    updateSimulator();
  });
});

// Density presets
document.querySelectorAll('[data-density]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-density]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    densitySlider.value = btn.dataset.density;
    updateSimulator();
  });
});

densitySlider.addEventListener('input', () => {
  document.querySelectorAll('[data-density]').forEach(b => {
    b.classList.toggle('active', parseFloat(b.dataset.density) === parseFloat(densitySlider.value));
  });
  updateSimulator();
});

qtyInput.addEventListener('input', updateSimulator);

document.getElementById('resetSimBtn').addEventListener('click', () => {
  qtyInput.value = 1000;
  densitySlider.value = 0.90;
  document.querySelector('[data-wh-unit="gram"]').click();
  document.querySelector('[data-out-unit="ml"]').click();
  document.querySelector('[data-density="0.90"]').click();
});

// === 2. CASE CAROUSEL DATA ===
const casesData = [
  {
    title: 'Skenario 1: Berat ke Volume (Gudang Kilogram → Outlet Mililiter)',
    desc: 'Gudang menyimpan stok bibit parfum dalam kilogram (berat), sementara outlet menjualnya dalam mililiter (volume). Karena jenis satuannya berbeda, sistem memakai massa jenis untuk menghitung volume cairan yang sebenarnya.',
    params: [
      { key: 'Satuan Gudang', val: 'kg (1 kg = 1.000 gram)' },
      { key: 'Satuan Outlet', val: 'ml (mililiter)' },
      { key: 'Jumlah Dikirim', val: '1,5 kg' },
      { key: 'Massa Jenis (Density)', val: '0,90 g/ml' }
    ],
    result: 'Hasil: Stok Outlet +1.666,67 ml  |  Stok Gudang −1,5 kg',
    steps: [
      'Ubah berat dari kilogram ke gram: 1,5 kg × 1.000 = 1.500 gram.',
      'Bagi berat dengan massa jenis agar menjadi mililiter: 1.500 ÷ 0,90 = 1.666,67 ml.',
      'Stok gudang berkurang 1,5 kg, dan stok outlet bertambah 1.666,67 ml.'
    ]
  },
  {
    title: 'Skenario 2: Massa Jenis Kosong / Bernilai 0 (Pengaman Hitungan)',
    desc: 'Jika data massa jenis pada produk belum diisi oleh admin atau tertulis 0, sistem tidak memaksakan pembagian agar perhitungan tidak error. Sebagai gantinya, angka pengiriman disamakan langsung 1 : 1.',
    params: [
      { key: 'Satuan Gudang', val: 'gram' },
      { key: 'Satuan Outlet', val: 'ml' },
      { key: 'Jumlah Dikirim', val: '500 gram' },
      { key: 'Massa Jenis (Density)', val: 'Belum diisi / 0' }
    ],
    result: 'Hasil: Stok Outlet +500 ml  |  Stok Gudang −500 gram',
    steps: [
      'Sistem mendeteksi bahwa massa jenis produk masih kosong atau bernilai 0.',
      'Pembagian dengan massa jenis dilewati agar tidak terjadi error perhitungan.',
      'Angka pengiriman langsung dipakai apa adanya: gudang berkurang 500 gram dan outlet bertambah 500 ml.'
    ]
  },
  {
    title: 'Skenario 3: Satuan Sejenis (Sama-sama Volume atau Kemasan)',
    desc: 'Jika gudang dan outlet sama-sama memakai satuan volume (misalnya Liter ke mL) atau sama-sama barang kemasan (misalnya Box ke Pcs), massa jenis tidak berlaku. Sistem langsung mengalikan permintaan dengan aturan konversi gudang.',
    params: [
      { key: 'Satuan Gudang', val: 'L (Liter)' },
      { key: 'Satuan Outlet', val: 'mL (Mililiter)' },
      { key: 'Jumlah Permintaan', val: '1,6 L' },
      { key: 'Aturan Konversi', val: '1 L = 1.000 mL' }
    ],
    result: 'Hasil: Stok Outlet +1.600 mL  |  Stok Gudang −1,6 L',
    steps: [
      'Gudang dan outlet sama-sama memakai satuan volume, sehingga massa jenis diabaikan.',
      'Jumlah permintaan dikalikan pengali konversi gudang: 1,6 × 1.000 = 1.600 mL.',
      'Stok gudang berkurang 1,6 L, dan stok outlet bertambah 1.600 mL.'
    ]
  }
];

let currentCaseIndex = 0;
const caseViewer = document.getElementById('caseViewer');
const caseCounter = document.getElementById('caseCounter');
const caseTabs = document.querySelectorAll('.case-tab');

function renderCase(index, animate = true) {
  currentCaseIndex = index;
  const item = casesData[index];
  caseCounter.textContent = `0${index + 1} / 0${casesData.length}`;

  caseTabs.forEach((tab, idx) => {
    const isActive = idx === index;
    tab.classList.toggle('active', isActive);
    if (isActive && animate && typeof tab.scrollIntoView === 'function') {
      tab.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        inline: 'center',
        block: 'nearest'
      });
    }
  });

  const paramsHtml = item.params
    .map(p => `<div class="param-item"><span class="param-key">${p.key}</span><span class="param-val">${p.val}</span></div>`)
    .join('');

  const stepsHtml = item.steps
    .map(s => `<li><span>${s}</span></li>`)
    .join('');

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
  caseViewer.classList.add('is-swapping');
  setTimeout(() => {
    if (token !== caseViewer._token) return;
    caseViewer.innerHTML = html;
    requestAnimationFrame(() => caseViewer.classList.remove('is-swapping'));
  }, 220);
}

caseTabs.forEach(tab => {
  tab.addEventListener('click', () => renderCase(parseInt(tab.dataset.case, 10)));
});

document.getElementById('prevCaseBtn').addEventListener('click', () => {
  const prev = (currentCaseIndex - 1 + casesData.length) % casesData.length;
  renderCase(prev);
});

document.getElementById('nextCaseBtn').addEventListener('click', () => {
  const next = (currentCaseIndex + 1) % casesData.length;
  renderCase(next);
});

// === 3. CALCULATION QUIZ (jawaban hitungan) ===
// Setiap soal memakai logika konversi sistem untuk menghitung jawaban yang benar.
const quizData = [
  {
    warehouse: { unit: 'L', stock: 2.5, multiply: 1000, note: '1 L = 1000 mL' },
    outlet: { unit: 'mL', stock: 8.3 },
    request: { unit: 'L', qty: 1.6 },
    density: null
  },
  {
    warehouse: { unit: 'L', stock: 2.72, multiply: 0.23, note: '1 L = 0.23 mL' },
    outlet: { unit: 'mL', stock: 4.14 },
    request: { unit: 'L', qty: 1.39 },
    density: null
  },
  {
    warehouse: { unit: 'gram', stock: 1500, multiply: 1, note: 'massa jenis (density) 0.80 g/ml' },
    outlet: { unit: 'ml', stock: 250 },
    request: { unit: 'gram', qty: 400 },
    density: 0.80
  },
  {
    warehouse: { unit: 'kg', stock: 4.5, multiply: 1, note: 'massa jenis (density) 0.90 g/ml' },
    outlet: { unit: 'liter', stock: 0.75 },
    request: { unit: 'kg', qty: 1.8 },
    density: 0.90
  }
].map(q => {
  const r = resolveStockConversion({
    outletUnit: q.outlet.unit,
    requestUnit: q.request.unit,
    warehouseUnit: q.warehouse.unit,
    quantity: q.request.qty,
    density: q.density,
    multiplyValue: q.warehouse.multiply
  });
  return {
    ...q,
    result: r,
    answer: {
      warehouse: q.warehouse.stock - r.warehouse,
      outlet: q.outlet.stock + r.outlet
    }
  };
});

const TOLERANCE = 0.01;
const quizList = document.getElementById('quizList');
const quizScoreText = document.getElementById('quizScoreText');
const quizResults = new Array(quizData.length).fill(false);

const parseAnswer = v => parseFloat(String(v).trim().replace(',', '.'));
const fmtShort = n => parseFloat(n.toFixed(4)).toString();

function updateQuizScore() {
  const correctCount = quizResults.filter(Boolean).length;
  quizScoreText.textContent = `${correctCount} / ${quizData.length}`;
  quizScoreText.classList.remove('bump');
  void quizScoreText.offsetWidth;
  quizScoreText.classList.add('bump');
}

function buildErrorHint(whOk, outOk, q) {
  if (whOk && outOk) return 'Perhitungan stok gudang dan stok outlet sudah benar.';
  if (!whOk && outOk) {
    return `Angka <strong>stok outlet sudah benar</strong>, namun <strong>stok gudang belum tepat</strong>. Karena gudang mengirim sesuai permintaan (${q.request.qty} ${q.request.unit}), stok awal gudang langsung dikurangi ${q.request.qty} ${q.warehouse.unit}.`;
  }
  if (whOk && !outOk) {
    if (q.density) {
      return `Angka <strong>stok gudang sudah benar</strong>, namun <strong>stok outlet belum tepat</strong>. Karena gudang memakai satuan berat (${q.warehouse.unit}) dan outlet memakai satuan volume (${q.outlet.unit}), ubah jumlah kirim ke gram lalu bagi dengan massa jenis (${q.density} g/ml) dan sesuaikan ke ${q.outlet.unit} sebelum ditambahkan ke stok awal outlet.`;
    }
    return `Angka <strong>stok gudang sudah benar</strong>, namun <strong>stok outlet belum tepat</strong>. Ingat bahwa satuan gudang dan outlet berbeda (${q.request.unit} ke ${q.outlet.unit}), sehingga jumlah kirim harus dikalikan aturan konversi (${q.warehouse.note}) terlebih dahulu sebelum ditambahkan ke stok awal outlet.`;
  }
  if (q.density) {
    return `Keduanya belum tepat. Konsepnya: <strong>gudang berkurang sebesar jumlah yang dikirim</strong> (${q.request.qty} ${q.warehouse.unit}), sedangkan <strong>outlet bertambah setelah berat kiriman diubah ke volume memakai massa jenis (${q.density} g/ml)</strong>.`;
  }
  return `Keduanya belum tepat. Konsepnya: <strong>gudang berkurang sebesar jumlah yang diminta</strong> (${q.request.qty} ${q.warehouse.unit}), sedangkan <strong>outlet bertambah setelah permintaan diubah ke satuan outlet</strong> memakai aturan konversi gudang (${q.warehouse.note}).`;
}

function renderQuiz() {
  quizList.innerHTML = quizData
    .map((q, idx) => {
      const ruleText = q.density
        ? `dengan <strong>${q.warehouse.note}</strong>`
        : `konversi warehouse <strong>${q.warehouse.note}</strong>`;
      return `
      <div class="quiz-item reveal" data-q-idx="${idx}">
        <span class="quiz-index">SOAL #0${idx + 1}${q.density ? ' // DENSITY' : ''}</span>
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
    .join('');

  document.querySelectorAll('.quiz-item').forEach(card => {
    const idx = parseInt(card.dataset.qIdx, 10);
    const q = quizData[idx];
    const form = card.querySelector('.quiz-form');
    const whInput = card.querySelector(`#wh-${idx}`);
    const outInput = card.querySelector(`#out-${idx}`);
    const feedbackEl = document.getElementById(`feedback-${idx}`);
    const inner = feedbackEl.querySelector('.quiz-feedback-inner');

    form.addEventListener('submit', e => {
      e.preventDefault();
      const wh = parseAnswer(whInput.value);
      const out = parseAnswer(outInput.value);

      if (Number.isNaN(wh) || Number.isNaN(out)) {
        [whInput, outInput].forEach(i => i.classList.toggle('is-invalid', Number.isNaN(parseAnswer(i.value))));
        inner.innerHTML = `
          <div>
            <span class="feedback-status is-err">[PERLU DIISI]</span>
            <span>Mohon isi kedua kolom jawaban dengan angka terlebih dahulu (gunakan titik atau koma untuk desimal).</span>
          </div>
        `;
        feedbackEl.classList.add('visible');
        return;
      }

      const whOk = Math.abs(wh - q.answer.warehouse) <= TOLERANCE;
      const outOk = Math.abs(out - q.answer.outlet) <= TOLERANCE;
      const ok = whOk && outOk;
      quizResults[idx] = ok;

      whInput.className = `input-field mono ${whOk ? 'is-correct' : 'is-wrong'}`;
      outInput.className = `input-field mono ${outOk ? 'is-correct' : 'is-wrong'}`;

      const r = q.result;
      const hintText = buildErrorHint(whOk, outOk, q);
      const stepsHtml = r.steps.map(s => `<li><span>${s}</span></li>`).join('');
      inner.innerHTML = `
        <div>
          <span class="feedback-status ${ok ? 'is-ok' : 'is-err'}">${ok ? '[BENAR]' : '[BELUM TEPAT]'}</span>
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
      feedbackEl.classList.add('visible');
      updateQuizScore();
    });

    [whInput, outInput].forEach(i =>
      i.addEventListener('input', () => i.classList.remove('is-invalid', 'is-correct', 'is-wrong'))
    );
  });
}

// === 4. REQUEST WAREHOUSE UNIT CONVERT EXPLORER ===
const WHC_PRESETS = {
  'req-eq-wh':  { wh: 'L',   out: 'mL',  req: 'L',    val: 1.6, mult: 1000, unitsExist: true,  convExist: true },
  'req-eq-out': { wh: 'Box', out: 'Pcs', req: 'Pcs',  val: 2,   mult: 12,   unitsExist: true,  convExist: true },
  'all-same':   { wh: 'L',   out: 'L',   req: 'L',    val: 2.5, mult: 1,    unitsExist: true,  convExist: true },
  'neither':    { wh: 'Box', out: 'Pcs', req: 'Pack', val: 3,   mult: 12,   unitsExist: true,  convExist: true },
  'missing':    { wh: 'L',   out: 'mL',  req: 'L',    val: 1.6, mult: 1000, unitsExist: false, convExist: false }
};

function traceRequestWarehouseUnitConvert({ whUnit, outUnit, reqUnit, value, multiplyValue, unitsExist, convExist }) {
  const whLower = whUnit.toLowerCase();
  const outLower = outUnit.toLowerCase();
  const reqLower = reqUnit.toLowerCase();

  const hasMissingUnits = !unitsExist;
  const isSameWh = whLower === reqLower;
  const isSameOut = outLower === reqLower;
  const allSameName = outLower === reqLower && outLower === whLower;

  let badge = '';
  let explain = '';
  let resultVal = value;
  let directionLabel = '';
  let steps = [];

  if (hasMissingUnits || (!isSameWh && !isSameOut)) {
    const reason = hasMissingUnits
      ? 'data satuan outlet atau satuan permintaan belum terdaftar di gudang ini'
      : `satuan yang diminta (${reqUnit}) tidak sama dengan satuan di gudang (${whUnit}) maupun di outlet (${outUnit})`;

    badge = 'PAKAI KONVERSI UMUM';
    directionLabel = 'Konversi Umum';
    explain = `Aturan konversi khusus gudang dilewati karena ${reason}. Sistem otomatis beralih menggunakan aturan konversi umum antar satuan.`;
    resultVal = !convExist || outLower === reqLower ? value : value / (multiplyValue || 1);
    steps = [
      `Pengecekan awal mendeteksi bahwa ${reason}.`,
      convExist && outLower !== reqLower
        ? `Sistem memakai aturan konversi umum untuk mengubah ${value} ${reqUnit} ke ${outUnit} (hasil: ${fmtShort(resultVal)} ${outUnit}).`
        : `Karena aturan konversi belum ada atau satuannya sama, angka tetap ${fmtShort(resultVal)} ${outUnit}.`
    ];
  } else if (isSameOut) {
    if (allSameName) {
      badge = 'LANGSUNG 1 : 1 (SEMUA SAMA)';
      directionLabel = 'Langsung (1 : 1)';
      explain = `Satuan di gudang, di outlet, dan yang diminta sama-sama <strong>${outUnit}</strong>. Tidak ada yang perlu dikonversi: stok gudang berkurang dan stok outlet bertambah dengan angka yang sama.`;
      resultVal = value;
      steps = [
        `Ketiga satuan identik (${outUnit}).`,
        `Tidak perlu mengalikan atau membagi angka: stok outlet bertambah ${fmtShort(resultVal)} ${outUnit} dan gudang berkurang ${fmtShort(value)} ${whUnit}.`
      ];
    } else if (convExist) {
      badge = 'PERMINTAAN = SATUAN OUTLET';
      directionLabel = `${whUnit} → ${outUnit}`;
      explain = `Satuan permintaan (<strong>${reqUnit}</strong>) sama dengan satuan outlet, tetapi berbeda dengan satuan produk di gudang (<strong>${whUnit}</strong>). Sistem mengambil pengali dari aturan gudang (<strong>${whUnit} &rarr; ${outUnit}</strong>).`;
      resultVal = value * multiplyValue;
      steps = [
        `Permintaan memakai satuan outlet (${reqUnit}), sedangkan stok di gudang memakai ${whUnit}.`,
        `Sistem mencari aturan konversi dari satuan gudang (${whUnit}) ke satuan outlet (${outUnit}) dengan pengali ${multiplyValue}.`,
        `Hasil untuk outlet: ${value} × ${multiplyValue} = ${fmtShort(resultVal)} ${outUnit}.`
      ];
    } else {
      badge = 'ATURAN KOSONG → KONVERSI UMUM';
      directionLabel = 'Konversi Umum';
      explain = `Permintaan sama dengan satuan outlet, tetapi aturan konversi khusus gudang (${whUnit} &rarr; ${outUnit}) belum tersedia, sehingga sistem beralih ke aturan konversi umum.`;
      resultVal = value;
      steps = [
        `Permintaan sama dengan satuan outlet (${outUnit}).`,
        `Aturan konversi khusus di gudang tidak ditemukan, sehingga sistem beralih ke konversi umum (nilai sementara: ${fmtShort(resultVal)} ${outUnit}).`
      ];
    }
  } else {
    if (convExist) {
      badge = 'PERMINTAAN = SATUAN GUDANG';
      directionLabel = `${reqUnit} → ${outUnit}`;
      explain = `Satuan permintaan (<strong>${reqUnit}</strong>) sama dengan satuan produk di gudang (<strong>${whUnit}</strong>), dan berbeda dengan satuan outlet (<strong>${outUnit}</strong>). Sistem mengalikan permintaan dengan aturan konversi dari <strong>${reqUnit} &rarr; ${outUnit}</strong>.`;
      resultVal = value * multiplyValue;
      steps = [
        `Permintaan (${reqUnit}) sesuai dengan satuan yang tersimpan di gudang (${whUnit}).`,
        `Sistem memakai aturan konversi gudang dari ${reqUnit} ke satuan outlet (${outUnit}) dengan pengali ${multiplyValue}.`,
        `Stok outlet bertambah: ${value} × ${multiplyValue} = ${fmtShort(resultVal)} ${outUnit}.`
      ];
    } else {
      badge = 'ATURAN KOSONG → KONVERSI UMUM';
      directionLabel = 'Konversi Umum';
      explain = `Permintaan sama dengan satuan gudang (${reqUnit}), namun aturan konversi (${reqUnit} &rarr; ${outUnit}) belum tersedia di gudang sehingga beralih ke aturan konversi umum.`;
      resultVal = value;
      steps = [
        `Permintaan cocok dengan satuan gudang (${whUnit}).`,
        `Aturan konversi belum ditemukan di gudang, sehingga sistem beralih ke konversi umum (nilai sementara: ${fmtShort(resultVal)} ${outUnit}).`
      ];
    }
  }

  return {
    flags: [
      { key: 'Data satuan di gudang', val: hasMissingUnits ? 'Belum lengkap' : 'Lengkap', state: hasMissingUnits ? 'is-warn' : 'is-true' },
      { key: 'Permintaan = Gudang?', val: isSameWh ? 'Ya, sama' : 'Tidak sama', state: isSameWh ? 'is-true' : 'is-false' },
      { key: 'Permintaan = Outlet?', val: isSameOut ? 'Ya, sama' : 'Tidak sama', state: isSameOut ? 'is-true' : 'is-false' },
      { key: 'Acuan arah konversi', val: directionLabel, state: 'is-false' }
    ],
    badge,
    explain,
    resultVal,
    outUnit,
    steps
  };
}

function initWhConvert() {
  const whSel = document.getElementById('whcWarehouseUnit');
  const outSel = document.getElementById('whcOutletUnit');
  const reqSel = document.getElementById('whcRequestUnit');
  const valInput = document.getElementById('whcValueInput');
  const multInput = document.getElementById('whcMultiplyInput');
  const unitsExistChk = document.getElementById('whcUnitsExist');
  const convExistChk = document.getElementById('whcConvExist');
  const presetBtns = document.querySelectorAll('[data-whc-preset]');

  const badgeEl = document.getElementById('whcBranchBadge');
  const flagsEl = document.getElementById('whcFlags');
  const explainEl = document.getElementById('whcExplain');
  const bannerEl = document.getElementById('whcResultBanner');
  const traceEl = document.getElementById('whcCodeTrace');

  if (!whSel || !flagsEl || !traceEl) return;

  const render = () => {
    const data = traceRequestWarehouseUnitConvert({
      whUnit: whSel.value,
      outUnit: outSel.value,
      reqUnit: reqSel.value,
      value: Math.max(0, parseFloat(valInput.value) || 0),
      multiplyValue: Math.max(0, parseFloat(multInput.value) || 0),
      unitsExist: unitsExistChk.checked,
      convExist: convExistChk.checked
    });

    badgeEl.textContent = data.badge;
    flagsEl.innerHTML = data.flags
      .map(f => `<div class="whc-flag"><span class="param-key">${f.key}</span><span class="whc-flag-val ${f.state}">${f.val}</span></div>`)
      .join('');
    explainEl.innerHTML = data.explain;
    bannerEl.textContent = `Stok yang masuk ke outlet: ${fmtShort(data.resultVal)} ${data.outUnit}`;
    traceEl.innerHTML = `<ul class="trace-list">${data.steps.map(s => `<li><span>${s}</span></li>`).join('')}</ul>`;
  };

  const clearPresets = () => presetBtns.forEach(b => b.classList.remove('active'));

  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const p = WHC_PRESETS[btn.dataset.whcPreset];
      if (!p) return;
      clearPresets();
      btn.classList.add('active');
      whSel.value = p.wh;
      outSel.value = p.out;
      reqSel.value = p.req;
      valInput.value = p.val;
      multInput.value = p.mult;
      unitsExistChk.checked = p.unitsExist;
      convExistChk.checked = p.convExist;
      render();
    });
  });

  [whSel, outSel, reqSel, valInput, multInput, unitsExistChk, convExistChk].forEach(el => {
    el.addEventListener('input', () => { clearPresets(); render(); });
    el.addEventListener('change', () => { clearPresets(); render(); });
  });

  render();
}

// === 5. SCROLL REVEAL & NAV HIGHLIGHT ===
function initReveal() {
  const targets = document.querySelectorAll('.reveal');
  if (prefersReducedMotion || !('IntersectionObserver' in window)) {
    targets.forEach(el => el.classList.add('in-view'));
    return;
  }
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.04, rootMargin: '0px 0px -20px 0px' });
  targets.forEach((el, i) => {
    el.style.setProperty('--reveal-delay', `${(i % 4) * 60}ms`);
    io.observe(el);
  });
}

function initNavSpy() {
  const navLinks = document.querySelectorAll('.main-nav .nav-link');
  const sections = document.querySelectorAll('section[id]');
  if (!navLinks.length || !sections.length) return;

  const setActive = id => {
    navLinks.forEach(link => {
      link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
    });
  };

  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      const targetId = link.getAttribute('href')?.slice(1);
      if (targetId) setActive(targetId);
    });
  });

  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) setActive(entry.target.id);
    });
  }, { rootMargin: '-35% 0px -55% 0px' });
  sections.forEach(sec => io.observe(sec));
}

// Initialize all modules
updateSimulator();
renderCase(0, false);
initWhConvert();
renderQuiz();
initReveal();
initNavSpy();
