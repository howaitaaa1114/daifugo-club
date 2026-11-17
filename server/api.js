import { requireRule, RuleError } from "../game/cards.js";
import { findPlayer, joinRoom, newPlayer, newRoom, newSoloRoom, roomView, runCommand, updateClock } from "./rooms.js";
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const codePattern = /^[A-HJ-NP-Z2-9]{6}$/;
const conflict = ()=>json({
        error: "部屋の状態が更新されました。もう一度お試しください。"
    }, 409);
const notFound = ()=>json({
        error: "部屋が見つかりません。"
    }, 404);
const forbidden = ()=>json({
        error: "この部屋への参加情報が見つかりません。"
    }, 403);
function json(data, status = 200) {
    return Response.json(data, {
        status,
        headers: {
            "Cache-Control": "no-store"
        }
    });
}
function errorResponse(error) {
    if (error instanceof RuleError) return json({
        error: error.message
    }, 400);
    if (error instanceof SyntaxError) return json({
        error: "送信内容を確認してください。"
    }, 400);
    console.error(error);
    return json({
        error: "通信エラーが発生しました。時間をおいて再試行してください。"
    }, 500);
}
function codeFrom(value) {
    const code = typeof value === "string" ? value.trim().toUpperCase() : "";
    requireRule(codePattern.test(code), "部屋コードは英数字6文字で入力してください。");
    return code;
}
function tokenFrom(request) {
    return request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
}
export function roomApi({ insertRoom, readRoom, saveRoom }) {
    async function readCurrentRoom(code, token) {
        for (let attempt = 0; attempt < 8; attempt++) {
            const record = await readRoom(code);
            if (!record) return notFound();
            const player = findPlayer(record.room, token);
            if (!player) return forbidden();
            if (!updateClock(record.room)) return { ...record, player };
            if (await saveRoom(record.room, record.revision)) {
                return { room: record.room, revision: record.revision + 1, player };
            }
        }
        return conflict();
    }
    async function GET(request) {
        try {
            const code = codeFrom(new URL(request.url).searchParams.get("code"));
            const record = await readCurrentRoom(code, tokenFrom(request));
            if (record instanceof Response) return record;
            const { room, revision, player } = record;
            return json({
                state: roomView(room, player.id, revision)
            });
        } catch (error) {
            return errorResponse(error);
        }
    }
    async function POST(request) {
        try {
            const body = await request.json();
            requireRule(body && typeof body === "object", "送信内容を確認してください。");
            if (body.type === "create" || body.type === "solo") {
                const solo = body.type === "solo";
                const player = newPlayer(solo ? "あなた" : body.name);
                for(let attempt = 0; attempt < 10; attempt++){
                    const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte)=>alphabet[byte % alphabet.length]).join("");
                    const room = solo ? newSoloRoom(code, player) : newRoom(code, player);
                    if (await insertRoom(room)) return json({
                        token: player.token,
                        state: roomView(room, player.id, 0)
                    });
                }
                return conflict();
            }
            const code = codeFrom(body.code);
            if (body.type === "join") {
                const player = newPlayer(body.name);
                for(let attempt = 0; attempt < 10; attempt++){
                    const record = await readRoom(code);
                    if (!record) return notFound();
                    joinRoom(record.room, player);
                    if (await saveRoom(record.room, record.revision)) {
                        return json({
                            token: player.token,
                            state: roomView(record.room, player.id, record.revision + 1)
                        });
                    }
                }
                return conflict();
            }
            const record = await readCurrentRoom(code, tokenFrom(request));
            if (record instanceof Response) return record;
            const { room, revision, player } = record;
            const soloControl = room.solo && ["leave", "pause", "discard"].includes(body.type);
            if (revision !== body.revision && !soloControl) return conflict();
            runCommand(room, player, body);
            if (!await saveRoom(room, revision)) return conflict();
            return json(body.type === "leave" ? {
                state: null
            } : {
                state: roomView(room, player.id, revision + 1)
            });
        } catch (error) {
            return errorResponse(error);
        }
    }
    return {
        GET,
        POST
    };
}
