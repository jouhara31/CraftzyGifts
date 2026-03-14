import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import logoPng from "../assets/logo.png";

const ADMIN_NAV_ITEMS = [
  { label: "Dashboard", path: "/admin/dashboard" },
  { label: "Orders", path: "/admin/orders" },
  { label: "Products", path: "/admin/products" },
  { label: "Categories", path: "/admin/categories" },
  { label: "Customers", path: "/admin/customers" },
  { label: "Inventory", path: "/admin/inventory" },
  { label: "Analytics", path: "/admin/analytics" },
  { label: "Settings", path: "/admin/settings" },
  { label: "Account", path: "/admin/account" },
];

function AdminNavIcon({ path }) {
  if (path === "/admin/dashboard") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.4" />
        <rect x="13.5" y="3.5" width="7" height="5.2" rx="1.4" />
        <rect x="13.5" y="11.3" width="7" height="9.2" rx="1.4" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.4" />
      </svg>
    );
  }

  if (path === "/admin/orders") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 3.5h8l3.5 3.5v13H4.5v-16z" />
        <path d="M8 3.5V7h11.5" />
        <path d="M8.5 11.2h7.2M8.5 15.2h5.2" />
      </svg>
    );
  }

  if (path === "/admin/products") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.5 7.7 12 3.5l8.5 4.2L12 12z" />
        <path d="M3.5 7.7V16.3L12 20.5l8.5-4.2V7.7" />
        <path d="M12 12v8.5" />
      </svg>
    );
  }

  if (path === "/admin/customers") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="9" cy="8.2" r="3.1" />
        <path d="M3.5 19a5.6 5.6 0 0 1 11.2 0" />
        <circle cx="17.1" cy="9.2" r="2.3" />
        <path d="M14.2 19a4.5 4.5 0 0 1 5.8-4.2A4.4 4.4 0 0 1 21 19" />
      </svg>
    );
  }

  if (path === "/admin/categories") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 6.5h15" />
        <path d="M4.5 12h15" />
        <path d="M4.5 17.5h15" />
        <circle cx="7.5" cy="6.5" r="1.2" />
        <circle cx="12" cy="12" r="1.2" />
        <circle cx="16.5" cy="17.5" r="1.2" />
      </svg>
    );
  }

  if (path === "/admin/inventory") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6.2h16v4.4H4zM5.8 12.3h12.4v4.2H5.8zM7.4 18h9.2v2.5H7.4z" />
      </svg>
    );
  }

  if (path === "/admin/analytics") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.5 20.5h17" />
        <path d="M6.5 18.8v-7.1M11.8 18.8V8M17.1 18.8v-4.3" />
      </svg>
    );
  }

  if (path === "/admin/settings") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="2.8" />
        <path d="M19.5 13.3v-2.6l-1.9-.5a5.9 5.9 0 0 0-.5-1.3l1-1.7-1.8-1.8-1.7 1a5.9 5.9 0 0 0-1.3-.5l-.5-1.9h-2.6l-.5 1.9a5.9 5.9 0 0 0-1.3.5l-1.7-1-1.8 1.8 1 1.7a5.9 5.9 0 0 0-.5 1.3l-1.9.5v2.6l1.9.5a5.9 5.9 0 0 0 .5 1.3l-1 1.7 1.8 1.8 1.7-1a5.9 5.9 0 0 0 1.3.5l.5 1.9h2.6l.5-1.9a5.9 5.9 0 0 0 1.3-.5l1.7 1 1.8-1.8-1-1.7a5.9 5.9 0 0 0 .5-1.3z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8.1" r="3.1" />
      <path d="M5.2 19a6.9 6.9 0 0 1 13.6 0" />
    </svg>
  );
}

export default function AdminSidebarLayout({
  title,
  description,
  actions,
  titleActions,
  pageClassName = "",
  children,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pageClasses = ["page seller-page admin-page", pageClassName]
    .filter(Boolean)
    .join(" ");

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("user_profile_image");
    window.dispatchEvent(new Event("user:updated"));
    navigate("/login");
  };

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className={pageClasses}>
      <div className="admin-classic-top">
        <button
          className="admin-menu-btn"
          type="button"
          aria-label={sidebarOpen ? "Close menu" : "Open menu"}
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen((prev) => !prev)}
        >
          <span />
          <span />
          <span />
        </button>
        <Link className="admin-classic-brand" to="/admin/dashboard">
          <span className="admin-classic-logo">
            <img src={logoPng} alt="CraftzyGifts" />
          </span>
          <span className="admin-classic-brand-copy">
            <strong>CraftzyGifts</strong>
            <small>Administration Panel</small>
          </span>
        </Link>
        <div className="admin-classic-actions">
          <Link className="admin-text-action" to="/">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14 5h5v5" />
              <path d="M10 14 19 5" />
              <path d="M19 13v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4" />
            </svg>
            <span className="admin-view-site-label admin-view-site-desktop">Home</span>
            <span className="admin-view-site-label admin-view-site-mobile">Home</span>
          </Link>
        </div>
      </div>

      <div className={`admin-shell ${sidebarOpen ? "sidebar-open" : ""}`.trim()}>
        <button
          type="button"
          className={`admin-shell-backdrop ${sidebarOpen ? "show" : ""}`.trim()}
          aria-hidden={!sidebarOpen}
          tabIndex={sidebarOpen ? 0 : -1}
          onClick={() => setSidebarOpen(false)}
        />
        <aside className={`admin-shell-sidebar ${sidebarOpen ? "open" : ""}`.trim()}>
          <div className="admin-sidebar-mobile-head">
            <span>Menu</span>
            <button
              type="button"
              className="admin-sidebar-close"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close menu"
            >
              ×
            </button>
          </div>
          <p className="admin-shell-kicker">Admin Console</p>
          <h3>Platform Controls</h3>
          <p className="admin-shell-sub">Manage commerce operations from one place.</p>
          <nav className="admin-shell-nav">
            {ADMIN_NAV_ITEMS.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `admin-shell-link ${isActive ? "active" : ""}`.trim()
                }
                onClick={() => setSidebarOpen(false)}
              >
                <span className="admin-shell-link-icon">
                  <AdminNavIcon path={item.path} />
                </span>
                <span>{item.label}</span>
              </NavLink>
            ))}
            <button
              className="admin-shell-link admin-shell-link-logout admin-mobile-only"
              type="button"
              onClick={handleLogout}
            >
              <span className="admin-shell-link-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M14 7V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5a2 2 0 0 0 2-2v-2" />
                  <path d="M10 12h10" />
                  <path d="m17 8 3 4-3 4" />
                </svg>
              </span>
              <span>Logout</span>
            </button>
          </nav>
        </aside>

        <section className="admin-shell-content">
          <div className="section-head admin-shell-head">
            <div className="admin-shell-title">
              <div className="admin-shell-title-row">
                <h2>{title}</h2>
                {titleActions && (
                  <div className="admin-shell-title-actions">{titleActions}</div>
                )}
              </div>
              {description && <p>{description}</p>}
            </div>
            {actions && <div className="seller-toolbar">{actions}</div>}
          </div>
          {children}
        </section>
      </div>

      <nav className="admin-bottom-nav" aria-label="Admin mobile navigation">
        {ADMIN_NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `admin-bottom-link ${isActive ? "active" : ""}`.trim()
            }
            onClick={() => setSidebarOpen(false)}
          >
            <span className="admin-bottom-icon">
              <AdminNavIcon path={item.path} />
            </span>
            <span className="admin-bottom-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
