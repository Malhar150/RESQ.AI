import { lazy, Suspense } from "react";
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { IS_DEMO } from "./lib/api";
import { I18nProvider } from "./i18n";
import { ToastProvider } from "./components/Toast";
import { ServerProvider } from "./lib/server";
import CitizenLayout from "./citizen/CitizenLayout";
import ReportScreen from "./citizen/ReportScreen";
import ResultScreen from "./citizen/ResultScreen";
import OutboxScreen from "./citizen/OutboxScreen";
import MineScreen from "./citizen/MineScreen";

// The control room pulls in the map library; citizens never download it.
const ControlRoom = lazy(() => import("./control/ControlRoom"));
// The QR encoder/scanner is only needed on the Relay screen. The service worker
// still precaches it, so it opens offline.
const RelayScreen = lazy(() => import("./citizen/RelayScreen"));
const DemoBar = import.meta.env.VITE_DEMO === "1" ? lazy(() => import("./demo/DemoBar")) : null;

// Inside Claude the page address can't change, so the demo keeps its routes after "#".
const Router = IS_DEMO ? HashRouter : BrowserRouter;
if (IS_DEMO) document.documentElement.classList.add("is-demo");

function Loading() {
  return <div style={{ display: "grid", placeItems: "center", height: "100dvh", background: "#0E1116", color: "#8A96A6" }}><span className="spinner" /></div>;
}

export default function App() {
  return (
    <I18nProvider>
      <ToastProvider>
        <ServerProvider>
          <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            {DemoBar && <Suspense fallback={null}><DemoBar /></Suspense>}
            <Routes>
              <Route element={<CitizenLayout />}>
                <Route index element={<ReportScreen />} />
                <Route path="sent" element={<ResultScreen />} />
                <Route path="outbox" element={<OutboxScreen />} />
                <Route path="relay" element={<Suspense fallback={<div style={{ padding: 40, textAlign: "center" }}><span className="spinner" /></div>}><RelayScreen /></Suspense>} />
                <Route path="mine" element={<MineScreen />} />
              </Route>
              <Route path="control/*" element={<Suspense fallback={<Loading />}><ControlRoom /></Suspense>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Router>
        </ServerProvider>
      </ToastProvider>
    </I18nProvider>
  );
}
