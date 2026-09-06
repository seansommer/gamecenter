import { LIVE_ORIGIN, LIVE_HUB } from "./config.js";

// Add a game here and place its real home-screen icon in assets/games/.
// Shared accounts require the same origin, Firebase app and profile contract.
export const GAMES = Object.freeze([
  Object.freeze({
    id: "googlefeud", name: "Google Feud", icon: "./assets/games/googlefeud.webp",
    path: "/googlefeud/", route: "#/home", account: "shared",
    category: "The guessing game", description: "The internet has questions. Your friends have very confident answers.",
    detail: "Party · Search & guess", color: "#ac92ee"
  }),
  Object.freeze({
    id: "sameslate", name: "Same Slate", icon: "./assets/games/sameslate.webp",
    path: "/sameslate/", route: "#/home", account: "shared",
    category: "The matching game", description: "Fill the blank. Find your match. Question your entire thought process.",
    detail: "Party · Up to 32 players", color: "#a7d795"
  }),
  Object.freeze({
    id: "henrythetrain", name: "Henry the Train", icon: "./assets/games/henrythetrain.webp",
    path: "/henrythetrain/", route: "", account: "guest",
    category: "The little adventure", description: "All aboard for a little adventure. No ticket—or sign-in—required.",
    detail: "Tap & play · No sign-in", color: "#89cbd3"
  })
]);

export function findGame(id) { return GAMES.find(game => game.id === id) || null; }
export function gameUrl(game) {
  if (!GAMES.includes(game)) throw new Error("Choose a game from the collection.");
  return `${LIVE_ORIGIN}${game.path}${game.route}`;
}
export function hubUrl(gameId = "") {
  const url = new URL(LIVE_HUB);
  if (findGame(gameId)) url.searchParams.set("play", gameId);
  return url.href;
}
export function isSharedOrigin(origin) { return origin === LIVE_ORIGIN; }
