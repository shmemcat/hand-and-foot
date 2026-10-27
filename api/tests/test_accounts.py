import copy
import time
import uuid
import pytest
from flask import request
from handandfoot_server.account_contracts import AccountIdentity, AccountsUnavailable
from handandfoot_server.application import ROOT, NAMESPACE, create_app
from handandfoot_server.models import DeletedAccount, MatchResult, Room, db
from test_service import client, create, move


class Accounts:
    def __init__(self):
        self.revoked = set()
        self.unavailable = False
        self.app = None

    def refresh(self):
        pass

    def cookie_user(self):
        assert not self.app.extensions["room_lock"]._is_owned()
        value = request.cookies.get("cards_session")
        if not value:
            return None
        if self.unavailable:
            raise AccountsUnavailable()
        if value in self.revoked:
            return None
        return AccountIdentity(int(value), "Player" + value, "cat", True)

    def public_profiles(self, ids):
        assert not self.app.extensions["room_lock"]._is_owned()
        if self.unavailable:
            raise AccountsUnavailable()
        return {uid: AccountIdentity(uid, "Player" + str(uid), "cat", True) for uid in ids if str(uid) not in self.revoked}


@pytest.fixture
def app(tmp_path):
    provider = Accounts()
    app = create_app({"TESTING": True, "START_WORKER": False,
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'accounts-game.sqlite'}",
        "SECRET_KEY": "test-secret-" * 4, "ACCOUNTS_PROVIDER": provider,
        "GAME_ACCOUNT_TOKENS": {"handandfoot": "callback-key-" * 4}})
    provider.app = app
    return app


def sign_in(http, uid="1"):
    http.set_cookie("cards_session", uid)
    return http.get(ROOT + "/session")


def test_authoritative_identity_cross_device_and_account_isolation(app):
    one, headers = client(app)
    assert sign_in(one).json["user"] == {"id": "1", "name": "Player1", "profile_icon": "cat"}
    room = create(one, headers, name="Spoofed")
    assert room["players"][0]["name"] == "Player1"
    second_device, _ = client(app)
    sign_in(second_device)
    assert second_device.get(f'{ROOT}/rooms/{room["code"]}').json["viewerId"] == room["viewerId"]
    sign_in(second_device, "2")
    assert second_device.get(f'{ROOT}/rooms/{room["code"]}').status_code == 403
    one.delete_cookie("cards_session")
    assert one.get(f'{ROOT}/rooms/{room["code"]}').status_code == 403


def test_guest_lobby_transfers_host_but_played_games_do_not(app):
    http, headers = client(app)
    lobby = create(http, headers)
    game = create(http, headers, playMode="practice")
    sign_in(http)
    claimed = http.get(f'{ROOT}/rooms/{lobby["code"]}').json
    assert claimed["viewerId"] == lobby["viewerId"] == claimed["hostId"]
    assert claimed["players"][0]["name"] == "Player1"
    assert http.get(f'{ROOT}/rooms/{game["code"]}').status_code == 403
    assert move(http, headers, claimed, "start").status_code == 200
    http.delete_cookie("cards_session")
    assert http.get(f'{ROOT}/rooms/{lobby["code"]}').status_code == 403
    assert http.get(f'{ROOT}/rooms/{game["code"]}').status_code == 200


def test_duplicate_account_lobby_seats_merge_without_losing_host(app):
    guest, headers = client(app)
    room = create(guest, headers)
    signed, signed_headers = client(app)
    sign_in(signed)
    joined = signed.post(f'{ROOT}/rooms/{room["code"]}/join', headers=signed_headers, json={"name": "Ignored"}).json
    sign_in(guest)
    merged = guest.get(f'{ROOT}/rooms/{room["code"]}').json
    assert len(merged["players"]) == 1
    assert merged["viewerId"] == joined["viewerId"] == merged["hostId"]


