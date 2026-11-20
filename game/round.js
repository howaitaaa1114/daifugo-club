import { bomberRanks, pickCards, rankName, requireRule, shuffle, shuffledDeck, strength, withoutCards } from "./cards.js";
import { placeName } from "./rules.js";

export function startRound(players, jokerCount, previousResults = []) {
    const order = shuffle(players);
    const hands = Object.fromEntries(order.map((id)=>[
            id,
            []
        ]));
    const deck = shuffledDeck(jokerCount);
    deck.forEach((card, i) => hands[order[i % order.length]].push(card));
    const turn = order.find(id => hands[id].some(card => card.id === "3♦"));
    Object.values(hands).forEach((hand)=>hand.sort((a, b)=>strength(a.rank) - strength(b.rank)));
    const round = {
        order,
        names: {},
        hands,
        turn,
        table: null,
        discard: [],
        passed: [],
        results: [],
        revolution: false,
        back: false,
        reverse: false,
        pending: null,
        last: "♦3を持つプレイヤーからスタート",
        done: false
    };
    const ranking = previousResults.flat();
    const validRanking = ranking.length === players.length && new Set(ranking).size === players.length
        && ranking.every(id => players.includes(id)) && previousResults.every(group => group.length === 1);
    if (validRanking) {
        round.previousKing = ranking[0];
        round.previousRanks = Object.fromEntries(ranking.map((id, index) => [id, placeName(index + 1, players.length)]));
        const pairs = [[ranking[0], ranking.at(-1), 2]];
        if (players.length >= 4) pairs.push([ranking[1], ranking.at(-2), 1]);
        round.exchange = pairs.map(([from, target, count]) => ({
            from, target, count,
            choices: [...hands[from]],
            tribute: [...hands[target]].sort((a, b) => strength(b.rank) - strength(a.rank)).slice(0, count),
        }));
        nextExchange(round);
    }
    return round;
}

function nextExchange(round) {
    const next = round.exchange[0];
    if (next) {
        round.turn = next.from;
        round.pending = { kind: "exchange", count: next.count, target: next.target, choices: next.choices, tribute: next.tribute };
        round.last = `${round.previousRanks[next.from]}が交換するカードを選んでいます`;
    } else {
        round.pending = null;
        round.turn = round.order.find(id => round.hands[id].some(card => card.id === "3♦"));
        round.last = "カード交換完了 · ♦3を持つプレイヤーからスタート";
    }
}

function exchangeCards(round, actor, values) {
    const effect = round.pending;
    requireRule(Array.isArray(values) && values.length === effect.count, `渡すカードを${effect.count}枚選んでください。`);
    const cards = pickCards(effect.choices, values);
    round.hands[actor] = [...withoutCards(round.hands[actor], cards), ...effect.tribute];
    round.hands[effect.target] = [...withoutCards(round.hands[effect.target], effect.tribute), ...cards];
    round.exchange.shift();
    nextExchange(round);
}
export function following(round, id) {
    const order = round.reverse ? [...round.order].reverse() : round.order;
    const index = order.indexOf(id);
    return [...order.slice(index + 1), ...order.slice(0, index + 1)];
}
function active(round, id) {
    return round.hands[id].length > 0;
}
function settle(round, candidates) {
    const finished = candidates.filter((id)=>id !== round.fallen && !active(round, id) && !round.results.flat().includes(id));
    if (!round.results.length && finished.length && round.previousKing && !finished.includes(round.previousKing)) {
        round.fallen = round.previousKing;
        // Eliminated cards stay out of the discard pile, including pickup choices.
        round.hands[round.fallen] = [];
        round.last += ` · ${round.names[round.fallen] ?? "前回の大富豪"}が都落ち`;
    }
    if (finished.length) round.results.push(finished);
    const remaining = round.order.filter((id)=>active(round, id));
    if (remaining.length <= 1) {
        if (remaining.length) round.results.push(remaining);
        if (round.fallen) round.results.push([round.fallen]);
        round.done = true;
    }
}
function clearTable(round) {
    const table = round.table;
    discardTable(round);
    round.table = null;
    round.back = false;
    round.passed = [];
    round.turn = active(round, table.owner) ? table.owner : following(round, table.owner).find((id)=>active(round, id));
}
function discardTable(round) {
    round.discard.push(...round.table.cards.filter(card => !round.table.excluded?.includes(card.id)));
}

