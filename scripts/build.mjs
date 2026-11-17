import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { assets } from "../server/http.js";

const server = "dist/server";
for (const dir of ["game", "server", "worker"]) {
  mkdirSync(`${server}/${dir}`, { recursive: true });
}
for (const file of [
  "game/cards.js", "game/rules.js", "game/round.js", "game/computer.js",
  "server/api.js", "server/http.js", "server/rooms.js", "server/store.js",
  "worker/index.js",
]) {
  copyFileSync(file, `${server}/${file}`);
}
const files = Object.fromEntries(Object.values(assets).map(([file]) => [file, readFileSync(file, "utf8")]));
writeFileSync(`${server}/worker/files.js`, `export const files = ${JSON.stringify(files)};\n`);
writeFileSync(`${server}/index.js`, 'export { default } from "./worker/index.js";\n');
