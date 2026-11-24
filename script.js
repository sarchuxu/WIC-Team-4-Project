const STORAGE_KEY = 'vitacoach-user-data-v3';
const THEME_KEY = 'vitacoach-theme-mode';
const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const MINI_RING_CIRCUMFERENCE = 2 * Math.PI * 25; // 157.08 for r="25"

const SAMPLE_LABEL = {
  productName: 'Toasted Almond Oat Clusters',
  calories: 210,
  servingSize: 45,
  servingUnit: 'g',
  protein: 9,
  carbs: 27,
  fat: 8,
  fiber: 5,
  sugar: 7,
  sodium: 140
};

const defaultGoals = {
  dailyCalorieTarget: 1850,
  proteinTarget: 105,
  carbohydrateTarget: 210,
  fatTarget: 60,
  fiberTarget: 28,
  sodiumLimit: 2300
};

const defaultUser = {
  name: '',
  age: 26,
  sex: 'Female',
  height: 165,
  weight: 62,
  activity: 'moderate',
  goals: ['Lose weight', 'Increase protein intake'],
  allergies: []
};

let pendingActionAfterSetup = null;
let activeCoachFilter = 'balanced';
let cameraStream = null;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) {
      return {
        setupComplete: false,
        user: { ...defaultUser },
        goals: { ...defaultGoals },
        foodLogs: [],
        currentFood: null
      };
    }
    return {
      setupComplete: Boolean(saved.setupComplete),
      user: { ...defaultUser, ...(saved.user || {}) },
      goals: { ...defaultGoals, ...(saved.goals || {}) },
      foodLogs: Array.isArray(saved.foodLogs) ? saved.foodLogs : [],
      currentFood: saved.currentFood || null
    };
  } catch {
    return {
      setupComplete: false,
      user: { ...defaultUser },
      goals: { ...defaultGoals },
      foodLogs: [],
      currentFood: null
    };
  }
}

const state = loadState();

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* Config & Gemini API Client (Supports Local config.js & Production Cloudflare Worker) */
function getAiCredentials() {
  const cfg = window.VITACOACH_CONFIG || {};
  const rawKey = (cfg.LOCAL_GEMINI_KEY || '').trim();
  const localKey = rawKey && rawKey !== 'PASTE_YOUR_GEMINI_API_KEY_HERE' ? rawKey : '';
  const workerUrl = (cfg.WORKER_URL || '').trim();
  return { localKey, workerUrl };
}

async function callGemini({ prompt, base64DataUrl = null, jsonMode = false }) {
  const { localKey, workerUrl } = getAiCredentials();

  if (workerUrl) {
    const res = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, base64DataUrl, jsonMode })
    });
    if (!res.ok) throw new Error(`Worker error (${res.status})`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.text || '';
  }

  if (!localKey) {
    return null;
  }

  const parts = [{ text: prompt }];
  if (base64DataUrl && base64DataUrl.includes(',')) {
    const [header, data] = base64DataUrl.split(',');
    const mimeMatch = header.match(/data:(.*?);base64/);
    parts.push({
      inlineData: {
        mimeType: mimeMatch ? mimeMatch[1] : 'image/jpeg',
        data
      }
    });
  }

  const body = { contents: [{ parts }] };
  if (jsonMode) {
    body.generationConfig = { responseMimeType: 'application/json' };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': localKey
      },
      body: JSON.stringify(body)
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API error (${response.status})`);
  }

  const result = await response.json();
  return result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/* Strict Anti-Guessing Vision Extraction & Validation */
async function extractNutritionFromImage(dataUrl, fallbackName = 'Scanned Food') {
  hideScanError();
  document.getElementById('added-banner').classList.add('hidden');

  const { localKey, workerUrl } = getAiCredentials();
  if (!localKey && !workerUrl) {
    revealNutritionSection(
      { ...SAMPLE_LABEL, productName: fallbackName },
      'No API Key Configured — Enter Values Manually',
      true
    );
    return;
  }

  const previewCard = document.getElementById('nutrition-reveal');
  previewCard.classList.remove('hidden');
  document.getElementById('scan-status-pill').textContent = 'Reading label with Gemini AI...';

  const strictPrompt = `You are a strict, high-precision Nutrition Facts label OCR extractor.
Inspect the provided image carefully and follow these rules with ZERO exceptions:
1. NEVER guess, estimate, or hallucinate numbers. Only extract numbers that are clearly printed on a Nutrition Facts / nutritional information label.
2. First check if the image actually shows a food package or Nutrition Facts label:
   - If the image is NOT a food product or nutrition label (e.g., a person, selfie, pet, scenery, screen, blank wall, random object), set "status" to "INVALID_IMAGE" and explain briefly in "reason".
3. Next check image clarity:
   - If a nutrition label is present, but the text is too blurry, out of focus, cut off, or glare-obscured to read calories or serving size with certainty, set "status" to "BLURRY_OR_UNCLEAR" and explain in "reason". Do NOT guess values.
