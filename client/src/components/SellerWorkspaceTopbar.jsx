import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import logoPng from "../assets/logo.png";
import { usePlatform } from "../hooks/usePlatform";
import { logoutSession, readStoredUser } from "../utils/authSession";
import SellerNotificationBell from "./SellerNotificationBell";

const getSellerLabel = (user = {}) =>
  String(user?.storeName || user?.name || "Seller").trim() || "Seller";

export default function SellerWorkspaceTopbar({
  sellerStorePath = "/seller/dashboard",
  brandPath = "/seller/dashboard",
  showMenuButton = false,
  sidebarOpen = false,
  onToggleSidebar = null,
  menuButtonRef = null,
}) {
  const { platformName } = usePlatform();
  const navigate = useNavigate();
  const [user, setUser] = useState(() => readStoredUser() || {});

  useEffect(() => {
    const syncUser = () => setUser(readStoredUser() || {});
    window.addEventListener("user:updated", syncUser);
    return () => window.removeEventListener("user:updated", syncUser);
  }, []);

  const sellerNameLabel = getSellerLabel(user);

  const handleLogout = async () => {
    await logoutSession();
    navigate("/login");
  };

  return (
    <div
      className={`admin-classic-top seller-classic-top${
        showMenuButton ? "" : " seller-classic-top-compact"
      }`}
    >
      {showMenuButton ? (
        <button
          ref={menuButtonRef}
          className="admin-menu-btn"
          type="button"
          aria-label={sidebarOpen ? "Close menu" : "Open menu"}
          aria-expanded={sidebarOpen}
          aria-controls="sellerMobileSidebar"
          onClick={onToggleSidebar}
        >
          <span />
          <span />
          <span />
        </button>
      ) : null}
      <Link className="admin-classic-brand seller-classic-brand" to={brandPath}>
        <span className="admin-classic-logo">
          <img src={logoPng} alt={platformName} />
        </span>
        <span className="admin-classic-brand-copy">
          <strong>{platformName}</strong>
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
        <span className="seller-classic-name admin-view-site-desktop">{sellerNameLabel}</span>
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
  );
}
