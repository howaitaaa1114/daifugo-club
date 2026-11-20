import assert from "node:assert/strict";
import test from "node:test";
import { computerMove } from "../game/computer.js";
import { applyMove, startRound } from "../game/round.js";
import { defaultSettings } from "../game/rules.js";

const card = (rank, index = 0) => ({ id: rank + "-" + index, rank, suit: "♠" });

function position(hand) {
    return {
        order: ["ai", "left", "right"],
        hands: {
            ai: hand,
            left: [card("3", 1), card("4", 1), card("K", 1), card("A", 1)],
            right: [card("5", 2), card("6", 2), card("7", 2), card("2", 2)],
        },
        turn: "ai", table: null, discard: [], passed: [], results: [],
        revolution: false, back: false, reverse: false, pending: null, done: false, last: "",
    };
}

test("takes a finishing play and does not mutate the live round", () => {
    const round = position([card("3"), card("3", 1), card("JK")]);
    const before = structuredClone(round);
    const move = computerMove(round, defaultSettings);
    assert.deepEqual(round, before);
    applyMove(round, defaultSettings, "ai", "AI", move);
    assert.equal(round.hands.ai.length, 0);
});

test("uses a configured effect to finish with otherwise different ranks", () => {
    const round = position([card("10"), card("3")]);
    const move = computerMove(round, defaultSettings);
    assert.deepEqual(move.cards, ["10-0"]);
    applyMove(round, defaultSettings, "ai", "AI", move);
    applyMove(round, defaultSettings, "ai", "AI", computerMove(round, defaultSettings));
    assert.equal(round.hands.ai.length, 0);
});

test("preserves a pair when discarding an awkward single", () => {
    const round = position([card("3"), card("3", 1), card("4"), card("A")]);
    round.pending = { kind: "10", count: 1, choices: round.hands.ai };
    assert.deepEqual(computerMove(round, defaultSettings).cards, ["4-0"]);
});

test("declines optional pickups when already about to finish", () => {
    const round = position([card("3")]);
    round.pending = { kind: "9", count: 1, choices: [card("JK")] };
    assert.deepEqual(computerMove(round, defaultSettings), { type: "resolve", cards: [] });
});

test("bomber picks distinct ranks and removes its own bulky group", () => {
    const round = position([card("3"), card("3", 1), card("3", 2), card("4")]);
    round.pending = { kind: "Q", count: 2, choices: [] };
    const move = computerMove(round, defaultSettings);
    assert.equal(new Set(move.cards).size, 2);
    assert.deepEqual(new Set(move.cards), new Set(["3", "4"]));
});

test("opponent card identities cannot change the decision", () => {
    const first = position([card("3"), card("8"), card("A"), card("JK")]);
    const second = structuredClone(first);
    second.hands.left = second.hands.left.map((_, i) => card("2", i));
    second.hands.right = second.hands.right.map((_, i) => card("Q", i));
    assert.deepEqual(computerMove(first, defaultSettings), computerMove(second, defaultSettings));
});

test("only legal moves across 2–8 players, jokers and rule configurations", () => {
    for (let count = 2; count <= 8; count++) {
        for (const jokers of [1, 2]) {
            for (const mode of ["default", "off", "reverse"]) {
                const settings = { ...defaultSettings };
                if (mode === "off") {
                    for (const key of Object.keys(settings)) {
                        if (typeof settings[key] === "boolean") settings[key] = false;
                    }
                }
                if (mode === "reverse") {
                    settings["9"] = false;
                    settings.nineReverse = true;
                }
                const players = Array.from({ length: count }, (_, i) => "p" + i);
                const round = startRound(players, jokers);
                let moves = 0;
                while (!round.done && moves < 1500) {
                    const actor = round.turn;
                    const move = computerMove(round, settings);
                    assert.ok(move, "AI returns an action");
                    applyMove(round, settings, actor, actor, move);
                    moves++;
                }
                assert.ok(round.done, "a full match reaches results");
                assert.equal(new Set(round.results.flat()).size, count);
            }
        }
    }
});
