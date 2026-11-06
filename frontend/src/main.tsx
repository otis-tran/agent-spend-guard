import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { NearProvider } from "near-connect-hooks";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <NearProvider config={{ network: "testnet" }}>
      <App />
    </NearProvider>
  </StrictMode>,
);
