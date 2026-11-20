import { bomberRanks, playableGroups, rankName } from "../game/cards.js";
import { maxPlayers, nineModes, placeName, roles, turnSeconds } from "../game/rules.js";

export const escape = value => String(value).replace(/[&<>"']/g, c => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));
const disabled = value => value ? " disabled" : "";
const button = (action, label, kind = "secondary", locked = false) =>
  `<button class="${kind}" type="button" data-action="${action}"${disabled(locked)}>${label}</button>`;
const message = (error, notice) => error || notice
  ? `<p class="${error ? "error" : "notice"}" role="${error ? "alert" : "status"}">${escape(error || notice)}</p>` : "";

function cardFace(card) {
  const joker = card.rank === "JK";
  const rank = joker ? "JOKER" : escape(card.rank);
  const suit = escape(card.suit);
  return `<span class="corner">${rank}<small>${suit}</small></span><span class="pip">${suit}</span><span class="corner bottom">${rank}<small>${suit}</small></span>`;
}

function cardClass(card) {
  return "card" + ("♥♦".includes(card.suit) ? " red" : card.rank === "JK" ? " joker" : "");
}

function cardTile(card, selected, locked) {
  return `<button class="${cardClass(card)}${selected ? " selected" : ""}" type="button" data-value="${escape(card.id)}" aria-pressed="${selected}" aria-label="${escape(card.rank === "JK" ? "ジョーカー" : card.suit + card.rank)}"${disabled(locked)}>${cardFace(card)}</button>`;
}

export function homeView({ mode, name, code, busy, error }) {
  const join = mode === "join";
  return `<section class="landing">
    <div class="landing-copy">
      <p class="eyebrow"><span></span> オンライン対戦 <b>·</b> 2〜${maxPlayers}人</p>
      <h1>大富豪<span>クラブ</span></h1>
      <p class="intro">友だちとオンライン対戦。<br>ひとりならAI3人とすぐ遊べます。</p>
      ${button("solo", "ひとりで遊ぶ · AI3人と対戦", "primary solo-start", busy)}
      <section class="entry">
        <div class="segmented" aria-label="参加方法">
          <button type="button" data-action="create-mode" aria-pressed="${!join}"${disabled(busy)}>部屋を作る</button>
          <button type="button" data-action="join-mode" aria-pressed="${join}"${disabled(busy)}>部屋に入る</button>
        </div>
        <form id="entry-form">
          <label for="player-name">プレイヤー名</label>
          <input id="player-name" name="name" maxlength="16" autocomplete="nickname" placeholder="ニックネームを入力" value="${escape(name)}" required${disabled(busy)}>
          ${join ? `<label for="room-code">部屋コード</label><input id="room-code" name="code" maxlength="6" minlength="6" autocapitalize="characters" autocomplete="off" placeholder="英数字6文字" value="${escape(code)}" required${disabled(busy)}>` : ""}
          ${message(error)}
          <button class="primary" type="submit"${disabled(busy)}>${busy ? "接続中…" : join ? "部屋に入る" : "部屋を作る"} <span aria-hidden="true">→</span></button>
        </form>
      </section>
    </div>
    <div class="hero-art" aria-hidden="true">
      <div class="felt-mark">♠</div>
      <span class="spark one">✦</span><span class="spark two">✦</span><span class="spark three">·</span>
      <div class="hero-deck">
        ${[{ rank:"8", suit:"♥" }, { rank:"A", suit:"♠" }, { rank:"K", suit:"♦" }].map(card => `<div class="${cardClass(card)}">${cardFace(card)}</div>`).join("")}
      </div>
      <div class="table-suits">♠ <i>♥</i> <i>♦</i> ♣</div>
    </div>
  </section>`;
}

function roomHeader(state, title, subtitle, busy, showLeave) {
  return `<div class="room-header">
    <div><p class="eyebrow"><span></span> ${state.solo ? "ひとりで遊ぶ · AI3人" : `部屋 <b class="code">${escape(state.code)}</b>`}</p><h1>${title}</h1><p class="muted">${subtitle}</p></div>
    <div class="actions">${state.solo ? "" : button("invite", "招待リンクをコピー", "secondary", busy)}
      ${showLeave ? button("leave", "退室", "ghost", busy) : ""}</div>
  </div>`;
}

export function lobbyView(state, { busy, error, notice }) {
  const host = state.owner === state.self;
  const seats = state.solo ? 4 : maxPlayers;
  const nineMode = state.settings.nineReverse ? "reverse" : state.settings["9"] ? "pickup" : "off";
  return `${roomHeader(state, "対戦ロビー", state.solo ? "ルールを選んでAI3人との対戦を始められます。" : "招待リンクを共有するか、部屋コードを友だちに伝えてください。", busy, true)}
    ${message(error, notice)}
    <div class="lobby-grid">
      <section class="panel">
        <div class="section-heading"><h2>プレイヤー</h2><span>${state.players.length} / ${seats}</span></div>
        <ol class="seats">
          ${Array.from({ length: seats }, (_, i) => {
            const player = state.players[i];
            if (!player) return `<li class="seat empty"><span class="avatar">＋</span>空席</li>`;
            return `<li class="seat"><span class="avatar">${escape(Array.from(player.name)[0])}</span><strong>${escape(player.name)}</strong><span class="seat-tag">${player.id === state.owner ? "ホスト" : ""}${player.id === state.self ? " · あなた" : ""}</span></li>`;
          }).join("")}
        </ol>
        ${host ? button("start", "対戦を始める →", "primary wide", busy || state.players.length < 2) : ""}
        <p class="muted compact">${host ? (state.players.length < 2 ? "2人以上で対戦を始められます。" : "") : "ホストが対戦を始めるまでお待ちください。"}</p>
      </section>
      <section class="panel">
        <div class="section-heading"><h2>対戦ルール</h2></div>
        <label class="joker-setting">ジョーカーの枚数
          <select data-rule="jokerCount"${disabled(!host || busy)}>
            ${[1, 2].map(n => `<option value="${n}"${n === state.settings.jokerCount ? " selected" : ""}>${n}枚</option>`).join("")}
          </select>
        </label>
        <div class="rules">${roles.map(role => role.key === "9" ? `<label class="rule">
          <span class="rank-icon">9</span><span><strong>9の効果</strong></span>
          <select data-rule="nineMode"${disabled(!host || busy)}>
            ${nineModes.map(mode => `<option value="${mode.value}"${mode.value === nineMode ? " selected" : ""}>${mode.label}</option>`).join("")}
          </select>
        </label>` : `<label class="rule">
          <span class="rank-icon">${role.rank}</span><span><strong>${role.name}</strong><small>${role.description}</small></span>
          <input type="checkbox" role="switch" aria-label="${role.rank} ${role.name}" data-rule="${role.key}"${state.settings[role.key] ? " checked" : ""}${disabled(!host || busy)}><span class="switch" aria-hidden="true"></span>
        </label>`).join("")}</div>
      </section>
    </div>`;
}

function playersView(state) {
  return `<div class="table-players">${state.players.map(player => {
    const active = player.id === state.round.turn;
    return `<div class="table-player${active ? " current" : ""}${player.id === state.self ? " self" : ""}"><span class="avatar">${escape(Array.from(player.name)[0])}</span>
      <span><strong>${escape(player.name)}</strong><small>${player.id === state.self ? "あなた · " : ""}${player.id === state.owner ? "ホスト · " : ""}${player.place > 0 ? placeName(player.place, state.players.length) : player.passed ? "パス" : `残り ${player.cards} 枚`}</small></span>
      ${player.place > 0 ? '<b class="finished-mark">上がり</b>' : `<b class="hand-count" aria-label="残り${player.cards}枚">${player.cards}<small>枚</small></b>`}
      ${active ? '<b class="turn-tag">手番</b>' : ""}</div>`;
  }).join("")}</div>`;
}

function handView(state, ui, mine) {
  const { hand, pending, table } = state.round;
  const locked = ui.busy || !mine || state.round.pausedAt != null;
  if (pending && mine) {
    const target = state.players.find(player => player.id === pending.target)?.name;
    const title = {
      "7": `${escape(target)} に渡すカードを${pending.count}枚選んでください`,
      "9": `捨て札から拾うカードを${pending.count}枚まで選べます`,
      "10": `捨てるカードを${pending.count}枚選んでください`,
      "Q": `12ボンバー · 除外する数字やジョーカーを${pending.count}種類選んでください`,
    }[pending.kind];
    return `<section class="panel hand-panel">
      <h2>${title}</h2>
      <div class="card-row choices">
      ${pending.kind === "Q"
        ? bomberRanks.map(rank => `<button class="rank-choice${ui.selected.has(rank) ? " selected" : ""}" type="button" aria-pressed="${ui.selected.has(rank)}" data-value="${rank}"${disabled(locked || (!ui.selected.has(rank) && ui.selected.size >= pending.count))}>${rankName(rank)}</button>`).join("")
        : pending.choices.map(card => cardTile(card, ui.selected.has(card.id), locked || (!ui.selected.has(card.id) && ui.selected.size >= pending.count))).join("")}
      </div>
      <div class="actions hand-actions"><span class="selection-count" role="status">${ui.selected.size} / ${pending.count}${pending.kind === "Q" ? "種類" : "枚"} 選択</span>${button("clear-selection", "選択解除", "ghost", locked || !ui.selected.size)}${button("resolve", pending.kind === "9" && !ui.selected.size ? "拾わない" : "確定する", "primary", locked || (pending.kind !== "9" && ui.selected.size !== pending.count))}</div>
      ${pending.kind === "Q" ? `<h2 class="reference-title">あなたの手札</h2><div class="card-row reference">${hand.length ? hand.map(card => `<div class="${cardClass(card)}">${cardFace(card)}</div>`).join("") : '<p class="muted">手札はありません</p>'}</div>` : ""}
    </section>`;
  }
  const groups = playableGroups(hand, table, state.round.revolution !== state.round.back);
  const fits = (group, ids) => ids.length <= group.count
    && ids.every(id => group.cards.some(card => card.id === id))
    && (ids.length < group.count || group.rank === "JK" || group.cards.some(card => card.rank === group.rank && ids.includes(card.id)));
  const selected = [...ui.selected];
  const allowed = card => ui.selected.has(card.id) || groups.some(group => fits(group, [...selected, card.id]));
  const ready = selected.length > 0 && groups.some(group => (!table || selected.length === group.count)
    && fits(group, selected));
  const hint = !mine || !hand.length ? "" : !table ? "同じ数字のカードを1枚以上選べます。"
    : !groups.length ? "場に出せるカードがありません。「パス」を押してください。"
    : `場札の${rankName(table.rank)}より強い組を${table.cards.length}枚選んでください（${selected.length}枚選択中）。`;
  const me = state.players.find(player => player.id === state.self);
  return `<section class="panel hand-panel">
    <div class="section-heading"><h2>あなたの手札</h2><span>${hand.length} 枚</span></div>
    ${hint ? `<p class="muted">${hint}</p>` : ""}
    <div class="card-row">${hand.length ? hand.map(card => cardTile(card, ui.selected.has(card.id), locked || !allowed(card))).join("") : `<p class="muted">${me.place > 0 ? placeName(me.place, state.players.length) : "手札はありません"}</p>`}</div>
    <div class="actions hand-actions"><span class="selection-count" role="status">${selected.length ? `${selected.length}枚 選択中` : mine ? "カードを選択" : "相手の手番です"}</span>
      ${button("clear-selection", "選択解除", "ghost", locked || !selected.length)}
      ${button("pass", "パス", "secondary", locked || !table)}
      ${button("play", ui.busy ? "送信中…" : selected.length ? `${selected.length}枚を出す` : "カードを出す", "primary", locked || !ready)}</div>
  </section>`;
}

export function matchView(state, ui) {
  const round = state.round;
  const mine = state.self === round.turn;
  const current = state.players.find(player => player.id === round.turn)?.name;
  const reversed = round.revolution !== round.back;
  const paused = round.pausedAt != null;
  const turn = mine ? "あなたの手番" : `${escape(current)} の手番`;
  return `${roomHeader(state, "対戦テーブル", "", ui.busy, state.solo)}
    ${message(ui.error, ui.notice)}
    <section class="felt${mine && !paused ? " my-turn" : ""}${paused ? " paused" : ""}${round.revolution ? " revolution" : ""}${round.back ? " eleven-back" : ""}">
      <div class="turn-banner${mine ? " mine" : ""}"><strong role="status">${paused ? "一時停止中" : turn}</strong>
        <span class="turn-clock" data-clock aria-label="残り時間"></span></div>
      ${playersView(state)}
      <p class="turn-direction">${round.reverse ? '<b class="effect-badge">9リバース</b> ← 逆回り' : "→ 席順どおり"}</p>
      <div class="felt-state"><span>${round.revolution ? '<b class="effect-badge">革命</b> ' : ""}${round.back ? '<b class="effect-badge">イレブンバック</b> ' : ""}${reversed ? "逆順（3が最強）" : "通常順（2が最強）"}<small> · ジョーカーを除く</small></span><span>捨て札 ${round.discardCount} 枚</span></div>
      <div class="table-center">
        <p>場札${round.table?.rank !== "JK" && round.table?.cards.some(card => card.rank === "JK") ? ` · ${round.table.rank}として出札` : ""}</p>
        <div class="table-cards">${round.table ? round.table.cards.map(card => `<div class="${cardClass(card)}">${cardFace(card)}</div>`).join("") : '<div class="empty-table"><span>♠</span><strong>場が空いています</strong><small>好きな数字から出せます</small></div>'}</div>
      </div>
      <p class="last-move" role="status">${escape(round.last)}</p>
    </section>
    ${handView(state, ui, mine)}
    ${state.owner === state.self ? `<div class="actions host-actions" aria-label="ホスト操作">
      ${button(paused ? "resume" : "pause", paused ? "対戦を再開" : "一時停止", "secondary", ui.busy)}
      ${button("discard", "対戦を破棄", "danger", ui.busy)}
    </div>` : ""}`;
}

export function resultView(state, ui) {
  const host = state.owner === state.self;
  let place = 1;
  return `${roomHeader(state, "対戦結果", "ラウンドが終了しました。", ui.busy, true)}
    ${message(ui.error, ui.notice)}
    <section class="panel results">
      ${state.round.results.map(group => {
        const rank = place;
        place += group.length;
        return `<div class="result-row"><span>${placeName(rank, state.round.results.flat().length)} · ${rank}位${group.length > 1 ? "（同順位）" : ""}</span><strong>${group.map(player => escape(player.name)).join("、")}</strong></div>`;
      }).join("")}
      <div class="actions">${host
        ? button("start", "もう一度遊ぶ", "primary", ui.busy || state.players.length < 2) + button("lobby", "ロビーに戻る", "secondary", ui.busy)
        : "<p class='muted'>ホストの操作をお待ちください。</p>"}</div>
    </section>`;
}

export const guideView = `<h2>遊び方</h2>
  <p>「ひとりで遊ぶ」を選ぶとAI3人との対戦が始まります。友だちと遊ぶときは、部屋を作るか、招待リンク・部屋コードで参加します。オンライン対戦は2〜${maxPlayers}人です。</p>
  <p>毎ラウンド席順をシャッフルし、♦3を持つ人が最初の手番になります。</p>
  <p>同じ数字をまとめて出せます。場札があるときは、同じ枚数でより強い数字を出すかパスします。誰かが新しい札を出すと、前にパスした人にも手番が回ります。最後の出札のあと、ほかの人が全員パスすると場が流れます。</p>
  <p>通常は 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → J → Q → K → A → 2 の順に強くなります。ジョーカー単体は最強です。組に加えたジョーカーは同じ数字として数え、役も発動します。</p>
  <p>持ち時間は${turnSeconds}秒です。時間切れは自動でパスします。役の選択中なら自動で処理します。ホストが時間切れになると、席順で次の人にホスト権が移ります。</p>
  <p>役の処理を終えて手札がゼロになれば順位が決まります。12ボンバーで同時に手札がゼロになった人は同順位です。</p>
  <div class="guide-rules">${roles.map(role => `<p><b>${role.rank} · ${role.name}</b><br>${role.description}</p>`).join("")}</div>
  <p>9リバースを選ぶと、9を出すたびに手番の進む向きが逆になります。場が流れても向きは続きます。栗拾いとはどちらか一方を選べます。</p>
  <p>栗拾いでは場から捨て札になったカードや10捨てのカードを拾えます。12ボンバーで除外されたカードは拾えません。</p>`;
