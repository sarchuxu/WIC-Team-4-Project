const STORAGE_KEY = 'vita-coach-state-v1';

const defaultGoals = {
  dailyCalorieTarget: 1800,
  proteinTarget: 110,
  carbohydrateTarget: 220,
  fatTarget: 65,
  fiberTarget: 28,
  sugarLimit: 50,
  sodiumLimit: 2300
};

const defaultUser = {
  name: 'Alicia',
  age: 29,
  sex: 'Female',
  height: 168,
  weight: 64,
  targetWeight: 61,
  activity: 'moderate',
  goals: ['Lose weight', 'Increase protein intake', 'Eat healthier'],
  dietaryPreferences: ['Mediterranean', 'High-protein'],
  allergies: ['Peanuts']
};

function getDefaultState() {
  const now = Date.now();
  return {
    onboardingComplete: false,
    user: { ...defaultUser },
    goals: { ...defaultGoals },
    foodLogs: [
      {
        id: 'log-1',
        foodName: 'Greek Yogurt Bowl',
        mealType: 'breakfast',
        consumedAt: now - 1000 * 60 * 60 * 2,
        consumedQuantity: 1,
        consumedUnit: 'serving',
        totalCalories: 260,
        totalProtein: 22,
        totalCarbs: 18,
        totalFat: 6,
        totalFiber: 4,
        totalSugar: 12,
        totalSodium: 90,
        source: 'manual'
      },
      {
        id: 'log-2',
        foodName: 'Grilled Chicken Salad',
        mealType: 'lunch',
        consumedAt: now - 1000 * 60 * 60 * 6,
        consumedQuantity: 1,
        consumedUnit: 'serving',
        totalCalories: 560,
        totalProtein: 38,
        totalCarbs: 26,
        totalFat: 19,
        totalFiber: 8,
        totalSugar: 6,
        totalSodium: 520,
        source: 'manual'
      }
    ],
    currentFood: null
  };
}

const state = loadState();

