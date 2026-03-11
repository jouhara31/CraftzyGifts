import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { getProductImage } from "../utils/productMedia";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const ONLINE_PAYMENT_MODES = new Set(["upi", "card"]);
const ACTIVE_ORDER_STATUSES = new Set(["placed", "processing", "shipped", "return_requested"]);
const COMPLETED_ORDER_STATUSES = new Set(["delivered", "refunded"]);
const LEGACY_OPTION_LABELS = {
  giftBoxes: "Gift box",
  chocolates: "Chocolates",
  frames: "Frame style",
  perfumes: "Perfume",
  cards: "Card type",
};
const ORDER_STATUS_LABELS = {
  pending_payment: "Awaiting payment",
  placed: "Order placed",
  processing: "In preparation",
  shipped: "Shipped",
  delivered: "Delivered",
  return_requested: "Return requested",
  return_rejected: "Return rejected",
  refund_initiated: "Refund in progress",
  refunded: "Refunded",
  cancelled: "Cancelled",
};
const ORDER_STATUS_TONES = {
  pending_payment: "warning",
  placed: "info",
  processing: "info",
  shipped: "success",
  delivered: "success",
  return_requested: "warning",
  return_rejected: "locked",
  refund_initiated: "warning",
  refunded: "success",
  cancelled: "locked",
};
const PAYMENT_MODE_LABELS = {
  cod: "Cash on delivery",
  upi: "UPI",
  card: "Card",
};
const PAYMENT_STATUS_LABELS = {
  pending: "Pending",
  paid: "Paid",
  failed: "Failed",
  refunded: "Refunded",
};
const ORDER_PROGRESS_STEPS = ["Placed", "Processing", "Shipped", "Delivered"];
const ORDER_PROGRESS_INDEX = {
  pending_payment: -1,
  placed: 0,
  processing: 1,
  shipped: 2,
  delivered: 3,
  return_requested: 3,
  return_rejected: 3,
  refund_initiated: 3,
  refunded: 3,
  cancelled: 0,
};
const REVIEW_MAX_LENGTH = 280;
const REVIEW_RATINGS = [5, 4, 3, 2, 1];
const REVIEW_IMAGE_LIMIT = 4;
const REVIEW_IMAGE_MAX_SIZE_BYTES = 3 * 1024 * 1024;
const USER_PROFILE_IMAGE_KEY = "user_profile_image";

const asText = (value) => String(value ?? "").trim();
const asNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toTitleCase = (value = "") =>
  asText(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());

const formatCurrency = (value) => asNumber(value, 0).toLocaleString("en-IN");

