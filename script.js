const CONFIG = {
  jackpotDataUrl: 'data.json',
  translationUrl: 'translation.json',
  leaderboardUrl: 'https://ipgi-laos.github.io/stvegas/leaderboard.json',
  leaderboardFallbackUrl: 'https://raw.githubusercontent.com/ipgi-laos/stvegas/main/leaderboard.json',
  fullLeaderboardUrl: 'https://ipgi-laos.github.io/stvegas/',
  refreshMs: 60000
};

const EVENTS = [
  { id: 'steam-bun', image: 'images/steambun.webp' },
  { id: 'egg-tart', image: 'images/eggtart.webp' }
];

let jackpotData = {};
let jackpotMode = 'current';
let translationData = null;
let currentLanguage = localStorage.getItem('ipgiLandingLanguage') || 'en';
let latestLeaderboardData = null;

const navToggle = document.getElementById('navToggle');
const mainNav = document.getElementById('mainNav');
const languageSwitch = document.getElementById('languageSwitch');

function formatNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString('en-US') : '--';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const TIER_THRESHOLDS = [
  { min: 30000, key: 'platinum', label: 'Platinum' },
  { min: 28000, key: 'gold5', label: 'Gold V' },
  { min: 26000, key: 'gold4', label: 'Gold IV' },
  { min: 24000, key: 'gold3', label: 'Gold III' },
  { min: 22000, key: 'gold2', label: 'Gold II' },
  { min: 20000, key: 'gold1', label: 'Gold I' },
  { min: 18000, key: 'silver5', label: 'Silver V' },
  { min: 16000, key: 'silver4', label: 'Silver IV' },
  { min: 14000, key: 'silver3', label: 'Silver III' },
  { min: 12000, key: 'silver2', label: 'Silver II' },
  { min: 10000, key: 'silver1', label: 'Silver I' },
  { min: 8000, key: 'bronze5', label: 'Bronze V' },
  { min: 6000, key: 'bronze4', label: 'Bronze IV' },
  { min: 4000, key: 'bronze3', label: 'Bronze III' },
  { min: 2000, key: 'bronze2', label: 'Bronze II' },
  { min: 0, key: 'bronze1', label: 'Bronze I' }
];

const TIER_LABELS = {
  bronze1: 'Bronze I', bronze2: 'Bronze II', bronze3: 'Bronze III', bronze4: 'Bronze IV', bronze5: 'Bronze V',
  silver1: 'Silver I', silver2: 'Silver II', silver3: 'Silver III', silver4: 'Silver IV', silver5: 'Silver V',
  gold1: 'Gold I', gold2: 'Gold II', gold3: 'Gold III', gold4: 'Gold IV', gold5: 'Gold V',
  platinum: 'Platinum'
};

const STATUS_LABELS = {
  top8: 'Top 8',
  qualified: 'Qualified',
  rising: 'Rising',
  promoted: 'Almost Promoted'
};

function normalizeBadgeKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ⅰ/g, 'i')
    .replace(/ⅱ/g, 'ii')
    .replace(/ⅲ/g, 'iii')
    .replace(/ⅳ/g, 'iv')
    .replace(/ⅴ/g, 'v')
    .replace(/iv/g, '4')
    .replace(/iii/g, '3')
    .replace(/ii/g, '2')
    .replace(/i/g, '1')
    .replace(/v/g, '5')
    .replace(/almost\s*promoted/g, 'promoted')
    .replace(/top\s*8/g, 'top8')
    .replace(/[^a-z0-9]/g, '');
}

function resolveTier(row) {
  const directImage = row.tierImage || row.tier_image || row.tierImg || row.tier_img;
  if (directImage) {
    const label = row.tierLabel || row.tier_label || row.tierRank || row.tier || 'Tier Rank';
    return { src: directImage, label: String(label) };
  }

  const explicitKey = normalizeBadgeKey(row.tierKey || row.tier_key || row.tierRank || row.tier_rank || row.tier || row.rankTier);
  const key = TIER_LABELS[explicitKey] ? explicitKey : (TIER_THRESHOLDS.find((tier) => Number(row.points || 0) >= tier.min) || TIER_THRESHOLDS.at(-1)).key;

  return {
    src: `images/tier/${key}.webp`,
    label: TIER_LABELS[key] || 'Tier Rank'
  };
}

