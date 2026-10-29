"""Private statistics and achievements derived only from completed game records."""
from datetime import date, datetime, timedelta, timezone
import math
from .models import AchievementUnlock, MatchResult
from .achievement_events import GAMEPLAY_ACHIEVEMENTS
from .result_categories import RESULT_CATEGORIES, result_category


FIXED_HOLIDAYS = {
    "new_year": (1, 1), "lonely_heart": (2, 14), "lucky_clover": (3, 17),
    "fireworks": (7, 4), "spooky": (10, 31), "christmas_spirit": (12, 25),
}


def easter_date(year):
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month, day = divmod(h + l - 7 * m + 114, 31)
    return date(year, month, day + 1)


def calendar_achievements(started_at, offset):
    # Never infer local dates for legacy results with missing start evidence.
    if (type(started_at) not in (int, float) or not math.isfinite(started_at)
            or type(offset) is not int or not -840 <= offset <= 720):
        return set()
    try:
        local = datetime.fromtimestamp(started_at, timezone.utc) - timedelta(minutes=offset)
    except (ValueError, OverflowError, OSError):
        return set()
    unlocked = {key for key, holiday in FIXED_HOLIDAYS.items() if (local.month, local.day) == holiday}
    if local.hour < 5:
        unlocked.add("night_owl")
    elif local.hour < 8:
        unlocked.add("early_bird")
    if local.date() == easter_date(local.year):
        unlocked.add("easter_egg")
    first = date(local.year, 11, 1)
    if local.date() == date(local.year, 11, 1 + (3 - first.weekday()) % 7 + 21):
        unlocked.add("thankful")
    return unlocked


def account_summary(key):
    results = []
    for row in MatchResult.query.order_by(MatchResult.completed_at, MatchResult.id).yield_per(200):
        data = row.payload
        player = next((p for p in data["players"] if p.get("key") == key), None)
        if player:
            results.append((data, player))
    user_id = int(key.split(":")[1])
    unlocks = {row.achievement_id for row in AchievementUnlock.query.filter_by(user_id=user_id)}
    return summarize(results, unlocks)


def summarize(results, unlocks):
    unlocks = set(unlocks)
    counters = dict(games=0, wins=0, clean_books=0, dirty_books=0, going_out=0, red_threes=0)
    streak = 0
    stats = {category: dict(games=0, wins=0, rounds=0, best=None, total=0, cleanBooks=0, dirtyBooks=0, goingOut=0)
             for category in ("all", "practice", "online", *RESULT_CATEGORIES)}
    for data, player in results:
        unlocks.update(set(player.get("achievements", [])) & GAMEPLAY_ACHIEVEMENTS)
        unlocks.update(calendar_achievements(data.get("startedAt"), player.get("utcOffsetMinutes")))
        team = player["team"]
        won = team in data["winners"]
        score = data["scores"][team]
        history = data.get("history", [])
        mine = [next(s for s in round_["scores"] if s["team"] == team) for round_ in history]
        evidence = [next((s for s in r.get("achievementData", []) if s["team"] == team), {}) for r in history]
        clean = sum(e.get("cleanBooks", 0) for e in evidence)
        dirty = sum(e.get("dirtyBooks", 0) for e in evidence)
        outs = sum(s.get("goingOut", 0) > 0 for s in mine)
        reds = sum(e.get("redThrees", 0) for e in evidence)
        counters["games"] += 1
        counters["wins"] += int(won)
        counters["clean_books"] += clean
        counters["dirty_books"] += dirty
        counters["going_out"] += outs
        counters["red_threes"] += reds
        streak = streak + 1 if won else 0
        for category in ("all", data.get("playMode"), result_category(data)):
            if category not in stats:
                continue
            item = stats[category]
            item["games"] += 1
            item["wins"] += int(won)
            item["rounds"] += len(history)
            item["best"] = score if item["best"] is None else max(score, item["best"])
            item["total"] += score
            item["cleanBooks"] += clean
            item["dirtyBooks"] += dirty
            item["goingOut"] += outs
        unlocks.add("first_chapter")
        if won:
            unlocks.add("first_victory")
            unlocks.add("team_spirit" if data["mode"] == "partnership" else "own_two_feet")
            opponents = [s for i, s in enumerate(data["scores"]) if i != team]
            # A tied game is a shared win, not a close solo victory.
            if opponents and 0 < score - max(opponents) <= 100:
                unlocks.add("photo_finish")
            if score >= data.get("targetScore", 10000) + 2000:
                unlocks.add("overachiever")
            if mine and all(s["total"] > max(o["total"] for o in r["scores"] if o["team"] != team)
                            for s, r in zip(mine, history)):
                unlocks.add("clean_sweep")
            totals = [0] * len(data["scores"])
            for round_ in history[:-1]:
                for side in round_["scores"]:
                    totals[side["team"]] += side["total"]
                if max(s for i, s in enumerate(totals) if i != team) - totals[team] >= 2000:
                    unlocks.add("comeback")
        if streak >= 5:
            unlocks.add("hot_streak")
        if len(history) >= 10:
            unlocks.add("long_story")
        if data.get("playMode") == "online":
            unlocks.add("good_company")
            if sum(bool(p.get("key")) for p in data["players"]) >= 2:
                unlocks.add("better_with_friends")
            if len(data["players"]) >= 4 and all(p.get("key") for p in data["players"]):
                unlocks.add("full_house")
        for s, e in zip(mine, evidence):
            c, d, runs = e.get("cleanBooks", 0), e.get("dirtyBooks", 0), e.get("runs", 0)
            if runs:
                unlocks.add("straight_ahead")
            if c and d:
                unlocks.add("matched_set")
            if s["total"] >= 3000:
                unlocks.add("big_hand")
            if e.get("redThrees", 0) >= 3:
                unlocks.add("triple_threat")
            if e.get("redThrees", 0) >= 6:
                unlocks.add("seeing_red")
            if c + d >= 3 and s.get("lostBooks") == 0:
                unlocks.add("handle_with_care")
            if c + d >= 5:
                unlocks.add("private_library")
            if c >= 2 and d >= 2:
                unlocks.add("balancing_act")
            if runs >= 2:
                unlocks.add("scenic_route")
    return {"stats": stats, "counters": counters, "unlocks": sorted(unlocks)}


def achievement_count(summary):
    singles = {
        "first_chapter", "first_victory", "straight_ahead", "matched_set", "big_hand",
        "team_spirit", "own_two_feet", "good_company", "sole_survivor", "a_leg_up",
        "caught_red_handed", "triple_threat", "seeing_red", "clean_sweep", "comeback",
        "photo_finish", "overachiever", "handle_with_care", "hot_streak", "private_library",
        "balancing_act", "long_story", "full_house", "scenic_route", "better_with_friends",
        "early_bird", "night_owl", "geezer", "new_year", "lonely_heart", "lucky_clover",
        "easter_egg", "fireworks", "spooky", "thankful", "christmas_spirit",
    }
    tiers = {"games": (10, 50, 200), "wins": (5, 25, 100), "clean_books": (10, 50, 200),
             "dirty_books": (10, 50, 200), "going_out": (10, 50, 200), "red_threes": (10, 50, 200)}
    return len(set(summary["unlocks"]) & singles) + sum(
        summary["counters"][key] >= target for key, targets in tiers.items() for target in targets)
