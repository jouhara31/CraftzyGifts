import { Link } from "react-router-dom";

export default function PlatformMaintenancePage({ platformName = "CraftzyGifts" }) {
  const brandName = String(platformName || "CraftzyGifts").trim() || "CraftzyGifts";

  return (
    <div className="page platform-maintenance-page">
      <div className="platform-maintenance-card">
        <p className="platform-maintenance-kicker">Maintenance</p>
        <h1>{brandName}</h1>
        <p>Temporarily unavailable.</p>
        <Link className="btn ghost" to="/login">
          Admin login
        </Link>
      </div>
    </div>
  );
}
