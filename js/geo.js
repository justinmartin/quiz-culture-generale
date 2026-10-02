// Jeux de géographie (moteur unifié : départements, régions, pays, États US).
// Scripts classiques (pas de modules) : les déclarations top-level sont partagées
// entre fichiers. Ordre de chargement : state → culture → geo → daily → main.

// ======================================
// GÉOGRAPHIE
// ======================================
function buildCountryOptionButtons() {
  const cfg = placeCfg();
  const sourceContainer = document.getElementById('country-source-group');
  if (sourceContainer) {
    sourceContainer.innerHTML = cfg.sources.map(s => `
      <button class="geo-option-btn ${s.id === countryGameState.source ? 'active' : ''}" data-source="${s.id}" onclick="setCountrySource('${s.id}')">
        ${s.label}
      </button>
    `).join('');
  }
  const sizeContainer = document.getElementById('country-size-group');
  if (sizeContainer) {
    sizeContainer.innerHTML = cfg.sizes.map((sz, i) => `
      <button class="geo-option-btn ${(countryGameState.sessionSize === sz.n) || (i === 0 && !cfg.sizes.some(x => x.n === countryGameState.sessionSize)) ? 'active' : ''}" data-size="${sz.n}" onclick="setCountrySessionSize(${sz.n})">
        ${sz.label}
      </button>
    `).join('');
  }
  // Niveau (Régions / Départements) : uniquement pour l'onglet France.
  const levelField = document.getElementById('country-level-field');
  if (levelField) {
    levelField.style.display = placeIsFrance() ? 'block' : 'none';
    document.querySelectorAll('#country-level-group .geo-option-btn').forEach(btn => {
      const isRegion = btn.dataset.level === 'region';
      btn.classList.toggle('active', (isRegion && countryGameState.scope === 'fr-region') || (!isRegion && countryGameState.scope === 'fr-dept'));
    });
  }
  // Filtre continent : uniquement pour les pays du monde.
  const contField = document.getElementById('country-continent-field');
  const contGroup = document.getElementById('country-continent-group');
  const isWorld = countryGameState.scope === 'world';
  if (contField) contField.style.display = isWorld ? 'block' : 'none';
  if (contGroup && isWorld) {
    contGroup.innerHTML = CONTINENTS.map(c => `
      <button class="geo-option-btn ${c.id === countryGameState.continent ? 'active' : ''}" data-continent="${c.id}" onclick="setCountryContinent('${c.id}')">
        ${c.label}
      </button>
    `).join('');
  }
  renderCountryTargetButtons();
}

function setCountryContinent(id) {
  countryGameState.continent = id;
  document.querySelectorAll('#country-continent-group .geo-option-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.continent === id);
  });
}

function renderCountryTargetButtons() {
  const cfg = placeCfg();
  const targetContainer = document.getElementById('country-target-group');
  if (!targetContainer) return;
  targetContainer.innerHTML = cfg.targets.map(t => {
    // Une sortie ne peut pas être identique à l'entrée (ex. Carte→Carte, Nom→Nom).
    const disabled = t.id === countryGameState.source;
    const active = countryGameState.targets.includes(t.id) && !disabled;
    return `
      <button class="geo-option-btn ${active ? 'active' : ''}" data-target="${t.id}"
              ${disabled ? 'disabled style="opacity:.4;cursor:not-allowed;"' : `onclick="toggleCountryTarget('${t.id}')"`}>
        ${active ? '✓ ' : ''}${t.label}
      </button>
    `;
  }).join('');
}

function setCountrySource(sourceId) {
  countryGameState.source = sourceId;
  document.querySelectorAll('#country-source-group .geo-option-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.source === sourceId);
  });
  // Une sortie identique à l'entrée n'a pas de sens → on la retire.
  countryGameState.targets = countryGameState.targets.filter(t => t !== sourceId);
  if (countryGameState.targets.length === 0) {
    const firstOther = placeCfg().targets.map(t => t.id).find(id => id !== sourceId);
    countryGameState.targets = [firstOther];
  }
  renderCountryTargetButtons();
}

function toggleCountryTarget(targetId) {
  const order = placeCfg().targets.map(t => t.id);
  let targets = countryGameState.targets;
  // "Lister ses départements" est exclusif (un mode à part entière).
  if (targetIsList(targetId)) {
    countryGameState.targets = targets.includes(targetId) ? targets : [targetId];
    renderCountryTargetButtons();
    return;
  }
  // Si on ajoute une sortie normale alors que "lister" est active, on remplace.
  if (targets.length === 1 && targetIsList(targets[0])) {
    countryGameState.targets = [targetId];
    renderCountryTargetButtons();
    return;
  }
  const idx = targets.indexOf(targetId);
  if (idx >= 0) {
    if (targets.length > 1) targets.splice(idx, 1); // garder au moins une sortie
  } else {
    countryGameState.targets = order.filter(id => targets.includes(id) || id === targetId);
  }
  renderCountryTargetButtons();
}

// Bascule Régions / Départements dans l'onglet France.
function setFranceLevel(level) {
  openPlaceGame(level === 'region' ? 'fr-region' : 'fr-dept');
}

function setCountrySessionSize(size) {
  countryGameState.sessionSize = size;
  document.querySelectorAll('#country-size-group .geo-option-btn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.size) === size);
  });
}

