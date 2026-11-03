/**
 * NEKRONIUM CLIENT PORTAL & LICENSE MANAGER
 * Client-side Controller & LocalStorage State Engine
 */

// State Storage Keys
const STORAGE_KEYS = {
  USERS: 'nekronium_users_db',
  CURRENT_USER: 'nekronium_session_user',
  NEXT_UID: 'nekronium_next_uid',
  CONFIG: 'nekronium_config_v2'
};

// Cloudflare Worker API URL (Connected to D1 Database)
const API_BASE = 'https://nekronium-db.easyhubapi.workers.dev';

// Global State
let appConfig = null;
let appUsers = [];
let currentUser = null;
let activeAuthMode = 'login';
let selectedProductTiers = {}; // { productId: tierKey }
let countdownInterval = null;
let activeAdminSubtab = 'users';

// Default Built-in Products (Bulletproof fallback)
const FALLBACK_PRODUCTS = [
  {
    id: "nekronium-sif",
    name: "Nekronium SIF",
    game: "Sky In Flames",
    status: "Undetected",
    features: [
      "Visuals: Box ESP, Icon ESP, WallHack",
      "Обход сигнатурных проверок и античитов"
    ],
    tiers: [
      { key: "7", label: "7 дней", price: 399, days: 7 },
      { key: "30", label: "30 дней", price: 890, days: 30 },
      { key: "lifetime", label: "Навсегда (Lifetime)", price: 1490, days: 36500 }
    ]
  },
  {
    id: "spoofer-hwid",
    name: "👻 SPOOFER",
    game: "HWID UNBAN & PROTECTION",
    status: "Undetected",
    features: [
      "Полный обход блокировок по железу (HWID)",
      "Смена серийных номеров SSD / HDD, BIOS, Motherboard, MAC",
      "Работает без переустановки Windows"
    ],
    tiers: [
      { key: "lifetime", label: "Навсегда (Lifetime)", price: 499, days: 36500 }
    ]
  },
  {
    id: "guide-bypass",
    name: "ГАЙД НА ОБХОД БАНА (БЕЗ ПОКУПКИ ИГРЫ)",
    game: "EXCLUSIVE MANUAL",
    status: "Working",
    features: [
      "Пошаговая методика 100% снятия банов",
      "Обход без необходимости повторно покупать игру",
      "Пожизненный доступ к гайду и обновлениям"
    ],
    tiers: [
      { key: "lifetime", label: "Полный доступ (Навсегда)", price: 990, days: 36500 }
    ]
  }
];

// Initialize System (Runs immediately if DOM is already ready)
function startApp() {
  initConfig();
  initStorage();
  renderProducts();
  checkSession();
  startGlobalTimer();
  syncWithServer();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}

/* -------------------------------------------------------------
   Configuration Engine (Loads from config.js / localStorage)
------------------------------------------------------------- */
function initConfig() {
  const defaultCfg = (typeof NEKRONIUM_DEFAULT_CONFIG !== 'undefined' ? NEKRONIUM_DEFAULT_CONFIG : (typeof window !== 'undefined' && window.NEKRONIUM_DEFAULT_CONFIG)) || {
    system: { brandName: 'NEKRONIUM', currency: '₽', loaderName: 'NekroniumLoader.exe' },
    products: FALLBACK_PRODUCTS
  };

  const storedConfig = localStorage.getItem(STORAGE_KEYS.CONFIG);
  if (storedConfig) {
    try {
      appConfig = JSON.parse(storedConfig);
      if (!appConfig.products || appConfig.products.length === 0) {
        appConfig.products = FALLBACK_PRODUCTS;
      }
    } catch (e) {
      console.error('Failed to parse stored config, fallback to default', e);
      appConfig = JSON.parse(JSON.stringify(defaultCfg));
    }
  } else {
    appConfig = JSON.parse(JSON.stringify(defaultCfg));
    if (!appConfig.products || appConfig.products.length === 0) {
      appConfig.products = FALLBACK_PRODUCTS;
    }
  }
}

function saveConfigToStorage() {
  localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(appConfig));
}

/* -------------------------------------------------------------
   Storage & Seed Data
------------------------------------------------------------- */
function initStorage() {
  // Clear any legacy test data from older versions
  const legacyKeys = [
    'nekronium_config_db',
    'nexus_users_db', 'nexus_v2_users_db', 'nexus_v3_users_db',
    'nexus_session_user', 'nexus_v2_session_user', 'nexus_v3_session_user',
    'nexus_next_uid', 'nexus_v2_next_uid', 'nexus_v3_next_uid'
  ];
  legacyKeys.forEach(k => localStorage.removeItem(k));

  const storedUsers = localStorage.getItem(STORAGE_KEYS.USERS);
  if (!storedUsers) {
    // Default admin: sanchek / sanchek (UID #1, 0 balance)
    const defaultUsers = [
      {
        uid: 1,
        username: 'sanchek',
        password: 'sanchek',
        role: 'admin',
        balance: 0,
        licenseKey: 'NEKRONIUM-ADM1-0001-K8F2',
        hwid: null,
        lastHwidReset: null,
        subscription: null
      }
    ];
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(defaultUsers));
    localStorage.setItem(STORAGE_KEYS.NEXT_UID, '2');
    appUsers = defaultUsers;
  } else {
    try {
      appUsers = JSON.parse(storedUsers);
    } catch (e) {
      appUsers = [];
    }
  }
}