function resolveStatus(row, index) {
  const directImage = row.statusImage || row.status_image || row.statusImg || row.status_img;
  if (directImage) {
    const label = row.statusLabel || row.status_label || row.status || 'Status';
    return { src: directImage, label: String(label) };
  }

  const explicitKey = normalizeBadgeKey(row.statusKey || row.status_key || row.status);
  const rank = Number(row.rank || index + 1);
  const key = STATUS_LABELS[explicitKey] ? explicitKey : (rank <= 8 ? 'top8' : 'rising');

  return {
    src: `images/status/${key}.webp`,
    label: STATUS_LABELS[key] || 'Status'
  };
}

function renderBadgeImage(badge, className) {
  const src = escapeHtml(badge.src);
  const label = escapeHtml(badge.label);
  return `<img class="${className}" src="${src}" alt="${label}" title="${label}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'), { className: 'badge-fallback', textContent: '${label}' }))" />`;
}

function getByPath(object, path) {
  return path.split('.').reduce((current, key) => current?.[key], object);
}

function t(path, fallback = '') {
  const strings = translationData?.strings || {};
  return getByPath(strings[currentLanguage], path)
    ?? getByPath(strings.en, path)
    ?? fallback;
}

function setStatus(element, text) {
  if (element) element.textContent = text;
}

function formatGameName(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim();
}

async function fetchJsonWithFallback(primaryUrl, fallbackUrl) {
  try {
    const response = await fetch(`${primaryUrl}${primaryUrl.includes('?') ? '&' : '?'}v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (primaryError) {
    if (!fallbackUrl) throw primaryError;
    const response = await fetch(`${fallbackUrl}${fallbackUrl.includes('?') ? '&' : '?'}v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Fallback HTTP ${response.status}`);
    return await response.json();
  }
}

/* Translation */
async function loadTranslations() {
  try {
    const response = await fetch(`${CONFIG.translationUrl}?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    translationData = await response.json();
  } catch (error) {
    console.error('Unable to load translation.json', error);
    translationData = { defaultLanguage: 'en', languages: [{ code: 'en', label: 'EN', name: 'English' }], strings: {} };
  }

  const available = translationData.languages?.map((lang) => lang.code) || ['en'];
  if (!available.includes(currentLanguage)) currentLanguage = translationData.defaultLanguage || 'en';

  renderLanguageSwitch();
  applyTranslations();
}

function renderLanguageSwitch() {
  if (!languageSwitch) return;

  const current = (translationData.languages || []).find((lang) => lang.code === currentLanguage)
    || translationData.languages?.[0]
    || { code: 'en', label: 'EN', name: 'English', flag: 'us' };

  const options = (translationData.languages || []).map((lang) => `
    <button type="button" class="lang-option" data-lang="${lang.code}" role="option" aria-selected="${lang.code === currentLanguage}">
      <img class="flag-icon" src="images/flags/${lang.flag || lang.code}.svg" alt="" />
      <span>${lang.label}</span>
    </button>
  `).join('');

  languageSwitch.innerHTML = `
    <button type="button" class="lang-select-btn" id="languageSelectBtn" aria-haspopup="listbox" aria-expanded="false">
      <img class="flag-icon" src="images/flags/${current.flag || current.code}.svg" alt="" />
      <span>${current.label}</span>
      <span class="lang-caret">⌄</span>
    </button>
    <div class="lang-menu" id="languageMenu" role="listbox">
      ${options}
    </div>
  `;

  const button = document.getElementById('languageSelectBtn');
  const menu = document.getElementById('languageMenu');

  button?.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = languageSwitch.classList.toggle('open');
    button.setAttribute('aria-expanded', String(isOpen));
  });

  menu?.querySelectorAll('[data-lang]').forEach((item) => {
    item.addEventListener('click', () => {
      setLanguage(item.dataset.lang);
      languageSwitch.classList.remove('open');
    });
  });

  updateLanguageButtons();
}

function setLanguage(code) {
  currentLanguage = code;
  localStorage.setItem('ipgiLandingLanguage', code);
  applyTranslations();
  renderJackpots();
  initEventsView();
  renderLeaderboardPreview(latestLeaderboardData);
}