async function loadGeoData() {
  if (geoDataPromise) return geoDataPromise;

  geoDataPromise = Promise.all([
    fetch(GEO_DEPARTMENTS_URL).then(r => r.json()),
    fetch(GEO_DEPARTMENT_GEOJSON_URL).then(r => r.json()),
    fetch(GEO_COUNTRIES_URL).then(r => r.json()),
    fetch(GEO_COUNTRY_GEOJSON_URL).then(r => r.json()),
    fetch(GEO_REGIONS_URL).then(r => r.json()),
    fetch(GEO_REGION_GEOJSON_URL).then(r => r.json()),
    fetch(GEO_USSTATES_URL).then(r => r.json()),
    fetch(GEO_USSTATES_GEOJSON_URL).then(r => r.json()),
  ]).then(([departments, departmentGeojson, countriesRaw, countryGeojson, regionsRaw, regionGeojson, usStatesRaw, usGeojson]) => {
    const departmentByCode = new Map();
    departments.forEach(department => departmentByCode.set(department.code, department));

    // On garde TOUS les départements (101, DOM inclus). Le tracé `feature`
    // peut être absent (le GeoJSON métropole n'a pas les DOM) : il ne sert
    // qu'à la carte du mode "Carte → nom".
    const mergedDepartments = departments
      .map(department => ({
        ...department,
        feature: departmentGeojson.features.find(feature => feature.properties && feature.properties.code === department.code) || null,
      }));

    const countryFeatureByName = new Map();
    const countryFeatureByNormalizedName = new Map();
    countryGeojson.features.forEach(feature => {
      const featureName = feature.properties && feature.properties.name;
      if (!featureName) return;
      countryFeatureByName.set(featureName, feature);
      countryFeatureByNormalizedName.set(normalize(featureName), feature);
    });

    // On garde TOUS les pays membres de l'ONU (+ Palestine, Vatican). Le tracé
    // `feature` peut manquer pour les petits pays : il n'est requis que pour
    // l'entrée "Carte". Drapeau et Nom fonctionnent pour tous.
    const countries = countriesRaw
      .filter(country => country.unMember || ['Palestine', 'Vatican City'].includes(country.name.common))
      .map(country => ({
        ...country,
        feature: countryFeatureByNormalizedName.get(normalize(country.name.common))
          || countryFeatureByNormalizedName.get(normalize(country.name.official))
          || countryFeatureByNormalizedName.get(normalize(country.translations && country.translations.fra && country.translations.fra.common || ''))
          || null,
      }));

    // Chef-lieu (préfecture de région) par code région — sert d'entrée/sortie
    // pour permettre la multi-sélection sur les régions (ex. Carte → Nom + Chef-lieu).
    const REGION_CHEF_LIEU = {
      '11': 'Paris', '24': 'Orléans', '27': 'Dijon', '28': 'Rouen',
      '32': 'Lille', '44': 'Strasbourg', '52': 'Nantes', '53': 'Rennes',
      '75': 'Bordeaux', '76': 'Toulouse', '84': 'Lyon', '93': 'Marseille',
      '94': 'Ajaccio', '01': 'Basse-Terre', '02': 'Fort-de-France',
      '03': 'Cayenne', '04': 'Saint-Denis', '06': 'Mamoudzou',
    };
    // Régions : on garde les 18 (DOM incluses) ; tracé optionnel (13 en métropole).
    const regions = regionsRaw.map(region => ({
      ...region,
      chefLieu: REGION_CHEF_LIEU[region.code] || null,
      feature: regionGeojson.features.find(f => f.properties && f.properties.code === region.code) || null,
    }));

    // États américains : 50 états, tracé matché par nom anglais.
    const usStates = usStatesRaw.map(state => ({
      ...state,
      feature: usGeojson.features.find(f => f.properties && f.properties.name === state.nomEn) || null,
    }));

    countries.sort((a, b) => a.name.common.localeCompare(b.name.common, 'fr'));
    mergedDepartments.sort((a, b) => departmentSortKey(a).localeCompare(departmentSortKey(b), 'fr'));
    regions.sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr'));
    usStates.sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr'));

    geoData = {
      departments: mergedDepartments,
      departmentGeojson,
      regions,
      regionGeojson,
      countries,
      countryGeojson,
      countryFeatureByName,
      countryFeatureByNormalizedName,
      departmentByCode,
      usStates,
      usGeojson,
    };

    return geoData;
  }).catch(error => {
    console.error('Erreur chargement géographie:', error);
    return null;
  });

  return geoDataPromise;
}

function departmentSortKey(department) {
  const region = department.region && department.region.nom ? department.region.nom : '';
  const code = String(department.code || '').padStart(3, '0');
  return `${region}-${code}-${department.nom || ''}`;
}

// Tirage reproductible à partir d'un générateur seedé (pour les défis géo partagés).
function selectSeededItems(items, count, rng) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.min(count, a.length));
}

function showCountrySetup() {
  const setup = document.getElementById('country-setup-panel');
  const play = document.getElementById('country-play-panel');
  if (setup) setup.style.display = 'block';
  if (play) play.style.display = 'none';
}

let regionMapZoom = null, regionMapSvg = null;

// ----- Helpers français -----
function countryFrenchName(country) {
  const fra = country.translations && country.translations.fra ? country.translations.fra : {};
  return fra.common || country.name.common;
}

function countryFrenchCapital(country) {
  return CAPITALS_FR[country.cca2]
    || (country.capital && country.capital[0])
    || '—';
}

// Réponses acceptées pour retrouver le NOM du pays (FR + variantes).
function buildCountryNameAnswers(country) {
  const answers = new Set();
  const fra = country.translations && country.translations.fra ? country.translations.fra : {};
  [
    country.name.common,
    country.name.official,
    fra.common,
    fra.official,
    ...(country.altSpellings || []),
  ].filter(Boolean).forEach(a => answers.add(a));
  return [...answers];
}

