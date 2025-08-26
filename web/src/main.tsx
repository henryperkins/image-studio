import { createRoot } from "react-dom/client";
import App from "./ui/App";
import { ToastProvider } from "./contexts/ToastContext";
import "./index.css";

// Apply dark mode by default
document.documentElement.classList.add('dark');

createRoot(document.getElementById("root")!).render(
  <ToastProvider>
    <App />
  </ToastProvider>
);