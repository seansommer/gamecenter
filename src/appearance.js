// Apply the saved appearance before the stylesheet paints the page. This stays
// separate from player updates so changing the lighting never resets a form.
(() => {
  const storageKey = "gamecenter.nightMode.v1";
  const root = document.documentElement;

  function readPreference() {
    try { return localStorage.getItem(storageKey) === "true"; }
    catch { return false; }
  }

  function apply(enabled) {
    root.classList.toggle("night-mode", enabled);
    document.querySelector('meta[name="theme-color"]').content = enabled ? "#100c09" : "#211710";
    const button = document.getElementById("night-mode-toggle");
    if (!button) return;
    button.setAttribute("aria-pressed", String(enabled));
    button.title = enabled ? "Turn night mode off" : "Turn night mode on";
    document.getElementById("night-mode-label").textContent = enabled ? "NIGHT ON" : "NIGHT OFF";
  }

  apply(readPreference());
  document.addEventListener("DOMContentLoaded", () => {
    apply(root.classList.contains("night-mode"));
    document.getElementById("night-mode-toggle").addEventListener("click", () => {
      const enabled = !root.classList.contains("night-mode");
      apply(enabled);
      // The switch still works for this visit if browser storage is unavailable.
      try { localStorage.setItem(storageKey, String(enabled)); } catch {}
    });
  }, { once:true });

  window.addEventListener("storage", event => {
    if (event.key === storageKey || event.key === null) apply(readPreference());
  });
})();
