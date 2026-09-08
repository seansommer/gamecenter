import { ACCOUNT_GAMES, isMaster, isHost, roleLabel, statsSummary } from "./center-model.js";
import { GameCenterService } from "./services/game-center.js";

const $ = id => document.getElementById(id);
const node = (tag, className = "", text = "") => { const element = document.createElement(tag); element.className = className; element.textContent = text; return element; };
const button = (text, action, className = "button secondary small") => { const element = node("button", className, text); element.type = "button"; element.addEventListener("click", action); return element; };
const date = value => value && Number.isFinite(new Date(value).getTime()) ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(value) : "Not played yet";
const number = value => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value || 0);
const searchText = value => String(value).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const initials = name => Array.from(name || "P").slice(0, 2).join("").toUpperCase();

export class Centers {
  constructor(session, { showAccount, openGame }) {
    this.session = session; this.service = new GameCenterService(session); this.showAccount = showAccount; this.openGame = openGame;
    this.profile = null; this.generation = 0; this.view = "players"; this.playersQuery = ""; this.peopleQuery = "";
    for (const element of document.querySelectorAll("[data-center]")) element.addEventListener("click", () => this.open(element.dataset.center));
    $("center-refresh").addEventListener("click", () => this.load());
    $("center-dialog").addEventListener("close", () => { ++this.generation; });
    $("center-back").addEventListener("click", () => $("center-dialog").close());
  }
  updateProfile(profile) {
    const changed = this.profile?.profileId !== profile?.profileId || this.profile?.role !== profile?.role;
    this.profile = profile;
    for (const element of document.querySelectorAll("[data-host-only]")) element.hidden = !isHost(profile);
    for (const element of document.querySelectorAll("[data-master-only]")) element.hidden = !isMaster(profile);
    $("center-intro").textContent = profile ? "Your people, your records, your next game night." : "Player cards and your game-night headquarters. Sign in to take a look.";
    if (changed) {
      ++this.generation; this.playersQuery = ""; this.peopleQuery = "";
      for (const id of ["center-dialog", "player-card-dialog"]) if ($(id).open) $(id).close();
      $("center-content").replaceChildren(); $("player-card-content").replaceChildren();
    }
  }
  open(view = "players") {
    if (!this.profile) { this.showAccount(); return; }
    if ((view === "hosts" && !isHost(this.profile)) || (view === "master" && !isMaster(this.profile))) return;
    if (!["players", "mine", "hosts", "master"].includes(view)) return;
    if ($("account-dialog").open) $("account-dialog").close();
    this.view = view === "mine" ? "players" : view; this.openMine = view === "mine";
    if (!$("center-dialog").open) $("center-dialog").showModal();
    for (const tab of document.querySelectorAll(".center-tabs [data-center]")) tab.setAttribute("aria-pressed", String(tab.dataset.center === this.view));
    const titles = { players: ["Player Cards", "A little friendly competition. A very permanent record."], hosts: ["Host Center", "All your game nights, neatly tucked into one place."], master: ["Master Controls", "The keys to game night. One set of host controls for both games."] };
    $("center-title").textContent = titles[this.view][0]; $("center-description").textContent = titles[this.view][1];
    this.load();
  }
  current(ticket) { return ticket === this.generation && $("center-dialog").open; }
  async load() {
    const ticket = ++this.generation, body = $("center-content");
    body.replaceChildren(node("p", "center-empty", "Opening your game-night headquarters…"));
    $("center-status").textContent = "Loading…"; $("center-refresh").disabled = true;
    try {
      if (this.view === "players") {
        const result = await this.service.players();
        if (!this.current(ticket)) return;
        this.renderPlayers(result, ticket);
        if (this.openMine) { this.openMine = false; const mine = result.cards.find(card => card.uid === this.profile.profileId); if (mine) this.showPlayer(mine, result.failures); }
      } else if (this.view === "hosts") {
        const result = await this.service.hostedGames(); if (!this.current(ticket)) return; this.renderHosts(result, ticket);
      } else {
        const result = await this.service.masterData(); if (!this.current(ticket)) return; this.renderMaster(result, ticket);
      }
      $("center-status").textContent = "Up to date. Use Refresh after another game finishes or a host request arrives.";
    } catch (error) {
      if (!this.current(ticket)) return;
      body.replaceChildren(node("p", "center-empty", "We couldn’t load this screen. Check your connection and try Refresh."));
      $("center-status").textContent = "Unable to load. Your existing game dashboards are still available.";
    } finally { if (this.current(ticket)) $("center-refresh").disabled = false; }
  }
  launch(id, route) {
    for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
    this.openGame(id, route);
  }
  gameHeading(game, subtitle) {
    const heading = node("div", "center-game-heading"), icon = node("img"); icon.src = game.icon; icon.alt = ""; icon.width = 44; icon.height = 44;
    const copy = node("div"); copy.append(node("strong", "", game.name), node("small", "", subtitle)); heading.append(icon, copy); return heading;
  }
  renderPlayers({ cards, failures }, ticket) {
    const body = $("center-content"); body.replaceChildren();
    if (failures.length) body.append(node("p", "center-warning", "Some stats couldn’t load. Refresh to try again; unavailable scores are marked on each card."));
    const label = node("label", "", "Find a player by nickname"); label.htmlFor = "cards-search";
    const search = node("input"); search.id = "cards-search"; search.type = "search"; search.placeholder = "Find your favorite rival…"; search.value = this.playersQuery; search.autocomplete = "off";
    const count = node("p", "center-meta"), list = node("div", "player-card-grid"), paging = node("div", "center-paging");
    body.append(label, search, count, list, paging); let page = 0;
    const draw = () => {
      if (!this.current(ticket)) return;
      const matches = cards.filter(card => searchText(card.displayName).includes(searchText(this.playersQuery)));
      count.textContent = `${number(matches.length)} player${matches.length === 1 ? "" : "s"} · Records from completed games`;
      list.replaceChildren(); paging.replaceChildren();
      for (const card of matches.slice(page * 12, (page + 1) * 12)) {
        const tile = button("", () => this.showPlayer(card, failures), "player-card-tile");
        tile.setAttribute("aria-label", `Open ${card.displayName}’s player card`);
        const head = node("span", "player-card-top"); head.append(node("span", "avatar", initials(card.displayName)), node("strong", "", card.displayName));
        tile.append(head);
        if (card.uid === this.profile.profileId) tile.append(node("span", "role-pill", `You · ${roleLabel(this.profile.role)}`));
        for (const game of ACCOUNT_GAMES) {
          const line = node("span", "player-card-game");
          line.append(node("span", "", game.name), node("strong", "", failures.includes(game.id) ? "Unavailable" : `${number(card.games[game.id]?.totalPoints)} pts`)); tile.append(line);
        }
        tile.append(node("span", "card-open", "Open player card →")); list.append(tile);
      }
      if (!matches.length) list.append(node("p", "center-empty", "No nickname found. Try a different spelling."));
      this.pager(paging, page, matches.length, 12, next => { page = next; draw(); });
    };
    search.addEventListener("input", () => { this.playersQuery = search.value; page = 0; draw(); }); draw();
    body.append(node("p", "center-meta", "New friends appear after their first completed game. Henry is a tap-and-play adventure and doesn’t keep scores."));
  }
  showPlayer(card, failures) {
    const body = $("player-card-content"); body.replaceChildren();
    $("player-card-name").textContent = card.displayName;
    const banner = node("div", "player-card-banner"); banner.append(node("span", "avatar", initials(card.displayName)), node("p", "", card.uid === this.profile.profileId ? `Your lifetime player card · ${roleLabel(this.profile.role)}` : "Lifetime player card")); body.append(banner);
    for (const game of ACCOUNT_GAMES) {
      const section = node("section", "player-stats-section"); section.append(this.gameHeading(game, "Lifetime records")); body.append(section);
      if (failures.includes(game.id)) { section.append(node("p", "center-warning", "Stats unavailable. Close this card and Refresh to try again.")); continue; }
      const stats = statsSummary(card.games[game.id]), grid = node("dl", "player-stats-grid");
      section.append(node("p", "center-summary", stats.lifetimeRank ? `#${number(stats.lifetimeRank)} · All-time points ranking` : "Unranked · Your first finished game awaits"));
      const values = [["Total points", number(stats.totalPoints)], ["Games played", number(stats.gamesPlayed)], ["Rounds played", number(stats.roundsPlayed)], ["Rounds won", number(stats.roundsWon)], ["Avg. points / round", stats.averagePointsPerRound.toFixed(2)], ["Round win rate", `${stats.roundsPlayed ? (stats.roundsWon / stats.roundsPlayed * 100).toFixed(1) : "0.0"}%`], ["Best game", number(stats.bestGameScore)], ["Best win streak", number(stats.bestRoundWinStreak)]];
      for (const [label, value] of values) { const item = node("div"); item.append(node("dt", "", label), node("dd", "", value)); grid.append(item); }
      section.append(grid, node("p", "center-meta", stats.gamesPlayed ? `${stats.bestGameNumber ? `Best in Game #${number(stats.bestGameNumber)} · ` : ""}Last played ${date(stats.lastPlayedAt)}` : "Your first finished game starts the story."));
      section.append(button("Visit Hall of Fame ↗", () => this.launch(game.id, "#/hall-of-fame"), "text-button"));
    }
    $("player-card-dialog").showModal();
  }
  pager(target, page, total, size, change) {
    if (total <= size) return;
    const back = button("← Previous", () => change(page - 1)), next = button("Next →", () => change(page + 1));
    back.disabled = page === 0; next.disabled = (page + 1) * size >= total;
    target.append(back, node("span", "center-meta", `${page + 1} / ${Math.ceil(total / size)}`), next);
  }
  renderHosts(groups, ticket) {
    const body = $("center-content"); body.replaceChildren();
    const total = groups.reduce((sum, group) => sum + group.records.length, 0);
    body.append(node("p", "center-summary", `${number(total)} hosted game${total === 1 ? "" : "s"}${groups.some(group => group.failed) ? " loaded so far" : " in your archive"}. Snacks not included.`));
    for (const { game, records, failed } of groups) {
      const fold = node("details", "center-fold"), summary = node("summary");
      summary.append(this.gameHeading(game, failed ? "History unavailable · Try Refresh" : `${number(records.length)} hosted games`), node("span", "fold-chevron", "⌄")); fold.append(summary);
      const content = node("div", "center-fold-body"), actions = node("div", "center-actions");
      actions.append(button("Create a new game +", () => this.launch(game.id, "#/create"), "button primary small"), button("Game dashboard ↗", () => this.launch(game.id, "#/host")));
      content.append(actions); const rows = node("div", "host-room-list"), paging = node("div", "center-paging"); content.append(rows, paging); fold.append(content); body.append(fold);
      let page = 0, loaded = false, request = 0;
      const draw = async () => {
        const sequence = ++request;
        rows.replaceChildren(node("p", "center-empty", failed ? "This game’s archive couldn’t load. Try Refresh." : records.length ? "Finding your game nights…" : "No hosted games yet. Your first room will appear here.")); paging.replaceChildren();
        if (failed || !records.length) return;
        try {
          const rooms = await this.service.rooms(game.id, records.slice(page * 8, (page + 1) * 8));
          if (!this.current(ticket) || sequence !== request) return;
          rows.replaceChildren();
          for (const room of rooms) {
            const row = node("article", "host-room"), copy = node("div", "host-room-copy");
            copy.append(node("h3", "", room.nickname), node("p", "center-meta", `${room.number ? `Game #${number(room.number)} · ` : ""}${date(room.createdAt)}${room.code ? ` · Code ${room.code}` : ""}`));
            row.append(copy);
            if (room.unavailable) row.append(node("p", "center-warning", "This room is unavailable or has been removed. Try its game dashboard."));
            else {
              copy.append(node("p", "center-meta", `${room.status} · ${room.players} players · ${room.rounds}/${room.totalRounds} rounds completed`));
              const controls = node("div", "center-actions"), route = room.status === "Finished" ? "finale" : room.phase === "finished" ? "finale" : room.phase;
              controls.append(button(room.status === "Finished" ? "View results →" : "Resume game →", () => this.launch(game.id, `#/game/${room.id}/${route}`), "button primary small"), button("Game details", () => this.launch(game.id, `#/game/${room.id}/details`)));
              row.append(controls);
            }
            rows.append(row);
          }
        } catch { if (this.current(ticket)) rows.replaceChildren(node("p", "center-warning", "These rooms couldn’t load. Try Refresh.")); }
        if (this.current(ticket)) this.pager(paging, page, records.length, 8, next => { page = next; draw(); });
      };
      fold.addEventListener("toggle", () => { if (fold.open && !loaded) { loaded = true; draw(); } });
    }
    body.append(node("p", "center-meta", "Each game keeps its own rooms, settings and results. Your host access works across both games. Henry doesn’t use hosted rooms."));
  }
  renderMaster({ people, pending }, ticket) {
    const body = $("center-content"); body.replaceChildren();
    body.append(node("p", "center-summary", `${this.profile.displayName} · ${roleLabel(this.profile.role)}${this.profile.hostNumber ? ` · ${this.profile.hostNumber}` : ""}`));
    const actionStatus = node("p", "center-action-status"); actionStatus.setAttribute("role", "status"); body.append(actionStatus);
    let busy = false;
    const act = async (control, fn, success) => {
      if (busy) return; busy = true;
      const controls = [...body.querySelectorAll("button")]; controls.forEach(item => { item.disabled = true; }); $("center-refresh").disabled = true;
      actionStatus.textContent = "Saving…";
      try { await fn(); if (!this.current(ticket)) return; const refreshTicket = this.generation + 1; await this.load(); if (this.current(refreshTicket) && this.view === "master") { const status = $("center-content").querySelector(".center-action-status"); if (status) status.textContent = success; } }
      catch (error) { if (this.current(ticket)) { actionStatus.textContent = /permission/i.test(error.message) ? "Your account could not make that change. Check your master access and try Refresh." : error.message; controls.forEach(item => { item.disabled = false; }); $("center-refresh").disabled = false; control.focus(); } }
      finally { busy = false; }
    };
    const requestFold = node("details", "center-fold"); requestFold.open = pending.length > 0;
    requestFold.append(node("summary", "", `Host requests · ${pending.length} pending`));
    const requests = node("div", "center-fold-body"); requestFold.append(requests); body.append(requestFold);
    if (!pending.length) requests.append(node("p", "center-empty", "No pending host requests. The clipboard gets a moment off."));
    for (const person of pending) {
      const row = node("article", "master-person"), copy = node("div"); copy.append(node("strong", "", person.displayName), node("p", "center-meta", `Requested ${date(person.requestedAt)}`));
      const actions = node("div", "center-actions");
      const approve = button("Approve host", () => act(approve, () => this.service.setHost(person.uid, true, "player"), `${person.displayName} can now host both games.`), "button primary small");
      const decline = button("Decline", () => act(decline, () => this.service.dismissRequest(person.uid), `Request from ${person.displayName} declined.`));
      actions.append(approve, decline); row.append(copy, actions); requests.append(row);
    }
    const setup = node("details", "center-fold"); setup.append(node("summary", "", `User & Host Setup · ${people.length} people`)); const setupBody = node("div", "center-fold-body"); setup.append(setupBody); body.append(setup);
    const label = node("label", "", "Search by nickname"); label.htmlFor = "master-search";
    const search = node("input"); search.id = "master-search"; search.type = "search"; search.placeholder = "Find a host or player…"; search.value = this.peopleQuery; search.autocomplete = "off";
    const list = node("div", "master-people"), paging = node("div", "center-paging"); setupBody.append(label, search, list, paging); let page = 0;
    const draw = () => {
      const matches = people.filter(person => searchText(person.displayName).includes(searchText(this.peopleQuery))); list.replaceChildren(); paging.replaceChildren();
      for (const person of matches.slice(page * 12, (page + 1) * 12)) {
        const row = node("article", "master-person"), copy = node("div"); copy.append(node("strong", "", person.displayName), node("p", "center-meta", `${roleLabel(person.role)}${person.hostNumber ? ` · ${person.hostNumber}` : ""}`)); row.append(copy);
        if (["player", "host"].includes(person.role) && person.uid !== this.profile.profileId) {
          const promote = person.role === "player";
          const control = button(promote ? "Make host" : "Remove host access", () => {
            if (!promote && !window.confirm(`Remove ${person.displayName}’s host access for both games? Their player account and history stay saved.`)) return;
            act(control, () => this.service.setHost(person.uid, promote, person.role), `${person.displayName} is now a ${promote ? "host" : "player"} across both games.`);
          }); control.disabled = busy; row.append(control);
        } else row.append(node("span", "role-pill", "Protected account"));
        list.append(row);
      }
      if (!matches.length) list.append(node("p", "center-empty", "No nickname found."));
      this.pager(paging, page, matches.length, 12, next => { page = next; draw(); });
    };
    search.addEventListener("input", () => { this.peopleQuery = search.value; page = 0; draw(); }); draw();
    setupBody.append(node("p", "center-meta", "Host changes apply to both games. Email addresses and private account details stay off these lists."));
    const tools = node("section", "master-game-tools"); tools.append(node("h3", "", "Game records & content"), node("p", "center-meta", "Open each game’s complete master tools for its archive, submissions and question or card bank."));
    for (const game of ACCOUNT_GAMES) { const box = node("article", "master-game-tool"); box.append(this.gameHeading(game, "Archive · Submissions · Custom bank"), button("Open Master Controls ↗", () => this.launch(game.id, "#/admin"))); tools.append(box); }
    body.append(tools);
  }
}
