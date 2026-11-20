import { bomberRanks, playableGroups, strength } from "./cards.js";
import { applyMove } from "./round.js";
import { defaultSettings } from "./rules.js";

// Lower cost means fewer awkward singles and more ways to retain the lead.
function handCost(hand, round, settings) {
    const counts = new Map();
    for (const card of hand) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
    const reversed = round.revolution !== round.back;
    let cost = hand.length * 0.9;
    for (const [rank, count] of counts) {
        const power = strength(rank, reversed) * 0.3 + strength(rank, round.revolution) * 0.7;
        cost += 6 + (count === 1 ? (13 - power) * 0.22 : 0);
        cost -= Math.max(0, power - 9) * 0.9;
        if (rank === "JK") cost -= 6;
        if (settings[rank] && ["7", "8", "10", "Q"].includes(rank)) cost -= 2;
    }
    return cost;
}

function publicInformation(round, settings) {
    const own = round.hands[round.turn];
    const visible = [...own, ...round.discard, ...(round.table?.cards ?? [])];
    const jokers = Math.max(settings.jokerCount ?? 1, visible.some(card => card.id === "JK2") ? 2 : 1);
    const unseen = new Map(bomberRanks.map(rank => [rank, rank === "JK" ? jokers : 4]));
    const seen = new Set();
    for (const card of visible) {
        if (seen.has(card.id)) continue;
        seen.add(card.id);
        unseen.set(card.rank, Math.max(0, (unseen.get(card.rank) ?? 0) - 1));
    }
    for (const rank of round.bombedRanks ?? []) unseen.set(rank, 0);
    return {
        unseen,
        total: [...unseen.values()].reduce((sum, count) => sum + count, 0),
        opponents: round.order.filter(id => id !== round.turn && round.hands[id].length > 0)
            .map(id => round.hands[id].length),
    };
}

function bomberScore(round, settings, information, selected) {
    const hand = round.hands[round.turn];
    const remaining = hand.filter(card => !selected.includes(card.rank));
    // The bomber actor ranks first among simultaneous finishers.
    if (!remaining.length) return 10000;
    let score = handCost(hand, round, settings) - handCost(remaining, round, settings);
    const removed = selected.reduce((sum, rank) => sum + information.unseen.get(rank), 0);
    let noneFinish = 1;
    let expectedFinishers = 0;
    // Estimate uniform deals from unseen cards, without replacement within a hand.
    for (const count of information.opponents) {
        let probability = count <= removed && count <= information.total ? 1 : 0;
        for (let i = 0; i < count && probability > 0; i++) {
            probability *= (removed - i) / (information.total - i);
        }
        noneFinish *= 1 - probability;
        expectedFinishers += probability;
    }
    score -= expectedFinishers * 24;
    if (round.previousKing === round.turn && !round.results.length) {
        score -= (1 - noneFinish) * 100;
    }
    const reversed = round.revolution !== round.back;
    const ceiling = Math.max(...remaining.map(card => strength(card.rank, reversed)));
    for (const rank of selected) {
        const unseen = information.unseen.get(rank);
        if (!unseen) continue;
        const power = strength(rank, reversed);
        if (!hand.some(card => card.rank === rank) && power > ceiling) {
            score += (power - ceiling + 2) * 1.7 * unseen / (rank === "JK" ? 1 : 4);
        }
        if (rank === "Q" && settings.Q) {
            const protectedCards = remaining.reduce((sum, card) => {
                const power = strength(card.rank, reversed);
                return sum + Math.max(0, power - 9);
            }, 0);
            score += protectedCards * unseen * 0.4;
        }
    }
    return score;
}

function chooseBomber(round, settings, information) {
    const ownRanks = [...new Set(round.hands[round.turn].map(card => card.rank))];
    if (ownRanks.length <= round.pending.count) {
        const extra = bomberRanks.filter(rank => !ownRanks.includes(rank))
            .sort((a, b) => information.unseen.get(a) - information.unseen.get(b));
        return { type: "resolve", cards: [...ownRanks, ...extra].slice(0, round.pending.count) };
    }
    // Keep at most eight promising sets at each step, bounding work even for six Qs.
    let choices = [{ ranks: [], score: 0 }];
    const scores = new Map();
    for (let i = 0; i < round.pending.count; i++) {
        const expanded = new Map();
        for (const choice of choices) {
            for (const rank of bomberRanks) {
                if (choice.ranks.includes(rank)) continue;
                const ranks = [...choice.ranks, rank].sort();
                const key = ranks.join(",");
                if (!scores.has(key)) scores.set(key, bomberScore(round, settings, information, ranks));
                expanded.set(key, { ranks, score: scores.get(key) });
            }
        }
        choices = [...expanded.values()].sort((a, b) => b.score - a.score).slice(0, 8);
    }
    return { type: "resolve", cards: choices[0].ranks };
}