function updateLanguageButtons() {
  const selected = (translationData?.languages || []).find((lang) => lang.code === currentLanguage);
  const btn = document.getElementById('languageSelectBtn');
  if (btn && selected) {
    btn.innerHTML = `
      <img class="flag-icon" src="images/flags/${selected.flag || selected.code}.svg" alt="" />
      <span>${selected.label}</span>
      <span class="lang-caret">⌄</span>
    `;
  }

  languageSwitch?.querySelectorAll('[data-lang]').forEach((item) => {
    item.classList.toggle('active', item.dataset.lang === currentLanguage);
    item.setAttribute('aria-selected', String(item.dataset.lang === currentLanguage));
  });
}

function applyTranslations() {
  document.documentElement.lang = currentLanguage;

  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const path = element.dataset.i18n;
    const value = t(path, element.textContent);
    if (value) element.textContent = value;
  });

  renderPromotionRules();
  updateLanguageButtons();
}

function renderPromotionRules() {
  const rules = document.getElementById('promotionRules');
  if (!rules) return;

  const items = t('promotions.rules', []);
  rules.innerHTML = Array.isArray(items)
    ? items.map((item) => `<li>${item}</li>`).join('')
    : '';
}

/* Latest Jackpot */
async function initJackpotView() {
  document.querySelectorAll('[data-jackpot-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      jackpotMode = button.dataset.jackpotMode;
      document.querySelectorAll('[data-jackpot-mode]').forEach((btn) => btn.classList.toggle('active', btn === button));
      renderJackpots();
    });
  });

  await loadJackpotData();
  setInterval(loadJackpotData, CONFIG.refreshMs);
}

async function loadJackpotData() {
  try {
    jackpotData = await fetchJsonWithFallback(CONFIG.jackpotDataUrl);
    renderJackpots();
  } catch (error) {
    const grid = document.getElementById('jackpotGrid');
    if (grid) grid.innerHTML = `<div class="error-card">${t('jackpot.error', 'Unable to load jackpot data.')}</div>`;
  }
}