// Réponses acceptées pour la CAPITALE (FR + forme du dataset).
function buildCapitalAnswers(country) {
  const answers = new Set();
  if (CAPITALS_FR[country.cca2]) answers.add(CAPITALS_FR[country.cca2]);
  (country.capital || []).filter(Boolean).forEach(a => answers.add(a));
  return [...answers];
}

function getCountryFeature(country) {
  if (!country) return null;
  return geoData.countryFeatureByNormalizedName.get(normalize(country.name.common))
    || geoData.countryFeatureByNormalizedName.get(normalize(country.name.official))
    || geoData.countryFeatureByNormalizedName.get(normalize(country.translations && country.translations.fra && country.translations.fra.common || ''))
    || null;
}

function flagEmojiFromCode(code) {
  if (!code || code.length !== 2) return '🏳️';
  const upper = code.toUpperCase();
  return String.fromCodePoint(...upper.split('').map(char => 127397 + char.charCodeAt(0)));
}

// ----- Accesseurs génériques (scope monde / US) -----
function placeScope() { return countryGameState.scope; }
function placeItems() {
  const s = placeScope();
  if (s === 'us') return geoData.usStates;
  if (s === 'fr-region') return geoData.regions;
  if (s === 'fr-dept') return geoData.departments;
  return geoData.countries;
}
function placeGeojson() {
  const s = placeScope();
  if (s === 'us') return geoData.usGeojson;
  if (s === 'fr-region') return geoData.regionGeojson;
  if (s === 'fr-dept') return geoData.departmentGeojson;
  return geoData.countryGeojson;
}
function placeFeatureOf(item) {
  const s = placeScope();
  if (s === 'us' || s === 'fr-region' || s === 'fr-dept') return item && item.feature;
  return getCountryFeature(item);
}
function placeFrName(item) {
  const s = placeScope();
  if (s === 'us' || s === 'fr-region' || s === 'fr-dept') return item.nom;
  return countryFrenchName(item);
}
function placeFrCapital(item) { return placeScope() === 'us' ? (item.capital || '—') : countryFrenchCapital(item); }
function placeNameAnswers(item) {
  const s = placeScope();
  if (s === 'us') return [item.nom, item.nomEn, item.code].filter(Boolean);
  if (s === 'fr-region') return [item.nom, item.code].filter(Boolean);
  if (s === 'fr-dept') return [item.nom].filter(Boolean);
  return buildCountryNameAnswers(item);
}
function placeCapitalAnswers(item) { return placeScope() === 'us' ? [item.capital].filter(Boolean) : buildCapitalAnswers(item); }
// Drapeau : emoji (pays), image locale (régions FR), rien sinon.
function placeFlag(item) {
  const s = placeScope();
  if (s === 'world') return flagEmojiFromCode(item.cca2);
  return '';
}
function placeKeyOf(item) { return placeScope() === 'world' ? item.cca2 : item.code; }
// Départements d'une région (pour la sortie "lister ses départements").
function deptsOfRegion(region) {
  return geoData.departments.filter(d => d.region && region && d.region.code === region.code);
}

function sourceMeta() {
  const cfg = placeCfg();
  return cfg.sources.find(s => s.id === countryGameState.source) || cfg.sources[0];
}
function placeTargetMeta(id) {
  return placeCfg().targets.find(t => t.id === id) || placeCfg().targets[0];
}
function countryModeLabel() {
  const s = sourceMeta();
  const ts = countryGameState.targets.map(placeTargetMeta);
  return `${s.label} → ${ts.map(t => t.label).join(' + ')}`;
}
function countryTotalSubQuestions() {
  return countryGameState.queue.length * countryGameState.targets.length;
}
// Réponses valides (tapées) acceptées pour un champ.
function placeAnswersFor(item, fieldId) {
  switch (fieldId) {
    case 'capital': return placeCapitalAnswers(item);
    case 'number': return [item.code].filter(Boolean);
    case 'region': return (item.region && item.region.nom) ? [item.region.nom] : [];
    case 'prefecture': return item.prefecture ? [item.prefecture] : [];
    case 'chef-lieu': return item.chefLieu ? [item.chefLieu] : [];
    default: return placeNameAnswers(item); // 'name'
  }
}
// Bonne réponse (texte FR) affichée pour un champ.
function placeCorrectText(item, fieldId) {
  switch (fieldId) {
    case 'capital': return placeFrCapital(item);
    case 'number': return item.code || '—';
    case 'region': return (item.region && item.region.nom) ? item.region.nom : '—';
    case 'prefecture': return item.prefecture || '—';
    case 'chef-lieu': return item.chefLieu || '—';
    default: return placeFrName(item); // 'name'
  }
}

// Ouvre l'écran de jeu pour un scope donné (world / us).
function openPlaceGame(scope) {
  countryGameState.scope = scope;
  const cfg = placeCfg();
  // valeurs par défaut adaptées au scope
  countryGameState.source = cfg.sources[0].id;
  countryGameState.targets = [cfg.targets[0].id];
  countryGameState.sessionSize = cfg.sizes[0].n;
  countryGameState.continent = 'all';
  const hdr = document.getElementById('country-progress-text');
  if (hdr) hdr.textContent = cfg.header;
  const title = document.getElementById('country-setup-title');
  if (title) title.textContent = cfg.title;
  const sub = document.getElementById('country-setup-subtitle');
  if (sub) sub.textContent = cfg.subtitle;
  showScreen('geo-countries-screen');
  buildCountryOptionButtons();
  showCountrySetup();
}

