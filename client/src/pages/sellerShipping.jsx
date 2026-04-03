import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../apiBase";
import { apiFetchJson, clearAuthSession, hasActiveSession } from "../utils/authSession";
import useHashScroll from "../utils/useHashScroll";

const asText = (value) => String(value ?? "").trim();
const asNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const COURIER_LABELS = {
  self: "Self managed",
  delhivery: "Delhivery",
  ekart: "Ekart",
  bluedart: "Blue Dart",
  "india-post": "India Post",
};
const SHIPPING_METHOD_LABELS = {
  standard: "Standard",
  express: "Express",
  priority: "Priority",
  pickup: "Store pickup",
};
const SHIPMENT_STATUS_LABELS = {
  pending: "Pending",
  packed: "Packed",
  shipped: "Shipped",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
};
const buildInlineAddress = (address = {}) =>
  [address.line1, address.city, address.state, address.pincode].map(asText).filter(Boolean).join(", ");
const normalizeList = (value = "", maxItems = 12) =>
  Array.from(
    new Set(
      String(value || "")
        .split(/\r?\n|,/)
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  ).slice(0, maxItems);

const getOrderStatusClass = (status) => {
  if (["placed", "pending_payment", "return_requested"].includes(status)) return "warning";
  if (["processing", "shipped", "out_for_delivery"].includes(status)) return "info";
  if (["delivered"].includes(status)) return "success";
  return "locked";
};

const createShipmentDrafts = (orders = []) =>
  (Array.isArray(orders) ? orders : []).reduce((acc, order) => {
    const orderId = asText(order?._id);
    if (!orderId) return acc;
    acc[orderId] = {
      courierName: asText(order?.shipment?.courierName),
      trackingId: asText(order?.shipment?.trackingId),
      awbNumber: asText(order?.shipment?.awbNumber),
      status: asText(order?.shipment?.status) || "pending",
      dispatchDate: asText(order?.shipment?.dispatchDate).slice(0, 10),
      packagingNotes: asText(order?.shipment?.packagingNotes),
    };
    return acc;
  }, {});

export default function SellerShipping() {
  const navigate = useNavigate();
  useHashScroll();
  const [profile, setProfile] = useState(null);
  const [orders, setOrders] = useState([]);
  const [pickupAddress, setPickupAddress] = useState({
    line1: "",
    city: "",
    state: "",
    pincode: "",
    contactNumber: "",
    pickupWindow: "10-6",
  });
  const [shippingSettings, setShippingSettings] = useState({
    defaultDeliveryCharge: "0",
    freeShippingThreshold: "0",
    defaultShippingMethod: "standard",
    courierPreference: "self",
    processingDaysMin: "1",
    processingDaysMax: "3",
    deliveryRegionsText: "",
    weightChargeNotes: "",
    zoneChargeNotes: "",
    handlingNotes: "",
  });
  const [shipmentDrafts, setShipmentDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingShipmentId, setSavingShipmentId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const clearAndRedirect = useCallback(() => {
    clearAuthSession();
    navigate("/login", { replace: true });
  }, [navigate]);

  const applyProfileSnapshot = useCallback((data = {}) => {
    setProfile(data);
    setPickupAddress({
      line1: asText(data?.pickupAddress?.line1),
      city: asText(data?.pickupAddress?.city),
      state: asText(data?.pickupAddress?.state),
      pincode: asText(data?.pickupAddress?.pincode),
      contactNumber: asText(data?.pickupAddress?.contactNumber),
      pickupWindow: asText(data?.pickupAddress?.pickupWindow) || "10-6",
    });
    setShippingSettings({
      defaultDeliveryCharge: String(data?.sellerShippingSettings?.defaultDeliveryCharge ?? 0),
      freeShippingThreshold: String(data?.sellerShippingSettings?.freeShippingThreshold ?? 0),
      defaultShippingMethod:
        asText(data?.sellerShippingSettings?.defaultShippingMethod) || "standard",
      courierPreference: asText(data?.sellerShippingSettings?.courierPreference) || "self",
      processingDaysMin: String(data?.sellerShippingSettings?.processingDaysMin ?? 1),
      processingDaysMax: String(data?.sellerShippingSettings?.processingDaysMax ?? 3),
      deliveryRegionsText: Array.isArray(data?.sellerShippingSettings?.deliveryRegions)
        ? data.sellerShippingSettings.deliveryRegions.map(asText).filter(Boolean).join("\n")
        : "",
      weightChargeNotes: asText(data?.sellerShippingSettings?.weightChargeNotes),
      zoneChargeNotes: asText(data?.sellerShippingSettings?.zoneChargeNotes),
      handlingNotes: asText(data?.sellerShippingSettings?.handlingNotes),
    });
  }, []);

  const loadPage = useCallback(async () => {
    if (!hasActiveSession()) {
      clearAndRedirect();
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [profileResult, ordersResult] = await Promise.all([
        apiFetchJson(`${API_URL}/api/users/me`),
        apiFetchJson(`${API_URL}/api/orders/seller`),
      ]);
      const profileRes = profileResult.response;
      const ordersRes = ordersResult.response;
      const profileData = profileResult.data;
      const ordersData = ordersResult.data;
      if (profileRes.status === 401 || ordersRes.status === 401) {
        clearAndRedirect();
        return;
      }
      if (!profileRes.ok) {
        setError(profileData?.message || "Unable to load shipping settings.");
        return;
      }
      if (!ordersRes.ok) {
        setError(ordersData?.message || "Unable to load shipment queue.");
        return;
      }
      applyProfileSnapshot(profileData);
      const nextOrders = Array.isArray(ordersData) ? ordersData : [];
      setOrders(nextOrders);
      setShipmentDrafts(createShipmentDrafts(nextOrders));
    } catch {
      setError("Unable to load seller shipping tools.");
    } finally {
      setLoading(false);
    }
  }, [applyProfileSnapshot, clearAndRedirect]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const shipmentQueue = useMemo(
    () =>
      orders.filter(
        (order) => !["pending_payment", "cancelled", "refunded"].includes(asText(order?.status))
      ),
    [orders]
  );
  const shippingOverview = useMemo(() => {
    const pickupPreview = buildInlineAddress(pickupAddress);
    const processingMin = Math.max(0, Math.trunc(asNumber(shippingSettings.processingDaysMin, 1)));
    const processingMax = Math.max(processingMin, Math.trunc(asNumber(shippingSettings.processingDaysMax, 3)));
    const freeThreshold = Math.max(0, asNumber(shippingSettings.freeShippingThreshold, 0));
    const deliveryCharge = Math.max(0, asNumber(shippingSettings.defaultDeliveryCharge, 0));
    const deliveryRegions = normalizeList(shippingSettings.deliveryRegionsText, 12);
    return {
      methodLabel:
        SHIPPING_METHOD_LABELS[asText(shippingSettings.defaultShippingMethod)] ||
        asText(shippingSettings.defaultShippingMethod) ||
        "Standard",
      courierLabel:
        COURIER_LABELS[asText(shippingSettings.courierPreference)] ||
        asText(shippingSettings.courierPreference) ||
        "Self managed",
      deliveryCharge,
      freeThreshold,
      processingWindow:
        processingMin === processingMax
          ? `${processingMin} day${processingMin === 1 ? "" : "s"}`
          : `${processingMin}-${processingMax} days`,
      pickupPreview,
      pickupReady: Boolean(
        asText(pickupAddress.line1) &&
          asText(pickupAddress.city) &&
          asText(pickupAddress.state) &&
          asText(pickupAddress.pincode)
      ),
      pickupWindow: asText(pickupAddress.pickupWindow) || "10-6",
      pickupContact: asText(pickupAddress.contactNumber),
      deliveryRegions,
      storeLabel: asText(profile?.storeName || profile?.name) || "Your store",
    };
  }, [pickupAddress, profile, shippingSettings]);

  const handleSettingsSave = async (event) => {
    event.preventDefault();
    if (!hasActiveSession()) {
      clearAndRedirect();
      return;
    }

    setSavingSettings(true);
    setError("");
    setNotice("");
    try {
      const { response, data } = await apiFetchJson(`${API_URL}/api/users/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pickupAddress,
          sellerShippingSettings: {
            defaultDeliveryCharge: asNumber(shippingSettings.defaultDeliveryCharge, 0),
            freeShippingThreshold: asNumber(shippingSettings.freeShippingThreshold, 0),
            defaultShippingMethod: asText(shippingSettings.defaultShippingMethod) || "standard",
            courierPreference: asText(shippingSettings.courierPreference) || "self",
            processingDaysMin: Math.max(0, Math.trunc(asNumber(shippingSettings.processingDaysMin, 1))),
            processingDaysMax: Math.max(0, Math.trunc(asNumber(shippingSettings.processingDaysMax, 3))),
            deliveryRegions: normalizeList(shippingSettings.deliveryRegionsText, 12),
            weightChargeNotes: asText(shippingSettings.weightChargeNotes),
            zoneChargeNotes: asText(shippingSettings.zoneChargeNotes),
            handlingNotes: asText(shippingSettings.handlingNotes),
          },
        }),
      });
      if (response.status === 401) {
        clearAndRedirect();
        return;
      }
      if (!response.ok) {
        setError(data?.message || "Unable to save shipping settings.");
        return;
      }
      applyProfileSnapshot(data);
      setNotice("Shipping settings updated.");
    } catch {
      setError("Unable to save shipping settings.");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleShipmentDraftChange = (orderId, field, value) => {
    setShipmentDrafts((prev) => ({
      ...prev,
      [orderId]: {
        ...(prev[orderId] || {
          courierName: "",
          trackingId: "",
          awbNumber: "",
          status: "pending",
          dispatchDate: "",
          packagingNotes: "",
        }),
        [field]: value,
      },
    }));
  };

  const handleShipmentSave = async (orderId) => {
    if (!hasActiveSession()) {
      clearAndRedirect();
      return;
    }

    const draft = shipmentDrafts[orderId] || {};
    setSavingShipmentId(orderId);
    setError("");
    setNotice("");
    try {
      const { response, data } = await apiFetchJson(`${API_URL}/api/orders/${orderId}/shipment`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          courierName: asText(draft.courierName),
          trackingId: asText(draft.trackingId),
          awbNumber: asText(draft.awbNumber),
          status: asText(draft.status) || "pending",
          dispatchDate: asText(draft.dispatchDate),
          packagingNotes: asText(draft.packagingNotes),
        }),
      });
      if (response.status === 401) {
        clearAndRedirect();
        return;
      }
      if (!response.ok) {
        setError(data?.message || "Unable to update shipment details.");
        return;
      }
      const updatedOrder = data?.order;
      if (updatedOrder?._id) {
        setOrders((prev) =>
          prev.map((entry) => (entry._id === updatedOrder._id ? updatedOrder : entry))
        );
        setShipmentDrafts((prev) => ({
          ...prev,
          [orderId]: {
            courierName: asText(updatedOrder?.shipment?.courierName),
            trackingId: asText(updatedOrder?.shipment?.trackingId),
            awbNumber: asText(updatedOrder?.shipment?.awbNumber),
            status: asText(updatedOrder?.shipment?.status) || "pending",
            dispatchDate: asText(updatedOrder?.shipment?.dispatchDate).slice(0, 10),
            packagingNotes: asText(updatedOrder?.shipment?.packagingNotes),
          },
        }));
      }
      setNotice("Shipment details updated.");
    } catch {
      setError("Unable to update shipment details.");
    } finally {
      setSavingShipmentId("");
    }
  };

  return (
    <div className="seller-shell-view seller-shipping-page">
      <div className="section-head">
        <div>
          <h2>Shipping and delivery</h2>
          <p>Control pickup settings, delivery charges, courier preferences, and tracking data.</p>
        </div>
        <div className="seller-toolbar">
          <button className="btn ghost" type="button" onClick={loadPage}>
            Refresh
          </button>
        </div>
      </div>

      {loading ? <p className="field-hint">Loading shipping workspace...</p> : null}
      {error ? <p className="field-hint">{error}</p> : null}
      {notice ? <p className="field-hint">{notice}</p> : null}

      {!loading ? (
        <div className="seller-settings-grid">
          <section
            className="seller-panel seller-settings-card seller-shipping-settings-card seller-anchor-section"
            id="shipping-settings"
          >
            <div className="shipping-settings-shell">
              <div className="shipping-settings-hero">
                <div className="shipping-settings-summary">
                  <span className="seller-instagram-kicker shipping-settings-kicker">
                    Dispatch console
                  </span>
                  <div className="shipping-settings-heading">
                    <h3>Delivery settings</h3>
                    <p>
                      Set your default shipping rules and pickup address used by the seller team.
                    </p>
                  </div>
                  <div
                    className={`shipping-settings-preview ${
                      shippingOverview.pickupReady ? "is-ready" : "is-pending"
                    }`.trim()}
                  >
                    <span className="shipping-settings-preview-label">
                      {shippingOverview.pickupReady ? "Pickup desk ready" : "Pickup details pending"}
                    </span>
                    <strong>
                      {shippingOverview.pickupPreview ||
                        "Add a complete pickup address to make dispatch handoffs smoother."}
                    </strong>
                    <span>
                      {shippingOverview.pickupReady
                        ? `Active window ${shippingOverview.pickupWindow}${
                            shippingOverview.pickupContact
                              ? ` • Contact ${shippingOverview.pickupContact}`
                              : ""
                          } for ${shippingOverview.storeLabel}.`
                        : "Line 1, city, state, and pincode together create the dispatch-ready pickup profile."}
                    </span>
                  </div>
                </div>

                <div className="shipping-settings-metrics">
                  <article className="shipping-settings-metric">
                    <span>Shipping method</span>
                    <strong>{shippingOverview.methodLabel}</strong>
                    <p>Default service promise shown across fulfillment ops.</p>
                  </article>
                  <article className="shipping-settings-metric">
                    <span>Courier mode</span>
                    <strong>{shippingOverview.courierLabel}</strong>
                    <p>Primary dispatch preference for new shipments.</p>
                  </article>
                  <article className="shipping-settings-metric">
                    <span>Base shipping</span>
                    <strong>{money(shippingOverview.deliveryCharge)}</strong>
                    <p>Default charge applied before free-shipping rules.</p>
                  </article>
                  <article className="shipping-settings-metric">
                    <span>Free shipping</span>
                    <strong>
                      {shippingOverview.freeThreshold > 0
                        ? money(shippingOverview.freeThreshold)
                        : "Disabled"}
                    </strong>
                    <p>Threshold customers need to unlock free delivery.</p>
                  </article>
                  <article className="shipping-settings-metric">
                    <span>Processing window</span>
                    <strong>{shippingOverview.processingWindow}</strong>
                    <p>Estimated seller-side turnaround before courier handoff.</p>
                  </article>
                  <article className="shipping-settings-metric">
                    <span>Delivery regions</span>
                    <strong>
                      {shippingOverview.deliveryRegions.length > 0
                        ? `${shippingOverview.deliveryRegions.length} zones`
                        : "All India"}
                    </strong>
                    <p>Regions currently covered by this seller dispatch setup.</p>
                  </article>
                </div>
              </div>

              <form className="auth-form seller-settings-form shipping-settings-form" onSubmit={handleSettingsSave}>
                <div className="shipping-settings-form-grid">
                  <section
                    className="shipping-settings-block seller-anchor-section"
                    id="shipping-rates"
                  >
                    <div className="shipping-settings-block-head">
                      <span>Rate logic</span>
                      <strong>Define how shipping behaves at checkout</strong>
                    </div>

                    <div className="field-row">
                      <label className="field">
                        <span>Default shipping method</span>
                        <select
                          value={shippingSettings.defaultShippingMethod}
                          onChange={(event) =>
                            setShippingSettings((prev) => ({
                              ...prev,
                              defaultShippingMethod: event.target.value,
                            }))
                          }
                        >
                          <option value="standard">Standard</option>
                          <option value="express">Express</option>
                          <option value="priority">Priority</option>
                          <option value="pickup">Store pickup</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>Default delivery charge</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={shippingSettings.defaultDeliveryCharge}
                          onChange={(event) =>
                            setShippingSettings((prev) => ({
                              ...prev,
                              defaultDeliveryCharge: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Free shipping above</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={shippingSettings.freeShippingThreshold}
                          onChange={(event) =>
                            setShippingSettings((prev) => ({
                              ...prev,
                              freeShippingThreshold: event.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>

                    <label className="field">
                      <span>Courier preference</span>
                      <select
                        value={shippingSettings.courierPreference}
                        onChange={(event) =>
                          setShippingSettings((prev) => ({
                            ...prev,
                            courierPreference: event.target.value,
                          }))
                        }
                      >
                        <option value="self">Self managed</option>
                        <option value="delhivery">Delhivery</option>
                        <option value="ekart">Ekart</option>
                        <option value="bluedart">Blue Dart</option>
                        <option value="india-post">India Post</option>
                      </select>
                    </label>

                    <label className="field">
                      <span>Delivery regions</span>
                      <textarea
                        rows="3"
                        value={shippingSettings.deliveryRegionsText}
                        onChange={(event) =>
                          setShippingSettings((prev) => ({
                            ...prev,
                            deliveryRegionsText: event.target.value,
                          }))
                        }
                        placeholder="Kerala&#10;Tamil Nadu&#10;Bengaluru Metro"
                      />
                    </label>

                    <div className="field-row">
                      <label className="field">
                        <span>Weight-based charge rules</span>
                        <textarea
                          rows="3"
                          value={shippingSettings.weightChargeNotes}
                          onChange={(event) =>
                            setShippingSettings((prev) => ({
                              ...prev,
                              weightChargeNotes: event.target.value,
                            }))
                          }
                          placeholder="0-500g ₹60, 500g-1kg ₹90, above 1kg ₹130"
                        />
                      </label>
                      <label className="field">
                        <span>Zone-based charge rules</span>
                        <textarea
                          rows="3"
                          value={shippingSettings.zoneChargeNotes}
                          onChange={(event) =>
                            setShippingSettings((prev) => ({
                              ...prev,
                              zoneChargeNotes: event.target.value,
                            }))
                          }
                          placeholder="Local ₹40, South ₹70, Rest of India ₹110"
                        />
                      </label>
                    </div>
                  </section>

                  <section
                    className="shipping-settings-block seller-anchor-section"
                    id="shipping-pickup"
                  >
                    <div className="shipping-settings-block-head">
                      <span>Pickup desk</span>
                      <strong>Make the warehouse handoff unmistakably clear</strong>
                    </div>

                    <div className="field-row">
                      <label className="field">
                        <span>Pickup window</span>
                        <input
                          type="text"
                          value={pickupAddress.pickupWindow}
                          onChange={(event) =>
                            setPickupAddress((prev) => ({ ...prev, pickupWindow: event.target.value }))
                          }
                          placeholder="10-6"
                        />
                      </label>
                      <label className="field">
                        <span>Store name</span>
                        <input type="text" value={shippingOverview.storeLabel} disabled />
                      </label>
                    </div>

                    <label className="field">
                      <span>Pickup contact number</span>
                      <input
                        type="text"
                        value={pickupAddress.contactNumber}
                        onChange={(event) =>
                          setPickupAddress((prev) => ({
                            ...prev,
                            contactNumber: event.target.value,
                          }))
                        }
                        placeholder="Warehouse contact number"
                      />
                    </label>

                    <label className="field">
                      <span>Pickup address line</span>
                      <input
                        type="text"
                        value={pickupAddress.line1}
                        onChange={(event) =>
                          setPickupAddress((prev) => ({ ...prev, line1: event.target.value }))
                        }
                        placeholder="Warehouse or pickup location"
                      />
                    </label>

                    <div className="field-row">
                      <label className="field">
                        <span>City</span>
                        <input
                          type="text"
                          value={pickupAddress.city}
                          onChange={(event) =>
                            setPickupAddress((prev) => ({ ...prev, city: event.target.value }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>State</span>
                        <input
                          type="text"
                          value={pickupAddress.state}
                          onChange={(event) =>
                            setPickupAddress((prev) => ({ ...prev, state: event.target.value }))
                          }
                        />
                      </label>
                    </div>

                    <label className="field">
                      <span>Pincode</span>
                      <input
                        type="text"
                        value={pickupAddress.pincode}
                        onChange={(event) =>
                          setPickupAddress((prev) => ({ ...prev, pincode: event.target.value }))
                        }
                      />
                    </label>
                  </section>

                  <section
                    className="shipping-settings-block shipping-settings-block-wide seller-anchor-section"
                    id="shipping-fulfillment"
                  >
                    <div className="shipping-settings-block-head">
                      <span>Fulfillment timing</span>
                      <strong>Set expectation before the package enters the courier network</strong>
                    </div>

                    <div className="field-row">
                      <label className="field">
                        <span>Processing days min</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={shippingSettings.processingDaysMin}
                          onChange={(event) =>
                            setShippingSettings((prev) => ({
                              ...prev,
                              processingDaysMin: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Processing days max</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={shippingSettings.processingDaysMax}
                          onChange={(event) =>
                            setShippingSettings((prev) => ({
                              ...prev,
                              processingDaysMax: event.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>

                    <label className="field">
                      <span>Handling notes</span>
                      <textarea
                        rows="4"
                        value={shippingSettings.handlingNotes}
                        onChange={(event) =>
                          setShippingSettings((prev) => ({
                            ...prev,
                            handlingNotes: event.target.value,
                          }))
                        }
                        placeholder="Packing instructions, dispatch notes, working days, or courier handover details."
                      />
                    </label>
                  </section>
                </div>

                <div className="seller-settings-actions shipping-settings-actions">
                <p className="field-hint">
                    These defaults shape seller dispatch workflow, label preparation, courier routing, and delivery reporting.
                  </p>
                  <button className="btn primary" type="submit" disabled={savingSettings}>
                    {savingSettings ? "Saving..." : "Save shipping settings"}
                  </button>
                </div>
              </form>
            </div>
          </section>

          <section
            className="seller-panel seller-settings-card seller-anchor-section"
            id="shipment-queue"
          >
            <div className="seller-panel-head">
              <div>
                <h3>Shipment queue</h3>
                <p>Update courier, tracking, and AWB details for live seller orders.</p>
              </div>
              <span className="chip">{shipmentQueue.length} active shipments</span>
            </div>

            <div className="payout-grid">
              {shipmentQueue.map((order) => {
                const orderId = asText(order?._id);
                const draft = shipmentDrafts[orderId] || {
                  courierName: "",
                  trackingId: "",
                  awbNumber: "",
                  status: "pending",
                  dispatchDate: "",
                  packagingNotes: "",
                };
                return (
                  <article key={orderId} className="payout-card">
                    <div className="payout-head">
                      <span>{orderId.slice(-8).toUpperCase()}</span>
                      <span className={`status-pill ${getOrderStatusClass(asText(order?.status))}`}>
                        {asText(order?.status).replace(/_/g, " ") || "order"}
                      </span>
                    </div>
                    <p className="payout-amount">{money(order?.total)}</p>
                    <p className="payout-sub">
                      {(order?.product?.name || "Product").trim()} for{" "}
                      {asText(order?.customer?.name) || "Customer"}
                    </p>
                    <p className="field-hint">
                      {buildInlineAddress(order?.shippingAddress) || "Shipping address not available"}
                    </p>
                    <div className="field-row">
                      <label className="field">
                        <span>Shipment status</span>
                        <select
                          value={draft.status}
                          onChange={(event) =>
                            handleShipmentDraftChange(orderId, "status", event.target.value)
                          }
                        >
                          {Object.entries(SHIPMENT_STATUS_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Dispatch date</span>
                        <input
                          type="date"
                          value={draft.dispatchDate}
                          onChange={(event) =>
                            handleShipmentDraftChange(orderId, "dispatchDate", event.target.value)
                          }
                        />
                      </label>
                    </div>
                    <div className="field-row">
                      <label className="field">
                        <span>Courier</span>
                        <input
                          type="text"
                          value={draft.courierName}
                          onChange={(event) =>
                            handleShipmentDraftChange(orderId, "courierName", event.target.value)
                          }
                          placeholder="Courier partner"
                        />
                      </label>
                      <label className="field">
                        <span>Tracking ID</span>
                        <input
                          type="text"
                          value={draft.trackingId}
                          onChange={(event) =>
                            handleShipmentDraftChange(orderId, "trackingId", event.target.value)
                          }
                          placeholder="Tracking reference"
                        />
                      </label>
                    </div>
                    <label className="field">
                      <span>AWB number</span>
                      <input
                        type="text"
                        value={draft.awbNumber}
                        onChange={(event) =>
                          handleShipmentDraftChange(orderId, "awbNumber", event.target.value)
                        }
                        placeholder="Airway bill number"
                      />
                    </label>
                    <label className="field">
                      <span>Packaging notes</span>
                      <textarea
                        rows="3"
                        value={draft.packagingNotes}
                        onChange={(event) =>
                          handleShipmentDraftChange(orderId, "packagingNotes", event.target.value)
                        }
                        placeholder="Packed with tissue wrap, fragile sticker applied, include thank-you card."
                      />
                    </label>
                    <div className="seller-settings-actions">
                      <button
                        className="btn primary"
                        type="button"
                        disabled={savingShipmentId === orderId}
                        onClick={() => handleShipmentSave(orderId)}
                      >
                        {savingShipmentId === orderId ? "Saving..." : "Save shipment details"}
                      </button>
                    </div>
                  </article>
                );
              })}
              {shipmentQueue.length === 0 ? (
                <p className="field-hint">No confirmed shipments to manage right now.</p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
