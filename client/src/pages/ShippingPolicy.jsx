import Header from "../components/Header";

export default function ShippingPolicy() {
  return (
    <div className="page">
      <Header />
      <section className="form-card">
        <h2>Shipping Policy</h2>
        <p className="muted">Last updated: February 16, 2026</p>
        <p>
          Orders are shipped after confirmation and payment verification (for online
          payments). Shipping timelines may vary by seller location and destination.
        </p>
        <p>
          Tracking updates are visible in your orders page once the seller marks the
          order as shipped.
        </p>
        <p>
          Delivery delays may occur due to weather, logistics constraints, or
          regional restrictions. We notify customers where possible.
        </p>
        <p>
          For urgent deliveries or bulk corporate orders, please contact support
          before placing the order.
        </p>
      </section>
    </div>
  );
}

