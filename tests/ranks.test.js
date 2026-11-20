import assert from "node:assert/strict";
import test from "node:test";
import { applyMove, startRound, timeoutMove } from "../game/round.js";
import { computerMove } from "../game/computer.js";
import { defaultSettings } from "../game/rules.js";
import { strength } from "../game/cards.js";
import { newPlayer, newRoom, roomView, runCommand, updateClock } from "../server/rooms.js";
import { matchView, resultView } from "../web/views.js";

const players = ["a", "b", "c", "d"];
const ranks = players.map(id => [id]);
const noEffects = Object.fromEntries(Object.keys(defaultSettings).map(key => [key, false]));
const card = (rank, index = 0) => ({ id: rank + "-" + index, rank, suit: "♠" });
const ui = { busy: false, selected: new Set(), error: "", notice: "" };

function position(hands, turn = "b") {
    return {
        ...startRound(Object.keys(hands), 1), order: Object.keys(hands), hands, turn,
        previousKing: "a", names: { a: "前回の王", b: "挑戦者", c: "C", d: "D" },
    };
}

test("exchange takes the two/one strongest cards and preserves the deck", () => {
    const round = startRound(players, 2, ranks);
    const original = structuredClone(round.hands);
    assert.equal(round.turn, "a");
    assert.equal(round.pending.kind, "exchange");
    for (const [upper, lower, count] of [["a", "d", 2], ["b", "c", 1]]) {
        const beforeUpper = [...round.hands[upper]];
        const beforeLower = [...round.hands[lower]];
        const strongest = [...beforeLower].sort((a, b) => strength(b.rank) - strength(a.rank)).slice(0, count);
        assert.deepEqual(round.pending.tribute, strongest);
        const returning = beforeUpper.slice(0, count);
        applyMove(round, noEffects, upper, upper, { type: "resolve", cards: returning.map(card => card.id) });
        assert.deepEqual(new Set(round.hands[upper].map(card => card.id)),
            new Set([...beforeUpper.slice(count), ...strongest].map(card => card.id)));
        assert.equal(round.hands[lower].length, beforeLower.length);
    }
    assert.equal(round.pending, null);
    assert.ok(round.hands[round.turn].some(card => card.id === "3♦"));
    assert.deepEqual(Object.values(round.hands).flat().map(card => card.id).sort(),
        Object.values(original).flat().map(card => card.id).sort());
});

test("exchange rejects wrong actors, duplicate cards and early play without mutation", () => {
    const round = startRound(players, 1, ranks);
    const before = structuredClone(round);
    const id = round.pending.choices[0].id;
    for (const [actor, move] of [
        ["b", { type: "resolve", cards: [id] }],
        ["a", { type: "play", cards: [id] }],
        ["a", { type: "resolve", cards: [id] }],
        ["a", { type: "resolve", cards: [id, id] }],
    ]) {
        assert.throws(() => applyMove(round, noEffects, actor, actor, move));
        assert.deepEqual(round, before);
    }
});

test("timeout and AI complete exchanges; two/three players use only the king pair", () => {
    for (const count of [2, 3, 4, 8]) {
        const ids = Array.from({ length: count }, (_, i) => "p" + i);
        const round = startRound(ids, 2, ids.map(id => [id]));
        assert.equal(round.exchange.length, count >= 4 ? 2 : 1);
        timeoutMove(round, noEffects, round.turn, "");
        if (round.pending) applyMove(round, noEffects, round.turn, "", computerMove(round, noEffects));
        assert.equal(round.pending, null);
        assert.equal(Object.values(round.hands).flat().length, 54);
    }
});

test("first challenger forces the previous king into last place and skips their turns", () => {
    const round = position({
        a: [card("2"), card("K")], b: [card("3")], c: [card("4"), card("5")], d: [card("6")],
    });
    applyMove(round, noEffects, "b", "B", { type: "play", cards: ["3-0"] });
    assert.equal(round.fallen, "a");
    assert.equal(round.hands.a.length, 0);
    assert.equal(round.done, false);
    assert.equal(round.turn, "c");
    assert.ok(!round.discard.some(card => ["2", "K"].includes(card.rank)));
    applyMove(round, noEffects, "c", "C", { type: "play", cards: ["4-0"] });
    applyMove(round, noEffects, "d", "D", { type: "play", cards: ["6-0"] });
    assert.equal(round.done, true);
    assert.deepEqual(round.results, [["b"], ["d"], ["c"], ["a"]]);
});

test("previous king keeps the title only when ranking first after bomber resolution", () => {
    const round = position({ a: [card("3")], b: [card("4")], c: [card("5")] }, "a");
    applyMove(round, noEffects, "a", "A", { type: "play", cards: ["3-0"] });
    assert.equal(round.fallen, undefined);
    const tied = position({ a: [card("3")], b: [card("3", 1)], c: [card("4"), card("5")] }, "a");
    tied.table = { cards: [card("Q")], rank: "Q", owner: "a" };
    tied.pending = { kind: "Q", count: 1, choices: [] };
    applyMove(tied, noEffects, "a", "A", { type: "resolve", cards: ["3"] });
    assert.equal(tied.fallen, undefined);
    assert.deepEqual(tied.results, [["a"], ["b"], ["c"]]);
});

