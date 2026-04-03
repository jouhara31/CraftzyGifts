import { API_URL } from "../apiBase";

const TOKEN_KEY = "token";
const REFRESH_TOKEN_KEY = "refresh_token";
const USER_KEY = "user";
const USER_PROFILE_IMAGE_KEY = "user_profile_image";
const AUTH_RETRY_HEADER = "X-Auth-Retry";
const SESSION_MARKER = "cookie-session";
const REFRESH_SESSION_MARKER = "refresh-cookie-session";

let refreshPromise = null;
let nativeFetchRef = null;
let fetchInterceptorInstalled = false;

const hasWindow = () => typeof window !== "undefined";

export const readStoredProfileImage = () => {
  if (!hasWindow()) return "";
  try {
    return localStorage.getItem(USER_PROFILE_IMAGE_KEY) || "";
  } catch {
    return "";
  }
};

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

const isApiRequest = (url) => Boolean(url) && url.startsWith(`${API_URL}/api`);

const isRetriableApiRequest = (url) =>
  isApiRequest(url) &&
  !/\/api\/auth\/(login|register|refresh|logout|session)\b/i.test(url);

export const readStoredUser = () => {
  if (!hasWindow()) return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.profileImage) {
      const fallbackImage = readStoredProfileImage();
      if (fallbackImage) {
        parsed.profileImage = fallbackImage;
      }
    }
    return parsed;
  } catch {
    return null;
  }
};

export const persistStoredUser = (nextUser, { dispatch = true } = {}) => {
  if (!hasWindow() || !nextUser || typeof nextUser !== "object") return;

  const profileImage = typeof nextUser.profileImage === "string" ? nextUser.profileImage : "";

  try {
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    if (profileImage) {
      localStorage.setItem(USER_PROFILE_IMAGE_KEY, profileImage);
    } else {
      localStorage.removeItem(USER_PROFILE_IMAGE_KEY);
    }
  } catch {
    try {
      const { profileImage: _profileImage, ...rest } = nextUser;
      localStorage.setItem(USER_KEY, JSON.stringify(rest));
      if (profileImage) {
        localStorage.setItem(USER_PROFILE_IMAGE_KEY, profileImage);
      } else {
        localStorage.removeItem(USER_PROFILE_IMAGE_KEY);
      }
    } catch {
      return;
    }
  }

  if (dispatch) {
    window.dispatchEvent(new Event("user:updated"));
  }
};

export const readStoredUserId = () => {
  const user = readStoredUser();
  return String(user?.id || user?._id || "").trim();
};

const persistSessionMarkers = () => {
  localStorage.setItem(TOKEN_KEY, SESSION_MARKER);
  localStorage.setItem(REFRESH_TOKEN_KEY, REFRESH_SESSION_MARKER);
};

const clearSessionMarkers = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};

const sanitizeManagedHeaders = (headers) => {
  const authHeader = String(headers.get("Authorization") || "").trim();
  if (
    authHeader === `Bearer ${SESSION_MARKER}` ||
    authHeader === `Bearer ${REFRESH_SESSION_MARKER}` ||
    authHeader === "Bearer"
  ) {
    headers.delete("Authorization");
  }

  const refreshHeader = String(headers.get("X-Refresh-Token") || "").trim();
  if (refreshHeader === REFRESH_SESSION_MARKER || refreshHeader === SESSION_MARKER) {
    headers.delete("X-Refresh-Token");
  }
};

const withApiCredentials = (init = {}) => {
  const headers = new Headers(init?.headers || undefined);
  sanitizeManagedHeaders(headers);
  return {
    ...(init || {}),
    headers,
    credentials: "include",
  };
};

export const readAccessToken = () => {
  if (!hasWindow()) return "";
  return String(localStorage.getItem(TOKEN_KEY) || "").trim();
};

export const readRefreshToken = () => {
  if (!hasWindow()) return "";
  return String(localStorage.getItem(REFRESH_TOKEN_KEY) || "").trim();
};

export const hasActiveSession = () => readAccessToken() === SESSION_MARKER;

export const readResponsePayload = async (response) => {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

export const apiFetch = (input, init) => {
  if (typeof globalThis.fetch === "function") {
    return globalThis.fetch(input, init);
  }
  return getNativeFetch()(input, init);
};

export const apiFetchJson = async (input, init) => {
  const response = await apiFetch(input, init);
  const data = await readResponsePayload(response);
  return { response, data };
};

export const clearAuthSession = ({ dispatch = true } = {}) => {
  if (!hasWindow()) return;
  clearSessionMarkers();
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(USER_PROFILE_IMAGE_KEY);
  if (dispatch) {
    window.dispatchEvent(new Event("user:updated"));
    window.dispatchEvent(new Event("auth:session-cleared"));
  }
};

export const persistAuthSession = ({ user = null } = {}) => {
  if (!hasWindow()) return;

  persistSessionMarkers();

  const normalizedUser =
    user && typeof user === "object"
      ? {
          ...(readStoredUser() || {}),
          ...user,
        }
      : null;

  if (normalizedUser) {
    persistStoredUser(normalizedUser, { dispatch: false });
  }

  window.dispatchEvent(new Event("user:updated"));
  window.dispatchEvent(new Event("auth:token-updated"));
};

export const hydrateAuthSession = async () => {
  if (!hasWindow()) return null;
  try {
    const response = await getNativeFetch()(
      `${API_URL}/api/auth/session`,
      withApiCredentials({
        method: "GET",
      })
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.user) {
      clearAuthSession();
      return null;
    }
    persistAuthSession({ user: data.user });
    return data;
  } catch {
    clearAuthSession();
    return null;
  }
};

export const refreshAccessToken = async () => {
  if (!hasWindow()) return null;
  if (refreshPromise) return refreshPromise;
  if (!readRefreshToken() && !readStoredUser()) return null;

  refreshPromise = (async () => {
    try {
      const response = await getNativeFetch()(
        `${API_URL}/api/auth/refresh`,
        withApiCredentials({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: "{}",
        })
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.user) {
        clearAuthSession();
        return null;
      }

      persistAuthSession({
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
  try {
    await getNativeFetch()(
      `${API_URL}/api/auth/logout`,
      withApiCredentials({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "{}",
      })
    );
  } catch {
    // Ignore logout transport errors and clear the local session anyway.
  } finally {
    clearAuthSession();
  }
};

const buildRetriedInit = (input, init) => {
  const headers = new Headers(init?.headers || undefined);
  headers.set(AUTH_RETRY_HEADER, "1");
  sanitizeManagedHeaders(headers);

  if (typeof input === "string" || input instanceof URL) {
    return {
      ...(init || {}),
      headers,
      credentials: "include",
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
    const url = resolveRequestUrl(input);
    const managedInit = isApiRequest(url) ? withApiCredentials(init) : init;
    const response = await nativeFetchRef(input, managedInit);
    const hasRetried =
      new Headers(managedInit?.headers || undefined).get(AUTH_RETRY_HEADER) === "1";

    if (
      response.status !== 401 ||
      hasRetried ||
      !isRetriableApiRequest(url) ||
      !(typeof input === "string" || input instanceof URL)
    ) {
      return response;
    }

    const refreshed = await refreshAccessToken();
    if (!refreshed?.user) {
      return response;
    }

    const retriedInit = buildRetriedInit(input, managedInit);
    if (!retriedInit) {
      return response;
    }

    return nativeFetchRef(input, retriedInit);
  };

  fetchInterceptorInstalled = true;
};
