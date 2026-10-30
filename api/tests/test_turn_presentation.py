"""A new draw waits for the previous turn's presentation on every human client."""
import copy
import time
import pytest
from handandfoot_server import engine, bots
from handandfoot_server.application import ROOT
from handandfoot_server.models import Room, db
from test_engine import take
from test_service import app, client, create, move


def setup_turn(app, *, human_next=False, foot=True):
    host, headers = client(app)
    guest, guest_headers = client(app)
    room = create(host, headers, capacity=2, scoringMode="individual",
                  playMode="online" if human_next else "practice")
    if human_next:
        guest.post(f'{ROOT}/rooms/{room["code"]}/join', headers=guest_headers, json={"name": "Friend"})
        room = host.get(f'{ROOT}/rooms/{room["code"]}').json
        room = move(host, headers, room, "start").json
    with app.app_context():
        row = db.session.get(Room, room["code"])
        data = copy.deepcopy(row.payload)
        game = data["game"]
        game.update(stock=list(game["cards"]), discard=[], phase="play", actor=0,
                    openingComplete=True, tableEvents=[], turnPresentation=None)
        for player in game["players"]:
            player.update(hand=[], foot=[], piles=[], chosen=True, inFoot=False, redThrees=[])
        game["players"][0].update(hand=take(game, "K", 1 if foot else 2), foot=take(game, "8", 11))
        game["players"][1].update(hand=take(game, "K", 2) + take(game, "5", 2), foot=take(game, "9", 11))
        game["sides"][1]["opened"] = True
        engine.assert_conservation(game)
        row.payload = data
        db.session.commit()
    room = host.get(f'{ROOT}/rooms/{room["code"]}').json
    response = move(host, headers, room, "discard", cardId=room["hand"][0]["id"])
    assert response.status_code == 200, response.json
    return host, headers, guest, guest_headers, response.json


@pytest.mark.parametrize("foot", [False, True])
@pytest.mark.parametrize("action", ["draw", "pickup"])
def test_bots_wait_for_completed_turn_and_board_before_either_draw(app, monkeypatch, foot, action):
    host, headers, _, _, waiting = setup_turn(app, foot=foot)
    assert not waiting["turnPresentation"]["complete"]
    observed = []

    def decide(view, difficulty):
        observed.append(view)
        if action == "draw":
            return {"type": "draw"}
        kings = [card["id"] for card in view["hand"] if card["rank"] == "K"]
        return {"type": "pickup", "groups": [{"cardIds": kings + [view["discard"]["id"]]}]}

    monkeypatch.setattr(bots, "decide", decide)
    for _ in range(4):
        app.extensions["tick"]()
    assert observed == []
    current = host.get(f'{ROOT}/rooms/{waiting["code"]}').json
    assert current["stockCount"] == waiting["stockCount"]
    assert current["tableEvents"] == waiting["tableEvents"]
    ready = move(host, headers, current, "turn_ready", presentationId=current["turnPresentation"]["id"])
    assert ready.status_code == 200, ready.json
    assert ready.json["turnPresentation"]["complete"]
    app.extensions["tick"]()
    assert len(observed) == 1
    drawn = host.get(f'{ROOT}/rooms/{waiting["code"]}').json
    assert drawn["tableEvents"][-1]["kind"] == action
    assert drawn["turnPresentation"] is None


@pytest.mark.parametrize("action", ["draw", "pickup"])
def test_human_draws_wait_for_all_clients_and_acks_share_a_stable_token(app, action):
    host, headers, guest, guest_headers, waiting = setup_turn(app, human_next=True)
    other = guest.get(f'{ROOT}/rooms/{waiting["code"]}').json
    rejected = move(guest, guest_headers, other, action)
    assert rejected.status_code == 400
    assert "transition" in rejected.json["error"]
    first = move(host, headers, waiting, "turn_ready", presentationId=waiting["turnPresentation"]["id"])
    assert first.status_code == 200
    assert not first.json["turnPresentation"]["complete"]
    assert first.json["token"] == other["token"]
    assert move(guest, guest_headers, other, action).status_code == 400
    ready = move(guest, guest_headers, other, "turn_ready", presentationId=other["turnPresentation"]["id"])
    assert ready.status_code == 200, ready.json
    assert ready.json["turnPresentation"]["complete"]
    payload = {}
    if action == "pickup":
        kings = [card["id"] for card in ready.json["hand"] if card["rank"] == "K"]
        payload["groups"] = [{"cardIds": kings + [ready.json["discard"]["id"]]}]
    assert move(guest, guest_headers, ready.json, action, **payload).status_code == 200


def test_wrong_transition_ack_is_atomic_and_next_deal_clears_the_gate(app):
    host, headers, _, _, waiting = setup_turn(app)
    assert move(host, headers, waiting, "turn_ready", presentationId="old-turn").status_code == 400
    assert host.get(f'{ROOT}/rooms/{waiting["code"]}').json == waiting
    with app.app_context():
        game = copy.deepcopy(db.session.get(Room, waiting["code"]).payload["game"])
        engine.deal_round(game)
        assert game["turnPresentation"] is None
        assert not engine.turn_pending(game)


def test_disconnected_client_uses_the_existing_inactivity_clock_and_bot_takeover_releases_turn(app, monkeypatch):
    host, headers, _, _, waiting = setup_turn(app, human_next=True)
    ready = move(host, headers, waiting, "turn_ready", presentationId=waiting["turnPresentation"]["id"])
    assert not ready.json["turnPresentation"]["complete"]
    with app.app_context():
        row = db.session.get(Room, waiting["code"])
        data = copy.deepcopy(row.payload)
        presentation = data["game"]["turnPresentation"]
        assert all(timer["decision"][-2:] == ["turn_presentation", presentation["id"]]
                   for timer in data["inactivity"].values())
        assert len(data["inactivity"]) == 1
        timer = next(iter(data["inactivity"].values()))
        timer["startedAt"] = time.time() - 601
        row.payload = data
        db.session.commit()
    monkeypatch.setattr(bots, "decide", lambda view, difficulty: {"type": "draw"})
    app.extensions["tick"]()
    drawn = host.get(f'{ROOT}/rooms/{waiting["code"]}').json
    assert drawn["players"][1]["bot"]
    assert drawn["phase"] == "play"
    assert drawn["tableEvents"][-1]["kind"] == "draw"
