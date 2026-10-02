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
  // Révision : uniquement les questions ratées (ignore les filtres de thème).
  if (mode === 'review') {
    const wrong = new Set(stats.wrongIds || []);
    return ALL_QUESTIONS.filter(q => wrong.has(`${q.day_number}-${q.difficulty}-${q.order}`));
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
  // Bouton révision : visible uniquement s'il y a des erreurs à rejouer.
  const reviewCount = (stats.wrongIds || []).length;
  const reviewBtn = document.getElementById('review-btn');
  const reviewCountEl = document.getElementById('count-review');
  if (reviewBtn) reviewBtn.style.display = reviewCount > 0 ? 'flex' : 'none';
  if (reviewCountEl) reviewCountEl.textContent = `${reviewCount} question${reviewCount > 1 ? 's' : ''} à réviser`;
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

  // En révision, on rejoue simplement les questions ratées (sans logique de cycle).
  quizQueue = mode === 'review' ? shuffleArray([...filteredQuestions]) : buildQueue(filteredQuestions);
  currentQuestionIndex = 0;
  sessionCorrect = 0;
  sessionTotal = 0;
  sessionStreak = 0;
  sessionBestStreak = 0;

  showScreen('quiz-screen');
  showQuestion();
}

function continueQuiz() {
  // Continue with next batch from the queue
  if (currentQuestionIndex >= quizQueue.length) {
    quizQueue = buildQueue(filteredQuestions);
    currentQuestionIndex = 0;
  }
  sessionCorrect = 0;
  sessionTotal = 0;
  sessionStreak = 0;
  sessionBestStreak = 0;
  showScreen('quiz-screen');
  showQuestion();
}

function showQuestion() {
  if (currentQuestionIndex >= quizQueue.length) {
    // Rebuild queue
    quizQueue = buildQueue(filteredQuestions);
    currentQuestionIndex = 0;
  }

  // Check if session is complete (every SESSION_SIZE questions)
  if (sessionTotal > 0 && sessionTotal % SESSION_SIZE === 0) {
    showResults();
    return;
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
    feedbackText.innerHTML = `Bravo ! <span class="correct-answer">${q.answer}</span>`;
  } else {
    sessionStreak = 0;

    input.className = 'answer-input wrong';
    feedbackEl.className = 'feedback wrong show';
    feedbackIcon.textContent = '❌';
    feedbackText.innerHTML = `Raté ! La réponse était : <span class="correct-answer">${q.answer}</span>`;
  }

  stats.totalAnswered++;
  recordAnswerStats(q, isCorrect);
  if (sessionStreak > stats.bestStreak) stats.bestStreak = sessionStreak;

  // Mark question as seen + suivi des erreurs (révision).
  const qId = `${q.day_number}-${q.difficulty}-${q.order}`;
  if (!stats.seenIds.includes(qId)) stats.seenIds.push(qId);
  if (isCorrect) {
    stats.wrongIds = stats.wrongIds.filter(id => id !== qId); // réussie → on l'enlève
  } else if (!stats.wrongIds.includes(qId)) {
    stats.wrongIds.push(qId);                                  // ratée → à réviser
  }
  saveStats();

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

function skipQuestion() {
  if (answered) return;
  answered = true;
  sessionTotal++;
  sessionStreak = 0;
  stats.totalAnswered++;

  const q = quizQueue[currentQuestionIndex];
  const qId = `${q.day_number}-${q.difficulty}-${q.order}`;
  if (!stats.seenIds.includes(qId)) stats.seenIds.push(qId);
  if (!stats.wrongIds.includes(qId)) stats.wrongIds.push(qId); // passée = à réviser
  recordAnswerStats(q, false);
  saveStats();

  const input = document.getElementById('answer-input');
  input.className = 'answer-input wrong';
  input.disabled = true;

  const feedbackEl = document.getElementById('feedback');
  feedbackEl.className = 'feedback wrong show';
  document.getElementById('feedback-icon').textContent = '⏭️';
  document.getElementById('feedback-text').innerHTML = `La réponse était : <span class="correct-answer">${q.answer}</span>`;

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

  showScreen('results-screen');
}

// ======================================
// NAVIGATION
// ======================================
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