test("first finish after seven-give also triggers dethronement", () => {
    const round = position({ a: [card("K")], b: [card("7"), card("3")], c: [card("4"), card("5")] });
    applyMove(round, defaultSettings, "b", "B", { type: "play", cards: ["7-0"] });
    assert.equal(round.fallen, undefined);
    applyMove(round, defaultSettings, "b", "B", { type: "resolve", cards: ["3-0"] });
    assert.equal(round.fallen, "a");
    assert.equal(round.done, true);
    assert.deepEqual(round.results, [["b"], ["c"], ["a"]]);
});

test("multiple bomber finishers receive distinct places before the fallen king", () => {
    const round = position({ a: [card("K")], b: [card("3")], c: [card("3", 1)], d: [card("5")] });
    round.table = { cards: [card("Q")], rank: "Q", owner: "b" };
    round.pending = { kind: "Q", count: 1, choices: [] };
    applyMove(round, noEffects, "b", "B", { type: "resolve", cards: ["3"] });
    assert.equal(round.fallen, "a");
    assert.deepEqual(round.results, [["b"], ["c"], ["d"], ["a"]]);
});

test("bomber ranks its actor first then clockwise across the seat boundary even during reverse", () => {
    for (const reverse of [false, true]) {
        const round = position({
            a: [card("3", 0)], b: [card("3", 1)], c: [card("3", 2)], d: [card("3", 3)],
        }, "c");
        delete round.previousKing;
        round.reverse = reverse;
        round.table = { cards: [card("Q")], rank: "Q", owner: "c" };
        round.pending = { kind: "Q", count: 1, choices: [] };
        applyMove(round, noEffects, "c", "C", { type: "resolve", cards: ["3"] });
        assert.equal(round.done, true);
        assert.deepEqual(round.results, [["c"], ["d"], ["a"], ["b"]]);
        const next = startRound(round.order, 1, round.results);
        assert.equal(next.previousRanks.c, "大富豪");
        assert.equal(next.previousRanks.d, "富豪");
        assert.equal(next.previousRanks.a, "貧民");
        assert.equal(next.previousRanks.b, "大貧民");
        assert.equal(next.exchange[0].target, "b");
        assert.equal(next.exchange[1].from, "d");
        assert.equal(next.exchange[1].target, "a");
    }
});

test("bomber skips its actor if they retain cards, and preserves already awarded places", () => {
    const round = position({
        a: [], b: [card("3", 1)], c: [card("4")], d: [card("3", 3)],
    }, "c");
    round.results = [["a"]];
    round.reverse = true;
    round.table = { cards: [card("Q")], rank: "Q", owner: "c" };
    round.pending = { kind: "Q", count: 1, choices: [] };
    applyMove(round, noEffects, "c", "C", { type: "resolve", cards: ["3"] });
    assert.deepEqual(round.results, [["a"], ["d"], ["b"], ["c"]]);
});

test("a previous king eliminated simultaneously after another winner still falls to last", () => {
    const round = position({
        a: [card("3")], b: [card("3", 1)], c: [card("3", 2)], d: [card("4")],
    }, "b");
    round.table = { cards: [card("Q")], rank: "Q", owner: "b" };
    round.pending = { kind: "Q", count: 1, choices: [] };
    applyMove(round, noEffects, "b", "B", { type: "resolve", cards: ["3"] });
    assert.equal(round.fallen, "a");
    assert.deepEqual(round.results, [["b"], ["c"], ["d"], ["a"]]);
});

test("first round, changed roster or invalid prior rankings start normally", () => {
    for (const prior of [undefined, [["a"], ["b"], ["c"], ["x"]],
        [["a"], ["b"], ["c"], ["c"]]]) {
        const round = startRound(players, 1, prior);
        assert.equal(round.pending, null);
        assert.equal(round.previousKing, undefined);
    }
});

test("AI completes consecutive ranked rounds across supported player counts", () => {
    for (let count = 2; count <= 8; count++) {
        const players = Array.from({ length: count }, (_, index) => "p" + index);
        let previous = [];
        for (let game = 0; game < 3; game++) {
            const round = startRound(players, 2, previous);
            let actions = 0;
            while (!round.done && actions++ < 1500) {
                applyMove(round, defaultSettings, round.turn, "", computerMove(round, defaultSettings));
            }
            assert.ok(round.done);
            assert.equal(new Set(round.results.flat()).size, count);
            if (round.fallen) assert.deepEqual(round.results.at(-1), [round.fallen]);
            previous = round.results;
        }
    }
});

