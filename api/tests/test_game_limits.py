from handandfoot_server.application import ROOT
from handandfoot_server.game_limits import open_games
from test_service import app, client, create, move


def test_cap_blocks_new_tables_but_not_resume_or_concede(app):
    app.config["MAX_IN_PROGRESS_GAMES"] = 2
    http, headers = client(app)
    first = create(http, headers, playMode="practice")
    second = create(http, headers, playMode="practice")
    blocked = http.post(
        ROOT + "/rooms",
        headers=headers,
        json={
            "name": "Emily",
            "capacity": 6,
            "scoringMode": "individual",
            "playMode": "practice",
        },
    )
    assert blocked.status_code == 409 and "2 games in progress" in blocked.json["error"]
    assert http.get(f'{ROOT}/rooms/{second["code"]}').status_code == 200
    assert move(http, headers, first, "concede").status_code == 200
    assert create(http, headers, playMode="practice")["code"]


def test_creation_rate_combines_practice_and_online_tables(app):
    http, headers = client(app)
    for index in range(5):
        create(http, headers, playMode="practice" if index % 2 else "online")
    response = http.post(
        ROOT + "/rooms",
        headers=headers,
        json={
            "name": "Emily",
            "capacity": 6,
            "scoringMode": "individual",
            "playMode": "online",
        },
    )
    assert response.status_code == 429 and response.headers["Retry-After"] == "60"


def test_start_checks_every_players_current_allowance(app):
    app.config["MAX_IN_PROGRESS_GAMES"] = 1
    host, headers = client(app)
    guest, guest_headers = client(app)
    lobby = create(host, headers)
    assert (
        guest.post(
            f'{ROOT}/rooms/{lobby["code"]}/join',
            headers=guest_headers,
            json={"name": "Friend"},
        ).status_code
        == 200
    )
    create(guest, guest_headers, playMode="practice")
    blocked = move(
        host, headers, host.get(f'{ROOT}/rooms/{lobby["code"]}').json, "start"
    )
    assert (
        blocked.status_code == 409
        and "Friend has 1 games in progress" in blocked.json["error"]
    )


def test_creation_window_expires_and_is_separate_per_player(app):
    import pytest
    from handandfoot_server.game_limits import GameLimit, check_creation

    with app.app_context():
        for _ in range(5):
            check_creation("account:rate-test")
        with pytest.raises(GameLimit) as error:
            check_creation("account:rate-test")
        assert error.value.status == 429
        check_creation("account:another-player")
        app.extensions["game_creation_times"]["account:rate-test"] = [-1000]
        check_creation("account:rate-test")