function saveUsersToStorage(userToSave = null) {
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(appUsers));
  const target = userToSave || currentUser;
  if (target) {
    fetch(`${API_BASE}/api/user/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(target)
    }).catch(() => {});
  }
}

async function syncWithServer() {
  try {
    const res = await fetch(`${API_BASE}/api/users`);
    if (res.ok) {
      const data = await res.json();
      if (data.users && Array.isArray(data.users)) {
        appUsers = data.users;
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(appUsers));
        if (currentUser) {
          const fresh = appUsers.find(u => u.uid === currentUser.uid);
          if (fresh) currentUser = fresh;
        }
        updateNavAuth();
        updateDashboardView();
        if (document.getElementById('tab-admin')?.classList.contains('active')) {
          renderAdminTable();
        }
      }
    }
  } catch (err) {}
}

function checkSession() {
  const sessionUid = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
  if (sessionUid) {
    const found = appUsers.find(u => u.uid === Number(sessionUid));
    if (found) {
      currentUser = found;
    }
  }
  updateNavAuth();
  updateDashboardView();
}

/* -------------------------------------------------------------
   Navigation & Tab Routing
------------------------------------------------------------- */
function switchTab(tabId) {
  // If user tries to open admin tab without admin role
  if (tabId === 'admin' && (!currentUser || currentUser.role !== 'admin')) {
    showToast('Доступ запрещен. Требуются права Администратора.', 'error');
    return;
  }

  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

  const targetPane = document.getElementById(`tab-${tabId}`);
  if (targetPane) targetPane.classList.add('active');

  const navBtn = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  if (navBtn) navBtn.classList.add('active');

  if (tabId === 'admin') {
    renderAdminTable();
    renderConfigEditor();
  } else if (tabId === 'dashboard') {
    updateDashboardView();
  }
}

function updateNavAuth() {
  const navAuthArea = document.getElementById('navAuthArea');
  const navAdminBtn = document.getElementById('navAdminBtn');

  if (currentUser) {
    const roleInfo = getUserDisplayRole(currentUser);
    navAuthArea.innerHTML = `
      <div class="user-nav-badge">
        <span class="nav-uid">UID: #${currentUser.uid}</span>
        <span class="badge badge-role ${roleInfo.badgeClass}" style="padding: 2px 7px; font-size: 0.7rem; letter-spacing: 0.5px;">${roleInfo.label}</span>
        <span class="nav-bal">${currentUser.balance.toFixed(2)} ₽</span>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="logoutUser()">Выйти</button>
    `;

    // Secret Admin Button
    if (currentUser.role === 'admin') {
      navAdminBtn.style.display = 'inline-flex';
    } else {
      navAdminBtn.style.display = 'none';
    }
  } else {
    navAdminBtn.style.display = 'none';
    navAuthArea.innerHTML = `
      <button class="btn btn-secondary btn-sm" onclick="openAuthModal('login')">Войти</button>
      <button class="btn btn-primary btn-sm" onclick="openAuthModal('register')">Регистрация</button>
    `;
  }
}

/* -------------------------------------------------------------
   Catalog / Products Rendering (Uses appConfig.products)
------------------------------------------------------------- */
function renderProducts() {
  const grid = document.getElementById('productsGrid');
  if (!grid || !appConfig || !appConfig.products) return;

  grid.innerHTML = appConfig.products.map(prod => {
    if (!selectedProductTiers[prod.id] && prod.tiers && prod.tiers.length > 0) {
      selectedProductTiers[prod.id] = prod.tiers[0].key;
    }

    const currentSelectedTierKey = selectedProductTiers[prod.id];
    const currentTier = prod.tiers.find(t => t.key === currentSelectedTierKey) || prod.tiers[0];

    const pricingButtons = prod.tiers.map(tier => {
      const isSelected = tier.key === currentSelectedTierKey;
      return `
        <button type="button" class="tier-btn ${isSelected ? 'selected' : ''}" 
                onclick="selectTier('${prod.id}', '${tier.key}')">
          ${tier.label}
          <span class="tier-price">${tier.price} ₽</span>
        </button>
      `;
    }).join('');

    const gridClass = prod.tiers.length === 1 ? 'pricing-options single-tier' : 'pricing-options';

    return `
      <div class="product-card" id="card-${prod.id}">
        <div>
          <div class="product-top">
            <div>
              <span class="product-game-tag">${prod.game}</span>
              <h3 class="product-name">${prod.name}</h3>
            </div>
            <span class="badge badge-success"><span class="pulse-indicator"></span> ${prod.status}</span>
          </div>

          <ul class="features-list">
            ${prod.features.map(f => `<li>${f}</li>`).join('')}
          </ul>
        </div>

        <div>
          <div class="${gridClass}">
            ${pricingButtons}
          </div>

          <button class="btn btn-primary btn-block" onclick="purchaseProduct('${prod.id}')">
            Купить (${currentTier ? currentTier.price : 0} ₽)
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function selectTier(productId, tierKey) {
  selectedProductTiers[productId] = tierKey;
  renderProducts();
}

function purchaseProduct(productId) {
  if (!currentUser) {
    openAuthModal('login');
    showToast('Пожалуйста, авторизуйтесь для покупки товара', 'info');
    return;
  }

  const product = appConfig.products.find(p => p.id === productId);
  if (!product) return;

  const selectedTierKey = selectedProductTiers[productId] || product.tiers[0].key;
  const tier = product.tiers.find(t => t.key === selectedTierKey) || product.tiers[0];
  const cost = tier.price;

  if (currentUser.balance < cost) {
    showToast(`Недостаточно средств (${currentUser.balance.toFixed(2)} ₽). Пополните баланс на ${(cost - currentUser.balance).toFixed(2)} ₽`, 'error');
    openTopUpModal();
    return;
  }

  // Deduct balance
  currentUser.balance -= cost;

  // Add or extend subscription
  const isLifetime = tier.key === 'lifetime';
  const durationMs = tier.days * 24 * 3600 * 1000;
  let newExpiresAt = Date.now() + durationMs;

  if (currentUser.subscription && currentUser.subscription.expiresAt > Date.now() && !currentUser.subscription.isLifetime) {
    newExpiresAt = currentUser.subscription.expiresAt + durationMs;
  }

  currentUser.subscription = {
    productId: product.id,
    productName: product.name,
    tierLabel: tier.label,
    isLifetime: isLifetime,
    expiresAt: newExpiresAt,
    isFrozen: false,
    remainingSeconds: Math.floor((newExpiresAt - Date.now()) / 1000)
  };

  saveUsersToStorage();
  updateNavAuth();
  updateDashboardView();
  showToast(`Успешно приобретено: "${product.name}" (${tier.label})!`, 'success');
  switchTab('dashboard');
}

/* -------------------------------------------------------------
   Authentication Logic
------------------------------------------------------------- */
function openAuthModal(mode = 'login') {
  switchAuthMode(mode);
  document.getElementById('authModal').classList.add('open');
}

function closeAuthModal() {
  document.getElementById('authModal').classList.remove('open');
  clearAuthNotice();
}

function switchAuthMode(mode) {
  activeAuthMode = mode;
  const tabLogin = document.getElementById('modalTabLogin');
  const tabReg = document.getElementById('modalTabRegister');
  const submitBtn = document.getElementById('authSubmitBtn');

  if (mode === 'login') {
    tabLogin.classList.add('active');
    tabReg.classList.remove('active');
    submitBtn.textContent = 'Войти в аккаунт';
  } else {
    tabLogin.classList.remove('active');
    tabReg.classList.add('active');
    submitBtn.textContent = 'Создать аккаунт (Получить UID)';
  }
  clearAuthNotice();
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const username = document.getElementById('authUsername').value.trim();
  const password = document.getElementById('authPassword').value.trim();

  if (!username || !password) {
    setAuthNotice('Заполните все поля формы', 'error');
    return;
  }

  const submitBtn = document.getElementById('authSubmitBtn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Обработка...';
  }

  try {
    if (activeAuthMode === 'login') {
      let user = appUsers.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
      
      // If not in local cache, try to sync from Cloudflare D1
      if (!user) {
        await syncWithServer();
        user = appUsers.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
      }

      if (!user) {
        setAuthNotice('Неверный логин или пароль', 'error');
        return;
      }

      currentUser = user;
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, user.uid);
      closeAuthModal();
      updateNavAuth();
      updateDashboardView();
      showToast(`Добро пожаловать, ${user.username}! (UID #${user.uid})`, 'success');
    } else {
      // Register directly in Cloudflare D1 via Worker
      let newUid = null;
      try {
        const res = await fetch(`${API_BASE}/api/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok || data.error) {
          setAuthNotice(data.error || 'Ошибка при регистрации', 'error');
          return;
        }

        if (data.user && data.user.uid) {
          newUid = data.user.uid;
        }
      } catch (e) {
        console.warn('Worker register failed, fallback to local:', e);
      }

      if (!newUid) {
        let nextUid = Number(localStorage.getItem(STORAGE_KEYS.NEXT_UID) || 2);
        newUid = nextUid;
        localStorage.setItem(STORAGE_KEYS.NEXT_UID, String(nextUid + 1));
      }

      const randomKey = 'NEKRONIUM-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' +
                        Math.random().toString(36).substring(2, 6).toUpperCase() + '-' +
                        Math.random().toString(36).substring(2, 6).toUpperCase();

      const newUser = {
        uid: newUid,
        username: username,
        password: password,
        role: 'user',
        balance: 0,
        licenseKey: randomKey,
        hwid: null,
        lastHwidReset: null,
        subscription: null
      };

      const existingIndex = appUsers.findIndex(u => u.uid === newUser.uid);
      if (existingIndex >= 0) {
        appUsers[existingIndex] = newUser;
      } else {
        appUsers.push(newUser);
      }

      saveUsersToStorage(newUser);

      currentUser = newUser;
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, newUser.uid);

      closeAuthModal();
      updateNavAuth();
      updateDashboardView();
      showToast(`Аккаунт успешно создан! Ваш UID: #${newUser.uid}`, 'success');
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = activeAuthMode === 'login' ? 'Войти в аккаунт' : 'Создать аккаунт (получить UID)';
    }
  }
}

function logoutUser() {
  currentUser = null;
  localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
  updateNavAuth();
  updateDashboardView();
  showToast('Вы вышли из системы', 'info');
  switchTab('store');
}

function setAuthNotice(msg, type) {
  const notice = document.getElementById('authNotice');
  notice.textContent = msg;
  notice.className = `auth-notice ${type}`;
  notice.style.display = 'block';
}

function clearAuthNotice() {
  const notice = document.getElementById('authNotice');
  notice.style.display = 'none';
  notice.textContent = '';
}

/* -------------------------------------------------------------
   User Display Role Helper (ADMIN / CUSTOMER / USER)
   Если есть активная подписка или баланс >= 100 -> CUSTOMER
------------------------------------------------------------- */
function getUserDisplayRole(user) {
  if (!user) return { label: 'USER', badgeClass: '' };
  if (user.role === 'admin') {
    return { label: 'ADMIN', badgeClass: 'admin' };
  }

  const hasSub = Boolean(user.subscription && (
    user.subscription.isLifetime ||
    (user.subscription.expiresAt && user.subscription.expiresAt > Date.now()) ||
    user.subscription.isFrozen
  ));
  const hasBalance = (Number(user.balance) || 0) >= 100;

  if (hasSub || hasBalance) {
    return { label: 'CUSTOMER', badgeClass: 'customer' };
  }

  return { label: 'USER', badgeClass: '' };
}

/* -------------------------------------------------------------
   Client Dashboard View & Freeze System
------------------------------------------------------------- */
function updateDashboardView() {
  const authPrompt = document.getElementById('dashboardAuthPrompt');
  const content = document.getElementById('dashboardContent');

  if (!currentUser) {
    authPrompt.style.display = 'block';
    content.style.display = 'none';
    return;
  }

  authPrompt.style.display = 'none';
  content.style.display = 'flex';

  // Profile Header
  document.getElementById('userAvatarLetter').textContent = currentUser.username.charAt(0).toUpperCase();
  document.getElementById('profileUsername').textContent = currentUser.username;
  document.getElementById('profileUid').textContent = `UID: #${currentUser.uid}`;
  document.getElementById('profileBalance').textContent = `${currentUser.balance.toFixed(2)} ₽`;

  const displayRole = getUserDisplayRole(currentUser);
  const roleBadge = document.getElementById('profileRole');
  roleBadge.textContent = displayRole.label;
  roleBadge.className = `badge badge-role ${displayRole.badgeClass}`.trim();

  // Subscription Details
  renderSubscriptionCard();
}

function renderSubscriptionCard() {
  const badge = document.getElementById('subStatusBadge');
  const prodName = document.getElementById('subProductName');
  const timer = document.getElementById('subTimeRemaining');
  const expiresAt = document.getElementById('subExpiresAt');
  const freezeState = document.getElementById('subFreezeState');
  const freezeBtn = document.getElementById('freezeToggleBtn');

  if (!currentUser.subscription) {
    badge.className = 'badge badge-inactive';
    badge.textContent = 'НЕТ ПОДПИСКИ';
    prodName.textContent = '—';
    timer.textContent = '—';
    expiresAt.textContent = '—';
    freezeState.textContent = 'Не активна';
    freezeBtn.disabled = true;
    freezeBtn.innerHTML = '❄️ Заморозить подписку';
    return;
  }

  const sub = currentUser.subscription;
  const now = Date.now();

  prodName.textContent = `${sub.productName} (${sub.tierLabel || 'Тариф'})`;

  if (sub.isLifetime) {
    badge.className = 'badge badge-success';
    badge.textContent = 'LIFETIME';
    timer.textContent = '∞ НАВСЕГДА';
    expiresAt.textContent = 'Бессрочно (Навсегда)';
    freezeState.textContent = 'Заморозка не требуется';
    freezeBtn.disabled = true;
    freezeBtn.className = 'btn btn-secondary';
    freezeBtn.innerHTML = '♾️ Бессрочная лицензия';
    return;
  }

  if (sub.isFrozen) {
    badge.className = 'badge badge-warning';
    badge.textContent = 'ЗАМОРОЖЕНА';
    timer.textContent = formatRemainingTime(sub.remainingSeconds);
    expiresAt.textContent = 'На паузе (заморожено)';
    freezeState.innerHTML = '<span style="color: #fbbf24;">❄️ Активна заморозка</span>';
    freezeBtn.disabled = false;
    freezeBtn.className = 'btn btn-primary';
    freezeBtn.innerHTML = '☀️ Разморозить подписку';
  } else if (sub.expiresAt > now) {
    badge.className = 'badge badge-success';
    badge.textContent = 'АКТИВНА';
    const secondsLeft = Math.floor((sub.expiresAt - now) / 1000);
    timer.textContent = formatRemainingTime(secondsLeft);
    expiresAt.textContent = new Date(sub.expiresAt).toLocaleString('ru-RU');
    freezeState.textContent = 'Работает штатно';
    freezeBtn.disabled = false;
    freezeBtn.className = 'btn btn-warning';
    freezeBtn.innerHTML = '❄️ Заморозить подписку';
  } else {
    badge.className = 'badge badge-inactive';
    badge.textContent = 'ИСТЕКЛА';
    timer.textContent = '00д 00:00:00';
    expiresAt.textContent = new Date(sub.expiresAt).toLocaleString('ru-RU');
    freezeState.textContent = 'Истек срок действия';
    freezeBtn.disabled = true;
    freezeBtn.className = 'btn btn-warning';
    freezeBtn.innerHTML = '❄️ Заморозить подписку';
  }
}

function toggleSubscriptionFreeze() {
  if (!currentUser || !currentUser.subscription) return;

  const sub = currentUser.subscription;
  if (sub.isLifetime) {
    showToast('Бессрочную подписку не требуется замораживать', 'info');
    return;
  }

  const now = Date.now();
  const FREEZE_COOLDOWN_MS = 10 * 24 * 3600 * 1000; // 10 days cooldown

  if (!sub.isFrozen) {
    // Check 10-day cooldown
    if (sub.lastFrozenAt && (now - sub.lastFrozenAt) < FREEZE_COOLDOWN_MS) {
      const msLeft = FREEZE_COOLDOWN_MS - (now - sub.lastFrozenAt);
      const daysLeft = Math.ceil(msLeft / (24 * 3600 * 1000));
      showToast(`Заморозка доступна 1 раз в 10 дней! Подождите ещё ${daysLeft} дн.`, 'error');
      return;
    }

    if (sub.expiresAt <= now) {
      showToast('Невозможно заморозить истекшую подписку', 'error');
      return;
    }
    const remaining = Math.max(0, Math.floor((sub.expiresAt - now) / 1000));
    sub.remainingSeconds = remaining;
    sub.isFrozen = true;
    sub.frozenAt = now;
    sub.lastFrozenAt = now;
    saveUsersToStorage();
    renderSubscriptionCard();
    showToast('Подписка успешно заморожена! Таймер остановлен.', 'info');
  } else {
    // Unfreeze logic
    const newExpiresAt = now + (sub.remainingSeconds * 1000);
    sub.expiresAt = newExpiresAt;
    sub.isFrozen = false;
    sub.unfrozenAt = now;
    saveUsersToStorage();
    renderSubscriptionCard();
    showToast('Подписка разморожена! Доступ возобновлен.', 'success');
  }
}

function downloadLoader() {
  if (!currentUser) {
    openAuthModal('login');
    return;
  }

  if (!currentUser.subscription || (!currentUser.subscription.isLifetime && currentUser.subscription.expiresAt <= Date.now())) {
    showToast('Для скачивания требуется активная лицензия или подписка!', 'error');
    return;
  }

  if (currentUser.subscription.isFrozen) {
    showToast('Ваша подписка заморожена. Разморозьте её перед запуском софта.', 'warning');
    return;
  }

  const downloadUrl = 'https://drive.usercontent.google.com/download?id=1PDbILvvDKW3Dlquzmn8Sko3fYOIzggFI&export=download&authuser=0';
  
  showToast('Загрузка NekroniumLoader V1.4 началась!', 'success');
  
  // Открываем прямую загрузку
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* -------------------------------------------------------------
   Balance Top-Up Modal (Shows "Soon.")
------------------------------------------------------------- */
function openTopUpModal() {
  if (!currentUser) {
    openAuthModal('login');
    return;
  }
  document.getElementById('topUpModal').classList.add('open');
}

function closeTopUpModal() {
  document.getElementById('topUpModal').classList.remove('open');
}

function setTopUpAmount(amount) {
  document.getElementById('topUpAmountInput').value = amount;
}

function processTopUp() {
  showToast('Soon.', 'info');
  closeTopUpModal();
}

/* -------------------------------------------------------------
   ADMIN PANEL ENGINE: SUBTABS (Users vs Prices)
------------------------------------------------------------- */
function switchAdminSubtab(subtab) {
  activeAdminSubtab = subtab;
  const btnUsers = document.getElementById('adminSubtabBtnUsers');
  const btnPrices = document.getElementById('adminSubtabBtnPrices');
  const paneUsers = document.getElementById('adminPaneUsers');
  const panePrices = document.getElementById('adminPanePrices');

  if (subtab === 'users') {
    btnUsers.classList.add('active');
    btnPrices.classList.remove('active');
    paneUsers.style.display = 'block';
    panePrices.style.display = 'none';
    renderAdminTable();
  } else {
    btnUsers.classList.remove('active');
    btnPrices.classList.add('active');
    paneUsers.style.display = 'none';
    panePrices.style.display = 'block';
    renderConfigEditor();
  }
}

/* -------------------------------------------------------------
   ADMIN: USERS TABLE & SUBSCRIPTION MANAGEMENT
------------------------------------------------------------- */
function renderAdminTable() {
  if (!currentUser || currentUser.role !== 'admin') return;

  const tbody = document.getElementById('adminUsersTableBody');
  const search = (document.getElementById('adminUserSearch').value || '').toLowerCase();

  // Metrics
  document.getElementById('statTotalUsers').textContent = appUsers.length;
  const totalBal = appUsers.reduce((sum, u) => sum + (u.balance || 0), 0);
  document.getElementById('statTotalBalance').textContent = `${totalBal.toFixed(2)} ₽`;
  const activeSubsCount = appUsers.filter(u => u.subscription && (u.subscription.isLifetime || u.subscription.expiresAt > Date.now())).length;
  document.getElementById('statActiveSubs').textContent = activeSubsCount;

  const filtered = appUsers.filter(u => 
    String(u.uid).includes(search) || 
    u.username.toLowerCase().includes(search)
  );

  tbody.innerHTML = filtered.map(u => {
    let subStatusText = '<span class="badge badge-inactive">НЕТ</span>';
    let timeLeftText = '—';

    if (u.subscription) {
      if (u.subscription.isLifetime) {
        subStatusText = '<span class="badge badge-success">LIFETIME</span>';
        timeLeftText = '∞ Навсегда';
      } else if (u.subscription.isFrozen) {
        subStatusText = '<span class="badge badge-warning">❄️ ЗАМОРОЖЕН</span>';
        timeLeftText = formatRemainingTime(u.subscription.remainingSeconds);
      } else if (u.subscription.expiresAt > Date.now()) {
        subStatusText = '<span class="badge badge-success">АКТИВНА</span>';
        const sec = Math.floor((u.subscription.expiresAt - Date.now()) / 1000);
        timeLeftText = formatRemainingTime(sec);
      } else {
        subStatusText = '<span class="badge badge-inactive">ИСТЕКЛА</span>';
        timeLeftText = '00д 00:00:00';
      }
    }

    const hasSub = u.subscription !== null && u.subscription !== undefined;
    const isFrozen = hasSub && u.subscription.isFrozen;
    const freezeIcon = isFrozen ? '☀️' : '❄️';
    const freezeTitle = isFrozen ? 'Разморозить' : 'Заморозить';

    const roleInfo = getUserDisplayRole(u);

    return `
      <tr>
        <td><strong>#${u.uid}</strong></td>
        <td>${u.username}</td>
        <td><span class="badge badge-role ${roleInfo.badgeClass}">${roleInfo.label}</span></td>
        <td style="color: var(--accent-emerald); font-weight: 700;">${u.balance.toFixed(2)} ₽</td>
        <td>${u.subscription ? u.subscription.productName : '—'}</td>
        <td style="font-family: var(--font-mono); font-size: 0.85rem;">${timeLeftText}</td>
        <td>${subStatusText}</td>
        <td>
          <div class="table-actions-cell">
            <button class="btn btn-secondary btn-icon" title="Редактировать" onclick="openAdminUserEdit(${u.uid})">⚙️</button>
            <button class="btn btn-warning btn-icon" title="${freezeTitle}" onclick="adminToggleUserFreeze(${u.uid})" ${!hasSub ? 'disabled' : ''}>${freezeIcon}</button>
            <button class="btn btn-danger btn-icon" title="Снести сабку" onclick="adminWipeUserSubscription(${u.uid})" ${!hasSub ? 'disabled' : ''}>❌</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterAdminUsers() {
  renderAdminTable();
}

// Admin: Toggle Freeze for any user
function adminToggleUserFreeze(uid) {
  const target = appUsers.find(u => u.uid === uid);
  if (!target || !target.subscription) {
    showToast('У пользователя нет подписки для заморозки', 'error');
    return;
  }

  const sub = target.subscription;
  if (sub.isLifetime) {
    showToast('Бессрочную подписку (Lifetime) нельзя заморозить', 'info');
    return;
  }

  const now = Date.now();
  if (!sub.isFrozen) {
    // Freeze
    const remaining = Math.max(0, Math.floor((sub.expiresAt - now) / 1000));
    sub.remainingSeconds = remaining;
    sub.isFrozen = true;
    sub.frozenAt = now;
    showToast(`Подписка пользователя #${target.uid} заморожена!`, 'info');
  } else {
    // Unfreeze
    sub.expiresAt = now + (sub.remainingSeconds * 1000);
    sub.isFrozen = false;
    sub.unfrozenAt = now;
    showToast(`Подписка пользователя #${target.uid} разморожена!`, 'success');
  }

  saveUsersToStorage(target);
  renderAdminTable();
  if (currentUser && currentUser.uid === target.uid) {
    currentUser = target;
    updateDashboardView();
  }
}

// Admin: Wipe/Delete Subscription for any user
function adminWipeUserSubscription(uid) {
  const target = appUsers.find(u => u.uid === uid);
  if (!target || !target.subscription) {
    showToast('У пользователя нет активной подписки', 'info');
    return;
  }

  if (!confirm(`Вы действительно хотите снести (аннулировать) подписку пользователю ${target.username} (UID #${target.uid})?`)) {
    return;
  }

  target.subscription = null;
  saveUsersToStorage(target);
  renderAdminTable();

  if (currentUser && currentUser.uid === target.uid) {
    currentUser = target;
    updateDashboardView();
  }

  showToast(`Подписка пользователя #${target.uid} полностью снесена!`, 'success');
}

// Admin User Edit Modal
function openAdminUserEdit(uid) {
  const target = appUsers.find(u => u.uid === uid);
  if (!target) return;

  document.getElementById('modalTargetUserId').value = target.uid;
  document.getElementById('modalTargetUser').textContent = `${target.username} (UID #${target.uid})`;
  document.getElementById('modalUserBalance').value = target.balance;
  document.getElementById('modalUserSubDays').value = 0;

  const freezeBtn = document.getElementById('modalBtnFreezeToggle');
  if (freezeBtn) {
    if (!target.subscription) {
      freezeBtn.disabled = true;
      freezeBtn.textContent = '❄️ Нет подписки';
    } else if (target.subscription.isFrozen) {
      freezeBtn.disabled = false;
      freezeBtn.textContent = '☀️ Разморозить сабку';
    } else {
      freezeBtn.disabled = false;
      freezeBtn.textContent = '❄️ Заморозить сабку';
    }
  }

  document.getElementById('adminUserModal').classList.add('open');
}

function closeAdminUserModal() {
  document.getElementById('adminUserModal').classList.remove('open');
}

function adminModalToggleFreeze() {
  const uid = Number(document.getElementById('modalTargetUserId').value);
  adminToggleUserFreeze(uid);
  openAdminUserEdit(uid); // Refresh modal view
}

function adminModalWipeSub() {
  const uid = Number(document.getElementById('modalTargetUserId').value);
  adminWipeUserSubscription(uid);
  closeAdminUserModal();
}

function quickAddBalance(amount) {
  const input = document.getElementById('modalUserBalance');
  input.value = Number(input.value || 0) + amount;
}

function quickAddDays(days) {
  const input = document.getElementById('modalUserSubDays');
  input.value = Number(input.value || 0) + days;
}

function saveAdminUserData() {
  const uid = Number(document.getElementById('modalTargetUserId').value);
  const target = appUsers.find(u => u.uid === uid);
  if (!target) return;

  const newBalance = parseFloat(document.getElementById('modalUserBalance').value);
  const addDays = parseInt(document.getElementById('modalUserSubDays').value, 10);

  if (!isNaN(newBalance) && newBalance >= 0) {
    target.balance = newBalance;
  }

  if (!isNaN(addDays) && addDays > 0) {
    const durationMs = addDays * 24 * 3600 * 1000;
    const now = Date.now();

    if (target.subscription && target.subscription.expiresAt > now && !target.subscription.isLifetime) {
      target.subscription.expiresAt += durationMs;
      target.subscription.remainingSeconds += addDays * 24 * 3600;
    } else {
      target.subscription = {
        productId: 'nekronium-sif',
        productName: 'Nekronium SIF',
        tierLabel: `${addDays} дн.`,
        isLifetime: false,
        expiresAt: now + durationMs,
        isFrozen: false,
        remainingSeconds: addDays * 24 * 3600
      };
    }
  }

  saveUsersToStorage(target);
  closeAdminUserModal();
  renderAdminTable();

  // If modifying self
  if (currentUser && currentUser.uid === target.uid) {
    currentUser = target;
    updateNavAuth();
    updateDashboardView();
  }

  showToast(`Данные пользователя #${target.uid} обновлены!`, 'success');
}

/* -------------------------------------------------------------
   ADMIN: PRODUCTS & PRICES CONFIG EDITOR
------------------------------------------------------------- */
function renderConfigEditor() {
  const container = document.getElementById('configProductsList');
  if (!container || !appConfig || !appConfig.products) return;

  container.innerHTML = appConfig.products.map((prod, prodIdx) => {
    const tiersHtml = prod.tiers.map((tier, tierIdx) => `
      <div class="tier-edit-box">
        <label>${tier.label} (${tier.key}):</label>
        <div style="display: flex; align-items: center; gap: 6px;">
          <input type="number" min="0" id="cfg_price_${prodIdx}_${tierIdx}" value="${tier.price}">
          <span style="font-weight: 700; color: var(--accent-emerald);">₽</span>
        </div>
      </div>
    `).join('');

    return `
      <div class="config-prod-card">
        <div class="config-prod-header">
          <h4>${prod.name} <code>(${prod.id})</code></h4>
          <span class="badge badge-success">${prod.status}</span>
        </div>

        <div class="config-inputs-row">
          <div>
            <label style="font-size: 0.78rem; color: var(--text-muted); display: block; margin-bottom: 4px;">Название товара:</label>
            <input type="text" id="cfg_name_${prodIdx}" value="${prod.name}">
          </div>
          <div>
            <label style="font-size: 0.78rem; color: var(--text-muted); display: block; margin-bottom: 4px;">Игра / Категория:</label>
            <input type="text" id="cfg_game_${prodIdx}" value="${prod.game}">
          </div>
          <div>
            <label style="font-size: 0.78rem; color: var(--text-muted); display: block; margin-bottom: 4px;">Статус защиты:</label>
            <select id="cfg_status_${prodIdx}">
              <option value="Undetected" ${prod.status === 'Undetected' ? 'selected' : ''}>Undetected</option>
              <option value="Testing" ${prod.status === 'Testing' ? 'selected' : ''}>Testing</option>
              <option value="Updating" ${prod.status === 'Updating' ? 'selected' : ''}>Updating</option>
              <option value="Working" ${prod.status === 'Working' ? 'selected' : ''}>Working</option>
            </select>
          </div>
        </div>

        <label style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted); display: block;">Настройка цен тарифов:</label>
        <div class="config-tiers-grid">
          ${tiersHtml}
        </div>
      </div>
    `;
  }).join('');
}

function saveAdminPriceConfig() {
  if (!appConfig || !appConfig.products) return;

  appConfig.products.forEach((prod, prodIdx) => {
    const nameInput = document.getElementById(`cfg_name_${prodIdx}`);
    const gameInput = document.getElementById(`cfg_game_${prodIdx}`);
    const statusSelect = document.getElementById(`cfg_status_${prodIdx}`);

    if (nameInput) prod.name = nameInput.value.trim();
    if (gameInput) prod.game = gameInput.value.trim();
    if (statusSelect) prod.status = statusSelect.value;

    prod.tiers.forEach((tier, tierIdx) => {
      const priceInput = document.getElementById(`cfg_price_${prodIdx}_${tierIdx}`);
      if (priceInput) {
        const val = parseFloat(priceInput.value);
        if (!isNaN(val) && val >= 0) {
          tier.price = val;
        }
      }
    });
  });

  saveConfigToStorage();
  renderProducts(); // Refresh storefront catalog in real-time
  renderConfigEditor(); // Refresh editor
  showToast('Прайсы и товары успешно сохранены и обновлены в магазине!', 'success');
}

function resetConfigToDefault() {
  if (!confirm('Сбросить все цены и товары к значениям по умолчанию из config.js?')) return;
  if (typeof NEKRONIUM_DEFAULT_CONFIG !== 'undefined') {
    appConfig = JSON.parse(JSON.stringify(NEKRONIUM_DEFAULT_CONFIG));
    saveConfigToStorage();
    renderProducts();
    renderConfigEditor();
    showToast('Конфигурация сброшена к исходным значениям из config.js', 'success');
  }
}

function exportConfigJson() {
  const jsonStr = JSON.stringify(appConfig, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'nekronium_config.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Файл nekronium_config.json скачан!', 'success');
}

function importConfigJsonPrompt() {
  const raw = prompt('Вставьте JSON конфигурацию (или отредактируйте config.js):');
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.products && Array.isArray(parsed.products)) {
      appConfig = parsed;
      saveConfigToStorage();
      renderProducts();
      renderConfigEditor();
      showToast('Конфигурация успешно импортирована!', 'success');
    } else {
      showToast('Ошибка: неверный формат конфигурации (нет products)', 'error');
    }
  } catch (err) {
    showToast('Ошибка парсинга JSON: ' + err.message, 'error');
  }
}

/* -------------------------------------------------------------
   Timer & Helpers
------------------------------------------------------------- */
function startGlobalTimer() {
  countdownInterval = setInterval(() => {
    if (currentUser && currentUser.subscription && !currentUser.subscription.isFrozen && !currentUser.subscription.isLifetime) {
      renderSubscriptionCard();
    }
  }, 1000);
}

function formatRemainingTime(totalSeconds) {
  if (isNaN(totalSeconds) || totalSeconds <= 0) return '00д 00:00:00';
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = num => String(num).padStart(2, '0');
  return `${pad(days)}д ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icon = type === 'success' ? '✓' : type === 'error' ? '⚠' : 'ℹ';
  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
