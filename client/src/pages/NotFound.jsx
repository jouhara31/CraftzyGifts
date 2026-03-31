import { Link, useLocation } from "react-router-dom";
import Header from "../components/Header";

export default function NotFound() {
  const location = useLocation();

  return (
    <div className="page not-found-page">
      <Header />
      <section className="not-found-shell">
        <div className="not-found-card">
          <div className="not-found-grid">
            <div className="not-found-copy">
              <p className="not-found-badge">404</p>
              <h1 className="not-found-title">This page slipped out of the gift wrap.</h1>
              <p className="not-found-text">
                The page you requested is not available right now. It may have been moved,
                renamed, or never published in this storefront.
              </p>
              <p className="not-found-path">
                Requested path: <span>{location.pathname}</span>
              </p>
              <div className="not-found-actions">
                <Link className="btn primary" to="/">
                  Back home
                </Link>
                <Link className="btn ghost" to="/products">
                  Browse products
                </Link>
              </div>
            </div>

            <div className="not-found-visual" aria-hidden="true">
              <div className="not-found-orb" />
              <div className="not-found-frame">
                <span>Curated</span>
                <strong>Collections</strong>
                <small>Handmade gifting, premium details, smooth discovery.</small>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
