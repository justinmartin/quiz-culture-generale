// État global, données statiques, thème, PWA, statistiques persistées.
// Scripts classiques (pas de modules) : les déclarations top-level sont partagées
// entre fichiers. Ordre de chargement : state → culture → geo → daily → main.

// ======================================
// DATA & STATE
// ======================================
let ALL_QUESTIONS = [];
let filteredQuestions = [];
let quizQueue = [];
let currentQuestionIndex = 0;
let sessionCorrect = 0;
let sessionTotal = 0;
let sessionStreak = 0;
let sessionBestStreak = 0;
let currentMode = 'all';
let selectedThemes = new Set();
let answered = false;
let SESSION_SIZE = 20;
let cycleNumber = 1;
// Données figées en local (dossier data/) : plus de dépendance réseau au runtime.
const GEO_DEPARTMENTS_URL = './data/departements.json';            // 101 dép. + préfecture
const GEO_DEPARTMENT_GEOJSON_URL = './data/departements.geojson';   // tracés (96, métropole)
const GEO_REGIONS_URL = './data/regions.json';                      // 18 régions
const GEO_REGION_GEOJSON_URL = './data/regions.geojson';            // tracés (13, métropole)
const GEO_COUNTRIES_URL = './data/countries.json';                  // 195 pays (FR + variantes)
const GEO_COUNTRY_GEOJSON_URL = './data/countries.geo.json';        // tracés pays (161)
const GEO_USSTATES_URL = './data/us-states.json';                   // 50 états US (FR + capitale)
const GEO_USSTATES_GEOJSON_URL = './data/us-states.geojson';        // tracés des états
const THEME_STORAGE_KEY = 'quiz_theme';
const THEME_COLOR_LIGHT = '#f5f4ed';
const THEME_COLOR_DARK = '#151414';

// Moteur générique de "jeu de lieux" (pays du monde OU états américains).
// Une entrée (indice) + une ou plusieurs sorties à retrouver (champs simultanés).
const PLACE_CFG = {
  world: {
    header: 'Pays et capitales',
    title: 'Pays et capitales',
    subtitle: "Choisis ce qui sert d'indice (l'entrée), puis ce que tu dois retrouver (une ou plusieurs sorties). Tout est en français, réponses libres.",
    sources: [
      { id: 'flag', label: '🚩 Drapeau' },
      { id: 'map', label: '🗺️ Carte' },
      { id: 'name', label: '🏷️ Nom' },
    ],
    targets: [
      { id: 'name', label: '🏳️ Nom du pays', placeholder: 'Nom du pays...' },
      { id: 'capital', label: '🏙️ Capitale', placeholder: 'Nom de la capitale...' },
      { id: 'map', label: '🖱️ Placer sur la carte', click: true },
    ],
    sizes: [{ n: 20, label: '20 au hasard' }, { n: 195, label: 'Les 195' }],
    nameWord: 'pays',
  },
  us: {
    header: 'États américains',
    title: 'États américains',
    subtitle: "Les 50 états des États-Unis. Choisis l'indice (carte ou nom) et ce que tu dois retrouver. Noms en français, réponses libres.",
    sources: [
      { id: 'map', label: '🗺️ Carte' },
      { id: 'name', label: '🏷️ Nom' },
    ],
    targets: [
      { id: 'name', label: "🏛️ Nom de l'état", placeholder: "Nom de l'état..." },
      { id: 'capital', label: '🏙️ Capitale', placeholder: 'Nom de la capitale...' },
      { id: 'map', label: '🖱️ Placer sur la carte', click: true },
    ],
    sizes: [{ n: 20, label: '20 au hasard' }, { n: 50, label: 'Les 50' }],
    nameWord: 'état',
  },
  'fr-region': {
    header: 'France · Régions',
    title: 'Régions françaises',
    subtitle: "Choisis l'indice et ce que tu veux retrouver (nom, placer sur la carte, ou lister ses départements).",
    level: 'region',
    sources: [
      { id: 'map', label: '🗺️ Carte' },
      { id: 'flag', label: '🏴 Drapeau' },
      { id: 'name', label: '🏷️ Nom' },
      { id: 'chef-lieu', label: '🏛️ Chef-lieu' },
    ],
    targets: [
      { id: 'name', label: '🏙️ Nom de la région', placeholder: 'Nom de la région...' },
      { id: 'chef-lieu', label: '🏛️ Chef-lieu', placeholder: 'Chef-lieu de région...' },
      { id: 'map', label: '🖱️ Placer sur la carte', click: true },
      { id: 'depts', label: '🏛️ Lister ses départements', list: true },
    ],
    sizes: [{ n: 13, label: '13 (métropole)' }, { n: 18, label: 'Les 18' }],
    nameWord: 'région',
  },
  'fr-dept': {
    header: 'France · Départements',
    title: 'Départements français',
    subtitle: "Choisis l'indice et ce que tu veux retrouver : nom, numéro, région, préfecture, ou placer sur la carte.",
    level: 'dept',
    sources: [
      { id: 'map', label: '🗺️ Carte' },
      { id: 'name', label: '🏷️ Nom' },
      { id: 'number', label: '🔢 Numéro' },
      { id: 'prefecture', label: '🏛️ Préfecture' },
    ],
    targets: [
      { id: 'name', label: '🏙️ Nom du département', placeholder: 'Nom du département...' },
      { id: 'number', label: '🔢 Numéro', placeholder: 'Numéro (ex. 59)...' },
      { id: 'region', label: '🗺️ Région', placeholder: 'Nom de la région...' },
      { id: 'prefecture', label: '🏛️ Préfecture', placeholder: 'Nom de la préfecture...' },
      { id: 'map', label: '🖱️ Placer sur la carte', click: true },
    ],
    sizes: [{ n: 20, label: '20 au hasard' }, { n: 101, label: 'Les 101' }],
    nameWord: 'département',
  },
};
function placeCfg() { return PLACE_CFG[countryGameState.scope] || PLACE_CFG.world; }
function placeIsFrance() { return countryGameState.scope === 'fr-region' || countryGameState.scope === 'fr-dept'; }
function targetMetaById(id) { return (placeCfg().targets || []).find(t => t.id === id) || {}; }
function targetIsClick(id) { return !!targetMetaById(id).click; }
function targetIsList(id) { return !!targetMetaById(id).list; }

