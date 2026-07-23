import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { RiskLookupPage } from "./RiskLookupPage";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RiskLookupPage />
  </StrictMode>,
);
