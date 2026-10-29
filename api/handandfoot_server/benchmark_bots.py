"""Compare bot profiles on seeded rounds, rotating profiles through every side.

Run from api: python -m handandfoot_server.benchmark_bots --seeds 50
These are round results, not human playtests or full-match win probabilities.
"""
import argparse
from collections import Counter
import json
from time import perf_counter
from . import bots, engine
from .rules import validate_setup


def benchmark(profiles=("easy", "medium", "hard"), *, count=6, mode="partnership", seeds=12, start_seed=0):
    validate_setup(mode, count, "practice")
    side_count = count // 2 if mode == "partnership" else count
    if len(profiles) != side_count or len(set(profiles)) != len(profiles):
        raise ValueError("Choose a distinct profile for each scoring side.")
    if type(seeds) is not int or seeds < 1:
        raise ValueError("Choose at least one seed.")
    for profile in profiles:
        bots.validate_difficulty(profile)
    wins, points, pickups, feet = Counter(), Counter(), Counter(), Counter()
    durations = []
    rounds = 0
    moves = 0
    for seed in range(start_seed, start_seed + seeds):
        for rotation in range(side_count):
            seats = profiles[rotation:] + profiles[:rotation]
            players = [{"id": str(i), "name": f"Bot {i + 1}", "bot": True} for i in range(count)]
            game = engine.new_game(players, mode, seed=seed)
            for _ in range(2500):
                if game["phase"] == "scoring":
                    break
                seat = (next(i for i, p in enumerate(game["players"]) if not p["chosen"])
                        if game["phase"] == "choose" else game["actor"])
                player = game["players"][seat]
                profile = seats[player["team"]]
                public = engine.project(game, player["id"]) | {"viewerId": player["id"]}
                started = perf_counter()
                command = bots.decide(public, profile)
                durations.append((perf_counter() - started) * 1000)
                pickups[profile] += command["type"] == "pickup"
                game = engine.apply(game, seat, command)
                moves += 1
            else:
                raise AssertionError(f"Seed {seed}, rotation {rotation} did not finish within 2,500 moves.")
            for side in game["sides"]:
                seat = next(i for i, p in enumerate(game["players"]) if p["team"] == side["id"])
                game = engine.apply(game, seat, {"type": "score_auto"})
                game = engine.apply(game, seat, {"type": "score_confirm"})
            best = max(side["score"] for side in game["sides"])
            for side in game["sides"]:
                profile = seats[side["id"]]
                wins[profile] += side["score"] == best
                points[profile] += side["score"]
                feet[profile] += sum(p["inFoot"] for p in game["players"] if p["team"] == side["id"])
            rounds += 1
    durations.sort()
    return {
        "players": count, "mode": mode, "rounds": rounds, "acceptedMoves": moves,
        "seeds": [start_seed, start_seed + seeds - 1],
        "profiles": {profile: {"roundWinsIncludingTies": wins[profile], "meanRoundScore": round(points[profile] / rounds, 1),
                               "discardPickups": pickups[profile], "feetReached": feet[profile]} for profile in profiles},
        "decisionMsP95": round(durations[int(len(durations) * .95)], 3),
        "decisionMsMax": round(max(durations), 3),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profiles", nargs="+", choices=bots.DIFFICULTIES, default=list(bots.DIFFICULTIES))
    parser.add_argument("--players", type=int, default=6)
    parser.add_argument("--mode", choices=("individual", "partnership"), default="partnership")
    parser.add_argument("--seeds", type=int, default=12)
    parser.add_argument("--start-seed", type=int, default=0)
    args = parser.parse_args()
    print(json.dumps(benchmark(args.profiles, count=args.players, mode=args.mode, seeds=args.seeds, start_seed=args.start_seed), indent=2))