// Filtre par continent (pays du monde uniquement) — clé = champ `region` du dataset.
const CONTINENTS = [
  { id: 'all', label: '🌍 Tous' },
  { id: 'Europe', label: 'Europe' },
  { id: 'Africa', label: 'Afrique' },
  { id: 'Asia', label: 'Asie' },
  { id: 'Americas', label: 'Amériques' },
  { id: 'Oceania', label: 'Océanie' },
];

// Capitales en français (clé = code ISO cca2). On ne liste que celles
// dont le nom français diffère de la forme anglaise/locale du dataset ;
// pour toutes les autres (Paris, Berlin, Madrid…) on garde la capitale du dataset.
const CAPITALS_FR = {
  DE: 'Berlin', AT: 'Vienne', BE: 'Bruxelles', BG: 'Sofia', CY: 'Nicosie',
  HR: 'Zagreb', DK: 'Copenhague', ES: 'Madrid', EE: 'Tallinn', FI: 'Helsinki',
  GR: 'Athènes', HU: 'Budapest', IE: 'Dublin', IT: 'Rome', LV: 'Riga',
  LT: 'Vilnius', LU: 'Luxembourg', MT: 'La Valette', NL: 'Amsterdam',
  PL: 'Varsovie', PT: 'Lisbonne', CZ: 'Prague', RO: 'Bucarest', GB: 'Londres',
  SK: 'Bratislava', SI: 'Ljubljana', SE: 'Stockholm', CH: 'Berne', NO: 'Oslo',
  IS: 'Reykjavik', UA: 'Kiev', RU: 'Moscou', BY: 'Minsk', MD: 'Chisinau',
  RS: 'Belgrade', ME: 'Podgorica', MK: 'Skopje', AL: 'Tirana', BA: 'Sarajevo',
  XK: 'Pristina', AD: 'Andorre-la-Vieille', MC: 'Monaco', SM: 'Saint-Marin',
  VA: 'Cité du Vatican', LI: 'Vaduz',
  TR: 'Ankara', GE: 'Tbilissi', AM: 'Erevan', AZ: 'Bakou', KZ: 'Astana',
  UZ: 'Tachkent', TM: 'Achgabat', KG: 'Bichkek', TJ: 'Douchanbé',
  CN: 'Pékin', JP: 'Tokyo', KP: 'Pyongyang', KR: 'Séoul', MN: 'Oulan-Bator',
  IN: 'New Delhi', PK: 'Islamabad', BD: 'Dacca', LK: 'Sri Jayawardenapura Kotte',
  NP: 'Katmandou', BT: 'Thimphou', MM: 'Naypyidaw', TH: 'Bangkok',
  KH: 'Phnom Penh', LA: 'Vientiane', VN: 'Hanoï', PH: 'Manille',
  ID: 'Jakarta', MY: 'Kuala Lumpur', SG: 'Singapour', BN: 'Bandar Seri Begawan',
  TL: 'Dili', MV: 'Malé', AF: 'Kaboul', IR: 'Téhéran', IQ: 'Bagdad',
  SY: 'Damas', LB: 'Beyrouth', JO: 'Amman', IL: 'Jérusalem', PS: 'Ramallah',
  SA: 'Riyad', YE: 'Sanaa', OM: 'Mascate', AE: 'Abou Dabi', QA: 'Doha',
  BH: 'Manama', KW: 'Koweït',
  EG: 'Le Caire', LY: 'Tripoli', TN: 'Tunis', DZ: 'Alger', MA: 'Rabat',
  MR: 'Nouakchott', ML: 'Bamako', NE: 'Niamey', TD: 'N’Djamena',
  SD: 'Khartoum', SS: 'Djouba', ET: 'Addis-Abeba', ER: 'Asmara',
  DJ: 'Djibouti', SO: 'Mogadiscio', KE: 'Nairobi', UG: 'Kampala',
  TZ: 'Dodoma', RW: 'Kigali', BI: 'Gitega', CD: 'Kinshasa', CG: 'Brazzaville',
  CF: 'Bangui', CM: 'Yaoundé', GA: 'Libreville', GQ: 'Malabo',
  ST: 'São Tomé', NG: 'Abuja', BJ: 'Porto-Novo', TG: 'Lomé', GH: 'Accra',
  CI: 'Yamoussoukro', BF: 'Ouagadougou', SN: 'Dakar', GM: 'Banjul',
  GW: 'Bissau', GN: 'Conakry', SL: 'Freetown', LR: 'Monrovia',
  ZA: 'Pretoria', LS: 'Maseru', SZ: 'Mbabane', NA: 'Windhoek',
  BW: 'Gaborone', ZW: 'Harare', ZM: 'Lusaka', MW: 'Lilongwe',
  MZ: 'Maputo', AO: 'Luanda', MG: 'Antananarivo', MU: 'Port-Louis',
  SC: 'Victoria', KM: 'Moroni', CV: 'Praia',
  US: 'Washington', CA: 'Ottawa', MX: 'Mexico', GT: 'Guatemala',
  BZ: 'Belmopan', SV: 'San Salvador', HN: 'Tegucigalpa', NI: 'Managua',
  CR: 'San José', PA: 'Panama', CU: 'La Havane', JM: 'Kingston',
  HT: 'Port-au-Prince', DO: 'Saint-Domingue', BS: 'Nassau',
  BB: 'Bridgetown', TT: 'Port-d’Espagne', CO: 'Bogota', VE: 'Caracas',
  GY: 'Georgetown', SR: 'Paramaribo', EC: 'Quito', PE: 'Lima',
  BO: 'La Paz', PY: 'Asuncion', CL: 'Santiago', AR: 'Buenos Aires',
  UY: 'Montevideo', BR: 'Brasilia',
  AU: 'Canberra', NZ: 'Wellington', PG: 'Port Moresby', FJ: 'Suva',
  SB: 'Honiara', VU: 'Port-Vila', WS: 'Apia', TO: 'Nuku’alofa',
  KI: 'Tarawa-Sud', FM: 'Palikir', MH: 'Majuro', PW: 'Ngerulmud',
  NR: 'Yaren', TV: 'Funafuti', FR: 'Paris',
};

