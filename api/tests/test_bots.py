"""Strategy regressions validated against the authoritative game rules."""
import copy
import pytest
from handandfoot_server import bots, engine
from handandfoot_server.rules import meld_details
from test_engine import book, chosen, fresh, rig, take


def view(game, seat=0):
    return engine.project(game, str(seat)) | {"viewerId": str(seat)}


def pile(game, rank, count, *, dirty=False, kind="set", suit=None, team=0):
    ids = take(game, rank, count, suit) if kind == "set" else [take(game, r, suit=suit)[0] for r in rank]
    if dirty:
        ids += take(game, "Joker")
    details = meld_details([game["cards"][i] for i in ids], kind)
    meld = {"id": engine.uid(), "creator": str(team), "kind": kind, "cardIds": ids, **details}
    game["sides"][team]["melds"].append(meld)
    return meld


@pytest.mark.parametrize("difficulty", bots.DIFFICULTIES)
def test_bots_play_into_the_foot_without_wasting_the_turn(difficulty):
    game = rig()
    game["sides"][0]["opened"] = True
    game["players"][0]["hand"] = take(game, "K", 3)
    foot = take(game, "4", 11)
    game["players"][0]["foot"] = foot
    command = bots.decide(view(game), difficulty)
    assert command["type"] == "meld"
    result = engine.apply(game, 0, command)
    assert result["players"][0]["hand"] == foot
    assert result["players"][0]["inFoot"] and result["actor"] == 0


@pytest.mark.parametrize("difficulty", ["medium", "hard"])
def test_pickup_can_open_using_multiple_melds_then_must_draw(difficulty):
    game = rig()
    game["phase"] = "draw"
    game["sides"][0]["score"] = 3001
    game["discard"] = take(game, "A")
    game["players"][0]["hand"] = take(game, "A", 2) + take(game, "K", 3) + take(game, "4")
    command = bots.decide(view(game), difficulty)
    assert command["type"] == "pickup"
    assert sum(game["cards"][i]["value"] for group in command["groups"] for i in group["cardIds"]) == 90
    result = engine.apply(game, 0, command)
    assert result["pickupDrawPending"] and result["sides"][0]["opened"]
    followup = bots.decide(view(result), difficulty)
    assert followup == {"type": "draw"}
    drawn = engine.apply(result, 0, followup)
    assert len(drawn["stock"]) == len(game["stock"]) - 1


@pytest.mark.parametrize("difficulty", bots.DIFFICULTIES)
def test_discard_cannot_be_the_seventh_card_even_with_other_cards_in_the_draft(difficulty):
    game = rig()
    game["sides"][0]["opened"] = True
    pile(game, "A", 6)
    game["players"][0]["hand"] = take(game, "A") + take(game, "4")
    game["discard"] = take(game, "A")
    game["phase"] = "draw"
    assert bots.decide(view(game), difficulty) == {"type": "draw"}


@pytest.mark.parametrize("difficulty", bots.DIFFICULTIES)
@pytest.mark.parametrize("suit", ["hearts", "clubs"])
def test_threes_are_never_picked_up(difficulty, suit):
    game = rig()
    game["phase"] = "draw"
    game["discard"] = take(game, "3", suit=suit)
    game["players"][0]["hand"] = take(game, "K", 3)
    assert bots.decide(view(game), difficulty) == {"type": "draw"}


@pytest.mark.parametrize("difficulty", ["medium", "hard"])
@pytest.mark.parametrize("wild", ["2", "Joker"])
def test_bots_pick_up_a_useful_discarded_wild_even_with_another_wild_in_hand(difficulty, wild):
    game = rig()
    game["phase"] = "draw"
    game["discard"] = take(game, wild)
    game["players"][0]["hand"] = take(game, "A", 2) + take(game, wild) + take(game, "4")
    command = bots.decide(view(game), difficulty)
    assert command["type"] == "pickup"
    result = engine.apply(game, 0, command)
    assert result["pickupDrawPending"]
    assert result["sides"][0]["opened"]


@pytest.mark.parametrize("difficulty", bots.DIFFICULTIES)
@pytest.mark.parametrize("in_foot", [False, True])
def test_bots_replace_a_lone_red_three_instead_of_discarding_it(difficulty, in_foot):
    game = rig()
    game["sides"][0]["opened"] = True
    game["players"][0]["inFoot"] = in_foot
    book(game, "A")
    book(game, "K", dirty=True)
    red = take(game, "3", suit="hearts")[0]
    game["players"][0]["hand"] = [red]
    command = bots.decide(view(game), difficulty)
    assert command == {"type": "red_three", "cardId": red, "expose": False}
    result = engine.apply(game, 0, command)
    assert result["phase"] == "play"


def test_easy_draws_even_when_a_useful_discard_is_available():
    game = rig()
    game["phase"] = "draw"
    game["discard"] = take(game, "A")
    game["players"][0]["hand"] = take(game, "A", 2) + take(game, "4")
    assert bots.decide(view(game), "easy") == {"type": "draw"}


