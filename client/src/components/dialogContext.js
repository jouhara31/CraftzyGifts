import { createContext } from "react";

export const DialogContext = createContext({
  showAlert: async () => true,
  showConfirm: async () => false,
});
