import { guideView, homeView, lobbyView, matchView, resultView } from "./views.js";

const app = document.querySelector("#app");
const guide = document.querySelector("#guide");
document.querySelector("#guide-content").innerHTML = guideView;
document.querySelector("#help").addEventListener("click", () => guide.showModal());

const storageKey = "daifugo-session";
const invitedCode = new URLSearchParams(location.search).get("room") ?? "";
let session;
try {
  session = JSON.parse(sessionStorage.getItem(storageKey));
} catch {
  session = null;
}
let state = null;
let syncing = false;
let clockOffset = 0;
const ui = { mode: invitedCode ? "join" : "create", name: "", code: invitedCode, busy: false, error: "", notice: "", selected: new Set() };
let renderedTable = "";
let renderedTurn = "";
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let gesture = null;
let suppressCardClickUntil = 0;

function layoutHand() {
  const fan = app.querySelector(".hand-fan");
  if (!fan) return;
  const count = fan.querySelectorAll(".fan-slot").length;
  const width = fan.parentElement.clientWidth - 30;
  const cardWidth = matchMedia("(max-width: 750px)").matches ? 64 : 82;
  const step = count > 1 ? Math.max(24, Math.min(48, (width - cardWidth) / (count - 1))) : cardWidth;
  fan.style.setProperty("--card-step", `${step}px`);
  fan.style.setProperty("--fan-width", `${Math.max(cardWidth, (count - 1) * step + cardWidth)}px`);
}

