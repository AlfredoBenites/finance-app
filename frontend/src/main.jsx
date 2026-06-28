import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";
import { PrivacyProvider } from "./privacy/PrivacyContext.jsx";
import "@fontsource-variable/inter";
import "./index.css";
import "./legacy.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <PrivacyProvider>
          <App />
        </PrivacyProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