function loadState() {
  try {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!existing) return getDefaultState();
    return {
      ...getDefaultState(),
      ...existing,
      user: { ...defaultUser, ...(existing.user || {}) },
      goals: { ...defaultGoals, ...(existing.goals || {}) }
    };
  } catch (error) {
    return getDefaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setActiveView(targetId) {
  document.querySelectorAll('.nav-item, .mobile-item').forEach((button) => {
    const active = button.dataset.target === targetId;
    button.classList.toggle('active', active);
  });

  document.querySelectorAll('.view').forEach((view) => {
    view.classList.toggle('active', view.id === targetId);
  });
}

function openOnboarding() {
  document.getElementById('onboarding-modal').classList.remove('hidden');
}

function closeOnboarding() {
  document.getElementById('onboarding-modal').classList.add('hidden');
}

function getNumericValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function capitalize(value = '') {
  return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}

function getTodayEntries() {
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

  return state.foodLogs.filter((entry) => {
    const entryDate = new Date(entry.consumedAt).getTime();
    return entryDate >= todayStart;
  });
}

function calculateTotals(entries) {
  return entries.reduce(
    (totals, entry) => {
      totals.calories += Number(entry.totalCalories || 0);
      totals.protein += Number(entry.totalProtein || 0);
      totals.carbs += Number(entry.totalCarbs || 0);
      totals.fat += Number(entry.totalFat || 0);
      totals.fiber += Number(entry.totalFiber || 0);
      totals.sugar += Number(entry.totalSugar || 0);
      totals.sodium += Number(entry.totalSodium || 0);
      return totals;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 }
  );
}

function formatNumber(value, suffix = '') {
  return `${Math.round(value)}${suffix}`;
}

function renderSidebar() {
  const totals = calculateTotals(getTodayEntries());
  document.getElementById('side-calories').textContent = `${formatNumber(totals.calories, ' kcal')}`;
  document.getElementById('side-protein').textContent = `${formatNumber(totals.protein, 'g')}`;
}

function renderDashboard() {
  const totals = calculateTotals(getTodayEntries());
  const goals = state.goals;
  const remainingCalories = goals.dailyCalorieTarget - totals.calories;

  document.getElementById('today-calories').textContent = formatNumber(totals.calories, '');
  document.getElementById('calories-remaining').textContent =
    remainingCalories >= 0 ? `${formatNumber(remainingCalories)} kcal left` : `${formatNumber(Math.abs(remainingCalories))} kcal over`;

  document.getElementById('today-protein').textContent = `${formatNumber(totals.protein, 'g')}`;
  const proteinRemaining = goals.proteinTarget - totals.protein;
  document.getElementById('protein-remaining').textContent =
    proteinRemaining >= 0 ? `${formatNumber(proteinRemaining, 'g')} left` : `${formatNumber(Math.abs(proteinRemaining), 'g')} over`;

  document.getElementById('today-fiber').textContent = `${formatNumber(totals.fiber, 'g')}`;
  document.getElementById('fiber-goal').textContent = `goal ${goalText(goals.fiberTarget)}`;

  document.getElementById('daily-carbs').textContent = `${formatNumber(totals.carbs, 'g')}`;
  document.getElementById('daily-fat').textContent = `${formatNumber(totals.fat, 'g')}`;
  document.getElementById('daily-sugar').textContent = `${formatNumber(totals.sugar, 'g')}`;
  document.getElementById('daily-sodium').textContent = `${formatNumber(totals.sodium, 'mg')}`;

  const calorieProgress = Math.min(100, (totals.calories / goals.dailyCalorieTarget) * 100);
  const ring = document.getElementById('progress-ring');
  ring.style.background = `conic-gradient(var(--primary) 0 ${calorieProgress * 3.6}deg, #e6eedf ${calorieProgress * 3.6}deg 360deg)`;
  document.getElementById('ring-percent').textContent = `${Math.round(calorieProgress)}%`;

  const proteinProgress = Math.min(100, (totals.protein / goals.proteinTarget) * 100);
  const carbsProgress = Math.min(100, (totals.carbs / goals.carbohydrateTarget) * 100);
  const fatProgress = Math.min(100, (totals.fat / goals.fatTarget) * 100);

  document.getElementById('meter-protein').style.width = `${proteinProgress}%`;
  document.getElementById('meter-carb').style.width = `${carbsProgress}%`;
  document.getElementById('meter-fat').style.width = `${fatProgress}%`;

  document.getElementById('meter-protein-label').textContent = `${formatNumber(totals.protein, 'g')}/${formatNumber(goals.proteinTarget, 'g')}`;
  document.getElementById('meter-carb-label').textContent = `${formatNumber(totals.carbs, 'g')}/${formatNumber(goals.carbohydrateTarget, 'g')}`;
  document.getElementById('meter-fat-label').textContent = `${formatNumber(totals.fat, 'g')}/${formatNumber(goals.fatTarget, 'g')}`;

  const logContainer = document.getElementById('dashboard-log');
  const meals = ['breakfast', 'lunch', 'dinner', 'snack'];
  logContainer.innerHTML = meals
    .map((meal) => {
      const mealEntries = state.foodLogs.filter((entry) => entry.mealType === meal && isToday(entry.consumedAt));
      if (!mealEntries.length) return null;

      const total = calculateTotals(mealEntries);
      return `
        <div class="food-entry">
          <div class="food-entry-meta">
            <h4>${capitalize(meal)}</h4>
            <small>${mealEntries.length} item${mealEntries.length > 1 ? 's' : ''}</small>
          </div>
          <div class="pill">${formatNumber(total.calories)} kcal</div>
        </div>
      `;
    })
    .filter(Boolean)
    .join('') || '<p class="muted">No meals logged today yet.</p>';
}

function goalText(value) {
  return `${Math.round(value)}g`;
}

function isToday(timestamp) {
  const date = new Date(timestamp);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

function renderHistory() {
  const history = [...state.foodLogs].sort((a, b) => b.consumedAt - a.consumedAt);
  const container = document.getElementById('history-list');

  container.innerHTML = history
    .map(
      (entry) => `
        <div class="history-item">
          <div class="history-item-meta">
            <h4>${entry.foodName}</h4>
            <small>${new Date(entry.consumedAt).toLocaleString()} • ${capitalize(entry.mealType)}</small>
          </div>
          <div class="pill">${formatNumber(entry.totalCalories)} kcal</div>
        </div>
      `
    )
    .join('') || '<p class="muted">No food history yet.</p>';
}

function getRecommendationMode() {
  const activeButton = document.querySelector('.filter-chip.active');
  return activeButton ? activeButton.dataset.coachFilter : 'balanced';
}

function renderRecommendations(mode = getRecommendationMode()) {
  const totals = calculateTotals(getTodayEntries());
  const goals = state.goals;
  const remainingCalories = goals.dailyCalorieTarget - totals.calories;
  const proteinGap = goals.proteinTarget - totals.protein;

  let recommendations = [
    {
      name: 'Greek yogurt + berries',
      calories: remainingCalories > 250 ? 220 : 180,
      protein: 20,
      carbs: 18,
      fat: 3,
      fiber: 4,
      reason: 'High-protein, satisfying, and lightweight for the remaining calorie budget.'
    },
    {
      name: 'Grilled chicken salad',
      calories: remainingCalories > 350 ? 320 : 270,
      protein: 32,
      carbs: 18,
      fat: 10,
      fiber: 6,
      reason: 'Lean protein and fiber help you stay full without overloading on calories.'
    },
    {
      name: 'Veggie soup with quinoa',
      calories: 260,
      protein: 12,
      carbs: 30,
      fat: 6,
      fiber: 7,
      reason: 'A warm, balanced option that keeps fiber and hydration up.'
    },
    {
      name: 'Edamame and tofu bowl',
      calories: 260,
      protein: 24,
      carbs: 20,
      fat: 11,
      fiber: 7,
      reason: 'Excellent if your protein intake is below target and you want a plant-based option.'
    }
  ];

  if (mode === 'high-protein') {
    recommendations = [
      { name: 'Protein smoothie', calories: 220, protein: 28, carbs: 15, fat: 5, fiber: 3, reason: 'A quick protein boost that helps close your gap without large volume.' },
      { name: 'Chicken rice bowl', calories: 350, protein: 35, carbs: 28, fat: 8, fiber: 5, reason: 'Lean protein plus carbs to support recovery and satiety.' },
      { name: 'Egg and avocado toast', calories: 300, protein: 22, carbs: 20, fat: 12, fiber: 5, reason: 'A practical high-protein option with healthy fat and fiber.' },
      { name: 'Cottage cheese plate', calories: 240, protein: 26, carbs: 12, fat: 8, fiber: 2, reason: 'A fast protein option for a small, satisfying meal.' }
    ];
  }

  if (mode === 'low-calorie') {
    recommendations = [
      { name: 'Cucumber + tuna salad', calories: 180, protein: 24, carbs: 8, fat: 4, fiber: 4, reason: 'Very satisfying for a lower calorie budget.' },
      { name: 'Veggie soup cup', calories: 150, protein: 8, carbs: 18, fat: 3, fiber: 5, reason: 'A low-calorie, fiber-rich option for a lighter meal.' },
      { name: 'Berry yogurt bowl', calories: 170, protein: 17, carbs: 14, fat: 2, fiber: 5, reason: 'Light but protein-forward for appetite control.' },
      { name: 'Turkey lettuce wraps', calories: 210, protein: 22, carbs: 8, fat: 8, fiber: 3, reason: 'Lean protein and volume to help you stay full.' }
    ];
  }

  if (mode === 'snack') {
    recommendations = [
      { name: 'Apple + peanut butter', calories: 190, protein: 8, carbs: 18, fat: 10, fiber: 5, reason: 'A classic snack that balances carbs, fat, and fullness.' },
      { name: 'Trail mix cup', calories: 180, protein: 7, carbs: 16, fat: 9, fiber: 3, reason: 'Portable and easy when you need a fast option.' },
      { name: 'Hard-boiled eggs', calories: 140, protein: 12, carbs: 1, fat: 10, fiber: 0, reason: 'A simple protein-rich snack that is easy to digest.' },
      { name: 'Hummus + carrots', calories: 170, protein: 6, carbs: 15, fat: 8, fiber: 6, reason: 'Crunchy, fiber-forward, and easy to portion.' }
    ];
  }

  if (proteinGap > 15) {
    recommendations.unshift({
      name: 'Protein smoothie',
      calories: 220,
      protein: 28,
      carbs: 15,
      fat: 5,
      fiber: 3,
      reason: 'A quick protein boost that fits a busy schedule and helps close your gap.'
    });
  }

  if (remainingCalories <= 300) {
    recommendations[0].reason = 'This keeps your remaining budget in check while still supporting fullness and protein.';
  }

  const container = document.getElementById('recommendations-list');
  container.innerHTML = recommendations
    .slice(0, 4)
    .map(
      (item) => `
        <div class="recommendation-item">
          <div>
            <h4>${item.name}</h4>
            <small>${item.reason}</small>
          </div>
          <div class="nutrient-mini">
            <span>${item.calories} kcal</span>
            <span>${item.protein}P</span>
            <span>${item.carbs}C</span>
          </div>
        </div>
      `
    )
    .join('');

  const coachMessage = `You have ${Math.max(remainingCalories, 0)} calories remaining and ${Math.max(proteinGap, 0)}g of protein left to hit your goal. Focus on nutrient-dense foods that keep you full and balanced.`;
  document.getElementById('coach-response').innerHTML = `<strong>VitaCoach:</strong><br>${coachMessage}`;
}

function renderProfileForms() {
  const user = state.user;
  document.getElementById('welcome-name').textContent = user.name || 'Alicia';

  document.getElementById('profile-age').value = user.age || 29;
  document.getElementById('profile-weight').value = user.weight || 64;
  document.getElementById('profile-target-weight').value = user.targetWeight || 61;
  document.getElementById('profile-activity').value = user.activity || 'moderate';

  document.getElementById('onboarding-name').value = user.name || 'Alicia';
  document.getElementById('onboarding-age').value = user.age || 29;
  document.getElementById('onboarding-height').value = user.height || 168;
  document.getElementById('onboarding-weight').value = user.weight || 64;

  document.querySelectorAll('input[name="goal"]').forEach((checkbox) => {
    checkbox.checked = (user.goals || []).includes(checkbox.value);
  });

  document.querySelectorAll('input[name="diet"]').forEach((checkbox) => {
    checkbox.checked = (user.dietaryPreferences || []).includes(checkbox.value);
  });

  document.querySelectorAll('input[name="onboarding-goal"]').forEach((checkbox) => {
    checkbox.checked = (user.goals || []).includes(checkbox.value);
  });

  document.querySelectorAll('input[name="onboarding-diet"]').forEach((checkbox) => {
    checkbox.checked = (user.dietaryPreferences || []).includes(checkbox.value);
  });
}

function populateSampleLabel() {
  const sample = {
    productName: 'Protein Crunch Granola Bar',
    calories: 180,
    servingSize: 35,
    servingUnit: 'g',
    protein: 10,
    carbs: 18,
    fat: 7,
    fiber: 4,
    sugar: 6,
    sodium: 150
  };

  state.currentFood = sample;
  applyFoodToForm(sample);
  renderParsedFoodCard();
}

function applyFoodToForm(food) {
  document.getElementById('food-name').value = food.productName || 'Unknown product';
  document.getElementById('food-calories').value = food.calories || 0;
  document.getElementById('food-serving-size').value = food.servingSize || 1;
  document.getElementById('food-protein').value = food.protein || 0;
  document.getElementById('food-carbs').value = food.carbs || 0;
  document.getElementById('food-fat').value = food.fat || 0;
  document.getElementById('food-fiber').value = food.fiber || 0;
  document.getElementById('food-sugar').value = food.sugar || 0;
  document.getElementById('food-sodium').value = food.sodium || 0;
  document.getElementById('consumed-quantity').value = 1;
  document.getElementById('consumed-unit').value = 'serving';
}

function renderParsedFoodCard() {
  const card = document.getElementById('parsed-food-card');

  if (!state.currentFood) {
    card.classList.add('empty-state');
    card.innerHTML = '<p>Scan a nutrition label to populate the food details.</p>';
    return;
  }

  const item = state.currentFood;
  card.classList.remove('empty-state');
  card.innerHTML = `
    <div>
      <h4>${item.productName}</h4>
      <p>${item.servingSize} ${item.servingUnit || 'g'} serving • ${item.calories} kcal</p>
      <small>${item.protein}g protein • ${item.carbs}g carbs • ${item.fiber}g fiber</small>
    </div>
  `;
}

function calculateMultiplier({ servingSize, servingUnit, consumedQuantity, consumedUnit }) {
  const unitMap = { g: 1, oz: 28.35, cup: 240, serving: 1, piece: 1, ml: 1 };
  const servingFactor = unitMap[servingUnit] || 1;
  const consumedFactor = unitMap[consumedUnit] || 1;
  const servingAmount = Number(servingSize || 1) * servingFactor;
  const consumedAmount = Number(consumedQuantity || 1) * consumedFactor;
  return servingAmount ? consumedAmount / servingAmount : 1;
}

function handleScanSubmit(event) {
  event.preventDefault();

  const scannedFood = {
    productName: document.getElementById('food-name').value || 'Custom food',
    calories: getNumericValue(document.getElementById('food-calories').value),
    servingSize: getNumericValue(document.getElementById('food-serving-size').value),
    servingUnit: 'g',
    protein: getNumericValue(document.getElementById('food-protein').value),
    carbs: getNumericValue(document.getElementById('food-carbs').value),
    fat: getNumericValue(document.getElementById('food-fat').value),
    fiber: getNumericValue(document.getElementById('food-fiber').value),
    sugar: getNumericValue(document.getElementById('food-sugar').value),
    sodium: getNumericValue(document.getElementById('food-sodium').value)
  };

  const quantity = getNumericValue(document.getElementById('consumed-quantity').value, 1);
  const consumedUnit = document.getElementById('consumed-unit').value;
  const mealType = document.getElementById('meal-type').value;

  const multiplier = calculateMultiplier({
    servingSize: scannedFood.servingSize,
    servingUnit: scannedFood.servingUnit,
    consumedQuantity: quantity,
    consumedUnit
  });

  const entry = {
    id: `log-${Date.now()}`,
    foodName: scannedFood.productName,
    mealType,
    consumedAt: Date.now(),
    consumedQuantity: quantity,
    consumedUnit,
    totalCalories: Number((scannedFood.calories * multiplier).toFixed(1)),
    totalProtein: Number((scannedFood.protein * multiplier).toFixed(1)),
    totalCarbs: Number((scannedFood.carbs * multiplier).toFixed(1)),
    totalFat: Number((scannedFood.fat * multiplier).toFixed(1)),
    totalFiber: Number((scannedFood.fiber * multiplier).toFixed(1)),
    totalSugar: Number((scannedFood.sugar * multiplier).toFixed(1)),
    totalSodium: Number((scannedFood.sodium * multiplier).toFixed(1)),
    source: 'camera'
  };

  state.foodLogs.unshift(entry);
  state.currentFood = scannedFood;
  saveState();
  renderAll();
}

function handleOnboardingSubmit(event) {
  event.preventDefault();

  const name = document.getElementById('onboarding-name').value || 'Alicia';
  const age = getNumericValue(document.getElementById('onboarding-age').value, 29);
  const height = getNumericValue(document.getElementById('onboarding-height').value, 168);
  const weight = getNumericValue(document.getElementById('onboarding-weight').value, 64);
  const targetWeight = weight - 3;

  const goals = [...document.querySelectorAll('input[name="onboarding-goal"]:checked')].map((box) => box.value);
  const diets = [...document.querySelectorAll('input[name="onboarding-diet"]:checked')].map((box) => box.value);

  state.user = {
    ...state.user,
    name,
    age,
    height,
    weight,
    targetWeight,
    goals,
    dietaryPreferences: diets
  };

  const calorieTarget = Math.round(weight * 28);
  state.goals = {
    ...defaultGoals,
    dailyCalorieTarget: calorieTarget,
    proteinTarget: Math.max(90, Math.round(weight * 1.8)),
    carbohydrateTarget: Math.round(weight * 3.1),
    fatTarget: Math.round(weight * 0.9),
    fiberTarget: 28,
    sugarLimit: 50,
    sodiumLimit: 2300
  };

  state.onboardingComplete = true;
  saveState();
  closeOnboarding();
  renderAll();
}

function setDemoProfile() {
  state.user = { ...defaultUser };
  state.goals = { ...defaultGoals };
  state.onboardingComplete = true;
  saveState();
  closeOnboarding();
  renderAll();
}

function handleSettingsSubmit(event) {
  event.preventDefault();

  const age = getNumericValue(document.getElementById('profile-age').value, state.user.age || 29);
  const weight = getNumericValue(document.getElementById('profile-weight').value, state.user.weight || 64);
  const targetWeight = getNumericValue(document.getElementById('profile-target-weight').value, state.user.targetWeight || 61);
  const activity = document.getElementById('profile-activity').value;
  const selectedGoals = [...document.querySelectorAll('input[name="goal"]:checked')].map((box) => box.value);
  const selectedDiets = [...document.querySelectorAll('input[name="diet"]:checked')].map((box) => box.value);

  state.user.age = age;
  state.user.weight = weight;
  state.user.targetWeight = targetWeight;
  state.user.activity = activity;
  state.user.goals = selectedGoals.length ? selectedGoals : state.user.goals;
  state.user.dietaryPreferences = selectedDiets.length ? selectedDiets : state.user.dietaryPreferences;

  state.goals = {
    ...state.goals,
    dailyCalorieTarget: Math.max(1500, Math.round(weight * 28)),
    proteinTarget: Math.max(90, Math.round(weight * 1.8)),
    carbohydrateTarget: Math.round(weight * 3.1),
    fatTarget: Math.round(weight * 0.9)
  };

  saveState();
  renderAll();
}

function handleCoachPrompt() {
  const userQuery = document.getElementById('coach-input').value.trim();
  if (!userQuery) return;

  let response = 'Based on your current intake, a balanced adjustment would be to add a lean protein, a fiber-rich vegetable, and a light carbohydrate instead of a highly processed snack.';

  const lower = userQuery.toLowerCase();
  if (lower.includes('dinner')) {
    response = 'For dinner, try a grain bowl with grilled chicken, greens, roasted vegetables, and a light vinaigrette. This keeps your calories controlled while helping you hit protein and fiber goals.';
  } else if (lower.includes('protein')) {
    const gap = Math.max(0, state.goals.proteinTarget - calculateTotals(getTodayEntries()).protein);
    response = `You still need about ${Math.round(gap)}g of protein to reach today’s goal. Greek yogurt, eggs, tofu, chicken, and edamame are strong options that match a balanced plan.`;
  } else if (lower.includes('fiber')) {
    const fiber = calculateTotals(getTodayEntries()).fiber;
    response = `You are at ${Math.round(fiber)}g of fiber today. A good next step is to add legumes, berries, or vegetables to get closer to your target without feeling overly full.`;
  } else if (lower.includes('300')) {
    response = 'With only about 300 calories remaining, lean toward a protein-forward meal like grilled chicken and vegetables or a yogurt bowl with berries to stay satisfied and balanced.';
  } else if (lower.includes('dessert')) {
    response = 'A lighter dessert could be Greek yogurt with cinnamon and berries or a small bowl of fruit with a few nuts. That gives you sweetness without blowing your calorie budget.';
  }

  document.getElementById('coach-response').innerHTML = `<strong>VitaCoach:</strong><br>${response}`;
  document.getElementById('coach-input').value = '';
}

async function requestCameraAccess() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    document.getElementById('parsed-food-card').innerHTML = '<p>Camera API is unavailable in this browser. Please upload an image or enter the nutrition data manually.</p>';
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });
    const video = document.getElementById('camera-feed');
    video.srcObject = stream;
    document.getElementById('parsed-food-card').innerHTML = '<p>Camera active. Point at a nutrition label and capture the frame.</p>';
  } catch (error) {
    document.getElementById('parsed-food-card').innerHTML = '<p>Camera access was denied. You can still upload a photo or manually enter food details.</p>';
  }
}

function handleImageUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById('parsed-food-card').innerHTML = `<p>Image uploaded: ${file.name}</p><small>OCR can be connected to a vision model in production. For this demo, the sample nutrition label is preloaded.</small>`;
  };
  reader.readAsDataURL(file);
}

function renderAll() {
  renderProfileForms();
  renderSidebar();
  renderDashboard();
  renderHistory();
  renderRecommendations();
  renderParsedFoodCard();
  setActiveView('scan-view');
}

function initializeEvents() {
  document.querySelectorAll('.nav-item, .mobile-item').forEach((button) => {
    button.addEventListener('click', () => setActiveView(button.dataset.target));
  });

  document.getElementById('open-onboarding').addEventListener('click', openOnboarding);
  document.getElementById('skip-onboarding').addEventListener('click', setDemoProfile);
  document.getElementById('onboarding-form').addEventListener('submit', handleOnboardingSubmit);
  document.getElementById('settings-form').addEventListener('submit', handleSettingsSubmit);
  document.getElementById('scan-form').addEventListener('submit', handleScanSubmit);
  document.getElementById('send-coach').addEventListener('click', handleCoachPrompt);
  document.getElementById('coach-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') handleCoachPrompt();
  });
  document.getElementById('scan-sample').addEventListener('click', populateSampleLabel);
  document.getElementById('manual-entry').addEventListener('click', handleScanSubmit);
  document.getElementById('enable-camera').addEventListener('click', requestCameraAccess);
  document.getElementById('image-upload').addEventListener('change', handleImageUpload);

  document.querySelectorAll('.filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach((item) => {
        item.classList.toggle('active', item === chip);
      });
      renderRecommendations(chip.dataset.coachFilter);
    });
  });
}

function bootstrap() {
  initializeEvents();
  if (!state.onboardingComplete) {
    openOnboarding();
  }
  renderAll();
}

bootstrap();
