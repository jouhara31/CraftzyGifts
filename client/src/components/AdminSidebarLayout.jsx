import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import logoPng from "../assets/logo.png";
import { usePlatform } from "../hooks/usePlatform";
import { logoutSession, readStoredUser } from "../utils/authSession";
import AdminNotificationBell from "./AdminNotificationBell";

const ADMIN_NAV_ITEMS = [
  { label: "Dashboard", path: "/admin/dashboard" },
  { label: "Sellers", path: "/admin/sellers" },
  { label: "Messages", path: "/admin/messages" },
  { label: "Notifications", path: "/admin/notifications" },
  { label: "Orders", path: "/admin/orders" },
  { label: "Products", path: "/admin/products" },
  { label: "Categories", path: "/admin/categories" },
  { label: "Customers", path: "/admin/customers" },
  { label: "Inventory", path: "/admin/inventory" },
  { label: "Analytics", path: "/admin/analytics" },
  { label: "Reports", path: "/admin/reports" },
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

  if (path === "/admin/messages") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 6.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H10l-4 3v-3H5A1.5 1.5 0 0 1 3.5 16V8A1.5 1.5 0 0 1 5 6.5Z" />
        <path d="M8 10h8M8 13.5h5" />
      </svg>
    );
  }

  if (path === "/admin/notifications") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4.2a4.8 4.8 0 0 0-4.8 4.8v2.2c0 1.1-.4 2.2-1.2 3l-1 1.1h13.9l-1-1.1a4.3 4.3 0 0 1-1.2-3V9A4.8 4.8 0 0 0 12 4.2Z" />
        <path d="M9.7 18a2.3 2.3 0 0 0 4.6 0" />
      </svg>
    );
  }

  if (path === "/admin/sellers") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 10h16" />
        <path d="M6 10v8h12v-8" />
        <path d="m6 10 1.8-4h8.4l1.8 4" />
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

  if (path === "/admin/reports") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 4h7l4 4v12H7z" />
        <path d="M14 4v5h5" />
        <path d="M9 13h7" />
        <path d="M9 16.5h5" />
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
  const { platformName } = usePlatform();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobileNav, setIsMobileNav] = useState(false);
  const menuButtonRef = useRef(null);
  const sidebarRef = useRef(null);
  const closeButtonRef = useRef(null);
  const lastFocusRef = useRef(null);
  const idleTimerRef = useRef(null);
  const pageClasses = ["page seller-page admin-page", pageClassName]
    .filter(Boolean)
    .join(" ");
  const hasPageHeader = Boolean(title || description || actions || titleActions);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen((prev) => !prev), []);

  const handleLogout = async () => {
    await logoutSession();
    navigate("/login");
  };

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const media = window.matchMedia("(max-width: 1040px)");
    const sync = () => setIsMobileNav(media.matches);
    sync();
    if (media.addEventListener) {
      media.addEventListener("change", sync);
      return () => media.removeEventListener("change", sync);
    }
    media.addListener(sync);
    return () => media.removeListener(sync);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    if (!isMobileNav) {
      document.body.classList.remove("admin-drawer-open");
      return undefined;
    }

    if (sidebarOpen) {
      lastFocusRef.current = document.activeElement;
      document.body.classList.add("admin-drawer-open");
      window.requestAnimationFrame(() => {
        const focusables = sidebarRef.current?.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        const target = closeButtonRef.current || focusables?.[0];
        if (target && typeof target.focus === "function") {
          target.focus();
        }
      });
    } else {
      document.body.classList.remove("admin-drawer-open");
      const fallback = menuButtonRef.current || lastFocusRef.current;
      if (fallback && typeof fallback.focus === "function") {
        fallback.focus();
      }
    }

    return () => {
      document.body.classList.remove("admin-drawer-open");
    };
  }, [isMobileNav, sidebarOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const activityEvents = ["mousedown", "keydown", "touchstart", "scroll"];
    let listenersAttached = false;
    let timeoutEnabled = false;
    let loggingOut = false;

    const clearIdleTimer = () => {
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };

    const removeActivityListeners = () => {
      if (!listenersAttached) return;
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, resetIdleTimer, true);
      });
      listenersAttached = false;
    };

    async function handleIdleLogout() {
      if (!timeoutEnabled || loggingOut) return;
      loggingOut = true;
      clearIdleTimer();
      await logoutSession();
      navigate("/login", {
        replace: true,
        state: { notice: "Session ended after 30 minutes of inactivity." },
      });
    }

    function resetIdleTimer() {
      if (!timeoutEnabled) return;
      clearIdleTimer();
      idleTimerRef.current = window.setTimeout(handleIdleLogout, 30 * 60 * 1000);
    }

    const addActivityListeners = () => {
      if (listenersAttached) return;
      activityEvents.forEach((eventName) => {
        window.addEventListener(eventName, resetIdleTimer, true);
      });
      listenersAttached = true;
    };

    const syncIdlePreference = () => {
      const user = readStoredUser();
      timeoutEnabled =
        user?.role === "admin" && Boolean(user?.adminSecuritySettings?.sessionTimeoutEnabled);
      clearIdleTimer();
      if (!timeoutEnabled) {
        removeActivityListeners();
        return;
      }
      addActivityListeners();
      resetIdleTimer();
    };

    syncIdlePreference();
    window.addEventListener("user:updated", syncIdlePreference);
    window.addEventListener("auth:session-cleared", clearIdleTimer);

    return () => {
      clearIdleTimer();
      removeActivityListeners();
      window.removeEventListener("user:updated", syncIdlePreference);
      window.removeEventListener("auth:session-cleared", clearIdleTimer);
    };
  }, [navigate]);

  const handleKeyDown = useCallback(
    (event) => {
      if (!sidebarOpen || !isMobileNav) return;

      if (event.key === "Escape") {
        event.preventDefault();
        closeSidebar();
        return;
      }

      if (event.key !== "Tab") return;

      const focusables = sidebarRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables || focusables.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !sidebarRef.current?.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [closeSidebar, isMobileNav, sidebarOpen]
  );

  useEffect(() => {
    if (!sidebarOpen || !isMobileNav || typeof document === "undefined") return undefined;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown, isMobileNav, sidebarOpen]);

  return (
    <div className={pageClasses}>
      <div className="admin-classic-top">
        <button
          ref={menuButtonRef}
          className="admin-menu-btn"
          type="button"
          aria-label={sidebarOpen ? "Close menu" : "Open menu"}
          aria-expanded={sidebarOpen}
          aria-controls="adminMobileSidebar"
          onClick={toggleSidebar}
        >
          <span />
          <span />
          <span />
        </button>
        <Link className="admin-classic-brand" to="/admin/dashboard">
          <span className="admin-classic-logo">
            <img src={logoPng} alt={platformName} />
          </span>
          <span className="admin-classic-brand-copy">
            <strong>{platformName}</strong>
            <small>Administration Panel</small>
          </span>
        </Link>
        <div className="admin-classic-actions">
          <AdminNotificationBell />
          <Link className="admin-text-action" to="/">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14 5h5v5" />
              <path d="M10 14 19 5" />
              <path d="M19 13v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4" />
            </svg>
            <span className="admin-view-site-label admin-view-site-desktop">Visit site</span>
            <span className="admin-view-site-label admin-view-site-mobile">Site</span>
          </Link>
          <button
            className="admin-text-action admin-view-site-desktop"
            type="button"
            onClick={handleLogout}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M11 4H5v16h6" />
              <path d="M21 12H10" />
              <path d="m13 9-3 3 3 3" />
            </svg>
            <span className="admin-view-site-label admin-view-site-desktop">Logout</span>
          </button>
        </div>
      </div>

      <div className={`admin-shell ${sidebarOpen ? "sidebar-open" : ""}`.trim()}>
        <button
          type="button"
          className={`admin-shell-backdrop ${sidebarOpen ? "show" : ""}`.trim()}
          aria-hidden={!sidebarOpen}
          aria-label="Close menu"
          tabIndex={sidebarOpen ? 0 : -1}
          onClick={closeSidebar}
        />
        <aside
          ref={sidebarRef}
          id="adminMobileSidebar"
          className={`admin-shell-sidebar ${sidebarOpen ? "open" : ""}`.trim()}
          role={isMobileNav ? "dialog" : undefined}
          aria-modal={sidebarOpen && isMobileNav ? "true" : undefined}
          aria-hidden={isMobileNav ? !sidebarOpen : undefined}
          tabIndex={-1}
        >
          <div className="admin-sidebar-mobile-head">
            <span>Menu</span>
            <button
              type="button"
              className="admin-sidebar-close"
              ref={closeButtonRef}
              onClick={closeSidebar}
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
                onClick={closeSidebar}
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

        <section className="admin-shell-content" aria-hidden={sidebarOpen && isMobileNav ? true : undefined}>
          {hasPageHeader ? (
            <div className="section-head admin-shell-head">
              <div className="admin-shell-title">
                <div className="admin-shell-title-row">
                  {title ? <h2>{title}</h2> : null}
                  {titleActions ? (
                    <div className="admin-shell-title-actions">{titleActions}</div>
                  ) : null}
                </div>
                {description ? <p>{description}</p> : null}
              </div>
              {actions ? <div className="seller-toolbar">{actions}</div> : null}
            </div>
          ) : null}
          {children}
        </section>
      </div>

    </div>
  );
}
