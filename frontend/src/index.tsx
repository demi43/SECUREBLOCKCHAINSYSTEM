import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { Toaster } from "./components/ui/sonner";
import "./styles/globals.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  document.body.innerHTML = `
    <div style="padding: 2rem; font-family: sans-serif; color: red;">
      <h1>Error: Root element not found</h1>
      <p>Could not find element with id "root"</p>
    </div>
  `;
  throw new Error("Failed to find the root element");
}

const root = createRoot(rootElement);

// Add error boundary for better error handling
try {
  root.render(
    <StrictMode>
      <App />
      <Toaster />
    </StrictMode>
  );
} catch (error) {
  console.error("Error rendering app:", error);
  rootElement.innerHTML = `
    <div style="padding: 2rem; font-family: sans-serif; color: red; background: #1a1a1a; min-height: 100vh;">
      <h1>Error Loading Application</h1>
      <p>${error instanceof Error ? error.message : String(error)}</p>
      <p>Please check the browser console (F12) for more details.</p>
      <pre style="background: #2a2a2a; padding: 1rem; border-radius: 4px; margin-top: 1rem; overflow: auto; color: #fff;">
${error instanceof Error ? error.stack : String(error)}
      </pre>
    </div>
  `;
}

// Add global error handler
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