4. Only when a Nutrition Facts label is clearly readable, set "status" to "VALID" and populate the exact numbers per serving (use 0 only if a specific nutrient row is visibly printed as 0 or omitted from a standard label while calories and serving size are clear).

Return ONLY valid JSON matching this exact schema:
{
  "status": "VALID" | "BLURRY_OR_UNCLEAR" | "INVALID_IMAGE",
  "reason": string,
  "productName": string,
  "calories": number,
  "servingSize": number,
  "servingUnit": "g" | "ml" | "oz" | "cup" | "piece",
  "protein": number,
  "carbs": number,
  "fat": number,
  "fiber": number,
  "sugar": number,
  "sodium": number
}`;

  try {
    const rawText = await callGemini({
      prompt: strictPrompt,
      base64DataUrl: dataUrl,
      jsonMode: true
    });

    const parsed = JSON.parse(rawText);

    if (parsed.status === 'INVALID_IMAGE') {
      previewCard.classList.add('hidden');
      showScanError(
        'Invalid Photo — Not a Nutrition Label',
        parsed.reason || 'That photo does not appear to be a food Nutrition Facts label. Please upload a valid label photo and try again.'
      );
      return;
    }

    if (parsed.status === 'BLURRY_OR_UNCLEAR') {
      previewCard.classList.add('hidden');
      showScanError(
        'Blurry or Unclear Label — Please Scan Again',
        parsed.reason || 'We could not read the numbers clearly without guessing. Hold the label steady in bright light and scan again.'
      );
      return;
    }

    const validUnits = ['g', 'ml', 'oz', 'cup', 'piece'];
    const extracted = {
      productName: (parsed.productName || '').trim() || fallbackName,
      calories: getNumeric(parsed.calories, 0),
      servingSize: Math.max(0.1, getNumeric(parsed.servingSize, 1)),
      servingUnit: validUnits.includes(parsed.servingUnit) ? parsed.servingUnit : 'g',
      protein: getNumeric(parsed.protein, 0),
      carbs: getNumeric(parsed.carbs, 0),
      fat: getNumeric(parsed.fat, 0),
      fiber: getNumeric(parsed.fiber, 0),
      sugar: getNumeric(parsed.sugar, 0),
      sodium: getNumeric(parsed.sodium, 0)
    };

    revealNutritionSection(extracted, 'Verified by Gemini AI', false);
  } catch (err) {
    console.error('Gemini OCR error:', err);
    previewCard.classList.add('hidden');
    showScanError(
      'Could Not Read Label — Try Again',
      'There was an issue analyzing that image. Check your API key in config.js or scan the label again.'
    );
  }
}

function showScanError(title, message) {
  document.getElementById('scan-error-title').textContent = title;
  document.getElementById('scan-error-msg').textContent = message;
  document.getElementById('scan-error-banner').classList.remove('hidden');
}

function hideScanError() {
  document.getElementById('scan-error-banner').classList.add('hidden');
}

/* Day / Night Theme */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  document.getElementById('theme-label').textContent = theme === 'night' ? 'Day Mode' : 'Night Mode';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'day';
  applyTheme(current === 'day' ? 'night' : 'day');
}

/* Hamburger Drawer */
function openDrawer() {
  document.getElementById('nav-drawer').classList.add('open');
  document.getElementById('nav-drawer').setAttribute('aria-hidden', 'false');
  document.getElementById('drawer-backdrop').classList.remove('hidden');
}

function closeDrawer() {
  document.getElementById('nav-drawer').classList.remove('open');
  document.getElementById('nav-drawer').setAttribute('aria-hidden', 'true');
  document.getElementById('drawer-backdrop').classList.add('hidden');
}

function setActiveView(viewId) {
  document.querySelectorAll('.drawer-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.target === viewId);
  });
  document.querySelectorAll('.view').forEach((view) => {
    view.classList.toggle('active', view.id === viewId);
  });
  closeDrawer();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* Reset Scanner back to Clean Initial State */
function resetScannerToCleanState(showAddedBanner = false, addedText = '') {
  hideScanError();
  document.getElementById('nutrition-reveal').classList.add('hidden');
  document.getElementById('captured-preview').classList.add('hidden');
  document.getElementById('reticle-overlay').classList.remove('hidden');
  document.getElementById('image-upload').value = '';
  document.getElementById('consumed-quantity').value = 1;
  document.getElementById('consumed-unit').value = 'serving';
  document.querySelectorAll('[data-portion]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.portion === '1');
  });

  const banner = document.getElementById('added-banner');
  if (showAddedBanner) {
    document.getElementById('added-banner-text').textContent = addedText;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

/* First-Time Setup Gate */
function requireSetupThenRun(callback) {
  if (state.setupComplete) {
    callback();
  } else {
    pendingActionAfterSetup = callback;
    document.getElementById('onboarding-modal').classList.remove('hidden');
  }
}

function getNumeric(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function capitalize(str = '') {
  return String(str).charAt(0).toUpperCase() + String(str).slice(1);
}

function calculateTargets({ age, sex, height, weight, activity, goals }) {
  const sexOffset = sex === 'Male' ? 5 : sex === 'Female' ? -161 : -78;
  const bmr = 10 * weight + 6.25 * height - 5 * age + sexOffset;
  const multipliers = { light: 1.375, moderate: 1.55, active: 1.725, athlete: 1.9 };
  let tdee = bmr * (multipliers[activity] || 1.55);

  if ((goals || []).includes('Lose weight')) tdee -= 350;
  if ((goals || []).includes('Build muscle')) tdee += 250;

  const dailyCalorieTarget = Math.max(1350, Math.round(tdee / 10) * 10);
  const proteinMult =
    (goals || []).includes('Build muscle') || (goals || []).includes('Increase protein intake') ? 1.9 : 1.6;
  const proteinTarget = Math.max(85, Math.round(weight * proteinMult));
  const fatTarget = Math.max(45, Math.round((dailyCalorieTarget * 0.28) / 9));
  const carbohydrateTarget = Math.max(
    90,
    Math.round((dailyCalorieTarget - proteinTarget * 4 - fatTarget * 9) / 4)
  );
  const fiberTarget = Math.max(25, Math.round((dailyCalorieTarget / 1000) * 14));

  return {
    dailyCalorieTarget,
    proteinTarget,
    carbohydrateTarget,
    fatTarget,
    fiberTarget,
    sodiumLimit: 2300
  };
}

function getTodayEntries() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return state.foodLogs.filter((entry) => new Date(entry.consumedAt).getTime() >= startOfToday);
}

function sumNutrition(entries) {
  return entries.reduce(
    (acc, item) => {
      acc.calories += Number(item.totalCalories || 0);
      acc.protein += Number(item.totalProtein || 0);
      acc.carbs += Number(item.totalCarbs || 0);
      acc.fat += Number(item.totalFat || 0);
      acc.fiber += Number(item.totalFiber || 0);
      acc.sodium += Number(item.totalSodium || 0);
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0 }
  );
}

function calculateMultiplier({ servingSize, servingUnit, consumedQuantity, consumedUnit }) {
  if (consumedUnit === 'serving') return Number(consumedQuantity || 1);
  const factors = { g: 1, ml: 1, oz: 28.35, cup: 240, piece: 1 };
  const servingTotal = Number(servingSize || 1) * (factors[servingUnit] || 1);
  const consumedTotal = Number(consumedQuantity || 1) * (factors[consumedUnit] || 1);
  return servingTotal ? consumedTotal / servingTotal : 1;
}

function updateLivePreview() {
  const calories = getNumeric(document.getElementById('food-calories').value);
  const protein = getNumeric(document.getElementById('food-protein').value);
  const fiber = getNumeric(document.getElementById('food-fiber').value);
  const sodium = getNumeric(document.getElementById('food-sodium').value);
  const servingSize = getNumeric(document.getElementById('food-serving-size').value, 1);
  const servingUnit = document.getElementById('food-serving-unit').value;
  const quantity = getNumeric(document.getElementById('consumed-quantity').value, 1);
  const consumedUnit = document.getElementById('consumed-unit').value;

  const mult = calculateMultiplier({ servingSize, servingUnit, consumedQuantity: quantity, consumedUnit });
  document.getElementById('preview-totals').textContent =
    `${Math.round(calories * mult)} kcal · ${Math.round(protein * mult)}g protein · ${Math.round(fiber * mult)}g fiber · ${Math.round(sodium * mult)}mg sodium`;
}

function revealNutritionSection(food, statusText = 'Label Ready', openEditor = false) {
  hideScanError();
  document.getElementById('added-banner').classList.add('hidden');
  state.currentFood = food;

  document.getElementById('food-name').value = food.productName;
  document.getElementById('food-calories').value = food.calories;
  document.getElementById('food-serving-size').value = food.servingSize;
  document.getElementById('food-serving-unit').value = food.servingUnit;
  document.getElementById('food-protein').value = food.protein;
  document.getElementById('food-carbs').value = food.carbs;
  document.getElementById('food-fat').value = food.fat;
  document.getElementById('food-fiber').value = food.fiber;
  document.getElementById('food-sugar').value = food.sugar;
  document.getElementById('food-sodium').value = food.sodium;

  document.getElementById('consumed-quantity').value = 1;
  document.getElementById('consumed-unit').value = 'serving';
  document.querySelectorAll('[data-portion]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.portion === '1');
  });

  document.getElementById('scan-status-pill').textContent = statusText;
  document.getElementById('edit-label-drawer').open = openEditor;

  const revealEl = document.getElementById('nutrition-reveal');
  revealEl.classList.remove('hidden');

  renderFactsSummary();
  updateLivePreview();
  revealEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderFactsSummary() {
  const box = document.getElementById('facts-summary-box');
  const item = state.currentFood || SAMPLE_LABEL;
  box.innerHTML = `
    <div class="facts-header">
      <h4>${item.productName}</h4>
      <small>Serving: ${item.servingSize}${item.servingUnit}</small>
    </div>
    <div class="macro-cells">
      <div class="macro-cell"><strong>${item.calories}</strong><span>Calories</span></div>
      <div class="macro-cell"><strong>${item.protein}g</strong><span>Protein</span></div>
      <div class="macro-cell"><strong>${item.fiber}g</strong><span>Fiber</span></div>
      <div class="macro-cell"><strong>${item.sodium}mg</strong><span>Sodium</span></div>
    </div>
  `;
}

function handleLogSubmit(event) {
  event.preventDefault();

  const food = {
    productName: document.getElementById('food-name').value.trim() || 'Scanned Food',
    calories: getNumeric(document.getElementById('food-calories').value),
    servingSize: getNumeric(document.getElementById('food-serving-size').value, 1),
    servingUnit: document.getElementById('food-serving-unit').value || 'g',
    protein: getNumeric(document.getElementById('food-protein').value),
    carbs: getNumeric(document.getElementById('food-carbs').value),
    fat: getNumeric(document.getElementById('food-fat').value),
    fiber: getNumeric(document.getElementById('food-fiber').value),
    sugar: getNumeric(document.getElementById('food-sugar').value),
    sodium: getNumeric(document.getElementById('food-sodium').value)
  };

  const quantity = getNumeric(document.getElementById('consumed-quantity').value, 1);
  const consumedUnit = document.getElementById('consumed-unit').value;
  const mealType = document.getElementById('meal-type').value;
  const mult = calculateMultiplier({
    servingSize: food.servingSize,
    servingUnit: food.servingUnit,
    consumedQuantity: quantity,
    consumedUnit
  });

  const entry = {
    id: `meal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    foodName: food.productName,
    mealType,
    consumedAt: Date.now(),
    consumedQuantity: quantity,
    consumedUnit,
    totalCalories: Number((food.calories * mult).toFixed(1)),
    totalProtein: Number((food.protein * mult).toFixed(1)),
    totalCarbs: Number((food.carbs * mult).toFixed(1)),
    totalFat: Number((food.fat * mult).toFixed(1)),
    totalFiber: Number((food.fiber * mult).toFixed(1)),
    totalSodium: Number((food.sodium * mult).toFixed(1))
  };

  state.foodLogs.unshift(entry);
  state.currentFood = null;
  saveState();

  renderAll();
  resetScannerToCleanState(
    true,
    `Added ${entry.foodName} (${Math.round(entry.totalCalories)} kcal · ${Math.round(entry.totalProtein)}g protein) to Dashboard!`
  );
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderGreeting() {
  const banner = document.getElementById('greeting-banner');
  if (state.setupComplete && state.user.name) {
    banner.textContent = `Hello, ${state.user.name}`;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

function setMiniRing(ringId, current, target) {
  const ring = document.getElementById(ringId);
  if (!ring) return;
  const safeTarget = Math.max(1, Number(target || 1));
  const ratio = Math.min(1, Math.max(0, current / safeTarget));
  const offset = MINI_RING_CIRCUMFERENCE * (1 - ratio);
  ring.style.strokeDashoffset = offset.toFixed(2);
}

function setProgressBar(barId, labelId, current, target, unit) {
  const safeTarget = Math.max(1, Number(target || 1));
  const rawPct = Math.round((current / safeTarget) * 100);
  const clampedWidth = Math.min(100, Math.max(0, rawPct));
  document.getElementById(barId).style.width = `${clampedWidth}%`;
  document.getElementById(labelId).textContent = `${Math.round(current)} / ${Math.round(safeTarget)}${unit} (${rawPct}%)`;
}

function renderDashboard() {
  const todayList = getTodayEntries().sort((a, b) => b.consumedAt - a.consumedAt);
  const totals = sumNutrition(todayList);
  const goals = state.goals;

  document.getElementById('side-calories').textContent = `${Math.round(totals.calories)} / ${goals.dailyCalorieTarget} kcal`;
  document.getElementById('side-protein').textContent = `${Math.round(totals.protein)}g protein`;

  const emptyBox = document.getElementById('dashboard-empty-state');
  const activeBox = document.getElementById('dashboard-active-content');

  if (!todayList.length) {
    emptyBox.classList.remove('hidden');
    activeBox.classList.add('hidden');
    return;
  }

  emptyBox.classList.add('hidden');
  activeBox.classList.remove('hidden');

  const remCal = goals.dailyCalorieTarget - totals.calories;
  const remPro = goals.proteinTarget - totals.protein;
  const remFib = goals.fiberTarget - totals.fiber;
  const remSodium = (goals.sodiumLimit || 2300) - totals.sodium;

  setMiniRing('ring-calories', totals.calories, goals.dailyCalorieTarget);
  document.getElementById('calories-remaining').textContent =
    remCal >= 0 ? `${Math.round(remCal)} kcal left` : `${Math.abs(Math.round(remCal))} kcal over`;
  document.getElementById('today-calories').textContent = `${Math.round(totals.calories)} / ${goals.dailyCalorieTarget} kcal`;

  setMiniRing('ring-protein', totals.protein, goals.proteinTarget);
  document.getElementById('protein-remaining').textContent =
    remPro >= 0 ? `${Math.round(remPro)}g left` : `${Math.abs(Math.round(remPro))}g over`;
  document.getElementById('today-protein').textContent = `${Math.round(totals.protein)} / ${goals.proteinTarget}g protein`;

  setMiniRing('ring-fiber', totals.fiber, goals.fiberTarget);
  document.getElementById('fiber-remaining').textContent =
    remFib >= 0 ? `${Math.round(remFib)}g left` : `${Math.abs(Math.round(remFib))}g over`;
  document.getElementById('today-fiber').textContent = `${Math.round(totals.fiber)} / ${goals.fiberTarget}g fiber`;

  setMiniRing('ring-sodium', totals.sodium, goals.sodiumLimit || 2300);
  document.getElementById('sodium-remaining').textContent =
    remSodium >= 0 ? `${Math.round(remSodium)}mg left` : `${Math.abs(Math.round(remSodium))}mg over`;
  document.getElementById('today-sodium').textContent = `${Math.round(totals.sodium)} / ${goals.sodiumLimit || 2300}mg sodium`;

  setProgressBar('bar-calories', 'meter-cal-label', totals.calories, goals.dailyCalorieTarget, ' kcal');
  setProgressBar('bar-protein', 'meter-protein-label', totals.protein, goals.proteinTarget, 'g');
  setProgressBar('bar-fiber', 'meter-fiber-label', totals.fiber, goals.fiberTarget, 'g');
  setProgressBar('bar-carb', 'meter-carb-label', totals.carbs, goals.carbohydrateTarget, 'g');
  setProgressBar('bar-fat', 'meter-fat-label', totals.fat, goals.fatTarget, 'g');
  setProgressBar('bar-sodium', 'meter-sodium-label', totals.sodium, goals.sodiumLimit || 2300, 'mg');

  const listEl = document.getElementById('dashboard-log');
  listEl.innerHTML = todayList
    .map(
      (entry) => `
        <div class="entry-card">
          <div>
            <h4>${entry.foodName}</h4>
            <small>${capitalize(entry.mealType)} · ${entry.consumedQuantity} ${entry.consumedUnit} · ${Math.round(entry.totalProtein)}g protein · ${Math.round(entry.totalFiber)}g fiber · ${Math.round(entry.totalSodium || 0)}mg sodium</small>
          </div>
          <div class="entry-actions">
            <span class="kcal-badge">${Math.round(entry.totalCalories)} kcal</span>
            <button type="button" class="remove-btn" data-remove-id="${entry.id}">Remove</button>
          </div>
        </div>
      `
    )
    .join('');

  listEl.querySelectorAll('[data-remove-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.foodLogs = state.foodLogs.filter((item) => item.id !== btn.dataset.removeId);
      saveState();
      renderAll();
    });
  });
}

