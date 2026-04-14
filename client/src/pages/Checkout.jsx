import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { clearCart, getCart } from "../utils/cart";
import {
  clearBuyNowCheckoutItem,
  readBuyNowCheckoutItem,
} from "../utils/buyNowCheckout";
import { getProductImage } from "../utils/productMedia";
import { addPendingPaymentGroup } from "../utils/paymentTracking";
import { buildPaymentStatusPath } from "../utils/paymentStatusRoute";
import {
  fallbackPathForRole,
  getPurchaseBlockedMessage,
  isPurchaseBlockedRole,
  readStoredSessionClaims,
} from "../utils/authRoute";
import {
  openRazorpayCheckout,
  readStoredUserProfile,
} from "../utils/razorpayCheckout";
import {
  buildAddonItemSummary,
  buildBaseSelectionSummary,
  getBulkHamperCount,
  getCustomizationBaseItems,
  isBulkHamperCustomization,
} from "../utils/hamperBuildSummary";
import { apiFetchJson, clearAuthSession, hasActiveSession } from "../utils/authSession";
import { loadSellerStore } from "../utils/sellerStoreCache";
import {
  buildSellerShippingBreakdown,
  buildSellerShippingLookupSeed,
  getCustomizationCharge,
  getItemPrice,
  isGenericHamperItem,
  normalizeSellerShippingSummary,
} from "../utils/shippingPricing";

