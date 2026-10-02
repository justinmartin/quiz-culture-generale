// Quiz culture générale : accueil, filtres, file de questions, réponses, résultats, stats.
// Scripts classiques (pas de modules) : les déclarations top-level sont partagées
// entre fichiers. Ordre de chargement : state → culture → geo → daily → main.

// ======================================
// HOME SCREEN
// ======================================
function updateHomeStats() {
  document.getElementById('total-questions').textContent = ALL_QUESTIONS.length;
  document.getElementById('total-correct').textContent = stats.totalCorrect;
  document.getElementById('best-streak').textContent = stats.bestStreak;
  const pct = stats.totalAnswered > 0 ? Math.round(stats.totalCorrect / stats.totalAnswered * 100) : 0;
  document.getElementById('accuracy-pct').textContent = pct + '%';

  // Remaining in cycle (for "all" mode by default)
  const seenSet = new Set(stats.seenIds || []);
  const remaining = ALL_QUESTIONS.filter(q => !seenSet.has(`${q.day_number}-${q.difficulty}-${q.order}`)).length;
  document.getElementById('remaining-home').textContent = `${remaining} question${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}`;
  document.getElementById('cycle-home').textContent = `Cycle ${(stats.cycles || 0) + 1}`;
}

function buildThemeChips() {
  const themes = [...new Set(ALL_QUESTIONS.map(q => q.theme))].sort();
  const container = document.getElementById('theme-chips');
  container.innerHTML = '';

  const allChip = document.createElement('div');
  allChip.className = 'chip active';
  allChip.textContent = '🎯 Tous';
  allChip.onclick = () => {
    selectedThemes.clear();
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    allChip.classList.add('active');
    updateCounts();
  };
  container.appendChild(allChip);

  themes.forEach(theme => {
    const info = THEME_MAP[theme] || { emoji: '📌', cls: '' };
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.textContent = `${info.emoji} ${theme}`;
    chip.dataset.theme = theme;
    chip.onclick = () => {
      // Toggle
      if (selectedThemes.has(theme)) {
        selectedThemes.delete(theme);
        chip.classList.remove('active');
      } else {
        selectedThemes.add(theme);
        chip.classList.add('active');
      }
      // Deselect "Tous" if specific themes selected
      if (selectedThemes.size > 0) {
        allChip.classList.remove('active');
      } else {
        allChip.classList.add('active');
      }
      updateCounts();
    };
    container.appendChild(chip);
  });
}

function getFilteredQuestions(mode) {
  // Révision : questions ratées dont la date de révision est arrivée (ignore les filtres de thème).
  if (mode === 'review') {
    const today = localDay();
    return ALL_QUESTIONS.filter(q => { const r = stats.review[qid(q)]; return r && r.due <= today; });
  }
  let qs = ALL_QUESTIONS;
  if (mode === 'abordable') qs = qs.filter(q => q.difficulty === 'abordable');
  if (mode === 'expert') qs = qs.filter(q => q.difficulty === 'expert');
  if (selectedThemes.size > 0) qs = qs.filter(q => selectedThemes.has(q.theme));
  return qs;
}

function updateCounts() {
  document.getElementById('count-all').textContent = getFilteredQuestions('all').length + ' questions';
  document.getElementById('count-abordable').textContent = getFilteredQuestions('abordable').length + ' questions';
  document.getElementById('count-expert').textContent = getFilteredQuestions('expert').length + ' questions';
  // Bouton révision : visible s'il y a des questions en cours de révision.
  const pending = Object.values(stats.review);
  const today = localDay();
  const due = pending.filter(r => r.due <= today).length;
  const reviewBtn = document.getElementById('review-btn');
  const reviewCountEl = document.getElementById('count-review');
  if (reviewBtn) {
    reviewBtn.style.display = pending.length > 0 ? 'flex' : 'none';
    reviewBtn.disabled = due === 0;
    reviewBtn.style.opacity = due === 0 ? '0.6' : '';
  }
  if (reviewCountEl && pending.length) {
    const next = pending.map(r => r.due).sort()[0];
    reviewCountEl.textContent = due > 0
      ? `${due} à réviser aujourd'hui` + (pending.length > due ? ` · ${pending.length - due} plus tard` : '')
      : `Prochaine révision ${next === localDay(1) ? 'demain' : 'le ' + next.split('-').reverse().join('/')} (${pending.length} en cours)`;
  }
}

