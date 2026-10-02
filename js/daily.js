// Défi du jour (déterministe depuis la date) et défis partagés.
// Scripts classiques (pas de modules) : les déclarations top-level sont partagées
// entre fichiers. Ordre de chargement : state → culture → geo → daily → main.

// ======================================
// DÉFI DU JOUR (déterministe depuis la date → même défi pour tous, auto-renouvelé)
// ======================================
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
  return function () { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); h ^= h >>> 16; return h >>> 0; };
}
function mulberry32(a) {
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function makeRng(seedStr) { return mulberry32(xmur3(seedStr)()); }
function seededPick(arr, rng, n) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return n == null ? a : a.slice(0, n);
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function shiftDay(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function itemsForScope(scope) {
  if (scope === 'us') return geoData.usStates;
  if (scope === 'fr-region') return geoData.regions;
  if (scope === 'fr-dept') return geoData.departments;
  return geoData.countries;
}
// Modèles de questions géo (entrée→sorties variées, dont du multi + clic-carte).
const DAILY_FRANCE = [
  { scope: 'fr-dept', source: 'map', targets: ['name'] },
  { scope: 'fr-dept', source: 'name', targets: ['region', 'prefecture'] },
  { scope: 'fr-dept', source: 'number', targets: ['name'] },
  { scope: 'fr-dept', source: 'name', targets: ['map'] },
  { scope: 'fr-dept', source: 'prefecture', targets: ['name'] },
  { scope: 'fr-dept', source: 'map', targets: ['name', 'region'] },
  { scope: 'fr-region', source: 'flag', targets: ['name'] },
  { scope: 'fr-region', source: 'map', targets: ['name'] },
  { scope: 'fr-region', source: 'name', targets: ['map'] },
];
const DAILY_MONDE = [
  { scope: 'world', source: 'flag', targets: ['name'] },
  { scope: 'world', source: 'flag', targets: ['capital'] },
  { scope: 'world', source: 'map', targets: ['name'] },
  { scope: 'world', source: 'name', targets: ['capital'] },
  { scope: 'world', source: 'flag', targets: ['name', 'capital'] },
  { scope: 'world', source: 'map', targets: ['name', 'capital'] },
  { scope: 'world', source: 'name', targets: ['map'] },
];
function pickGeoItem(t, rng) {
  let pool = itemsForScope(t.scope);
  const needsFeature = t.source === 'map' || t.targets.includes('map');
  if (needsFeature) pool = pool.filter(x => x.feature);
  return seededPick(pool, rng, 1)[0];
}

function buildDailySet(dateStr) {
  const rng = makeRng('defi-' + dateStr);
  const set = [];
  const ab = ALL_QUESTIONS.filter(q => q.difficulty === 'abordable');
  const ex = ALL_QUESTIONS.filter(q => q.difficulty === 'expert');
  seededPick(ab, rng, 4).forEach(q => set.push({ kind: 'culture', q }));
  seededPick(ex, rng, 4).forEach(q => set.push({ kind: 'culture', q }));
  seededPick(DAILY_FRANCE, rng, 4).forEach(t => { const item = pickGeoItem(t, rng); if (item) set.push({ kind: 'geo', ...t, item }); });
  seededPick(DAILY_MONDE, rng, 4).forEach(t => { const item = pickGeoItem(t, rng); if (item) set.push({ kind: 'geo', ...t, item }); });
  return seededPick(set, rng); // ordre mélangé (seedé)
}

let dailyState = { date: null, isToday: true, challengerScore: null, set: [], index: 0, correct: 0, answered: false, fieldResults: {} };

function openDaily(dateOverride, challengerScore) {
  loadGeoData().then(() => {
    if (!ALL_QUESTIONS.length) { alert('Les questions ne sont pas encore chargées.'); return; }
    const date = dateOverride || todayStr();
    dailyState = { date, isToday: date === todayStr(), challengerScore: (challengerScore != null ? challengerScore : null), set: buildDailySet(date), index: 0, correct: 0, answered: false, fieldResults: {}, log: [] };
    document.getElementById('daily-result').style.display = 'none';
    document.getElementById('daily-play').style.display = 'flex';
    showScreen('daily-screen');
    renderDaily();
  });
}

function currentDaily() { return dailyState.set[dailyState.index] || null; }

function renderDaily() {
  const q = currentDaily();
  const N = dailyState.set.length;
  document.getElementById('daily-progress').textContent = `Défi du jour · ${Math.min(dailyState.index + 1, N)} / ${N}`;
  document.getElementById('daily-fill').style.width = `${(dailyState.index / N) * 100}%`;
  const fb = document.getElementById('daily-feedback'); fb.className = 'feedback geo-feedback'; fb.innerHTML = '';
  document.getElementById('daily-next').style.display = 'none';
  const badges = document.getElementById('daily-badges');
  const banner = document.getElementById('daily-banner');
  const flag = document.getElementById('daily-flag');
  const mapBox = document.getElementById('daily-map-box');
  const question = document.getElementById('daily-question');
  const answers = document.getElementById('daily-answers');
  const validate = document.getElementById('daily-validate');
  dailyState.answered = false;
  dailyState.fieldResults = {};
  dailyMapZoom = dailyMapSvg = null;
  flag.style.display = 'none'; mapBox.style.display = 'none'; banner.style.display = 'none';

  if (!q) return;

  if (q.kind === 'culture') {
    const info = THEME_MAP[q.q.theme] || { emoji: '📌', cls: 'theme-classique' };
    badges.innerHTML = `<span class="difficulty-badge ${q.q.difficulty === 'expert' ? 'expert' : 'abordable'}">${q.q.difficulty === 'expert' ? '🔴 Expert' : '🟢 Abordable'}</span><span class="theme-badge ${info.cls}">${info.emoji} ${q.q.theme}</span>`;
    question.textContent = q.q.question;
    answers.innerHTML = `<div class="geo-answer-field"><div class="geo-answer-row"><input type="text" class="answer-input" data-target="culture" placeholder="Ta réponse..." autocomplete="off" autocapitalize="off" spellcheck="false" onkeydown="dailyFieldKey(event,'culture')"></div><div class="geo-field-fb" data-fb="culture"></div></div>`;
    const ci = answers.querySelector('.answer-input'); if (ci) { ci.value = ''; ci.focus(); }
    validate.style.display = 'inline-flex';
    return;
  }

  // Question géo : on configure le contexte du moteur géo pour réutiliser ses helpers.
  countryGameState.scope = q.scope; countryGameState.source = q.source; countryGameState.targets = q.targets;
  const cfg = placeCfg();
  const srcMeta = cfg.sources.find(s => s.id === q.source) || {};
  const tLabels = q.targets.map(id => (cfg.targets.find(t => t.id === id) || {}).label).join(' + ');
  badges.innerHTML = `<span class="difficulty-badge" style="background:rgba(201,100,66,0.14);color:var(--accent-orange);">${q.scope.startsWith('fr') ? '🇫🇷 Géo France' : '🌍 Géo Monde'}</span>`;
  banner.style.display = 'block';
  banner.textContent = `${srcMeta.label || ''} → ${tLabels}`;

  // Indice (entrée).
  if (q.source === 'flag') {
    flag.style.display = 'block';
    flag.innerHTML = (q.scope === 'fr-region') ? `<img class="region-flag-img" src="./data/flags/${q.item.code}.svg" alt="drapeau">` : `<span>${placeFlag(q.item)}</span>`;
  }
  if (q.source === 'map') { mapBox.style.display = 'block'; const r = drawZoomMap(mapBox, placeGeojson(), placeFeatureOf(q.item), false); dailyMapSvg = r && r.svg; dailyMapZoom = r && r.zoom; }
  question.textContent = q.source === 'name' ? placeFrName(q.item)
    : q.source === 'number' ? `Département n° ${q.item.code}`
    : q.source === 'prefecture' ? `Préfecture : ${q.item.prefecture}`
    : '';

  // Sorties.
  const isClick = q.targets.length === 1 && q.targets[0] === 'map';
  if (isClick) {
    mapBox.style.display = 'block';
    drawDailyClickMap(q.item);
    answers.innerHTML = `<div class="geo-answer-label">🖱️ Clique le bon endroit sur la carte.</div>`;
    validate.style.display = 'none';
  } else {
    answers.innerHTML = q.targets.map(tid => {
      const meta = cfg.targets.find(t => t.id === tid) || {};
      return `<div class="geo-answer-field"><div class="geo-answer-label">${meta.label}</div><div class="geo-answer-row"><input type="text" class="answer-input" data-target="${tid}" placeholder="${meta.placeholder || 'Réponse...'}" autocomplete="off" autocapitalize="off" spellcheck="false" onkeydown="dailyFieldKey(event,'${tid}')"></div><div class="geo-field-fb" data-fb="${tid}"></div></div>`;
    }).join('');
    answers.querySelectorAll('.answer-input').forEach(i => { i.value = ''; });
    validate.style.display = 'inline-flex';
    const i = answers.querySelector('.answer-input'); if (i) i.focus();
  }
}

let dailyMapZoom = null, dailyMapSvg = null;
function zoomDailyMap(f) { if (dailyMapSvg && dailyMapZoom) dailyMapSvg.call(dailyMapZoom.scaleBy, f); }

function drawDailyClickMap(item) {
  const box = document.getElementById('daily-map-box');
  const geojson = placeGeojson();
  if (!box || !geojson || !window.d3) return;
  box.querySelectorAll('svg').forEach(s => s.remove());
  const correctFeat = placeFeatureOf(item);
  const done = !!dailyState.fieldResults.map;
  const ok = done && dailyState.fieldResults.map.correct;
  const width = Math.max(320, box.clientWidth || 900);
  const height = Math.max(320, Math.round(width * (countryGameState.scope.startsWith('fr') ? 0.82 : 0.58)));
  const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);
  const projection = d3.geoMercator().fitSize([width - 12, height - 12], geojson);
  const path = d3.geoPath(projection);
  const g = svg.append('g');
  g.selectAll('path').data(geojson.features).join('path')
    .attr('d', path)
    .attr('fill', f => (done && f === correctFeat) ? (ok ? 'rgba(75,122,88,0.6)' : 'rgba(201,100,66,0.62)') : 'rgba(201,100,66,0.07)')
    .attr('stroke', f => (done && f === correctFeat) ? (ok ? 'var(--accent-green)' : 'var(--accent-orange)') : 'rgba(110,103,96,0.5)')
    .attr('stroke-width', f => (done && f === correctFeat) ? 1.8 : 0.6)
    .attr('vector-effect', 'non-scaling-stroke')
    .attr('cursor', done ? 'default' : 'pointer')
    .on('click', done ? null : (event, f) => handleDailyMapClick(f, correctFeat));
  const zoom = d3.zoom().scaleExtent([0.5, 12]).on('zoom', e => g.attr('transform', e.transform));
  svg.call(zoom).on('dblclick.zoom', null);
  dailyMapSvg = svg; dailyMapZoom = zoom;
}

function handleDailyMapClick(feature, correctFeat) {
  if (dailyState.answered || dailyState.fieldResults.map) return;
  const q = currentDaily();
  const ok = feature === correctFeat;
  dailyState.fieldResults.map = { label: '🖱️ Carte', userVal: '(clic)', correct: ok, correctText: placeFrName(q.item) };
  dailyQuestionDone();
}

// Entrée dans un champ → valide CE champ, puis passe au suivant.
function dailyFieldKey(event, tid) {
  if (event.key !== 'Enter') return;
  event.preventDefault(); event.stopPropagation();
  dailyValidateField(tid);
}

// "Valider" = valide le premier champ non encore validé.
function dailyValidate() {
  if (dailyState.answered) return;
  const first = document.querySelector('#daily-answers .answer-input:not([disabled])');
  if (first) dailyValidateField(first.dataset.target);
}

function dailyValidateField(tid) {
  if (dailyState.answered || dailyState.fieldResults[tid]) return;
  const q = currentDaily();
  if (!q) return;
  const inp = document.querySelector(`#daily-answers .answer-input[data-target="${tid}"]`);
  if (!inp) return;
  const val = inp.value.trim();
  if (!val) return; // on ne valide pas un champ vide
  let ok, correctText, label;
  if (q.kind === 'culture') {
    ok = fuzzyMatchAny(q.q.valid_answers, val); correctText = q.q.answer; label = 'Réponse';
  } else {
    ok = fuzzyMatchAny(placeAnswersFor(q.item, tid), val); correctText = placeCorrectText(q.item, tid);
    label = (placeCfg().targets.find(t => t.id === tid) || {}).label || tid;
  }
  dailyState.fieldResults[tid] = { label, userVal: val, correct: ok, correctText };
  inp.disabled = true; inp.classList.add(ok ? 'correct' : 'wrong');
  const fb = document.querySelector(`#daily-answers [data-fb="${tid}"]`);
  if (fb) { fb.className = `geo-field-fb ${ok ? 'ok' : 'ko'}`; fb.textContent = ok ? `✅ ${correctText}` : `❌ ${correctText}`; }
  // Tous les champs attendus validés ?
  const expected = (q.kind === 'culture') ? ['culture'] : q.targets;
  if (expected.every(t => dailyState.fieldResults[t])) dailyQuestionDone();
  else { const next = document.querySelector('#daily-answers .answer-input:not([disabled])'); if (next) next.focus(); }
}

// Question terminée : on enregistre, on affiche Suivant.
function dailyQuestionDone() {
  const q = currentDaily();
  const detail = Object.values(dailyState.fieldResults);
  const correct = detail.length > 0 && detail.every(d => d.correct);
  dailyState.answered = true;
  if (correct) dailyState.correct++;
  // Journal pour le récap de fin + le rejeu des erreurs.
  const prompt = q.kind === 'culture'
    ? `${q.q.difficulty === 'expert' ? '🔴' : '🟢'} ${q.q.question}`
    : `${q.scope.startsWith('fr') ? '🇫🇷' : '🌍'} ${q.item.nom || placeFrName(q.item)} — ${q.source}→${q.targets.join('+')}`;
  dailyState.log.push({ q, correct, prompt, detail });
  document.getElementById('daily-validate').style.display = 'none';
  document.getElementById('daily-next').style.display = 'inline-flex';
  document.getElementById('daily-next').focus();
  // Révèle la bonne case sur la carte-clic.
  if (q.kind === 'geo' && q.targets.length === 1 && q.targets[0] === 'map') drawDailyClickMap(q.item);
}

function dailyNext() {
  dailyState.index++;
  if (dailyState.index >= dailyState.set.length) { finishDaily(); return; }
  renderDaily();
}

function loadDailyStats() { try { return JSON.parse(localStorage.getItem('quiz_daily') || '{}') || {}; } catch (e) { return {}; } }
function saveDailyResult(score) {
  const d = loadDailyStats();
  const today = todayStr();
  if (!d.byDate) d.byDate = {};
  const first = !(today in d.byDate);
  d.byDate[today] = Math.max(d.byDate[today] || 0, score);
  if (first) {
    d.streak = (d.lastDate === shiftDay(today, -1)) ? (d.streak || 0) + 1 : 1;
    d.lastDate = today;
  }
  localStorage.setItem('quiz_daily', JSON.stringify(d));
  return d;
}

function finishDaily() {
  document.getElementById('daily-play').style.display = 'none';
  const box = document.getElementById('daily-result');
  box.style.display = 'block';
  const N = dailyState.set.length;
  const score = dailyState.correct;
  document.getElementById('daily-fill').style.width = '100%';
  let streakLine = '';
  if (dailyState.isToday) {
    const d = saveDailyResult(score);
    streakLine = `<div style="margin-top:8px;color:var(--text-secondary);">🔥 Série : ${d.streak} jour${d.streak > 1 ? 's' : ''}</div>`;
    updateDailyCard();
  }
  const challLine = (dailyState.challengerScore != null)
    ? `<div style="margin-top:8px;font-weight:700;color:${score >= dailyState.challengerScore ? 'var(--accent-green)' : 'var(--accent-red)'};">Ton ami avait fait ${dailyState.challengerScore}/${N} — ${score >= dailyState.challengerScore ? 'tu gagnes ! 🏆' : 'battu de ' + (dailyState.challengerScore - score) + ' 😬'}</div>`
    : '';
  const emoji = score >= 14 ? '🏆' : score >= 10 ? '🔥' : score >= 6 ? '💪' : '📚';
  const nbErr = dailyState.log.filter(e => !e.correct).length;
  // Récap détaillé (juste/faux + réponses).
  const recap = dailyState.log.map(e => {
    const det = e.detail.map(d => {
      if (d.correct) return `<span style="color:var(--accent-green);">${d.label ? d.label + ' : ' : ''}${d.correctText}</span>`;
      const yours = (d.userVal && d.userVal !== '(clic)') ? ` <span style="color:var(--text-muted);">(toi : « ${d.userVal} »)</span>` : (d.userVal === '(clic)' ? ' <span style="color:var(--text-muted);">(mauvais clic)</span>' : '');
      return `<span style="color:var(--accent-red);">${d.label ? d.label + ' : ' : ''}${d.correctText}</span>${yours}`;
    }).join(' · ');
    return `<div style="display:flex;gap:8px;align-items:flex-start;text-align:left;padding:9px 0;border-bottom:1px solid var(--border-subtle);">
      <span style="flex:0 0 auto;">${e.correct ? '✅' : '❌'}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.35;">${e.prompt}</div>
        <div style="font-size:13px;font-weight:600;margin-top:2px;">${det}</div>
      </div></div>`;
  }).join('');
  const replayBtn = nbErr > 0 ? `<button class="btn-primary" onclick="replayDailyErrors()">🔁 Rejouer mes ${nbErr} erreur${nbErr > 1 ? 's' : ''}</button>` : '';
  box.innerHTML = `
    <div style="font-size:56px;">${emoji}</div>
    <div class="results-title" style="font-size:34px;">${score} / ${N}</div>
    <div class="results-subtitle">Défi du ${dailyState.date}${dailyState.isToday ? " (aujourd'hui)" : ''}</div>
    ${streakLine}${challLine}
    <div class="results-actions" style="margin-top:20px;">
      ${replayBtn}
      <button class="btn-primary" onclick="shareDaily(${score})">⚔️ Défier un ami</button>
      <button class="btn-secondary" onclick="goMainMenu()">Retour à l'accueil</button>
    </div>
    <div style="text-align:left;margin-top:26px;">
      <div class="mode-title" style="text-align:left;">Détail des réponses</div>
      <div style="margin-top:6px;">${recap}</div>
    </div>`;
}

// Rejoue uniquement les questions ratées (mêmes questions, hors série/duel).
function replayDailyErrors() {
  const errors = dailyState.log.filter(e => !e.correct).map(e => e.q);
  if (!errors.length) return;
  dailyState = { date: dailyState.date, isToday: false, challengerScore: null, set: errors, index: 0, correct: 0, answered: false, fieldResults: {}, log: [] };
  document.getElementById('daily-result').style.display = 'none';
  document.getElementById('daily-play').style.display = 'flex';
  renderDaily();
}

function shareDaily(score) {
  const url = `${location.origin}${location.pathname}#defi=${dailyState.date}_${score}`;
  const text = `Je te défie sur le Quiz du ${dailyState.date} : j'ai fait ${score}/${dailyState.set.length} ! À toi 👉`;
  if (navigator.share) {
    navigator.share({ title: 'Défi du jour', text, url }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text + ' ' + url).then(() => alert('Lien de défi copié !')).catch(() => prompt('Copie ce lien :', url));
  } else {
    prompt('Copie ce lien de défi :', url);
  }
}

// ── Défi sur une session géo (Pays / France / USA) ─────────────────────────
// Encode toute la config + le seed → l'ami rejoue EXACTEMENT la même partie.
function shareCountryGame(score) {
  const cs = countryGameState;
  const total = countryTotalSubQuestions();
  // format : scope~source~t1.t2~seed~size~continent~score
  const payload = [cs.scope, cs.source, cs.targets.join('.'), cs.seed, cs.sessionSize, cs.continent || 'all', score].join('~');
  const url = `${location.origin}${location.pathname}#geodefi=${encodeURIComponent(payload)}`;
  const text = `Je te défie en géo (${countryModeLabel()}) : j'ai fait ${score}/${total} ! À toi 👉`;
  if (navigator.share) {
    navigator.share({ title: 'Défi géo', text, url }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text + ' ' + url).then(() => alert('Lien de défi copié !')).catch(() => prompt('Copie ce lien :', url));
  } else {
    prompt('Copie ce lien de défi :', url);
  }
}

// Lance une session géo depuis un lien de défi entrant.
function startCountryChallenge(scope, source, targets, seed, size, continent, challScore) {
  loadGeoData().then(() => {
    openPlaceGame(scope);
    countryGameState.source = source;
    countryGameState.targets = targets;
    countryGameState.sessionSize = Number(size) || countryGameState.sessionSize;
    countryGameState.continent = continent || 'all';
    countryGameState.seed = seed;
    countryGameState.seedKeep = true;             // conserver le seed de l'ami
    countryGameState.challengerScore = (challScore != null ? Number(challScore) : null);
    buildCountryOptionButtons();                  // refléter la config dans l'UI de setup
    startCountryGame();                           // construit la file seedée = même partie
  });
}

// Si on arrive via un lien de défi, on lance ce défi.
function checkIncomingChallenge() {
  const hash = location.hash || '';
  const md = hash.match(/defi=(\d{4}-\d{2}-\d{2})_(\d+)/);
  if (md) { history.replaceState(null, '', location.pathname); openDaily(md[1], Number(md[2])); return; }
  const mg = hash.match(/geodefi=([^&]+)/);
  if (mg) {
    history.replaceState(null, '', location.pathname);
    const parts = decodeURIComponent(mg[1]).split('~');
    if (parts.length >= 7) {
      const [scope, source, targetsStr, seed, size, continent, score] = parts;
      startCountryChallenge(scope, source, targetsStr.split('.'), seed, size, continent, score);
    }
  }
}

function updateDailyCard() {
  const el = document.getElementById('daily-card-desc');
  if (!el) return;
  const d = loadDailyStats();
  const today = todayStr();
  const doneToday = d.byDate && (today in d.byDate);
  const streak = d.streak && d.lastDate === today ? d.streak : (d.lastDate === shiftDay(today, -1) ? d.streak : 0);
  el.textContent = doneToday
    ? `✅ Fait aujourd'hui : ${d.byDate[today]}/16${d.streak ? ` · 🔥 ${d.streak} j` : ''}`
    : `16 questions (culture + géo), renouvelé chaque jour${streak ? ` · 🔥 série ${streak} j` : ''}.`;
}
