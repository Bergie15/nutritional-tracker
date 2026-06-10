/* ── Constants ── */
const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9,
};
const GOAL_CALORIE_ADJUSTMENTS = { cut: -500, recomposition: -250, maintain: 0, bulk: 300 };
const GOAL_PROTEIN_RATIO       = { cut: 1.2,  recomposition: 1.0,  maintain: 0.8, bulk: 0.9 };

const MEAL_ICONS  = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎' };
const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };

const RING_CIRC  = 2 * Math.PI * 75;
const MICRO_CIRC = 2 * Math.PI * 18;

const DEFAULT_PROFILE = {
  age: 30, weight: 205, heightFt: 5, heightIn: 10,
  sex: 'male', activity: 'moderate', goal: 'recomposition',
};

/* ── State ── */
const state = { profile: null, targets: null, today: todayKey(), entries: {} };

/* ── Date ── */
function todayKey() { return new Date().toISOString().slice(0, 10); }
function formatDateLabel(key) {
  return new Date(key + 'T12:00:00').toLocaleDateString('en-US',
    { weekday: 'short', month: 'short', day: 'numeric' });
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function num(id) { return parseFloat(document.getElementById(id).value) || 0; }

/* ── Persistence (localStorage) ── */
function persist() {
  localStorage.setItem('nt_profile', JSON.stringify(state.profile));
  localStorage.setItem('nt_entries', JSON.stringify(state.entries));
}
function hydrate() {
  try {
    state.profile = JSON.parse(localStorage.getItem('nt_profile')) || { ...DEFAULT_PROFILE };
    state.entries = JSON.parse(localStorage.getItem('nt_entries')) || {};
  } catch {
    state.profile = { ...DEFAULT_PROFILE };
    state.entries = {};
  }
  state.targets = calcTargets(state.profile);
}

/* ── Target Calculator (Mifflin-St Jeor) ── */
function calcTargets(p) {
  const kg = p.weight * 0.453592;
  const cm = (p.heightFt * 12 + p.heightIn) * 2.54;
  const bmr = p.sex === 'male'
    ? 10 * kg + 6.25 * cm - 5 * p.age + 5
    : 10 * kg + 6.25 * cm - 5 * p.age - 161;
  const tdee     = bmr * (ACTIVITY_MULTIPLIERS[p.activity] || 1.55);
  const calories = Math.round(tdee + (GOAL_CALORIE_ADJUSTMENTS[p.goal] || -250));
  const protein  = Math.round(p.weight * (GOAL_PROTEIN_RATIO[p.goal] || 1.0));
  const fat      = Math.round(Math.min(p.weight * 0.4, (calories * 0.30) / 9));
  const carbs    = Math.max(50, Math.round((calories - protein * 4 - fat * 9) / 4));
  return {
    calories, protein, carbs, fat,
    fiber:        p.sex === 'male' ? 38 : 25,
    sodium:       2300,
    sugar:        Math.round((calories * 0.10) / 4),
    addedSugar:   Math.round((calories * 0.05) / 4),
    saturatedFat: Math.round((calories * 0.10) / 9),
    transFat:     0,
    cholesterol:  300,
    potassium:    p.sex === 'male' ? 3400 : 2600,
    calcium:      1000,
    iron:         p.sex === 'male' ? 8 : 18,
    vitaminD:     15,
  };
}

/* ── Entry helpers ── */
function todayEntries() { return state.entries[state.today] || []; }

function sumNutrition(entries) {
  const keys = ['calories','protein','carbs','fat','fiber','sodium','sugar',
                 'addedSugar','saturatedFat','transFat','cholesterol',
                 'potassium','calcium','iron','vitaminD'];
  const total = Object.fromEntries(keys.map(k => [k, 0]));
  for (const e of entries) {
    const s = e.servings || 1;
    for (const k of keys) total[k] += (e.nutrition[k] || 0) * s;
  }
  for (const k of keys) total[k] = Math.round(total[k] * 10) / 10;
  return total;
}

function pushEntry(entry) {
  if (!state.entries[state.today]) state.entries[state.today] = [];
  state.entries[state.today].push(entry);
  persist();
}

function removeEntry(id) {
  if (!state.entries[state.today]) return;
  state.entries[state.today] = state.entries[state.today].filter(e => e.id !== id);
  persist();
}

/* ── Toast ── */
let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2800);
}