function renderHistory() {
  const container = document.getElementById('history-list');
  const allEntries = [...state.foodLogs].sort((a, b) => b.consumedAt - a.consumedAt);

  if (!allEntries.length) {
    container.innerHTML = `<p class="lead-copy" style="margin:0;">Your saved food archive will appear here after your first logged meal.</p>`;
    return;
  }

  container.innerHTML = allEntries
    .map(
      (entry) => `
        <div class="entry-card">
          <div>
            <h4>${entry.foodName}</h4>
            <small>${new Date(entry.consumedAt).toLocaleDateString()} · ${capitalize(entry.mealType)} (${entry.consumedQuantity} ${entry.consumedUnit})</small>
          </div>
          <div class="entry-actions">
            <span class="kcal-badge">${Math.round(entry.totalCalories)} kcal</span>
            <button type="button" class="btn-solid btn-sm" data-relog-id="${entry.id}">Log Again</button>
          </div>
        </div>
      `
    )
    .join('');

  container.querySelectorAll('[data-relog-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const orig = state.foodLogs.find((item) => item.id === btn.dataset.relogId);
      if (!orig) return;
      state.foodLogs.unshift({
        ...orig,
        id: `meal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        consumedAt: Date.now()
      });
      saveState();
      renderAll();
      setActiveView('dashboard-view');
    });
  });
}

/* Nutrition Coach (Gemini AI + Smart Offline Fallback) */
const FOOD_IDEAS = [
  { name: 'Greek Yogurt with Berries', calories: 200, protein: 20, carbs: 18, fat: 3, fiber: 4, sodium: 75, allergens: ['Dairy'], tags: ['balanced', 'low-calorie', 'snack'], reason: 'High protein, low sodium, and light on calories.' },
  { name: 'Grilled Chicken & Greens Bowl', calories: 320, protein: 34, carbs: 16, fat: 10, fiber: 6, sodium: 390, allergens: [], tags: ['balanced', 'high-protein'], reason: 'Lean protein and fiber keep you full for hours.' },
  { name: 'Lentil & Vegetable Soup', calories: 240, protein: 12, carbs: 32, fat: 5, fiber: 7, sodium: 420, allergens: [], tags: ['balanced', 'low-calorie'], reason: 'Warm, filling meal rich in dietary fiber.' },
  { name: 'Edamame & Tofu Grain Bowl', calories: 270, protein: 24, carbs: 20, fat: 11, fiber: 7, sodium: 340, allergens: ['Soy'], tags: ['balanced', 'high-protein'], reason: 'Plant-powered protein option to close your protein gap.' },
  { name: 'Berry Chia Protein Smoothie', calories: 230, protein: 26, carbs: 19, fat: 5, fiber: 6, sodium: 110, allergens: [], tags: ['high-protein', 'snack'], reason: 'Fast protein boost with steady fiber and low sodium.' },
  { name: 'Hummus & Sliced Carrots', calories: 165, protein: 6, carbs: 16, fat: 8, fiber: 6, sodium: 210, allergens: [], tags: ['snack', 'low-calorie'], reason: 'Crunchy, fiber-forward savory snack.' }
];

function renderCoach(filter = activeCoachFilter) {
  activeCoachFilter = filter;
  const totals = sumNutrition(getTodayEntries());
  const remCal = state.goals.dailyCalorieTarget - totals.calories;
  const remPro = state.goals.proteinTarget - totals.protein;
  const remSodium = (state.goals.sodiumLimit || 2300) - totals.sodium;
  const allergies = (state.user.allergies || []).map((a) => a.toLowerCase());

  const safeFoods = FOOD_IDEAS.filter(
    (item) => !item.allergens.some((a) => allergies.includes(a.toLowerCase()))
  );
  const matching = safeFoods.filter((item) => item.tags.includes(filter));
  const picks = (matching.length ? matching : safeFoods).slice(0, 4);

  const greetingName = state.user.name ? `${state.user.name}, y` : 'Y';
  document.getElementById('coach-response').innerHTML =
    remCal < 0
      ? `${greetingName}ou are <strong>${Math.abs(Math.round(remCal))} kcal</strong> over today’s calorie target. Stick to light, low-sodium options below if you get hungry later.`
      : `${greetingName}ou have <strong>${Math.round(remCal)} kcal</strong>, <strong>${Math.max(0, Math.round(remPro))}g protein</strong>, and <strong>${Math.max(0, Math.round(remSodium))}mg sodium</strong> remaining today. Tap <strong>Add</strong> on any meal below to log it directly:`;

  const container = document.getElementById('recommendations-list');
  container.innerHTML = picks
    .map(
      (item, index) => `
        <div class="entry-card">
          <div>
            <h4>${item.name}</h4>
            <small>${item.reason} (${item.calories} kcal · ${item.protein}g protein · ${item.fiber}g fiber · ${item.sodium}mg sodium)</small>
          </div>
          <button type="button" class="btn-gold btn-sm" data-pick-idx="${index}">Add</button>
        </div>
      `
    )
    .join('');

  container.querySelectorAll('[data-pick-idx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const chosen = picks[Number(btn.dataset.pickIdx)];
      if (!chosen) return;
      state.foodLogs.unshift({
        id: `meal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        foodName: chosen.name,
        mealType: filter === 'snack' ? 'snack' : 'dinner',
        consumedAt: Date.now(),
        consumedQuantity: 1,
        consumedUnit: 'serving',
        totalCalories: chosen.calories,
        totalProtein: chosen.protein,
        totalCarbs: chosen.carbs,
        totalFat: chosen.fat,
        totalFiber: chosen.fiber,
        totalSodium: chosen.sodium
      });
      saveState();
      renderAll();
      setActiveView('dashboard-view');
    });
  });
}

