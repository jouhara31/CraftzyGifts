import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { clearCart, getCart } from "../utils/cart";
import { getProductImage } from "../utils/productMedia";

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
const hasReferenceImages = (customization) => {
  if (!customization || typeof customization !== "object") return false;
  if (Array.isArray(customization.referenceImageUrls)) {
    return customization.referenceImageUrls.some((value) => String(value || "").trim());
  }
  return Boolean(String(customization.referenceImageUrl || "").trim());
};
const formatPrice = (value) => Number(value || 0).toLocaleString("en-IN");
const ONLINE_PAYMENT_MODES = new Set(["upi", "card"]);
const toSafeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const buildStockErrorMessage = (item, details, fallbackMessage) => {
  const type = String(details?.type || "").trim().toLowerCase();
  const requestedQty = Math.max(0, toSafeNumber(details?.requestedQty));
  const availableQty = Math.max(0, toSafeNumber(details?.availableQty));

  if (type === "customization_stock") {
    const itemName = String(details?.itemName || "").trim() || "customization item";
    return `${item?.name || "This product"} - ${itemName} stock is low (needed ${requestedQty}, available ${availableQty}).`;
  }

  if (type === "product_stock") {
    const productName = String(details?.productName || item?.name || "This product").trim();
    return `${productName} stock is low (needed ${requestedQty}, available ${availableQty}).`;
  }

  const fallback = String(fallbackMessage || "").trim();
  if (fallback.toLowerCase().includes("out of stock")) {
    const productName = String(item?.name || "Selected item").trim();
    return `${productName} is out of stock.`;
  }
  if (fallback.toLowerCase().includes("insufficient stock")) {
    const productName = String(item?.name || "Selected item").trim();
    return `${productName} stock is low. ${fallback}`;
  }

  return fallbackMessage;
};

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

const normalizeCheckoutItem = (item = {}) => {
  const id = String(item?.id || item?._id || "").trim();
  if (!id) return null;

  const parsedQty = Number.parseInt(item?.quantity, 10);
  return {
    ...item,
    id,
    quantity: Number.isInteger(parsedQty) && parsedQty > 0 ? parsedQty : 1,
  };
};

