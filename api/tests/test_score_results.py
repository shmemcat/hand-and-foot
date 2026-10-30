"""Round results are prepared independently of clients' counting animations."""
import copy

import pytest

from handandfoot_server import engine
from handandfoot_server.application import ROOT
from handandfoot_server.models import Room, db
from test_engine import book, take
from test_service import app, client, create, move


def prepare_round(app, code, finished=False):
    with app.app_context():
        row = db.session.get(Room, code)
        data = copy.deepcopy(row.payload)
        game = data["game"]
        game.update(stock=list(game["cards"]), discard=[], replaced=[], phase="play")
        for player in game["players"]:
            player.update(hand=[], foot=[], piles=[], redThrees=[], chosen=True, inFoot=True)
        for side, rank in zip(game["sides"], ["K", "Q", "J", "10", "9", "8"]):
            side.update(score=9900 if finished and side["id"] == 0 else 0, melds=[])
            book(game, rank, team=side["id"])
        for player in game["players"][1:]:
            player["hand"] = take(game, "A", 1)
        engine.finish_round(game, 0, "Test round results")
        engine.assert_conservation(game)
        row.payload = data
        db.session.commit()


@pytest.mark.parametrize("mode", ["individual", "partnership"])
@pytest.mark.parametrize("finished", [False, True])
def test_confirm_prepares_every_bot_score_without_worker_turns(app, mode, finished):
    http, headers = client(app)
    room = create(http, headers, playMode="practice", scoringMode=mode)
    prepare_round(app, room["code"], finished)
    room = http.get(f'{ROOT}/rooms/{room["code"]}').json
    room = move(http, headers, room, "score_auto").json
    response = move(http, headers, room, "score_confirm")
    assert response.status_code == 200, response.json
    result = response.json
    assert result["phase"] == ("finished" if finished else "round_over")
    assert len(result["history"]) == 1
    scores = result["history"][0]["scores"]
    assert len(scores) == len(result["sides"])
    assert all(score["canceled"] for score in scores[1:])
    assert all(side["score"] == score["total"] + (9900 if finished and side["id"] == 0 else 0)
               for side, score in zip(result["sides"], scores))
    with app.app_context():
        game = db.session.get(Room, room["code"]).payload["game"]
        assert all(side["confirmed"] for side in game["scoring"]["sides"])
        engine.assert_conservation(game)


@pytest.mark.parametrize("mode", ["individual", "partnership"])
def test_bot_settlement_leaves_other_human_sides_unconfirmed(app, mode):
    http, headers = client(app)
    guest, guest_headers = client(app)
    room = create(http, headers, scoringMode=mode)
    response = guest.post(f'{ROOT}/rooms/{room["code"]}/join', headers=guest_headers, json={"name": "Friend"})
    assert response.status_code == 200
    room = http.get(f'{ROOT}/rooms/{room["code"]}').json
    room = move(http, headers, room, "start").json
    prepare_round(app, room["code"])
    room = http.get(f'{ROOT}/rooms/{room["code"]}').json
    room = move(http, headers, room, "score_auto").json
    response = move(http, headers, room, "score_confirm")
    assert response.status_code == 200, response.json
    assert response.json["phase"] == "scoring"
    assert response.json["scoring"]["confirmedSides"] == [0, *range(2, len(room["sides"]))]
    view = guest.get(f'{ROOT}/rooms/{room["code"]}').json
    assert not view["scoring"]["confirmed"]
    view = move(guest, guest_headers, view, "score_auto").json
    response = move(guest, guest_headers, view, "score_confirm")
    assert response.status_code == 200, response.json
    assert response.json["phase"] == "round_over"
