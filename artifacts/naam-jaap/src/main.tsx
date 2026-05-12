import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Suppress AbortError from TanStack Query's internal request cancellation.
// These are not real errors — they fire whenever a refetch cancels the
// previous in-flight request (happens frequently with short refetchInterval).
window.addEventListener("unhandledrejection", (event) => {
  const err = event.reason;
  if (err instanceof Error && (err.name === "AbortError" || err.message === "signal is aborted without reason")) {
    event.preventDefault();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
