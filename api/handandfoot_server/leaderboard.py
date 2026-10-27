"""Rank completed, server-owned account wins using current Cards profiles."""
from collections import Counter
from datetime import datetime, timezone
import re
from .models import DeletedAccount, MatchResult


def standings(mode, accounts, lock):
    if mode not in {"practice", "online"}:
        raise ValueError("Choose Against Bots or Multiplayer.")
    empty = {"monthly": [], "all_time": []}
    if accounts is None:
        return empty
    month = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0).timestamp()
    monthly, all_time = Counter(), Counter()
    with lock:
        deleted = {row.user_id for row in DeletedAccount.query.all()}
        for row in MatchResult.query.yield_per(200):
            data = row.payload
            if data.get("playMode") != mode:
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