function resolveEffect(round, settings, information) {
    const hand = round.hands[round.turn];
    const effect = round.pending;
    const reversed = round.revolution !== round.back;
    let remaining = [...hand];
    const chosen = [];
    if (effect.kind === "Q") {
        return chooseBomber(round, settings, information ?? publicInformation(round, settings));
    }
    if (effect.kind === "9") {
        const choices = [...effect.choices];
        if (hand.length <= 2) return { type: "resolve", cards: [] };
        for (let i = 0; i < effect.count; i++) {
            choices.sort((a, b) => handCost([...remaining, a], round, settings)
                - handCost([...remaining, b], round, settings));
            const card = choices.shift();
            if (handCost([...remaining, card], round, settings) >= handCost(remaining, round, settings) - 0.5) break;
            chosen.push(card.id);
            remaining.push(card);
        }
        return { type: "resolve", cards: chosen };
    }
    for (let i = 0; i < effect.count; i++) {
        const candidates = [...remaining];
        const cost = card => {
            const after = remaining.filter(item => item.id !== card.id);
            const gift = effect.kind === "7" || effect.kind === "exchange"
                ? strength(card.rank, reversed) * 0.25 + (settings[card.rank] && ["8", "10", "Q"].includes(card.rank) ? 2 : 0)
                : 0;
            return handCost(after, round, settings) + gift;
        };
        candidates.sort((a, b) => cost(a) - cost(b));
        chosen.push(candidates[0].id);
        remaining = remaining.filter(card => card.id !== candidates[0].id);
    }
    return { type: "resolve", cards: chosen };
}

function candidateMoves(round) {
    const hand = round.hands[round.turn];
    const groups = playableGroups(hand, round.table, round.revolution !== round.back);
    const moves = [];
    for (const group of groups) {
        const natural = group.cards.filter(card => card.rank === group.rank);
        const jokers = group.rank === "JK" ? [] : group.cards.filter(card => card.rank === "JK");
        const minimum = round.table ? group.count : 1;
        for (let count = minimum; count <= group.count; count++) {
            // Try both saving jokers and spending one to finish a larger group.
            for (let wild = Math.max(0, count - natural.length); wild <= Math.min(jokers.length, count - 1); wild++) {
                moves.push({
                    type: "play",
                    cards: [...natural.slice(0, count - wild), ...jokers.slice(0, wild)].map(card => card.id),
                });
            }
        }
    }
    if (round.table) moves.push({ type: "pass" });
    return moves;
}

function scoreMove(round, settings, move, opponents, information) {
    const actor = round.turn;
    // Use public hand sizes, never an opponent's card identities.
    const simulated = {
        ...round,
        hands: Object.fromEntries(round.order.map(id => [id, id === actor
            ? [...round.hands[id]]
            : Array.from({ length: round.hands[id].length }, (_, i) => ({ id: id + i, rank: "unknown" }))])),
        table: round.table && { ...round.table },
        discard: [...round.discard],
        passed: [...round.passed],
        results: round.results.map(group => [...group]),
    };
    applyMove(simulated, settings, actor, "", move);
    let bomberValue = 0;
    if (simulated.pending) {
        const effect = resolveEffect(simulated, settings, information);
        if (simulated.pending.kind === "Q") {
            const remaining = simulated.hands[actor].filter(card => !effect.cards.includes(card.rank));
            const ownReduction = handCost(simulated.hands[actor], simulated, settings)
                - handCost(remaining, simulated, settings);
            bomberValue = bomberScore(simulated, settings, information, effect.cards) - ownReduction;
        }
        applyMove(simulated, settings, actor, "", effect);
    }
    if (simulated.fallen === actor) return -10000;
    if (simulated.results.some(group => group.includes(actor))) return 10000;
    let score = handCost(round.hands[actor], round, settings)
        - handCost(simulated.hands[actor], simulated, settings) + bomberValue;
    const urgent = opponents.some(count => count <= 2);
    if (move.type === "pass") {
        const ownerCount = round.hands[round.table.owner].length;
        return ownerCount > 0 && ownerCount <= 2 ? -12 : -0.5;
    }
    if (simulated.turn === actor) score += urgent ? 10 : 5;
    if (simulated.table) {
        const power = strength(simulated.table.rank, simulated.revolution !== simulated.back) / 13;
        const eligible = opponents.filter(count => count >= move.cards.length).length;
        const control = eligible ? power ** eligible : 1;
        score += control * (urgent ? 12 : 3);
        if (opponents.some(count => count === move.cards.length)) score -= (1 - control) * 8;
    }
    return score;
}

export function computerMove(round, settings = defaultSettings) {
    if (round.pending) return resolveEffect(round, settings);
    const opponents = round.order.filter(id => id !== round.turn)
        .map(id => round.hands[id].length).filter(count => count > 0);
    const moves = candidateMoves(round);
    const information = publicInformation(round, settings);
    let best = moves[0];
    let bestScore = -Infinity;
    for (const move of moves) {
        const score = scoreMove(round, settings, move, opponents, information);
        if (score > bestScore) {
            best = move;
            bestScore = score;
        }
    }
    return best;
}