/* ── Ring helpers ── */
function setCalRing(pct) {
  const el = document.getElementById('calorie-ring-fill');
  el.style.strokeDashoffset = RING_CIRC * (1 - Math.min(pct, 1));
  el.style.stroke = pct > 1 ? 'var(--danger)' : pct > 0.9 ? 'var(--warn)' : 'var(--accent)';
}
function setMicroArc(arcId, pct) {
  const el = document.getElementById(arcId);
  if (el) el.style.strokeDashoffset = MICRO_CIRC * (1 - Math.min(pct, 1));
}
function setMacroBar(barId, valId, consumed, target, unit) {
  const pct = target > 0 ? Math.min((consumed / target) * 100, 100) : 0;
  const bar = document.getElementById(barId);
  const val = document.getElementById(valId);
  if (bar) { bar.style.width = pct + '%'; bar.classList.toggle('over', consumed > target); }
  if (val) val.textContent = `${Math.round(consumed)} / ${target}${unit}`;
}

/* ══ DASHBOARD ══ */
function renderDashboard() {
  state.today = todayKey();
  const entries = todayEntries();
  const tot = sumNutrition(entries);
  const t   = state.targets;

  document.getElementById('header-date').textContent =
    new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const calPct = t.calories > 0 ? tot.calories / t.calories : 0;
  setCalRing(calPct);
  document.getElementById('dash-cal-consumed').textContent  = Math.round(tot.calories).toLocaleString();
  document.getElementById('dash-cal-remaining').textContent = Math.max(0, t.calories - Math.round(tot.calories)).toLocaleString();
  document.getElementById('dash-cal-goal').textContent      = t.calories.toLocaleString();

  setMacroBar('dash-protein-bar', 'dash-protein-val', tot.protein, t.protein, 'g');
  setMacroBar('dash-carbs-bar',   'dash-carbs-val',   tot.carbs,   t.carbs,   'g');
  setMacroBar('dash-fat-bar',     'dash-fat-val',     tot.fat,     t.fat,     'g');

  const micros = [
    { arc: 'micro-fiber-arc',     pctId: 'micro-fiber-pct',     valId: 'micro-fiber-val',     v: tot.fiber,        tgt: t.fiber,        unit: 'g'  },
    { arc: 'micro-sodium-arc',    pctId: 'micro-sodium-pct',    valId: 'micro-sodium-val',    v: tot.sodium,       tgt: t.sodium,       unit: 'mg' },
    { arc: 'micro-sugar-arc',     pctId: 'micro-sugar-pct',     valId: 'micro-sugar-val',     v: tot.sugar,        tgt: t.sugar,        unit: 'g'  },
    { arc: 'micro-satfat-arc',    pctId: 'micro-satfat-pct',    valId: 'micro-satfat-val',    v: tot.saturatedFat, tgt: t.saturatedFat, unit: 'g'  },
    { arc: 'micro-potassium-arc', pctId: 'micro-potassium-pct', valId: 'micro-potassium-val', v: tot.potassium,    tgt: t.potassium,    unit: 'mg' },
    { arc: 'micro-chol-arc',      pctId: 'micro-chol-pct',      valId: 'micro-chol-val',      v: tot.cholesterol,  tgt: t.cholesterol,  unit: 'mg' },
  ];
  for (const m of micros) {
    const pct = m.tgt > 0 ? m.v / m.tgt : 0;
    setMicroArc(m.arc, pct);
    const pEl = document.getElementById(m.pctId);
    if (pEl) pEl.textContent = Math.round(pct * 100) + '%';
    const vEl = document.getElementById(m.valId);
    if (vEl) vEl.textContent = `${Math.round(m.v)}/${m.tgt}${m.unit}`;
  }

  renderMealsList();
}

