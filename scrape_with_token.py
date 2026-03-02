"""
Scraper automatique - La Table des Savoirs
Utilise le token pour scraper tous les quiz passés via l'API
"""
import json
import time
import urllib.request
import os
from datetime import datetime, timedelta

TOKEN = os.environ.get("QUIZ_TOKEN", "YOUR_TOKEN_HERE")  # Set via: export QUIZ_TOKEN="eyJ..."

BASE_URL = "https://api.latabledessavoirs.fr"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept": "application/json, text/plain, */*",
    "Origin": "https://latabledessavoirs.fr",
    "Referer": "https://latabledessavoirs.fr/",
    "Authorization": f"Bearer {TOKEN}",
}

HEADERS_NO_AUTH = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept": "application/json, text/plain, */*",
    "Origin": "https://latabledessavoirs.fr",
    "Referer": "https://latabledessavoirs.fr/",
}


def api_get(endpoint, auth=True):
    headers = HEADERS if auth else HEADERS_NO_AUTH
    req = urllib.request.Request(f"{BASE_URL}{endpoint}", headers=headers)
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        return {"error": e.code, "message": body}
    except Exception as e:
        return {"error": str(e)}


def day_number_to_date(day_number, first_day_str):
    first_day = datetime.fromisoformat(first_day_str.replace('Z', '+00:00'))
    return (first_day + timedelta(days=day_number - 1)).strftime("%Y-%m-%d")


def extract_questions(quiz_data, difficulty_label, day_number, date_str):
    if not quiz_data or 'day' not in quiz_data:
        return []
    day = quiz_data['day']
    questions = []
    for q in day.get('questions', []):
        valid_answers = q.get('validAnswers', [])
        main_answer = valid_answers[0] if valid_answers else ""
        questions.append({
            "day_number": day_number,
            "date": date_str,
            "difficulty": difficulty_label,
            "order": q.get('order', 0),
            "question": q.get('text', ''),
            "theme": q.get('theme', ''),
            "answer": main_answer,
            "valid_answers": valid_answers,
            "timer_ms": q.get('initialTimerInMs', 30000),
        })
    return questions


def main():
    print("🎯 Scraper - La Table des Savoirs")
    print("=" * 50)

    # Get info
    info = api_get("/info", auth=False)
    current_day = info['currentDay']
    first_day_date = info['firstDayDate']
    print(f"📅 Jour actuel: {current_day}")
    print(f"📅 Premier jour: {first_day_date}")
    print(f"📅 Saison: {info['currentSeason']['name']}")

    all_questions = []

    # --- Today's quiz (no auth) ---
    print(f"\n📝 Quiz du jour (jour {current_day})...")
    today_data = api_get("/game/offline", auth=False)
    date_str = day_number_to_date(current_day, first_day_date)
    today_qs = extract_questions(today_data, "abordable", current_day, date_str)
    all_questions.extend(today_qs)
    print(f"   ✅ {len(today_qs)} questions abordable")

    # --- Test auth with a past quiz ---
    print("\n🔐 Test du token...")
    test = api_get("/game/offline/1")
    if 'error' in test:
        print(f"   ❌ Token invalide ou expiré: {test}")
        # Try different endpoint patterns
        for pattern in ["/game/facile/{}", "/game/abordable/{}", "/game/{}"]:
            ep = pattern.format(1)
            test2 = api_get(ep)
            if 'error' not in test2 or test2.get('error') != 401:
                print(f"   ✅ Endpoint trouvé: {ep} -> {json.dumps(test2, ensure_ascii=False)[:200]}")
                break
    else:
        print(f"   ✅ Token valide !")

    # --- Try various endpoints to find the right one ---
    print("\n🔍 Exploration des endpoints pour quiz passés...")
    endpoints_to_try = [
        ("/game/offline/{day}", "abordable"),
        ("/game/facile/{day}", "abordable"),
        ("/game/abordable/{day}", "abordable"),
        ("/game/{day}", "abordable"),
        ("/game/difficile/{day}", "expert"),
        ("/game/expert/{day}", "expert"),
    ]

    working_endpoints = {}
    for ep_template, diff in endpoints_to_try:
        ep = ep_template.format(day=1)
        result = api_get(ep)
        status = "✅" if 'day' in result else f"❌ ({result.get('error', 'unknown')})"
        print(f"   {status} {ep}")
        if 'day' in result:
            working_endpoints[diff] = ep_template
            # Show sample question
            qs = result['day'].get('questions', [])
            if qs:
                print(f"      Exemple: {qs[0].get('text', '')[:80]}...")

    if not working_endpoints:
        print("\n⚠️  Aucun endpoint trouvé pour les quiz passés.")
        print("   Sauvegarde du quiz du jour uniquement.")
        save_questions(all_questions)
        return

    # --- Scrape all past quizzes ---
    print(f"\n📝 Scraping de tous les quiz (jours 1 à {current_day - 1})...")
    for day in range(1, current_day):
        date_str = day_number_to_date(day, first_day_date)
        line = f"   📅 Jour {day:>2} ({date_str})"

        for diff_label, ep_template in working_endpoints.items():
            ep = ep_template.format(day=day)
            data = api_get(ep)
            if 'day' in data:
                qs = extract_questions(data, diff_label, day, date_str)
                all_questions.extend(qs)
                line += f"  ✅ {diff_label}({len(qs)})"
            else:
                line += f"  ❌ {diff_label}"

        print(line)
        time.sleep(0.3)

    save_questions(all_questions)


def save_questions(questions):
    output_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "questions.json")
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)

    print(f"\n💾 {len(questions)} questions sauvegardées dans questions.json")

    themes = {}
    for q in questions:
        themes[q['theme']] = themes.get(q['theme'], 0) + 1
    print("\n📊 Par thème:")
    for theme, count in sorted(themes.items(), key=lambda x: -x[1]):
        print(f"   {theme}: {count}")

    diffs = {}
    for q in questions:
        diffs[q['difficulty']] = diffs.get(q['difficulty'], 0) + 1
    print("\n📊 Par difficulté:")
    for d, c in sorted(diffs.items()):
        print(f"   {d}: {c}")


if __name__ == "__main__":
    main()
