const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const isProduction = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT || 3000);
const supabaseUrl = process.env.SUPABASE_URL || "https://novztmcsbaygivhoveeg.supabase.co";
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseAuthKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || supabaseSecretKey;
const authAccessCookieName = process.env.AUTH_ACCESS_COOKIE_NAME || "routeforge_access_token";
const authRefreshCookieName = process.env.AUTH_REFRESH_COOKIE_NAME || "routeforge_refresh_token";
const sessionMaxAgeMs = Number(process.env.AUTH_SESSION_MAX_AGE_MS || 7 * 24 * 60 * 60 * 1000);

if (!supabaseUrl) {
  console.warn("SUPABASE_URL is not set. Supabase-backed auth and persistence will fail until it is configured.");
}

if (!supabaseSecretKey) {
  console.warn("SUPABASE_SECRET_KEY is not set. Server-side Supabase access will fail until it is configured.");
}

if (!supabaseAuthKey) {
  console.warn("SUPABASE_PUBLISHABLE_KEY is not set. Falling back to the server key for auth-only server requests.");
}

module.exports = {
  isProduction,
  port: Number.isFinite(port) && port > 0 ? port : 3000,
  supabaseUrl,
  supabaseSecretKey,
  supabaseAuthKey,
  authAccessCookieName,
  authRefreshCookieName,
  sessionMaxAgeMs: Number.isFinite(sessionMaxAgeMs) && sessionMaxAgeMs > 0
    ? sessionMaxAgeMs
    : 7 * 24 * 60 * 60 * 1000
};
