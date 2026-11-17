import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

export function localDatabase(location) {
  const db = new DatabaseSync(location);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  db.exec(readFileSync(new URL("../drizzle/0000_rooms.sql", import.meta.url), "utf8")
    .replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")
    .replace("CREATE INDEX", "CREATE INDEX IF NOT EXISTS"));

  return {
    prepare(sql) {
      const statement = db.prepare(sql);
      return { bind: (...args) => ({
        first: () => statement.get(...args) ?? null,
        run: () => ({ meta: statement.run(...args) }),
      }) };
    },
    batch(statements) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const result = statements.map(statement => statement.run());
        db.exec("COMMIT");
        return result;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