function startCountryGame() {
  const errEl = document.getElementById('country-setup-error');
  if (errEl) errEl.textContent = '';
  if (!countryGameState.targets.length) {
    if (errEl) errEl.textContent = 'Choisis au moins une sortie à retrouver.';
    return;
  }

  loadGeoData().then(() => {
    if (!placeItems().length) {
      alert('Impossible de charger les données.');
      return;
    }

    // Seed reproductible : permet de rejouer la MÊME sélection via un lien de défi.
    // On garde le seed s'il vient d'un défi entrant, sinon on en tire un neuf.
    if (!countryGameState.seedKeep) { countryGameState.seed = Math.random().toString(36).slice(2, 9); countryGameState.challengerScore = null; }
    countryGameState.seedKeep = false;
    countryGameState.fromSeed = true;
    countryGameState.queue = buildCountryQueue();
    countryGameState.currentIndex = 0;
    countryGameState.score = 0;
    countryGameState.total = 0;
    countryGameState.completed = false;
    countryGameState.answered = false;
    countryGameState.recorded = false;
    countryGameState.sessionErrors = [];
    countryGameState.correctList = [];
    countryGameState.deptsFound = null;
    countryGameState.fieldResults = {};
    countryGameState.curErrPushed = false;
    countryGameState.current = countryGameState.queue[0] || null;

    const setup = document.getElementById('country-setup-panel');
    const play = document.getElementById('country-play-panel');
    if (setup) setup.style.display = 'none';
    if (play) play.style.display = 'block';

    renderCountryGame();
  });
}

// Démarre une session sur une liste de lieux donnée (utilisé pour le rejeu des erreurs).
function startCountryGameWith(items) {
  countryGameState.fromSeed = false; // file arbitraire (rejeu d'erreurs) → non partageable
  countryGameState.queue = shuffleArray([...items]);
  countryGameState.currentIndex = 0;
  countryGameState.score = 0;
  countryGameState.total = 0;
  countryGameState.completed = false;
  countryGameState.answered = false;
  countryGameState.recorded = false;
  countryGameState.sessionErrors = [];
  countryGameState.correctList = [];
    countryGameState.deptsFound = null;
  countryGameState.fieldResults = {};
  countryGameState.curErrPushed = false;
  countryGameState.current = countryGameState.queue[0] || null;
  document.getElementById('country-setup-panel').style.display = 'none';
  document.getElementById('country-play-panel').style.display = 'block';
  renderCountryGame();
}

function replayCountryErrors() {
  if (!countryGameState.sessionErrors.length) return;
  startCountryGameWith(countryGameState.sessionErrors);
}

function buildCountryQueue() {
  let pool = placeItems();
  // Filtre continent (pays du monde uniquement).
  if (countryGameState.scope === 'world' && countryGameState.continent !== 'all') {
    pool = pool.filter(c => c.region === countryGameState.continent);
  }
  // La carte (en entrée OU en sortie-clic) exige un tracé.
  const needsFeature = countryGameState.source === 'map' || countryGameState.targets.some(targetIsClick);
  if (needsFeature) pool = pool.filter(c => c.feature);
  // Ordre stable (par clé) avant le tirage seedé, pour que le même seed donne
  // exactement la même sélection chez l'ami (indépendant de l'ordre de chargement).
  pool = [...pool].sort((a, b) => String(placeKeyOf(a)).localeCompare(String(placeKeyOf(b))));
  const rng = makeRng('geo-' + (countryGameState.seed || 'x'));
  return selectSeededItems(pool, countryGameState.sessionSize, rng);
}

function getCurrentCountry() {
  return countryGameState.queue[countryGameState.currentIndex] || null;
}