// ---------- Répétition espacée ----------
// Intervalle (jours) avant la prochaine révision quand on atteint la boîte n.
const REVIEW_INTERVAL_DAYS = { 2: 2, 3: 5 };

function qid(q) { return `${q.day_number}-${q.difficulty}-${q.order}`; }

function reviewOnWrong(id) {
  stats.review[id] = { box: 1, due: localDay() };
}

function reviewOnRight(id) {
  const r = stats.review[id];
  if (!r) return;
  if (r.box >= 3) { delete stats.review[id]; return; } // maîtrisée
  r.box += 1;
  r.due = localDay(REVIEW_INTERVAL_DAYS[r.box]);
}

// Question jouée (réponse ou passe) : stats, vue, révision, journal de session.
function recordQuestion(q, userAnswer, isCorrect) {
  const id = qid(q);
  stats.totalAnswered++;
  recordAnswerStats(q, isCorrect);
  if (!stats.seenIds.includes(id)) stats.seenIds.push(id);
  if (isCorrect) reviewOnRight(id); else reviewOnWrong(id);
  saveStats();
  sessionLog.push({ q, userAnswer, isCorrect });
}

// ---------- Mode chrono (utilise timer_ms de chaque question) ----------
let chronoEnabled = (() => { try { return localStorage.getItem('quiz_chrono') === '1'; } catch (e) { return false; } })();
let chronoTimer = null;

function toggleChrono() {
  chronoEnabled = !chronoEnabled;
  try { localStorage.setItem('quiz_chrono', chronoEnabled ? '1' : '0'); } catch (e) {}
  renderChronoToggle();
}

function renderChronoToggle() {
  const el = document.getElementById('chrono-toggle');
  if (!el) return;
  el.classList.toggle('active', chronoEnabled);
  el.setAttribute('aria-pressed', String(chronoEnabled));
  el.querySelector('.chrono-state').textContent = chronoEnabled ? 'activé' : 'désactivé';
}

function startChrono(q) {
  stopChrono();
  const bar = document.getElementById('chrono-bar');
  if (!chronoEnabled) { bar.style.display = 'none'; return; }
  const total = q.timer_ms || 30000;
  const end = Date.now() + total;
  bar.style.display = 'block';
  const fill = bar.firstElementChild;
  const tick = () => {
    const left = Math.max(0, end - Date.now());
    fill.style.width = `${(left / total) * 100}%`;
    fill.classList.toggle('urgent', left < 5000);
    if (left === 0) { stopChrono(); skipQuestion(true); }
  };
  tick();
  chronoTimer = setInterval(tick, 100);
}

function stopChrono() {
  if (chronoTimer) clearInterval(chronoTimer);
  chronoTimer = null;
}

// ---------- Point faible ----------
function weakestTheme(minAnswered = 10) {
  let worst = null;
  Object.entries(stats.byTheme).forEach(([theme, s]) => {
    if (s.all.answered < minAnswered) return;
    const pct = s.all.correct / s.all.answered;
    if (!worst || pct < worst.pct) worst = { theme, pct };
  });
  return worst;
}

function trainWeakestTheme() {
  const w = weakestTheme();
  if (!w) return;
  selectedThemes.clear();
  selectedThemes.add(w.theme);
  document.querySelectorAll('#theme-chips .chip').forEach(c => c.classList.toggle('active', c.dataset.theme === w.theme));
  startQuiz('all');
}

function renderWeakestTheme() {
  const el = document.getElementById('weakest-theme');
  if (!el) return;
  const w = weakestTheme();
  if (!w) { el.style.display = 'none'; return; }
  const info = THEME_MAP[w.theme] || { emoji: '📌' };
  el.style.display = 'flex';
  el.querySelector('.weakest-name').textContent = `${info.emoji} ${w.theme} · ${Math.round(w.pct * 100)}%`;
}

function ensureThemeStats(theme) {
  if (!stats.byTheme[theme]) {
    stats.byTheme[theme] = {
      all: { correct: 0, answered: 0 },
      abordable: { correct: 0, answered: 0 },
      expert: { correct: 0, answered: 0 },
    };
  }
  return stats.byTheme[theme];
}

