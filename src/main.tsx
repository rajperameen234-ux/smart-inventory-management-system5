import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import AuthRouter from "./AuthRouter";
import { CurrencyProvider } from "./components/CurrencyProvider";
import { ToastProvider } from "./components/Toast";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <CurrencyProvider>
        <AuthRouter />
      </CurrencyProvider>
    </ToastProvider>
  </StrictMode>
);
