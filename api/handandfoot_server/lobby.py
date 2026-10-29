"""Lobby membership stays separate from physical seats until the deal."""
from collections import Counter
from .rules import validate_setup


def normalize(data):
    if data.get("game"):
        return
    used = set()
    for index, player in enumerate(data["players"]):
        # Old lobbies assigned seats by roster order.
        seat = player.setdefault("lobbySeat", index)
        if seat is not None:
            if type(seat) is not int or not 0 <= seat < data["capacity"] or seat in used:
                player["lobbySeat"] = None
            else:
                used.add(seat)


def choose(data, player, seat):
    if data["status"] != "lobby":
        raise ValueError("Choose seats before the game starts.")
    if type(seat) is not int or not 0 <= seat < data["capacity"]:
        raise ValueError("Choose an open seat at this table.")
    normalize(data)
    if any(p["id"] != player["id"] and p["lobbySeat"] == seat for p in data["players"]):
        raise ValueError("Someone else has taken that seat. Choose another open seat.")
    player["lobbySeat"] = seat


def unseat(data, player):
    if data["status"] != "lobby":
        raise ValueError("Leave the table to stop playing after the deal.")
    normalize(data)
    player["lobbySeat"] = None


def prepare_start(data, fill_bots):
    normalize(data)
    if any(p["lobbySeat"] is None for p in data["players"]):
        raise ValueError("Wait for everyone to choose a seat before starting.")
    if fill_bots:
        return
    validate_setup(data["scoringMode"], len(data["players"]), data["playMode"])
    if data["scoringMode"] == "partnership":
        teams = Counter(p["lobbySeat"] % (data["capacity"] // 2) for p in data["players"])
        if any(count != 2 for count in teams.values()):
            raise ValueError("Seat both partners on each team, or fill the empty seats with bots.")
    data["players"].sort(key=lambda p: p["lobbySeat"])
    data["capacity"] = len(data["players"])
    for seat, player in enumerate(data["players"]):
        player["lobbySeat"] = seat
