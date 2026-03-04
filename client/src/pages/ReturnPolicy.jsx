import Header from "../components/Header";

export default function ReturnPolicy() {
  return (
    <div className="page">
      <Header />
      <section className="form-card">
        <h2>Returns & Refund Policy</h2>
        <p className="muted">Last updated: February 16, 2026</p>
        <p>
          Return requests can be raised after delivery from the order details page.
          Returns are reviewed by the seller based on product condition and policy
          eligibility.
        </p>
        <p>
          Custom-made or personalized products are generally non-returnable unless
          they arrive damaged or incorrect.
        </p>
        <p>
          Approved returns are moved to refund processing. Refunds are credited to
          the original payment method where applicable.
        </p>
        <p>
          COD refunds may be processed through bank transfer or UPI after
          verification.
        </p>
      </section>
    </div>
  );
}

