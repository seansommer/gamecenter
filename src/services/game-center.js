import { ACCOUNT_GAMES, isMaster, isHost, validKey, playerCards, hostHistory, makeHostNumber, amount } from "../center-model.js";

// These are the existing games' paths. No new database, role system or stats writes.
export class GameCenterService {
  constructor(session) { this.session = session; }
  context(access = "player") {
    const profile = this.session.profile;
    if (!profile?.profileId || !this.session.db) throw new Error("Sign in to open your Game Center.");
    if (access === "master" && !isMaster(profile)) throw new Error("Master access is required.");
    if (access === "host" && !isHost(profile)) throw new Error("Host access is required.");
    return { uid: profile.profileId, role: profile.role, authUid: this.session.auth?.currentUser?.uid, access };
  }
  check(context) {
    const current = this.context(context.access);
    if (current.uid !== context.uid || current.role !== context.role || current.authUid !== context.authUid) throw new Error("Your player changed. Open this screen again.");
  }
  async read(path, context) {
    this.check(context);
    const snapshot = await this.session.api.get(this.session.ref(path));
    this.check(context); return snapshot.val();
  }
  game(id) {
    const game = ACCOUNT_GAMES.find(item => item.id === id);
    if (!game) throw new Error("Choose a game from the collection.");
    return game;
  }
  async players() {
    const context = this.context(), sources = {}, failures = [];
    const results = await Promise.allSettled(ACCOUNT_GAMES.map(game => this.read(game.statsPath, context)));
    this.check(context);
    results.forEach((result, index) => {
      const id = ACCOUNT_GAMES[index].id;
      if (result.status === "fulfilled") sources[id] = result.value || {};
      else failures.push(id);
    });
    return { cards: playerCards(sources, this.session.profile), failures };
  }
  async hostedGames() {
    const context = this.context("host");
    const results = await Promise.allSettled(ACCOUNT_GAMES.map(game => this.read(`${game.historyPath}/${context.uid}`, context)));
    this.check(context);
    return ACCOUNT_GAMES.map((game, index) => ({ game, records: results[index].status === "fulfilled" ? hostHistory(results[index].value) : [], failed: results[index].status === "rejected" }));
  }
  async rooms(gameId, records) {
    const context = this.context("host"), game = this.game(gameId);
    // Only fetch one visible page, keeping large archives light on phones.
    if (records.length > 8 || records.some(record => !validKey(record.id))) throw new Error("Choose a valid history page.");
    const results = await Promise.allSettled(records.map(record => this.read(`${game.roomsPath}/${record.id}`, context)));
    this.check(context);
    return records.map((record, index) => {
      const result = results[index], room = result.status === "fulfilled" ? result.value : null;
      if (!room || room.hostUid !== context.uid) return { ...record, unavailable: true };
      return { ...record, nickname: String(room.nickname || record.nickname), code: String(room.code || record.code),
        number: amount(room.gameNumber), status: room.status === "finished" || room.phase === "finished" ? "Finished" : room.phase === "lobby" || room.status === "lobby" ? "In the lobby" : "In progress",
        phase: ["lobby", "recap", "finished"].includes(room.phase) ? room.phase : "play",
        players: Object.keys(room.players || {}).length, rounds: Object.values(room.rounds || {}).filter(round => round?.finalized).length,
        totalRounds: amount(room.totalRounds) };
    });
  }
  async masterData() {
    const context = this.context("master");
    const [users, requests] = await Promise.all([this.read("users", context), this.read("hostRequests", context)]);
    this.check(context);
    // Strip email, Message ID and login credentials before anything reaches the UI.
    const people = Object.entries(users || {}).filter(([uid]) => validKey(uid)).map(([uid, user]) => ({ uid, displayName: String(user.displayName || "Player"), role: user.role || "player", hostNumber: user.hostNumber || "" }));
    const order = { master: 0, admin: 0, host: 1, player: 2 };
    people.sort((a, b) => (order[a.role] ?? 2) - (order[b.role] ?? 2) || a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }));
    const pending = people.filter(person => person.role === "player" && requests?.[person.uid]?.status === "pending")
      .map(person => ({ ...person, requestedAt: amount(requests[person.uid].requestedAt) }));
    return { people, pending };
  }
  async setHost(uid, enabled, expectedRole) {
    const context = this.context("master");
    if (!validKey(uid) || uid === context.uid) throw new Error("Choose another player account.");
    const user = await this.read(`users/${uid}`, context);
    if (!user || !["host", "player"].includes(user.role)) throw new Error("This account’s access is protected or no longer available.");
    if (user.role !== expectedRole) throw new Error("This person’s role changed. Refresh before trying again.");
    const hostNumber = enabled ? String(user.hostNumber || makeHostNumber(uid)) : null;
    this.check(context);
    await this.session.api.update(this.session.ref(), {
      [`users/${uid}/role`]: enabled ? "host" : "player", [`users/${uid}/hostNumber`]: hostNumber,
      [`users/${uid}/updatedAt`]: Date.now(), [`hostRequests/${uid}`]: null
    });
    this.check(context);
  }
  async dismissRequest(uid) {
    const context = this.context("master");
    if (!validKey(uid) || uid === context.uid) throw new Error("Choose a valid host request.");
    await this.session.api.remove(this.session.ref(`hostRequests/${uid}`)); this.check(context);
  }
}
