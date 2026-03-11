import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { getProductImage } from "../utils/productMedia";
import { addToCart, getCart, removeFromCart, updateQuantity } from "../utils/cart";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

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
const readStoredUserRole = () => {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return String(parsed?.role || "").trim().toLowerCase();
  } catch {
    return "";
  }
};

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
  return "Delivery timeline will be shared by seller";
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
  const [recoVisibleCount, setRecoVisibleCount] = useState(getRecoVisibleCount);
  const [recoStartIndex, setRecoStartIndex] = useState(0);
  const [notice, setNotice] = useState("");
  const [userRole, setUserRole] = useState(() => readStoredUserRole());
  const navigate = useNavigate();
  const isSellerAccount = userRole === "seller";

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
    }
  }, [navigate]);

  useEffect(() => {
    const syncUserRole = () => setUserRole(readStoredUserRole());
    window.addEventListener("user:updated", syncUserRole);
    return () => window.removeEventListener("user:updated", syncUserRole);
  }, []);

  useEffect(() => {
    let ignore = false;

    const loadCatalog = async () => {
      try {
        const res = await fetch(`${API_URL}/api/products`);
        if (!res.ok) return;
        const data = await res.json();
        if (ignore) return;
        const products = Array.isArray(data)
          ? data
          : Array.isArray(data?.items)
            ? data.items
            : [];
        if (products.length > 0) setCatalogPool(products);
      } catch {
        // Live data only. Keep recommendations empty on failure.
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
              <h2>Your cart is empty</h2>
              <p>Add your favorite gifts to get started.</p>
            </div>
          </div>
          <button
            className="btn ghost"
            type="button"
            onClick={() => navigate("/products")}
          >
            Go to products
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
            <span>Keep shopping</span>
          </button>
        </div>

        <div className="cart-grid">
          <div className="cart-list modern">
          {items.map((item) => {
            const productId = String(item?.id || item?._id || "").trim();
            const basePrice = getItemPrice(item);
            const customizationCharge = getCustomizationCharge(item);
            const unitPrice = basePrice + customizationCharge;
            const lineTotal = unitPrice * item.quantity;
            const selectedOptions = Object.values(
              item.customization?.selectedOptions || {}
            ).filter(Boolean);

            return (
              <article key={productId || item.name} className="cart-line-item">
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
                      onClick={() => setItems(removeFromCart(productId))}
                      aria-label={`Remove ${item.name}`}
                    >
                      x
                    </button>
                  </div>

                  <p className="cart-line-delivery">{getDeliveryText(item)}</p>
                  <p className="cart-line-unit">₹{formatPrice(unitPrice)} each</p>

                  {selectedOptions.length > 0 && (
                    <p className="cart-line-meta">
                      Options: {selectedOptions.join(", ")}
                    </p>
                  )}

                  {item.customization?.wishCardText && (
                    <p className="cart-line-meta">
                      Wish card: {item.customization.wishCardText}
                    </p>
                  )}

                  <label className="cart-qty-block">
                    <span>Quantity</span>
                    <select
                      value={item.quantity}
                      onChange={(event) => {
                        const qty = Number(event.target.value) || 1;
                        setItems(updateQuantity(productId, qty));
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
                if (isSellerAccount) {
                  setNotice("Seller account cannot place orders. Use a customer account.");
                  return;
                }
                navigate("/checkout");
              }}
              disabled={isSellerAccount}
            >
              Checkout
            </button>
            {notice && <p className="field-hint">{notice}</p>}

            <div className="cart-or-divider">OR</div>

            <div className="cart-express">
              <p>Express checkout</p>
              <button className="cart-express-btn" type="button">
                UPI / Cards
              </button>
              <button className="cart-express-btn" type="button">
                PayPal
              </button>
            </div>

            <div className="cart-summary-breakup">
              <div className="cart-summary-line">
                <span>Subtotal</span>
                <span>₹{formatPrice(subtotal)}</span>
              </div>
              {customizationTotal > 0 && (
                <div className="cart-summary-line">
                <span>Customization charges</span>
                <span>₹{formatPrice(customizationTotal)}</span>
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>

      {recommendations.length > 0 && (
        <section className="cart-reco-section" aria-label="You might also like">
          <div className="cart-reco-head">
            <h3>You might also like</h3>
          </div>
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
                        if (isSellerAccount) {
                          setNotice("Seller account cannot place orders. Use a customer account.");
                          return;
                        }
                        setItems(addToCart(toCartItem(item)));
                      }}
                      disabled={isSellerAccount}
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
        </section>
      )}
    </div>
  );
}