function recordAnswerStats(question, isCorrect) {
  stats.byMode.all.answered++;
  if (isCorrect) stats.byMode.all.correct++;

  const mode = question.difficulty === 'expert' ? 'expert' : 'abordable';
  stats.byMode[mode].answered++;
  if (isCorrect) stats.byMode[mode].correct++;

  const themeStats = ensureThemeStats(question.theme);
  themeStats.all.answered++;
  if (isCorrect) themeStats.all.correct++;

  themeStats[mode].answered++;
  if (isCorrect) themeStats[mode].correct++;
}

function openStats() {
  renderStatsScreen();
  renderWeakestTheme();
  showScreen('stats-screen');
}

function setStatsViewMode(mode) {
  statsViewMode = mode;
  document.querySelectorAll('.stats-segment-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  renderThemeChart();
}

function renderStatsScreen() {
  const answered = stats.totalAnswered;
  const accuracy = answered > 0 ? Math.round((stats.totalCorrect / answered) * 100) : 0;
  document.getElementById('stats-accuracy').textContent = `${accuracy}%`;
  document.getElementById('stats-answered').textContent = `${answered} réponse${answered > 1 ? 's' : ''}`;
  document.getElementById('stats-best-streak').textContent = stats.bestStreak;
  document.getElementById('stats-cycle').textContent = (stats.cycles || 0) + 1;

  const seenSet = new Set(stats.seenIds || []);
  const remaining = ALL_QUESTIONS.filter(q => !seenSet.has(`${q.day_number}-${q.difficulty}-${q.order}`)).length;
  document.getElementById('stats-remaining').textContent = `${remaining} restante${remaining > 1 ? 's' : ''}`;

  setStatsViewMode(statsViewMode);
}

function getBarColor(pct) {
  if (pct >= 80) return { text: '#8f6422', fill: 'linear-gradient(180deg, #ddb46e, #b48435)' };
  if (pct >= 50) return { text: '#8f4d36', fill: 'linear-gradient(180deg, #d97757, #c96442)' };
  return { text: '#8f2a2a', fill: 'linear-gradient(180deg, #cb6b63, #b53333)' };
}

function renderThemeChart() {
  const titleMap = {
    all: 'Précision par thème - Toutes',
    abordable: 'Précision par thème - Abordable',
    expert: 'Précision par thème - Expert',
  };
  document.getElementById('theme-chart-title').textContent = titleMap[statsViewMode];

  const themes = [...new Set(ALL_QUESTIONS.map(q => q.theme))];
  const container = document.getElementById('theme-bars');

  container.innerHTML = themes.map(theme => {
    const data = (stats.byTheme[theme] && stats.byTheme[theme][statsViewMode]) || { correct: 0, answered: 0 };
    const pct = data.answered > 0 ? Math.round((data.correct / data.answered) * 100) : 0;
    const color = getBarColor(pct);
    const height = data.answered > 0 ? Math.max(12, Math.min(100, pct)) : 6;

    return `
      <div class="theme-bar-item" title="${theme}: ${pct}% (${data.correct}/${data.answered})">
        <div class="theme-bar-pct" style="color:${color.text}">${pct}%</div>
        <div class="theme-bar-track">
          <div class="theme-bar-fill" style="height:${height}%;background:${color.fill}"></div>
        </div>
        <div class="theme-bar-label">${theme}</div>
      </div>
    `;
  }).join('');
}

// ======================================
// QUIZ LOGIC
// ======================================
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildQueue(questions) {
  // Unique identifier for each question
  const getId = q => `${q.day_number}-${q.difficulty}-${q.order}`;

  // Separate unseen and seen (only within current filter)
  const seenSet = new Set(stats.seenIds || []);
  const unseen = questions.filter(q => !seenSet.has(getId(q)));

  if (unseen.length > 0) {
    return shuffleArray([...unseen]);
  } else {
    // All questions seen — new cycle! Reset seen list for these questions only
    const currentIds = new Set(questions.map(getId));
    stats.seenIds = (stats.seenIds || []).filter(id => !currentIds.has(id));
    stats.cycles = (stats.cycles || 0) + 1;
    cycleNumber = stats.cycles + 1;
    saveStats();
    return shuffleArray([...questions]);
  }
}

function getRemainingCount() {
  const getId = q => `${q.day_number}-${q.difficulty}-${q.order}`;
  const seenSet = new Set(stats.seenIds || []);
  return filteredQuestions.filter(q => !seenSet.has(getId(q))).length;
}

function startQuiz(mode) {
  currentMode = mode;
  filteredQuestions = getFilteredQuestions(mode);

  if (filteredQuestions.length === 0) {
    alert(mode === 'review'
      ? 'Aucune erreur à réviser pour le moment. Joue d\'abord quelques questions !'
      : 'Aucune question disponible avec ces filtres !');
    return;
  }

  quizQueue = buildModeQueue();
  currentQuestionIndex = 0;
  resetSession();
  showScreen('quiz-screen');
  showQuestion();
}

function resetSession() {
  sessionCorrect = 0;
  sessionTotal = 0;
  sessionStreak = 0;
  sessionBestStreak = 0;
  sessionLog = [];
}

// En révision : les questions dues du moment (sans logique de cycle). Sinon : cycle sans répétition.
function buildModeQueue() {
  if (currentMode === 'review') {
    filteredQuestions = getFilteredQuestions('review');
    return shuffleArray([...filteredQuestions]);
  }
  return buildQueue(filteredQuestions);
}

function continueQuiz() {
  // Continue with next batch from the queue
  if (currentQuestionIndex >= quizQueue.length) {
    quizQueue = buildModeQueue();
    currentQuestionIndex = 0;
  }
  if (!quizQueue.length) { goHome(); return; } // révision terminée
  resetSession();
  showScreen('quiz-screen');
  showQuestion();
}

function showQuestion() {
  // Session terminée : toutes les SESSION_SIZE questions, ou plus rien à réviser.
  if (sessionTotal > 0 && sessionTotal % SESSION_SIZE === 0) {
    showResults();
    return;
  }
  if (currentQuestionIndex >= quizQueue.length) {
    quizQueue = buildModeQueue();
    currentQuestionIndex = 0;
    if (!quizQueue.length) { showResults(); return; }
  }

  const q = quizQueue[currentQuestionIndex];
  const themeInfo = THEME_MAP[q.theme] || { emoji: '📌', cls: 'theme-classique' };

  // Difficulty badge
  const diffBadge = document.getElementById('q-difficulty');
  if (q.difficulty === 'expert') {
    diffBadge.className = 'difficulty-badge expert';
    diffBadge.textContent = '🔴 Expert';
  } else {
    diffBadge.className = 'difficulty-badge abordable';
    diffBadge.textContent = '🟢 Abordable';
  }

  // Theme badge
  const themeBadge = document.getElementById('q-theme');
  themeBadge.className = `theme-badge ${themeInfo.cls}`;
  themeBadge.textContent = `${themeInfo.emoji} ${q.theme}`;

  // Question text
  document.getElementById('q-text').textContent = q.question;

  // Progress
  const sessionPos = (sessionTotal % SESSION_SIZE) + 1;
  const remaining = getRemainingCount();
  document.getElementById('progress-text').textContent = `${sessionPos} / ${SESSION_SIZE}`;
  document.getElementById('progress-fill').style.width = `${(sessionPos / SESSION_SIZE) * 100}%`;

  // Remaining questions indicator
  let remainingEl = document.getElementById('remaining-display');
  if (!remainingEl) {
    remainingEl = document.createElement('div');
    remainingEl.id = 'remaining-display';
    remainingEl.style.cssText = 'text-align:center;font-size:11px;color:var(--text-muted);padding:4px 0;';
    document.querySelector('.progress-bar-container').after(remainingEl);
  }
  remainingEl.textContent = `${remaining} question${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''} dans ce cycle`;

  // Streak display
  const streakEl = document.getElementById('streak-display');
  if (sessionStreak >= 2) {
    streakEl.style.display = 'flex';
    document.getElementById('streak-count').textContent = sessionStreak;
    streakEl.className = sessionStreak >= 5 ? 'streak-container hot' : 'streak-container';
  } else {
    streakEl.style.display = 'none';
  }

  // Reset input & feedback
  const input = document.getElementById('answer-input');
  input.value = '';
  input.className = 'answer-input';
  input.disabled = false;
  input.focus();

  document.getElementById('feedback').className = 'feedback';
  document.getElementById('next-btn').className = 'next-btn';
  document.getElementById('skip-btn').style.display = 'block';
  document.getElementById('submit-btn').disabled = false;
  answered = false;

  // Animate
  document.getElementById('question-area').classList.remove('animate-in');
  void document.getElementById('question-area').offsetWidth;
  document.getElementById('question-area').classList.add('animate-in');

  startChrono(q);
}

function normalize(str) {
  return String(str == null ? '' : str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// Distance de Levenshtein (nb d'\u00e9ditions pour passer de a \u00e0 b).
function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

// Tol\u00e9rance orthographique : exact (apr\u00e8s normalisation) ou \u00e0 1-2 fautes pr\u00e8s
// selon la longueur du mot, pour \u00e9viter les faux positifs sur les mots courts.
function fuzzyEqual(a, b) {
  const na = normalize(a), nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const longer = Math.max(na.length, nb.length);
  if (longer <= 4) return false;          // mots courts : exact requis
  const tolerance = longer <= 7 ? 1 : 2;  // moyens : 1 faute ; longs : 2 fautes
  return levenshtein(na, nb) <= tolerance;
}

// Vrai si l'entr\u00e9e correspond (\u00e0 la tol\u00e9rance pr\u00e8s) \u00e0 une des r\u00e9ponses valides.
function fuzzyMatchAny(validAnswers, userInput) {
  return validAnswers.some(answer => fuzzyEqual(answer, userInput));
}

function checkAnswer() {
  if (answered) return;

  const input = document.getElementById('answer-input');
  const userAnswer = input.value.trim();
  if (!userAnswer) return;

  answered = true;
  stopChrono();
  const q = quizQueue[currentQuestionIndex];

  // Réponses valides : tolérance orthographique (fautes de frappe, accents).
  const isCorrect = fuzzyMatchAny(q.valid_answers, userAnswer);

  const feedbackEl = document.getElementById('feedback');
  const feedbackIcon = document.getElementById('feedback-icon');
  const feedbackText = document.getElementById('feedback-text');

  sessionTotal++;

  if (isCorrect) {
    sessionCorrect++;
    sessionStreak++;
    if (sessionStreak > sessionBestStreak) sessionBestStreak = sessionStreak;
    stats.totalCorrect++;

    input.className = 'answer-input correct';
    feedbackEl.className = 'feedback correct show';
    feedbackIcon.textContent = '✅';
    feedbackText.innerHTML = `Bravo ! <span class="correct-answer">${escapeHtml(q.answer)}</span>`;
  } else {
    sessionStreak = 0;

    input.className = 'answer-input wrong';
    feedbackEl.className = 'feedback wrong show';
    feedbackIcon.textContent = '❌';
    feedbackText.innerHTML = `Raté ! La réponse était : <span class="correct-answer">${escapeHtml(q.answer)}</span>`;
  }

  if (sessionStreak > stats.bestStreak) stats.bestStreak = sessionStreak;
  recordQuestion(q, userAnswer, isCorrect);

  input.disabled = true;
  document.getElementById('submit-btn').disabled = true;
  document.getElementById('skip-btn').style.display = 'none';
  document.getElementById('next-btn').className = 'next-btn show';

  // Update streak display
  const streakEl = document.getElementById('streak-display');
  if (sessionStreak >= 2) {
    streakEl.style.display = 'flex';
    document.getElementById('streak-count').textContent = sessionStreak;
    streakEl.className = sessionStreak >= 5 ? 'streak-container hot' : 'streak-container';
  } else {
    streakEl.style.display = 'none';
  }
}

// timedOut : appelé par le chrono quand le temps est écoulé.
function skipQuestion(timedOut = false) {
  if (answered) return;
  answered = true;
  stopChrono();
  sessionTotal++;
  sessionStreak = 0;

  const q = quizQueue[currentQuestionIndex];
  const typed = document.getElementById('answer-input').value.trim();
  recordQuestion(q, timedOut ? (typed || '⏱️ temps écoulé') : null, false);

  const input = document.getElementById('answer-input');
  input.className = 'answer-input wrong';
  input.disabled = true;

  const feedbackEl = document.getElementById('feedback');
  feedbackEl.className = 'feedback wrong show';
  document.getElementById('feedback-icon').textContent = timedOut ? '⏱️' : '⏭️';
  document.getElementById('feedback-text').innerHTML = `${timedOut ? 'Temps écoulé ! ' : ''}La réponse était : <span class="correct-answer">${escapeHtml(q.answer)}</span>`;

  document.getElementById('submit-btn').disabled = true;
  document.getElementById('skip-btn').style.display = 'none';
  document.getElementById('next-btn').className = 'next-btn show';
  document.getElementById('streak-display').style.display = 'none';
}

function nextQuestion() {
  currentQuestionIndex++;
  showQuestion();
}

// ======================================
// RESULTS
// ======================================
function showResults() {
  const pct = sessionTotal > 0 ? Math.round(sessionCorrect / sessionTotal * 100) : 0;

  // Choose emoji & title based on score
  let emoji = '😔', title = 'Peut mieux faire';
  if (pct >= 90) { emoji = '🏆'; title = 'Exceptionnel !'; }
  else if (pct >= 75) { emoji = '🔥'; title = 'Impressionnant !'; }
  else if (pct >= 60) { emoji = '💪'; title = 'Bien joué !'; }
  else if (pct >= 40) { emoji = '👍'; title = 'Pas mal !'; }

  document.getElementById('results-emoji').textContent = emoji;
  document.getElementById('results-title').textContent = title;
  const remaining = getRemainingCount();
  const cycleMsg = remaining === 0 ? ' — 🔄 Nouveau cycle !' : ` — ${remaining} restantes`;
  document.getElementById('results-subtitle').textContent = `Session de ${sessionTotal} questions${cycleMsg}`;
  document.getElementById('results-score').textContent = sessionCorrect;
  document.getElementById('results-total').textContent = sessionTotal;
  document.getElementById('results-correct').textContent = sessionCorrect;
  document.getElementById('results-wrong').textContent = sessionTotal - sessionCorrect;
  document.getElementById('results-streak').textContent = sessionBestStreak;
  document.getElementById('results-accuracy').textContent = pct + '%';
  renderSessionMistakes();

  showScreen('results-screen');
}

// ======================================
// NAVIGATION
// ======================================
// Récap des erreurs de la session (question, ta réponse, bonne réponse).
function renderSessionMistakes() {
  const el = document.getElementById('results-mistakes');
  const mistakes = sessionLog.filter(e => !e.isCorrect);
  if (!mistakes.length) { el.innerHTML = ''; el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = `<div class="mistakes-title">À retenir (${mistakes.length})</div>` + mistakes.map(({ q, userAnswer }) => `
    <div class="mistake">
      <div class="mistake-q">${escapeHtml(q.question)}</div>
      <div class="mistake-a"><span class="correct-answer">${escapeHtml(q.answer)}</span>${userAnswer ? ` <span class="mistake-yours">· toi : « ${escapeHtml(userAnswer)} »</span>` : ''}</div>
    </div>`).join('');
}

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function goCultureHome() {
  stopChrono();
  updateHomeStats();
  updateCounts();
  renderChronoToggle();
  showScreen('home-screen');
}

function goHome() { goCultureHome(); }

function goGeoHome() { showScreen('geo-home-screen'); }

function goMainMenu() { showScreen('main-menu-screen'); }

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

// ======================================
// PERSISTENCE
// ======================================
function saveStats() {
  localStorage.setItem('quiz_stats', JSON.stringify(stats));
}

// --- Stats de géographie (records par jeu/mode), persistées séparément ---
function loadGeoStats() {
  try { return JSON.parse(localStorage.getItem('quiz_geo_stats') || '{}') || {}; }
  catch (e) { return {}; }
}
function recordGeoScore(key, score) {
  const gs = loadGeoStats();
  const prev = gs[key] || { best: 0, plays: 0 };
  gs[key] = { best: Math.max(prev.best || 0, score), plays: (prev.plays || 0) + 1 };
  localStorage.setItem('quiz_geo_stats', JSON.stringify(gs));
  return gs[key];
}
function geoRecordLine(key) {
  const r = loadGeoStats()[key];
  return r ? ` 🏆 Record : ${r.best} · ${r.plays} partie${r.plays > 1 ? 's' : ''}.` : '';
}
