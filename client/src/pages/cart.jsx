import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { getProductImage } from "../utils/productMedia";
import { clearBuyNowCheckoutItem } from "../utils/buyNowCheckout";
import { addToCart, getCart, removeFromCart, updateQuantity } from "../utils/cart";
import {
  buildAddonItemSummary,
  buildBaseSelectionSummary,
  getBulkHamperCount,
  getCustomizationBaseItems,
  isBulkHamperCustomization,
} from "../utils/hamperBuildSummary";
import {
  getPurchaseBlockedMessage,
  isPurchaseBlockedRole,
  readStoredSessionClaims,
} from "../utils/authRoute";
import { fetchJsonCached } from "../utils/jsonCache";

import { API_URL } from "../apiBase";

const isGenericHamperItem = (item) =>
  Boolean(String(item?.customization?.catalogSellerId || "").trim());
const getCustomizationCharge = (item) =>
  Number(item?.customization?.makingCharge || 0);
const getItemPrice = (item) => {
  if (isGenericHamperItem(item)) return 0;
  if (typeof item?.price === "number" && Number.isFinite(item.price)) {
    return item.price;
  }
  const parsed = Number(String(item?.price ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatPrice = (value) => Number(value || 0).toLocaleString("en-IN");

const getDeliveryText = (item) => {
  const min = Math.max(0, Number(item?.deliveryMinDays || 0));
  const maxRaw = Math.max(0, Number(item?.deliveryMaxDays || 0));
  const max = min > 0 ? Math.max(maxRaw, min) : maxRaw;

  if (min > 0 && max > 0) {
    return `Delivery: ${min} to ${max} day(s)`;
  }
  if (min > 0) {
    return `Delivery: ${min} day(s)`;
  }
  if (max > 0) {
    return `Delivery: up to ${max} day(s)`;
  }
  return "Delivery timeline will be confirmed soon";
};

const getRecoVisibleCount = () => {
  if (typeof window === "undefined") return 4;
  const width = window.innerWidth;
  if (width <= 560) return 1;
  if (width <= 900) return 2;
  if (width <= 1200) return 3;
  return 4;
};

export default function Cart() {
  const [items, setItems] = useState(() => getCart());
  const [catalogPool, setCatalogPool] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [recoVisibleCount, setRecoVisibleCount] = useState(getRecoVisibleCount);
  const [recoStartIndex, setRecoStartIndex] = useState(0);
  const [notice, setNotice] = useState("");
  const [sessionClaims, setSessionClaims] = useState(() => readStoredSessionClaims());
  const navigate = useNavigate();
  const userRole = sessionClaims.role;
  const isPurchaseBlocked = isPurchaseBlockedRole(userRole);
  const purchaseBlockedMessage = getPurchaseBlockedMessage(userRole);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token || sessionClaims.isExpired) {
      navigate("/login");
    }
  }, [navigate, sessionClaims.isExpired]);

  useEffect(() => {
    const syncSessionClaims = () => setSessionClaims(readStoredSessionClaims());
    window.addEventListener("user:updated", syncSessionClaims);
    return () => window.removeEventListener("user:updated", syncSessionClaims);
  }, []);

  useEffect(() => {
    let ignore = false;

    const loadCatalog = async () => {
      try {
        setCatalogLoading(true);
        setCatalogError("");
        const params = new URLSearchParams({
          page: "1",
          limit: "18",
          sort: "newest",
        });
        const data = await fetchJsonCached(`${API_URL}/api/products?${params.toString()}`, {
          ttlMs: 60_000,
        });
        if (ignore) return;
        const products = Array.isArray(data)
          ? data
          : Array.isArray(data?.items)
            ? data.items
            : [];
        setCatalogPool(products);
      } catch {
        if (ignore) return;
        setCatalogPool([]);
        setCatalogError("Recommendations could not be loaded right now.");
      } finally {
        if (!ignore) setCatalogLoading(false);
      }
    };

    loadCatalog();

    return () => {
      ignore = true;
    };
  }, []);

  const subtotal = items.reduce(
    (sum, item) => sum + getItemPrice(item) * item.quantity,
    0
  );
  const customizationTotal = items.reduce(
    (sum, item) => sum + getCustomizationCharge(item) * item.quantity,
    0
  );
  const customizationChargeLabel =
    items.length > 0 && items.every((item) => isGenericHamperItem(item))
      ? "Making charge"
      : "Customization charges";
  const itemsTotal = subtotal + customizationTotal;
  const deliveryCharge = itemsTotal >= 999 ? 0 : 99;
  const payableTotal = itemsTotal + deliveryCharge;

  const cartIdSet = useMemo(
    () => new Set(items.map((item) => String(item.id))),
    [items]
  );

  const recommendations = useMemo(
    () =>
      catalogPool
        .filter((item) => {
          const id = String(item?._id ?? item?.id ?? "");
          return id && !cartIdSet.has(id);
        })
        .slice(0, 6),
    [catalogPool, cartIdSet]
  );
  const normalizedRecoStart =
    recommendations.length > 0 ? recoStartIndex % recommendations.length : 0;

  const visibleRecommendations = useMemo(() => {
    const total = recommendations.length;
    if (total === 0) return [];

    const count = Math.min(recoVisibleCount, total);
    return Array.from({ length: count }, (_, offset) => {
      const index = (normalizedRecoStart + offset) % total;
      return recommendations[index];
    });
  }, [recommendations, recoVisibleCount, normalizedRecoStart]);

  const toCartItem = (item) => ({
    id: item._id || item.id,
    name: item.name,
    price: Number(item.price || 0),
    mrp: Number(item.mrp || 0),
    isCustomizable: Boolean(item.isCustomizable),
    category: item.category,
    deliveryMinDays: Number(item.deliveryMinDays || 0),
    deliveryMaxDays: Number(item.deliveryMaxDays || 0),
    image: getProductImage(item),
    seller: {
      id: String(item?.seller?._id || item?.seller?.id || "").trim(),
      name: String(item?.seller?.name || "").trim(),
      storeName: String(item?.seller?.storeName || "").trim(),
      profileImage: String(item?.seller?.profileImage || "").trim(),
    },
  });

  const handleRecoArrow = (direction) => {
    const total = recommendations.length;
    if (total <= 1) return;
    const step = direction > 0 ? 1 : -1;
    setRecoStartIndex((prev) => (prev + step + total) % total);
  };

  useEffect(() => {
    const syncRecoLayout = () => setRecoVisibleCount(getRecoVisibleCount());
    syncRecoLayout();
    window.addEventListener("resize", syncRecoLayout);
    return () => window.removeEventListener("resize", syncRecoLayout);
  }, []);

  const guardPurchaseAction = () => {
    const token = localStorage.getItem("token");
    if (!token || sessionClaims.isExpired) {
      navigate("/login");
      return false;
    }
    if (isPurchaseBlocked) {
      setNotice(purchaseBlockedMessage);
      return false;
    }
    return true;
  };

  if (items.length === 0) {
    return (
      <div className="page">
        <Header />
        <div className="cart-empty" role="status" aria-live="polite">
          <div className="cart-empty-copy">
            <span className="cart-empty-icon" aria-hidden="true">
              🛒
            </span>
            <div>
              <h2>Your cart is waiting for something special</h2>
              <p>Add handcrafted finds and curated hampers to begin your order.</p>
            </div>
          </div>
          <button
            className="btn ghost"
            type="button"
            onClick={() => navigate("/products")}
          >
            Browse collections
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <Header />
      <section className="cart-shell">
        <div className="cart-top-strip">
          <button
            className="cart-keep-shopping"
            type="button"
            onClick={() => navigate("/products")}
          >
            <span className="cart-keep-shopping-icon" aria-hidden="true">
              ←
            </span>
            <span>Continue browsing</span>
          </button>
        </div>

        <div className="cart-grid">
          <div className="cart-list modern">
          {items.map((item) => {
            const productId = String(item?.id || item?._id || "").trim();
            const cartItemKey = String(item?.cartItemKey || productId).trim();
            const basePrice = getItemPrice(item);
            const customizationCharge = getCustomizationCharge(item);
            const unitPrice = basePrice + customizationCharge;
            const lineTotal = unitPrice * item.quantity;
            const variantLabel = String(item?.selectedVariant?.label || "").trim();
            const selectedOptions = Object.values(
              item.customization?.selectedOptions || {}
            ).filter(Boolean);
            const baseSelections = buildBaseSelectionSummary(item.customization, 3);
            const addonSelections = buildAddonItemSummary(item.customization, 3);
            const totalHampers = getBulkHamperCount(item.customization);
            const isBulkBuild = isBulkHamperCustomization(item.customization);
            const hasBaseSelection = getCustomizationBaseItems(item.customization).length > 0;

            return (
              <article key={cartItemKey || item.name} className="cart-line-item">
                <Link to={productId ? `/products/${productId}` : "/products"}>
                  <img
                    className="cart-line-thumb"
                    src={getProductImage(item)}
                    alt={item.name}
                  />
                </Link>

                <div className="cart-line-info">
                  <div className="cart-line-head">
                    <h3>{item.name}</h3>
                    <button
                      className="cart-line-remove"
                      type="button"
                      onClick={() => setItems(removeFromCart(cartItemKey))}
                      aria-label={`Remove ${item.name}`}
                    >
                      x
                    </button>
                  </div>

                  <p className="cart-line-delivery">{getDeliveryText(item)}</p>
                  <p className="cart-line-unit">₹{formatPrice(unitPrice)} each</p>
                  {variantLabel ? <p className="cart-line-meta">Variant: {variantLabel}</p> : null}

                  {selectedOptions.length > 0 && (
                    <p className="cart-line-meta">
                      Options: {selectedOptions.join(", ")}
                    </p>
                  )}

                  {hasBaseSelection && (
                    <p className="cart-line-meta">
                      {isBulkBuild && totalHampers > 0
                        ? `Hamper count: ${totalHampers}`
                        : "Base selected"}
                    </p>
                  )}

                  {baseSelections && (
                    <p className="cart-line-meta">
                      {isBulkBuild ? "Base mix" : "Base"}: {baseSelections}
                    </p>
                  )}

                  {addonSelections && (
                    <p className="cart-line-meta">
                      {isBulkBuild ? "Shared items" : "Items"}: {addonSelections}
                    </p>
                  )}

                  {item.customization?.wishCardText && (
                    <p className="cart-line-meta">
                      Wish card: {item.customization.wishCardText}
                    </p>
                  )}

                  {item.customization?.specialNote && (
                    <p className="cart-line-meta">
                      Note: {item.customization.specialNote}
                    </p>
                  )}

                  <label className="cart-qty-block">
                    <span>Quantity</span>
                    <select
                      value={item.quantity}
                      onChange={(event) => {
                        const qty = Number(event.target.value) || 1;
                        setItems(updateQuantity(cartItemKey, qty));
                      }}
                    >
                      {Array.from({ length: 10 }, (_, idx) => idx + 1).map((qty) => (
                        <option key={qty} value={qty}>
                          {qty}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <p className="cart-line-total">₹{formatPrice(lineTotal)}</p>
              </article>
            );
          })}
          </div>

          <aside className="cart-summary-panel">
            <div className="cart-summary-line">
              <span>Delivery costs</span>
              <strong>{deliveryCharge === 0 ? "Free" : `₹${formatPrice(deliveryCharge)}`}</strong>
            </div>
            <div className="cart-summary-line total">
              <span>Total incl. GST</span>
              <strong>₹{formatPrice(payableTotal)}</strong>
            </div>

            <button
              className="cart-checkout-btn"
              type="button"
              onClick={() => {
                if (!guardPurchaseAction()) return;
                clearBuyNowCheckoutItem();
                navigate("/checkout");
              }}
              disabled={isPurchaseBlocked}
            >
              Checkout
            </button>
            {notice && <p className="field-hint">{notice}</p>}

            <div className="cart-or-divider">Info</div>
            <div className="cart-express">
              <p>Secure checkout</p>
              <p className="field-hint">
                Payment options are shown during checkout based on what is configured for the
                store.
              </p>
            </div>

            <div className="cart-summary-breakup">
              <div className="cart-summary-line">
                <span>Subtotal</span>
                <span>₹{formatPrice(subtotal)}</span>
              </div>
              {customizationTotal > 0 && (
                <div className="cart-summary-line">
                <span>{customizationChargeLabel}</span>
                <span>₹{formatPrice(customizationTotal)}</span>
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>

      {(catalogLoading || catalogError || recommendations.length > 0) && (
        <section className="cart-reco-section" aria-label="You might also like">
          <div className="cart-reco-head">
            <h3>You might also like</h3>
          </div>
          {catalogLoading ? (
            <p className="field-hint">Loading recommendations...</p>
          ) : catalogError ? (
            <p className="field-hint">{catalogError}</p>
          ) : (
            <div className="cart-reco-rail">
              <button
                type="button"
                className="cart-reco-side-btn left"
                aria-label="Previous recommendation"
                onClick={() => handleRecoArrow(-1)}
                disabled={recommendations.length <= 1}
              >
                &#8249;
              </button>
              <div className="cart-reco-carousel">
                <div className="cart-reco-row">
                  {visibleRecommendations.map((item) => (
                    <article key={item._id || item.id} className="cart-reco-card">
                      <button
                        type="button"
                        className="cart-reco-image-btn"
                        onClick={() =>
                          navigate(item?._id ? `/products/${item._id}` : "/products")
                        }
                      >
                        <img
                          className="cart-reco-thumb"
                          src={getProductImage(item)}
                          alt={item.name}
                          loading="lazy"
                        />
                      </button>
                      <h4>{item.name}</h4>
                      <p>₹{formatPrice(item.price)}</p>
                      <button
                        className="cart-reco-add-btn"
                        type="button"
                        onClick={() => {
                          if (!guardPurchaseAction()) return;
                          setItems(addToCart(toCartItem(item)));
                        }}
                        disabled={isPurchaseBlocked}
                      >
                        Add to cart
                      </button>
                    </article>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="cart-reco-side-btn right"
                aria-label="Next recommendation"
                onClick={() => handleRecoArrow(1)}
                disabled={recommendations.length <= 1}
              >
                &#8250;
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
