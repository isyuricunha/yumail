import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@yumail/ui/styles.css";
import "./styles.css";
import { App } from "./App";
import { purgeLegacyBrowserStorage } from "./services/legacy-browser-storage-cleanup";

const root = document.getElementById("root");

if (!root) {
  throw new Error("YuMail root element was not found.");
}

purgeLegacyBrowserStorage();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
