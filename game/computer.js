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

function resolveEffect(round, settings) {
    const hand = round.hands[round.turn];
    const effect = round.pending;
    const reversed = round.revolution !== round.back;
    let remaining = [...hand];
    const chosen = [];
    if (effect.kind === "Q") {
        const ranks = [...bomberRanks];
        for (let i = 0; i < effect.count; i++) {
            ranks.sort((a, b) => {
                const cost = rank => handCost(remaining.filter(card => card.rank !== rank), round, settings)
                    - (remaining.some(card => card.rank === rank) ? 0 : strength(rank, reversed) * 0.03);
                return cost(a) - cost(b);
            });
            const rank = ranks.shift();
            chosen.push(rank);
            remaining = remaining.filter(card => card.rank !== rank);
        }
        return { type: "resolve", cards: chosen };
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

function scoreMove(round, settings, move, opponents) {
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
    if (simulated.pending) {
        applyMove(simulated, settings, actor, "", resolveEffect(simulated, settings));
    }
    if (simulated.fallen === actor) return -10000;
    if (simulated.results.some(group => group.includes(actor))) return 10000;
    let score = handCost(round.hands[actor], round, settings)
        - handCost(simulated.hands[actor], simulated, settings);
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
    let best = moves[0];
    let bestScore = -Infinity;
    for (const move of moves) {
        const score = scoreMove(round, settings, move, opponents);
        if (score > bestScore) {
            best = move;
            bestScore = score;
        }
    }
    return best;
}
