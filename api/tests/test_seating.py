import pytest
from test_service import client, create, move, ROOT
from handandfoot_server.application import create_app


@pytest.mark.parametrize("capacity", [4, 6])
def test_host_can_arrange_partners_only_before_start(tmp_path, capacity):
    app = create_app({"TESTING": True, "START_WORKER": False, "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'game.sqlite'}"})
    host, headers = client(app)
    second, second_headers = client(app)
    third, third_headers = client(app)
    room = create(host, headers, capacity=capacity)
    second.post(f'{ROOT}/rooms/{room["code"]}/join', headers=second_headers, json={"name": "Second"})
    third.post(f'{ROOT}/rooms/{room["code"]}/join', headers=third_headers, json={"name": "Third"})
    room = host.get(f'{ROOT}/rooms/{room["code"]}').json
    second_id, third_id = room["players"][1]["id"], room["players"][2]["id"]
    other = second.get(f'{ROOT}/rooms/{room["code"]}').json
    assert move(second, second_headers, other, "swap_seats", firstId=second_id, secondId=third_id).status_code == 403
    swapped = move(host, headers, room, "swap_seats", firstId=second_id, secondId=third_id)
    assert swapped.status_code == 200
    room = swapped.json
    assert room["players"][2]["id"] == second_id
    assert [player["team"] for player in room["players"]] == [i % (capacity // 2) for i in range(3)]
    room = move(host, headers, room, "start").json
    assert [player["team"] for player in room["players"]] == [i % (capacity // 2) for i in range(capacity)]
    assert room["players"][0]["team"] == room["players"][capacity // 2]["team"]
    assert move(host, headers, room, "swap_seats", firstId=second_id, secondId=third_id).status_code == 403
