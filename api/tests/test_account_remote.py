import errno
import http.client
import io
import json
import logging
import urllib.error
from unittest.mock import Mock

import pytest
from flask import Flask

from handandfoot_server import account_remote
from handandfoot_server.account_contracts import AccountsUnavailable
from handandfoot_server.application import ROOT, create_app
from handandfoot_server.models import Room


IDENTITY = {"id": 17, "username": "SignedIn", "profile_icon": "cat", "email_verified": True}
STATE = dict(version=1, user=IDENTITY, session={"csrf_token": "private-csrf"},
             valid_origin=True, valid_csrf=True)


def response(value):
    return io.BytesIO(json.dumps(value).encode())


def address_conflict(code=10048):
    return urllib.error.URLError(OSError(code, "local address collision"))


@pytest.fixture
def transport(monkeypatch):
    opener = Mock()
    monkeypatch.setattr(account_remote.urllib.request, "build_opener", Mock(return_value=opener))
    monkeypatch.setattr(account_remote.time, "sleep", Mock())
    return opener


def provider():
    return account_remote.RemoteAccounts("http://127.0.0.1:5678", "handandfoot-game", "private-token-" * 4)


@pytest.mark.parametrize("code", [10048, errno.EADDRINUSE])
def test_local_address_conflict_retries_and_preserves_authenticated_identity(transport, code):
    transport.open.side_effect = [address_conflict(code), response(STATE)]
    app = Flask(__name__)
    app.config["CARDS_COOKIE_SECURE"] = False
    with app.test_request_context(headers={"Cookie": "cards_session=opaque-private-session"}):
        accounts = provider()
        assert accounts.cookie_user().id == 17
        assert accounts.session().csrf_token == "private-csrf"
        assert accounts.valid_csrf()
    assert transport.open.call_count == 2
    assert all(call.kwargs["timeout"] == 2 for call in transport.open.call_args_list)
    assert transport.open.call_args_list[0].args == transport.open.call_args_list[1].args


def test_profile_reads_recover_from_two_collisions(transport):
    transport.open.side_effect = [address_conflict(), address_conflict(), response(dict(version=1, profiles=[IDENTITY]))]
    assert provider().public_profiles([17])[17].username == "SignedIn"
    assert transport.open.call_count == 3


@pytest.mark.parametrize("error", [
    ConnectionAbortedError(10053, "connection aborted"),
    urllib.error.URLError(ConnectionResetError(10054, "connection reset")),
    http.client.RemoteDisconnected("closed before response"),
])
def test_interrupted_read_only_account_requests_recover(transport, error):
    transport.open.side_effect = [error, response(STATE)]
    assert provider()._call("session", {})["user"] == IDENTITY
    assert transport.open.call_count == 2


@pytest.mark.parametrize("error", [
    ConnectionAbortedError(10053, "read aborted"),
    http.client.IncompleteRead(b'{"version":', 100),
])
def test_partial_response_is_closed_before_retrying_the_account_read(transport, error):
    partial = Mock()
    partial.__enter__ = Mock(return_value=partial)
    partial.__exit__ = Mock()
    partial.read.side_effect = error
    transport.open.side_effect = [partial, response(STATE)]
    assert provider()._call("session", {})["user"] == IDENTITY
    partial.__exit__.assert_called_once()
    assert transport.open.call_count == 2


def test_unknown_operations_do_not_retry_interrupted_requests(transport):
    transport.open.side_effect = ConnectionAbortedError(10053, "connection aborted")
    with pytest.raises(AccountsUnavailable):
        provider()._call("future-mutation", {})
    assert transport.open.call_count == 1


def test_repeated_conflicts_fail_closed_without_creating_a_guest_table(transport, tmp_path):
    transport.open.side_effect = address_conflict()
    app = create_app(dict(TESTING=True, START_WORKER=False, SECRET_KEY="test-secret-" * 4,
        SQLALCHEMY_DATABASE_URI=f"sqlite:///{tmp_path / 'network.sqlite'}",
        CARDS_ACCOUNTS_URL="http://127.0.0.1:5678", CARDS_SERVICE_TOKEN="private-token-" * 4,
        GAME_ACCOUNT_TOKENS={"handandfoot": "callback-token-" * 4}))
    http = app.test_client()
    http.set_cookie("cards_session", "opaque-private-session")
    result = http.post(ROOT + "/rooms", json=dict(name="Guest", capacity=2, scoringMode="individual", playMode="practice"))
    assert result.status_code == 503 and result.json["code"] == "ACCOUNTS_UNAVAILABLE"
    assert transport.open.call_count == 3
    with app.app_context():
        assert Room.query.count() == 0


@pytest.mark.parametrize("status", [301, 401, 403, 429, 500, 503])
def test_http_failures_are_not_retried_or_logged_with_credentials(transport, caplog, status):
    transport.open.side_effect = urllib.error.HTTPError("http://private/url-with-secret", status,
        "sensitive-response-body", {}, io.BytesIO(b"sensitive-response-body"))
    with caplog.at_level(logging.WARNING), pytest.raises(AccountsUnavailable):
        provider()._call("session", {})
    assert transport.open.call_count == 1
    assert f"status={status}" in caplog.text
    for secret in ("private-token", "sensitive-response-body", "url-with-secret"):
        assert secret not in caplog.text


@pytest.mark.parametrize("error", [
    urllib.error.URLError(TimeoutError("timeout")),
    urllib.error.URLError(ConnectionRefusedError(errno.ECONNREFUSED, "offline")),
    TimeoutError("read timed out"),
])
def test_other_network_errors_are_not_retried(transport, error):
    transport.open.side_effect = error
    with pytest.raises(AccountsUnavailable):
        provider()._call("session", {})
    assert transport.open.call_count == 1


@pytest.mark.parametrize("body", [b"not json", b"x" * 262145, b'{"version":2}', b'[]'],
                         ids=["invalid-json", "oversized", "unsupported-version", "wrong-type"])
def test_malformed_or_oversized_responses_are_not_retried(transport, body):
    transport.open.return_value = io.BytesIO(body)
    with pytest.raises(AccountsUnavailable):
        provider()._call("session", {})
    assert transport.open.call_count == 1


def test_recovered_connection_does_not_cache_identity_across_requests(transport):
    transport.open.side_effect = [address_conflict(), response(STATE),
        response(dict(STATE, user=None, session=None, valid_csrf=False))]
    accounts = provider()
    app = Flask(__name__)
    app.config["CARDS_COOKIE_SECURE"] = False
    with app.test_request_context(headers={"Cookie": "cards_session=opaque-private-session"}):
        assert accounts.cookie_user().id == 17
    with app.test_request_context(headers={"Cookie": "cards_session=opaque-private-session"}):
        assert accounts.cookie_user() is None
        assert not accounts.valid_csrf()
    assert transport.open.call_count == 3