@pytest.mark.parametrize("difficulty", bots.DIFFICULTIES)
@pytest.mark.parametrize("has_books", [False, True])
def test_red_qualification_counts_only_reds_that_can_legally_be_exposed(difficulty, has_books):
    game = rig()
    game["sides"][0]["opened"] = True
    game["players"][0]["inFoot"] = True
    if has_books:
        book(game, "A")
        book(game, "K", dirty=True)
    game["players"][0]["hand"] = take(game, "3", 3, "hearts")
    if not has_books:
        game["players"][0]["hand"] += take(game, "4")
    command = bots.decide(view(game), difficulty)
    assert command["type"] == "red_three" and command["expose"] is False
    engine.apply(game, 0, command)


@pytest.mark.parametrize("difficulty", ["medium", "hard"])
def test_new_clean_and_dirty_books_allow_one_final_discard_in_the_same_plan(difficulty):
    game = rig()
    game["sides"][0]["opened"] = True
    game["players"][0]["inFoot"] = True
    tail = take(game, "4")
    game["players"][0]["hand"] = take(game, "A", 7) + take(game, "K", 4) + take(game, "Joker", 3) + tail
    result = engine.apply(game, 0, bots.decide(view(game), difficulty))
    assert result["players"][0]["hand"] == tail
    assert engine.can_go_out(result, result["players"][0])
    result = engine.apply(result, 0, bots.decide(view(result), difficulty))
    assert result["phase"] == "scoring"


def test_hard_preserves_a_six_card_clean_prospect_until_the_round_is_urgent():
    game = rig()
    game["sides"][0]["opened"] = True
    target = pile(game, "A", 6)
    game["players"][0]["hand"] = take(game, "Joker") + take(game, "4")
    assert bots.decide(view(game), "hard")["type"] == "discard"
    # Public stock exhaustion changes the choice: bank the bonus now.
    public = view(game)
    public["stockCount"] = 2
    command = bots.decide(public, "hard")
    assert command["type"] == "meld"
    result = engine.apply(game, 0, command)
    assert result["sides"][0]["melds"][0]["id"] == target["id"]
    assert result["sides"][0]["melds"][0]["complete"]


@pytest.mark.parametrize("difficulty", ["medium", "hard"])
def test_wilds_can_be_played_on_a_completed_dirty_book_to_go_out(difficulty):
    game = rig()
    game["sides"][0]["opened"] = True
    book(game, "A")
    pile(game, "K", 6, dirty=True)
    game["players"][0]["inFoot"] = True
    tail = take(game, "4")
    game["players"][0]["hand"] = take(game, "Joker") + tail
    command = bots.decide(view(game), difficulty)
    assert command["type"] == "meld"
    result = engine.apply(game, 0, command)
    assert result["players"][0]["hand"] == tail


@pytest.mark.parametrize("difficulty", ["medium", "hard"])
@pytest.mark.parametrize("rank", ["2", "Joker"])
def test_wilds_are_saved_instead_of_added_to_a_closed_dirty_book(difficulty, rank):
    game = rig()
    game["sides"][0]["opened"] = True
    closed = pile(game, "A", 6, dirty=True)
    wild = take(game, rank)
    game["players"][0]["hand"] = wild + take(game, "4") + take(game, "5") + take(game, "6")
    command = bots.decide(view(game), difficulty)
    assert command["type"] == "discard" and command["cardId"] not in wild
    result = engine.apply(game, 0, command)
    assert set(wild).issubset(result["players"][0]["hand"])
    assert set(result["sides"][0]["melds"][0]["cardIds"]) == set(closed["cardIds"])


@pytest.mark.parametrize("difficulty", ["medium", "hard"])
@pytest.mark.parametrize("rank", ["2", "Joker"])
@pytest.mark.parametrize("existing", [False, True])
def test_wilds_help_new_or_unfinished_books_before_closed_books(difficulty, rank, existing):
    game = rig()
    game["sides"][0]["opened"] = True
    closed = pile(game, "A", 6, dirty=True)
    if existing:
        target = pile(game, "K", 5, dirty=True)
        naturals = []
    else:
        target = None
        naturals = take(game, "K", 2)
    wild = take(game, rank)
    game["players"][0]["hand"] = naturals + wild + take(game, "4") + take(game, "5")
    command = bots.decide(view(game), difficulty)
    assert command["type"] == "meld"
    result = engine.apply(game, 0, command)
    assert set(result["sides"][0]["melds"][0]["cardIds"]) == set(closed["cardIds"])
    used = next(m for m in result["sides"][0]["melds"] if m["rank"] == "K")
    assert set(wild).issubset(used["cardIds"])
    if target:
        assert used["id"] == target["id"] and used["complete"]


