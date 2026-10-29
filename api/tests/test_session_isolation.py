from handandfoot_server.application import ROOT, create_app
from test_service import app, client, create, move


def test_preview_cookies_survive_another_localhost_server_with_a_different_key(app):
    regular, regular_headers = client(app)
    original = create(regular, regular_headers)
    preview_app = create_app({**app.config, "SECRET_KEY": "another-preview-key-" * 3,
                              "SESSION_COOKIE_NAME": "handandfoot_session_55555"})
    preview, preview_headers = client(preview_app)
    room = create(preview, preview_headers, capacity=2, scoringMode="individual")
    for _ in range(3):
        # Real browsers send both names to localhost regardless of the port.
        preview.set_cookie("handandfoot_session", regular.get_cookie("handandfoot_session").value)
        regular.set_cookie("handandfoot_session_55555", preview.get_cookie("handandfoot_session_55555").value)
        assert preview.get(f'{ROOT}/rooms/{room["code"]}').json["viewerId"] == room["viewerId"]
        assert regular.get(f'{ROOT}/rooms/{original["code"]}').json["viewerId"] == original["viewerId"]
    started = move(preview, preview_headers, preview.get(f'{ROOT}/rooms/{room["code"]}').json, "start")
    assert started.status_code == 200 and started.json["viewerId"] == room["viewerId"]


def test_polling_does_not_rewrite_an_unchanged_session_cookie(app):
    http, headers = client(app)
    room = create(http, headers)
    for path in ("/session", "/active", f'/rooms/{room["code"]}'):
        response = http.get(ROOT + path)
        assert response.status_code == 200
        assert "Set-Cookie" not in response.headers