const formatDate = (value) => {
  if (!value) return "Recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const formatStatusLabel = (status) =>
  ORDER_STATUS_LABELS[asText(status)] || toTitleCase(status) || "Unknown";

const formatPaymentMode = (mode) =>
  PAYMENT_MODE_LABELS[asText(mode)] || toTitleCase(mode) || "Not set";

const formatPaymentStatus = (status) =>
  PAYMENT_STATUS_LABELS[asText(status)] || toTitleCase(status) || "Unknown";

const formatShortOrderCode = (value) => {
  const text = asText(value);
  return text ? `#${text.slice(-8).toUpperCase()}` : "#ORDER";
};

const formatDeliveryWindow = (product = {}) => {
  const min = asNumber(product?.deliveryMinDays, 0);
  const max = asNumber(product?.deliveryMaxDays, 0);

  if (min > 0 && max > 0 && min !== max) return `${min}-${max} day delivery`;
  if (max > 0) return `${max} day delivery`;
  if (min > 0) return `${min} day delivery`;
  return "Made to order";
};

const formatAddressLines = (address = {}) => {
  const cityState = [asText(address.city), asText(address.state)].filter(Boolean).join(", ");
  return [
    asText(address.name),
    [asText(address.line1), asText(address.line2)].filter(Boolean).join(", "),
    cityState,
    asText(address.pincode),
    asText(address.phone) ? `Phone: ${asText(address.phone)}` : "",
  ].filter(Boolean);
};

const resolveOptionSelection = (product, key, value) => {
  const optionKey = asText(key);
  const selectedValue = asText(value);
  const catalog = Array.isArray(product?.customizationCatalog) ? product.customizationCatalog : [];
  const category = catalog.find((entry) => asText(entry?.id) === optionKey);

  const label = asText(category?.name) || LEGACY_OPTION_LABELS[optionKey] || toTitleCase(optionKey);

  if (!selectedValue) {
    return { label, value: "" };
  }

  if (!category) {
    return { label, value: selectedValue };
  }

  const matched = (Array.isArray(category.items) ? category.items : []).find((item) => {
    const itemId = asText(item?.id);
    const itemName = asText(item?.name);
    return (
      selectedValue === itemId ||
      (itemName && selectedValue.toLowerCase() === itemName.toLowerCase())
    );
  });

  return {
    label,
    value: asText(matched?.name || selectedValue),
  };
};

const getProgressState = (status, stepIndex) => {
  const currentStep = ORDER_PROGRESS_INDEX[asText(status)];
  if (currentStep == null || currentStep < 0) return "pending";
  if (stepIndex < currentStep) return "done";
  if (stepIndex === currentStep) return "active";
  return "pending";
};

const buildOrderNote = (order = {}) => {
  const status = asText(order?.status);
  const deliveryWindow = formatDeliveryWindow(order?.product);

  switch (status) {
    case "pending_payment":
      return "Waiting for payment confirmation.";
    case "placed":
      return `Seller has received your order. ${deliveryWindow}.`;
    case "processing":
      return "Your gift is being prepared.";
    case "shipped":
      return "Your order is on the way.";
    case "delivered":
      return "Delivered to your address.";
    case "return_requested":
      return "Your return request has been shared with the seller.";
    case "return_rejected":
      return "Return request was reviewed by the seller.";
    case "refund_initiated":
      return "Refund is being processed.";
    case "refunded":
      return "Refund completed for this order.";
    case "cancelled":
      return "This order was cancelled.";
    default:
      return "Track the latest update from this page.";
  }
};

const toStarText = (value) => {
  const safe = Math.min(5, Math.max(0, Math.round(Number(value) || 0)));
  return "★".repeat(safe).padEnd(5, "☆");
};

const normalizeReviewImages = (value = []) =>
  Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((entry) => String(entry || "").trim())
        .filter(
          (entry) =>
            /^https?:\/\//i.test(entry) || /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(entry)
        )
    )
  ).slice(0, REVIEW_IMAGE_LIMIT);

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read selected image."));
    reader.readAsDataURL(file);
  });

const buildReviewDraftFromOrder = (order = {}) => ({
  rating: Number(order?.review?.rating || 0),
  comment: String(order?.review?.comment || ""),
  images: normalizeReviewImages(order?.review?.images),
});

