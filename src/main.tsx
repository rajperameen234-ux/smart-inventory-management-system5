import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import AuthRouter from "./AuthRouter";
import { ToastProvider } from "./components/Toast";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <AuthRouter />
    </ToastProvider>
  </StrictMode>
);