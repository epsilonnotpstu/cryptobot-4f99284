import { ADMIN_STORAGE_KEYS } from "../constants";

export function readAdminSnapshot() {
  if (typeof window === "undefined") {
    return {
      isLoggedIn: false,
      sessionToken: "",
      user: null,
    };
  }

  let user = null;
  try {
    const raw = window.localStorage.getItem(ADMIN_STORAGE_KEYS.user);
    user = raw ? JSON.parse(raw) : null;
  } catch {
    user = null;
  }

  const sessionToken = window.localStorage.getItem(ADMIN_STORAGE_KEYS.session) || "";
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