function renderJackpots() {
  const grid = document.getElementById('jackpotGrid');
  if (!grid) return;

  const games = jackpotData[jackpotMode] || {};
  const entries = Object.entries(games);

  if (!entries.length) {
    grid.innerHTML = `<div class="loading-card">${t('jackpot.noData', 'No jackpot data available.')}</div>`;
    return;
  }

  grid.innerHTML = entries.map(([key, game]) => {
    const modeLabel = jackpotMode === 'current'
      ? t('jackpot.currentLabel', 'Current Jackpot')
      : t('jackpot.lastLabel', 'Last Jackpot Hit');

    const level1Date = jackpotMode === 'current'
      ? `${t('jackpot.updated', 'Updated')}: ${game.time || '--:--'}`
      : `${t('jackpot.date', 'Date')}: ${game.level1_date || '--'}`;

    const level2Date = jackpotMode === 'current'
      ? `${t('jackpot.updated', 'Updated')}: ${game.time || '--:--'}`
      : `${t('jackpot.date', 'Date')}: ${game.level2_date || '--'}`;

    return `
      <article class="jackpot-card reveal-card is-visible">
        <div class="card-glow"></div>
        <p class="eyebrow compact">${modeLabel}</p>
        <h2>${formatGameName(key)}</h2>
        <div class="level-grid">
          <div class="level-card">
            <span class="level-label">${t('jackpot.level1', 'Level 1')}</span>
            <strong class="jackpot-amount">THB ${formatNumber(game.level1)}</strong>
            <small>${level1Date}</small>
          </div>
          <div class="level-card">
            <span class="level-label">${t('jackpot.level2', 'Level 2')}</span>
            <strong class="jackpot-amount">THB ${formatNumber(game.level2)}</strong>
            <small>${level2Date}</small>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

/* Events */
function initEventsView() {
  const grid = document.getElementById('eventGrid');
  if (!grid) return;

  grid.innerHTML = EVENTS.map((event) => {
    const base = `events.cards.${event.id}`;
    const title = t(`${base}.title`, event.id);
    return `
      <article class="event-card reveal-card is-visible">
        <div class="event-image">
          <img src="${event.image}" alt="${title}" loading="lazy" />
        </div>
        <div class="event-content">
          <span class="gold-chip">${t(`${base}.tag`, '')}</span>
          <p class="eyebrow compact">${t(`${base}.subtitle`, '')}</p>
          <h2>${title}</h2>
          <p>${t(`${base}.description`, '')}</p>
          <div class="event-details">
            <span>${t(`${base}.schedule`, '')}</span>
            <strong>${t(`${base}.time`, '')}</strong>
            <small>${t(`${base}.note`, '')}</small>
          </div>
          <div class="location-pill">${t(`${base}.location`, '')}</div>
        </div>
      </article>
    `;
  }).join('');
}

/* Promotions */
async function initPromotionView() {
  const link = document.getElementById('fullLeaderboardLink');
  if (link) link.href = CONFIG.fullLeaderboardUrl;

  await loadLeaderboardPreview();
  setInterval(loadLeaderboardPreview, CONFIG.refreshMs);
}

async function loadLeaderboardPreview() {
  const body = document.getElementById('promotionLeaderboardBody');
  const meta = document.getElementById('leaderboardMeta');
  if (!body) return;

  try {
    latestLeaderboardData = await fetchJsonWithFallback(CONFIG.leaderboardUrl, CONFIG.leaderboardFallbackUrl);
    renderLeaderboardPreview(latestLeaderboardData);
  } catch (error) {
    setStatus(meta, t('promotions.unable', 'Unable to load Hydra leaderboard data.'));
    body.innerHTML = `<tr><td colspan="4">${t('promotions.checkUrl', 'Please check the leaderboard JSON URL.')}</td></tr>`;
  }
}

function renderLeaderboardPreview(data) {
  const body = document.getElementById('promotionLeaderboardBody');
  const meta = document.getElementById('leaderboardMeta');
  if (!body) return;

  if (!data) {
    setStatus(meta, t('promotions.loading', 'Loading leaderboard data...'));
    return;
  }

  const rows = (data.rows || []).slice(0, 8);

  setStatus(meta, `${t('promotions.lastUpdated', 'Last Updated')}: ${data.lastUpdated || '--'} • ${t('promotions.showingTop8', 'Showing Top 8')}`);

  body.innerHTML = rows.map((row, index) => {
    const tier = resolveTier(row);
    const status = resolveStatus(row, index);

    return `
      <tr>
        <td><span class="rank-pill">${escapeHtml(row.rank || index + 1)}</span></td>
        <td>${escapeHtml(row.membership || '--')}</td>
        <td>${renderBadgeImage(tier, 'tier-badge')}</td>
        <td>${renderBadgeImage(status, 'status-badge')}</td>
      </tr>
    `;
  }).join('');

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="4">${t('promotions.noData', 'No leaderboard data available.')}</td></tr>`;
  }
}

/* Menu scroll + active section */
function scrollToSection(hash) {
  const target = document.querySelector(hash);
  if (!target) return;

  mainNav.classList.remove('open');
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updateActiveMenu() {
  const sections = [...document.querySelectorAll('.snap-section')];
  const offset = window.innerHeight * 0.32;

  let currentId = sections[0]?.id || 'latest-jackpot';
  for (const section of sections) {
    const rect = section.getBoundingClientRect();
    if (rect.top <= offset) currentId = section.id;
  }

  document.querySelectorAll('.nav-link').forEach((link) => {
    link.classList.toggle('active', link.getAttribute('href') === `#${currentId}`);
  });
}

function initReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add('is-visible');
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.reveal-card').forEach((card) => observer.observe(card));
}

navToggle.addEventListener('click', () => {
  mainNav.classList.toggle('open');
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.language-switch')) {
    languageSwitch?.classList.remove('open');
    document.getElementById('languageSelectBtn')?.setAttribute('aria-expanded', 'false');
  }

  const link = event.target.closest('a[href^="#"]');
  if (!link) return;

  event.preventDefault();
  scrollToSection(link.getAttribute('href'));
});

window.addEventListener('scroll', updateActiveMenu, { passive: true });
window.addEventListener('resize', updateActiveMenu);

(async function initPage() {
  await loadTranslations();
  initJackpotView();
  initEventsView();
  initPromotionView();
  initReveal();
  updateActiveMenu();
})();
