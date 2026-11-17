export const ranks = [
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "J",
    "Q",
    "K",
    "A",
    "2"
];
export const bomberRanks = [...ranks, "JK"];
export const rankName = rank => rank === "JK" ? "ジョーカー" : rank;

export function playableGroups(hand, table, reversed) {
    const jokers = hand.filter(card => card.rank === "JK");
    return bomberRanks.flatMap(rank => {
        const natural = hand.filter(card => card.rank === rank);
        if (!natural.length || (table && strength(rank, reversed) <= strength(table.rank, reversed))) return [];
        const cards = rank === "JK" ? jokers : [...natural, ...jokers];
        const count = table?.cards.length ?? cards.length;
        return cards.length >= count ? [{ cards, rank, count }] : [];
    });
}

export function shuffledDeck(jokerCount = 1) {
    const deck = [
        "♠",
        "♥",
        "♦",
        "♣"
    ].flatMap((suit)=>ranks.map((rank)=>({
                id: rank + suit,
                rank,
                suit
            })));
    deck.push({ id: "JK", rank: "JK", suit: "★" });
    if (jokerCount === 2) deck.push({ id: "JK2", rank: "JK", suit: "☆" });
    return shuffle(deck);
}

export function shuffle(items) {
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const value = crypto.getRandomValues(new Uint32Array(1))[0];
        const j = Math.floor(value / 2 ** 32 * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}
export function strength(rank, reversed = false) {
    if (rank === "JK") return ranks.length;
    const index = ranks.indexOf(rank);
    return reversed ? ranks.length - 1 - index : index;
}
export function requireRule(condition, message) {
    if (!condition) throw new RuleError(message);
}
export class RuleError extends Error {
}
export function pickCards(cards, ids) {
    requireRule(Array.isArray(ids) && new Set(ids).size === ids.length, "カードを選び直してください。");
    return ids.map((id)=>{
        const card = cards.find((candidate)=>candidate.id === id);
        requireRule(card, "選んだカードが見つかりません。");
        return card;
    });
}
export function withoutCards(cards, removed) {
    return cards.filter((card)=>!removed.some((other)=>other.id === card.id));
}