function renderMealsList() {
  const list  = document.getElementById('meals-list');
  const empty = document.getElementById('meals-empty');
  const entries = todayEntries();

  list.querySelectorAll('.meal-group').forEach(el => el.remove());

  if (entries.length === 0) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  const groups = {};
  for (const e of entries) (groups[e.mealType] = groups[e.mealType] || []).push(e);

  for (const mealType of ['breakfast','lunch','dinner','snack']) {
    if (!groups[mealType]) continue;
    const group = document.createElement('div');
    group.className = 'meal-group';
    group.innerHTML = `<div class="meal-group-label">${MEAL_LABELS[mealType]}</div>`;

    for (const entry of groups[mealType]) {
      const s    = entry.servings || 1;
      const cal  = Math.round((entry.nutrition.calories || 0) * s);
      const prot = Math.round((entry.nutrition.protein  || 0) * s * 10) / 10;
      const row  = document.createElement('div');
      row.className = 'meal-entry';
      row.innerHTML = `
        <div class="meal-icon">${MEAL_ICONS[mealType]}</div>
        <div class="meal-info">
          <div class="meal-name">${entry.name}</div>
          <div class="meal-details">${entry.servingSize ? entry.servingSize + (s !== 1 ? ` × ${s}` : '') + ' · ' : ''}${prot}g protein</div>
        </div>
        <div class="meal-cal">${cal}</div>
        <button class="meal-delete-btn" data-id="${entry.id}" title="Remove">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </button>`;
      group.appendChild(row);
    }
    list.appendChild(group);
  }

  list.querySelectorAll('.meal-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      removeEntry(btn.dataset.id);
      renderDashboard();
      showToast('Entry removed');
    });
  });
}

/* ══ OCR TEXT PARSER ══
   Parses raw text from ML Kit into structured nutrition data.
   Handles the standard FDA Nutrition Facts label format.        */
function parseNutritionLabel(rawText) {
  const result = {};
  const text   = rawText.toLowerCase();
  const lines  = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  /* Extract a number that follows a keyword, with an optional unit */
  function find(patterns) {
    for (const pat of (Array.isArray(patterns) ? patterns : [patterns])) {
      const m = text.match(pat);
      if (m) return parseFloat(m[1]);
    }
    return null;
  }

  function g(keyword) {
    return find([
      new RegExp(keyword + '[^\\n]{0,10}?([\\d.]+)\\s*g\\b'),
      new RegExp('([\\d.]+)\\s*g\\b[^\\n]{0,10}?' + keyword),
    ]);
  }

  function mg(keyword) {
    return find([
      new RegExp(keyword + '[^\\n]{0,10}?([\\d.]+)\\s*mg\\b'),
      new RegExp('([\\d.]+)\\s*mg\\b[^\\n]{0,10}?' + keyword),
    ]);
  }

  // Calories — no unit on the label
  result.calories = find([
    /calories\s+(\d+)/,
    /(\d+)\s+calories/,
    /cal(?:ories)?[:\s]+(\d+)/,
  ]);

  // Macros
  result.totalFat      = g('total fat');
  result.saturatedFat  = g('saturated fat') || g('sat(?:urated)? fat');
  result.transFat      = g('trans fat');
  result.totalCarbs    = g('total carbohydrate') || g('total carb');
  result.dietaryFiber  = g('dietary fiber') || g('fiber');
  result.totalSugars   = g('total sugars') || g('sugars');
  result.addedSugars   = g('added sugars') || g('incl\\.?.*added sugars');
  result.protein       = g('protein');

  // Micros in mg
  result.cholesterol = mg('cholesterol');
  result.sodium      = mg('sodium');
  result.potassium   = mg('potassium');
  result.calcium     = mg('calcium');
  result.iron        = mg('iron') || find(/iron\s+([\d.]+)\s*mg/);

  // Vitamin D (mcg or IU — convert IU to mcg: 1 mcg = 40 IU)
  result.vitaminD = find([
    /vitamin d[^\\n]{0,10}?([\d.]+)\s*(?:mcg|µg|ug)/,
    /vitamin d3[^\\n]{0,10}?([\d.]+)\s*(?:mcg|µg|ug)/,
  ]);
  if (!result.vitaminD) {
    const iu = find(/vitamin d[^\\n]{0,10}?([\d.]+)\s*iu/);
    if (iu) result.vitaminD = Math.round(iu / 40 * 10) / 10;
  }

  // Serving size — find in the original lines (case-insensitive)
  for (const line of lines) {
    if (/serving size/i.test(line)) {
      result.servingSize = line.replace(/serving size[:\s]*/i, '').trim();
      break;
    }
  }

  return result;
}

/* ══ SCAN PAGE ══ */
function resetScanPage() {
  document.getElementById('scan-status').classList.add('hidden');
  document.getElementById('scan-error').classList.add('hidden');
  document.getElementById('scan-results-card').classList.add('hidden');
  document.getElementById('scan-camera-btn').disabled = false;
  document.getElementById('scan-gallery-btn').disabled = false;
}

