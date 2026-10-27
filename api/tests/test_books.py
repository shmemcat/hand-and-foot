import copy
import pytest
from handandfoot_server import bots, engine
from handandfoot_server.rules import meld_details
from test_engine import rig, take, book


@pytest.mark.parametrize("rank", ["9", "2"])
def test_completed_books_accept_additions_and_another_pile_of_the_same_rank(rank):
    game = rig()
    target = book(game, rank)
    game["sides"][0]["opened"] = True
    additions = take(game, rank, 4)
    tail = take(game, "4")
    game["players"][0]["hand"] = additions + tail
    result = engine.apply(game, 0, {"type": "meld", "groups": [
        {"meldId": target["id"], "cardIds": additions[:1]},
        {"cardIds": additions[1:]},
    ]})
    completed, opened = result["sides"][0]["melds"]
    assert len(completed["cardIds"]) == 8
    assert completed["complete"] and completed["bonus"] == 500
    assert len(opened["cardIds"]) == 3 and not opened["complete"]
    assert result["players"][0]["hand"] == tail
    engine.assert_conservation(result)


def test_a_larger_dirty_book_keeps_its_bonus_and_natural_majority():
    game = rig()
    target = book(game, "9", dirty=True)
    game["sides"][0]["opened"] = True
    natural = take(game, "9")
    wild = take(game, "2")
    tail = take(game, "4")
    game["players"][0]["hand"] = natural + wild + tail
    before = copy.deepcopy(game)
    with pytest.raises(ValueError, match="outnumber"):
        engine.apply(game, 0, {"type": "meld", "groups": [{"meldId": target["id"], "cardIds": wild}]})
    assert game == before
    result = engine.apply(game, 0, {"type": "meld", "groups": [{"meldId": target["id"], "cardIds": natural + wild}]})
    completed = result["sides"][0]["melds"][0]
    assert len(completed["cardIds"]) == 9
    assert completed["complete"] and completed["dirty"] and completed["bonus"] == 300


@pytest.mark.parametrize("dirty,suit", [(False, "clubs"), (True, "hearts")])
def test_book_cover_swaps_an_equivalent_card_from_stock_without_touching_private_cards(dirty, suit):
    game = rig()
    ids = take(game, "9", 4, suit)
    ids += take(game, "2", 3) if dirty else take(game, "9", 3, "spades")
    target = {"id": "cover", "creator": "0", "kind": "set", "cardIds": ids, **meld_details([game["cards"][i] for i in ids])}
    game["sides"][0]["melds"] = [target]
    game["players"][0]["hand"] = take(game, "9", 1, "diamonds")
    before_players = copy.deepcopy(game["players"])
    before_stock_count = len(game["stock"])
    before_values = sum(game["cards"][i]["value"] for i in ids)
    original = copy.deepcopy(game)
    view = engine.project(game, "0")
    assert game == original
    cover = view["sides"][0]["melds"][0]["cards"][-1]
    assert (cover["suit"] in {"hearts", "diamonds"}) == (not dirty)
    engine.arrange_book_covers(game)
    assert target["cardIds"][-1] == cover["id"]
    assert game["players"] == before_players
    assert len(game["stock"]) == before_stock_count
    assert sum(game["cards"][i]["value"] for i in target["cardIds"]) == before_values
    engine.assert_conservation(game)
    normalized = copy.deepcopy(game)
    engine.arrange_book_covers(game)
    assert game == normalized


def test_cover_can_come_from_another_public_matching_pile_without_changing_a_straight():
    game = rig()
    ids = take(game, "9", 4, "clubs") + take(game, "9", 3, "spades")
    target = {"id": "clean", "creator": "0", "kind": "set", "cardIds": ids, **meld_details([game["cards"][i] for i in ids])}
    donor_ids = take(game, "9", 3, "diamonds")
    donor = {"id": "donor", "creator": "0", "kind": "set", "cardIds": donor_ids, **meld_details([game["cards"][i] for i in donor_ids])}
    run_ids = [take(game, rank, suit="hearts")[0] for rank in ("8", "9", "10")]
    run = {"id": "run", "creator": "0", "kind": "run", "cardIds": run_ids[:], **meld_details([game["cards"][i] for i in run_ids], "run")}
    game["sides"][0]["melds"] = [target, donor, run]
    # All other red nines are private, so the open pile is the only donor.
    reds = [i for i in game["stock"] if game["cards"][i]["rank"] == "9" and game["cards"][i]["suit"] in {"hearts", "diamonds"}]
    game["players"][1]["hand"] = reds
    game["stock"] = [i for i in game["stock"] if i not in reds]
    engine.arrange_book_covers(game)
    assert game["cards"][target["cardIds"][-1]]["suit"] == "diamonds"
    assert len(donor["cardIds"]) == 3
    assert run["cardIds"] == run_ids
    assert game["players"][1]["hand"] == reds
    engine.assert_conservation(game)


def test_bot_adds_to_a_completed_clean_book_without_dirtying_it():
    game = rig()
    target = book(game, "9")
    game["sides"][0]["opened"] = True
    natural = take(game, "9")
    game["players"][0]["hand"] = natural + take(game, "2") + take(game, "4")
    view = engine.project(game, "0") | {"viewerId": "0"}
    groups = bots.plan_melds(view)
    assert groups[0] == {"meldId": target["id"], "cardIds": natural}
    result = engine.apply(game, 0, {"type": "meld", "groups": groups})
    assert result["sides"][0]["melds"][0]["bonus"] == 500