async function handleCoachAsk() {
  const input = document.getElementById('coach-input');
  const query = input.value.trim();
  if (!query) return;

  const totals = sumNutrition(getTodayEntries());
  const remCal = Math.max(0, Math.round(state.goals.dailyCalorieTarget - totals.calories));
  const remPro = Math.max(0, Math.round(state.goals.proteinTarget - totals.protein));
  const remFib = Math.max(0, Math.round(state.goals.fiberTarget - totals.fiber));
  const remSod = Math.max(0, Math.round((state.goals.sodiumLimit || 2300) - totals.sodium));
  const responseBox = document.getElementById('coach-response');

  input.value = '';
  const { localKey, workerUrl } = getAiCredentials();

  if (localKey || workerUrl) {
    responseBox.textContent = 'Thinking with Gemini Nutrition Coach...';
    const coachPrompt = `You are VitaCoach, a supportive, accurate nutrition coach.
Rules:
- Base your recommendation strictly on the user's remaining daily targets and allergies below.
- Never recommend any food containing their listed allergies.
- Keep the response concise (2-3 clear sentences) with practical food ideas and approximate protein/calorie fit.

User Profile:
- Name: ${state.user.name || 'Friend'}
- Goals: ${(state.user.goals || []).join(', ') || 'General wellness'}
- Allergies (STRICTLY EXCLUDE): ${(state.user.allergies || []).join(', ') || 'None'}
- Remaining Today: ${remCal} kcal, ${remPro}g protein, ${remFib}g dietary fiber, ${remSod}mg sodium

User Question: "${query}"`;

    try {
      const aiReply = await callGemini({ prompt: coachPrompt });
      if (aiReply) {
        responseBox.textContent = aiReply;
        return;
      }
    } catch (err) {
      console.error('Coach AI error:', err);
    }
  }

  const q = query.toLowerCase();
  let reply = `With <strong>${remCal} kcal</strong> and <strong>${remPro}g protein</strong> left today, pair a lean protein source with high-fiber vegetables and keep sodium under ${remSod}mg.`;

  if (q.includes('dinner')) {
    reply = `For dinner within <strong>${remCal} kcal</strong>, try a warm bowl with roasted vegetables and lean protein to close your <strong>${remPro}g protein</strong> gap.`;
  } else if (q.includes('breakfast') || q.includes('morning')) {
    reply = `For breakfast, aim for at least 20g of protein—such as Greek yogurt with berries or oats—to keep blood sugar steady all morning.`;
  } else if (q.includes('snack') || q.includes('hungry')) {
    reply = `For a smart snack under 250 kcal, try hummus with carrots or a berry chia smoothie—tap the <strong>Quick Snack</strong> filter below to add one.`;
  } else if (q.includes('protein')) {
    reply = `You still have <strong>${remPro}g of protein</strong> remaining today. Tap the <strong>High Protein</strong> filter below for options matched to your profile.`;
  } else if (q.includes('sodium') || q.includes('salt')) {
    reply = `You have logged <strong>${Math.round(totals.sodium)}mg</strong> out of your ${state.goals.sodiumLimit || 2300}mg daily sodium limit (${remSod}mg remaining).`;
  } else if (q.includes('fiber')) {
    reply = `You have <strong>${remFib}g of fiber</strong> left to hit your ${state.goals.fiberTarget}g goal. Lentils, berries, oats, and vegetables are your fastest boosts.`;
  }

  responseBox.innerHTML = reply;
}

