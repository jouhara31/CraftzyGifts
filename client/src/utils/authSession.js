import { API_URL } from "../apiBase";

const TOKEN_KEY = "token";
const REFRESH_TOKEN_KEY = "refresh_token";
const USER_KEY = "user";
const USER_PROFILE_IMAGE_KEY = "user_profile_image";
const AUTH_RETRY_HEADER = "X-Auth-Retry";

let refreshPromise = null;
let nativeFetchRef = null;
let fetchInterceptorInstalled = false;

const hasWindow = () => typeof window !== "undefined";

const getNativeFetch = () => {
  if (nativeFetchRef) return nativeFetchRef;
  if (typeof globalThis.fetch === "function") {
    nativeFetchRef = globalThis.fetch.bind(globalThis);
    return nativeFetchRef;
  }
  throw new Error("Fetch API is unavailable in this environment.");
};

const resolveRequestUrl = (input) => {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return String(input?.url || "");
};

const isManagedApiRequest = (url) =>
  Boolean(url) &&
  url.startsWith(`${API_URL}/api`) &&
  !/\/api\/auth\/(login|register|refresh|logout)\b/i.test(url);

const readStoredUser = () => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

export const readAccessToken = () => {
  if (!hasWindow()) return "";
  return String(localStorage.getItem(TOKEN_KEY) || "").trim();
};

export const readRefreshToken = () => {
  if (!hasWindow()) return "";
  return String(localStorage.getItem(REFRESH_TOKEN_KEY) || "").trim();
};

export const clearAuthSession = ({ dispatch = true } = {}) => {
  if (!hasWindow()) return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(USER_PROFILE_IMAGE_KEY);
  if (dispatch) {
    window.dispatchEvent(new Event("user:updated"));
    window.dispatchEvent(new Event("auth:session-cleared"));
  }
};

export const persistAuthSession = ({
  token = "",
  refreshToken = "",
  user = null,
} = {}) => {
  if (!hasWindow()) return;

  const normalizedToken = String(token || "").trim();
  const normalizedRefreshToken = String(refreshToken || "").trim();
  if (normalizedToken) {
    localStorage.setItem(TOKEN_KEY, normalizedToken);
  }
  if (normalizedRefreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, normalizedRefreshToken);
  }

  const normalizedUser =
    user && typeof user === "object"
      ? {
          ...(readStoredUser() || {}),
          ...user,
        }
      : null;

  if (normalizedUser) {
    localStorage.setItem(USER_KEY, JSON.stringify(normalizedUser));
    if (typeof normalizedUser.profileImage === "string" && normalizedUser.profileImage) {
      localStorage.setItem(USER_PROFILE_IMAGE_KEY, normalizedUser.profileImage);
    } else {
      localStorage.removeItem(USER_PROFILE_IMAGE_KEY);
    }
  }

  window.dispatchEvent(new Event("user:updated"));
  window.dispatchEvent(new Event("auth:token-updated"));
};

export const refreshAccessToken = async () => {
  if (!hasWindow()) return null;
  if (refreshPromise) return refreshPromise;

  const refreshToken = readRefreshToken();
  if (!refreshToken) return null;

  refreshPromise = (async () => {
    try {
      const res = await getNativeFetch()(`${API_URL}/api/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refreshToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.token) {
        clearAuthSession();
        return null;
      }

      persistAuthSession({
        token: data.token,
        refreshToken: data.refreshToken,
        user: data.user,
      });
      return data;
    } catch {
      clearAuthSession();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

export const logoutSession = async () => {
  const refreshToken = readRefreshToken();
  try {
    if (refreshToken) {
      await getNativeFetch()(`${API_URL}/api/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refreshToken }),
      });
    }
  } catch {
    // Ignore logout transport errors and clear the local session anyway.
  } finally {
    clearAuthSession();
  }
};

const buildRetriedInit = (input, init, token) => {
  const headers = new Headers(init?.headers || undefined);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set(AUTH_RETRY_HEADER, "1");

  if (typeof input === "string" || input instanceof URL) {
    return {
      ...(init || {}),
      headers,
    };
  }

  return null;
};

export const installAuthFetchInterceptor = () => {
  if (!hasWindow() || fetchInterceptorInstalled || typeof window.fetch !== "function") {
    return;
  }

  nativeFetchRef = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const response = await nativeFetchRef(input, init);
    const url = resolveRequestUrl(input);
    const hasRetried = new Headers(init?.headers || undefined).get(AUTH_RETRY_HEADER) === "1";

    if (
      response.status !== 401 ||
      hasRetried ||
      !isManagedApiRequest(url) ||
      !readRefreshToken() ||
      !(typeof input === "string" || input instanceof URL)
    ) {
      return response;
    }

    const refreshed = await refreshAccessToken();
    if (!refreshed?.token) {
      return response;
    }

    const retriedInit = buildRetriedInit(input, init, refreshed.token);
    if (!retriedInit) {
      return response;
    }

    return nativeFetchRef(input, retriedInit);
  };

  fetchInterceptorInstalled = true;
};