function renderCountryGame() {
  const current = getCurrentCountry();
  countryGameState.current = current;

  const totalSub = countryTotalSubQuestions();
  const N = countryGameState.queue.length;
  const source = sourceMeta();
  const answered = countryGameState.answered;

  const banner = document.getElementById('country-mode-banner');
  const status = document.getElementById('country-status');
  const clue = document.getElementById('country-clue');
  const flag = document.getElementById('country-flag');
  const mapBox = document.getElementById('country-map-box');
  const mapPlaceholder = document.getElementById('country-map-placeholder');
  const answersEl = document.getElementById('country-answers');
  const feedback = document.getElementById('country-feedback');
  const validateBtn = document.getElementById('country-validate-btn');
  const nextBtn = document.getElementById('country-next-btn');
  const skipBtn = document.getElementById('country-skip-btn');
  const resetBtn = document.getElementById('country-reset-btn');
  const resultCard = document.getElementById('country-result-card');

  if (banner) banner.textContent = `${countryModeLabel()} · réponse libre`;

  if (status) {
    status.textContent = `${Math.min(countryGameState.currentIndex + 1, N)} / ${N} · ${countryGameState.score} bonne${countryGameState.score > 1 ? 's' : ''} réponse${countryGameState.score > 1 ? 's' : ''}`;
  }

  const scope = placeScope();
  const srcId = source.id;
  const hasClick = countryGameState.targets.some(targetIsClick);
  const clickDone = !!(countryGameState.fieldResults && countryGameState.fieldResults.map);

  // INDICE tapé/textuel (nom, numéro, préfecture).
  if (clue) {
    if (!current) clue.textContent = 'Session terminée.';
    else if (srcId === 'name') clue.textContent = placeFrName(current);
    else if (srcId === 'number') clue.textContent = `Département n° ${current.code}`;
    else if (srcId === 'prefecture') clue.textContent = `Préfecture : ${current.prefecture || '—'}`;
    else if (srcId === 'chef-lieu') clue.textContent = `Chef-lieu : ${current.chefLieu || '—'}`;
    else clue.textContent = ''; // flag / carte = indices visuels
  }

  // INDICE drapeau : emoji (pays) ou image (régions FR).
  if (flag) {
    const showFlag = srcId === 'flag';
    flag.style.display = showFlag ? 'block' : 'none';
    if (showFlag && current) {
      flag.innerHTML = (scope === 'fr-region')
        ? `<img class="region-flag-img" src="./data/flags/${current.code}.svg" alt="drapeau région">`
        : `<span>${placeFlag(current)}</span>`;
    } else flag.innerHTML = '';
  }

  // CARTE : soit indice (entrée = carte, région/pays en surbrillance), soit
  // cible cliquable (une sortie = "placer sur la carte").
  if (mapBox) {
    if (srcId === 'map' && current && !countryGameState.completed) {
      mapBox.style.display = 'block';
      renderCountryMap(current);                 // indice : lieu en surbrillance
    } else if (hasClick && current && !countryGameState.completed) {
      mapBox.style.display = 'block';
      renderCountryClickMap();                    // cible : carte entière cliquable
    } else {
      mapBox.style.display = 'none';
    }
  }
  if (mapPlaceholder) mapPlaceholder.style.display = 'none';
  if (feedback) { feedback.className = 'feedback geo-feedback'; feedback.innerHTML = ''; }

  // Champs de réponse (sorties).
  if (answersEl) {
    const results = countryGameState.fieldResults || {};
    if (countryGameState.completed || !current) {
      answersEl.innerHTML = '';
    } else if (countryGameState.targets.length === 1 && targetIsList(countryGameState.targets[0])) {
      // Sortie unique "lister ses départements" : mini-jeu de recensement.
      renderDeptsListField(answersEl, current, results);
    } else {
      const typed = countryGameState.targets.filter(t => !targetIsClick(t) && !targetIsList(t));
      let html = '';
      // Bloc "carte cliquée" (sortie map) : pas d'input, validé au clic sur la carte.
      if (hasClick) {
        const mres = results.map;
        const fbTxt = mres ? (mres.correct ? `✅ ${mres.correctText}` : `❌ ${mres.correctText}`) : 'Clique la bonne case sur la carte ci-dessus.';
        html += `<div class="geo-answer-field"><div class="geo-answer-label">🖱️ Placer sur la carte</div><div class="geo-field-fb ${mres ? (mres.correct ? 'ok' : 'ko') : ''}" data-fb="map">${fbTxt}</div></div>`;
      }
      html += typed.map(tid => {
        const meta = placeTargetMeta(tid);
        return `
          <div class="geo-answer-field">
            <div class="geo-answer-label">${meta.label}</div>
            <div class="geo-answer-row">
              <input type="text" class="answer-input" data-target="${tid}" placeholder="${meta.placeholder}" autocomplete="off" autocapitalize="off" spellcheck="false" onkeydown="countryFieldKey(event, '${tid}')">
            </div>
            <div class="geo-field-fb" data-fb="${tid}"></div>
          </div>`;
      }).join('');
      answersEl.innerHTML = html;
      // Champs déjà validés.
      answersEl.querySelectorAll('.answer-input').forEach(inp => {
        const tid = inp.dataset.target;
        const res = results[tid];
        if (res) {
          inp.value = res.userVal;
          inp.disabled = true;
          inp.classList.add(res.correct ? 'correct' : 'wrong');
          const fb = answersEl.querySelector(`[data-fb="${tid}"]`);
          if (fb) { fb.className = `geo-field-fb ${res.correct ? 'ok' : 'ko'}`; fb.textContent = res.correct ? `✅ ${res.correctText}` : `❌ ${res.correctText}`; }
        }
      });
      // Enchaînement "clic d'abord" : tant que la carte n'est pas cliquée, on bloque les champs tapés.
      if (hasClick && !clickDone) {
        answersEl.querySelectorAll('.answer-input:not([disabled])').forEach(i => { i.disabled = true; i.placeholder = "Clique d'abord sur la carte…"; });
      }
      const firstOpen = answersEl.querySelector('.answer-input:not([disabled])');
      if (firstOpen) firstOpen.focus();
    }
  }

  // "Valider" valide d'un coup les champs restants (raccourci) ; sinon Entrée champ par champ.
  if (validateBtn) validateBtn.style.display = (!countryGameState.completed && current && !answered) ? 'inline-flex' : 'none';

  if (countryGameState.completed) {
    nextBtn.style.display = 'none';
    skipBtn.style.display = 'none';
    resetBtn.style.display = 'inline-flex';
    resultCard.style.display = 'block';
    const pct = totalSub > 0 ? Math.round((countryGameState.score / totalSub) * 100) : 0;
    const key = `${countryGameState.scope === 'us' ? 'usa' : 'pays'}:${countryGameState.source}->${countryGameState.targets.join('+')}`;
    if (!countryGameState.recorded) { recordGeoScore(key, countryGameState.score); countryGameState.recorded = true; }
    const nbErr = countryGameState.sessionErrors.length;
    const replayBtn = nbErr > 0
      ? `<button class="geo-action-btn primary" style="margin-top:12px;" onclick="replayCountryErrors()">🔁 Revoir mes ${nbErr} erreur${nbErr > 1 ? 's' : ''}</button>`
      : '';
    // Comparaison si on arrive via un lien de défi.
    const challLine = (countryGameState.challengerScore != null)
      ? `<div style="margin-top:8px;font-weight:700;color:${countryGameState.score >= countryGameState.challengerScore ? 'var(--accent-green)' : 'var(--accent-red)'};">Ton ami avait fait ${countryGameState.challengerScore}/${totalSub} — ${countryGameState.score >= countryGameState.challengerScore ? 'tu gagnes ! 🏆' : 'battu de ' + (countryGameState.challengerScore - countryGameState.score) + ' 😬'}</div>`
      : '';
    // Défier un ami : seulement sur une session reproductible (pas le rejeu d'erreurs).
    const shareBtn = countryGameState.fromSeed
      ? `<button class="geo-action-btn primary" style="margin-top:12px;" onclick="shareCountryGame(${countryGameState.score})">⚔️ Défier un ami (même partie)</button>`
      : '';
    resultCard.innerHTML = `
      <div class="geo-result-title">Session terminée</div>
      <div class="geo-result-text">${countryGameState.score} bonne${countryGameState.score > 1 ? 's' : ''} réponse${countryGameState.score > 1 ? 's' : ''} sur ${totalSub}. Précision : ${pct}%.${geoRecordLine(key)}</div>
      ${challLine}
      ${replayBtn}
      ${shareBtn}
    `;
  } else {
    countryGameState.recorded = false;
    resultCard.style.display = 'none';
    nextBtn.style.display = answered ? 'inline-flex' : 'none';
    skipBtn.style.display = answered ? 'none' : 'inline-flex';
    resetBtn.style.display = 'none';
  }
  // "Terminer" : arrêter en cours de partie (les non-répondus iront dans le rejeu).
  const finishBtn = document.getElementById('country-finish-btn');
  if (finishBtn) finishBtn.style.display = (!countryGameState.completed && current) ? 'inline-flex' : 'none';

  // Liste verte des lieux trouvés (s'accumule).
  const foundList = document.getElementById('country-found-list');
  if (foundList) {
    const cl = countryGameState.correctList || [];
    foundList.innerHTML = cl.length
      ? `<div class="geo-region-block"><div class="geo-region-title">Trouvés (${cl.length})</div><div class="geo-dept-list">${cl.map(it => `<span class="geo-dept-pill ok">${placeFrName(it)}</span>`).join('')}</div></div>`
      : '';
  }
}

