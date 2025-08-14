import { createRoot } from "react-dom/client";
import App from "./ui/App";
import { ToastProvider } from "./contexts/ToastContext";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <ToastProvider>
    <App />
  </ToastProvider>
);