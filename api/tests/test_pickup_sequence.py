import copy
import pytest
from handandfoot_server import engine
from test_engine import rig, take, book


def pickup_game(*, opened=False, score=0, hand_matches=2):
    game = rig()
    game["phase"] = "draw"
    game["sides"][0].update(opened=opened, score=score)
    top = take(game, "K")[0]
    matches = take(game, "K", hand_matches)
    spare = take(game, "4")
    game["players"][0]["hand"] = matches + spare
    game["discard"] = take(game, "5") + [top]
    return game, {"type": "pickup", "groups": [{"cardIds": [*matches, top]}]}


@pytest.mark.parametrize("score,minimum", [(0, 50), (3001, 90), (6000, 120)])
def test_pickup_opening_counts_discard_and_requires_the_full_minimum_atomically(score, minimum):
    game, command = pickup_game(score=score, hand_matches=minimum // 10 - 1)
    before = copy.deepcopy(game)
    too_small = copy.deepcopy(command)
    too_small["groups"][0]["cardIds"].pop(0)
    with pytest.raises(ValueError, match=f"at least {minimum}"):
        engine.apply(game, 0, too_small)
    assert game == before
    accepted = engine.apply(game, 0, command)
    assert accepted["sides"][0]["opened"]
    assert accepted["phase"] == "draw"
    assert accepted["pickupDrawPending"]
    assert engine.project(accepted, "0")["drawCount"] == 1


def test_an_opening_pickup_cannot_omit_the_discard_even_with_enough_hand_points():
    game, command = pickup_game(hand_matches=6)
    command["groups"][0]["cardIds"].pop()
    before = copy.deepcopy(game)
    with pytest.raises(ValueError, match="top discard immediately"):
        engine.apply(game, 0, command)
    assert game == before


@pytest.mark.parametrize("opened", [False, True])
def test_pickup_requires_one_followup_draw_before_any_other_play_and_survives_projection(opened):
    game, command = pickup_game(opened=opened, hand_matches=4)
    pending = engine.apply(game, 0, command)
    view = engine.project(copy.deepcopy(pending), "0")
    assert view["pickupDrawPending"]
    assert view["drawCount"] == 1
    for action in ("pickup", "meld", "discard", "red_three"):
        before = copy.deepcopy(pending)
        with pytest.raises(ValueError, match="Draw your second card"):
            engine.apply(pending, 0, {"type": action, "groups": command["groups"], "cardId": pending["players"][0]["hand"][0]})
        assert pending == before
    hand_size, stock_size = len(pending["players"][0]["hand"]), len(pending["stock"])
    drawn = engine.apply(pending, 0, {"type": "draw"})
    assert drawn["phase"] == "play"
    assert not drawn["pickupDrawPending"]
    assert len(drawn["players"][0]["hand"]) == hand_size + 1
    assert len(drawn["stock"]) == stock_size - 1
    with pytest.raises(ValueError, match="already drew"):
        engine.apply(drawn, 0, {"type": "draw"})
    discarded = engine.apply(drawn, 0, {"type": "discard", "cardId": drawn["players"][0]["hand"][0]})
    assert discarded["actor"] == 1
    assert not discarded["pickupDrawPending"]
    engine.assert_conservation(discarded)


def test_catchup_does_not_add_an_extra_card_to_the_pickup_followup():
    game, command = pickup_game(opened=True)
    game["sides"][1]["score"] = 6001
    assert engine.project(game, "0")["drawCount"] == 3
    pending = engine.apply(game, 0, command)
    assert engine.project(pending, "0")["drawCount"] == 1
    drawn = engine.apply(pending, 0, {"type": "draw"})
    assert len(drawn["stock"]) == len(pending["stock"]) - 1


def test_empty_stock_ends_the_round_instead_of_unlocking_an_undrawn_discard():
    game, command = pickup_game(opened=True)
    pending = engine.apply(game, 0, command)
    pending["replaced"].extend(pending["stock"])
    pending["stock"] = []
    ended = engine.apply(pending, 0, {"type": "draw"})
    assert ended["phase"] == "scoring"
    assert not ended["pickupDrawPending"]


@pytest.mark.parametrize("spare,books,allowed", [(False, False, False), (True, False, True), (False, True, True)])
def test_pickup_reserves_the_final_foot_discard_with_its_mandatory_draw(spare, books, allowed):
    game, command = pickup_game(opened=True)
    player = game["players"][0]
    player["inFoot"] = True
    if not spare:
        game["stock"].append(player["hand"].pop())
    if books:
        book(game, "Q")
        book(game, "J", dirty=True)
    if not allowed:
        with pytest.raises(ValueError, match="Keep two cards"):
            engine.apply(game, 0, command)
        return
    pending = engine.apply(game, 0, command)
    assert pending["pickupDrawPending"]
    drawn = engine.apply(pending, 0, {"type": "draw"})
    assert len(drawn["players"][0]["hand"]) == int(spare) + 1