let countryMapZoom = null;   // instance d3.zoom (pour les boutons +/-)
let countryMapSvg = null;    // sélection d3 du svg courant

// Dessine une carte zoomable centrée sur `feature` (avec voisins). `green`=true
// colore le lieu en vert (réponse correcte). Renvoie {svg, zoom}.
function drawZoomMap(box, geojson, feature, green) {
  box.querySelectorAll('svg').forEach(svg => svg.remove());
  if (!feature) return null;
  const width = Math.max(320, box.clientWidth || 900);
  const height = Math.max(320, Math.round(width * 0.6));
  const svg = d3.select(box).append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);
  const projection = d3.geoMercator().fitExtent([[18, 18], [width - 18, height - 18]], feature);
  const path = d3.geoPath(projection);
  projection.scale(projection.scale() * 0.25);  // dézoom pour voir les voisins
  const c = projection(d3.geoCentroid(feature));
  if (c && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
    const t = projection.translate();
    projection.translate([t[0] + (width / 2 - c[0]), t[1] + (height / 2 - c[1])]);
  }
  const fill = green ? 'rgba(75,122,88,0.6)' : 'rgba(201,100,66,0.62)';
  const stroke = green ? 'var(--accent-green)' : 'var(--accent-orange)';
  const isHi = o => o === feature;   // identité (les geojson n'ont pas tous une clé `name`)
  const g = svg.append('g');
  g.selectAll('path').data(geojson.features).join('path')
    .attr('d', path)
    .attr('fill', o => isHi(o) ? fill : 'rgba(201,100,66,0.06)')
    .attr('stroke', o => isHi(o) ? stroke : 'rgba(110,103,96,0.55)')
    .attr('stroke-width', o => isHi(o) ? 2 : 0.8)
    .attr('vector-effect', 'non-scaling-stroke');
  const zoom = d3.zoom().scaleExtent([0.18, 12]).on('zoom', e => g.attr('transform', e.transform));
  svg.call(zoom).on('dblclick.zoom', null);
  return { svg, zoom };
}

function renderCountryMap(country) {
  const box = document.getElementById('country-map-box');
  const geojson = placeGeojson();
  if (!box || !geojson || !window.d3) { countryMapZoom = countryMapSvg = null; return; }
  const feature = placeFeatureOf(country);
  // Vert si le NOM du lieu courant a été trouvé correctement.
  const nameRes = countryGameState.fieldResults && countryGameState.fieldResults.name;
  const green = !!(nameRes && nameRes.correct);
  const r = drawZoomMap(box, geojson, feature, green);
  countryMapSvg = r ? r.svg : null;
  countryMapZoom = r ? r.zoom : null;
}

function zoomCountryMap(factor) {
  if (!countryMapSvg || !countryMapZoom) return;
  countryMapSvg.call(countryMapZoom.scaleBy, factor);
}

