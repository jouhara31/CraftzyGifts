import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import logoPng from "../assets/logo.png";
import { logoutSession, readStoredUser, readStoredUserId } from "../utils/authSession";
import { readStoredSessionClaims } from "../utils/authRoute";
import { buildSellerWorkspaceSections, isWorkspacePathActive } from "../utils/sellerWorkspace";
import SellerNotificationBell from "./SellerNotificationBell";

const readStoredSellerId = () => {
  const sellerId = readStoredUserId();
  if (sellerId) return sellerId;
  const stored = readStoredUser() || {};
  return String(stored?.id || stored?._id || "").trim();
};

const QUICK_ACCESS_ITEMS = (sellerStorePath) => [
  {
    key: "my-store",
    label: "My Store",
    description: "Preview and edit the public storefront.",
    path: sellerStorePath,
    isActive: (location) => String(location?.pathname || "").trim().startsWith("/seller/store/"),
  },
  {
    key: "custom-hamper-items",
    label: "Custom Hamper Items",
    description: "Seller-wide hamper catalog and base items.",
    path: "/seller/listed-items",
    matchPrefixes: ["/seller/listed-items"],
  },
  {
    key: "messages",
    label: "Messages",
    description: "Support conversations and ticket follow-ups.",
    path: "/seller/messages",
    matchPrefixes: ["/seller/messages"],
  },
];

function SellerNavIcon({ itemKey }) {
  if (itemKey === "dashboard") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.4" />
        <rect x="13.5" y="3.5" width="7" height="5.2" rx="1.4" />
        <rect x="13.5" y="11.3" width="7" height="9.2" rx="1.4" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.4" />
      </svg>
    );
  }

  if (itemKey === "product-management" || itemKey === "custom-hamper-items") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.5 7.7 12 3.5l8.5 4.2L12 12z" />
        <path d="M3.5 7.7V16.3L12 20.5l8.5-4.2V7.7" />
        <path d="M12 12v8.5" />
      </svg>
    );
  }

  if (itemKey === "order-management") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 3.5h8l3.5 3.5v13H4.5v-16z" />
        <path d="M8 3.5V7h11.5" />
        <path d="M8.5 11.2h7.2M8.5 15.2h5.2" />
      </svg>
    );
  }

  if (itemKey === "shipping-delivery") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.5 6.5h10v11h-10z" />
        <path d="M13.5 9h3.3l3 3v5.5h-6.3z" />
        <circle cx="8" cy="18.3" r="1.7" />
        <circle cx="17.3" cy="18.3" r="1.7" />
      </svg>
    );
  }

  if (itemKey === "payments-finance") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7.2h16v9.6H4z" />
        <path d="M4 10.5h16" />
        <path d="M8 14h3.4" />
      </svg>
    );
  }

  if (itemKey === "reports-analytics") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.5 20.5h17" />
        <path d="M6.5 18.8v-7.1M11.8 18.8V8M17.1 18.8v-4.3" />
      </svg>
    );
  }

  if (itemKey === "customer-management") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="9" cy="8.2" r="3.1" />
        <path d="M3.5 19a5.6 5.6 0 0 1 11.2 0" />
        <circle cx="17.1" cy="9.2" r="2.3" />
        <path d="M14.2 19a4.5 4.5 0 0 1 5.8-4.2A4.4 4.4 0 0 1 21 19" />
      </svg>
    );
  }

  if (itemKey === "offers-marketing" || itemKey === "my-store") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 8.2h15v11.3h-15z" />
        <path d="M7 8.2V5.7a1.7 1.7 0 0 1 1.7-1.7h6.6A1.7 1.7 0 0 1 17 5.7v2.5" />
        <path d="M8.5 12.5h7" />
      </svg>
    );
  }

  if (itemKey === "reviews-ratings") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 4.5 2.3 4.7 5.2.8-3.8 3.7.9 5.3L12 16.5 7.4 19l.9-5.3-3.8-3.7 5.2-.8z" />
      </svg>
    );
  }

  if (itemKey === "seller-account-settings" || itemKey === "documents-compliance") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="2.8" />
        <path d="M19.5 13.3v-2.6l-1.9-.5a5.9 5.9 0 0 0-.5-1.3l1-1.7-1.8-1.8-1.7 1a5.9 5.9 0 0 0-1.3-.5l-.5-1.9h-2.6l-.5 1.9a5.9 5.9 0 0 0-1.3.5l-1.7-1-1.8 1.8 1 1.7a5.9 5.9 0 0 0-.5 1.3l-1.9.5v2.6l1.9.5a5.9 5.9 0 0 0 .5 1.3l-1 1.7 1.8 1.8 1.7-1a5.9 5.9 0 0 0 1.3.5l.5 1.9h2.6l.5-1.9a5.9 5.9 0 0 0 1.3-.5l1.7 1 1.8-1.8-1-1.7a5.9 5.9 0 0 0 .5-1.3z" />
      </svg>
    );
  }

  if (itemKey === "support-help" || itemKey === "messages") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 6.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H10l-4 3v-3H5A1.5 1.5 0 0 1 3.5 16V8A1.5 1.5 0 0 1 5 6.5Z" />
        <path d="M8 10h8M8 13.5h5" />
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

