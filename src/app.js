import { Centers } from "./centers.js";
import { GAMES, findGame, gameUrl, hubUrl, isSharedOrigin, safeGameRoute } from "./catalog.js";
import { PlayerSession } from "./services/player-session.js";
import { soundEffects } from "./services/audio.js";

const $ = id => document.getElementById(id);
const sharedOrigin = isSharedOrigin(location.origin);
const session = new PlayerSession();
let profile = null, connectionReady = false, connecting = false, connectionError = "";
let authMode = "signin", authBusy = false, pendingGame = null, activeGame = null;
let pendingRoute = "";
const centers = new Centers(session, { showAccount, openGame: (id, route) => requestGame(findGame(id), route) });
let installPrompt = null, toastTimer, frameTimer, hasInteracted = false;

function toast(text) {
  clearTimeout(toastTimer); $("toast").textContent = text; $("toast").hidden = false;
  toastTimer = setTimeout(() => { $("toast").hidden = true; }, 4200);
}
function message(id, text) { $(id).textContent = text; $(id).hidden = !text; }
function closeDialog(id) { if ($(id).open) $(id).close(); }
function openDialog(id) { if (!$(id).open) $(id).showModal(); }

function renderGames() {
  $("game-count").textContent = String(GAMES.length).padStart(2,"0") + " GAMES · ALL GOOD COMPANY";
  for (const game of GAMES) {
    const button = document.createElement("button");
    button.type = "button"; button.className = "game-tile";
    button.style.setProperty("--game-color", game.color);
    button.setAttribute("aria-label", "Play " + game.name + ". " + game.description);
    const wrap = document.createElement("span"); wrap.className = "game-icon-wrap";
    const icon = document.createElement("img"); icon.src = game.icon; icon.alt = "";
    icon.className = "game-icon"; icon.width = 124; icon.height = 124;
    wrap.append(icon); button.append(wrap);
    for (const [className, content] of [["game-name",game.name],["game-description",game.description],["game-detail",game.detail],["game-launch","PLAY NOW ↗"]]) {
      const span = document.createElement("span"); span.className = className; span.textContent = content; button.append(span);
    }
    button.addEventListener("click", () => requestGame(game)); $("games").append(button);
  }
}

function updateAccount() {
  $("account-label").textContent = profile ? profile.displayName || "My Player" : "User Login";
  $("account-button").setAttribute("aria-label", profile ? "Open " + (profile.displayName || "your") + " player profile" : "User Login");
  $("account-button").title = profile ? "Open your player profile" : "User Login";
  $("player-avatar").textContent = profile ? Array.from(profile.displayName || "P").slice(0,2).join("").toUpperCase() : "☺";
  $("player-title").textContent = profile ? "You’re in, " + profile.displayName + "." : "One player. All your games.";
  $("player-subtitle").textContent = profile ? "Your player is ready for Google Feud and Same Slate. Pick a game above." : "Sign in once for Google Feud and Same Slate. Your player comes with you.";
  $("player-action").textContent = profile ? "My player →" : "Let’s play →";
  if (!authBusy) {
    $("auth-view").hidden = Boolean(profile); $("profile-view").hidden = !profile;
    $("account-dialog").setAttribute("aria-labelledby", profile ? "profile-title" : "account-title");
  }
  $("preview-signin").hidden = sharedOrigin; $("auth-form").hidden = !sharedOrigin;
  $("auth-fields").disabled = !connectionReady || authBusy;
  if (profile) {
    $("profile-title").textContent = "Hey, " + profile.displayName + ".";
    $("profile-description").textContent = "Same player. Same friends. A whole collection of good times.";
    $("profile-role").textContent = ({master:"Master host",admin:"Administrator",host:"Host & player",player:"Player"})[profile.role] || "Player";
    $("message-id-block").hidden = !profile.messageId; $("message-id").textContent = profile.messageId || "";
  }
  updateConnectionStatus();
}

function updateConnectionStatus() {
  const status = !navigator.onLine ? "You’re offline. Your collection is here; connect to the internet to sign in and play." : connectionError;
  message("connection-status", status);
  if (!profile && $("account-dialog").open && sharedOrigin && !authBusy && (connecting || connectionError)) {
    message("auth-error", connecting ? "Finding your player…" : connectionError);
  }
  $("retry-connection").hidden = !connectionError || connecting || !sharedOrigin;
}

