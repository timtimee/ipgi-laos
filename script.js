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
    body.innerHTML = `<tr><td colspan="3">${t('promotions.checkUrl', 'Please check the leaderboard JSON URL.')}</td></tr>`;
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

  body.innerHTML = rows.map((row, index) => `
    <tr>
      <td><span class="rank-pill">${row.rank || index + 1}</span></td>
      <td>${row.membership || '--'}</td>
      <td><strong>${formatNumber(row.points)}</strong></td>
    </tr>
  `).join('');

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="3">${t('promotions.noData', 'No leaderboard data available.')}</td></tr>`;
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
