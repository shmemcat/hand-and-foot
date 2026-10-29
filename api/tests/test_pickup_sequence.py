import copy
import pytest
from handandfoot_server import engine
from handandfoot_server.rules import RANKS
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


@pytest.mark.parametrize("rank", RANKS)
@pytest.mark.parametrize("wild", ["Joker", "2"])
def test_pickup_can_start_a_valid_pile_with_one_matching_natural_and_a_wild(rank, wild):
    game = rig()
    game["phase"] = "draw"
    game["sides"][0]["opened"] = True
    top = take(game, rank)[0]
    hand = take(game, rank) + take(game, wild)
    spare = take(game, "4")
    game["players"][0]["hand"] = hand + spare
    lower = take(game, "5")
    game["discard"] = lower + [top]
    before = copy.deepcopy(game)
    result = engine.apply(game, 0, {"type": "pickup", "groups": [{"cardIds": [*hand, top]}]})
    assert game == before
    assert result["discard"] == lower
    assert result["players"][0]["hand"] == spare
    meld = result["sides"][0]["melds"][0]
    assert meld["rank"] == rank
    assert meld["dirty"]
    assert set(meld["cardIds"]) == {*hand, top}
    assert result["pickupDrawPending"]
    assert engine.project(result, "0")["drawCount"] == 1
    engine.assert_conservation(result)


@pytest.mark.parametrize("ranks,error", [
    (["K"], "at least three cards"),
    (["Joker", "2"], "outnumber wilds"),
    (["K", "Joker", "2"], "outnumber wilds"),
    (["Q", "Joker"], "same rank"),
])
def test_pickup_still_requires_a_valid_resulting_meld(ranks, error):
    game, _ = pickup_game(opened=True, hand_matches=0)
    hand = [take(game, rank)[0] for rank in ranks]
    game["players"][0]["hand"].extend(hand)
    before = copy.deepcopy(game)
    with pytest.raises(ValueError, match=error):
        engine.apply(game, 0, {"type": "pickup", "groups": [{"cardIds": [*hand, game["discard"][-1]]}]})
    assert game == before


@pytest.mark.parametrize("score,allowed", [(0, True), (3001, False), (6000, False)])
def test_pickup_with_a_wild_still_requires_the_opening_minimum(score, allowed):
    game, command = pickup_game(score=score, hand_matches=1)
    wild = take(game, "Joker")[0]
    game["players"][0]["hand"].append(wild)
    command["groups"][0]["cardIds"].append(wild)
    before = copy.deepcopy(game)
    if not allowed:
        with pytest.raises(ValueError, match="Your opening must total at least"):
            engine.apply(game, 0, command)
        assert game == before
        return
    result = engine.apply(game, 0, command)
    assert result["sides"][0]["opened"]
    assert result["pickupDrawPending"]


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
    for side in game["sides"][1:]:
        side["score"] = 6001
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