function showScanSpinner(msg) {
  document.getElementById('scan-status-text').textContent = msg || 'Analyzing label…';
  document.getElementById('scan-status').classList.remove('hidden');
  document.getElementById('scan-camera-btn').disabled = true;
  document.getElementById('scan-gallery-btn').disabled = true;
}

function setInput(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = (val !== null && val !== undefined && val !== '') ? val : '';
}

function populateScanForm(n) {
  setInput('res-name',        n.servingSize ? '' : '');
  setInput('res-serving',     n.servingSize);
  setInput('res-servings-count', 1);
  setInput('res-calories',    n.calories);
  setInput('res-fat',         n.totalFat);
  setInput('res-satfat',      n.saturatedFat);
  setInput('res-transfat',    n.transFat);
  setInput('res-chol',        n.cholesterol);
  setInput('res-sodium',      n.sodium);
  setInput('res-carbs',       n.totalCarbs);
  setInput('res-fiber',       n.dietaryFiber);
  setInput('res-sugar',       n.totalSugars);
  setInput('res-addedsugars', n.addedSugars);
  setInput('res-protein',     n.protein);
  setInput('res-potassium',   n.potassium);
  setInput('res-calcium',     n.calcium);
  setInput('res-iron',        n.iron);
  setInput('res-vitamind',    n.vitaminD);

  const h = new Date().getHours();
  document.getElementById('res-meal-type').value =
    h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 20 ? 'dinner' : 'snack';
}

/* Called by Android after ML Kit finishes */
window.receiveOcrText = function(rawText) {
  document.getElementById('scan-status').classList.add('hidden');
  document.getElementById('scan-camera-btn').disabled = false;
  document.getElementById('scan-gallery-btn').disabled = false;

  const parsed = parseNutritionLabel(rawText);
  populateScanForm(parsed);

  document.getElementById('scan-results-card').classList.remove('hidden');
  setTimeout(() =>
    document.getElementById('scan-results-card').scrollIntoView({ behavior: 'smooth' }), 100);
};

window.onOcrError = function(msg) {
  document.getElementById('scan-status').classList.add('hidden');
  document.getElementById('scan-camera-btn').disabled = false;
  document.getElementById('scan-gallery-btn').disabled = false;
  const err = document.getElementById('scan-error');
  err.textContent = '⚠ ' + (msg || 'OCR failed');
  err.classList.remove('hidden');
};

function addFromScan() {
  const name     = document.getElementById('res-name').value.trim() || 'Scanned Food';
  const servings = parseFloat(document.getElementById('res-servings-count').value) || 1;
  const mealType = document.getElementById('res-meal-type').value;

  pushEntry({
    id: uid(), mealType, name,
    servingSize: document.getElementById('res-serving').value.trim(),
    servings,
    addedAt: new Date().toISOString(),
    nutrition: {
      calories:     num('res-calories'),
      fat:          num('res-fat'),
      saturatedFat: num('res-satfat'),
      transFat:     num('res-transfat'),
      cholesterol:  num('res-chol'),
      sodium:       num('res-sodium'),
      carbs:        num('res-carbs'),
      fiber:        num('res-fiber'),
      sugar:        num('res-sugar'),
      addedSugar:   num('res-addedsugars'),
      protein:      num('res-protein'),
      potassium:    num('res-potassium'),
      calcium:      num('res-calcium'),
      iron:         num('res-iron'),
      vitaminD:     num('res-vitamind'),
    },
  });

  showToast(`✓ ${name} added to ${MEAL_LABELS[mealType]}`);
  resetScanPage();
  navigateTo('dashboard');
}

/* ══ MANUAL LOG ══ */
function handleManualLog(e) {
  e.preventDefault();
  const name = document.getElementById('log-name').value.trim();
  if (!name) return;

  const servings  = parseFloat(document.getElementById('log-servings-count').value) || 1;
  const mealType  = document.getElementById('log-meal-type').value;

  pushEntry({
    id: uid(), mealType, name,
    servingSize: document.getElementById('log-serving').value.trim(),
    servings,
    addedAt: new Date().toISOString(),
    nutrition: {
      calories:     num('log-calories'),
      fat:          num('log-fat'),
      saturatedFat: num('log-satfat'),
      transFat:     num('log-transfat'),
      cholesterol:  num('log-chol'),
      sodium:       num('log-sodium'),
      carbs:        num('log-carbs'),
      fiber:        num('log-fiber'),
      sugar:        num('log-sugar'),
      addedSugar:   0,
      protein:      num('log-protein'),
      potassium:    num('log-potassium'),
      calcium:      num('log-calcium'),
      iron:         num('log-iron'),
      vitaminD:     0,
    },
  });

  showToast(`✓ ${name} added to ${MEAL_LABELS[mealType]}`);
  e.target.reset();
  document.getElementById('log-servings-count').value = 1;
  navigateTo('dashboard');
}