def test_account_scores_survive_new_browser_without_claiming_guest_results(app):
    http, _ = client(app)
    with http.session_transaction() as state:
        guest = state["guest"]
    with app.app_context():
        for key, score in [(guest, 100), ("account:1", 500), ("account:2", 900)]:
            db.session.add(MatchResult(id=uuid.uuid4().hex, completed_at=time.time(), payload={"code": "ABCDEF", "mode": "individual", "players": [{"key": key, "team": 0}], "scores": [score], "winners": [0]}))
        db.session.commit()
    assert [r["score"] for r in http.get(ROOT + "/scores").json] == [100]
    sign_in(http)
    assert [r["score"] for r in http.get(ROOT + "/scores").json] == [500]
    other, _ = client(app)
    sign_in(other)
    assert [r["score"] for r in other.get(ROOT + "/scores").json] == [500]


def test_outage_fails_closed_and_guests_remain_playable(app):
    http, headers = client(app)
    app.extensions["accounts"].unavailable = True
    assert create(http, headers)
    http.set_cookie("cards_session", "1")
    result = http.get(ROOT + "/session")
    assert result.status_code == 503 and result.json["code"] == "ACCOUNTS_UNAVAILABLE"
    assert http.post(ROOT + "/rooms", headers=headers, json={}).status_code == 503


def test_socket_revalidates_revoked_shared_session(app):
    http, headers = client(app)
    sign_in(http)
    room = create(http, headers)
    socket = app.extensions["socketio"].test_client(app, namespace=NAMESPACE,
        flask_test_client=http, auth={"csrf": headers["X-Handandfoot-CSRF"]}, headers={"Origin": "http://127.0.0.1:3004"})
    assert socket.is_connected(NAMESPACE)
    assert socket.emit("handandfoot:subscribe", {"code": room["code"]}, namespace=NAMESPACE, callback=True)["ok"]
    app.extensions["accounts"].revoked.add("1")
    assert "error" in socket.emit("handandfoot:subscribe", {"code": room["code"]}, namespace=NAMESPACE, callback=True)
    assert http.get(f'{ROOT}/rooms/{room["code"]}').status_code == 403
    socket.disconnect(namespace=NAMESPACE)


def test_private_deletion_scrubs_and_fences_stale_requests(app):
    http, headers = client(app)
    sign_in(http)
    room = create(http, headers, playMode="practice")
    with app.app_context():
        row = db.session.get(Room, room["code"])
        data = copy.deepcopy(row.payload)
        data["game"]["message"] = "Player1 drew two cards."
        data["game"]["scoring"] = {"reason": "Player1 went out first.", "debtBreakdown": [{"name": "Player1"}]}
        row.payload = data
        db.session.add(MatchResult(id=uuid.uuid4().hex, completed_at=time.time(), payload={"players": [{"key": None, "accountId": 1, "team": 0}], "history": [{"reason": "Player1 went out first."}]}))
        db.session.commit()
    endpoint = "/_internal/games/v1/handandfoot/delete-user"
    payload = {"user_id": 1, "request_id": uuid.uuid4().hex}
    assert http.post(endpoint, json=payload).status_code == 403
    auth = {"X-Cards-Service": "accounts", "Authorization": "Bearer " + "callback-key-" * 4}
    for _ in range(2):
        result = http.post(endpoint, headers=auth, json=payload)
        assert result.json == {"version": 1, "deleted": True, "request_id": payload["request_id"]}
    assert http.get(f'{ROOT}/rooms/{room["code"]}').status_code == 403
    assert http.post(ROOT + "/rooms", headers=headers, json={}).status_code == 403
    with app.app_context():
        assert DeletedAccount.query.count() == 1
        data = db.session.get(Room, room["code"]).payload
        assert "account:1" not in str(data) and "Player1" not in str(data)
        assert "account:1" not in str(MatchResult.query.one().payload)
        assert "Player1" not in str(MatchResult.query.one().payload)
        assert MatchResult.query.one().payload["players"][0]["accountId"] is None
