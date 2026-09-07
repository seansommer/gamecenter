# Game Center

**Good games. Questionable bragging rights.**

A warm amber-and-coral home for Google Feud, Same Slate, Henry the Train, and future games. The collection uses the games' real home-screen icons, original arcade artwork, subtle motion, a shared player sign-in, and an original synthesized soundtrack.

Public address: https://seansommer.github.io/gamecenter/

## Launch

1. Open this repository's **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
2. Open **Actions → Verify and deploy Game Center → Run workflow** on `main` (or rerun the failed deployment).
3. When deployment succeeds, open the public address above. On a phone, use the install control or **Add to Home Screen**.

GitHub Pages is enabled. Future pushes to main run the checks and publish automatically. The instructions above also document how to set up another repository.

No Cloudflare Worker, new Firebase project, new API key, or new database rules are required for this hub. It uses the Firebase configuration and shared account paths already used by both word games. Existing message features still require the message rules previously supplied with those games.

## Players and game launching

- Sign in with the same email and nickname used in Google Feud or Same Slate, or create one shared player here.
- Existing player IDs, roles, host numbers, Message IDs, game history and scores stay attached to the same profiles. Game-specific statistics remain in the games; Game Center does not rewrite scores.
- Google Feud and Same Slate open inside the hub without an extra header. Each game has a Game Center icon in its own header and footer. Their full dashboards, scoring, Hall of Fame, messages and host controls remain available.
- Henry the Train opens without sign-in.
- The hub pauses its music while a game is open. Returning closes the embedded game view; active rooms remain in Firebase and can be resumed using the game's existing resume controls.
- Game Center's header stays visible while scrolling, with a player-profile button, sound switch and Night Mode switch. Phone controls keep 44px tap targets and space below the status bar. The original Game Center icon and artwork are unchanged.
- Night Mode dims the lounge to a warm, almost-black background. Its `gamecenter.nightMode.v1` preference is saved in this browser independently of each game's settings and applied before the page paints. Switching modes does not reload the page or clear account fields.

Firebase's persistent browser session is shared because the public hub and word games all use **https://seansommer.github.io**, the same default Firebase app, and `browserLocalPersistence`. Keep these consistent. Firebase sessions are origin-specific: https://firebase.google.com/docs/auth/web/auth-state-persistence

This is the existing family-game email-and-nickname account model, not a newly introduced password or verified-email system. Do not use it for sensitive account information. Signing out clears this browser's shared identity, not other devices. A separate browser, device, or separately installed app may ask the player to sign in again.

The private Sites publication is a visual/audio review copy on a different domain. Its shared-account controls send players to the public Game Center, where the existing games can reuse the sign-in. No credentials, tokens, email addresses, or Message IDs are transferred in URLs.

## Add another game

1. Add an optimized copy of its real webapp icon to `assets/games/`.
2. Add one entry to `src/catalog.js`: stable ID, title, icon path, owned public game path, home route, description, detail, accent color, and `account: "shared"` or `"guest"`.
3. For shared sign-in, use the same Firebase default app and `users`/`sessions`/`loginLookup` contract in the new game.
4. Add its icon to `service-worker.js`. Optionally add a launcher shortcut in `manifest.webmanifest`.
5. Increment the service-worker cache version. If editing versioned entrypoints, update their matching URLs in `index.html` and the service worker.
6. Run the checks below and push to `main`.

Only catalog entries may open in the embedded player. Arbitrary query-string URLs are rejected.

## Development and verification

Requires Node 22 or newer; there are no npm dependencies or server build requirements.

```sh
npm test
npm run build
```

The build writes a static `dist/` folder and validates JavaScript, relative imports, HTML assets, manifest icons and offline files. CI runs the same tests/build before deploying that folder to GitHub Pages.

Tests cover shared identity normalization, restoring profiles and host privileges, signup collisions, permanent Message ID provisioning, sign-out, delayed account updates, catalog URL restrictions and service-worker cache isolation. They do not create production accounts or send messages.

The launcher works offline after its first visit; multiplayer games and Firebase sign-in require connectivity. The worker only handles the hub's own scope and never deletes another game's caches or caches Firebase requests.

## Artwork and music

Original artwork prompts and output mapping: `docs/artwork-manifest.json`.

- Warm miniature arcade lounge: `assets/arcade-lounge.webp`.
- New joystick webapp icon: 512px, 192px, 180px Apple touch and 48px favicon assets.
- Social artwork: `assets/social-share.jpg`, 1200×630.
- Game icon source repositories: `seansommer/googlefeud`, `seansommer/sameslate`, and `seansommer/henrythetrain`; resized without changing their designs.
- **Meet Me at the Arcade**: an original 32-beat, 96 BPM synthesized composition in `src/services/music.js`.
- Same Slate's separate update adds **Same Wavelength** (menu) and **Little Matches** (gameplay).

Sound starts after interaction, respects mute/volume settings, pauses offscreen, and stops when opening a game. Animation respects reduced-motion preferences.

Created by Sean