let geoDataPromise = null;
let geoData = {
  departments: [],
  departmentGeojson: null,
  regions: [],
  regionGeojson: null,
  countries: [],
  countryGeojson: null,
  countryFeatureByName: new Map(),
  countryFeatureByNormalizedName: new Map(),
  departmentByCode: new Map(),
  usStates: [],
  usGeojson: null,
};


let countryGameState = {
  scope: 'world',            // 'world' (pays) | 'us' (états américains)
  source: 'flag',            // 'flag' | 'map' | 'name'
  continent: 'all',          // filtre continent (scope world)
  targets: ['name'],         // sous-ensemble ordonné de ['name','capital']
  sessionSize: 20,
  queue: [],
  currentIndex: 0,           // index du lieu courant
  score: 0,                  // nb de champs corrects
  total: 0,                  // nb de champs répondus
  completed: false,
  answered: false,           // le lieu courant a-t-il été validé
  current: null,
  recorded: false,
  sessionErrors: [],         // lieux ratés (≥1 champ faux) pour le rejeu
};


function getPreferredTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  const safeTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', safeTheme);

  document.querySelectorAll('.theme-toggle').forEach(btn => {
    btn.classList.toggle('is-dark', safeTheme === 'dark');
    btn.setAttribute('aria-pressed', String(safeTheme === 'dark'));
    btn.setAttribute('aria-label', safeTheme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre');
  });

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.setAttribute('content', safeTheme === 'dark' ? THEME_COLOR_DARK : THEME_COLOR_LIGHT);
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_STORAGE_KEY, next);
  applyTheme(next);
}

