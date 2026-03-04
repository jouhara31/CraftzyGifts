import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Header from "../components/Header";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const ONLINE_PAYMENT_MODES = new Set(["upi", "card"]);
const toPlainObject = (value) => {
  if (!value) return {};
  if (value instanceof Map) {
    return Object.fromEntries(value.entries());
  }
  if (typeof value === "object") return value;
  return {};
};

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [actingOrderId, setActingOrderId] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  const loadOrders = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/orders/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Unable to fetch orders.");
        return;
      }
      setOrders(Array.isArray(data) ? data : []);
    } catch {
      setError("Unable to fetch orders.");
    }
  }, [navigate]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    if (location.state?.notice) {
      setNotice(location.state.notice);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate]);

  const handlePayNow = async (orderId) => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    setActingOrderId(orderId);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`${API_URL}/api/orders/${orderId}/pay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ result: "success" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Unable to complete payment.");
        return;
      }
      setNotice("Payment verified successfully.");
      await loadOrders();
    } catch {
      setError("Unable to complete payment.");
    } finally {
      setActingOrderId("");
    }
  };

  const handleReturnRequest = async (orderId) => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    setActingOrderId(orderId);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`${API_URL}/api/orders/${orderId}/return`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          reason: "Customer requested return from orders page",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Unable to request return.");
        return;
      }
      setNotice("Return request submitted.");
      await loadOrders();
    } catch {
      setError("Unable to request return.");
    } finally {
      setActingOrderId("");
    }
  };

  return (
    <div className="page">
      <Header />
      <div className="section-head">
        <div>
          <h2>Your orders</h2>
          <p>Track your order status and delivery updates.</p>
        </div>
        <Link className="link" to="/products">
          Browse products
        </Link>
      </div>

      {error && <p className="field-hint">{error}</p>}
      {notice && <p className="field-hint">{notice}</p>}

      {!error && orders.length === 0 && (
        <p className="field-hint">No orders yet.</p>
      )}

      <div className="order-grid">
        {orders.map((order) => {
          const selectedOptionEntries = Object.entries(
            toPlainObject(order.customization?.selectedOptions)
          ).filter(([, value]) => Boolean(String(value || "").trim()));
          const selectedItems = Array.isArray(order.customization?.selectedItems)
            ? order.customization.selectedItems
            : [];

          return (
            <article key={order._id} className="product-card">
              <div className="product-body">
                <div className="product-top">
                  <h3>{order.product?.name || "Hamper"}</h3>
                  <span className="chip">{order.status}</span>
                </div>
                <div className="product-meta">
                  <span>Qty: {order.quantity}</span>
                  <span>Total: ₹{order.total}</span>
                </div>
                <p className="field-hint">
                  Payment: {order.paymentMode?.toUpperCase()} • {order.paymentStatus}
                </p>

                {selectedOptionEntries.length > 0 && (
                  <div className="field-hint">
                    <strong>Selected options:</strong>
                    <div>
                      {selectedOptionEntries.map(([key, value]) => (
                        <p key={`${key}-${value}`}>
                          {key}: {String(value)}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {selectedItems.length > 0 && (
                  <div className="field-hint">
                    <strong>Selected hamper items:</strong>
                    <div>
                      {selectedItems.map((item) => (
                        <p key={`${item.id || item.name}-${item.quantity}`}>
                          {item.name || item.mainItem || "Item"} x
                          {Number(item.quantity || 1)}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {order.customization?.wishCardText && (
                  <p className="field-hint">
                    Wish card: {order.customization.wishCardText}
                  </p>
                )}
                <div className="hero-actions">
                  {order.status === "pending_payment" &&
                  order.paymentStatus === "pending" &&
                  ONLINE_PAYMENT_MODES.has(order.paymentMode) ? (
                    <button
                      className="btn primary"
                      type="button"
                      disabled={actingOrderId === order._id}
                      onClick={() => handlePayNow(order._id)}
                    >
                      {actingOrderId === order._id ? "Processing..." : "Pay now"}
                    </button>
                  ) : null}

                  {order.status === "delivered" ? (
                    <button
                      className="btn ghost"
                      type="button"
                      disabled={actingOrderId === order._id}
                      onClick={() => handleReturnRequest(order._id)}
                    >
                      {actingOrderId === order._id ? "Submitting..." : "Request return"}
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
