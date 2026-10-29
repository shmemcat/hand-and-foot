"""Durable decision clocks, unaffected by polls, sockets, or page reloads."""
from . import engine

WARNING_SECONDS = 540
TIMEOUT_SECONDS = 600


def sync(data, now):
    game = data.get("game")
    pending = {}
    if data["playMode"] == "online" and data["status"] != "closed" and game and game["phase"] != "finished":
        for player in game["players"]:
            if not player.get("key") or player["bot"]:
                continue
            phase = game["phase"]
            decision = None
            if phase == "choose" and not player["chosen"]:
                decision = ["choose"]
            elif phase in ("draw", "play"):
                if engine.opening_pending(game):
                    if player["id"] not in game.get("openingReady", []):
                        decision = ["opening"]
                elif game["players"][game["actor"]]["id"] == player["id"]:
                    decision = ["turn", game["token"]]
            elif phase == "scoring":
                review = game["scoring"]["sides"][player["team"]]
                if not review["confirmed"]:
                    decision = ["scoring", player["team"], review["revision"]]
            elif phase == "round_over" and player["id"] not in game["ready"]:
                decision = ["next_round"]
            if decision is not None:
                pending[player["id"]] = [game["matchId"], game["round"], *decision]
    timers = data.setdefault("inactivity", {})
    for pid in list(timers):
        if pid not in pending:
            del timers[pid]
    for pid, decision in pending.items():
        if timers.get(pid, {}).get("decision") != decision:
            timers[pid] = {"decision": decision, "startedAt": now, "warned": False}


def due(data, now):
    return [pid for pid, timer in data.get("inactivity", {}).items()
            if now - timer["startedAt"] >= TIMEOUT_SECONDS]
