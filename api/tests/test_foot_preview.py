import copy
import json
import pytest
from handandfoot_server import engine
from test_engine import fresh, chosen, rig, take


@pytest.mark.parametrize("pile", [0, 1])
def test_chosen_foot_keeps_the_top_card_seen_during_pile_selection(pile):
    game = fresh()
    before = engine.project(game, "0")
    assert before["footTop"] is None
    top = before["footPreview"][1 - pile][0]
    game = engine.apply(game, 0, {"type": "choose", "pile": pile})
    view = engine.project(game, "0")
    assert view["footTop"] == top
    assert view["footPreview"] is None


def test_every_top_foot_card_is_public_but_hands_and_remaining_feet_are_private():
    game = chosen(fresh())
    before = copy.deepcopy(game)
    for viewer in game["players"]:
        view = engine.project(game, viewer["id"])
        assert view["footTop"] == game["cards"][viewer["foot"][0]]
        payload = json.dumps(view)
        for player in game["players"]:
            hidden = player["foot"][1:] + ([] if player == viewer else player["hand"])
            assert all(f'"{card_id}"' not in payload for card_id in hidden)
            public = next(p for p in view["players"] if p["id"] == player["id"])
            assert public["footTop"] == game["cards"][player["foot"][0]]
            assert "hand" not in public and "foot" not in public
    assert game == before


def test_unchosen_piles_have_no_public_top_foot_card():
    game = fresh()
    assert all(player["footTop"] is None for player in engine.project(game, "0")["players"])


def test_top_foot_preview_clears_when_the_foot_becomes_the_hand():
    game = rig()
    aces = take(game, "A", 3)
    foot = take(game, "4", 11)
    game["players"][0].update(hand=aces, foot=foot)
    game["sides"][0]["opened"] = True
    assert engine.project(game, "0")["footTop"] == game["cards"][foot[0]]
    result = engine.apply(game, 0, {"type": "meld", "groups": [{"cardIds": aces}]})
    view = engine.project(result, "0")
    assert view["footTop"] is None
    assert view["players"][0]["footTop"] is None
    assert [card["id"] for card in view["hand"]] == foot
    engine.assert_conservation(result)
