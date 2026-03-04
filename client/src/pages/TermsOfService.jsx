import Header from "../components/Header";

export default function TermsOfService() {
  return (
    <div className="page">
      <Header />
      <section className="form-card">
        <h2>Terms of Service</h2>
        <p className="muted">Last updated: February 16, 2026</p>
        <p>
          By using CraftzyGifts, you agree to provide accurate account and shipping
          information and to use the platform in compliance with applicable laws.
        </p>
        <p>
          Product listings are managed by sellers. We work to keep information
          accurate but availability, pricing, and delivery times may change.
        </p>
        <p>
          Orders may be cancelled in case of failed payment verification, stock
          unavailability, or policy violations.
        </p>
        <p>
          Sellers must fulfill orders responsibly and update shipment status in a
          timely manner. Repeated violations may lead to account suspension.
        </p>
      </section>
    </div>
  );
}

