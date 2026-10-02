// Démarrage : chargement des questions et raccourcis clavier. Chargé en dernier.
// Scripts classiques (pas de modules) : les déclarations top-level sont partagées
// entre fichiers. Ordre de chargement : state → culture → geo → daily → main.

// ======================================
// LOAD DATA
// ======================================
// La géographie ne dépend pas des questions : on l'initialise tout de suite,
// pour que l'onglet Pays ait toujours ses boutons même si questions.json échoue.
buildCountryOptionButtons();

fetch('questions.json')
  .then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  })
  .then(data => {
    ALL_QUESTIONS = data;
    initApp();
  })
  .catch(e => {
    console.error('Erreur chargement questions:', e);
    // Message clair, surtout en cas d'ouverture en file:// (fetch bloqué).
    const isFile = location.protocol === 'file:';
    document.querySelectorAll('.app-subtitle').forEach(el => {
      el.textContent = isFile
        ? '⚠️ Ouvre le site via une URL (Vercel) ou un serveur local, pas le fichier directement.'
        : '❌ Erreur de chargement des questions.';
    });
  });

function initApp() {
  updateHomeStats();
  buildThemeChips();
  updateCounts();
  buildCountryOptionButtons();
  updateDailyCard();
  saveStats();
  checkIncomingChallenge();   // si on arrive via un lien de défi
}

// ======================================
// KEYBOARD EVENTS
// ======================================
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (document.getElementById('daily-screen').classList.contains('active')) {
      if (document.getElementById('daily-result').style.display !== 'none') return;
      if (dailyState.answered) dailyNext(); else dailyValidate();
    } else if (document.getElementById('quiz-screen').classList.contains('active')) {
      if (!answered) {
        checkAnswer();
      } else {
        nextQuestion();
      }
    } else if (document.getElementById('geo-countries-screen').classList.contains('active')) {
      if (countryGameState.completed) return;
      if (countryGameState.answered) {
        nextCountry();
      } else {
        checkCountryAnswer();
      }
    }
  }
});
