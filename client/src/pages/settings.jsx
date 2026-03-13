import { Link } from "react-router-dom";
import Header from "../components/Header";

const SETTINGS_LINKS = [
  { label: "Privacy Policy", path: "/privacy" },
  { label: "Terms of Service", path: "/terms" },
  { label: "Return Policy", path: "/return-policy" },
  { label: "Shipping Policy", path: "/shipping-policy" },
];

export default function Settings() {
  return (
    <div className="page settings-page">
      <Header />
      <div className="settings-topbar">
        <Link className="settings-topbar-back" to="/profile" aria-label="Back to profile">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14.5 6.5 9 12l5.5 5.5" />
          </svg>
        </Link>
        <h1 className="settings-topbar-title">Settings</h1>
      </div>
      <section className="settings-shell">
        <div className="settings-list">
          {SETTINGS_LINKS.map((item) => (
            <Link key={item.path} className="settings-link" to={item.path}>
              <span>{item.label}</span>
              <span className="settings-link-arrow" aria-hidden="true">
                ›
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
