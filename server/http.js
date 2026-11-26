import { roomApi } from "./api.js";
import { roomStore } from "./store.js";

export const assets = {
  "/": ["web/index.html", "text/html"],
  "/og-image.png": ["web/og-image.png", "image/png"],
  "/style.css": ["web/style.css", "text/css"],
  "/web/app.js": ["web/app.js", "text/javascript"],
  "/web/views.js": ["web/views.js", "text/javascript"],
  "/game/rules.js": ["game/rules.js", "text/javascript"],
  "/game/cards.js": ["game/cards.js", "text/javascript"],
};

export function handleRequest(request, database, getAsset) {
  const path = new URL(request.url).pathname;
  if (path === "/api/rooms") {
    const api = roomApi(roomStore(database));
    if (request.method === "GET") return api.GET(request);
    if (request.method === "POST") return api.POST(request);
  }
  if (request.method === "GET" && Object.hasOwn(assets, path)) {
    const [file, type] = assets[path];
    let content = getAsset(file);
    if (path === "/") {
      const imageUrl = new URL("/og-image.png", request.url).href.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
      content = new TextDecoder().decode(typeof content === "string" ? new TextEncoder().encode(content) : content).replaceAll("__OG_IMAGE_URL__", imageUrl);
    }
    return new Response(content, { headers: {
      "Content-Type": type.startsWith("image/") ? type : `${type}; charset=utf-8`,
      "X-Content-Type-Options": "nosniff",
    } });
  }
  return new Response(null, { status: 404 });
}