const buildNavGroups = (workspaceSections) => [
  {
    title: "Operations",
    items: workspaceSections.filter((section) =>
      ["dashboard", "product-management", "order-management", "shipping-delivery", "payments-finance"].includes(
        section.id
      )
    ),
  },
  {
    title: "Growth",
    items: workspaceSections.filter((section) =>
      ["reports-analytics", "customer-management", "offers-marketing", "reviews-ratings"].includes(
        section.id
      )
    ),
  },
  {
    title: "Account",
    items: workspaceSections.filter((section) =>
      ["seller-account-settings", "documents-compliance", "support-help"].includes(section.id)
    ),
  },
];

export default function SellerSidebarLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobileNav, setIsMobileNav] = useState(false);
  const menuButtonRef = useRef(null);
  const sidebarRef = useRef(null);
  const closeButtonRef = useRef(null);
  const lastFocusRef = useRef(null);
  const sellerClaims = readStoredSessionClaims();
  const isApproved = sellerClaims.sellerStatus === "approved";
  const sellerStorePath = useMemo(() => {
    const sellerId = readStoredSellerId();
    return sellerId ? `/seller/store/${sellerId}` : "/seller/dashboard";
  }, []);
  const workspaceSections = useMemo(() => {
    const allSections = buildSellerWorkspaceSections({ sellerStorePath }).filter(
      (section) => section.showInSidebar !== false
    );
    if (isApproved) return allSections;
    return allSections.filter((section) => section.id === "support-help");
  }, [isApproved, sellerStorePath]);
  const quickAccessItems = useMemo(
    () => (isApproved ? QUICK_ACCESS_ITEMS(sellerStorePath) : QUICK_ACCESS_ITEMS(sellerStorePath).slice(2)),
    [isApproved, sellerStorePath]
  );
  const navGroups = useMemo(() => buildNavGroups(workspaceSections), [workspaceSections]);
  const routeClasses = useMemo(() => {
    const classes = [];
    if (location.pathname === "/seller/dashboard") {
      classes.push("admin-dashboard-page", "seller-shell-dashboard");
    }
    if (location.pathname === "/seller/messages") {
      classes.push("admin-messages-page", "seller-shell-messages");
    }
    if (location.pathname === "/seller/orders") {
      classes.push("admin-page-orders", "seller-shell-orders");
    }
    return classes.join(" ");
  }, [location.pathname]);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen((prev) => !prev), []);

  const handleLogout = async () => {
    await logoutSession();
    navigate("/login");
  };

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname, location.search, location.hash]);

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
    <div className={["page seller-page admin-page seller-shell-page", routeClasses].filter(Boolean).join(" ")}>
      <div className="admin-classic-top seller-classic-top">
        <button
          ref={menuButtonRef}
          className="admin-menu-btn"
          type="button"
          aria-label={sidebarOpen ? "Close menu" : "Open menu"}
          aria-expanded={sidebarOpen}
          aria-controls="sellerMobileSidebar"
          onClick={toggleSidebar}
        >
          <span />
          <span />
          <span />
        </button>
        <Link className="admin-classic-brand seller-classic-brand" to="/seller/dashboard">
          <span className="admin-classic-logo">
            <img src={logoPng} alt="CraftzyGifts" />
          </span>
          <span className="admin-classic-brand-copy">
            <strong>CraftzyGifts</strong>
            <small>Seller Workspace</small>
          </span>
        </Link>
        <div className="admin-classic-actions seller-classic-actions">
          <SellerNotificationBell />
          <Link className="admin-text-action" to={sellerStorePath}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4.5 8.2h15v11.3h-15z" />
              <path d="M7 8.2V5.7a1.7 1.7 0 0 1 1.7-1.7h6.6A1.7 1.7 0 0 1 17 5.7v2.5" />
              <path d="M8.5 12.5h7" />
            </svg>
            <span className="admin-view-site-label admin-view-site-desktop">Visit store</span>
            <span className="admin-view-site-label admin-view-site-mobile">Store</span>
          </Link>
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

      <div className={`admin-shell seller-shell ${sidebarOpen ? "sidebar-open" : ""}`.trim()}>
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
          id="sellerMobileSidebar"
          className={`admin-shell-sidebar seller-shell-sidebar ${sidebarOpen ? "open" : ""}`.trim()}
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

          <div className="seller-shell-summary">
            <p className="admin-shell-kicker">Seller Console</p>
            <h3>Workspace navigation</h3>
            <p className="admin-shell-sub">
              Every seller module stays reachable here, with cleaner page spacing and a stable
              right-side work area.
            </p>
          </div>

          {!isApproved ? (
            <div className="seller-shell-status-card">
              <strong>Approval pending</strong>
              <p>
                Support remains available while we verify your seller profile. Other seller tools
                unlock once approval is complete.
              </p>
              <Link className="btn ghost" to="/seller/pending" onClick={closeSidebar}>
                View status
              </Link>
            </div>
          ) : null}

          {navGroups.map((group) =>
            group.items.length > 0 ? (
              <div key={group.title} className="seller-shell-group">
                <p className="seller-shell-group-title">{group.title}</p>
                <nav className="admin-shell-nav seller-shell-nav">
                  {group.items.map((item) => {
                    const isActive = isWorkspacePathActive(location, item);
                    return (
                      <div key={item.id} className="seller-shell-link-group">
                        <NavLink
                          to={item.path}
                          className={`admin-shell-link seller-shell-link ${isActive ? "active" : ""}`.trim()}
                          onClick={closeSidebar}
                        >
                          <span className="admin-shell-link-icon">
                            <SellerNavIcon itemKey={item.id} />
                          </span>
                          <span className="seller-shell-link-copy">
                            <span>{item.navLabel || item.title}</span>
                            <small>{item.description}</small>
                          </span>
                        </NavLink>
                      </div>
                    );
                  })}
                </nav>
              </div>
            ) : null
          )}

          <div className="seller-shell-group">
            <p className="seller-shell-group-title">Quick Access</p>
            <nav className="admin-shell-nav seller-shell-nav">
              {quickAccessItems.map((item) => (
                <NavLink
                  key={item.key}
                  to={item.path}
                  className={`admin-shell-link seller-shell-link ${
                    isWorkspacePathActive(location, item) ? "active" : ""
                  }`.trim()}
                  onClick={closeSidebar}
                >
                  <span className="admin-shell-link-icon">
                    <SellerNavIcon itemKey={item.key} />
                  </span>
                  <span className="seller-shell-link-copy">
                    <span>{item.label}</span>
                    <small>{item.description}</small>
                  </span>
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
          </div>
        </aside>

        <section className="admin-shell-content seller-shell-content" aria-hidden={sidebarOpen && isMobileNav ? true : undefined}>
          <Outlet />
        </section>
      </div>
    </div>
  );
}
