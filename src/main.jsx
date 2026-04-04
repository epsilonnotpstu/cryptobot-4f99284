import React from "react";
import ReactDOM from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import App from "./App";
import "./styles.css";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const isNativeRuntime =
  typeof window !== "undefined" &&
  Boolean(window.Capacitor) &&
  (window.Capacitor?.isNativePlatform?.() ?? false);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {!isNativeRuntime && GOOGLE_CLIENT_ID ? (
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <App />
      </GoogleOAuthProvider>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