export function timeoutMove(round, settings, actor, name) {
    const effect = round.pending;
    if (effect) {
        const cards = effect.kind === "Q" ? bomberRanks.slice(0, effect.count)
            : effect.kind === "9" ? [] : effect.choices.slice(0, effect.count).map(card => card.id);
        applyMove(round, settings, actor, name, { type: "resolve", cards });
    } else if (round.table) {
        applyMove(round, settings, actor, name, { type: "pass" });
    } else {
        round.turn = following(round, actor).find(id => active(round, id));
        round.last = `${name} がパス`;
    }
    round.last += "（時間切れ）";
}
function advance(round, from, skip = 0) {
    if (round.done) return;
    const owner = round.table.owner;
    const followingSeats = following(round, from);
    const beforeOwner = followingSeats.slice(0, followingSeats.indexOf(owner));
    const available = beforeOwner.filter(id => active(round, id) && !round.passed.includes(id));
    const next = available[skip];
    if (!next) {
        clearTable(round);
        return;
    }
    round.turn = next;
}
function getEffect(round, rank, count, actor) {
    const hand = round.hands[actor];
    if (rank === "7" || rank === "10") {
        const target = rank === "7" ? following(round, actor).find((id)=>id !== actor && active(round, id)) : undefined;
        if (!hand.length || rank === "7" && !target) return null;
        return {
            kind: rank,
            count: Math.min(count, hand.length),
            choices: hand,
            target
        };
    }
    if (rank === "9" && round.discard.length) {
        return {
            kind: rank,
            count: Math.min(count, round.discard.length),
            choices: round.discard
        };
    }
    if (rank === "Q") return {
        kind: rank,
        count: Math.min(count, bomberRanks.length),
        choices: []
    };
    return null;
}
function resolve(round, actor, values) {
    const effect = round.pending;
    const validCount = Array.isArray(values) && (effect.kind === "9" ? values.length <= effect.count : values.length === effect.count);
    requireRule(validCount, "指定された枚数を選んでください。");
    let candidates = [
        actor
    ];
    if (effect.kind === "Q") {
        requireRule(new Set(values).size === values.length && values.every(rank => bomberRanks.includes(rank)), "除外する数字やジョーカーを選び直してください。");
        candidates = round.order.filter((id)=>id === actor || active(round, id));
        for (const id of candidates){
            round.hands[id] = round.hands[id].filter((card)=>!values.includes(card.rank));
        }
        round.discard = round.discard.filter(card => !values.includes(card.rank));
        round.table.excluded = round.table.cards
            .filter(card => values.includes(card.rank) || values.includes(round.table.rank))
            .map(card => card.id);
        round.last += ` · ${values.map(rankName).join("・")} を除外`;
    } else {
        const cards = pickCards(effect.choices, values);
        if (effect.kind === "9") {
            round.discard = withoutCards(round.discard, cards);
            round.hands[actor].push(...cards);
        } else {
            round.hands[actor] = withoutCards(round.hands[actor], cards);
            if (effect.kind === "7") round.hands[effect.target].push(...cards);
            else round.discard.push(...cards);
        }
        round.last += ` · ${cards.length}枚を${({
            "7": "渡した",
            "9": "拾った",
            "10": "捨てた"
        })[effect.kind]}`;
    }
    round.pending = null;
    settle(round, candidates);
    advance(round, actor);
}
export function applyMove(round, settings, actor, name, move) {
    requireRule(!round.done && round.turn === actor, "今はあなたの手番ではありません。");
    if (round.pending) {
        requireRule(move.type === "resolve", "役の処理を完了してください。");
        if (round.pending.kind === "exchange") {
            exchangeCards(round, actor, move.cards);
            return;
        }
        resolve(round, actor, move.cards);
        return;
    }
    if (move.type === "pass") {
        requireRule(round.table, "場が空のときはカードを出してください。");
        round.passed.push(actor);
        round.last = `${name} がパス`;
        advance(round, actor);
        return;
    }
    requireRule(move.type === "play", "カードを出すかパスしてください。");
    const cards = pickCards(round.hands[actor], move.cards);
    requireRule(cards.length, "カードを選んでください。");
    const rank = cards.find((card)=>card.rank !== "JK")?.rank ?? "JK";
    requireRule(cards.every((card)=>card.rank === rank || card.rank === "JK"), "同じ数字のカードを選んでください。");
    if (round.table) {
        const reversed = round.revolution !== round.back;
        requireRule(cards.length === round.table.cards.length, `場札と同じ${round.table.cards.length}枚を選んでください。`);
        requireRule(strength(rank, reversed) > strength(round.table.rank, reversed), `場札の${rankName(round.table.rank)}より強い組を選んでください。`);
        discardTable(round);
    }
    round.hands[actor] = withoutCards(round.hands[actor], cards);
    round.passed = [];
    round.table = {
        cards,
        rank,
        owner: actor
    };
    round.last = `${name} が ${rank === "JK" ? "ジョーカー" : rank} を${cards.length}枚出した`;
    if (settings.revolution && cards.length >= 4) {
        round.revolution = !round.revolution;
        round.last += " · 革命";
    }
    const enabled = rank in settings && settings[rank];
    if (enabled && rank === "J") {
        round.back = !round.back;
        round.last += " · イレブンバック";
    }
    const reverseNine = rank === "9" && settings.nineReverse;
    if (reverseNine) {
        round.reverse = !round.reverse;
        round.last += " · 9リバース";
    }
    round.pending = enabled && !reverseNine ? getEffect(round, rank, cards.length, actor) : null;
    if (round.pending) return;
    settle(round, [
        actor
    ]);
    if (round.done) return;
    if (enabled && rank === "8") {
        round.last += " · ヤギリ";
        clearTable(round);
    } else {
        const skip = enabled && (rank === "5" || rank === "K") ? cards.length : 0;
        if (skip) round.last += " · スキップ";
        advance(round, actor, skip);
    }
}
