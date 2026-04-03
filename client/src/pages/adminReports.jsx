import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebarLayout from "../components/AdminSidebarLayout";
import { API_URL } from "../apiBase";
import { apiFetchJson, clearAuthSession, hasActiveSession } from "../utils/authSession";

const REPORT_WINDOWS = [
  { id: "all", label: "All time" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "month", label: "This month" },
  { id: "custom", label: "Custom" },
];

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const asText = (value) => String(value ?? "").trim();
const toCsvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

const downloadCsv = (filename, headers, rows) => {
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => toCsvCell(cell)).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
};

const toStatusLabel = (value) => {
  const text = asText(value);
  if (!text) return "Unknown";
  return text.replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
};

const formatDate = (value, { withTime = false } = {}) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
};

const startOfDay = (date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const endOfDay = (date) => {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
};

const parseDateInput = (value, end = false) => {
  const text = asText(value);
  if (!text) return null;
  const date = new Date(`${text}T${end ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getWindowBounds = (windowId, customStart, customEnd) => {
  const now = new Date();

  if (windowId === "all") return { start: null, end: null, invalid: false };

  if (windowId === "month") {
    return {
      start: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)),
      end: endOfDay(now),
      invalid: false,
    };
  }

  if (windowId === "custom") {
    const start = parseDateInput(customStart, false);
    const end = parseDateInput(customEnd, true);
    return { start, end, invalid: Boolean(start && end && start > end) };
  }

  const days = Number(String(windowId).replace(/\D/g, ""));
  if (Number.isFinite(days) && days > 0) {
    return {
      start: startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1))),
      end: endOfDay(now),
      invalid: false,
    };
  }

  return { start: null, end: null, invalid: false };
};

const getWindowLabel = (windowId, customStart, customEnd) => {
  if (windowId !== "custom") {
    return REPORT_WINDOWS.find((item) => item.id === windowId)?.label || "All time";
  }
  if (customStart && customEnd) return `${formatDate(customStart)} to ${formatDate(customEnd)}`;
  if (customStart) return `From ${formatDate(customStart)}`;
  if (customEnd) return `Until ${formatDate(customEnd)}`;
  return "Custom range";
};

const getLastMonths = (count = 6) => {
  const list = [];
  const now = new Date();
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    list.push({
      key,
      label: date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
      value: 0,
    });
  }
  return list;
};

const getSellerId = (value) => asText(value?.seller?._id || value?.seller || value?._id);
const getOrderCustomerKey = (order) =>
  asText(order?.customer?._id || order?.customer?.email || order?.customer?.name);
const getCategoryLabel = (value) => asText(value?.category || value?.product?.category) || "Uncategorized";
const getSellerDisplayName = (seller = {}) =>
  asText(seller?.storeName || seller?.name || seller?.email || "Seller");

export default function AdminReports() {
  const navigate = useNavigate();
  const [sellers, setSellers] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [timeWindow, setTimeWindow] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [sellerStatusFilter, setSellerStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

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
      const [sellerResult, productResult, orderResult] = await Promise.all([
        apiFetchJson(`${API_URL}/api/admin/sellers`),
        apiFetchJson(`${API_URL}/api/admin/products`),
        apiFetchJson(`${API_URL}/api/admin/orders`),
      ]);
      const sellerRes = sellerResult.response;
      const productRes = productResult.response;
      const orderRes = orderResult.response;
      const sellerData = sellerResult.data;
      const productData = productResult.data;
      const orderData = orderResult.data;

      if ([sellerRes, productRes, orderRes].some((response) => response.status === 401)) {
        clearAndRedirect();
        return;
      }
      if (!sellerRes.ok) throw new Error(sellerData?.message || "Unable to load sellers report.");
      if (!productRes.ok) throw new Error(productData?.message || "Unable to load products report.");
      if (!orderRes.ok) throw new Error(orderData?.message || "Unable to load orders report.");

      setSellers(Array.isArray(sellerData) ? sellerData : []);
      setProducts(Array.isArray(productData) ? productData : []);
      setOrders(Array.isArray(orderData) ? orderData : []);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load reports.");
    } finally {
      setLoading(false);
    }
  }, [clearAndRedirect]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const sellerLookup = useMemo(
    () =>
      new Map(
        sellers.map((seller) => [
          asText(seller?._id),
          {
            ...seller,
            sellerStatus: asText(seller?.sellerStatus).toLowerCase(),
          },
        ])
      ),
    [sellers]
  );

  const categoryOptions = useMemo(() => {
    const categorySet = new Set();
    products.forEach((item) => {
      const category = getCategoryLabel(item);
      if (category !== "Uncategorized") categorySet.add(category);
    });
    orders.forEach((item) => {
      const category = getCategoryLabel(item);
      if (category !== "Uncategorized") categorySet.add(category);
    });
    return Array.from(categorySet).sort((left, right) => left.localeCompare(right));
  }, [orders, products]);

  const windowBounds = useMemo(
    () => getWindowBounds(timeWindow, customStart, customEnd),
    [timeWindow, customEnd, customStart]
  );

  const matchesDateWindow = useCallback(
    (value) => {
      if (windowBounds.invalid) return false;
      if (!windowBounds.start && !windowBounds.end) return true;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return false;
      if (windowBounds.start && date < windowBounds.start) return false;
      if (windowBounds.end && date > windowBounds.end) return false;
      return true;
    },
    [windowBounds]
  );

  const matchesSellerStatus = useCallback(
    (status) => sellerStatusFilter === "all" || asText(status).toLowerCase() === sellerStatusFilter,
    [sellerStatusFilter]
  );

  const matchesCategory = useCallback(
    (category) => categoryFilter === "all" || getCategoryLabel({ category }) === categoryFilter,
    [categoryFilter]
  );

  const filteredSellers = useMemo(
    () =>
      sellers.filter(
        (seller) =>
          matchesSellerStatus(seller?.sellerStatus) && matchesDateWindow(seller?.createdAt)
      ),
    [matchesDateWindow, matchesSellerStatus, sellers]
  );

  const filteredProducts = useMemo(
    () =>
      products.filter((product) => {
        const sellerId = getSellerId(product);
        const sellerStatus =
          asText(product?.seller?.sellerStatus).toLowerCase() ||
          sellerLookup.get(sellerId)?.sellerStatus ||
          "";
        return (
          matchesDateWindow(product?.createdAt) &&
          matchesSellerStatus(sellerStatus) &&
          matchesCategory(product?.category)
        );
      }),
    [matchesCategory, matchesDateWindow, matchesSellerStatus, products, sellerLookup]
  );

  const filteredOrders = useMemo(
    () =>
      orders.filter((order) => {
        const sellerId = getSellerId(order);
        const sellerStatus =
          asText(order?.seller?.sellerStatus).toLowerCase() ||
          sellerLookup.get(sellerId)?.sellerStatus ||
          "";
        return (
          matchesDateWindow(order?.createdAt) &&
          matchesSellerStatus(sellerStatus) &&
          matchesCategory(order?.product?.category)
        );
      }),
    [matchesCategory, matchesDateWindow, matchesSellerStatus, orders, sellerLookup]
  );

  const report = useMemo(() => {
    const safeOrders = [...filteredOrders].sort(
      (left, right) => new Date(right?.createdAt || 0).getTime() - new Date(left?.createdAt || 0).getTime()
    );
    const safeProducts = [...filteredProducts];
    const safeSellers = [...filteredSellers];
    const paidOrders = safeOrders.filter((item) => asText(item?.paymentStatus).toLowerCase() === "paid");
    const refundedOrders = safeOrders.filter(
      (item) =>
        asText(item?.paymentStatus).toLowerCase() === "refunded" ||
        asText(item?.status).toLowerCase() === "refunded"
    );
    const pendingOrders = safeOrders.filter((item) =>
      ["placed", "processing", "shipped", "return_requested"].includes(asText(item?.status).toLowerCase())
    );
    const failedPayments = safeOrders.filter((item) => asText(item?.paymentStatus).toLowerCase() === "failed");
    const deliveredOrders = safeOrders.filter((item) => asText(item?.status).toLowerCase() === "delivered");
    const cancelledOrders = safeOrders.filter((item) => asText(item?.status).toLowerCase() === "cancelled");
    const returnAttention = safeOrders.filter((item) =>
      ["return_requested", "refunded", "cancelled"].includes(asText(item?.status).toLowerCase())
    );

    const grossRevenue = safeOrders.reduce((sum, order) => sum + Number(order?.total || 0), 0);
    const paidRevenue = paidOrders.reduce((sum, order) => sum + Number(order?.total || 0), 0);
    const pipelineRevenue = pendingOrders.reduce((sum, order) => sum + Number(order?.total || 0), 0);
    const refundedRevenue = refundedOrders.reduce((sum, order) => sum + Number(order?.total || 0), 0);
    const avgOrderValue = safeOrders.length > 0 ? grossRevenue / safeOrders.length : 0;
    const uniqueCustomers = new Set(safeOrders.map((item) => getOrderCustomerKey(item)).filter(Boolean)).size;
    const activeSellerIds = new Set(safeOrders.map((item) => getSellerId(item)).filter(Boolean));
    const activeProducts = safeProducts.filter((item) => asText(item?.status).toLowerCase() === "active");
    const lowStockProducts = safeProducts
      .filter((item) => {
        const threshold = Math.max(Number(item?.inventory?.lowStockThreshold ?? 5), 0);
        return Number(item?.stock || 0) <= threshold;
      })
      .sort((left, right) => Number(left?.stock || 0) - Number(right?.stock || 0));
    const moderationQueue = safeProducts.filter((item) =>
      ["pending", "pending_review", "rejected"].includes(asText(item?.moderationStatus).toLowerCase())
    );
    const pendingSellers = safeSellers.filter((item) => asText(item?.sellerStatus).toLowerCase() === "pending");

    const monthly = getLastMonths(6);
    const monthLookup = new Map(monthly.map((entry) => [entry.key, entry]));
    paidOrders.forEach((order) => {
      const date = order?.createdAt ? new Date(order.createdAt) : null;
      if (!date || Number.isNaN(date.getTime())) return;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const slot = monthLookup.get(key);
      if (slot) slot.value += Number(order?.total || 0);
    });

    const orderStatusRows = Array.from(
      safeOrders.reduce((map, order) => {
        const key = asText(order?.status).toLowerCase() || "unknown";
        map.set(key, (map.get(key) || 0) + 1);
        return map;
      }, new Map())
    )
      .map(([label, value]) => ({ label: toStatusLabel(label), value }))
      .sort((left, right) => right.value - left.value);

    const paymentModeRows = Array.from(
      safeOrders.reduce((map, order) => {
        const key = asText(order?.paymentMode).toLowerCase() || "unknown";
        const current = map.get(key) || { label: toStatusLabel(key), orders: 0, revenue: 0 };
        current.orders += 1;
        current.revenue += Number(order?.total || 0);
        map.set(key, current);
        return map;
      }, new Map())
    ).sort((left, right) => right[1].revenue - left[1].revenue);

    const paymentStatusRows = Array.from(
      safeOrders.reduce((map, order) => {
        const key = asText(order?.paymentStatus).toLowerCase() || "unknown";
        const current = map.get(key) || { label: toStatusLabel(key), value: 0 };
        current.value += 1;
        map.set(key, current);
        return map;
      }, new Map())
    )
      .map(([, value]) => value)
      .sort((left, right) => right.value - left.value);

    const topSellers = Array.from(
      safeOrders.reduce((map, order) => {
        const sellerId = getSellerId(order) || asText(order?._id);
        const sellerRecord = sellerLookup.get(sellerId) || order?.seller || {};
        const current = map.get(sellerId) || {
          id: sellerId,
          label: getSellerDisplayName(sellerRecord),
          status: toStatusLabel(
            asText(sellerRecord?.sellerStatus).toLowerCase() || sellerLookup.get(sellerId)?.sellerStatus || "unknown"
          ),
          orders: 0,
          revenue: 0,
          paidOrders: 0,
        };
        current.orders += 1;
        current.revenue += Number(order?.total || 0);
        if (asText(order?.paymentStatus).toLowerCase() === "paid") current.paidOrders += 1;
        map.set(sellerId, current);
        return map;
      }, new Map())
    )
      .map(([, value]) => value)
      .sort((left, right) => right.revenue - left.revenue || right.orders - left.orders)
      .slice(0, 6);

    const categoryPerformance = Array.from(
      safeOrders.reduce((map, order) => {
        const key = getCategoryLabel(order);
        const current = map.get(key) || { label: key, orders: 0, revenue: 0, units: 0 };
        current.orders += 1;
        current.revenue += Number(order?.total || 0);
        current.units += Number(order?.quantity || 1);
        map.set(key, current);
        return map;
      }, new Map())
    )
      .map(([, value]) => value)
      .sort((left, right) => right.revenue - left.revenue || right.orders - left.orders)
      .slice(0, 6);

    return {
      totalOrders: safeOrders.length,
      grossRevenue,
      paidRevenue,
      pipelineRevenue,
      refundedRevenue,
      avgOrderValue,
      uniqueCustomers,
      activeSellerCount: activeSellerIds.size,
      activeProductCount: activeProducts.length,
      lowStockCount: lowStockProducts.length,
      moderationQueueCount: moderationQueue.length,
      pendingSellerCount: pendingSellers.length,
      deliveredCount: deliveredOrders.length,
      cancelledCount: cancelledOrders.length,
      failedPaymentCount: failedPayments.length,
      returnAttentionCount: returnAttention.length,
      monthly,
      orderStatusRows,
      paymentModeRows: paymentModeRows.map(([, value]) => value),
      paymentStatusRows,
      topSellers,
      categoryPerformance,
      lowStockProducts: lowStockProducts.slice(0, 6),
      pendingSellers: pendingSellers.slice(0, 6),
      riskOrders: Array.from(
        [...failedPayments, ...returnAttention].reduce((map, order) => {
          map.set(asText(order?._id), order);
          return map;
        }, new Map())
      )
        .map(([, value]) => value)
        .sort((left, right) => new Date(right?.createdAt || 0).getTime() - new Date(left?.createdAt || 0).getTime())
        .slice(0, 6),
      recentOrders: safeOrders.slice(0, 8),
    };
  }, [filteredOrders, filteredProducts, filteredSellers, sellerLookup]);

  const scopeLabel = useMemo(
    () => getWindowLabel(timeWindow, customStart, customEnd),
    [customEnd, customStart, timeWindow]
  );

  const activeFilterBadges = useMemo(() => {
    const badges = [scopeLabel];
    if (sellerStatusFilter !== "all") badges.push(`Seller status: ${toStatusLabel(sellerStatusFilter)}`);
    if (categoryFilter !== "all") badges.push(`Category: ${categoryFilter}`);
    return badges;
  }, [categoryFilter, scopeLabel, sellerStatusFilter]);

  const monthlyMax = Math.max(...report.monthly.map((entry) => entry.value), 0);
  const orderStatusMax = Math.max(...report.orderStatusRows.map((entry) => entry.value), 0);
  const paymentStatusMax = Math.max(...report.paymentStatusRows.map((entry) => entry.value), 0);
  const categoryMax = Math.max(...report.categoryPerformance.map((entry) => entry.revenue), 0);

  const buildFilename = useCallback(
    (prefix) => `${prefix}-${timeWindow}-${new Date().toISOString().slice(0, 10)}.csv`,
    [timeWindow]
  );

  const exportOverview = useCallback(() => {
    downloadCsv(buildFilename("admin-report-overview"), ["Metric", "Value"], [
      ["Window", scopeLabel],
      ["Seller status filter", sellerStatusFilter === "all" ? "All" : toStatusLabel(sellerStatusFilter)],
      ["Category filter", categoryFilter === "all" ? "All" : categoryFilter],
      ["Orders in scope", report.totalOrders],
      ["Gross revenue", report.grossRevenue],
      ["Paid revenue", report.paidRevenue],
      ["Pipeline revenue", report.pipelineRevenue],
      ["Refunded revenue", report.refundedRevenue],
      ["Average order value", report.avgOrderValue],
      ["Unique customers", report.uniqueCustomers],
      ["Active sellers in orders", report.activeSellerCount],
      ["Active products", report.activeProductCount],
      ["Low stock products", report.lowStockCount],
      ["Moderation queue", report.moderationQueueCount],
      ["Pending sellers", report.pendingSellerCount],
      ["Failed payments", report.failedPaymentCount],
      ["Returns and refunds", report.returnAttentionCount],
      ["Generated at", formatDate(new Date(), { withTime: true })],
    ]);
    setNotice("Overview report downloaded.");
  }, [buildFilename, categoryFilter, report, scopeLabel, sellerStatusFilter]);

  const exportSellers = useCallback(() => {
    downloadCsv(
      buildFilename("admin-sellers"),
      ["Store", "Owner", "Email", "Phone", "Status", "Joined"],
      filteredSellers.map((seller) => [
        seller.storeName || "",
        seller.name || "",
        seller.email || "",
        seller.phone || "",
        toStatusLabel(seller.sellerStatus),
        formatDate(seller.createdAt),
      ])
    );
    setNotice("Sellers report downloaded.");
  }, [buildFilename, filteredSellers]);

  const exportProducts = useCallback(() => {
    downloadCsv(
      buildFilename("admin-products"),
      ["Product", "Category", "Seller", "Seller Status", "Catalog Status", "Moderation", "Stock", "Price"],
      filteredProducts.map((product) => [
        product.name || "",
        getCategoryLabel(product),
        getSellerDisplayName(product.seller),
        toStatusLabel(product.seller?.sellerStatus || sellerLookup.get(getSellerId(product))?.sellerStatus),
        toStatusLabel(product.status),
        toStatusLabel(product.moderationStatus),
        Number(product.stock || 0),
        Number(product.price || 0),
      ])
    );
    setNotice("Products report downloaded.");
  }, [buildFilename, filteredProducts, sellerLookup]);

  const exportOrders = useCallback(() => {
    downloadCsv(
      buildFilename("admin-orders"),
      [
        "Order",
        "Created",
        "Customer",
        "Seller",
        "Seller Status",
        "Category",
        "Product",
        "Status",
        "Payment Status",
        "Payment Mode",
        "Quantity",
        "Total",
      ],
      filteredOrders.map((order) => [
        asText(order?._id).slice(-8).toUpperCase(),
        formatDate(order.createdAt, { withTime: true }),
        order.customer?.name || "",
        getSellerDisplayName(order.seller),
        toStatusLabel(sellerLookup.get(getSellerId(order))?.sellerStatus),
        getCategoryLabel(order),
        order.product?.name || "",
        toStatusLabel(order.status),
        toStatusLabel(order.paymentStatus),
        toStatusLabel(order.paymentMode),
        Number(order.quantity || 1),
        Number(order.total || 0),
      ])
    );
    setNotice("Orders report downloaded.");
  }, [buildFilename, filteredOrders, sellerLookup]);

  return (
    <AdminSidebarLayout
      title="Reports"
      description="Platform revenue, order health, seller performance, and export-ready operational snapshots from one desk."
      pageClassName="admin-reports-page"
      titleActions={<span className="admin-reports-title-chip">{scopeLabel}</span>}
      actions={
        <div className="seller-toolbar admin-reports-toolbar">
          <button className="btn ghost" type="button" onClick={loadData} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button className="btn primary" type="button" onClick={exportOverview}>
            Export overview
          </button>
        </div>
      }
    >
      {error ? <p className="field-hint">{error}</p> : null}
      {notice ? <p className="field-hint">{notice}</p> : null}
      {windowBounds.invalid ? (
        <p className="field-hint">Custom date range is invalid. End date should be after start date.</p>
      ) : null}

      <section className="seller-panel admin-reports-hero">
        <div className="admin-reports-hero-copy">
          <span className="admin-reports-kicker">CraftzyGifts report desk</span>
          <h3>Track gifting demand, seller momentum, and export-ready platform performance from one admin view.</h3>
          <p>
            Date filters sharpen revenue and order movement, while seller and category views keep store health,
            curated catalog activity, and fulfilment insights aligned in one clean workspace.
          </p>
          <div className="admin-reports-badge-row">
            {activeFilterBadges.map((badge) => (
              <span key={badge} className="admin-reports-badge">
                {badge}
              </span>
            ))}
          </div>
        </div>

        <div className="admin-reports-hero-side">
          <article className="admin-reports-hero-metric">
            <strong>{report.totalOrders}</strong>
            <span>Orders in report scope</span>
          </article>
          <article className="admin-reports-hero-metric">
            <strong>{filteredSellers.length}</strong>
            <span>Sellers matched</span>
          </article>
          <article className="admin-reports-hero-metric">
            <strong>{filteredProducts.length}</strong>
            <span>Products matched</span>
          </article>
        </div>
      </section>

      <section className="seller-panel admin-reports-filter-panel">
        <div className="card-head admin-reports-panel-head">
          <div>
            <p className="admin-reports-section-kicker">Filter controls</p>
            <h3 className="card-title">Scope the report</h3>
          </div>
          <span className="chip">Exports follow current filters</span>
        </div>

        <div className="admin-reports-window-row" role="tablist" aria-label="Report time windows">
          {REPORT_WINDOWS.map((item) => (
            <button
              key={item.id}
              className={`admin-reports-window ${timeWindow === item.id ? "active" : ""}`.trim()}
              type="button"
              role="tab"
              aria-selected={timeWindow === item.id}
              onClick={() => setTimeWindow(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="admin-reports-filter-grid">
          <label className="field admin-reports-field">
            <span>Seller status</span>
            <select value={sellerStatusFilter} onChange={(event) => setSellerStatusFilter(event.target.value)}>
              <option value="all">All sellers</option>
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>

          <label className="field admin-reports-field">
            <span>Category</span>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="all">All categories</option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          {timeWindow === "custom" ? (
            <>
              <label className="field admin-reports-field">
                <span>Start date</span>
                <input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} />
              </label>

              <label className="field admin-reports-field">
                <span>End date</span>
                <input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} />
              </label>
            </>
          ) : null}
        </div>
      </section>

      <div className="admin-grid admin-reports-summary-grid">
        <article className="stat-card admin-reports-stat is-revenue">
          <p className="stat-label">Gross revenue</p>
          <p className="stat-value">{money(report.grossRevenue)}</p>
          <p className="stat-delta">{report.totalOrders} orders in scope</p>
        </article>
        <article className="stat-card admin-reports-stat is-paid">
          <p className="stat-label">Paid revenue</p>
          <p className="stat-value">{money(report.paidRevenue)}</p>
          <p className="stat-delta">{report.paymentStatusRows.find((item) => item.label === "Paid")?.value || 0} paid orders</p>
        </article>
        <article className="stat-card admin-reports-stat is-pipeline">
          <p className="stat-label">Pipeline revenue</p>
          <p className="stat-value">{money(report.pipelineRevenue)}</p>
          <p className="stat-delta">Placed, processing, shipped, and return-requested orders</p>
        </article>
        <article className="stat-card admin-reports-stat is-refund">
          <p className="stat-label">Refunded value</p>
          <p className="stat-value">{money(report.refundedRevenue)}</p>
          <p className="stat-delta">{report.returnAttentionCount} orders need refund or return attention</p>
        </article>
      </div>

      <div className="admin-grid admin-reports-summary-grid admin-reports-summary-grid-secondary">
        <article className="stat-card admin-reports-stat">
          <p className="stat-label">Average order value</p>
          <p className="stat-value">{money(report.avgOrderValue)}</p>
          <p className="stat-delta">Across filtered orders</p>
        </article>
        <article className="stat-card admin-reports-stat">
          <p className="stat-label">Unique customers</p>
          <p className="stat-value">{report.uniqueCustomers}</p>
          <p className="stat-delta">Distinct buyers in order scope</p>
        </article>
        <article className="stat-card admin-reports-stat">
          <p className="stat-label">Catalog watch</p>
          <p className="stat-value">{report.lowStockCount}</p>
          <p className="stat-delta">{report.moderationQueueCount} items also in moderation queue</p>
        </article>
        <article className="stat-card admin-reports-stat">
          <p className="stat-label">Seller approvals</p>
          <p className="stat-value">{report.pendingSellerCount}</p>
          <p className="stat-delta">{filteredSellers.length} sellers match current seller filter</p>
        </article>
      </div>

      <div className="admin-grid admin-reports-insight-grid">
        <article className="seller-panel admin-reports-panel">
          <div className="card-head admin-reports-panel-head">
            <div>
              <p className="admin-reports-section-kicker">Revenue pulse</p>
              <h3 className="card-title">Paid revenue by month</h3>
            </div>
            <span className="chip">Last 6 months</span>
          </div>
          <div className="admin-analytics-bars">
            {report.monthly.map((entry) => {
              const width = monthlyMax > 0 ? Math.max((entry.value / monthlyMax) * 100, 4) : 0;
              return (
                <div key={entry.key} className="admin-analytics-bar-row">
                  <span>{entry.label}</span>
                  <div className="admin-analytics-track">
                    <div className="admin-analytics-fill" style={{ width: `${width}%` }} />
                  </div>
                  <strong>{money(entry.value)}</strong>
                </div>
              );
            })}
          </div>
        </article>

        <article className="seller-panel admin-reports-panel">
          <div className="card-head admin-reports-panel-head">
            <div>
              <p className="admin-reports-section-kicker">Order health</p>
              <h3 className="card-title">Lifecycle split</h3>
            </div>
            <span className="chip">{report.orderStatusRows.length} statuses</span>
          </div>
          <div className="admin-analytics-bars">
            {report.orderStatusRows.map((entry) => {
              const width = orderStatusMax > 0 ? Math.max((entry.value / orderStatusMax) * 100, 6) : 0;
              return (
                <div key={entry.label} className="admin-analytics-bar-row">
                  <span>{entry.label}</span>
                  <div className="admin-analytics-track">
                    <div className="admin-analytics-fill alt" style={{ width: `${width}%` }} />
                  </div>
                  <strong>{entry.value}</strong>
                </div>
              );
            })}
          </div>
        </article>

        <article className="seller-panel admin-reports-panel">
          <div className="card-head admin-reports-panel-head">
            <div>
              <p className="admin-reports-section-kicker">Payments</p>
              <h3 className="card-title">Mode and status mix</h3>
            </div>
            <span className="chip">{report.paymentModeRows.length} modes</span>
          </div>
          <div className="admin-reports-mix-list">
            {report.paymentModeRows.map((entry) => (
              <div key={entry.label} className="admin-reports-mix-row">
                <div>
                  <strong>{entry.label}</strong>
                  <p>
                    {entry.orders} orders | {money(entry.revenue)}
                  </p>
                </div>
                <span className="status-pill info">{entry.orders}</span>
              </div>
            ))}
          </div>
          <div className="admin-analytics-bars admin-reports-payment-status">
            {report.paymentStatusRows.map((entry) => {
              const width = paymentStatusMax > 0 ? Math.max((entry.value / paymentStatusMax) * 100, 8) : 0;
              return (
                <div key={entry.label} className="admin-analytics-bar-row">
                  <span>{entry.label}</span>
                  <div className="admin-analytics-track">
                    <div className="admin-analytics-fill" style={{ width: `${width}%` }} />
                  </div>
                  <strong>{entry.value}</strong>
                </div>
              );
            })}
          </div>
        </article>
      </div>

      <div className="admin-grid admin-reports-performance-grid">
        <article className="seller-panel admin-reports-panel">
          <div className="card-head admin-reports-panel-head">
            <div>
              <p className="admin-reports-section-kicker">Seller performance</p>
              <h3 className="card-title">Top sellers by revenue</h3>
            </div>
            <span className="chip">{report.topSellers.length} tracked</span>
          </div>
          <div className="admin-reports-ranking-list">
            {report.topSellers.map((seller, index) => (
              <article key={seller.id} className="admin-reports-ranking-item">
                <span className="admin-reports-ranking-index">{String(index + 1).padStart(2, "0")}</span>
                <div className="admin-reports-ranking-copy">
                  <strong>{seller.label}</strong>
                  <p>
                    {seller.orders} orders | {seller.paidOrders} paid | {seller.status}
                  </p>
                </div>
                <span className="admin-reports-ranking-value">{money(seller.revenue)}</span>
              </article>
            ))}
            {report.topSellers.length === 0 ? <p className="field-hint">No seller performance data yet.</p> : null}
          </div>
        </article>

        <article className="seller-panel admin-reports-panel">
          <div className="card-head admin-reports-panel-head">
            <div>
              <p className="admin-reports-section-kicker">Category view</p>
              <h3 className="card-title">Revenue by category</h3>
            </div>
            <span className="chip">{report.categoryPerformance.length} categories</span>
          </div>
          <div className="admin-analytics-bars">
            {report.categoryPerformance.map((entry) => {
              const width = categoryMax > 0 ? Math.max((entry.revenue / categoryMax) * 100, 6) : 0;
              return (
                <div key={entry.label} className="admin-reports-category-row">
                  <div className="admin-reports-category-copy">
                    <strong>{entry.label}</strong>
                    <p>
                      {entry.orders} orders | {entry.units} units
                    </p>
                  </div>
                  <div className="admin-analytics-track">
                    <div className="admin-analytics-fill" style={{ width: `${width}%` }} />
                  </div>
                  <span>{money(entry.revenue)}</span>
                </div>
              );
            })}
            {report.categoryPerformance.length === 0 ? <p className="field-hint">No category activity yet.</p> : null}
          </div>
        </article>
      </div>

      <div className="admin-grid admin-reports-operations-grid">
        <article className="seller-panel admin-reports-panel admin-reports-watch-panel">
          <div className="card-head admin-reports-panel-head">
            <div>
              <p className="admin-reports-section-kicker">Watchlist</p>
              <h3 className="card-title">Operational attention areas</h3>
            </div>
            <span className="chip">Live from current filters</span>
          </div>

          <div className="admin-reports-watch-grid">
            <section className="admin-reports-watch-card">
              <strong>Low stock products</strong>
              <div className="admin-reports-watch-list">
                {report.lowStockProducts.map((item) => (
                  <div key={asText(item?._id)} className="admin-reports-watch-item">
                    <span>{item.name || "Product"}</span>
                    <strong>{Number(item.stock || 0)} left</strong>
                  </div>
                ))}
                {report.lowStockProducts.length === 0 ? <p className="field-hint">No low stock items in scope.</p> : null}
              </div>
            </section>

            <section className="admin-reports-watch-card">
              <strong>Pending sellers</strong>
              <div className="admin-reports-watch-list">
                {report.pendingSellers.map((seller) => (
                  <div key={asText(seller?._id)} className="admin-reports-watch-item">
                    <span>{getSellerDisplayName(seller)}</span>
                    <strong>{formatDate(seller.createdAt)}</strong>
                  </div>
                ))}
                {report.pendingSellers.length === 0 ? <p className="field-hint">No pending seller approvals.</p> : null}
              </div>
            </section>

            <section className="admin-reports-watch-card">
              <strong>Risk orders</strong>
              <div className="admin-reports-watch-list">
                {report.riskOrders.map((order) => (
                  <div key={asText(order?._id)} className="admin-reports-watch-item">
                    <span>#{asText(order?._id).slice(-8).toUpperCase()}</span>
                    <strong>{toStatusLabel(order.paymentStatus || order.status)}</strong>
                  </div>
                ))}
                {report.riskOrders.length === 0 ? <p className="field-hint">No failed, returned, or refunded orders.</p> : null}
              </div>
            </section>
          </div>
        </article>

        <article className="seller-panel admin-reports-panel admin-reports-export-panel">
          <div className="card-head admin-reports-panel-head">
            <div>
              <p className="admin-reports-section-kicker">Export center</p>
              <h3 className="card-title">Download filtered reports</h3>
            </div>
            <span className="chip">{scopeLabel}</span>
          </div>

          <div className="admin-reports-export-grid">
            <button className="btn admin-reports-export-btn" type="button" onClick={exportOverview}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 4.5v9.8" />
                <path d="m8.6 11.2 3.4 3.4 3.4-3.4" />
                <path d="M5 18.5h14" />
              </svg>
              Overview CSV
            </button>
            <button className="btn admin-reports-export-btn" type="button" onClick={exportSellers}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="9" cy="8.2" r="2.8" />
                <path d="M4.5 18a4.8 4.8 0 0 1 9 0" />
                <circle cx="17.3" cy="9.4" r="2" />
                <path d="M14.7 18a3.9 3.9 0 0 1 5 0" />
              </svg>
              Sellers CSV
            </button>
            <button className="btn admin-reports-export-btn" type="button" onClick={exportProducts}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3.5 7.7 12 3.5l8.5 4.2L12 12z" />
                <path d="M3.5 7.7V16.3L12 20.5l8.5-4.2V7.7" />
                <path d="M12 12v8.5" />
              </svg>
              Products CSV
            </button>
            <button className="btn admin-reports-export-btn" type="button" onClick={exportOrders}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 3.5h8l3.5 3.5v13H4.5v-16z" />
                <path d="M8 3.5V7h11.5" />
                <path d="M8.5 11.2h7.2M8.5 15.2h5.2" />
              </svg>
              Orders CSV
            </button>
          </div>

          <div className="admin-reports-export-meta">
            <div className="admin-reports-export-stat">
              <strong>{filteredSellers.length}</strong>
              <span>Sellers ready</span>
            </div>
            <div className="admin-reports-export-stat">
              <strong>{filteredProducts.length}</strong>
              <span>Products ready</span>
            </div>
            <div className="admin-reports-export-stat">
              <strong>{filteredOrders.length}</strong>
              <span>Orders ready</span>
            </div>
          </div>
        </article>
      </div>

      <section className="seller-panel admin-reports-panel">
        <div className="card-head admin-reports-panel-head">
          <div>
            <p className="admin-reports-section-kicker">Recent activity</p>
            <h3 className="card-title">Latest filtered orders</h3>
          </div>
          <span className="chip">{report.recentOrders.length} rows</span>
        </div>

        <div className="admin-reports-order-list">
          <div className="admin-reports-order-row admin-reports-order-head">
            <span>Order</span>
            <span>Customer</span>
            <span>Seller</span>
            <span>Category</span>
            <span>Status</span>
            <span>Total</span>
            <span>Created</span>
          </div>

          {report.recentOrders.map((order) => (
            <article key={asText(order?._id)} className="admin-reports-order-row">
              <span>#{asText(order?._id).slice(-8).toUpperCase()}</span>
              <span>{order.customer?.name || "Customer"}</span>
              <span>{getSellerDisplayName(order.seller)}</span>
              <span>{getCategoryLabel(order)}</span>
              <span>{toStatusLabel(order.status)}</span>
              <strong>{money(order.total)}</strong>
              <span>{formatDate(order.createdAt, { withTime: true })}</span>
            </article>
          ))}

          {report.recentOrders.length === 0 ? (
            <div className="admin-reports-empty">
              <strong>No orders match the current report scope.</strong>
              <p>Try widening the time window or clearing seller and category filters.</p>
            </div>
          ) : null}
        </div>
      </section>
    </AdminSidebarLayout>
  );
}
