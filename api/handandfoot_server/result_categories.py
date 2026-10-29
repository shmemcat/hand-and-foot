"""A stable category for both legacy and difficulty-aware completed results."""
from .bots import DIFFICULTIES

RESULT_CATEGORIES = (*DIFFICULTIES, "multiplayer")


def result_category(data):
    if data.get("playMode") == "online":
        return "multiplayer"
    if data.get("playMode") == "practice":
        # Keep historical results in Medium even if the bot default changes.
        difficulty = data.get("botDifficulty", "medium")
        return difficulty if difficulty in DIFFICULTIES else None
    return None
