import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../apiBase";
import { apiFetchJson, clearAuthSession, hasActiveSession } from "../utils/authSession";
import useHashScroll from "../utils/useHashScroll";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

const formatCustomerKey = (order = {}) =>
  String(
    order?.customer?.id ||
      order?.customer?._id ||
      order?.customer?.email ||
      order?.shippingAddress?.phone ||
      order?._id
  ).trim();

const formatCustomerLabel = (entry = {}) =>
  String(
    entry?.name ||
      entry?.customer?.name ||
      entry?.shippingAddress?.name ||
      entry?.senderName ||
      "Customer"
  ).trim();

const formatCustomerEmail = (entry = {}) =>
  String(entry?.email || entry?.customer?.email || entry?.senderEmail || "").trim();

const formatCustomerPhone = (entry = {}) =>
  String(entry?.phone || entry?.customer?.phone || entry?.shippingAddress?.phone || "").trim();

const formatAddress = (value = {}) =>
  [
    value?.line1,
    value?.line2,
    value?.city,
    value?.state,
    value?.pincode,
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(", ");

export default function SellerCustomers() {
  useHashScroll();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [queries, setQueries] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [selectedCustomerKey, setSelectedCustomerKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const clearAndRedirect = useCallback(() => {
    clearAuthSession();
    navigate("/login", { replace: true });
  }, [navigate]);

  const loadData = useCallback(async () => {
    if (!hasActiveSession()) {
      clearAndRedirect();
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [ordersResult, queriesResult] = await Promise.all([
        apiFetchJson(`${API_URL}/api/orders/seller`),
        apiFetchJson(`${API_URL}/api/users/me/contact-requests?limit=24`),
      ]);
      const ordersRes = ordersResult.response;
      const queriesRes = queriesResult.response;
      const ordersData = ordersResult.data;
      const queriesData = queriesResult.data;

      if ([ordersRes, queriesRes].some((response) => response.status === 401)) {
        clearAndRedirect();
        return;
      }

      if (!ordersRes.ok) {
        setError(ordersData?.message || "Unable to load customer orders.");
        return;
      }
      if (!queriesRes.ok) {
        setError(queriesData?.message || "Unable to load customer queries.");
        return;
      }

      setOrders(Array.isArray(ordersData) ? ordersData : []);
      setQueries(Array.isArray(queriesData?.items) ? queriesData.items : []);
    } catch {
      setError("Unable to load customer management data.");
    } finally {
      setLoading(false);
    }
  }, [clearAndRedirect]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadData();
    } finally {
      setRefreshing(false);
    }
  }, [loadData]);

  const customers = useMemo(() => {
    const customerMap = new Map();

    orders.forEach((order) => {
      const key = formatCustomerKey(order);
      const existing = customerMap.get(key) || {
        key,
        name: formatCustomerLabel(order),
        email: formatCustomerEmail(order),
        phone: formatCustomerPhone(order),
        address: formatAddress(order?.shippingAddress),
        totalOrders: 0,
        totalSpent: 0,
        deliveredOrders: 0,
        pendingOrders: 0,
        reviewCount: 0,
        lastOrderAt: null,
        orders: [],
        reviews: [],
        queries: [],
      };

      existing.totalOrders += 1;
      existing.totalSpent += Number(order?.total || 0);
      if (String(order?.status || "").trim() === "delivered") {
        existing.deliveredOrders += 1;
      }
      if (!["delivered", "cancelled", "refunded"].includes(String(order?.status || "").trim())) {
        existing.pendingOrders += 1;
      }
      existing.lastOrderAt =
        !existing.lastOrderAt || new Date(order?.createdAt || 0) > new Date(existing.lastOrderAt || 0)
          ? order?.createdAt || existing.lastOrderAt
          : existing.lastOrderAt;

      existing.orders.push(order);

      if (order?.review?.rating) {
        existing.reviewCount += 1;
        existing.reviews.push({
          orderId: order?._id,
          rating: order?.review?.rating,
          comment: order?.review?.comment || "",
          createdAt: order?.review?.updatedAt || order?.review?.createdAt || order?.updatedAt,
          productName: order?.product?.name || order?.productSnapshot?.name || "Product",
        });
      }

      customerMap.set(key, existing);
    });

    queries.forEach((query) => {
      const matchingKey =
        Array.from(customerMap.values()).find(
          (entry) =>
            formatCustomerEmail(query) &&
            formatCustomerEmail(query).toLowerCase() === String(entry.email || "").toLowerCase()
        )?.key || `query:${query.id}`;
      const existing = customerMap.get(matchingKey) || {
        key: matchingKey,
        name: formatCustomerLabel(query),
        email: formatCustomerEmail(query),
        phone: "",
        address: "",
        totalOrders: 0,
        totalSpent: 0,
        deliveredOrders: 0,
        pendingOrders: 0,
        reviewCount: 0,
        lastOrderAt: query?.createdAt || null,
        orders: [],
        reviews: [],
        queries: [],
      };
      existing.queries.push(query);
      customerMap.set(matchingKey, existing);
    });

    return Array.from(customerMap.values())
      .map((entry) => ({
        ...entry,
        orders: [...entry.orders].sort(
          (left, right) => new Date(right?.createdAt || 0) - new Date(left?.createdAt || 0)
        ),
        reviews: [...entry.reviews].sort(
          (left, right) => new Date(right?.createdAt || 0) - new Date(left?.createdAt || 0)
        ),
        queries: [...entry.queries].sort(
          (left, right) => new Date(right?.createdAt || 0) - new Date(left?.createdAt || 0)
        ),
      }))
      .sort((left, right) => new Date(right?.lastOrderAt || 0) - new Date(left?.lastOrderAt || 0));
  }, [orders, queries]);

  const filteredCustomers = useMemo(() => {
    const query = String(searchText || "").trim().toLowerCase();
    if (!query) return customers;
    return customers.filter((entry) =>
      [entry.name, entry.email, entry.phone, entry.address]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [customers, searchText]);

  useEffect(() => {
    if (!filteredCustomers.length) {
      setSelectedCustomerKey("");
      return;
    }
    if (!filteredCustomers.some((entry) => entry.key === selectedCustomerKey)) {
      setSelectedCustomerKey(filteredCustomers[0].key);
    }
  }, [filteredCustomers, selectedCustomerKey]);

  const activeCustomer = useMemo(
    () => filteredCustomers.find((entry) => entry.key === selectedCustomerKey) || null,
    [filteredCustomers, selectedCustomerKey]
  );

  const summary = useMemo(() => {
    const totalRevenue = customers.reduce((sum, entry) => sum + Number(entry.totalSpent || 0), 0);
    const reviewCount = customers.reduce((sum, entry) => sum + Number(entry.reviewCount || 0), 0);
    const queryCount = customers.reduce((sum, entry) => sum + Number(entry.queries?.length || 0), 0);
    return {
      customers: customers.length,
      revenue: totalRevenue,
      repeatCustomers: customers.filter((entry) => entry.totalOrders > 1).length,
      reviewCount,
      queryCount,
    };
  }, [customers]);

  return (
    <div className="seller-shell-view seller-customers-page">
      <div className="section-head seller-anchor-section" id="customers-overview">
        <div>
          <h2>Customer management</h2>
          <p>Track repeat buyers, review history, order timeline, and direct store queries.</p>
        </div>
        <div className="seller-toolbar">
          <button
            className="btn ghost"
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            aria-busy={refreshing}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {loading ? <p className="field-hint">Loading customer workspace...</p> : null}
      {error ? <p className="field-hint">{error}</p> : null}

      <div className="seller-panel">
        <div className="stat-grid">
          <div className="stat-card">
            <p className="stat-label">Customers</p>
            <p className="stat-value">{summary.customers}</p>
            <p className="stat-delta">Across all seller orders and incoming queries</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Revenue linked</p>
            <p className="stat-value">{money(summary.revenue)}</p>
            <p className="stat-delta">Total customer order value</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Repeat customers</p>
            <p className="stat-value">{summary.repeatCustomers}</p>
            <p className="stat-delta">Customers with multiple orders</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Reviews recorded</p>
            <p className="stat-value">{summary.reviewCount}</p>
            <p className="stat-delta">Delivered-order review trail</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Customer queries</p>
            <p className="stat-value">{summary.queryCount}</p>
            <p className="stat-delta">Store messages and follow-ups</p>
          </div>
        </div>
      </div>

      <div className="seller-customers-layout seller-anchor-section" id="customers-directory">
        <aside className="seller-panel seller-customers-sidebar">
          <div className="card-head">
            <h3 className="card-title">Customer list</h3>
            <span className="chip">{filteredCustomers.length}</span>
          </div>
          <label className="support-conversation-search">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4 4" />
            </svg>
            <input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search customers"
            />
          </label>
          <div className="seller-customer-list">
            {filteredCustomers.map((customer) => (
              <button
                key={customer.key}
                type="button"
                className={`seller-customer-card ${
                  activeCustomer?.key === customer.key ? "active" : ""
                }`}
                onClick={() => setSelectedCustomerKey(customer.key)}
              >
                <div className="seller-customer-head">
                  <strong>{customer.name || "Customer"}</strong>
                  <span>{customer.totalOrders} orders</span>
                </div>
                <p>{customer.email || customer.phone || "No contact details"}</p>
                <small>
                  {customer.reviewCount} reviews · {customer.queries.length} queries
                </small>
              </button>
            ))}
            {!loading && filteredCustomers.length === 0 ? (
              <p className="field-hint">No customers matched your search.</p>
            ) : null}
          </div>
        </aside>

        <section className="seller-panel seller-customers-detail seller-anchor-section" id="customers-detail">
          {activeCustomer ? (
            <>
              <div className="card-head">
                <div>
                  <h3 className="card-title">{activeCustomer.name || "Customer details"}</h3>
                  <p className="field-hint">
                    {activeCustomer.email || "No email"} · {activeCustomer.phone || "No phone"}
                  </p>
                </div>
                <span className="chip">{money(activeCustomer.totalSpent)}</span>
              </div>

              <div className="stat-grid">
                <div className="stat-card">
                  <p className="stat-label">Total orders</p>
                  <p className="stat-value">{activeCustomer.totalOrders}</p>
                  <p className="stat-delta">{activeCustomer.deliveredOrders} delivered</p>
                </div>
                <div className="stat-card">
                  <p className="stat-label">Pending orders</p>
                  <p className="stat-value">{activeCustomer.pendingOrders}</p>
                  <p className="stat-delta">Active order pipeline</p>
                </div>
                <div className="stat-card">
                  <p className="stat-label">Review history</p>
                  <p className="stat-value">{activeCustomer.reviewCount}</p>
                  <p className="stat-delta">Published order reviews</p>
                </div>
                <div className="stat-card">
                  <p className="stat-label">Customer address</p>
                  <p className="stat-value seller-small-stat">
                    {activeCustomer.address || "Address unavailable"}
                  </p>
                  <p className="stat-delta">Latest shipping destination</p>
                </div>
              </div>

              <div className="seller-customers-detail-grid">
                <section className="seller-customers-section">
                  <div className="card-head">
                    <h4 className="card-title">Order history</h4>
                    <span className="chip">{activeCustomer.orders.length}</span>
                  </div>
                  <div className="seller-customer-timeline">
                    {activeCustomer.orders.slice(0, 8).map((order) => (
                      <article key={order._id} className="payout-card">
                        <div className="payout-head">
                          <span>{String(order?._id || "").slice(-8).toUpperCase()}</span>
                          <span className="status-pill info">
                            {String(order?.status || "").replace(/_/g, " ")}
                          </span>
                        </div>
                        <p className="payout-amount">{money(order?.total)}</p>
                        <p className="payout-sub">
                          {order?.product?.name || order?.productSnapshot?.name || "Product order"}
                        </p>
                        <p className="payout-sub">
                          {order?.createdAt
                            ? new Date(order.createdAt).toLocaleDateString("en-IN")
                            : "No date"}
                        </p>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="seller-customers-section">
                  <div className="card-head">
                    <h4 className="card-title">Messages / queries</h4>
                    <span className="chip">{activeCustomer.queries.length}</span>
                  </div>
                  <div className="seller-customer-query-list">
                    {activeCustomer.queries.length ? (
                      activeCustomer.queries.slice(0, 6).map((query) => (
                        <article key={query.id} className="seller-customer-query">
                          <strong>{query.senderName || activeCustomer.name || "Customer"}</strong>
                          <p>{query.message}</p>
                          <small>
                            {query.createdAt
                              ? new Date(query.createdAt).toLocaleString("en-IN")
                              : "No timestamp"}
                          </small>
                        </article>
                      ))
                    ) : (
                      <p className="field-hint">No direct store queries from this customer yet.</p>
                    )}
                  </div>
                </section>

                <section className="seller-customers-section">
                  <div className="card-head">
                    <h4 className="card-title">Review history</h4>
                    <span className="chip">{activeCustomer.reviews.length}</span>
                  </div>
                  <div className="seller-customer-query-list">
                    {activeCustomer.reviews.length ? (
                      activeCustomer.reviews.slice(0, 6).map((review) => (
                        <article key={`${review.orderId}-${review.createdAt}`} className="seller-customer-query">
                          <strong>
                            {review.productName} · {review.rating}/5
                          </strong>
                          <p>{review.comment || "No written review provided."}</p>
                          <small>
                            {review.createdAt
                              ? new Date(review.createdAt).toLocaleDateString("en-IN")
                              : "No date"}
                          </small>
                        </article>
                      ))
                    ) : (
                      <p className="field-hint">No review history for this customer yet.</p>
                    )}
                  </div>
                </section>
              </div>
            </>
          ) : (
            <div className="support-chat-empty compact">
              <strong>No customer selected</strong>
              <p>Choose a customer from the left to open their order and query history.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