// Carte ENTIÈRE cliquable, pour la sortie "placer sur la carte".
function renderCountryClickMap() {
  const box = document.getElementById('country-map-box');
  const geojson = placeGeojson();
  if (!box || !geojson || !window.d3) { countryMapZoom = countryMapSvg = null; return; }
  box.querySelectorAll('svg').forEach(s => s.remove());
  const current = getCurrentCountry();
  const curFeat = current && placeFeatureOf(current);
  const answered = countryGameState.answered;
  const mres = countryGameState.fieldResults && countryGameState.fieldResults.map;
  const revealed = !!mres; // on a déjà cliqué → on révèle la bonne case

  const width = Math.max(320, box.clientWidth || 900);
  const height = Math.max(320, Math.round(width * (placeIsFrance() ? 0.82 : 0.58)));
  const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);
  const projection = d3.geoMercator().fitSize([width - 12, height - 12], geojson);
  const path = d3.geoPath(projection);
  const g = svg.append('g');
  g.selectAll('path').data(geojson.features).join('path')
    .attr('d', path)
    .attr('fill', f => {
      if (revealed && f === curFeat) return (mres.correct ? 'rgba(75,122,88,0.6)' : 'rgba(201,100,66,0.62)');
      return 'rgba(201,100,66,0.07)';
    })
    .attr('stroke', f => (revealed && f === curFeat) ? (mres.correct ? 'var(--accent-green)' : 'var(--accent-orange)') : 'rgba(110,103,96,0.5)')
    .attr('stroke-width', f => (revealed && f === curFeat) ? 1.8 : 0.6)
    .attr('vector-effect', 'non-scaling-stroke')
    .attr('cursor', (!answered && !revealed) ? 'pointer' : 'default')
    .on('click', (!answered && !revealed) ? (event, f) => handleCountryMapClick(f) : null);
  const zoom = d3.zoom().scaleExtent([0.5, 12]).on('zoom', e => g.attr('transform', e.transform));
  svg.call(zoom).on('dblclick.zoom', null);
  countryMapSvg = svg;
  countryMapZoom = zoom;
}

// Clic sur une case de la carte = réponse à la sortie "map".
function handleCountryMapClick(feature) {
  if (countryGameState.completed || countryGameState.answered) return;
  if (!countryGameState.targets.some(targetIsClick)) return;
  const results = countryGameState.fieldResults || (countryGameState.fieldResults = {});
  if (results.map) return;
  const current = getCurrentCountry();
  if (!current) return;
  const ok = (feature === placeFeatureOf(current));
  results.map = { userVal: '(clic)', correct: ok, correctText: placeFrName(current) };
  countryGameState.total++;
  if (ok) countryGameState.score++; else markCountryError(current);
  if (countryGameState.targets.every(t => results[t])) {
    countryGameState.answered = true;
    markCountryAcquiredIfPerfect(current);
  }
  renderCountryGame();
}

// Sortie "lister ses départements" (niveau Région) : mini-recensement.
function renderDeptsListField(answersEl, region, results) {
  const all = deptsOfRegion(region);
  const found = countryGameState.deptsFound || (countryGameState.deptsFound = new Set());
  const done = !!results.depts;
  const pills = all.filter(d => found.has(d.code))
    .map(d => `<span class="geo-dept-pill ok">${d.code} · ${d.nom}</span>`).join('');
  answersEl.innerHTML = `
    <div class="geo-answer-field">
      <div class="geo-answer-label">🏛️ Départements de ${region.nom} — ${found.size} / ${all.length}</div>
      ${done ? '' : `<div class="geo-answer-row"><input type="text" class="answer-input" id="depts-input" placeholder="Un département de cette région…" autocomplete="off" autocapitalize="off" spellcheck="false" onkeydown="deptsListKey(event)"></div>`}
      <div class="geo-field-fb" id="depts-fb"></div>
      <div class="geo-list-box">${pills ? `<div class="geo-region-block"><div class="geo-dept-list">${pills}</div></div>` : ''}</div>
      ${done ? `<div class="geo-field-fb ${results.depts.correct ? 'ok' : 'ko'}">${results.depts.correct ? '✅ Tous les départements trouvés !' : ('Manquants : ' + (results.depts.correctText || '—'))}</div>` : ''}
    </div>`;
  if (!done) { const i = document.getElementById('depts-input'); if (i) i.focus(); }
}

function deptsListKey(event) {
  if (event.key !== 'Enter') return;
  event.preventDefault(); event.stopPropagation();
  if (countryGameState.answered || countryGameState.completed) return;
  const region = getCurrentCountry();
  if (!region) return;
  const inp = document.getElementById('depts-input');
  const val = inp.value.trim();
  if (!val) return;
  const all = deptsOfRegion(region);
  const found = countryGameState.deptsFound || (countryGameState.deptsFound = new Set());
  const fb = document.getElementById('depts-fb');
  const match = all.find(d => !found.has(d.code) && (fuzzyEqual(d.nom, val) || normalize(d.code) === normalize(val)));
  if (match) {
    found.add(match.code);
    if (found.size >= all.length) {
      const results = countryGameState.fieldResults || (countryGameState.fieldResults = {});
      results.depts = { userVal: '', correct: true, correctText: '' };
      countryGameState.total++; countryGameState.score++;
      if (countryGameState.targets.every(t => results[t])) { countryGameState.answered = true; markCountryAcquiredIfPerfect(region); }
    }
    renderCountryGame();   // met à jour les pastilles (et l'état si terminé)
  } else if (fb) {
    // déjà trouvé, ou pas dans cette région, ou inconnu — pas de re-render (garder le message).
    fb.className = 'geo-field-fb ko';
    fb.textContent = all.some(d => found.has(d.code) && (fuzzyEqual(d.nom, val) || normalize(d.code) === normalize(val)))
      ? '↩️ Déjà cité.' : `🤔 « ${val} » n'est pas un département de cette région.`;
    inp.value = '';
  }
}

