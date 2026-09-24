import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { isNativeApp } from "./lib/platform";
// Fonts are bundled, not fetched from Google, so the app looks right with no
// network and the service worker can precache them. Only the scripts we use:
// Latin, Devanagari (Hindi) and Bengali (Assamese + Bengali).
import "@fontsource/sora/latin-600.css";
import "@fontsource/sora/latin-700.css";
import "@fontsource/hind/latin-400.css";
import "@fontsource/hind/latin-500.css";
import "@fontsource/hind/latin-600.css";
import "@fontsource/hind/devanagari-400.css";
import "@fontsource/hind/devanagari-500.css";
import "@fontsource/hind/devanagari-600.css";
import "@fontsource/hind-siliguri/latin-400.css";
import "@fontsource/hind-siliguri/latin-500.css";
import "@fontsource/hind-siliguri/latin-600.css";
import "@fontsource/hind-siliguri/bengali-400.css";
import "@fontsource/hind-siliguri/bengali-500.css";
import "@fontsource/hind-siliguri/bengali-600.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "./styles/base.css";

// The service worker caches the app shell so the mobile website opens with no
// network at all. Inside the native app the files are already on the phone,
// so it's skipped there.
if ("serviceWorker" in navigator && import.meta.env.PROD && !isNativeApp() && import.meta.env.VITE_DEMO !== "1") {
  registerSW({ immediate: true });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
