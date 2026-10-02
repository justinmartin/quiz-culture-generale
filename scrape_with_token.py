"""
Scraper incrémental - La Table des Savoirs

Ajoute à questions.json uniquement les quiz manquants (nouveaux jours, ou jours
qu'un run précédent n'a pas pu récupérer), au lieu de tout re-télécharger.

    QUIZ_TOKEN="eyJ..." python scrape_with_token.py          # incrémental
    QUIZ_TOKEN="eyJ..." python scrape_with_token.py --full   # tout re-scraper

Le token se récupère sur latabledessavoirs.fr (voir update.sh).
"""
import argparse
import json
import os
import socket
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from datetime import datetime, timedelta

# IPv4 d'abord : sur certains réseaux l'IPv6 de l'API est injoignable et urllib
# (contrairement à curl) attend l'échec de chaque adresse IPv6 avant de tenter l'IPv4.
_getaddrinfo = socket.getaddrinfo
socket.getaddrinfo = lambda *a, **k: sorted(_getaddrinfo(*a, **k), key=lambda r: r[0] != socket.AF_INET)

BASE_URL = "https://api.latabledessavoirs.fr"
QUESTIONS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "questions.json")
# Libellé dans questions.json -> difficulté côté API
DIFFICULTIES = {"abordable": "facile", "expert": "difficile"}
QUESTIONS_PER_QUIZ = 10


def api_get(endpoint, token=None):
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://latabledessavoirs.fr",
        "Referer": "https://latabledessavoirs.fr/",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{BASE_URL}{endpoint}", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as e:
        return {"error": e.code, "message": e.read().decode() if e.fp else ""}
    except Exception as e:
        return {"error": str(e)}


def day_number_to_date(day_number, first_day_str):
    first_day = datetime.fromisoformat(first_day_str.replace("Z", "+00:00"))
    return (first_day + timedelta(days=day_number - 1)).strftime("%Y-%m-%d")


def extract_questions(quiz_data, difficulty_label, day_number, date_str):
    if not quiz_data or "day" not in quiz_data:
        return []
    questions = []
    for q in quiz_data["day"].get("questions", []):
        valid_answers = q.get("validAnswers", [])
        questions.append({
            "day_number": day_number,
            "date": date_str,
            "difficulty": difficulty_label,
            "order": q.get("order", 0),
            "question": q.get("text", ""),
            "theme": q.get("theme", ""),
            "answer": valid_answers[0] if valid_answers else "",
            "valid_answers": valid_answers,
            "timer_ms": q.get("initialTimerInMs", 30000),
        })
    return questions


def load_existing():
    if not os.path.exists(QUESTIONS_FILE):
        return []
    with open(QUESTIONS_FILE, encoding="utf-8") as f:
        return json.load(f)


def save(questions):
    questions.sort(key=lambda q: (q["day_number"], q["difficulty"], q["order"]))
    with open(QUESTIONS_FILE, "w", encoding="utf-8") as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--full", action="store_true", help="re-scraper tous les jours")
    args = parser.parse_args()

    token = os.environ.get("QUIZ_TOKEN")
    if not token:
        sys.exit("❌ QUIZ_TOKEN manquant (voir update.sh pour le récupérer).")

    info = api_get("/info")
    if "error" in info:
        sys.exit(f"❌ API indisponible : {info}")
    current_day, first_day = info["currentDay"], info["firstDayDate"]
    print(f"📅 Jour actuel : {current_day} ({info['currentSeason']['name']})")

    probe = api_get("/game/facile/1", token)
    if probe.get("error") == 401:
        sys.exit("❌ Token invalide ou expiré : renouvelle-le (instructions dans update.sh).")

    existing = [] if args.full else load_existing()
    complete = Counter((q["day_number"], q["difficulty"]) for q in existing)
    todo = [(day, label) for day in range(1, current_day + 1) for label in DIFFICULTIES
            if complete[(day, label)] < QUESTIONS_PER_QUIZ]
    print(f"🗂️  {len(existing)} questions en base, {len(todo)} quiz à récupérer")

    # On remplace entièrement un quiz incomplet pour éviter les doublons.
    todo_set = set(todo)
    questions = [q for q in existing if (q["day_number"], q["difficulty"]) not in todo_set]
    added, missing = 0, []
    for day, label in todo:
        data = api_get(f"/game/{DIFFICULTIES[label]}/{day}", token)
        if "day" not in data and day == current_day and label == "abordable":
            data = api_get("/game/offline")  # quiz du jour accessible sans auth
        qs = extract_questions(data, label, day, day_number_to_date(day, first_day))
        if qs:
            questions.extend(qs)
            added += len(qs)
            print(f"   ✅ Jour {day:>3} {label:<9} +{len(qs)}")
        else:
            missing.append(f"{day}/{label}")
        time.sleep(0.3)

    save(questions)
    print(f"\n💾 {len(questions)} questions (+{added}) sauvegardées dans questions.json")
    if missing:
        print(f"⚠️  Indisponibles (réessayés au prochain run) : {', '.join(missing)}")


if __name__ == "__main__":
    main()
