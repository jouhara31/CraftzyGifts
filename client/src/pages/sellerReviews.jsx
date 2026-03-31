import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../apiBase";
import { clearAuthSession } from "../utils/authSession";

const asText = (value) => String(value ?? "").trim();

const createReviewDrafts = (orders = []) =>
  (Array.isArray(orders) ? orders : []).reduce((acc, order) => {
    const orderId = asText(order?._id);
    if (!orderId) return acc;
    acc[orderId] = {
      sellerReply: asText(order?.review?.sellerReply),
      visibleToStorefront:
        typeof order?.review?.visibleToStorefront === "boolean"
          ? order.review.visibleToStorefront
          : true,
      flaggedForAdmin: Boolean(order?.review?.flaggedForAdmin),
    };
    return acc;
  }, {});

const toStars = (rating = 0) => "★★★★★☆☆☆☆☆".slice(5 - Number(rating || 0), 10 - Number(rating || 0));

export default function SellerReviews() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [reviewDrafts, setReviewDrafts] = useState({});
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [savingReviewId, setSavingReviewId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const clearAndRedirect = useCallback(() => {
    clearAuthSession();
    navigate("/login", { replace: true });
  }, [navigate]);

  const loadReviews = useCallback(async () => {
    const token = asText(localStorage.getItem("token"));
    if (!token) {
      clearAndRedirect();
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/orders/seller`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => []);
      if (response.status === 401) {
        clearAndRedirect();
        return;
      }
      if (!response.ok) {
        setError(data?.message || "Unable to load seller reviews.");
        return;
      }
      const reviewedOrders = (Array.isArray(data) ? data : []).filter((order) => {
        const rating = Number(order?.review?.rating || 0);
        return Number.isFinite(rating) && rating >= 1 && rating <= 5;
      });
      setOrders(reviewedOrders);
      setReviewDrafts(createReviewDrafts(reviewedOrders));
    } catch {
      setError("Unable to load seller reviews.");
    } finally {
      setLoading(false);
    }
  }, [clearAndRedirect]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  const reviewSummary = useMemo(() => {
    const total = orders.length;
    const hidden = orders.filter((order) => order?.review?.visibleToStorefront === false).length;
    const flagged = orders.filter((order) => order?.review?.flaggedForAdmin).length;
    const replied = orders.filter((order) => asText(order?.review?.sellerReply)).length;
    const avgRating =
      total > 0
        ? orders.reduce((sum, order) => sum + Number(order?.review?.rating || 0), 0) / total
        : 0;
    return {
      total,
      hidden,
      flagged,
      replied,
      avgRating: Math.round(avgRating * 10) / 10,
    };
  }, [orders]);

  const filteredOrders = useMemo(
    () =>
      orders.filter((order) => {
        const isVisible =
          typeof order?.review?.visibleToStorefront === "boolean"
            ? order.review.visibleToStorefront
            : true;
        const flagged = Boolean(order?.review?.flaggedForAdmin);
        if (filter === "public") return isVisible;
        if (filter === "hidden") return !isVisible;
        if (filter === "flagged") return flagged;
        return true;
      }),
    [filter, orders]
  );

  const handleDraftChange = (orderId, field, value) => {
    setReviewDrafts((prev) => ({
      ...prev,
      [orderId]: {
        ...(prev[orderId] || {
          sellerReply: "",
          visibleToStorefront: true,
          flaggedForAdmin: false,
        }),
        [field]: value,
      },
    }));
  };

  const saveReview = async (orderId) => {
    const token = asText(localStorage.getItem("token"));
    if (!token) {
      clearAndRedirect();
      return;
    }

    const draft = reviewDrafts[orderId] || {};
    setSavingReviewId(orderId);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/orders/${orderId}/review-moderation`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sellerReply: asText(draft.sellerReply),
          visibleToStorefront: Boolean(draft.visibleToStorefront),
          flaggedForAdmin: Boolean(draft.flaggedForAdmin),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        clearAndRedirect();
        return;
      }
      if (!response.ok) {
        setError(data?.message || "Unable to update seller review settings.");
        return;
      }
      const updatedOrder = data?.order;
      if (updatedOrder?._id) {
        setOrders((prev) =>
          prev.map((entry) => (entry._id === updatedOrder._id ? updatedOrder : entry))
        );
        setReviewDrafts((prev) => ({
          ...prev,
          [orderId]: {
            sellerReply: asText(updatedOrder?.review?.sellerReply),
            visibleToStorefront:
              typeof updatedOrder?.review?.visibleToStorefront === "boolean"
                ? updatedOrder.review.visibleToStorefront
                : true,
            flaggedForAdmin: Boolean(updatedOrder?.review?.flaggedForAdmin),
          },
        }));
      }
      setNotice("Review preferences updated.");
    } catch {
      setError("Unable to update seller review settings.");
    } finally {
      setSavingReviewId("");
    }
  };

  return (
    <div className="seller-shell-view seller-reviews-page">
      <div className="section-head">
        <div>
          <h2>Reviews and ratings</h2>
          <p>Track customer feedback, reply as a seller, and control storefront visibility.</p>
        </div>
        <div className="seller-toolbar">
          <button className="btn ghost" type="button" onClick={() => setFilter("all")}>
            All
          </button>
          <button className="btn ghost" type="button" onClick={() => setFilter("public")}>
            Public
          </button>
          <button className="btn ghost" type="button" onClick={() => setFilter("hidden")}>
            Hidden
          </button>
          <button className="btn ghost" type="button" onClick={() => setFilter("flagged")}>
            Flagged
          </button>
        </div>
      </div>

      {loading ? <p className="field-hint">Loading seller reviews...</p> : null}
      {error ? <p className="field-hint">{error}</p> : null}
      {notice ? <p className="field-hint">{notice}</p> : null}

      {!loading ? (
        <div className="seller-payments">
          <div className="seller-panel">
            <div className="card-head">
              <h3 className="card-title">Review summary</h3>
              <span className="chip">{reviewSummary.total} reviews</span>
            </div>
            <div className="stat-grid">
              <div className="stat-card">
                <p className="stat-label">Average rating</p>
                <p className="stat-value">{reviewSummary.avgRating || 0}/5</p>
                <p className="stat-delta">Verified order feedback</p>
              </div>
              <div className="stat-card">
                <p className="stat-label">Seller replies</p>
                <p className="stat-value">{reviewSummary.replied}</p>
                <p className="stat-delta">Responses published internally</p>
              </div>
              <div className="stat-card">
                <p className="stat-label">Hidden reviews</p>
                <p className="stat-value">{reviewSummary.hidden}</p>
                <p className="stat-delta">Removed from storefront totals</p>
              </div>
              <div className="stat-card">
                <p className="stat-label">Flagged for admin</p>
                <p className="stat-value">{reviewSummary.flagged}</p>
                <p className="stat-delta">Marked for follow-up</p>
              </div>
            </div>
          </div>

          <div className="seller-panel">
            <div className="card-head">
              <h3 className="card-title">Customer review list</h3>
              <span className="chip">{filteredOrders.length} visible in filter</span>
            </div>

            <div className="payout-grid">
              {filteredOrders.map((order) => {
                const orderId = asText(order?._id);
                const draft = reviewDrafts[orderId] || {
                  sellerReply: "",
                  visibleToStorefront: true,
                  flaggedForAdmin: false,
                };
                const rating = Number(order?.review?.rating || 0);
                const imageList = Array.isArray(order?.review?.images)
                  ? order.review.images.filter(Boolean)
                  : [];
                return (
                  <article key={orderId} className="payout-card">
                    <div className="payout-head">
                      <span>{asText(order?.customer?.name) || "Customer"}</span>
                      <span className="status-pill success">{rating}/5</span>
                    </div>
                    <p className="payout-sub">
                      {toStars(rating)} · {(order?.product?.name || "Product").trim()}
                    </p>
                    <p className="payout-sub">
                      Order #{orderId.slice(-8).toUpperCase()} ·{" "}
                      {order?.createdAt ? new Date(order.createdAt).toLocaleDateString("en-IN") : "-"}
                    </p>
                    <p className="order-customization-copy">
                      {asText(order?.review?.comment) || "Customer did not leave written feedback."}
                    </p>
                    {imageList.length > 0 ? (
                      <p className="field-hint">{imageList.length} review image(s) attached.</p>
                    ) : null}

                    <label className="field">
                      <span>Seller reply</span>
                      <textarea
                        rows="3"
                        value={draft.sellerReply}
                        onChange={(event) =>
                          handleDraftChange(orderId, "sellerReply", event.target.value)
                        }
                        placeholder="Write a response or internal handling note."
                      />
                    </label>

                    <div className="field-row">
                      <label className="field">
                        <span>Storefront visibility</span>
                        <select
                          value={draft.visibleToStorefront ? "public" : "hidden"}
                          onChange={(event) =>
                            handleDraftChange(
                              orderId,
                              "visibleToStorefront",
                              event.target.value === "public"
                            )
                          }
                        >
                          <option value="public">Public</option>
                          <option value="hidden">Hidden</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>Admin escalation</span>
                        <select
                          value={draft.flaggedForAdmin ? "flagged" : "normal"}
                          onChange={(event) =>
                            handleDraftChange(
                              orderId,
                              "flaggedForAdmin",
                              event.target.value === "flagged"
                            )
                          }
                        >
                          <option value="normal">Normal</option>
                          <option value="flagged">Flag for admin</option>
                        </select>
                      </label>
                    </div>

                    <div className="seller-settings-actions">
                      <button
                        className="btn primary"
                        type="button"
                        disabled={savingReviewId === orderId}
                        onClick={() => saveReview(orderId)}
                      >
                        {savingReviewId === orderId ? "Saving..." : "Save review settings"}
                      </button>
                    </div>
                  </article>
                );
              })}
              {filteredOrders.length === 0 ? (
                <p className="field-hint">No reviews match this filter yet.</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
