import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { StartupPreview } from "./startup-preview.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <StartupPreview><App /></StartupPreview>
  </React.StrictMode>,
);
