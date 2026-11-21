/*
 * Creates the Supabase client from config.js, if present. Both the public
 * page and the operator console use window.upClient. When config is missing
 * (no config.js), upClient is null and callers fall back to local behaviour.
 */
(function (global) {
  let client = null;
  try {
    const cfg = global.UP_CONFIG;
    const hasLib = global.supabase && typeof global.supabase.createClient === "function";
    const configured =
      cfg && cfg.url && cfg.anonKey &&
      !cfg.url.includes("YOUR-PROJECT") && !cfg.anonKey.includes("YOUR-ANON");
    if (hasLib && configured) {
      client = global.supabase.createClient(cfg.url, cfg.anonKey);
    }
  } catch (e) {
    console.warn("Supabase client not initialised:", e);
  }
  global.upClient = client;
})(window);
