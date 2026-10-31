"""Explicit departures release membership; losing a connection never does."""
from . import engine


def players(data):
    return data["game"]["players"] if data.get("game") else data["players"]


def depart(data, player, reason="left"):
    game = data.get("game")
    playing = game and game["phase"] != "finished"
    if playing and reason == "left" and data["playMode"] == "online":
        raise ValueError("Concede to give up your seat during a game. Leaving the page saves your seat.")
    key = player.get("key")
    if key:
        data.setdefault("removed", {})[key] = reason
    if not game:
        data["players"] = [p for p in data["players"] if p["id"] != player["id"]]
    else:
        # Keep the account reference for deletion cleanup; only key owns a seat or result.
        player.update(key=None, away=True)
    remaining = [p for p in players(data) if p.get("key")]
    if data["hostId"] == player["id"]:
        data["hostId"] = remaining[0]["id"] if remaining else ""
    if len(remaining) <= 1:
        data.update(status="closed", closedReason="empty" if not remaining else "one_player")
    elif playing:
        if data["scoringMode"] == "partnership" and any(p.get("key") and p["team"] == player["team"] for p in remaining):
            player.update(bot=True, away=False, conceded=True, botDifficulty="hard", name=player["name"] + " (bot)")
        else:
            engine.remove_side(game, player["team"])
            data["capacity"] = len(game["players"])
    data["inactivity"] = {}
    data["token"] = engine.uid()
