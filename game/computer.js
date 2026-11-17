import { bomberRanks, playableGroups, strength } from "./cards.js";

export function computerMove(round) {
    const hand = round.hands[round.turn];
    const reversed = round.revolution !== round.back;
    const value = card => strength(card.rank, reversed);
    const effect = round.pending;
    if (effect) {
        if (effect.kind === "9") {
            const useful = effect.choices.filter(card => card.rank !== "9" && value(card) >= 10)
                .sort((a, b) => value(b) - value(a));
            return { type: "resolve", cards: hand.length > 1 ? useful.slice(0, 1).map(card => card.id) : [] };
        }
        if (effect.kind === "Q") {
            const counts = rank => hand.filter(card => card.rank === rank).length;
            const ranks = [...bomberRanks].sort((a, b) => counts(b) - counts(a));
            return { type: "resolve", cards: ranks.slice(0, effect.count) };
        }
        const cards = [...effect.choices].sort((a, b) => value(a) - value(b));
        return { type: "resolve", cards: cards.slice(0, effect.count).map(card => card.id) };
    }
    const groups = playableGroups(hand, round.table, reversed);
    groups.sort((a, b) => (round.table ? 0 : b.count - a.count)
        || strength(a.rank, reversed) - strength(b.rank, reversed));
    const group = groups[0];
    if (!group) return { type: "pass" };
    return { type: "play", cards: group.cards.slice(0, group.count).map(card => card.id) };
}
