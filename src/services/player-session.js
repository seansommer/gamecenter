import { FIREBASE_CONFIG, SDK_VERSION } from "../config.js";
import { normalizeEmail, loginKey, validatePlayer, createMessageId, messageKey } from "../identity.js";

export class PlayerSession {
  constructor() {
    this.api = {}; this.auth = null; this.db = null; this.profile = null;
    this.listeners = new Set(); this.errorListeners = new Set();
    this.authGeneration = 0; this.profileGeneration = 0;
  }

  async init() {
    this.stopAuth?.(); this.stopSession?.(); this.stopProfile?.();
    const modules = await Promise.all(["app", "auth", "database"].map(service =>
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-${service}.js`)));
    this.api = Object.assign({}, ...modules);
    const app = this.api.initializeApp(FIREBASE_CONFIG);
    this.auth = this.api.getAuth(app);
    this.db = this.api.getDatabase(app);
    await this.api.setPersistence(this.auth, this.api.browserLocalPersistence);
    await new Promise((resolve, reject) => {
      let restored = false;
      const timeout = setTimeout(() => {
        restored = true; ++this.authGeneration; ++this.profileGeneration;
        this.stopAuth?.(); this.stopSession?.(); this.stopProfile?.();
        reject(new Error("Player connection timed out."));
      }, 18000);
      const ready = error => {
        if (!restored) { restored = true; clearTimeout(timeout); if (error) reject(error); else resolve(); }
      };
      this.stopAuth = this.api.onAuthStateChanged(this.auth, user => this.watchAuth(user, ready), error => {
        this.report(error); ready(error);
      });
    });
    return this;
  }

  subscribe(callback, onError = () => {}) {
    this.listeners.add(callback); this.errorListeners.add(onError);
    callback(this.profile);
    return () => { this.listeners.delete(callback); this.errorListeners.delete(onError); };
  }
  emit(profile) { this.profile = profile; this.listeners.forEach(listener => listener(profile)); }
  report(error) { this.errorListeners.forEach(listener => listener(error)); }
  ref(path) { return this.api.ref(this.db, path); }

  watchAuth(user, ready = () => {}) {
    const generation = ++this.authGeneration;
    this.stopSession?.(); this.stopProfile?.(); ++this.profileGeneration;
    this.stopSession = null; this.stopProfile = null;
    if (this.lastAuthUid && this.lastAuthUid !== user?.uid) this.emit(null);
    this.lastAuthUid = user?.uid || null;
    if (!user) { this.emit(null); ready(); return; }
    const watchProfile = profileId => {
      if (generation !== this.authGeneration) return;
      this.stopProfile?.();
      const profileGeneration = ++this.profileGeneration;
      if (!profileId) { this.emit(null); ready(); return; }
      this.stopProfile = this.api.onValue(this.ref(`users/${profileId}`), snapshot => {
        if (generation !== this.authGeneration || profileGeneration !== this.profileGeneration) return;
        this.emit(snapshot.exists() ? { ...snapshot.val(), profileId } : null);
        ready();
      }, error => { if (generation === this.authGeneration) { this.report(error); ready(error); } });
    };
    if (!user.isAnonymous) { watchProfile(user.uid); return; }
    this.stopSession = this.api.onValue(this.ref(`sessions/${user.uid}`), snapshot => {
      watchProfile(snapshot.val()?.profileId);
    }, error => { if (generation === this.authGeneration) { this.report(error); ready(error); } });
  }

  async ensureAuth() {
    if (this.auth.currentUser && !this.auth.currentUser.isAnonymous) await this.api.signOut(this.auth);
    return this.auth.currentUser || (await this.api.signInAnonymously(this.auth)).user;
  }
  async getProfile(id) {
    const snapshot = await this.api.get(this.ref(`users/${id}`));
    return snapshot.exists() ? { ...snapshot.val(), profileId: id } : null;
  }

  async signIn({ email, displayName }) {
    validatePlayer(email, displayName);
    const user = await this.ensureAuth();
    const key = await loginKey(email, displayName);
    const lookup = await this.api.get(this.ref(`loginLookup/${key}`));
    if (!lookup.exists()) throw new Error("We couldn’t find that email and nickname together. Check both, or create a player.");
    const profileId = lookup.val();
    await this.api.set(this.ref(`sessions/${user.uid}`), { profileId, loginKey: key });
    const profile = await this.getProfile(profileId);
    if (!profile) throw new Error("That player profile is no longer available.");
    this.emit(profile);
    await this.prepareMessageIdentity(profile);
    return this.profile;
  }

  async signUp({ email, displayName }) {
    validatePlayer(email, displayName);
    const user = await this.ensureAuth();
    const key = await loginKey(email, displayName);
    const lookupRef = this.ref(`loginLookup/${key}`);
    if ((await this.api.get(lookupRef)).exists()) throw new Error("That player already exists. Choose Sign in to find your player.");
    const profileId = this.api.push(this.ref("users")).key;
    const profile = {
      displayName: String(displayName).trim(), email: normalizeEmail(email),
      role: "player", hostNumber: null, authProvider: "anonymous", ownerAuthUid: user.uid,
      loginKey: key, createdAt: Date.now(), updatedAt: Date.now()
    };
    await this.api.set(this.ref(`users/${profileId}`), profile);
    const claim = await this.api.runTransaction(lookupRef, current => current || profileId);
    if (claim.snapshot.val() !== profileId) {
      await this.api.remove(this.ref(`users/${profileId}`));
      throw new Error("That player was just created. Choose Sign in instead.");
    }
    await this.api.set(this.ref(`sessions/${user.uid}`), { profileId, loginKey: key });
    this.emit({ ...profile, profileId });
    await this.prepareMessageIdentity(this.profile);
    return this.profile;
  }

  async prepareMessageIdentity(profile) {
    // Reuse the games' atomic, permanent Message ID contract. Pending message
    // rules must not stop a player from signing in or entering a game.
    try {
      for (let attempt = 0; attempt < 8; attempt++) {
        const latest = await this.getProfile(profile.profileId);
        if (!latest) return;
        const messageId = latest.messageId || createMessageId();
        const key = await messageKey(messageId, latest.displayName);
        if (latest.messageId && latest.messageLookupKey === key) return;
        const updates = {
          [`users/${profile.profileId}/messageId`]: messageId,
          [`users/${profile.profileId}/messageLookupKey`]: key,
          [`messageIds/${messageId}`]: profile.profileId,
          [`messageLookup/${key}`]: profile.profileId
        };
        if (latest.messageLookupKey && latest.messageLookupKey !== key) updates[`messageLookup/${latest.messageLookupKey}`] = null;
        try {
          await this.api.update(this.ref(), updates);
          if (this.profile?.profileId === profile.profileId) this.emit({ ...latest, messageId, messageLookupKey: key });
          return;
        } catch (error) {
          if (!/permission.?denied/i.test(String(error.code || error.message))) throw error;
          const newer = await this.getProfile(profile.profileId);
          if (newer?.messageId && (newer.messageId !== messageId || newer.displayName !== latest.displayName)) continue;
          const occupied = await this.api.get(this.ref(`messageIds/${messageId}`));
          if (!latest.messageId && occupied.exists() && occupied.val() !== profile.profileId) continue;
          throw error;
        }
      }
    } catch (error) { console.warn("Message ID setup will retry in the games’ Message Center.", error.code || error.message); }
  }

  async signOut() {
    const user = this.auth.currentUser;
    if (user?.isAnonymous) await this.api.remove(this.ref(`sessions/${user.uid}`)).catch(() => {});
    await this.api.signOut(this.auth);
    this.emit(null);
  }
}