import { API_URL } from "../apiBase";
const hasReferenceImages = (customization) => {
  if (!customization || typeof customization !== "object") return false;
  if (Array.isArray(customization.referenceImageUrls)) {
    return customization.referenceImageUrls.some((value) => String(value || "").trim());
  }
  return Boolean(String(customization.referenceImageUrl || "").trim());
};
const formatPrice = (value) => Number(value || 0).toLocaleString("en-IN");
const ONLINE_PAYMENT_MODES = new Set(["upi", "card"]);
const PAYMENT_MODE_LABELS = {
  cod: "Cash on delivery",
  upi: "UPI",
  card: "Card",
};
const buildStockErrorMessage = (item, details, fallbackMessage) => {
  const type = String(details?.type || "").trim().toLowerCase();

  if (type === "customization_stock") {
    const itemName = String(details?.itemName || "").trim() || "customization item";
    return `${item?.name || "This product"} - ${itemName} is currently unavailable.`;
  }

  if (type === "product_stock") {
    const productName = String(details?.productName || item?.name || "This product").trim();
    const variantLabel = String(details?.variantLabel || "").trim();
    return variantLabel
      ? `${productName} - ${variantLabel} is currently unavailable.`
      : `${productName} is currently unavailable.`;
  }

  const fallback = String(fallbackMessage || "").trim();
  if (fallback.toLowerCase().includes("out of stock")) {
    const productName = String(item?.name || "Selected item").trim();
    return `${productName} is out of stock.`;
  }
  if (fallback.toLowerCase().includes("insufficient stock")) {
    const productName = String(item?.name || "Selected item").trim();
    return `${productName} is currently unavailable.`;
  }

  return fallbackMessage;
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

const hasAddressContent = (address) =>
  Boolean(
    String(address?.line1 || "").trim() ||
      String(address?.city || "").trim() ||
      String(address?.state || "").trim() ||
      String(address?.pincode || "").trim()
  );

const buildAddressLabel = (address) => {
  const parts = [
    String(address?.label || "").trim(),
    String(address?.line1 || "").trim(),
    String(address?.city || "").trim(),
    String(address?.state || "").trim(),
    String(address?.pincode || "").trim(),
  ].filter(Boolean);
  return parts.join(", ");
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
  const [sellerShippingLookup, setSellerShippingLookup] = useState(() =>
    buildSellerShippingLookupSeed(getCart())
  );
  const [shippingLookupLoading, setShippingLookupLoading] = useState(false);
  const [sessionClaims, setSessionClaims] = useState(() => readStoredSessionClaims());
  const [paymentConfig, setPaymentConfig] = useState({
    onlinePaymentsEnabled: false,
    supportedModes: ["cod"],
    isLoading: true,
  });
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [addressBookLoading, setAddressBookLoading] = useState(true);
  const [addressBookError, setAddressBookError] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const cartItems = useMemo(() => getCart(), []);
  const storedBuyNowItem = useMemo(
    () => normalizeCheckoutItem(readBuyNowCheckoutItem()),
    []
  );
  const buyNowItem = useMemo(
    () =>
      normalizeCheckoutItem(location.state?.buyNowItem) || storedBuyNowItem,
    [location.state, storedBuyNowItem]
  );
  const items = useMemo(() => (buyNowItem ? [buyNowItem] : cartItems), [buyNowItem, cartItems]);
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
  const customizationChargeLabel =
    items.length > 0 && items.every((item) => isGenericHamperItem(item))
      ? "Build total"
      : "Customization charges";
  const shippingBreakdown = useMemo(
    () => buildSellerShippingBreakdown(items, sellerShippingLookup),
    [items, sellerShippingLookup]
  );
  const deliveryCharge = shippingBreakdown.totalDeliveryCharge;
  const total = subtotal + customizationTotal + deliveryCharge;
  const userRole = sessionClaims.role;
  const sellerStatus = sessionClaims.sellerStatus;
  const isPurchaseBlocked = isPurchaseBlockedRole(userRole);
  const purchaseBlockedMessage = getPurchaseBlockedMessage(userRole);
  const isOnlinePayment =
    paymentConfig.onlinePaymentsEnabled && ONLINE_PAYMENT_MODES.has(form.paymentMode);
  const storedUserProfile = readStoredUserProfile();
  const supportedPaymentModes = paymentConfig.supportedModes.filter(
    (mode) => PAYMENT_MODE_LABELS[mode]
  );
  const primarySellerShippingSummary = normalizeSellerShippingSummary(
    sellerPanel?.seller?.shippingSummary || primaryItem?.seller?.shippingSummary
  );
  const primarySellerPolicyNote =
    primarySellerShippingSummary.freeShippingThreshold > 0
      ? `Free shipping above ₹${formatPrice(primarySellerShippingSummary.freeShippingThreshold)}`
      : primarySellerShippingSummary.defaultDeliveryCharge > 0
        ? "Seller delivery rate applied"
        : "Free shipping";
  const verifyCheckoutPayment = async ({ paymentGroupId, gatewayResponse }) => {
    const { response, data } = await apiFetchJson(
      `${API_URL}/api/orders/checkout-session/verify-payment`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentGroupId,
          ...(gatewayResponse || {}),
        }),
      }
    );

    if (response.status === 401) {
      clearAuthSession();
      throw new Error("Session expired. Please login again.");
    }
    if (!response.ok) {
      throw new Error(data?.message || "Unable to confirm payment.");
    }
    return Array.isArray(data?.orders) ? data.orders : [];
  };
  const recordCheckoutPaymentFailure = async ({ paymentGroupId, reason, gatewayResponse }) => {
    if (!paymentGroupId) return;
    try {
      await apiFetchJson(`${API_URL}/api/orders/checkout-session/payment-failed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentGroupId,
          reason,
          ...(gatewayResponse || {}),
        }),
      });
    } catch {
      // Failure reporting is best-effort; the retry path still works through payment status.
    }
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleAddressChange = (event) => {
    const nextId = String(event.target.value || "").trim();
    setSelectedAddressId(nextId);
    const selectedAddress = savedAddresses.find(
      (entry) => String(entry?.id || "").trim() === nextId
    );
    if (!selectedAddress) return;
    setForm((current) => ({
      ...current,
      line1: String(selectedAddress.line1 || "").trim(),
      line2: "",
      city: String(selectedAddress.city || "").trim(),
      state: String(selectedAddress.state || "").trim(),
      pincode: String(selectedAddress.pincode || "").trim(),
    }));
  };

  useEffect(() => {
    if (!hasActiveSession() || sessionClaims.isExpired) {
      navigate("/login", { replace: true });
      return;
    }
    if (isPurchaseBlocked) {
      navigate(fallbackPathForRole(userRole, sellerStatus), { replace: true });
    }
  }, [
    isPurchaseBlocked,
    navigate,
    sellerStatus,
    sessionClaims.isExpired,
    userRole,
  ]);

  useEffect(() => {
    const syncSessionClaims = () => setSessionClaims(readStoredSessionClaims());
    window.addEventListener("user:updated", syncSessionClaims);
    return () => window.removeEventListener("user:updated", syncSessionClaims);
  }, []);

  useEffect(() => {
    let ignore = false;

    const loadAddressBook = async () => {
      if (!hasActiveSession() || sessionClaims.isExpired) {
        if (!ignore) setAddressBookLoading(false);
        return;
      }

      try {
        setAddressBookLoading(true);
        setAddressBookError("");
        const { response: res, data } = await apiFetchJson(`${API_URL}/api/users/me`);
        if (res.status === 401) {
          clearAuthSession();
          if (!ignore) {
            setAddressBookLoading(false);
            navigate("/login", { replace: true });
          }
          return;
        }
        if (!res.ok) {
          throw new Error(data?.message || "Unable to load your saved addresses.");
        }
        if (ignore) return;

        const addressOptions = [];
        if (hasAddressContent(data?.shippingAddress)) {
          addressOptions.push({
            id: "shipping-address",
            label: "Saved shipping address",
            ...data.shippingAddress,
          });
        }
        if (Array.isArray(data?.savedAddresses)) {
          addressOptions.push(
            ...data.savedAddresses
              .filter((entry) => hasAddressContent(entry))
              .map((entry) => ({
                ...entry,
                id:
                  String(entry?.id || "").trim() ||
                  [
                    "saved-address",
                    String(entry?.label || "").trim(),
                    String(entry?.line1 || "").trim(),
                    String(entry?.pincode || "").trim(),
                  ]
                    .filter(Boolean)
                    .join("-"),
              }))
          );
        }

        setSavedAddresses(addressOptions);

        const preferredAddress = addressOptions[0] || null;
        if (preferredAddress) {
          setSelectedAddressId(String(preferredAddress.id || "").trim());
        }

        setForm((current) => ({
          ...current,
          name: current.name || String(data?.name || "").trim(),
          phone: current.phone || String(data?.phone || "").trim(),
          line1: current.line1 || String(preferredAddress?.line1 || "").trim(),
          city: current.city || String(preferredAddress?.city || "").trim(),
          state: current.state || String(preferredAddress?.state || "").trim(),
          pincode: current.pincode || String(preferredAddress?.pincode || "").trim(),
        }));
      } catch (error) {
        if (ignore) return;
        setAddressBookError(
          error?.message || "Unable to load your saved addresses."
        );
      } finally {
        if (!ignore) setAddressBookLoading(false);
      }
    };

    loadAddressBook();
    return () => {
      ignore = true;
    };
  }, [navigate, sessionClaims.isExpired]);

  useEffect(() => {
    let ignore = false;

    const loadPaymentConfig = async () => {
      try {
        const res = await fetch(`${API_URL}/api/orders/payment/config`);
        const data = await res.json();
        if (ignore) return;
        const supportedModes = Array.isArray(data?.supportedModes)
          ? data.supportedModes.filter((mode) => PAYMENT_MODE_LABELS[mode])
          : ["cod"];
        const normalizedModes = supportedModes.includes("cod")
          ? supportedModes
          : ["cod", ...supportedModes];
        setPaymentConfig({
          onlinePaymentsEnabled: Boolean(data?.onlinePaymentsEnabled),
          supportedModes: normalizedModes.length > 0 ? normalizedModes : ["cod"],
          isLoading: false,
        });
      } catch {
        if (ignore) return;
        setPaymentConfig({
          onlinePaymentsEnabled: false,
          supportedModes: ["cod"],
          isLoading: false,
        });
      }
    };

    loadPaymentConfig();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (paymentConfig.supportedModes.includes(form.paymentMode)) return;
    setForm((current) => ({ ...current, paymentMode: "cod" }));
  }, [form.paymentMode, paymentConfig.supportedModes]);

  useEffect(() => {
    let ignore = false;
    const seed = buildSellerShippingLookupSeed(items);
    setSellerShippingLookup(seed);

    const sellerIds = Array.from(
      new Set(
        items
          .map((item) => String(item?.seller?.id || item?.seller?._id || "").trim())
          .filter(Boolean)
      )
    );

    if (sellerIds.length === 0) {
      setShippingLookupLoading(false);
      return undefined;
    }

    const hydrateSellerShipping = async () => {
      setShippingLookupLoading(true);
      try {
        const results = await Promise.allSettled(
          sellerIds.map((sellerId) =>
            loadSellerStore(sellerId, {
              includeProducts: false,
              includeFeedbacks: false,
              includeProductRatings: false,
            })
          )
        );
        if (ignore) return;

        const nextLookup = { ...seed };
        results.forEach((result, index) => {
          if (result.status !== "fulfilled") return;
          const sellerId = sellerIds[index];
          const shippingSummary = result.value?.seller?.shippingSummary;
          if (sellerId && shippingSummary && typeof shippingSummary === "object") {
            nextLookup[sellerId] = shippingSummary;
          }
        });
        setSellerShippingLookup(nextLookup);
      } finally {
        if (!ignore) {
          setShippingLookupLoading(false);
        }
      }
    };

    hydrateSellerShipping();
    return () => {
      ignore = true;
    };
  }, [items]);

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
        const data = await loadSellerStore(primarySellerId, {
          limit: 10,
          includeProducts: true,
          includeFeedbacks: false,
        });
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
    if (isPurchaseBlocked) {
      setError(purchaseBlockedMessage);
      return;
    }
    if (!hasActiveSession() || sessionClaims.isExpired) {
      setError("Please login to place your order.");
      navigate("/login");
      return;
    }
    if (
      ONLINE_PAYMENT_MODES.has(form.paymentMode) &&
      !paymentConfig.onlinePaymentsEnabled
    ) {
      setForm((current) => ({ ...current, paymentMode: "cod" }));
      setError("Online payments are not available right now. Please use cash on delivery.");
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
    let onlineSessionCreated = false;
    let paymentGroupId = "";
    try {
      const { response: res, data } = await apiFetchJson(`${API_URL}/api/orders/checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: items.map((item) => ({
            productId: item.id,
            quantity: item.quantity,
            variantId: item?.selectedVariant?.id || item?.variantId,
            selectedVariant: item?.selectedVariant,
            customization: item.customization,
          })),
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
      if (res.status === 401) {
        clearAuthSession();
        setError("Session expired. Please login again.");
        navigate("/login");
        return;
      }
      if (!res.ok) {
        throw new Error(
          buildStockErrorMessage(primaryItem, data?.details, data?.message || "Order failed")
        );
      }

      if (data?.mode === "cod") {
        if (buyNowItem) {
          clearBuyNowCheckoutItem();
        }
        if (!buyNowItem) {
          clearCart();
        }
        navigate("/orders", {
          state: {
            notice: "Order placed successfully.",
          },
        });
        return;
      }

      if (!data?.checkout?.orderId || !data?.checkout?.paymentGroupId) {
        throw new Error("Payment checkout is unavailable right now. Please try again.");
      }

      onlineSessionCreated = true;
      paymentGroupId = String(data.checkout.paymentGroupId || "").trim();
      if (buyNowItem) {
        clearBuyNowCheckoutItem();
      }
      if (!buyNowItem) {
        clearCart();
      }

      const prefill = {
        name: form.name || storedUserProfile.name,
        email: storedUserProfile.email,
        contact: form.phone || storedUserProfile.contact,
      };

      const paymentResult = await openRazorpayCheckout({
        checkout: data.checkout,
        prefill,
        notes: {
          paymentGroupId,
        },
        onDismiss: () => {
          navigate(
            buildPaymentStatusPath({
              paymentGroupId,
              outcome: "cancelled",
            }),
            {
              state: {
                paymentGroupId,
                outcome: "cancelled",
                notice:
                  "Payment cancelled. Your order is still saved as pending payment and can be retried safely.",
              },
            }
          );
        },
        onSuccess: async (response) => {
          const verifiedOrders = await verifyCheckoutPayment({
            paymentGroupId,
            gatewayResponse: response,
          });
          const waitingForGateway = verifiedOrders.some(
            (order) => String(order?.paymentStatus || "").trim() !== "paid"
          );
          if (waitingForGateway) {
            addPendingPaymentGroup(paymentGroupId);
          }
          navigate(
            buildPaymentStatusPath({
              paymentGroupId,
              outcome: waitingForGateway ? "pending" : "success",
            }),
            {
              state: {
                paymentGroupId,
                outcome: waitingForGateway ? "pending" : "success",
                notice:
                  waitingForGateway
                    ? "Payment submitted. We are waiting for gateway confirmation. Orders will update automatically."
                    : "Payment confirmed successfully.",
              },
            }
          );
          return response;
        },
        onFailure: async (error) => {
          await recordCheckoutPaymentFailure({
            paymentGroupId,
            reason: error?.message,
            gatewayResponse: error?.details,
          });
        },
      });

      if (paymentResult?.dismissed) {
        return;
      }
    } catch (err) {
      if (onlineSessionCreated) {
        if (buyNowItem) {
          clearBuyNowCheckoutItem();
        }
        if (paymentGroupId) {
          addPendingPaymentGroup(paymentGroupId);
        }
        navigate(
          buildPaymentStatusPath({
            paymentGroupId,
            outcome: "failed",
          }),
          {
            state: {
              paymentGroupId,
              outcome: "failed",
              error:
                err?.message ||
                "Payment could not be completed. Retry safely from your orders page.",
            },
          }
        );
      } else {
        setError(err.message || "Order failed");
      }
    } finally {
      setLoading(false);
    }
  };

  if (
    typeof localStorage !== "undefined" &&
    (!hasActiveSession() || sessionClaims.isExpired || isPurchaseBlocked)
  ) {
    return null;
  }

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
          {items.length === 0 && (
            <p className="field-hint">Your cart is empty.</p>
          )}
          {savedAddresses.length > 0 && (
            <div className="field">
              <label>Saved addresses</label>
              <select value={selectedAddressId} onChange={handleAddressChange}>
                <option value="">Choose an address</option>
                {savedAddresses.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {buildAddressLabel(entry)}
                  </option>
                ))}
              </select>
              {addressBookLoading && (
                <p className="field-hint">Loading saved addresses...</p>
              )}
            </div>
          )}
          {!addressBookLoading && addressBookError && (
            <p className="field-hint">{addressBookError}</p>
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
              {supportedPaymentModes.map((mode) => (
                <option key={mode} value={mode}>
                  {PAYMENT_MODE_LABELS[mode]}
                </option>
              ))}
            </select>
            {isOnlinePayment && (
              <p className="field-hint">
                Payment opens in Razorpay checkout. Your order stays pending until the gateway
                webhook confirms it securely.
              </p>
            )}
            {!paymentConfig.isLoading && !paymentConfig.onlinePaymentsEnabled && (
              <p className="field-hint">
                Online payments are not enabled right now. Cash on delivery is available.
              </p>
            )}
          </div>
        </div>

        <div className="summary-card">
          <div className="card-head">
            <p className="card-title">Order summary</p>
            <span className="chip">{items.length} items</span>
          </div>
          {items.length > 0 && (
            <div className="checkout-item-summary-list">
              {items.map((item) => {
                const isBulkBuild = isBulkHamperCustomization(item.customization);
                const totalHampers = getBulkHamperCount(item.customization);
                const baseSelections = buildBaseSelectionSummary(item.customization, 3);
                const addonSelections = buildAddonItemSummary(item.customization, 3);
                const hasBaseSelection = getCustomizationBaseItems(item.customization).length > 0;
                const variantLabel = String(item?.selectedVariant?.label || "").trim();

                return (
                  <div
                    key={`checkout-item-${item.cartItemKey || item.id}`}
                    className="checkout-item-summary"
                  >
                    <strong>{item.name || "Hamper"}</strong>
                    {variantLabel ? <p>Variant: {variantLabel}</p> : null}
                    <p>
                      Qty: {Number(item?.quantity || 1)} · ₹
                      {formatPrice(getItemPrice(item) + getCustomizationCharge(item))} each
                    </p>
                    {hasBaseSelection && (
                      <p>
                        {isBulkBuild && totalHampers > 0
                          ? `${totalHampers} hampers selected`
                          : "Single hamper build"}
                      </p>
                    )}
                    {baseSelections && (
                      <p>{isBulkBuild ? `Base mix: ${baseSelections}` : `Base: ${baseSelections}`}</p>
                    )}
                    {addonSelections && (
                      <p>
                        {isBulkBuild
                          ? `Shared items: ${addonSelections}`
                          : `Items: ${addonSelections}`}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="price-summary">
            <div className="price-row">
              <span>Hamper price</span>
              <span>₹{formatPrice(subtotal)}</span>
            </div>
            {customizationTotal > 0 && (
              <div className="price-row">
                <span>{customizationChargeLabel}</span>
                <span>₹{formatPrice(customizationTotal)}</span>
              </div>
            )}
            <div className="price-row">
              <span>Delivery</span>
              <span>{deliveryCharge === 0 ? "Free" : `₹${formatPrice(deliveryCharge)}`}</span>
            </div>
            {shippingBreakdown.groups.length > 0 && (
              <div className="checkout-shipping-breakdown" aria-label="Seller delivery breakdown">
                {shippingBreakdown.groups.map((group) => (
                  <div
                    key={`checkout-shipping-${group.sellerId || group.sellerName}`}
                    className="checkout-shipping-breakdown-row"
                  >
                    <div>
                      <strong>{group.sellerName}</strong>
                      <p>
                        {group.deliveryCharge === 0
                          ? group.qualifiesForFreeShipping &&
                            group.shippingSummary.freeShippingThreshold > 0
                            ? `Free above ₹${formatPrice(group.shippingSummary.freeShippingThreshold)}`
                            : "Complimentary seller delivery"
                          : group.shippingSummary.freeShippingThreshold > 0
                            ? `₹${formatPrice(group.remainingForFreeShipping)} more for free shipping`
                            : "Seller delivery policy applied"}
                      </p>
                    </div>
                    <span>
                      {group.deliveryCharge === 0 ? "Free" : `₹${formatPrice(group.deliveryCharge)}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {shippingLookupLoading && (
              <p className="field-hint">Refreshing seller delivery rules...</p>
            )}
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
            disabled={loading || items.length === 0 || isPurchaseBlocked}
          >
            {loading ? "Placing..." : "Place order"}
          </button>

          {buyNowItem && sellerDisplayName && primarySellerId && (
            <section className="checkout-seller-panel">
              {(sellerPanel?.stats?.totalProducts || 0) > 0 ? (
                <div className="card-head">
                  <span className="chip">{sellerPanel?.stats?.totalProducts || 0} products</span>
                </div>
              ) : null}
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
              <div className="checkout-seller-row checkout-seller-row-policy">
                <span className="checkout-mini-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path
                      d="M5 7.5h14v9H5z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                    <path
                      d="M8 11.5h8M8 14.5h5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <div>
                  <strong>
                    {primarySellerShippingSummary.defaultDeliveryCharge > 0
                      ? `Delivery charge: ₹${formatPrice(primarySellerShippingSummary.defaultDeliveryCharge)}`
                      : "Free shipping"}
                  </strong>
                  <span>{primarySellerPolicyNote}</span>
                </div>
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
                <p className="field-hint">More thoughtful picks from this store will appear here soon.</p>
              )}
            </section>
          )}

        </div>
      </div>
    </div>
  );
}