function syncProfileInputs() {
  const u = state.user;
  document.getElementById('profile-name').value = u.name || '';
  document.getElementById('profile-age').value = u.age;
  document.getElementById('profile-sex').value = u.sex;
  document.getElementById('profile-height').value = u.height;
  document.getElementById('profile-weight').value = u.weight;
  document.getElementById('profile-activity').value = u.activity;

  document.querySelectorAll('input[name="goal"]').forEach((cb) => {
    cb.checked = (u.goals || []).includes(cb.value);
  });
  document.querySelectorAll('input[name="allergy"]').forEach((cb) => {
    cb.checked = (u.allergies || []).includes(cb.value);
  });
}

function handleSavePreferences(event) {
  event.preventDefault();

  state.user.name = document.getElementById('profile-name').value.trim();
  state.user.age = getNumeric(document.getElementById('profile-age').value, 26);
  state.user.sex = document.getElementById('profile-sex').value;
  state.user.height = getNumeric(document.getElementById('profile-height').value, 165);
  state.user.weight = getNumeric(document.getElementById('profile-weight').value, 62);
  state.user.activity = document.getElementById('profile-activity').value;
  state.user.goals = [...document.querySelectorAll('input[name="goal"]:checked')].map((cb) => cb.value);
  state.user.allergies = [...document.querySelectorAll('input[name="allergy"]:checked')].map((cb) => cb.value);

  state.goals = calculateTargets(state.user);
  state.setupComplete = true;
  saveState();
  renderAll();

  const msg = document.getElementById('profile-save-msg');
  msg.classList.remove('hidden');
  clearTimeout(window._saveMsgTimer);
  window._saveMsgTimer = setTimeout(() => {
    msg.classList.add('hidden');
  }, 3500);
}