async function connect() {
  if (!sharedOrigin || connecting || connectionReady) return;
  connecting = true; connectionError = ""; updateAccount();
  try { await session.init(); connectionReady = true; connectionError = ""; message("auth-error",""); }
  catch { connectionError = "We couldn’t connect to your player account. Check your connection and try again."; }
  finally { connecting = false; updateAccount(); }
}
function showAccount() {
  $("live-hub-link").href = hubUrl(pendingGame?.id);
  updateAccount(); openDialog("account-dialog"); updateConnectionStatus();
}
function requestGame(game, route = game.route) {
  route = safeGameRoute(game, route);
  if (!navigator.onLine) { toast("Connect to the internet to open a game."); return; }
  if (game.account === "shared" && !sharedOrigin) { location.assign(hubUrl(game.id)); return; }
  if (game.account === "shared" && !profile) { pendingGame = game; pendingRoute = route; showAccount(); return; }
  launchGame(game, route);
}
function launchGame(game, route = game.route) {
  pendingGame = null; closeDialog("account-dialog"); activeGame = game;
  soundEffects.syncBackgroundMusic(null); updateMusicUI();
  $("launcher").hidden = true; $("game-player").hidden = false; document.body.classList.add("in-game");
  $("game-player").setAttribute("aria-label", "Playing " + game.name);
  $("frame-recovery").hidden = true;
  document.title = game.name + " · Game Center";
  const iframe = document.createElement("iframe"); iframe.title = game.name; iframe.src = gameUrl(game, route);
  iframe.allow = "autoplay; clipboard-write; fullscreen; web-share";
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  message("frame-status", "Opening " + game.name + "…"); clearTimeout(frameTimer);
  iframe.addEventListener("load", () => { clearTimeout(frameTimer); message("frame-status", ""); $("frame-recovery").hidden = true; });
  frameTimer = setTimeout(() => {
    message("frame-status", "The game is taking a while to load. Check your connection and try again.");
    $("frame-recovery").hidden = false;
  }, 18000);
  $("frame-holder").replaceChildren(iframe);
  const url = new URL(location.href);
  if (url.searchParams.get("play") !== game.id || url.searchParams.get("view") !== route) {
    url.searchParams.set("view", route);
    url.searchParams.set("play", game.id); history.pushState({ game: game.id }, "", url);
  }
  $("game-player").focus({ preventScroll:true });
}
function showHub({ updateHistory = true } = {}) {
  activeGame = null; clearTimeout(frameTimer); $("frame-holder").replaceChildren();
  $("game-player").hidden = true; $("launcher").hidden = false; document.body.classList.remove("in-game");
  document.title = "Game Center · Let the good games roll"; soundEffects.syncBackgroundMusic("home"); updateMusicUI();
  if (updateHistory) { const url = new URL(location.href); url.searchParams.delete("play"); url.searchParams.delete("view"); history.replaceState({}, "", url); }
  $("collection").focus({ preventScroll:true });
}
function updateMusicUI() {
  const playing = soundEffects.enabled && soundEffects.musicVolume > 0 && hasInteracted && !activeGame;
  $("sound-toggle").classList.toggle("muted", !soundEffects.enabled);
  $("sound-toggle").title = soundEffects.enabled ? "Turn sound off" : "Turn sound on";
  $("sound-toggle").setAttribute("aria-pressed", String(soundEffects.enabled));
  $("sound-label").textContent = soundEffects.enabled ? "SOUND ON" : "SOUND OFF";
  document.body.classList.toggle("music-playing", playing);
  $("music-caption").textContent = !soundEffects.enabled || soundEffects.musicVolume === 0 ? "Music off · Your volume is saved" : hasInteracted ? "Original music · A little groove for game night" : "Original music · Starts with your first tap";
}
async function copyText(text, success) {
  try { await navigator.clipboard.writeText(text); toast(success); }
  catch { toast("Copy isn’t available here. You can select and copy the text instead."); }
}

