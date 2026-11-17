(function (root) {
  "use strict";
  const KEY = "atlas-website-analytics-v1";
  function publicPage(config, location) { return [config.basePath, config.basePath + "index.html"].includes(location.pathname); }
  function eligible(config, location, navigator) {
    return config && config.enabled === true && config.gaPrivacyReviewed === true && config.policyReviewed === true &&
      ["/", "/startup-atlas/"].includes(config.basePath) &&
      !(config.basePath === "/" && /\.github\.io$/.test((config.origin || "").replace(/^https:\/\//, ""))) &&
      /^G-[A-Z0-9]+$/.test(config.gaMeasurementId || "") &&
      /^https:\/\/[^/?#]+$/.test(config.origin || "") && location.origin === config.origin &&
      publicPage(config, location) && !location.search && !location.hash &&
      navigator.doNotTrack !== "1" && navigator.globalPrivacyControl !== true;
  }
  function boot(win, doc, config) {
    if (!eligible(config, win.location, win.navigator) || doc.getElementById("atlas-analytics-choice")) return;
    let choice = "denied";
    try { choice = win.sessionStorage.getItem(KEY) || "denied"; } catch { return; }
    const panel = doc.createElement("section");
    panel.id = "atlas-analytics-choice";
    panel.className = "shell analytics-choice";
    panel.setAttribute("aria-label", "Optional website analytics");
    const description = doc.createElement("p");
    description.textContent = "Optional website analytics: Google Analytics can measure this public landing-page visit using cookies and browser/network information. No saved opportunities, search terms, filters, business data or profile selections are shared. Your choice lasts for this tab. You can turn it off here.";
    const accept = doc.createElement("button");
    accept.type = "button"; accept.className = "button secondary"; accept.textContent = "Allow website analytics";
    const decline = doc.createElement("button");
    decline.type = "button"; decline.className = "button secondary"; decline.textContent = "Keep analytics off";
    const status = doc.createElement("p");
    status.setAttribute("role", "status");
    const privacy = doc.createElement("a");
    privacy.href = "https://policies.google.com/privacy";
    privacy.textContent = "Google privacy policy";
    privacy.rel = "noopener noreferrer";
    panel.append(description, privacy, accept, decline, status);
    doc.body.append(panel);
    let loaded = false;
    function render() {
      status.textContent = choice === "granted" ? "Analytics allowed for this tab." : "Analytics are off.";
      accept.disabled = choice === "granted";
      decline.textContent = choice === "granted" ? "Turn analytics off" : "Keep analytics off";
    }
    function start() {
      if (loaded || choice !== "granted" || !eligible(config, win.location, win.navigator)) return;
      loaded = true;
      win["ga-disable-" + config.gaMeasurementId] = false;
      win.dataLayer = win.dataLayer || [];
      function gtag() { win.dataLayer.push(arguments); }
      win.gtag = gtag;
      const safeLocation = config.origin + config.basePath;
      gtag("consent", "default", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
      gtag("js", new Date());
      gtag("config", config.gaMeasurementId, { send_page_view: false, cookie_prefix: "startup_atlas", cookie_path: config.basePath, cookie_domain: "none", allow_google_signals: false,
        allow_ad_personalization_signals: false, page_location: safeLocation, page_referrer: "", page_title: "Startup Atlas directory" });
      gtag("event", "page_view", { send_to: config.gaMeasurementId });
      const script = doc.createElement("script");
      script.id = "atlas-ga-script"; script.async = true; script.referrerPolicy = "no-referrer";
      script.src = "https://www.googletagmanager.com/gtag/js?id=" + config.gaMeasurementId;
      doc.head.append(script);
    }
    accept.addEventListener("click", () => {
      if (!eligible(config, win.location, win.navigator)) return;
      try { win.sessionStorage.setItem(KEY, "granted"); } catch { return; }
      choice = "granted"; render(); start();
    });
    decline.addEventListener("click", () => {
      // Deny before any reload, including when the async vendor script is still pending.
      win["ga-disable-" + config.gaMeasurementId] = true;
      win.dataLayer = [];
      let persisted = false;
      try { win.sessionStorage.setItem(KEY, "denied"); persisted = true; }
      catch { try { win.sessionStorage.removeItem(KEY); persisted = true; } catch { /* Never reload into a stale grant. */ } }
      choice = "denied"; render();
      if (!persisted) status.textContent = "Analytics are off on this page. Browser storage is unavailable; close this tab to discard its previous choice.";
      if (loaded && persisted) win.location.reload();
    });
    render(); start();
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { eligible, boot };
  else boot(root, root.document, root.ATLAS_ANALYTICS);
})(typeof window === "undefined" ? globalThis : window);