function handleOnboardingSubmit(event) {
  event.preventDefault();
  state.user = {
    name: document.getElementById('onboarding-name').value.trim() || 'Friend',
    age: getNumeric(document.getElementById('onboarding-age').value, 26),
    sex: document.getElementById('onboarding-sex').value,
    height: getNumeric(document.getElementById('onboarding-height').value, 165),
    weight: getNumeric(document.getElementById('onboarding-weight').value, 62),
    activity: document.getElementById('onboarding-activity').value,
    goals: [...document.querySelectorAll('input[name="onboarding-goal"]:checked')].map((cb) => cb.value),
    allergies: [...document.querySelectorAll('input[name="onboarding-allergy"]:checked')].map((cb) => cb.value)
  };

  state.goals = calculateTargets(state.user);
  state.setupComplete = true;
  saveState();

  document.getElementById('onboarding-modal').classList.add('hidden');
  renderAll();

  if (typeof pendingActionAfterSetup === 'function') {
    const next = pendingActionAfterSetup;
    pendingActionAfterSetup = null;
    next();
  }
}

/* Laptop & Mobile Camera Stream + Capture Photo */
async function startCamera() {
  const video = document.getElementById('camera-feed');
  const previewImg = document.getElementById('captured-preview');
  const captureBtn = document.getElementById('capture-photo-btn');

  hideScanError();
  previewImg.classList.add('hidden');
  video.classList.remove('hidden');
  document.getElementById('reticle-overlay').classList.remove('hidden');

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showScanError(
      'Camera Unavailable',
      'Your browser does not allow camera access here. Use Upload Photo or type label values instead.'
    );
    return;
  }

  try {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
    }
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    video.srcObject = cameraStream;
    await video.play();
    captureBtn.classList.remove('hidden');
  } catch {
    showScanError(
      'Camera Permission Blocked',
      'Please allow camera access in your browser address bar, or use Upload Photo instead.'
    );
  }
}