export default function Checkout() {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    pincode: "",
    paymentMode: "cod",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sellerPanel, setSellerPanel] = useState({
    loading: false,
    seller: null,
    products: [],
    stats: null,
  });
  const [userRole, setUserRole] = useState(() => readStoredUserRole());
  const location = useLocation();
  const navigate = useNavigate();
  const cartItems = getCart();
  const buyNowItem = useMemo(
    () => normalizeCheckoutItem(location.state?.buyNowItem),
    [location.state]
  );
  const items = buyNowItem ? [buyNowItem] : cartItems;
  const primaryItem = items[0] || null;
  const needsReferenceUpload = items.some(
    (item) => Boolean(item?.isCustomizable) && !hasReferenceImages(item?.customization)
  );
  const primarySellerId = String(
    primaryItem?.seller?.id || primaryItem?.seller?._id || ""
  ).trim();
  const subtotal = items.reduce(
    (sum, item) => sum + getItemPrice(item) * item.quantity,
    0
  );
  const customizationTotal = items.reduce(
    (sum, item) => sum + getCustomizationCharge(item) * item.quantity,
    0
  );
  const deliveryCharge = subtotal + customizationTotal >= 999 ? 0 : 99;
  const total = subtotal + customizationTotal + deliveryCharge;
  const isOnlinePayment = ONLINE_PAYMENT_MODES.has(form.paymentMode);
  const isSellerAccount = userRole === "seller";

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

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

    const loadSellerPanel = async () => {
      if (!buyNowItem || !primarySellerId) {
        if (!ignore) {
          setSellerPanel({ loading: false, seller: null, products: [], stats: null });
        }
        return;
      }

      setSellerPanel((current) => ({ ...current, loading: true }));
      try {
        const res = await fetch(`${API_URL}/api/products/seller/${primarySellerId}/public?limit=10`);
        if (!res.ok) {
          throw new Error("Unable to load seller panel.");
        }
        const data = await res.json();
        if (ignore) return;
        setSellerPanel({
          loading: false,
          seller: data?.seller || null,
          products: Array.isArray(data?.products) ? data.products : [],
          stats: data?.stats || null,
        });
      } catch {
        if (ignore) return;
        setSellerPanel({ loading: false, seller: null, products: [], stats: null });
      }
    };

    loadSellerPanel();
    return () => {
      ignore = true;
    };
  }, [buyNowItem, primarySellerId]);

  const sellerDisplayName = String(
    sellerPanel?.seller?.storeName ||
      sellerPanel?.seller?.name ||
      primaryItem?.seller?.storeName ||
      primaryItem?.seller?.name ||
      ""
  ).trim();
  const similarProducts = useMemo(() => {
    if (!buyNowItem) return [];
    const itemId = String(primaryItem?.id || primaryItem?._id || "").trim();
    const category = String(primaryItem?.category || "").trim().toLowerCase();
    const source = Array.isArray(sellerPanel?.products) ? sellerPanel.products : [];
    return source
      .filter((item) => String(item?._id || item?.id || "").trim() !== itemId)
      .sort((left, right) => {
        const leftScore =
          String(left?.category || "").trim().toLowerCase() === category ? 1 : 0;
        const rightScore =
          String(right?.category || "").trim().toLowerCase() === category ? 1 : 0;
        if (leftScore !== rightScore) return rightScore - leftScore;
        return (
          new Date(right?.createdAt || 0).getTime() -
          new Date(left?.createdAt || 0).getTime()
        );
      })
      .slice(0, 3);
  }, [buyNowItem, primaryItem, sellerPanel]);

  const placeOrder = async () => {
    setError("");
    if (isSellerAccount) {
      setError("Seller account cannot place orders. Use a customer account.");
      return;
    }
    const token = localStorage.getItem("token");
    if (!token) {
      setError("Please login to place your order.");
      navigate("/login");
      return;
    }

    if (items.length === 0) {
      setError("Your cart is empty.");
      return;
    }

    if (!form.name || !form.phone || !form.line1 || !form.city || !form.state || !form.pincode) {
      setError("Please fill in all required delivery details.");
      return;
    }

    setLoading(true);
    try {
      const createdOrders = [];
      for (const item of items) {
        const res = await fetch(`${API_URL}/api/orders`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            productId: item.id,
            quantity: item.quantity,
            customization: item.customization,
            shippingAddress: {
              name: form.name,
              phone: form.phone,
              line1: form.line1,
              line2: form.line2,
              city: form.city,
              state: form.state,
              pincode: form.pincode,
            },
            paymentMode: form.paymentMode,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(
            buildStockErrorMessage(item, data?.details, data?.message || "Order failed")
          );
        }

        const created = await res.json();
        createdOrders.push(created);
      }

      if (isOnlinePayment) {
        for (const created of createdOrders) {
          const payRes = await fetch(`${API_URL}/api/orders/${created._id}/pay`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ result: "success" }),
          });

          const payData = await payRes.json();
          if (!payRes.ok) {
            throw new Error(
              buildStockErrorMessage(
                items.find((entry) => String(entry.id) === String(created?.product?._id)) || null,
                payData?.details,
                payData.message || "Payment verification failed"
              )
            );
          }
        }
      }

      if (!buyNowItem) {
        clearCart();
      }
      navigate("/orders", {
        state: {
          notice: isOnlinePayment
            ? "Order placed and payment verified."
            : "Order placed successfully.",
        },
      });
    } catch (err) {
      setError(err.message || "Order failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <Header />
      <div className="section-head">
        <div>
          <h2>Checkout</h2>
          <p>Enter address, choose payment mode, and confirm your order.</p>
        </div>
        <Link className="link" to="/products">
          Continue shopping
        </Link>
      </div>

      <div className="customize-grid">
        <div className="form-card">
          <h3>Delivery details</h3>
          {error && <p className="field-hint">{error}</p>}
          {isSellerAccount && (
            <p className="field-hint">
              Seller account cannot place orders. Login with a customer account.
            </p>
          )}
          {items.length === 0 && (
            <p className="field-hint">Your cart is empty.</p>
          )}
          <div className="field">
            <label>Full name</label>
            <input name="name" placeholder="Name" value={form.name} onChange={handleChange} />
          </div>
          <div className="field">
            <label>Phone</label>
            <input name="phone" placeholder="Phone" value={form.phone} onChange={handleChange} />
          </div>
          <div className="field">
            <label>Address</label>
            <textarea
              name="line1"
              placeholder="House, street"
              value={form.line1}
              onChange={handleChange}
            />
          </div>
          <div className="field">
            <label>Area / Landmark</label>
            <input name="line2" placeholder="Area, landmark" value={form.line2} onChange={handleChange} />
          </div>
          <div className="field-row">
            <div className="field">
              <label>City</label>
              <input name="city" placeholder="City" value={form.city} onChange={handleChange} />
            </div>
            <div className="field">
              <label>State</label>
              <input name="state" placeholder="State" value={form.state} onChange={handleChange} />
            </div>
            <div className="field">
              <label>Pincode</label>
              <input name="pincode" placeholder="Pincode" value={form.pincode} onChange={handleChange} />
            </div>
          </div>
          <div className="field">
            <label>Payment mode</label>
            <select name="paymentMode" value={form.paymentMode} onChange={handleChange}>
              <option value="cod">Cash on delivery</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
            </select>
            {isOnlinePayment && (
              <p className="field-hint">
                You will complete payment now and order will be marked paid instantly.
              </p>
            )}
          </div>
        </div>

        <div className="summary-card">
          <div className="card-head">
            <p className="card-title">Order summary</p>
            <span className="chip">{items.length} items</span>
          </div>
          <div className="price-summary">
            <div className="price-row">
              <span>Hamper price</span>
              <span>₹{formatPrice(subtotal)}</span>
            </div>
            {customizationTotal > 0 && (
              <div className="price-row">
                <span>Customization charges</span>
                <span>₹{formatPrice(customizationTotal)}</span>
              </div>
            )}
            <div className="price-row">
              <span>Delivery</span>
              <span>{deliveryCharge === 0 ? "Free" : `₹${deliveryCharge}`}</span>
            </div>
            <div className="price-row total">
              <span>Total</span>
              <span>₹{formatPrice(total)}</span>
            </div>
          </div>
          {needsReferenceUpload && (
            <p className="field-hint">
              Personalized image needed? Please choose Customize to upload your image before
              placing the order.
            </p>
          )}
          <button
            className="btn primary"
            type="button"
            onClick={placeOrder}
            disabled={loading || items.length === 0 || isSellerAccount}
          >
            {loading ? "Placing..." : "Place order"}
          </button>

          {buyNowItem && sellerDisplayName && primarySellerId && (
            <section className="checkout-seller-panel">
              <div className="card-head">
                <p className="card-title">Seller details</p>
                <span className="chip">{sellerPanel?.stats?.totalProducts || 0} products</span>
              </div>
              <div className="checkout-seller-row">
                <span className="checkout-mini-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path
                      d="M4.5 9.25c0-1.8 1.45-3.25 3.25-3.25h8.5c1.8 0 3.25 1.45 3.25 3.25v8.5c0 1.8-1.45 3.25-3.25 3.25h-8.5c-1.8 0-3.25-1.45-3.25-3.25v-8.5Z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                    <path
                      d="M8 12h8M12 8v8"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <strong>{sellerDisplayName}</strong>
              </div>
              <div className="checkout-seller-row">
                <span className="checkout-mini-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path
                      d="M4 6.5h16v11H4z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                    <path
                      d="m4.5 7 7.5 6 7.5-6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                  </svg>
                </span>
                <span>
                  {String(
                    sellerPanel?.seller?.supportEmail ||
                      sellerPanel?.seller?.phone ||
                      "Secure contact form available in store profile"
                  ).trim()}
                </span>
              </div>
              <Link className="btn ghost checkout-seller-visit" to={`/store/${primarySellerId}`}>
                Visit Store
              </Link>

              <div className="checkout-similar-head">
                <p className="pdp-option-label">Similar products</p>
              </div>
              {sellerPanel.loading ? (
                <p className="field-hint">Loading similar products...</p>
              ) : similarProducts.length > 0 ? (
                <div className="checkout-similar-grid">
                  {similarProducts.map((item) => (
                    <article key={item._id} className="checkout-similar-item">
                      <img src={getProductImage(item)} alt={item.name} loading="lazy" />
                      <div>
                        <p>{item.name}</p>
                        <small>₹{formatPrice(item.price)}</small>
                        <Link to={`/products/${item._id}`}>View</Link>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="field-hint">No similar products from this seller yet.</p>
              )}
            </section>
          )}

        </div>
      </div>
    </div>
  );
}
