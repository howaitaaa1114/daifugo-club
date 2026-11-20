import { defaultSettings, maxPlayers, roles, turnSeconds } from "../game/rules.js";
import { applyMove, following, startRound, timeoutMove } from "../game/round.js";
import { requireRule, strength } from "../game/cards.js";
import { computerMove } from "../game/computer.js";
export function newPlayer(name) {
    requireRule(typeof name === "string", "名前を入力してください。");
    const trimmed = name.trim();
    requireRule(trimmed.length > 0 && trimmed.length <= 16, "名前は1〜16文字で入力してください。");
    return {
        name: trimmed,
        id: crypto.randomUUID(),
        token: crypto.randomUUID()
    };
}
export function newRoom(code, owner) {
    return {
        code,
        owner: owner.id,
        players: [
            owner
        ],
        settings: {
            ...defaultSettings
        },
        round: null
    };
}
export function joinRoom(room, player) {
    requireRule(!room.solo, "この部屋はひとり用です。");
    requireRule(!room.round, "この部屋では対戦が始まっています。");
    requireRule(room.players.length < maxPlayers, `この部屋は満員です（最大${maxPlayers}人）。`);
    room.players.push(player);
}
export function newSoloRoom(code, owner) {
    const room = newRoom(code, owner);
    room.solo = true;
    for (const name of ["AI 1", "AI 2", "AI 3"]) {
        room.players.push({ id: crypto.randomUUID(), name, computer: true });
    }
    runCommand(room, owner, { type: "start" });
    return room;
}
export function findPlayer(room, token) {
    return room.players.find((candidate)=>candidate.token === token);
}
function resetClock(room, now) {
    const round = room.round;
    round.deadline = round.done ? null : now + turnSeconds * 1000;
    round.computerAt = !round.done && room.players.some(player => player.id === round.turn && player.computer)
        ? now + 650 : null;
}

export function updateClock(room, now = Date.now()) {
    const round = room.round;
    if (!round || round.done || round.pausedAt != null) return false;
    if (!round.deadline) {
        resetClock(room, now);
        return true;
    }
    const player = room.players.find(candidate => candidate.id === round.turn);
    if (player.computer && now >= (round.computerAt ?? round.deadline)) {
        applyMove(round, room.settings, player.id, player.name, computerMove(round, room.settings));
        resetClock(room, now);
        return true;
    }
    if (now < round.deadline) return false;
    timeoutMove(round, room.settings, player.id, player.name);
    if (!room.solo && room.owner === player.id) {
        const [nextHostId] = following(round, player.id);
        const nextHost = room.players.find(candidate => candidate.id === nextHostId);
        room.owner = nextHost.id;
        round.last += ` · ${nextHost.name} が新しいホストです`;
    }
    resetClock(room, now);
    return true;
}

export function runCommand(room, player, command, now = Date.now()) {
    if (command.type === "play" || command.type === "pass" || command.type === "resolve") {
        requireRule(room.round, "対戦を開始してください。");
        requireRule(room.round.pausedAt == null, "対戦は一時停止中です。ホストの再開をお待ちください。");
        applyMove(room.round, room.settings, player.id, player.name, command);
        resetClock(room, now);
        return;
    }
    if (command.type === "leave") {
        if (room.solo) {
            room.players = [];
            return;
        }
        requireRule(!room.round || room.round.done, "対戦中は退室できません。");
        room.players = room.players.filter((candidate)=>candidate.id !== player.id);
        if (room.owner === player.id && room.players.length) room.owner = room.players[0].id;
        return;
    }
    requireRule(room.owner === player.id, "部屋のホストだけが操作できます。");
    switch(command.type){
        case "start":
            requireRule(!room.round || room.round.done, "対戦中です。");
            requireRule(room.players.length >= 2, "2人以上で開始できます。");
            room.round = startRound(room.players.map(candidate => candidate.id), room.settings.jokerCount);
            resetClock(room, now);
            room.round.names = Object.fromEntries(room.players.map((candidate)=>[
                    candidate.id,
                    candidate.name
                ]));
            break;
        case "lobby":
            requireRule(room.round?.done, "対戦終了後に設定を変更できます。");
            room.round = null;
            break;
        case "pause":
            requireRule(room.round && !room.round.done && room.round.pausedAt == null, "進行中の対戦を一時停止できます。");
            room.round.pausedAt = now;
            break;
        case "resume":
            requireRule(room.round?.pausedAt != null, "対戦は一時停止されていません。");
            room.round.deadline += now - room.round.pausedAt;
            if (room.round.computerAt != null) room.round.computerAt += now - room.round.pausedAt;
            room.round.pausedAt = null;
            break;
        case "discard":
            requireRule(room.round && !room.round.done, "進行中の対戦がありません。");
            room.round = null;
            break;
        case "settings":
            requireRule(!room.round && command.settings, "待機中にルールを設定してください。");
            for (const { key } of roles){
                requireRule(typeof command.settings[key] === "boolean", "ルールの設定を確認してください。");
                room.settings[key] = command.settings[key];
            }
            const nineReverse = command.settings.nineReverse ?? false;
            requireRule(typeof nineReverse === "boolean" && !(nineReverse && command.settings["9"]),
                "栗拾いと9リバースは同時に設定できません。");
            room.settings.nineReverse = nineReverse;
            if (command.settings.jokerCount !== undefined) {
                requireRule([1, 2].includes(command.settings.jokerCount), "ジョーカーは1枚か2枚を選んでください。");
                room.settings.jokerCount = command.settings.jokerCount;
            }
            break;
        default:
            requireRule(false, "操作が見つかりません。");
    }
}
export function roomView(room, self, revision) {
    const round = room.round;
    const places = new Map();
    let place = 1;
    for (const group of round?.results ?? []) {
        for (const id of group) places.set(id, place);
        place += group.length;
    }
    const playersById = new Map(room.players.map(player => [player.id, player]));
    const players = round ? round.order.map(id => playersById.get(id)).filter(Boolean) : room.players;
    return {
        code: room.code,
        solo: room.solo === true,
        owner: room.owner,
        self,
        revision,
        settings: { jokerCount: 1, ...room.settings },
        serverNow: Date.now(),
        players: players.map(({ id, name })=>({
                id,
                name,
                cards: round?.hands[id]?.length ?? 0,
                passed: round?.passed.includes(id) ?? false,
                place: places.get(id) ?? -1
            })),
        round: round && {
            turn: round.turn,
            deadline: round.deadline,
            pausedAt: round.pausedAt ?? null,
            table: round.table,
            discardCount: round.discard.length,
            hand: [
                ...round.hands[self]
            ].sort((a, b)=>strength(a.rank) - strength(b.rank)),
            pending: round.pending && {
                kind: round.pending.kind,
                count: round.pending.count,
                target: round.pending.target,
                choices: round.turn === self ? round.pending.choices : []
            },
            revolution: round.revolution,
            back: round.back,
            reverse: round.reverse === true,
            done: round.done,
            results: round.results.map((group)=>group.map((id)=>({
                        id,
                        name: round.names[id]
                    }))),
            last: round.last
        }
    };
}