// Entrée dans un champ → valide CE champ uniquement, puis passe au suivant.
function countryFieldKey(event, tid) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  event.stopPropagation();   // ne pas déclencher le handler global (qui gère "Suivant")
  validateCountryField(tid);
}

// Marque la session courante comme ratée (une seule fois) pour le rejeu.
function markCountryError(current) {
  if (!countryGameState.curErrPushed) {
    countryGameState.sessionErrors.push(current);
    countryGameState.curErrPushed = true;
  }
}

// Si tous les champs du lieu sont corrects → il rejoint la liste verte des "trouvés".
function markCountryAcquiredIfPerfect(current) {
  const r = countryGameState.fieldResults || {};
  const perfect = countryGameState.targets.every(t => r[t] && r[t].correct);
  if (perfect && !(countryGameState.correctList || (countryGameState.correctList = [])).includes(current)) {
    countryGameState.correctList.push(current);
  }
}

// Valide un seul champ.
function validateCountryField(tid) {
  if (countryGameState.completed || countryGameState.answered) return;
  const current = getCurrentCountry();
  if (!current) return;
  const results = countryGameState.fieldResults || (countryGameState.fieldResults = {});
  if (results[tid]) return; // déjà validé
  const answersEl = document.getElementById('country-answers');
  const inp = answersEl.querySelector(`.answer-input[data-target="${tid}"]`);
  if (!inp) return;
  const val = inp.value.trim();
  if (!val) return; // on n'auto-valide pas un champ vide via Entrée
  const ok = fuzzyMatchAny(placeAnswersFor(current, tid), val);
  results[tid] = { userVal: val, correct: ok, correctText: placeCorrectText(current, tid) };
  countryGameState.total++;
  if (ok) countryGameState.score++; else markCountryError(current);
  // Tous les champs validés ? → on passe en mode "répondu".
  if (countryGameState.targets.every(t => results[t])) {
    countryGameState.answered = true;
    markCountryAcquiredIfPerfect(current);
  }
  renderCountryGame();
}

// Bouton "Valider" : valide d'un coup les champs TAPÉS restants (la carte se valide au clic).
function checkCountryAnswer() {
  if (countryGameState.completed || countryGameState.answered) return;
  const current = getCurrentCountry();
  if (!current) return;
  const results = countryGameState.fieldResults || (countryGameState.fieldResults = {});
  const answersEl = document.getElementById('country-answers');
  countryGameState.targets.forEach(tid => {
    if (results[tid] || targetIsClick(tid) || targetIsList(tid)) return; // carte/liste : pas de champ texte
    const inp = answersEl.querySelector(`.answer-input[data-target="${tid}"]`);
    const val = inp ? inp.value.trim() : '';
    const ok = !!val && fuzzyMatchAny(placeAnswersFor(current, tid), val);
    results[tid] = { userVal: val, correct: ok, correctText: placeCorrectText(current, tid) };
    countryGameState.total++;
    if (ok) countryGameState.score++; else markCountryError(current);
  });
  // Répondu seulement si TOUTES les sorties (y compris carte cliquée) sont faites.
  if (countryGameState.targets.every(t => results[t])) {
    countryGameState.answered = true;
    markCountryAcquiredIfPerfect(current);
  }
  renderCountryGame();
}

function skipCountry() {
  if (countryGameState.completed || countryGameState.answered) return;
  const current = getCurrentCountry();
  if (!current) return;
  const results = countryGameState.fieldResults || (countryGameState.fieldResults = {});
  // Les champs non encore validés sont révélés comme ratés.
  countryGameState.targets.forEach(tid => {
    if (results[tid]) return;
    const correctText = targetIsList(tid) ? deptsOfRegion(current).map(d => d.nom).join(', ') : placeCorrectText(current, tid);
    results[tid] = { userVal: '', correct: false, correctText };
    countryGameState.total++;
    markCountryError(current);
  });
  countryGameState.answered = true;
  renderCountryGame();
}

function nextCountry() {
  if (countryGameState.completed) return;
  countryGameState.currentIndex++;
  countryGameState.answered = false;
  countryGameState.fieldResults = {};
  countryGameState.deptsFound = null;
  countryGameState.curErrPushed = false;
  if (countryGameState.currentIndex >= countryGameState.queue.length) {
    countryGameState.completed = true;
  }
  renderCountryGame();
}

// Terminer en cours : le lieu courant (si pas répondu) + tous les suivants
// rejoignent les erreurs à revoir.
function finishCountryGame() {
  if (countryGameState.completed) return;
  for (let i = countryGameState.currentIndex; i < countryGameState.queue.length; i++) {
    const item = countryGameState.queue[i];
    const currentAnswered = (i === countryGameState.currentIndex && countryGameState.answered);
    if (!currentAnswered && !countryGameState.sessionErrors.includes(item)) {
      countryGameState.sessionErrors.push(item);
    }
  }
  countryGameState.completed = true;
  renderCountryGame();
}

function resetCountryGame() {
  countryGameState.queue = [];
  countryGameState.currentIndex = 0;
  countryGameState.score = 0;
  countryGameState.total = 0;
  countryGameState.completed = false;
  countryGameState.answered = false;
  countryGameState.current = null;
  countryGameState.fieldResults = {};
  countryGameState.curErrPushed = false;
  countryGameState.sessionErrors = [];
  showCountrySetup();
  const feedback = document.getElementById('country-feedback');
  feedback.className = 'feedback geo-feedback';
  feedback.innerHTML = '';
  document.getElementById('country-result-card').style.display = 'none';
}
