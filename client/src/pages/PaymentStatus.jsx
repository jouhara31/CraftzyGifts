import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { API_URL } from "../apiBase";
import {
  addPendingPaymentGroup,
  removePendingPaymentGroup,
} from "../utils/paymentTracking";
import { apiFetchJson, clearAuthSession, hasActiveSession } from "../utils/authSession";

const PAYMENT_STATUS_POLL_INTERVAL_MS = 5000;

const asText = (value) => String(value || "").trim();
const asNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const findTrackedOrders = (orders = [], { paymentGroupId, orderId }) => {
  const normalizedPaymentGroupId = asText(paymentGroupId);
  const normalizedOrderId = asText(orderId);

  if (normalizedPaymentGroupId) {
    return orders.filter(
      (order) => asText(order?.paymentGroupId) === normalizedPaymentGroupId
    );
  }
  if (normalizedOrderId) {
    return orders.filter((order) => asText(order?._id) === normalizedOrderId);
  }
  return [];
};

const buildStatusSummary = (
  trackedOrders,
  { initialOutcome = "", paymentGroupId = "", initialMessage = "" } = {}
) => {
  const paid = trackedOrders.some((order) => asText(order?.paymentStatus) === "paid");
  const failed = trackedOrders.length > 0 &&
    trackedOrders.every(
      (order) =>
        ["failed", "refunded"].includes(asText(order?.paymentStatus)) ||
        ["cancelled", "refunded"].includes(asText(order?.status))
    );
  const pending = trackedOrders.length === 0 ||
    trackedOrders.some(
      (order) =>
        asText(order?.status) === "pending_payment" &&
        asText(order?.paymentStatus) === "pending"
    );

  if (paid) {
    return {
      tone: "success",
      title: "Payment confirmed",
      body:
        initialMessage ||
        "Razorpay confirmed your payment securely. Your order is now placed and visible in Orders.",
      canRetry: false,
      shouldPoll: false,
      shouldTrack: false,
    };
  }

  if (failed) {
    return {
      tone: "error",
      title: "Payment not completed",
      body:
        initialMessage ||
        "The gateway did not confirm this payment. You can retry safely from your orders page.",
      canRetry: true,
      shouldPoll: false,
      shouldTrack: false,
    };
  }

  if (asText(initialOutcome) === "cancelled" && trackedOrders.length > 0) {
    return {
      tone: "warning",
      title: "Payment was cancelled",
      body:
        initialMessage ||
        "Your order is still saved as pending payment. Retry anytime from Orders when you are ready.",
      canRetry: true,
      shouldPoll: false,
      shouldTrack: false,
    };
  }

  return {
    tone: "warning",
    title: "Checking payment status",
    body:
      initialMessage ||
      (paymentGroupId
        ? "We are waiting for secure gateway confirmation. This page refreshes automatically."
        : "Payment status is being checked. Please keep this page open for a moment."),
    canRetry: true,
    shouldPoll: pending,
    shouldTrack: pending,
  };
};

