import { PrivacyProvider } from "./components/Privacy";
import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import "./styles.css";
import { initializeTheme } from "./components/ThemeToggle";
initializeTheme();
const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
});
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <PrivacyProvider>
          <App />
        </PrivacyProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