/* ══ HISTORY ══ */
function renderHistory() {
  const list  = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');

  list.querySelectorAll('.history-day').forEach(el => el.remove());

  const keys = Object.keys(state.entries)
    .filter(k => (state.entries[k] || []).length > 0)
    .sort((a, b) => b.localeCompare(a));

  if (keys.length === 0) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  for (const key of keys) {
    const entries = state.entries[key];
    const tot     = sumNutrition(entries);
    const label   = key === todayKey() ? 'Today' : formatDateLabel(key);
    const calPct  = Math.round((tot.calories / state.targets.calories) * 100);
    const t       = state.targets;

    const day  = document.createElement('div');
    day.className = 'history-day';

    const body = document.createElement('div');
    body.className = 'history-day-body';
    body.style.display = key === todayKey() ? 'block' : 'none';
    body.innerHTML = `
      <div style="margin-bottom:10px">
        <div style="display:flex;gap:8px;margin-bottom:4px;font-size:11px">
          <span style="color:var(--protein)">P ${Math.round(tot.protein)}g</span>
          <span style="color:var(--carbs)">C ${Math.round(tot.carbs)}g</span>
          <span style="color:var(--fat)">F ${Math.round(tot.fat)}g</span>
        </div>
        <div class="progress-bar" style="height:4px">
          <div class="progress-fill protein-fill" style="width:${Math.min((tot.protein/t.protein)*100,100).toFixed(1)}%"></div>
        </div>
      </div>
      ${entries.map(e => `
        <div class="history-entry">
          <span class="history-entry-name">${MEAL_ICONS[e.mealType]} ${e.name}</span>
          <span class="history-entry-cal">${Math.round((e.nutrition.calories||0)*(e.servings||1))} cal</span>
        </div>`).join('')}`;

    day.innerHTML = `
      <div class="history-day-header">
        <div>
          <h3>${label}</h3>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${entries.length} item${entries.length !== 1 ? 's' : ''} · ${calPct}% of goal</div>
        </div>
        <div class="history-day-cal">${Math.round(tot.calories).toLocaleString()} cal</div>
      </div>`;

    day.querySelector('.history-day-header').addEventListener('click', () => {
      body.style.display = body.style.display === 'none' ? 'block' : 'none';
    });
    day.appendChild(body);
    list.appendChild(day);
  }
}

/* ══ SETTINGS ══ */
function openSettings() {
  const p = state.profile;
  document.getElementById('prf-age').value        = p.age;
  document.getElementById('prf-weight').value     = p.weight;
  document.getElementById('prf-height-ft').value  = p.heightFt;
  document.getElementById('prf-height-in').value  = p.heightIn;
  document.getElementById('prf-sex').value         = p.sex;
  document.getElementById('prf-activity').value    = p.activity;
  document.getElementById('prf-goal').value        = p.goal;
  renderTargetsPreview(p);
  document.getElementById('settings-modal').classList.remove('hidden');
}
function closeSettings() { document.getElementById('settings-modal').classList.add('hidden'); }

function readProfileForm() {
  return {
    age:      parseInt(document.getElementById('prf-age').value)       || 30,
    weight:   parseFloat(document.getElementById('prf-weight').value)  || 205,
    heightFt: parseInt(document.getElementById('prf-height-ft').value) || 5,
    heightIn: parseInt(document.getElementById('prf-height-in').value) || 10,
    sex:      document.getElementById('prf-sex').value,
    activity: document.getElementById('prf-activity').value,
    goal:     document.getElementById('prf-goal').value,
  };
}

