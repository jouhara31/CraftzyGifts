import { useContext } from "react";
import { DialogContext } from "../components/dialogContext";

export const useDialog = () => useContext(DialogContext);