@pytest.mark.parametrize("difficulty", ["medium", "hard"])
@pytest.mark.parametrize("discard_into_foot", [False, True])
def test_closed_dirty_books_may_take_wilds_to_reach_the_foot(difficulty, discard_into_foot):
    game = rig()
    game["sides"][0]["opened"] = True
    pile(game, "A", 6, dirty=True)
    foot = take(game, "8", 11)
    game["players"][0]["foot"] = foot
    tail = take(game, "4") if discard_into_foot else []
    game["players"][0]["hand"] = take(game, "Joker") + tail
    result = engine.apply(game, 0, bots.decide(view(game), difficulty))
    if tail:
        assert result["players"][0]["hand"] == tail
        result = engine.apply(result, 0, bots.decide(view(result), difficulty))
        assert result["actor"] != 0
    else:
        assert result["actor"] == 0
    assert result["players"][0]["inFoot"] and result["players"][0]["hand"] == foot


@pytest.mark.parametrize("difficulty", ["medium", "hard"])
@pytest.mark.parametrize("threat", ["stock", "opponent"])
def test_wilds_may_reduce_debt_on_closed_books_when_the_round_is_ending(difficulty, threat):
    game = rig()
    game["sides"][0]["opened"] = True
    pile(game, "Q", 6, dirty=True)
    wild = take(game, "Joker")
    game["players"][0]["hand"] = wild + take(game, "4") + take(game, "5") + take(game, "6")
    if threat == "stock":
        game["discard"] = game["stock"][:-2]
        game["stock"] = game["stock"][-2:]
    else:
        book(game, "A", team=1)
        book(game, "K", team=1, dirty=True)
        game["players"][1].update(inFoot=True, hand=take(game, "8"))
    command = bots.decide(view(game), difficulty)
    assert command["type"] == "meld"
    result = engine.apply(game, 0, command)
    assert set(wild).issubset(result["sides"][0]["melds"][0]["cardIds"])


@pytest.mark.parametrize("difficulty", ["medium", "hard"])
def test_existing_natural_run_can_be_extended_at_both_ends(difficulty):
    game = rig()
    game["sides"][0]["opened"] = True
    pile(game, ["5", "6", "7", "8", "9"], 5, kind="run", suit="hearts")
    game["players"][0]["hand"] = take(game, "4", suit="hearts") + take(game, "10", suit="hearts") + take(game, "K")
    command = bots.decide(view(game), difficulty)
    result = engine.apply(game, 0, command)
    assert result["sides"][0]["melds"][0]["complete"]
    assert result["sides"][0]["melds"][0]["bonus"] == 1300


def test_hard_avoids_feeding_the_next_opponents_visible_pile():
    game = rig()
    game["sides"][0]["opened"] = game["sides"][1]["opened"] = True
    pile(game, "K", 5, team=1)
    king, four = take(game, "K"), take(game, "4")
    game["players"][0]["hand"] = king + four
    assert bots.decide(view(game), "medium")["cardId"] == king[0]
    assert bots.decide(view(game), "hard")["cardId"] == four[0]
    engine.apply(game, 0, bots.decide(view(game), "hard"))


def test_hard_sheds_high_debt_when_an_opponent_can_go_out():
    game = rig()
    book(game, "A", team=1)
    book(game, "K", team=1, dirty=True)
    game["sides"][1]["opened"] = True
    game["players"][1].update(hand=take(game, "4"), inFoot=True)
    joker = take(game, "Joker")
    game["players"][0]["hand"] = joker + take(game, "5")
    assert bots.decide(view(game), "hard")["cardId"] == joker[0]


@pytest.mark.parametrize("difficulty", bots.DIFFICULTIES)
def test_all_levels_are_deterministic_private_and_do_not_mutate_the_view(difficulty):
    game = chosen(fresh())
    seat = game["actor"]
    public = view(game, seat)
    before = copy.deepcopy(public)
    command = bots.decide(public, difficulty)
    assert public == before
    other = copy.deepcopy(game)
    other["stock"].reverse()
    for p in other["players"]:
        if p["id"] != str(seat):
            p["hand"].reverse()
        p["foot"][1:] = reversed(p["foot"][1:])
    assert command == bots.decide(view(other, seat), difficulty)
    engine.apply(game, seat, command)


@pytest.mark.parametrize("difficulty", bots.DIFFICULTIES)
@pytest.mark.parametrize("count,mode", [(n, "individual") for n in range(2, 7)] + [(4, "partnership"), (6, "partnership")])
def test_every_difficulty_completes_legal_seeded_rounds(difficulty, count, mode):
    game = fresh(count, mode, seed=17)
    for _ in range(2500):
        if game["phase"] == "scoring":
            engine.assert_conservation(game)
            return
        seat = next(i for i, p in enumerate(game["players"]) if not p["chosen"]) if game["phase"] == "choose" else game["actor"]
        game = engine.apply(game, seat, bots.decide(view(game, seat), difficulty))
    pytest.fail("Round did not terminate")
