import Header from "../components/Header";

export default function PrivacyPolicy() {
  return (
    <div className="page">
      <Header />
      <section className="form-card">
        <h2>Privacy Policy</h2>
        <p className="muted">Last updated: February 16, 2026</p>
        <p>
          CraftzyGifts collects only the information required to process orders,
          deliver products, and provide customer support.
        </p>
        <p>
          We may store your name, contact information, shipping details, and order
          history. Payment data is processed by secure payment partners and is not
          stored in plaintext on our systems.
        </p>
        <p>
          Account data is used for authentication, order tracking, and relevant
          service communication. We do not sell personal information to third
          parties.
        </p>
        <p>
          You may request access, correction, or deletion of your account data by
          contacting support.
        </p>
      </section>
    </div>
  );
}