const buildReviewDraftMap = (items = []) =>
  (Array.isArray(items) ? items : []).reduce((acc, order) => {
    const orderId = String(order?._id || "").trim();
    if (!orderId) return acc;
    acc[orderId] = buildReviewDraftFromOrder(order);
    return acc;
  }, {});

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
  const [reviewingOrderId, setReviewingOrderId] = useState("");
  const [openReviewOrderId, setOpenReviewOrderId] = useState("");
  const [reviewDrafts, setReviewDrafts] = useState({});
  const navigate = useNavigate();
  const location = useLocation();

  const handleUnauthorized = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem(USER_PROFILE_IMAGE_KEY);
    window.dispatchEvent(new Event("user:updated"));
    navigate("/login", {
      replace: true,
      state: { notice: "Session expired. Please login again." },
    });
  }, [navigate]);

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
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      if (!res.ok) {
        setError(data.message || "Unable to fetch orders.");
        return;
      }
      const nextOrders = Array.isArray(data) ? data : [];
      setOrders(nextOrders);
      setReviewDrafts(buildReviewDraftMap(nextOrders));
      setError("");
    } catch {
      setError("Unable to fetch orders.");
    }
  }, [handleUnauthorized, navigate]);

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
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
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
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
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

  const updateReviewDraft = (orderId, field, value) => {
    setReviewDrafts((prev) => ({
      ...prev,
      [orderId]: {
        ...buildReviewDraftFromOrder(),
        ...(prev[orderId] || {}),
        [field]: value,
      },
    }));
  };

  const removeReviewImage = (orderId, indexToRemove) => {
    const draft = reviewDrafts[orderId] || buildReviewDraftFromOrder();
    const nextImages = normalizeReviewImages(draft.images).filter(
      (_, index) => index !== indexToRemove
    );
    updateReviewDraft(orderId, "images", nextImages);
  };

  const handleReviewImageUpload = async (orderId, event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length === 0) return;
    setError("");

    const draft = reviewDrafts[orderId] || buildReviewDraftFromOrder();
    const existingImages = normalizeReviewImages(draft.images);
    if (existingImages.length >= REVIEW_IMAGE_LIMIT) {
      setError(`You can add up to ${REVIEW_IMAGE_LIMIT} review images.`);
      return;
    }

    const remainingSlots = REVIEW_IMAGE_LIMIT - existingImages.length;
    const selectedFiles = files.slice(0, remainingSlots);
    const invalidTypeFile = selectedFiles.find(
      (file) => !String(file?.type || "").startsWith("image/")
    );
    if (invalidTypeFile) {
      setError("Please select image files only.");
      return;
    }
    const oversizedFile = selectedFiles.find(
      (file) => Number(file?.size || 0) > REVIEW_IMAGE_MAX_SIZE_BYTES
    );
    if (oversizedFile) {
      setError("Each review image must be 3MB or less.");
      return;
    }

    try {
      const uploaded = await Promise.all(selectedFiles.map((file) => fileToDataUrl(file)));
      const nextImages = normalizeReviewImages([...existingImages, ...uploaded]);
      updateReviewDraft(orderId, "images", nextImages);
    } catch {
      setError("Unable to read selected image.");
    }
  };

  const handleReviewSubmit = async (orderId) => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    const draft = reviewDrafts[orderId] || buildReviewDraftFromOrder();
    const rating = Number.parseInt(draft.rating, 10);
    const comment = String(draft.comment || "").trim();
    const images = normalizeReviewImages(draft.images);

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      setError("Please choose a rating between 1 and 5.");
      return;
    }
    if (comment.length > REVIEW_MAX_LENGTH) {
      setError(`Review should be ${REVIEW_MAX_LENGTH} characters or less.`);
      return;
    }

    setReviewingOrderId(orderId);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`${API_URL}/api/orders/${orderId}/review`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rating, comment, images }),
      });
      const raw = await res.text();
      let data = {};
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch {
          data = { message: raw };
        }
      }
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      if (!res.ok) {
        const message = String(data?.message || "").trim();
        if (message && !message.toLowerCase().includes("<!doctype")) {
          setError(message);
        } else if (raw.toLowerCase().includes("cannot patch")) {
          setError("Feedback API not available. Please restart backend server and try again.");
        } else {
          setError("Unable to send feedback.");
        }
        return;
      }
      setNotice(data.message || "Feedback sent successfully.");
      await loadOrders();
      setOpenReviewOrderId("");
    } catch {
      setError("Unable to send feedback.");
    } finally {
      setReviewingOrderId("");
    }
  };

  const summaryCards = useMemo(() => {
    const activeOrders = orders.filter((order) => ACTIVE_ORDER_STATUSES.has(asText(order?.status))).length;
    const completedOrders = orders.filter((order) =>
      COMPLETED_ORDER_STATUSES.has(asText(order?.status))
    ).length;
    const awaitingPayment = orders.filter((order) => asText(order?.status) === "pending_payment").length;
    const totalSpend = orders.reduce((sum, order) => sum + asNumber(order?.total, 0), 0);

    return [
      {
        label: "Total orders",
        value: String(orders.length),
        note: orders.length === 1 ? "One order placed so far" : "Orders placed with CraftyGifts",
      },
      {
        label: "In progress",
        value: String(activeOrders),
        note: activeOrders === 1 ? "One order is moving" : "Orders being prepared or shipped",
      },
      {
        label: "Completed",
        value: String(completedOrders),
        note: completedOrders === 1 ? "One order completed" : "Delivered and refunded orders",
      },
      {
        label: "Total spend",
        value: `₹${formatCurrency(totalSpend)}`,
        note:
          awaitingPayment > 0
            ? `${awaitingPayment} order${awaitingPayment > 1 ? "s" : ""} awaiting payment`
            : "Across all your purchases",
      },
    ];
  }, [orders]);

  return (
    <div className="page customer-orders-page">
      <Header />

      <section className="customer-orders-hero">
        <div className="customer-orders-hero-copy">
          <p className="customer-orders-eyebrow">Order archive</p>
          <h2>Your orders</h2>
          <p>Track payment, fulfillment, delivery, and feedback from one clear record.</p>
        </div>
        <div className="customer-orders-hero-actions">
          <Link className="btn ghost" to="/products">
            Browse products
          </Link>
        </div>
      </section>

      <section className="customer-orders-summary" aria-label="Order summary">
        {summaryCards.map((card) => (
          <article key={card.label} className="customer-orders-stat">
            <p>{card.label}</p>
            <strong>{card.value}</strong>
            <span>{card.note}</span>
          </article>
        ))}
      </section>

      {error ? (
        <div className="customer-orders-alert is-error">
          <p>{error}</p>
        </div>
      ) : null}
      {notice ? (
        <div className="customer-orders-alert is-success">
          <p>{notice}</p>
        </div>
      ) : null}

      {!error && orders.length === 0 ? (
        <section className="customer-orders-empty">
          <h3>No orders yet</h3>
          <p>Once you place an order, it will appear here with payment and delivery updates.</p>
          <Link className="btn primary" to="/products">
            Start shopping
          </Link>
        </section>
      ) : null}

      <div className="order-grid">
        {orders.map((order) => {
          const orderId = String(order?._id || "").trim();
          const savedRating = Number(order?.review?.rating || 0);
          const hasSavedReview = Number.isFinite(savedRating) && savedRating > 0;
          const canSubmitReview = order?.status === "delivered";
          const reviewOpen = openReviewOrderId === orderId;
          const draft = reviewDrafts[orderId] || buildReviewDraftFromOrder(order);
          const draftRating = Number(draft.rating || 0);
          const draftComment = String(draft.comment || "");
          const draftImages = normalizeReviewImages(draft.images);
          const savedReviewImages = normalizeReviewImages(order?.review?.images);
          const isBusy = actingOrderId === orderId || reviewingOrderId === orderId;
          const selectedOptionEntries = Object.entries(
            toPlainObject(order.customization?.selectedOptions)
          )
            .filter(([, value]) => Boolean(String(value || "").trim()))
            .map(([key, value]) => resolveOptionSelection(order.product, key, value))
            .filter((entry) => entry.value);
          const selectedItems = Array.isArray(order.customization?.selectedItems)
            ? order.customization.selectedItems
            : [];
          const shippingAddressLines = formatAddressLines(order?.shippingAddress);
          const noteLines = [
            order.customization?.wishCardText
              ? `Wish card: ${asText(order.customization.wishCardText)}`
              : "",
            order.customization?.specialNote
              ? `Special note: ${asText(order.customization.specialNote)}`
              : "",
            order.customization?.ideaDescription
              ? `Gift brief: ${asText(order.customization.ideaDescription)}`
              : "",
          ].filter(Boolean);
          const detailCards = [
            selectedOptionEntries.length > 0
              ? {
                  title: "Selected options",
                  lines: selectedOptionEntries.map((entry) => `${entry.label}: ${entry.value}`),
                }
              : null,
            selectedItems.length > 0
              ? {
                  title: "Selected hamper items",
                  lines: selectedItems.map(
                    (item) =>
                      `${item.name || item.mainItem || "Item"} x${asNumber(item.quantity, 1)}`
                  ),
                }
              : null,
            shippingAddressLines.length > 0
              ? {
                  title: "Delivery address",
                  lines: shippingAddressLines,
                }
              : null,
            noteLines.length > 0
              ? {
                  title: "Order notes",
                  lines: noteLines,
                }
              : null,
          ].filter(Boolean);
          const orderStatus = asText(order?.status);
          const statusTone = ORDER_STATUS_TONES[orderStatus] || "info";
          const orderCode = formatShortOrderCode(orderId);
          const orderDate = formatDate(order?.createdAt);
          const deliveryWindow = formatDeliveryWindow(order?.product);
          const sellerName = asText(order?.seller?.storeName || order?.seller?.name) || "CraftyGifts seller";
          const metaItems = [
            {
              label: "Quantity",
              value: String(asNumber(order?.quantity, 1)),
              sub: "Gift units",
            },
            {
              label: "Order total",
              value: `₹${formatCurrency(order?.total)}`,
              sub: `Price ₹${formatCurrency(order?.price)}`,
            },
            {
              label: "Payment",
              value: formatPaymentMode(order?.paymentMode),
              sub: formatPaymentStatus(order?.paymentStatus),
            },
            {
              label: "Delivery",
              value: deliveryWindow,
              sub: buildOrderNote(order),
            },
          ];
          const isGenericHamper = Boolean(
            String(order?.customization?.catalogSellerId || "").trim()
          );
          const productName = isGenericHamper
            ? "Build Your Own Hamper"
            : asText(order?.product?.name) || "Hamper";
          const productCategory = isGenericHamper
            ? "Custom hamper"
            : asText(order?.product?.category) || "Curated gift";
          const productDescription = isGenericHamper
            ? "Seller hamper customization order."
            : asText(order?.product?.description) || buildOrderNote(order);
          const productImageSource = isGenericHamper
            ? getProductImage({ category: "customgifts" })
            : getProductImage(order?.product || {});

          return (
            <article key={order._id} className="customer-order-card">
              <div className="customer-order-card-head">
                <div>
                  <p className="customer-order-kicker">{orderCode}</p>
                  <h3>{productName}</h3>
                  <p className="customer-order-subline">
                    Placed on {orderDate} with {sellerName}
                  </p>
                </div>
                <div className="customer-order-card-status">
                  <span className={`status-pill ${statusTone}`}>{formatStatusLabel(orderStatus)}</span>
                  <p>{buildOrderNote(order)}</p>
                </div>
              </div>

              <div className="customer-order-main">
                <div className="customer-order-product">
                  <img
                    className="customer-order-product-image"
                    src={productImageSource}
                    alt={productName}
                    loading="lazy"
                  />
                  <div className="customer-order-product-copy">
                    <p className="customer-order-product-category">{productCategory}</p>
                    <p className="customer-order-product-text">{productDescription}</p>
                  </div>
                </div>

                <div className="customer-order-meta-grid">
                  {metaItems.map((item) => (
                    <div key={`${orderId}-${item.label}`} className="customer-order-meta-card">
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                      <small>{item.sub}</small>
                    </div>
                  ))}
                </div>
              </div>

              <div className="customer-order-progress" aria-label={`Progress for ${productName}`}>
                {ORDER_PROGRESS_STEPS.map((step, index) => {
                  const stepState = getProgressState(orderStatus, index);
                  return (
                    <div
                      key={`${orderId}-${step}`}
                      className={`customer-order-progress-step is-${stepState}`}
                    >
                      <span className="customer-order-progress-dot" aria-hidden="true" />
                      <p>{step}</p>
                    </div>
                  );
                })}
              </div>

              {detailCards.length > 0 ? (
                <div className="customer-order-detail-grid">
                  {detailCards.map((card) => (
                    <section key={`${orderId}-${card.title}`} className="customer-order-detail-card">
                      <p className="customer-order-detail-title">{card.title}</p>
                      <div className="customer-order-detail-list">
                        {card.lines.map((line, lineIndex) => (
                          <p key={`${orderId}-${card.title}-${lineIndex}`}>{line}</p>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : null}

              {hasSavedReview ? (
                <div className="customer-order-review-block">
                  <p className="customer-order-section-title">Your feedback</p>
                  <div className="order-feedback-summary">
                    <p className="order-feedback-summary-title">
                      Your rating:
                      <span
                        className="rating-stars"
                        role="img"
                        aria-label={`${savedRating} out of 5`}
                      >
                        {toStarText(savedRating)}
                      </span>
                      <span>{savedRating}/5</span>
                    </p>
                    {order?.review?.comment ? (
                      <p className="order-feedback-summary-comment">{order.review.comment}</p>
                    ) : (
                      <p className="field-hint">No written review added.</p>
                    )}
                    {savedReviewImages.length > 0 ? (
                      <div className="order-feedback-summary-images">
                        {savedReviewImages.map((image, index) => (
                          <img
                            key={`${orderId}-summary-review-image-${index}`}
                            src={image}
                            alt={`Review image ${index + 1}`}
                            loading="lazy"
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="customer-order-actions">
                {order.status === "pending_payment" &&
                order.paymentStatus === "pending" &&
                ONLINE_PAYMENT_MODES.has(order.paymentMode) ? (
                  <button
                    className="btn primary"
                    type="button"
                    disabled={isBusy}
                    onClick={() => handlePayNow(orderId)}
                  >
                    {actingOrderId === orderId ? "Processing..." : "Pay now"}
                  </button>
                ) : null}

                {order.status === "delivered" ? (
                  <button
                    className="btn ghost"
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleReturnRequest(orderId)}
                  >
                    {actingOrderId === orderId ? "Submitting..." : "Request return"}
                  </button>
                ) : null}

                {canSubmitReview ? (
                  <button
                    className="btn ghost"
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                      setOpenReviewOrderId((prev) => (prev === orderId ? "" : orderId))
                    }
                  >
                    {reviewOpen ? "Close feedback" : hasSavedReview ? "Edit feedback" : "Rate & review"}
                  </button>
                ) : null}
              </div>

              {canSubmitReview && reviewOpen ? (
                <div className="customer-order-review-block">
                  <p className="customer-order-section-title">
                    {hasSavedReview ? "Update feedback" : "Share your feedback"}
                  </p>
                  <div className="order-feedback-card">
                    <p className="order-feedback-heading">Rate this order</p>
                    <div className="order-feedback-rating-row">
                      {REVIEW_RATINGS.map((value) => (
                        <label
                          key={`${orderId}-rating-${value}`}
                          className={`order-feedback-rating-pill ${draftRating === value ? "active" : ""}`}
                        >
                          <input
                            type="radio"
                            name={`order-rating-${orderId}`}
                            value={value}
                            checked={draftRating === value}
                            onChange={() => updateReviewDraft(orderId, "rating", value)}
                          />
                          <span>{toStarText(value)}</span>
                        </label>
                      ))}
                    </div>
                    <textarea
                      className="order-feedback-textarea"
                      value={draftComment}
                      maxLength={REVIEW_MAX_LENGTH}
                      placeholder="Write your review (optional)"
                      onChange={(event) =>
                        updateReviewDraft(orderId, "comment", event.target.value)
                      }
                    />
                    <div className="order-feedback-upload">
                      <label htmlFor={`review-image-${orderId}`}>
                        Add photos ({draftImages.length}/{REVIEW_IMAGE_LIMIT})
                      </label>
                      <input
                        id={`review-image-${orderId}`}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(event) => handleReviewImageUpload(orderId, event)}
                      />
                    </div>
                    {draftImages.length > 0 ? (
                      <div className="order-feedback-image-grid">
                        {draftImages.map((image, index) => (
                          <div
                            className="order-feedback-image-item"
                            key={`${orderId}-draft-review-image-${index}`}
                          >
                            <img
                              src={image}
                              alt={`Selected review image ${index + 1}`}
                              loading="lazy"
                            />
                            <button
                              type="button"
                              className="order-feedback-image-remove"
                              onClick={() => removeReviewImage(orderId, index)}
                              disabled={isBusy}
                              aria-label={`Remove review image ${index + 1}`}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <p className="field-hint">
                      {draftComment.length}/{REVIEW_MAX_LENGTH}
                    </p>
                    <div className="order-feedback-actions">
                      <button
                        className="btn primary"
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleReviewSubmit(orderId)}
                      >
                        {reviewingOrderId === orderId ? "Sending..." : "Send feedback"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
