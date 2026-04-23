import { ADMIN_STORAGE_KEYS } from "../constants";

function safeParseJson(rawValue, fallback = null) {
  try {
    return rawValue ? JSON.parse(rawValue) : fallback;
  } catch {
    return fallback;
  }
}

export function readAdminSnapshot() {
  if (typeof window === "undefined") {
    return {
      isLoggedIn: false,
      sessionToken: "",
      user: null,
    };
  }

  const raw = window.localStorage.getItem(ADMIN_STORAGE_KEYS.user);
  const user = safeParseJson(raw, null);

  const sessionToken = window.localStorage.getItem(ADMIN_STORAGE_KEYS.session) || "";
  if (!sessionToken && raw) {
    window.localStorage.removeItem(ADMIN_STORAGE_KEYS.user);
  }

  return {
    isLoggedIn: Boolean(sessionToken),
    sessionToken,
    user,
  };
}

export function storeAdminSession({ user, sessionToken }) {
  if (typeof window === "undefined") {
    return;
  }

  if (user) {
    window.localStorage.setItem(ADMIN_STORAGE_KEYS.user, JSON.stringify(user));
  }
  if (sessionToken) {
    window.localStorage.setItem(ADMIN_STORAGE_KEYS.session, sessionToken);
  }
}

export function clearAdminSession() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(ADMIN_STORAGE_KEYS.user);
  window.localStorage.removeItem(ADMIN_STORAGE_KEYS.session);
}