renderGames();
soundEffects.installUnlockHandlers(); soundEffects.syncBackgroundMusic("home");
$("music-volume").value = Math.round(soundEffects.musicVolume * 100); updateMusicUI();
for (const event of ["click","touchend","keydown"]) window.addEventListener(event, () => { hasInteracted = true; updateMusicUI(); }, { once:true, passive:true });
$("sound-toggle").addEventListener("click", () => { soundEffects.toggle(); updateMusicUI(); });
$("music-volume").addEventListener("input", event => { soundEffects.setMusicVolume(Number(event.target.value) / 100); updateMusicUI(); });
$("account-button").addEventListener("click", showAccount);
$("player-action").addEventListener("click", showAccount);
$("profile-play").addEventListener("click", () => { closeDialog("account-dialog"); $("collection").focus(); });
for (const button of document.querySelectorAll("[data-close]")) button.addEventListener("click", () => closeDialog(button.dataset.close));
$("account-dialog").addEventListener("close", () => { if (!authBusy) pendingGame = null; });
for (const dialog of document.querySelectorAll("dialog")) dialog.addEventListener("click", event => {
  if (event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
});
for (const mode of ["signin","signup"]) $(mode + "-tab").addEventListener("click", () => {
  authMode = mode; $("signin-tab").setAttribute("aria-pressed", String(mode === "signin")); $("signup-tab").setAttribute("aria-pressed", String(mode === "signup"));
  $("auth-submit").textContent = mode === "signin" ? "Sign in & get playing →" : "Create my player →"; message("auth-error", "");
});
$("auth-form").addEventListener("submit", async event => {
  event.preventDefault(); if (authBusy || !connectionReady) return;
  authBusy = true; $("auth-fields").disabled = true; message("auth-error", ""); const game = pendingGame, route = pendingRoute;
  try {
    const details = { email:$("player-email").value, displayName:$("player-nickname").value };
    await (authMode === "signup" ? session.signUp(details) : session.signIn(details));
    $("player-email").value = ""; $("player-nickname").value = "";
    closeDialog("account-dialog"); toast("You’re in, " + (profile?.displayName || "player") + ". Let the good games roll.");
    if (game) launchGame(game, route);
  } catch (error) {
    message("auth-error", /permission|network|fetch/i.test(error.message) ? "We couldn’t connect to your player. Please try again in a moment." : error.message);
  } finally { authBusy = false; updateAccount(); }
});
$("signout-button").addEventListener("click", async () => {
  $("signout-button").disabled = true; message("profile-error", "");
  try { await session.signOut(); closeDialog("account-dialog"); toast("You’re signed out. Your player will be here when you’re back."); }
  catch { message("profile-error", "We couldn’t sign you out. Check your connection and try again."); }
  finally { $("signout-button").disabled = false; }
});
$("retry-connection").addEventListener("click", connect);
$("copy-message-id").addEventListener("click", () => profile?.messageId && copyText(profile.messageId, "Message ID copied. Share your nickname with it, too."));
async function shareHub() {
  const share = {title:"Game Center", text:"Good games. Questionable bragging rights. Come play!", url:hubUrl()};
  if (navigator.share) { try { await navigator.share(share); return; } catch (error) { if (error.name === "AbortError") return; } }
  await copyText(share.url, "Game Center link copied. Your friends’ excuses are running out.");
}
$("share-button").addEventListener("click", shareHub);
$("share-footer").addEventListener("click", shareHub);
function updateInstallUI() {
  const installed = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  document.body.classList.toggle("installed-app", installed);
  $("install-button").hidden = installed;
  $("install-button-title").textContent = installPrompt ? "Install Game Center" : "Add to Home Screen";
  $("install-button-note").textContent = installPrompt ? "Tap to open your browser’s install prompt." : "All the games. One little icon.";
}
window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); installPrompt = event; updateInstallUI(); });
window.addEventListener("appinstalled", () => { installPrompt = null; updateInstallUI(); toast("Game Center is on your home screen. Excellent taste."); });
window.matchMedia("(display-mode: standalone)").addEventListener("change", updateInstallUI);
updateInstallUI();
$("install-button").addEventListener("click", async () => {
  if (!sharedOrigin) { location.assign(hubUrl()); return; }
  if (installPrompt) {
    const prompt = installPrompt; installPrompt = null; updateInstallUI();
    try { await prompt.prompt(); await prompt.userChoice; } catch { openDialog("install-dialog"); }
  } else openDialog("install-dialog");
});
window.addEventListener("offline", updateConnectionStatus);
window.addEventListener("online", () => { updateConnectionStatus(); if (!connectionReady) connect(); });
window.addEventListener("popstate", () => {
  const game = findGame(new URL(location.href).searchParams.get("play"));
  if (game) requestGame(game, new URL(location.href).searchParams.get("view")); else showHub({ updateHistory:false });
});
session.subscribe(value => { profile = value; centers.updateProfile(value); updateAccount(); }, () => {
  connectionError = "Your player connection was interrupted. Your place is saved; reconnect and try again."; updateConnectionStatus();
});
await connect();
const initialGame = findGame(new URL(location.href).searchParams.get("play"));
if (initialGame) requestGame(initialGame, new URL(location.href).searchParams.get("view"));
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js").catch(() => {});