function render() {
  gesture = null;
  const oldTable = app.querySelector(".table-cards")?.cloneNode(true);
  const oldTableBounds = app.querySelector(".table-cards")?.getBoundingClientRect();
  const handScroll = app.querySelector(".hand-scroll")?.scrollLeft ?? 0;
  const positions = new Map([...app.querySelectorAll(".card-row [data-value]")].map(card =>
    [card.dataset.value, card.getBoundingClientRect()]));
  const scroll = { x: window.scrollX, y: window.scrollY };
  const previous = document.activeElement;
  const focus = previous && app.contains(previous)
    ? ["value", "action", "rule"].find(key => previous.dataset[key] !== undefined)
    : null;
  app.innerHTML = !state ? homeView(ui) : !state.round ? lobbyView(state, ui) : state.round.done ? resultView(state, ui) : matchView(state, ui);
  layoutHand();
  const handScroller = app.querySelector(".hand-scroll");
  if (handScroller) handScroller.scrollLeft = handScroll;
  showClock();
  const round = state?.round;
  const tableKey = round && !round.done
    ? JSON.stringify([state.code, round.table?.owner, round.table?.cards.map(card => card.id)])
    : "";
  const turnKey = round && !round.done ? `${state.code}:${round.turn}:${round.pausedAt ?? ""}` : "";
  if (!reducedMotion.matches) {
    for (const card of app.querySelectorAll(".card-row [data-value]")) {
      const before = positions.get(card.dataset.value);
      if (!before) continue;
      const after = card.getBoundingClientRect();
      const x = before.left - after.left;
      const y = before.top - after.top;
      if ((x || y) && !card.closest(".hand-fan")) card.animate([
        { transform: `translate(${x}px, ${y + (card.classList.contains("selected") ? -14 : 0)}px)` },
        { transform: card.classList.contains("selected") ? "translateY(-14px)" : "none" },
      ], { duration: 160, easing: "ease-out" });
    }
    if (tableKey && tableKey !== renderedTable && round.table) {
      const origin = [...app.querySelectorAll("[data-player]")].find(player =>
        player.dataset.player === round.table.owner)?.getBoundingClientRect();
      const destination = app.querySelector(".table-cards")?.getBoundingClientRect();
      const dx = origin && destination ? origin.left + origin.width / 2 - destination.left - destination.width / 2 : 0;
      const dy = origin && destination ? origin.top + origin.height / 2 - destination.top - destination.height / 2 : 14;
      app.querySelector(".table-cards")?.animate([
        { opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(.55) rotate(-8deg)` },
        { opacity: 1, transform: "none" },
      ], { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" });
    }
    if (tableKey && renderedTable && tableKey !== renderedTable && !round.table && oldTableBounds && oldTable?.querySelector(".card")) {
      oldTable.classList.add("clearing-table");
      Object.assign(oldTable.style, {
        left: `${oldTableBounds.left}px`, top: `${oldTableBounds.top}px`,
        width: `${oldTableBounds.width}px`, height: `${oldTableBounds.height}px`,
      });
      oldTable.setAttribute("aria-hidden", "true");
      document.body.append(oldTable);
      const animation = oldTable.animate([
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: "translateX(100px) rotate(10deg) scale(.8)" },
      ], { duration: 200, easing: "ease-in", fill: "forwards" });
      animation.finished.then(() => oldTable.remove(), () => oldTable.remove());
    }
    if (turnKey && turnKey !== renderedTurn && round.turn === state.self && round.pausedAt == null) {
      app.querySelector(".turn-banner")?.animate([
        { opacity: .5, transform: "translateY(-5px)" }, { opacity: 1, transform: "none" },
      ], { duration: 240, easing: "ease-out" });
    }
  }
  renderedTable = tableKey;
  renderedTurn = turnKey;
  if (focus) {
    const replacement = [...app.querySelectorAll(`[data-${focus}]`)].find(node => node.dataset[focus] === previous.dataset[focus]);
    replacement?.focus({ preventScroll: true });
  }
  if (positions.size) window.scrollTo(scroll.x, scroll.y);
}

function accept(next) {
  if (next?.serverNow) clockOffset = next.serverNow - Date.now();
  if (state?.revision === next?.revision && state?.code === next?.code) return false;
  state = next;
  ui.selected.clear();
  return true;
}

function showClock() {
  const clock = app.querySelector("[data-clock]");
  if (!clock) return;
  const { deadline, pausedAt } = state.round;
  if (state.round.pending?.kind === "exchange" && deadline == null) {
    clock.textContent = state.round.turn === state.self ? "札を選んで交換" : "交換の完了待ち";
    clock.classList.remove("urgent");
    clock.setAttribute("aria-label", clock.textContent);
    return;
  }
  const seconds = Math.max(0, Math.ceil((deadline - (pausedAt ?? Date.now() + clockOffset)) / 1000));
  const label = `残り ${seconds} 秒`;
  if (clock.textContent !== label) clock.textContent = label;
  clock.classList.toggle("urgent", seconds <= 5);
  clock.setAttribute("aria-label", label);
}

async function request(payload) {
  const headers = new Headers();
  if (session?.token) headers.set("Authorization", `Bearer ${session.token}`);
  if (payload) headers.set("Content-Type", "application/json");
  const path = payload ? "/api/rooms" : `/api/rooms?code=${encodeURIComponent(session.code)}`;
  const response = await fetch(path, {
    method: payload ? "POST" : "GET",
    headers,
    body: payload ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data.error ?? "サーバーに接続できませんでした。"), { status: response.status });
  }
  return data;
}

function saveSession(value) {
  session = value;
  if (session) sessionStorage.setItem(storageKey, JSON.stringify(session));
  else sessionStorage.removeItem(storageKey);
}

async function send(payload) {
  if (ui.busy) return;
  ui.busy = true;
  ui.error = "";
  ui.notice = "";
  render();
  try {
    const data = await request(payload);
    if (data.token) saveSession({ token: data.token, code: data.state.code });
    if (payload.type === "leave") {
      saveSession(null);
      history.replaceState(null, "", location.pathname);
      ui.mode = "create";
      ui.code = "";
    }
    accept(data.state);
  } catch (error) {
    ui.error = error.status ? error.message : "通信できませんでした。もう一度お試しください。";
  } finally {
    ui.busy = false;
    render();
  }
}

function command(type, body = {}) {
  return send({ type, code: state.code, revision: state.revision, ...body });
}

async function sync() {
  if (!session || ui.busy || syncing) return;
  syncing = true;
  const current = session;
  try {
    const data = await request();
    if (current !== session || ui.busy) return;
    if (state && data.state.revision < state.revision) return;
    if (accept(data.state)) render();
  } catch (error) {
    if (current !== session) return;
    if (error.status === 403 || error.status === 404) {
      saveSession(null);
      accept(null);
      ui.error = error.message;
      render();
    } else if (!state) {
      ui.error = "部屋に再接続しています…";
      render();
    }
  } finally {
    syncing = false;
  }
}

async function invite() {
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set("room", state.code);
  try {
    await navigator.clipboard.writeText(url.href);
    ui.notice = "招待リンクをコピーしました。";
  } catch {
    ui.notice = `参加する人に部屋コード ${state.code} を伝えてください。`;
  }
  ui.error = "";
  render();
}

app.addEventListener("input", event => {
  if (event.target.name === "name") ui.name = event.target.value;
  if (event.target.name === "code") ui.code = event.target.value;
});

app.addEventListener("change", event => {
  const rule = event.target.dataset.rule;
  if (rule && state) {
    if (rule === "nineMode") {
      const mode = event.target.value;
      command("settings", { settings: { ...state.settings, "9": mode === "pickup", nineReverse: mode === "reverse" } });
      return;
    }
    const value = rule === "jokerCount" ? Number(event.target.value) : event.target.checked;
    command("settings", { settings: { ...state.settings, [rule]: value } });
  }
});

app.addEventListener("submit", event => {
  if (event.target.id !== "entry-form") return;
  event.preventDefault();
  const form = new FormData(event.target);
  ui.name = String(form.get("name") ?? "");
  ui.code = String(form.get("code") ?? ui.code);
  send({ type: ui.mode, name: ui.name, code: ui.code });
});

app.addEventListener("click", event => {
  const target = event.target.closest("button");
  if (!target || target.disabled || ui.busy) return;
  const { value, action } = target.dataset;
  if (value !== undefined) {
    if (Date.now() < suppressCardClickUntil) return;
    if (ui.selected.has(value)) ui.selected.delete(value);
    else if (!state.round.pending || ui.selected.size < state.round.pending.count) ui.selected.add(value);
    ui.error = "";
    render();
  } else if (action === "create-mode" || action === "join-mode") {
    ui.mode = action === "create-mode" ? "create" : "join";
    ui.error = "";
    render();
  } else if (action === "invite") {
    invite();
  } else if (action === "solo") {
    send({ type: "solo" });
  } else if (action === "clear-selection") {
    ui.selected.clear();
    ui.error = "";
    render();
  } else if (action === "play" || action === "resolve") {
    command(action, { cards: [...ui.selected] });
  } else if (action === "discard") {
    if (window.confirm("この対戦を破棄して、全員をロビーに戻しますか？")) command(action);
  } else if (action === "leave" && state.solo && state.round && !state.round.done) {
    if (window.confirm("この対戦を終了してトップ画面に戻りますか？")) command(action);
  } else if (action) {
    command(action);
  }
});

// Track only gestures that start on an already selected playable hand card.
app.addEventListener("pointerdown", event => {
  gesture = null;
  const card = event.target.closest(".hand-fan .card.selected");
  if (!card || card.disabled || event.isPrimary === false || event.button !== 0) return;
  card.setPointerCapture(event.pointerId);
  gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, revision: state?.revision };
});

app.addEventListener("pointerup", event => {
  const start = gesture;
  gesture = null;
  if (!start || start.id !== event.pointerId || start.revision !== state?.revision) return;
  const rise = start.y - event.clientY;
  const sideways = Math.abs(start.x - event.clientX);
  if (rise < 42 || rise < sideways * 1.4) return;
  suppressCardClickUntil = Date.now() + 400;
  const play = app.querySelector('[data-action="play"]');
  if (play && !play.disabled && !ui.busy) command("play", { cards: [...ui.selected] });
});
app.addEventListener("pointercancel", () => { gesture = null; });
window.addEventListener("resize", layoutHand);

document.addEventListener("keydown", event => {
  if (event.key !== "Escape" || ui.busy || guide.open || !ui.selected.size) return;
  ui.selected.clear();
  ui.error = "";
  render();
});

if (invitedCode && session?.code !== invitedCode) saveSession(null);
render();
sync();
setInterval(() => { if (!document.hidden) sync(); }, 1000);
setInterval(showClock, 250);
document.addEventListener("visibilitychange", () => { if (!document.hidden) sync(); });
