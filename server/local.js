import { createServer } from "node:http";
import { mkdirSync, readFileSync } from "node:fs";
import { handleRequest } from "./http.js";
import { localDatabase } from "./sqlite.js";

const root = new URL("../", import.meta.url);
const data = new URL("data/", root);
mkdirSync(data, { recursive: true });
const adapter = localDatabase(new URL("rooms.sqlite", data));

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
createServer(async (incoming, outgoing) => {
  try {
    const chunks = [];
    let length = 0;
    for await (const chunk of incoming) {
      length += chunk.length;
      if (length > 16_384) {
        outgoing.writeHead(413).end();
        return;
      }
      chunks.push(chunk);
    }
    const request = new Request(new URL(incoming.url, `http://localhost:${port}`), {
      method: incoming.method,
      headers: incoming.headers,
      ...(length && { body: Buffer.concat(chunks) }),
    });
    const response = await handleRequest(request, adapter, file => readFileSync(new URL(file, root)));
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error);
    outgoing.writeHead(500).end();
  }
}).listen(port, host, () => console.log(`大富豪クラブ http://localhost:${port}`));
