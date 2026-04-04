import { useCallback, useEffect, useState } from "react";
import { API_URL } from "../apiBase";
import {
  DEFAULT_PLATFORM_SETTINGS,
  PlatformContext,
} from "./platformContext";

const normalizePlatformSettings = (value = {}) => ({
  platformName:
    String(value?.platformName || DEFAULT_PLATFORM_SETTINGS.platformName).trim() ||
    DEFAULT_PLATFORM_SETTINGS.platformName,
  currencyCode:
    String(value?.currencyCode || DEFAULT_PLATFORM_SETTINGS.currencyCode)
      .trim()
      .toUpperCase() || DEFAULT_PLATFORM_SETTINGS.currencyCode,
  maintenanceMode: Boolean(value?.maintenanceMode),
  updatedAt: value?.updatedAt || null,
});

export function PlatformProvider({ children }) {
  const [platform, setPlatform] = useState(DEFAULT_PLATFORM_SETTINGS);
  const [loading, setLoading] = useState(true);

  const refreshPlatformSettings = useCallback(async () => {
    const response = await fetch(`${API_URL}/api/platform/settings`, {
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.message || "Unable to load platform settings.");
    }
    const normalized = normalizePlatformSettings(data);
    setPlatform(normalized);
    return normalized;
  }, []);

  useEffect(() => {
    let active = true;

    const loadSettings = async () => {
      setLoading(true);
      try {
        const response = await fetch(`${API_URL}/api/platform/settings`, {
          cache: "no-store",
        });
        const data = await response.json().catch(() => ({}));
        if (!active) return;
        if (response.ok) {
          setPlatform(normalizePlatformSettings(data));
        }
      } catch {
        if (!active) return;
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    const handlePlatformUpdate = (event) => {
      const nextSettings = event?.detail;
      if (nextSettings && typeof nextSettings === "object") {
        setPlatform((current) =>
          normalizePlatformSettings({
            ...current,
            ...nextSettings,
          })
        );
        return;
      }
      loadSettings().catch(() => null);
    };

    loadSettings().catch(() => null);
    window.addEventListener("platform:settings-updated", handlePlatformUpdate);

    return () => {
      active = false;
      window.removeEventListener("platform:settings-updated", handlePlatformUpdate);
    };
  }, []);

  return (
    <PlatformContext.Provider
      value={{
        ...platform,
        loading,
        refreshPlatformSettings,
      }}
    >
      {children}
    </PlatformContext.Provider>
  );
}
