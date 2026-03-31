import { Link } from "react-router-dom";

const WorkspaceIcon = ({ kind }) => {
  if (kind === "shipping-delivery") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.5 7.5h10v8h-10z" />
        <path d="M13.5 10h3.2l2.3 2.4v3.1h-5.5z" />
        <circle cx="8" cy="17" r="1.6" />
        <circle cx="17" cy="17" r="1.6" />
      </svg>
    );
  }

  if (kind === "payments-finance") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 6.5h14v11H5z" />
        <path d="M8 10.5h8" />
        <path d="M8 13.5h5" />
      </svg>
    );
  }

  if (kind === "reports-analytics") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 18.5V10" />
        <path d="M12 18.5V6" />
        <path d="M19 18.5v-4.5" />
      </svg>
    );
  }

  if (kind === "customer-management" || kind === "support-help") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 6.5h15a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-8l-4.5 3v-3h-2a1.5 1.5 0 0 1-1.5-1.5V8a1.5 1.5 0 0 1 1.5-1.5Z" />
        <path d="M7.5 10.5h9" />
        <path d="M7.5 13.5h6" />
      </svg>
    );
  }

  if (kind === "offers-marketing") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 8.5h14v9H5z" />
        <path d="m9 8.5 2.5-3h1L15 8.5" />
        <path d="M12 8.5v9" />
      </svg>
    );
  }

  if (kind === "reviews-ratings") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 4 2.3 4.7 5.2.7-3.8 3.7.9 5.2L12 15.7 7.4 18.3l.9-5.2-3.8-3.7 5.2-.7Z" />
      </svg>
    );
  }

  if (kind === "seller-account-settings" || kind === "documents-compliance" || kind === "authentication") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
      </svg>
    );
  }

  if (kind === "order-management") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 6.5h14v12H5z" />
        <path d="M8 4.5h8" />
        <path d="M8.5 10h7" />
        <path d="M8.5 13.5h5.2" />
      </svg>
    );
  }

  if (kind === "product-management") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4.5" y="4.5" width="6.5" height="6.5" rx="1.2" />
        <rect x="13" y="4.5" width="6.5" height="6.5" rx="1.2" />
        <rect x="4.5" y="13" width="6.5" height="6.5" rx="1.2" />
        <rect x="13" y="13" width="6.5" height="6.5" rx="1.2" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 18.5h14" />
      <path d="M7 15V8" />
      <path d="M12 15V5.5" />
      <path d="M17 15v-3.5" />
    </svg>
  );
};

export default function SellerWorkspaceDirectory({ sections = [] }) {
  return (
    <section
      className="seller-panel seller-dashboard-panel seller-workspace-panel"
      id="seller-workspace"
    >
      <div className="card-head seller-dashboard-head">
        <div>
          <h3 className="card-title">Seller workspace map</h3>
          <p className="seller-dashboard-panel-subtitle">
            The seller side now follows the requested module order, while existing pages like
            My Store, Custom Hamper Items, and Messages stay available.
          </p>
        </div>
        <span className="chip">{sections.length} modules</span>
      </div>

      <div className="seller-workspace-grid">
        {sections.map((section) => (
          <article key={section.id} className="seller-workspace-card">
            <div className="seller-workspace-card-head">
              <span className="seller-workspace-icon" aria-hidden="true">
                <WorkspaceIcon kind={section.id} />
              </span>
              <div className="seller-workspace-copy">
                <p className="seller-workspace-eyebrow">{section.navLabel}</p>
                <strong>{section.title}</strong>
                <span>{section.description}</span>
              </div>
            </div>

            <div className="seller-workspace-link-grid">
              {(section.items || []).map((item) => (
                <Link key={`${section.id}-${item.label}`} className="seller-workspace-link" to={item.path}>
                  {item.label}
                </Link>
              ))}
            </div>

            <Link className="seller-workspace-open" to={section.path}>
              Open {section.navLabel}
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
