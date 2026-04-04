import { createContext } from "react";

export const DEFAULT_PLATFORM_SETTINGS = {
  platformName: "CraftzyGifts",
  currencyCode: "INR",
  maintenanceMode: false,
  updatedAt: null,
};

export const PlatformContext = createContext({
  ...DEFAULT_PLATFORM_SETTINGS,
  loading: true,
  refreshPlatformSettings: async () => DEFAULT_PLATFORM_SETTINGS,
});