function renderTargetsPreview(profile) {
  const t = calcTargets(profile);
  document.getElementById('targets-preview').innerHTML = `
    <div class="targets-preview-title">Your Daily Targets</div>
    <div class="targets-grid">
      <div class="target-item"><span class="t-val">${t.calories.toLocaleString()}</span> <span class="t-label">calories</span></div>
      <div class="target-item"><span class="t-val">${t.protein}g</span> <span class="t-label">protein</span></div>
      <div class="target-item"><span class="t-val">${t.carbs}g</span> <span class="t-label">carbs</span></div>
      <div class="target-item"><span class="t-val">${t.fat}g</span> <span class="t-label">fat</span></div>
      <div class="target-item"><span class="t-val">${t.fiber}g</span> <span class="t-label">fiber</span></div>
      <div class="target-item"><span class="t-val">${t.sodium}mg</span> <span class="t-label">sodium max</span></div>
      <div class="target-item"><span class="t-val">${t.saturatedFat}g</span> <span class="t-label">sat. fat max</span></div>
      <div class="target-item"><span class="t-val">${t.potassium}mg</span> <span class="t-label">potassium</span></div>
    </div>`;
}

/* ══ EXPORT / IMPORT (via Android bridge) ══ */
function exportData() {
  const payload = JSON.stringify({ profile: state.profile, entries: state.entries }, null, 2);
  if (window.Android) {
    Android.exportData(payload);
  } else {
    // Fallback for non-Android (web) — download as file
    const blob = new Blob([payload], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = 'nutritrack_' + todayKey() + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('✓ Data exported');
  }
}

function importData() {
  if (window.Android) {
    Android.importData();
  } else {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => window.receiveImportedData(ev.target.result);
      reader.readAsText(file);
    };
    input.click();
  }
}

/* Called by Android after reading the import file */
window.receiveImportedData = function(jsonStr) {
  try {
    const data = JSON.parse(jsonStr);
    if (data.entries) state.entries = data.entries;
    if (data.profile) {
      state.profile  = data.profile;
      state.targets  = calcTargets(state.profile);
    }
    persist();
    renderDashboard();
    closeSettings();
    showToast('✓ Data imported');
  } catch {
    showToast('⚠ Import failed — invalid file');
  }
};

/* ══ NAVIGATION ══ */
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(`page-${page}`);
  if (target) target.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });

  document.getElementById('main-content').scrollTop = 0;

  if (page === 'dashboard') renderDashboard();
  if (page === 'history')   renderHistory();
  if (page === 'log') {
    const h = new Date().getHours();
    document.getElementById('log-meal-type').value =
      h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 20 ? 'dinner' : 'snack';
  }
}

/* ══ INIT ══ */
function init() {
  hydrate();

  document.getElementById('header-date').textContent =
    new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  renderDashboard();

  /* Nav */
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.page));
  });

  /* Dashboard */
  document.getElementById('dash-add-btn').addEventListener('click', () => navigateTo('log'));

  /* Settings */
  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('settings-close').addEventListener('click', closeSettings);
  document.getElementById('settings-modal').addEventListener('click', (e) => {
    if (e.target.id === 'settings-modal') closeSettings();
  });
  ['prf-age','prf-weight','prf-height-ft','prf-height-in','prf-sex','prf-activity','prf-goal'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => renderTargetsPreview(readProfileForm()));
  });
  document.getElementById('settings-form').addEventListener('submit', (e) => {
    e.preventDefault();
    state.profile  = readProfileForm();
    state.targets  = calcTargets(state.profile);
    persist();
    closeSettings();
    renderDashboard();
    showToast('✓ Profile saved');
  });

  /* Export / Import */
  document.getElementById('export-btn').addEventListener('click', exportData);
  document.getElementById('import-btn').addEventListener('click', importData);

  /* Scan: camera */
  document.getElementById('scan-camera-btn').addEventListener('click', () => {
    document.getElementById('scan-error').classList.add('hidden');
    document.getElementById('scan-results-card').classList.add('hidden');
    if (window.Android) {
      showScanSpinner('Opening camera…');
      Android.startOcrCapture();
    } else {
      showToast('Camera only available in the Android app');
    }
  });

  /* Scan: gallery */
  document.getElementById('scan-gallery-btn').addEventListener('click', () => {
    document.getElementById('scan-error').classList.add('hidden');
    document.getElementById('scan-results-card').classList.add('hidden');
    if (window.Android) {
      showScanSpinner('Opening gallery…');
      Android.pickFromGallery();
    } else {
      showToast('Gallery only available in the Android app');
    }
  });

  /* Scan: add to log */
  document.getElementById('scan-add-btn').addEventListener('click', addFromScan);

  /* Scan: scan again */
  document.getElementById('scan-rescan-btn').addEventListener('click', resetScanPage);

  /* Manual log */
  document.getElementById('manual-log-form').addEventListener('submit', handleManualLog);
}

document.addEventListener('DOMContentLoaded', init);