function captureCameraFrame() {
  const video = document.getElementById('camera-feed');
  const canvas = document.getElementById('capture-canvas');
  const previewImg = document.getElementById('captured-preview');

  if (!video.videoWidth) {
    showScanError('Camera Not Ready', 'Wait a moment for the live camera preview to appear, then tap Capture Photo.');
    return;
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
  previewImg.src = dataUrl;
  previewImg.classList.remove('hidden');
  document.getElementById('reticle-overlay').classList.add('hidden');

  extractNutritionFromImage(dataUrl, 'Scanned Food');
}

function handlePhotoUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result;
    const previewImg = document.getElementById('captured-preview');
    previewImg.src = dataUrl;
    previewImg.classList.remove('hidden');
    document.getElementById('reticle-overlay').classList.add('hidden');

    const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    extractNutritionFromImage(dataUrl, capitalize(cleanName) || 'Uploaded Food');
  };
  reader.readAsDataURL(file);
}

function renderAll() {
  renderGreeting();
  syncProfileInputs();
  renderDashboard();
  renderHistory();
  renderCoach(activeCoachFilter);
}

function initEvents() {
  document.getElementById('open-drawer').addEventListener('click', openDrawer);
  document.getElementById('close-drawer').addEventListener('click', closeDrawer);
  document.getElementById('drawer-backdrop').addEventListener('click', closeDrawer);
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  document.querySelectorAll('.drawer-item').forEach((btn) => {
    btn.addEventListener('click', () => setActiveView(btn.dataset.target));
  });

  document.getElementById('enable-camera').addEventListener('click', () => {
    requireSetupThenRun(startCamera);
  });

  document.getElementById('capture-photo-btn').addEventListener('click', captureCameraFrame);

  document.getElementById('image-upload').addEventListener('change', (e) => {
    requireSetupThenRun(() => handlePhotoUpload(e));
  });

  document.getElementById('retry-scan-btn').addEventListener('click', () => {
    resetScannerToCleanState(false);
  });

  document.getElementById('try-sample-btn').addEventListener('click', () => {
    requireSetupThenRun(() => revealNutritionSection(SAMPLE_LABEL, 'Sample Label Loaded', false));
  });

  document.getElementById('manual-type-btn').addEventListener('click', () => {
    requireSetupThenRun(() => revealNutritionSection(SAMPLE_LABEL, 'Manual Label Entry', true));
  });

  document.getElementById('onboarding-form').addEventListener('submit', handleOnboardingSubmit);
  document.getElementById('scan-form').addEventListener('submit', handleLogSubmit);

  document.querySelectorAll('[data-portion]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-portion]').forEach((b) => b.classList.toggle('active', b === btn));
      document.getElementById('consumed-quantity').value = btn.dataset.portion;
      document.getElementById('consumed-unit').value = 'serving';
      updateLivePreview();
    });
  });

  ['food-name', 'food-calories', 'food-protein', 'food-carbs', 'food-fat', 'food-fiber', 'food-sodium', 'food-serving-size', 'food-serving-unit', 'consumed-quantity', 'consumed-unit'].forEach((id) => {
    document.getElementById(id).addEventListener('input', () => {
      if (id === 'food-name') {
        state.currentFood = { ...(state.currentFood || SAMPLE_LABEL), productName: document.getElementById('food-name').value };
        renderFactsSummary();
      }
      updateLivePreview();
    });
    document.getElementById(id).addEventListener('change', updateLivePreview);
  });

  document.getElementById('view-dash-btn').addEventListener('click', () => setActiveView('dashboard-view'));

  const goToScanner = () => {
    resetScannerToCleanState(false);
    setActiveView('scan-view');
  };
  document.getElementById('dash-scan-btn').addEventListener('click', goToScanner);
  document.getElementById('empty-dash-scan-btn').addEventListener('click', goToScanner);

  document.getElementById('send-coach').addEventListener('click', handleCoachAsk);
  document.getElementById('coach-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCoachAsk();
    }
  });

  document.querySelectorAll('[data-coach-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-coach-filter]').forEach((b) => b.classList.toggle('active', b === btn));
      renderCoach(btn.dataset.coachFilter);
    });
  });

  document.getElementById('settings-form').addEventListener('submit', handleSavePreferences);
}

applyTheme(localStorage.getItem(THEME_KEY) || 'day');
initEvents();
renderAll();