export default function PaymentStatus() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const paymentGroupId =
    asText(params.get("paymentGroupId")) || asText(location.state?.paymentGroupId);
  const orderId = asText(params.get("orderId")) || asText(location.state?.orderId);
  const initialOutcome = asText(params.get("outcome")) || asText(location.state?.outcome);
  const initialMessage = asText(location.state?.notice || location.state?.error);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadOrders = useCallback(
    async ({ silent = false } = {}) => {
      if (!hasActiveSession()) {
        navigate("/login", {
          replace: true,
          state: { notice: "Please login to check payment status." },
        });
        return;
      }

      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const { response: res, data } = await apiFetchJson(`${API_URL}/api/orders/my`);
        if (res.status === 401) {
          clearAuthSession();
          navigate("/login", {
            replace: true,
            state: { notice: "Session expired. Please login again." },
          });
          return;
        }
        if (!res.ok) {
          setError(data?.message || "Unable to check payment status right now.");
          return;
        }
        setOrders(Array.isArray(data) ? data : []);
        setError("");
      } catch {
        setError("Unable to check payment status right now.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [navigate]
  );

  useEffect(() => {
    if (!paymentGroupId && !orderId) {
      setLoading(false);
      setError("No payment session was found to track.");
      return;
    }
    loadOrders();
  }, [loadOrders, orderId, paymentGroupId]);

  const trackedOrders = useMemo(
    () => findTrackedOrders(orders, { paymentGroupId, orderId }),
    [orderId, orders, paymentGroupId]
  );
  const summary = useMemo(
    () =>
      buildStatusSummary(trackedOrders, {
        initialOutcome,
        paymentGroupId,
        initialMessage,
      }),
    [initialMessage, initialOutcome, paymentGroupId, trackedOrders]
  );
  const orderTotal = useMemo(
    () =>
      trackedOrders.reduce((sum, order) => sum + asNumber(order?.total, 0), 0),
    [trackedOrders]
  );

  useEffect(() => {
    if (!paymentGroupId) return;
    if (summary.shouldTrack) {
      addPendingPaymentGroup(paymentGroupId);
      return;
    }
    removePendingPaymentGroup(paymentGroupId);
  }, [paymentGroupId, summary.shouldTrack]);

  useEffect(() => {
    if (!summary.shouldPoll) return undefined;

    const intervalId = window.setInterval(() => {
      loadOrders({ silent: true });
    }, PAYMENT_STATUS_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [loadOrders, summary.shouldPoll]);

  const toneClass =
    summary.tone === "error"
      ? "customer-orders-alert is-error"
      : summary.tone === "success"
        ? "customer-orders-alert is-success"
        : "customer-orders-alert";

  return (
    <div className="page">
      <Header />

      <section className="section-head">
        <div>
          <h2>Payment status</h2>
          <p>Secure payment updates come from the gateway webhook, not from the browser.</p>
        </div>
        <Link className="btn ghost" to="/orders">
          View orders
        </Link>
      </section>

      <div className="customize-grid">
        <section className="form-card">
          <h3>{loading ? "Checking payment..." : summary.title}</h3>
          {loading ? <p className="field-hint">Loading the latest payment update...</p> : null}
          {!loading && (error || summary.body) ? (
            <div className={error ? "customer-orders-alert is-error" : toneClass}>
              <p>{error || summary.body}</p>
            </div>
          ) : null}
          {!loading ? (
            <div className="seller-toolbar">
              {summary.canRetry ? (
                <button
                  className="btn primary"
                  type="button"
                  onClick={() =>
                    navigate("/orders", {
                      state: {
                        notice:
                          summary.tone === "error"
                            ? "Retry payment securely from your orders page."
                            : "Your order is pending payment. Retry anytime from Orders.",
                        paymentGroupId,
                      },
                    })
                  }
                >
                  Retry from orders
                </button>
              ) : null}
              <button
                className="btn ghost"
                type="button"
                onClick={() => loadOrders({ silent: true })}
                disabled={loading || refreshing}
              >
                {refreshing ? "Refreshing..." : "Refresh status"}
              </button>
              <Link className="btn ghost" to="/products">
                Continue shopping
              </Link>
            </div>
          ) : null}
        </section>

        <aside className="summary-card">
          <div className="card-head">
            <p className="card-title">Session summary</p>
            <span className="chip">
              {trackedOrders.length > 0 ? `${trackedOrders.length} order${trackedOrders.length > 1 ? "s" : ""}` : "Waiting"}
            </span>
          </div>

          <div className="price-summary">
            <div className="price-row">
              <span>Payment group</span>
              <span>{paymentGroupId || "Not available yet"}</span>
            </div>
            <div className="price-row">
              <span>Tracked order</span>
              <span>{orderId || "Grouped checkout"}</span>
            </div>
            <div className="price-row">
              <span>Status</span>
              <span>{loading ? "Checking" : summary.title}</span>
            </div>
            <div className="price-row total">
              <span>Total amount</span>
              <span>₹{orderTotal.toLocaleString("en-IN")}</span>
            </div>
          </div>

          {trackedOrders.length > 0 ? (
            <div className="customer-order-detail-grid">
              {trackedOrders.map((order) => (
                <section key={order._id} className="customer-order-detail-card">
                  <p className="customer-order-detail-title">
                    {(order?.product?.name || "Order").trim()}
                  </p>
                  <div className="customer-order-detail-list">
                    <p>Order: #{asText(order?._id).slice(-8).toUpperCase() || "ORDER"}</p>
                    <p>Status: {asText(order?.status) || "pending_payment"}</p>
                    <p>Payment: {asText(order?.paymentStatus) || "pending"}</p>
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <p className="field-hint">
              We are still matching this payment session with your order record.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
