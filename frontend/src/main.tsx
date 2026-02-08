import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";
import api from "./api/client";

// --- GHOST MODE DETECTION ---
const hostname = window.location.hostname;
const pathname = window.location.pathname;
const searchParams = new URLSearchParams(window.location.search);

// 1. Subdomain: rp.smartvahan.net
// 2. Path: /rp or /ghost (e.g. smartvahan.net/rp)
// 3. Query Param: ?ghost=true (for testing)
const isGhost = 
  hostname.startsWith("rp.") || 
  pathname.startsWith("/rp") || 
  pathname.startsWith("/ghost") || 
  searchParams.get("ghost") === "true";

if (isGhost) {
  // Set Ghost Mode
  localStorage.setItem("isGhostMode", "true");
  
  // Visuals
  document.title = "GHOST DASHBOARD - SmartVahan";
  document.documentElement.style.setProperty("--primary", "220 38 38"); // Red-600
} else {
  // Clear if explicitly disabled OR if not on any ghost entry point
  // We check strict conditions to allow "sticky" behavior if needed, 
  // but for path-based, we usually want it to match the path.
  // If user leaves /rp to go to /, they likely want main dashboard.
  if (searchParams.get("ghost") !== "true") {
     localStorage.removeItem("isGhostMode");
  }
}

// Handle QR Code Legacy URL Redirection
// Pattern: /{STATE}/{OEM}/{PRODUCT}/qr={VALUE}
// We redirect this to /#/verify?url={FULL_URL} so HashRouter can handle it
const path = window.location.pathname;
if (path.includes("/qr=") && !path.includes("/verify")) {
  const fullUrl = window.location.href;
  // Redirect to base path with hash
  window.location.replace(`/#/verify?url=${encodeURIComponent(fullUrl)}`);
}

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(result[3], 16)}`
    : "79 70 229";
}

function applyVisuals(data: any) {
  // If Ghost Mode, OVERRIDE Primary Color to Red/Dark
  if (localStorage.getItem("isGhostMode") === "true") {
      document.documentElement.style.setProperty("--primary", "220 38 38"); // Red-600
      return;
  }

  if (data?.primaryColor) {
    document.documentElement.style.setProperty("--primary", hexToRgb(data.primaryColor));
  }
  if (data?.systemLogo) {
    const existing = document.querySelector("link[rel*='icon']") as HTMLLinkElement | null;
    const link = existing || (document.createElement("link") as HTMLLinkElement);
    link.type = "image/x-icon";
    link.rel = "shortcut icon";
    link.href = data.systemLogo;
    document.getElementsByTagName("head")[0].appendChild(link);
  }
}

async function bootstrapBranding() {
  try {
    const saved = localStorage.getItem("sv_settings");
    if (saved) {
      const parsed = JSON.parse(saved);
      applyVisuals(parsed);
    }
  } catch (e) {
    console.error("Failed to parse saved settings", e);
  }

  try {
    const res = await api.get("/settings");
    const remote = res.data;
    try {
      const existing = JSON.parse(localStorage.getItem("sv_settings") || "{}");
      const merged = { ...existing, ...remote };
      localStorage.setItem("sv_settings", JSON.stringify(merged));
      applyVisuals(merged);
    } catch {
      localStorage.setItem("sv_settings", JSON.stringify(remote));
      applyVisuals(remote);
    }
  } catch (e) {
    console.error("Failed to load remote settings", e);
  }
}

bootstrapBranding();

const queryClient = new QueryClient();

import { ErrorBoundary } from "./ui/ErrorBoundary";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <App />
        </HashRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
