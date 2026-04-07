const config = require("./config");
const {
  createSupabaseAuthClient
} = require("./supabase");

function sanitizeUser(user) {
  if (!user) return null;

  const displayName = user.user_metadata && user.user_metadata.name
    ? String(user.user_metadata.name).trim()
    : "";

  return {
    id: user.id,
    name: displayName || user.email || "RouteForge User",
    email: user.email || "",
    createdAt: user.created_at
  };
}

function setSessionCookies(res, session) {
  if (!session) {
    return;
  }

  res.cookie(config.authAccessCookieName, session.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    maxAge: config.sessionMaxAgeMs,
    path: "/"
  });

  res.cookie(config.authRefreshCookieName, session.refresh_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    maxAge: config.sessionMaxAgeMs,
    path: "/"
  });
}

function clearSessionCookies(res) {
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    path: "/"
  };

  res.clearCookie(config.authAccessCookieName, cookieOptions);
  res.clearCookie(config.authRefreshCookieName, cookieOptions);
}

async function resolveSession(req, res) {
  const accessToken = req.cookies ? req.cookies[config.authAccessCookieName] : null;
  const refreshToken = req.cookies ? req.cookies[config.authRefreshCookieName] : null;

  if (!accessToken && !refreshToken) {
    return null;
  }

  const authClient = createSupabaseAuthClient();

  if (accessToken) {
    const { data, error } = await authClient.auth.getUser(accessToken);
    if (!error && data && data.user) {
      return {
        user: data.user,
        session: {
          access_token: accessToken,
          refresh_token: refreshToken || ""
        }
      };
    }
  }

  if (refreshToken) {
    const { data, error } = await authClient.auth.setSession({
      access_token: accessToken || "",
      refresh_token: refreshToken
    });

    if (!error && data && data.session && data.user) {
      setSessionCookies(res, data.session);
      return {
        user: data.user,
        session: data.session
      };
    }
  }

  clearSessionCookies(res);
  return null;
}

async function attachSession(req, res, next) {
  try {
    const resolved = await resolveSession(req, res);
    req.user = resolved ? resolved.user : null;
    req.session = resolved ? resolved.session : null;
    return next();
  } catch (error) {
    console.error("attachSession failed", error);
    clearSessionCookies(res);
    req.user = null;
    req.session = null;
    return next();
  }
}

function requireAuth(req, res, next) {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: "Sign in required." });
  }
  return next();
}

module.exports = {
  sanitizeUser,
  setSessionCookies,
  clearSessionCookies,
  attachSession,
  requireAuth
};
