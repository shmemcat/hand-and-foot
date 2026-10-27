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


def test_only_the_viewers_top_foot_card_is_in_the_private_projection():
    game = chosen(fresh())
    before = copy.deepcopy(game)
    for viewer in game["players"]:
        view = engine.project(game, viewer["id"])
        assert view["footTop"] == game["cards"][viewer["foot"][0]]
        payload = json.dumps(view)
        for player in game["players"]:
            hidden = player["foot"][1:] if player == viewer else player["foot"] + player["hand"]
            assert all(f'"{card_id}"' not in payload for card_id in hidden)
            assert "footTop" not in next(p for p in view["players"] if p["id"] == player["id"])
    assert game == before


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
    assert [card["id"] for card in view["hand"]] == foot
    engine.assert_conservation(result)
