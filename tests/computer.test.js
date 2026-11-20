import assert from "node:assert/strict";
import test from "node:test";
import { computerMove } from "../game/computer.js";
import { applyMove, startRound } from "../game/round.js";
import { defaultSettings } from "../game/rules.js";
import { shuffledDeck } from "../game/cards.js";

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

function bomberPosition(ownRanks, hiddenRanks, sizes, extra = {}) {
    const deck = shuffledDeck(2);
    const take = rank => {
        const index = deck.findIndex(card => card.rank === rank);
        assert.ok(index >= 0);
        return deck.splice(index, 1)[0];
    };
    const own = ownRanks.map(take);
    const hidden = hiddenRanks.map(take);
    const hands = { ai: own };
    let offset = 0;
    for (let i = 0; i < sizes.length; i++) {
        hands["p" + i] = hidden.slice(offset, offset += sizes[i]);
    }
    assert.equal(offset, hidden.length);
    return {
        ...position(own), order: Object.keys(hands), hands, discard: deck, names: {},
        table: { cards: [], rank: "Q", owner: "ai" },
        pending: { kind: "Q", count: 1, choices: [] }, ...extra,
    };
}

const twoJokers = { ...defaultSettings, jokerCount: 2 };

test("bomber removes unseen strong blockers even without owning that rank", () => {
    const round = bomberPosition(["3", "4", "5"], ["2", "2", "A", "A", "K", "K"], [3, 3]);
    assert.deepEqual(computerMove(round, twoJokers).cards, ["2"]);
});

test("bomber removes opposing queens to protect a strong hand", () => {
    const round = bomberPosition(["2", "2", "A", "A", "K"], ["Q", "Q", "Q", "J", "J", "10"], [3, 3]);
    assert.deepEqual(computerMove(round, twoJokers).cards, ["Q"]);
    round.bombedRanks = ["Q"];
    assert.ok(!computerMove(round, twoJokers).cards.includes("Q"));
});

test("bomber avoids finishing opponents and losing the previous king title", () => {
    const round = bomberPosition(["3", "A", "2"], ["3", "3"], [1, 1], { previousKing: "ai" });
    const move = computerMove(round, twoJokers);
    assert.ok(!move.cards.includes("3"));
    applyMove(round, twoJokers, "ai", "AI", move);
    assert.equal(round.fallen, undefined);
    assert.deepEqual(round.results, []);
});

test("previous king accepts less self-discard benefit to reduce the risk of dethronement", () => {
    const round = bomberPosition(["3", "A", "2"],
        ["3", "K", "K", "K", "J", "J", "J", "10", "10", "10"], [1, 9]);
    assert.deepEqual(computerMove(round, twoJokers).cards, ["3"]);
    round.previousKing = "ai";
    assert.ok(!computerMove(round, twoJokers).cards.includes("3"));
});

test("revolution changes which unseen ranks are strong blockers", () => {
    const round = bomberPosition(["2", "A", "K"], ["3", "3", "4", "4", "5", "5"], [3, 3],
        { revolution: true });
    assert.deepEqual(computerMove(round, twoJokers).cards, ["3"]);
});

test("bomber can finish first even if the same removal also finishes opponents", () => {
    const round = bomberPosition(["3"], ["3", "3"], [1, 1], { previousKing: "ai" });
    const move = computerMove(round, twoJokers);
    assert.deepEqual(move.cards, ["3"]);
    applyMove(round, twoJokers, "ai", "AI", move);
    assert.deepEqual(round.results, [["ai"], ["p0"], ["p1"]]);
    assert.equal(round.fallen, undefined);
    assert.deepEqual(round.bombedRanks, ["3"]);
});

test("multi-rank bomber choices account for opponents holding a mixture of removed ranks", () => {
    const round = bomberPosition(["3", "4", "A", "2"], ["3", "4"], [2], { previousKing: "ai" });
    round.pending.count = 2;
    const move = computerMove(round, twoJokers);
    assert.equal(new Set(move.cards).size, 2);
    assert.ok(!(move.cards.includes("3") && move.cards.includes("4")));
    applyMove(round, twoJokers, "ai", "AI", move);
    assert.equal(round.fallen, undefined);
});

test("bomber decisions use public counts without inspecting or mutating hidden cards", () => {
    const first = bomberPosition(["2", "A", "3"], ["Q", "Q", "J", "10"], [2, 2]);
    const second = structuredClone(first);
    second.hands.p0 = second.hands.p0.map((card, index) => ({ ...card, rank: "2", id: "secret" + index }));
    second.hands.p1 = second.hands.p1.map((card, index) => ({ ...card, rank: "3", id: "other" + index }));
    const before = structuredClone(first);
    assert.deepEqual(computerMove(first, twoJokers), computerMove(second, twoJokers));
    assert.deepEqual(first, before);
});

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
