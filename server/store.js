export function roomStore(db) {
    const expiration = 24 * 60 * 60 * 1000;
    async function readRoom(code) {
        const result = await db.prepare("SELECT state, revision FROM rooms WHERE code = ? AND updated_at > ?").bind(code, Date.now() - expiration).first();
        return result && {
            room: JSON.parse(result.state),
            revision: result.revision
        };
    }
    async function insertRoom(room) {
        const now = Date.now();
        const [, inserted] = await db.batch([
            db.prepare("DELETE FROM rooms WHERE updated_at <= ?").bind(now - expiration),
            db.prepare("INSERT OR IGNORE INTO rooms (code, revision, updated_at, state) VALUES (?, 0, ?, ?)").bind(room.code, now, JSON.stringify(room))
        ]);
        return inserted.meta.changes === 1;
    }
    async function saveRoom(room, revision) {
        const result = room.players.length ? await db.prepare("UPDATE rooms SET state = ?, updated_at = ?, revision = revision + 1 WHERE code = ? AND revision = ?").bind(JSON.stringify(room), Date.now(), room.code, revision).run() : await db.prepare("DELETE FROM rooms WHERE code = ? AND revision = ?").bind(room.code, revision).run();
        return result.meta.changes === 1;
    }
    return {
        readRoom,
        insertRoom,
        saveRoom
    };
}