test("room replay and lobby preserve rankings and hide exchange choices from other players", () => {
    const owner = newPlayer("King");
    const room = newRoom("ABC234", owner);
    room.players.push(newPlayer("Rich"), newPlayer("Poor"), newPlayer("Last"));
    const ids = room.players.map(player => player.id);
    room.round = startRound(ids, 1);
    room.round.done = true;
    room.round.results = ids.map(id => [id]);
    runCommand(room, owner, { type: "lobby" });
    runCommand(room, owner, { type: "start" });
    assert.equal(room.round.previousKing, owner.id);
    const self = roomView(room, owner.id, 0);
    const other = roomView(room, ids[3], 0);
    assert.equal(self.round.pending.choices.length, room.round.hands[owner.id].length);
    assert.equal(self.round.pending.tribute.length, 2);
    assert.deepEqual(other.round.pending.choices, []);
    assert.deepEqual(other.round.pending.tribute, []);
    assert.match(matchView(self, ui), /交換する/);
    assert.match(matchView(other, ui), /カード交換が終わるまで/);
    const replay = structuredClone(room);
    replay.round.done = true;
    replay.round.results = [...ids].reverse().map(id => [id]);
    runCommand(replay, owner, { type: "start" });
    assert.equal(replay.round.previousKing, ids[3]);
});

test("human rich player selects a return card after tied lower places and AI king exchange", () => {
    const owner = newPlayer("あなた");
    const room = newRoom("ABC234", owner);
    room.solo = true;
    room.players.push(...["King", "Poor", "Last"].map(name => ({ ...newPlayer(name), computer: true })));
    const [human, king, poor, last] = room.players;
    room.round = startRound(room.players.map(player => player.id), 1);
    room.round.names = Object.fromEntries(room.players.map(player => [player.id, player.name]));
    room.round.done = true;
    room.round.results = [[king.id], [human.id], [poor.id, last.id]];
    const results = roomView(room, human.id, 0);
    assert.equal(results.round.results[1][0].nextRank, "富豪");
    assert.match(resultView(results, ui), /次回：富豪/);

    const now = 100000;
    runCommand(room, human, { type: "start" }, now);
    assert.equal(room.round.turn, king.id);
    assert.equal(updateClock(room, now + 650), true);
    assert.equal(room.round.turn, human.id);
    assert.equal(room.round.pending.count, 1);
    assert.equal(room.round.deadline, null);
    const waiting = structuredClone(room.round);
    assert.equal(updateClock(room, now + 300000), false);
    assert.deepEqual(room.round, waiting);

    runCommand(room, human, { type: "pause" }, now + 300001);
    runCommand(room, human, { type: "resume" }, now + 300501);
    assert.equal(room.round.deadline, null);
    const returning = room.round.pending.choices.at(-1);
    const tribute = room.round.pending.tribute[0];
    const view = roomView(room, human.id, 1);
    assert.ok(view.round.pending.choices.some(card => card.id === returning.id));
    assert.match(matchView(view, { ...ui, selected: new Set([returning.id]) }), /data-action="resolve">交換する/);
    runCommand(room, human, { type: "resolve", cards: [returning.id] }, now + 300502);
    assert.equal(room.round.pending, null);
    assert.ok(room.round.hands[poor.id].some(card => card.id === returning.id));
    assert.ok(room.round.hands[human.id].some(card => card.id === tribute.id));
    assert.ok(!room.round.hands[human.id].some(card => card.id === returning.id));
    assert.equal(room.round.deadline, now + 300502 + 30000);
});

test("legacy human exchange with an expired deadline still waits for manual selection", () => {
    const owner = newPlayer("Human");
    const room = newRoom("ABC234", owner);
    room.players.push(newPlayer("B"), newPlayer("C"), newPlayer("D"));
    room.round = startRound(room.players.map(player => player.id), 1, room.players.map(player => [player.id]));
    room.round.deadline = 1;
    const original = structuredClone(room.round);
    assert.equal(updateClock(room, 100000), false);
    assert.deepEqual(room.round, original);
    assert.equal(roomView(room, owner.id, 0).round.deadline, null);
});

test("fallen status is public during play and rendered in final results", () => {
    const room = { code: "ABC234", owner: "a", settings: noEffects,
        players: players.map(id => ({ id, name: id })),
        round: position({ a: [card("K")], b: [card("3")], c: [card("4")], d: [card("5")] }),
    };
    applyMove(room.round, noEffects, "b", "B", { type: "play", cards: ["3-0"] });
    const view = roomView(room, "a", 1);
    assert.equal(view.players.find(player => player.id === "a").place, 4);
    assert.match(matchView(view, ui), /都落ちで大貧民が確定/);
    applyMove(room.round, noEffects, "c", "C", { type: "play", cards: ["4-0"] });
    assert.match(resultView(roomView(room, "a", 2), ui), /都落ち/);
});

test("all-AI replays complete exchanges and dethronement for 2–8 players", () => {
    for (let count = 2; count <= 8; count++) {
        const ids = Array.from({ length: count }, (_, i) => "p" + i);
        let prior;
        for (let replay = 0; replay < 3; replay++) {
            const round = startRound(ids, 2, prior);
            let moves = 0;
            while (!round.done && moves++ < 1500) {
                applyMove(round, noEffects, round.turn, "", computerMove(round, noEffects));
            }
            assert.ok(round.done);
            assert.equal(new Set(round.results.flat()).size, count);
            if (round.fallen) assert.deepEqual(round.results.at(-1), [round.fallen]);
            prior = round.results;
        }
    }
});
