"""Rank completed, server-owned account wins using current Cards profiles."""
from collections import Counter
from datetime import datetime, timezone
import re
from .models import AchievementUnlock, DeletedAccount, MatchResult
from .result_categories import RESULT_CATEGORIES, result_category


def standings(category, accounts, lock):
    if category == "achievements":
        return {"monthly": [], "all_time": achievement_rankings(accounts, lock)}
    if category not in RESULT_CATEGORIES:
        raise ValueError("Choose Easy, Medium, Hard, or Multiplayer.")
    empty = {"monthly": [], "all_time": []}
    if accounts is None:
        return empty
    month = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0).timestamp()
    monthly, all_time = Counter(), Counter()
    with lock:
        deleted = {row.user_id for row in DeletedAccount.query.all()}
        for row in MatchResult.query.yield_per(200):
            data = row.payload
            if result_category(data) != category:
                continue
            winners = set()
            for player in data["players"]:
                key = player.get("key")
                match = re.fullmatch(r"account:([1-9][0-9]{0,18})", key) if isinstance(key, str) else None
                if not match or player["team"] not in data["winners"]:
                    continue
                uid = int(match[1])
                if uid >= 2**63 or uid in deleted or player.get("accountId", uid) != uid:
                    continue
                winners.add(uid)
            all_time.update(winners)
            if row.completed_at >= month:
                monthly.update(winners)
    # Private profile validation must never hold the game mutation lock.
    profiles = accounts.public_profiles(list(all_time)) if all_time else {}
    with lock:
        deleted = {row.user_id for row in DeletedAccount.query.all()}

    def ranked(counts):
        visible = [(profiles[uid], wins) for uid, wins in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
                   if uid in profiles and uid not in deleted][:10]
        return [{"rank": rank, "username": user.username, "profile_icon": user.profile_icon, "games_won": wins}
                for rank, (user, wins) in enumerate(visible, 1)]

    return {"monthly": ranked(monthly), "all_time": ranked(all_time)}


def achievement_rankings(accounts, lock):
    from collections import defaultdict
    from .achievements import achievement_count, summarize

    if accounts is None:
        return []
    results, unlocks = defaultdict(list), defaultdict(set)
    with lock:
        deleted = {row.user_id for row in DeletedAccount.query.all()}
        for row in MatchResult.query.order_by(MatchResult.completed_at, MatchResult.id).yield_per(200):
            seen = set()
            for player in row.payload["players"]:
                key = player.get("key")
                match = re.fullmatch(r"account:([1-9][0-9]{0,18})", key) if isinstance(key, str) else None
                if not match:
                    continue
                uid = int(match[1])
                if uid >= 2**63 or uid in deleted or uid in seen or player.get("accountId", uid) != uid:
                    continue
                seen.add(uid)
                results[uid].append((row.payload, player))
        for row in AchievementUnlock.query.all():
            if row.user_id not in deleted:
                unlocks[row.user_id].add(row.achievement_id)
        counts = {uid: achievement_count(summarize(results[uid], unlocks[uid])) for uid in results.keys() | unlocks.keys()}
    profiles = accounts.public_profiles([uid for uid, count in counts.items() if count > 0])
    with lock:
        deleted = {row.user_id for row in DeletedAccount.query.all()}
    visible = [(profiles[uid], count) for uid, count in counts.items() if count > 0 and uid in profiles and uid not in deleted]
    visible.sort(key=lambda item: (-item[1], item[0].username.lower(), item[0].id))
    return [{"rank": i + 1, "username": p.username, "profile_icon": p.profile_icon, "achievement_count": count}
            for i, (p, count) in enumerate(visible[:10])]
