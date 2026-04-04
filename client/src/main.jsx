import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { PlatformProvider } from "./components/PlatformProvider";
import "./index.css";
import { hydrateAuthSession, installAuthFetchInterceptor } from "./utils/authSession";

installAuthFetchInterceptor();

const root = ReactDOM.createRoot(document.getElementById("root"));

const renderApp = () => {
  root.render(
    <React.StrictMode>
      <PlatformProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </PlatformProvider>
    </React.StrictMode>
  );
};

const scheduleSessionHydration = () => {
  hydrateAuthSession().catch(() => null);
};

renderApp();

if (typeof window !== "undefined" && "requestIdleCallback" in window) {
  window.requestIdleCallback(() => {
    scheduleSessionHydration();
  });
} else {
  window.setTimeout(() => {
    scheduleSessionHydration();
  }, 60);
}
