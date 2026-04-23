import { useMemo, useState } from "react";
import { ADMIN_SECTION_META } from "../constants";
import AdminSectionIntro from "./AdminSectionIntro";

export default function AdminAuthPage({
  mode,
  onModeChange,
  onLogin,
  onSignup,
  onBackHome,
  onOpenUserAuth,
  submitting,
  error,
  notice,
}) {
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [signupForm, setSignupForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
  });
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);

  const heading = useMemo(() => {
    if (mode === "signup") {
      return {
        title: "Admin Sign Up",
        subtitle: "Create your admin account with name, email, phone, and password.",
      };
    }
    return {
      title: "Admin Login",
      subtitle: "Login with admin email and password to access dashboard.",
    };
  }, [mode]);

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    await onLogin(loginForm);
  };

  const handleSignupSubmit = async (event) => {
    event.preventDefault();
    await onSignup(signupForm);
  };

  return (
    <main className="adminx-auth-shell">
      <div className="adminx-auth-glow adminx-auth-glow-left" />
      <div className="adminx-auth-glow adminx-auth-glow-right" />

      <header className="adminx-auth-topbar">
        <button type="button" className="adminx-brand" onClick={onBackHome}>
          <span className="adminx-brand-icon">
            <i className="fas fa-bolt" />
          </span>
          <span>
            CryptoBot
            <small>Admin Platform</small>
          </span>
        </button>

        <div className="adminx-auth-topbar-actions">
          <button type="button" className="btn btn-ghost" onClick={onOpenUserAuth}>
            User Auth
          </button>
          <button type="button" className="btn btn-ghost" onClick={onBackHome}>
            Back to Home
          </button>
        </div>
      </header>

      <section className="adminx-auth-card">
        <AdminSectionIntro
          icon={ADMIN_SECTION_META.dashboard.icon}
          title="Secure Admin Access"
          description="Only authorized admins can access this control plane. Session actions are recorded and auditable."
          stats={[
            { label: "Role", value: "Admin / Super Admin" },
            { label: "Security", value: "Session Protected" },
            { label: "Scope", value: "Full Platform Control" },
          ]}
        />

        <div className="adminx-auth-tab-row">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => onModeChange("login")}>
            Login
          </button>
          <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => onModeChange("signup")}>
            Sign Up
          </button>
        </div>

        <h1>{heading.title}</h1>
        <p>{heading.subtitle}</p>

        {mode === "login" ? (
          <form className="adminx-auth-form" onSubmit={handleLoginSubmit}>
            <label>
              Email
              <input
                type="email"
                value={loginForm.email}
                onChange={(event) => setLoginForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="admin@cryptobot.com"
                required
              />
            </label>

            <label>
              Password
              <div className="adminx-password-field">
                <input
                  type={showLoginPassword ? "text" : "password"}
                  value={loginForm.password}
                  onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))}
                  placeholder="Enter password"
                  required
                />
                <button
                  type="button"
                  className="adminx-password-toggle"
                  onClick={() => setShowLoginPassword((prev) => !prev)}
                  aria-label={showLoginPassword ? "Hide password" : "Show password"}
                >
                  <i className={`fas ${showLoginPassword ? "fa-eye-slash" : "fa-eye"}`} />
                </button>
              </div>
            </label>

            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Logging in..." : "Login to Dashboard"}
            </button>
          </form>
        ) : (
          <form className="adminx-auth-form" onSubmit={handleSignupSubmit}>
            <label>
              Full Name
              <input
                type="text"
                value={signupForm.name}
                onChange={(event) => setSignupForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Super Admin"
                required
              />
            </label>

            <label>
              Email
              <input
                type="email"
                value={signupForm.email}
                onChange={(event) => setSignupForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="admin@cryptobot.com"
                required
              />
            </label>

            <label>
              Phone Number
              <input
                type="tel"
                value={signupForm.phone}
                onChange={(event) => setSignupForm((prev) => ({ ...prev, phone: event.target.value }))}
                placeholder="+8801XXXXXXXXX"
                required
              />
            </label>

            <label>
              Password
              <div className="adminx-password-field">
                <input
                  type={showSignupPassword ? "text" : "password"}
                  value={signupForm.password}
                  onChange={(event) => setSignupForm((prev) => ({ ...prev, password: event.target.value }))}
                  placeholder="Create password"
                  required
                />
                <button
                  type="button"
                  className="adminx-password-toggle"
                  onClick={() => setShowSignupPassword((prev) => !prev)}
                  aria-label={showSignupPassword ? "Hide password" : "Show password"}
                >
                  <i className={`fas ${showSignupPassword ? "fa-eye-slash" : "fa-eye"}`} />
                </button>
              </div>
            </label>

            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Creating account..." : "Create Admin Account"}
            </button>
          </form>
        )}

        {notice ? <p className="adminx-auth-notice">{notice}</p> : null}
        {error ? <p className="adminx-auth-error">{error}</p> : null}
        <ul className="adminx-auth-highlights">
          <li>
            <i className="fas fa-shield-halved" /> All admin actions stay within secure session scope.
          </li>
          <li>
            <i className="fas fa-clock-rotate-left" /> Review and moderation changes are traceable in audit logs.
          </li>
          <li>
            <i className="fas fa-circle-check" /> Use strong passwords and unique admin emails for safety.
          </li>
        </ul>
      </section>
    </main>
  );
}
