"""Versioned family rules. Family choices take precedence over Bicycle."""
from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class Ruleset:
    id: str = "family-v1"
    cards_per_pile: int = 11
    target_score: int = 10000
    opening: int = 50
    high_opening: int = 90
    high_score: int = 3000
    highest_opening: int = 120
    highest_score: int = 6000
    opening_is_strict: bool = False
    clean_bonus: int = 500
    dirty_bonus: int = 300
    flush_bonus: int = 1300
    flush_extra: int = 50
    going_out_bonus: int = 100
    red_three: int = 300
    black_three: int = 100
    discard_pickup: int = 1
    discard_followup_draw: int = 1
    catch_up_gap: int = 5000
    catch_up_extra_cards: int = 1


FAMILY = Ruleset()
RANKS = ["4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]
SUITS = ["clubs", "diamonds", "hearts", "spades"]


def rules_snapshot():
    return asdict(FAMILY)


def validate_setup(scoring_mode, capacity, play_mode):
    if scoring_mode not in ("individual", "partnership"):
        raise ValueError("Choose individual or partnership scoring.")
    if type(capacity) is not int or capacity not in (
        (2, 3, 4, 5, 6) if scoring_mode == "individual" else (4, 6, 8)
    ):
        raise ValueError("Individual tables need 2–6 players; partners need 4, 6, or 8.")
    if play_mode not in ("practice", "online"):
        raise ValueError("Choose practice or online play.")


def card_value(rank, suit):
    if rank == "Joker":
        return 50
    if rank in ("2", "A"):
        return 20
    if rank == "3":
        return -300 if suit in ("diamonds", "hearts") else -100
    return 5 if rank in ("4", "5", "6", "7", "8") else 10


def make_deck(seats):
    cards = {}
    for deck in range(seats + 1):
        for suit in SUITS:
            for rank in ["2", "3", *RANKS]:
                card_id = f"{deck}:{suit}:{rank}"
                cards[card_id] = {
                    "id": card_id, "rank": rank, "suit": suit,
                    "value": card_value(rank, suit), "wild": rank == "2",
                    "redThree": rank == "3" and suit in ("diamonds", "hearts"),
                }
        for joker in range(2):
            card_id = f"{deck}:joker:{joker}"
            cards[card_id] = {"id": card_id, "rank": "Joker", "suit": "joker", "value": 50, "wild": True, "redThree": False}
    return cards


def opening_for(score):
    if score >= FAMILY.highest_score:
        return FAMILY.highest_opening
    return FAMILY.high_opening if score > FAMILY.high_score else FAMILY.opening


def draw_count(sides, team):
    others = [side["score"] for side in sides if side["id"] != team]
    return 2 + (FAMILY.catch_up_extra_cards if others and min(others) - sides[team]["score"] > FAMILY.catch_up_gap else 0)


def meld_details(cards, kind="set"):
    if len(cards) < 3:
        raise ValueError("Start a pile with at least three cards.")
    if kind == "run":
        if any(card["rank"] not in RANKS or card["wild"] for card in cards):
            raise ValueError("A straight flush uses natural cards from four through ace.")
        if len({card["suit"] for card in cards}) != 1:
            raise ValueError("Every straight-flush card must have the same suit.")
        positions = sorted(RANKS.index(card["rank"]) for card in cards)
        if len(set(positions)) != len(positions) or positions != list(range(positions[0], positions[-1] + 1)):
            raise ValueError("A straight flush needs consecutive ranks, with no duplicates or gaps.")
        return {"rank": cards[0]["suit"], "complete": len(cards) >= 7, "dirty": False,
                "bonus": FAMILY.flush_bonus + (len(cards) - 7) * FAMILY.flush_extra if len(cards) >= 7 else 0}
    if kind != "set":
        raise ValueError("Unknown pile type.")
    # Twos are natural only when the pile has no ordinary natural rank.
    natural = [card for card in cards if not card["wild"]] or [card for card in cards if card["rank"] == "2"]
    if not natural or any(card["rank"] == "3" for card in natural):
        raise ValueError("Threes and Joker-only piles cannot be melded as a matching set.")
    if len({card["rank"] for card in natural}) != 1:
        raise ValueError("Natural cards in a pile must have the same rank.")
    dirty = len(natural) != len(cards)
    if len(natural) <= len(cards) - len(natural):
        raise ValueError("Natural cards must always outnumber wilds, including in the initial meld.")
    return {"rank": natural[0]["rank"], "complete": len(cards) >= 7, "dirty": dirty,
            "bonus": (FAMILY.dirty_bonus if dirty else FAMILY.clean_bonus) if len(cards) >= 7 else 0}
