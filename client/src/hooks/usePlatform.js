import { useContext } from "react";
import { PlatformContext } from "../components/platformContext";

export const usePlatform = () => useContext(PlatformContext);