applyTheme(getPreferredTheme());

// PWA : enregistrement du service worker (mode hors-ligne).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// PWA : bouton "Installer l'app".
let deferredInstallPrompt = null;
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function refreshInstallButton() {
  const btn = document.getElementById('install-btn');
  if (!btn) return;
  // Déjà installée → on cache. Sinon : visible si prompt natif dispo (Android/Chrome)
  // ou si iOS (instructions manuelles).
  btn.style.display = (!isStandalone() && (deferredInstallPrompt || isIOS())) ? 'block' : 'none';
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  refreshInstallButton();
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const tip = document.getElementById('ios-install-tip');
  if (tip) tip.style.display = 'none';
  refreshInstallButton();
});
function installApp() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.finally(() => { deferredInstallPrompt = null; refreshInstallButton(); });
  } else if (isIOS()) {
    // iOS ne fournit pas de prompt : on affiche/masque les instructions.
    const tip = document.getElementById('ios-install-tip');
    if (tip) tip.style.display = tip.style.display === 'none' ? 'block' : 'none';
  }
}
window.addEventListener('load', refreshInstallButton);

// Persistent stats
function createDefaultStats() {
  return {
    totalCorrect: 0,
    totalAnswered: 0,
    bestStreak: 0,
    seenIds: [],
    wrongIds: [],
    cycles: 0,
    byMode: {
      all: { correct: 0, answered: 0 },
      abordable: { correct: 0, answered: 0 },
      expert: { correct: 0, answered: 0 },
    },
    byTheme: {},
  };
}

function normalizeStats(raw) {
  const base = createDefaultStats();
  const src = (raw && typeof raw === 'object') ? raw : {};

  base.totalCorrect = Number(src.totalCorrect) || 0;
  base.totalAnswered = Number(src.totalAnswered) || 0;
  base.bestStreak = Number(src.bestStreak) || 0;
  base.seenIds = Array.isArray(src.seenIds) ? src.seenIds : [];
  base.wrongIds = Array.isArray(src.wrongIds) ? src.wrongIds : [];
  base.cycles = Number(src.cycles) || 0;

  const modes = ['all', 'abordable', 'expert'];
  if (src.byMode && typeof src.byMode === 'object') {
    modes.forEach(mode => {
      const modeSrc = src.byMode[mode] || {};
      base.byMode[mode] = {
        correct: Number(modeSrc.correct) || 0,
        answered: Number(modeSrc.answered) || 0,
      };
    });
  }

  if (src.byTheme && typeof src.byTheme === 'object') {
    Object.entries(src.byTheme).forEach(([theme, val]) => {
      const all = val && val.all ? val.all : {};
      const abordable = val && val.abordable ? val.abordable : {};
      const expert = val && val.expert ? val.expert : {};
      base.byTheme[theme] = {
        all: { correct: Number(all.correct) || 0, answered: Number(all.answered) || 0 },
        abordable: { correct: Number(abordable.correct) || 0, answered: Number(abordable.answered) || 0 },
        expert: { correct: Number(expert.correct) || 0, answered: Number(expert.answered) || 0 },
      };
    });
  }

  return base;
}

let stats;
try {
  stats = normalizeStats(JSON.parse(localStorage.getItem('quiz_stats') || 'null'));
} catch (e) {
  stats = createDefaultStats();
}

let statsViewMode = 'all';

// Theme emoji mapping
const THEME_MAP = {
  'Classique': { emoji: '📖', cls: 'theme-classique' },
  'Sport': { emoji: '⚽', cls: 'theme-sport' },
  'Jeux-vidéo / Culture Web': { emoji: '🎮', cls: 'theme-jeux' },
  'Moderne': { emoji: '🌍', cls: 'theme-moderne' },
  'Histoire': { emoji: '🏛️', cls: 'theme-histoire' },
  'Sciences': { emoji: '🔬', cls: 'theme-sciences' },
  'Géographie': { emoji: '🗺️', cls: 'theme-geographie' },
  'Musiques': { emoji: '🎵', cls: 'theme-musiques' },
  'Animaux et plantes': { emoji: '🌿', cls: 'theme-animaux' },
  'Culture générale': { emoji: '🧠', cls: 'theme-culture' },
};
