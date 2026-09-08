import { GAMES } from "./catalog.js";

export const ACCOUNT_GAMES = Object.freeze([
  { ...GAMES[0], statsPath: "playerStats", historyPath: "userGames", roomsPath: "games" },
  { ...GAMES[1], statsPath: "sameSlatePlayerStats", historyPath: "sameSlateUserGames", roomsPath: "sameSlateGames" }
].map(Object.freeze));
export const isMaster = profile => ["master", "admin"].includes(profile?.role);
export const isHost = profile => ["host", "master", "admin"].includes(profile?.role);
export const roleLabel = role => ({ master: "Master host", admin: "Administrator", host: "Host", player: "Player" })[role] || "Player";
export const validKey = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
export const amount = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
export function statsSummary(record) {
  const fields = ["totalPoints", "gamesPlayed", "roundsPlayed", "roundsWon", "averagePointsPerRound", "bestGameScore", "bestRoundWinStreak", "bestGameNumber", "lastPlayedAt", "updatedAt", "lifetimeRank"];
  return Object.fromEntries(fields.map(field => [field, amount(record?.[field])]));
}
export function playerCards(sources, profile) {
  const cards = new Map();
  for (const game of ACCOUNT_GAMES) {
    for (const [uid, value] of Object.entries(sources[game.id] || {})) {
      if (!validKey(uid) || !value || typeof value !== "object") continue;
      const card = cards.get(uid) || { uid, displayName: "Player", nameUpdatedAt: 0, games: {} };
      const stats = statsSummary(value);
      if (typeof value.displayName === "string" && stats.updatedAt >= card.nameUpdatedAt) {
        card.displayName = value.displayName.slice(0, 30); card.nameUpdatedAt = stats.updatedAt;
      }
      card.games[game.id] = stats; cards.set(uid, card);
    }
  }
  for (const game of ACCOUNT_GAMES) {
    const ranked = [...cards.values()].filter(card => card.games[game.id]).sort((a, b) => b.games[game.id].totalPoints - a.games[game.id].totalPoints);
    let previousPoints = null, rank = 0;
    ranked.forEach((card, index) => {
      const points = card.games[game.id].totalPoints;
      if (points !== previousPoints) rank = index + 1;
      card.games[game.id].lifetimeRank = rank; previousPoints = points;
    });
  }
  if (profile?.profileId) {
    const card = cards.get(profile.profileId) || { uid: profile.profileId, games: {} };
    card.displayName = profile.displayName; card.accountRole = profile.role; cards.set(card.uid, card);
  }
  return [...cards.values()].sort((a, b) => (b.uid === profile?.profileId) - (a.uid === profile?.profileId) || a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }));
}
export function hostHistory(index) {
  return Object.entries(index || {}).filter(([id, record]) => validKey(id) && record?.role === "host")
    .map(([id, record]) => ({ id, nickname: String(record.nickname || "Game night").slice(0, 100), code: String(record.code || ""), createdAt: amount(record.createdAt || record.joinedAt) }))
    .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
}
export function makeHostNumber(uid) {
  let hash = 2166136261;
  for (const char of uid) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return `H-${String(Math.abs(hash) % 100000).padStart(5, "0")}`;
}
