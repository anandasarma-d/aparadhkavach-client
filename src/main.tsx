import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { DeployPathCheck } from "./DeployPathCheck";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DeployPathCheck />
  </StrictMode>,
);
