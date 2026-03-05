import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { getProductImage } from "../utils/productMedia";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const USER_PROFILE_IMAGE_KEY = "user_profile_image";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

const readStoredUser = () => {
  try {
    const stored = JSON.parse(localStorage.getItem("user") || "{}");
    if (stored && typeof stored === "object" && !stored.profileImage) {
      const fallbackImage = localStorage.getItem(USER_PROFILE_IMAGE_KEY) || "";
      if (fallbackImage) stored.profileImage = fallbackImage;
    }
    return stored;
  } catch {
    return {};
  }
};

const readUserIdFromToken = () => {
  try {
    const token = localStorage.getItem("token");
    if (!token) return "";
    const payload = token.split(".")?.[1];
    if (!payload) return "";
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = JSON.parse(atob(padded));
    return String(decoded?.id || "").trim();
  } catch {
    return "";
  }
};

const persistUserToStorage = (nextUser) => {
  if (!nextUser || typeof nextUser !== "object") return;
  const profileImage = typeof nextUser.profileImage === "string" ? nextUser.profileImage : "";

  try {
    localStorage.setItem("user", JSON.stringify(nextUser));
    if (profileImage) {
      localStorage.setItem(USER_PROFILE_IMAGE_KEY, profileImage);
    } else {
      localStorage.removeItem(USER_PROFILE_IMAGE_KEY);
    }
    return;
  } catch {
    // Fallback for quota errors.
  }

  try {
    const { profileImage: _profileImage, ...rest } = nextUser;
    localStorage.setItem("user", JSON.stringify(rest));
    if (profileImage) {
      localStorage.setItem(USER_PROFILE_IMAGE_KEY, profileImage);
    } else {
      localStorage.removeItem(USER_PROFILE_IMAGE_KEY);
    }
  } catch {
    // Ignore localStorage failures.
  }
};

const toCsvCell = (value) => {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
};

const monthLabel = (date) =>
  new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
  }).format(date);

const isSameMonth = (dateValue, baseDate) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  return date.getMonth() === baseDate.getMonth() && date.getFullYear() === baseDate.getFullYear();
};

export default function SellerDashboard() {
  const [sellerProfile, setSellerProfile] = useState(readStoredUser);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const navigate = useNavigate();
  const clearSessionAndRedirect = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem(USER_PROFILE_IMAGE_KEY);
    window.dispatchEvent(new Event("user:updated"));
    navigate("/login");
  };

  const loadDashboard = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      clearSessionAndRedirect();
      return;
    }

    setLoading(true);
    setError("");
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [profileRes, productsRes, ordersRes] = await Promise.all([
        fetch(`${API_URL}/api/users/me`, { headers }),
        fetch(`${API_URL}/api/products/seller/me`, { headers }),
        fetch(`${API_URL}/api/orders/seller`, { headers }),
      ]);
      const [profileData, productsData, ordersData] = await Promise.all([
        profileRes.json(),
        productsRes.json(),
        ordersRes.json(),
      ]);

      if (profileRes.status === 401 || productsRes.status === 401 || ordersRes.status === 401) {
        clearSessionAndRedirect();
        return;
      }

      if (!profileRes.ok) {
        setError(profileData.message || "Unable to load seller dashboard.");
        return;
      }
      if (!productsRes.ok) {
        setError(productsData.message || "Unable to load seller products.");
        return;
      }
      if (!ordersRes.ok) {
        setError(ordersData.message || "Unable to load seller orders.");
        return;
      }

      setSellerProfile(profileData || {});
      setProducts(Array.isArray(productsData) ? productsData : []);
      setOrders(Array.isArray(ordersData) ? ordersData : []);

      let existingUser = readStoredUser();
      const pendingOrders = (Array.isArray(ordersData) ? ordersData : []).filter(
        (order) => order.status === "placed"
      ).length;
      persistUserToStorage({
        ...existingUser,
        id: profileData.id,
        name: profileData.name,
        email: profileData.email,
        role: profileData.role,
        sellerStatus: profileData.sellerStatus,
        storeName: profileData.storeName,
        phone: profileData.phone,
        supportEmail: profileData.supportEmail,
        profileImage: profileData.profileImage,
        storeCoverImage: profileData.storeCoverImage,
        sellerPendingOrders: pendingOrders,
      });
      window.dispatchEvent(new Event("user:updated"));
    } catch {
      setError("Unable to load seller dashboard.");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const sellerName = sellerProfile?.name || "Seller";
  const sellerStatus = sellerProfile?.sellerStatus || "approved";
  const storeName = sellerProfile?.storeName || "CraftzyGifts Studio";
  const sellerStatusLabel =
    typeof sellerStatus === "string" && sellerStatus.length > 0
      ? sellerStatus.slice(0, 1).toUpperCase() + sellerStatus.slice(1)
      : "Pending";

  const orderStatusClass = (status) => {
    if (["placed", "pending_payment", "return_requested"].includes(status)) return "warning";
    if (["processing", "shipped", "refund_initiated"].includes(status)) return "info";
    if (["delivered", "refunded"].includes(status)) return "success";
    return "locked";
  };

  const insights = useMemo(() => {
    const now = new Date();
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const monthlyOrders = orders.filter((order) => isSameMonth(order.createdAt, now));
    const previousMonthOrders = orders.filter((order) =>
      isSameMonth(order.createdAt, previousMonth)
    );

    const monthlyRevenue = monthlyOrders
      .filter((order) => order.paymentStatus === "paid")
      .reduce((sum, order) => sum + Number(order.total || 0), 0);
    const previousMonthlyRevenue = previousMonthOrders
      .filter((order) => order.paymentStatus === "paid")
      .reduce((sum, order) => sum + Number(order.total || 0), 0);

    const paidOrderCount = monthlyOrders.filter((order) => order.paymentStatus === "paid").length;
    const avgOrderValue = paidOrderCount > 0 ? monthlyRevenue / paidOrderCount : 0;
    const activeListings = products.filter((item) => item.status !== "inactive").length;
    const lowStockCount = products.filter((item) => Number(item.stock || 0) <= 5).length;
    const awaitingAcceptanceCount = orders.filter((order) => order.status === "placed").length;
    const returnRequestedCount = orders.filter(
      (order) => order.status === "return_requested"
    ).length;

    const revenueDelta =
      previousMonthlyRevenue > 0
        ? `${Math.round(
            ((monthlyRevenue - previousMonthlyRevenue) / previousMonthlyRevenue) * 100
          )}% vs last month`
        : `${paidOrderCount} paid orders`;

    const stats = [
      { label: "Monthly revenue", value: money(monthlyRevenue), delta: revenueDelta },
      {
        label: "Orders this month",
        value: String(monthlyOrders.length),
        delta: `${awaitingAcceptanceCount} waiting acceptance`,
      },
      {
        label: "Avg. paid order value",
        value: money(avgOrderValue),
        delta: `${paidOrderCount} paid orders`,
      },
      {
        label: "Active listings",
        value: String(activeListings),
        delta: `${lowStockCount} low stock`,
      },
    ];

    const inProgressOrders = orders.filter((order) =>
      ["placed", "processing", "shipped", "return_requested", "refund_initiated"].includes(
        order.status
      )
    );

    const soldByProductId = orders.reduce((acc, order) => {
      const productId = order?.product?._id || order?.product;
      if (!productId || order.status === "cancelled") return acc;
      acc[productId] = (acc[productId] || 0) + Number(order.quantity || 1);
      return acc;
    }, {});

    const rankedProducts = [...products].sort((a, b) => {
      const soldA = soldByProductId[a._id] || 0;
      const soldB = soldByProductId[b._id] || 0;
      if (soldA !== soldB) return soldB - soldA;
      return Number(a.stock || 0) - Number(b.stock || 0);
    });

    return {
      now,
      stats,
      monthlyOrders,
      inProgressOrders,
      topProducts: rankedProducts.slice(0, 3),
      soldByProductId,
      awaitingAcceptanceCount,
      lowStockCount,
      returnRequestedCount,
    };
  }, [orders, products]);

  const downloadReport = () => {
    setError("");
    setNotice("");

    if (orders.length === 0) {
      setNotice("No orders available to export yet.");
      return;
    }

    const headers = [
      "Order ID",
      "Date",
      "Customer",
      "Product",
      "Status",
      "Payment Status",
      "Payment Mode",
      "Total",
    ];

    const rows = orders.map((order) => [
      order._id?.slice(-8)?.toUpperCase() || "",
      order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-IN") : "",
      order.customer?.name || "Customer",
      order.product?.name || "Product",
      order.status || "",
      order.paymentStatus || "",
      (order.paymentMode || "").toUpperCase(),
      Number(order.total || 0).toLocaleString("en-IN"),
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => toCsvCell(cell)).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `seller-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);

    setNotice("Report downloaded.");
  };

  const goToOrders = (status = "") => {
    if (status) {
      navigate(`/seller/orders?status=${status}`);
      return;
    }
    navigate("/seller/orders");
  };

  const goToProducts = (options = {}) => {
    const query = new URLSearchParams();
    if (options.new) query.set("new", "1");
    if (options.lowStock) query.set("lowStock", "1");
    const queryString = query.toString();
    navigate(`/seller/products${queryString ? `?${queryString}` : ""}`);
  };

  const openProductDetail = (productId) => {
    if (!productId) return;
    navigate(`/products/${productId}`);
  };

  const openMyStore = async (withEdit = false) => {
    setError("");
    setNotice("");
    const fallbackUser = readStoredUser();
    let ownSellerId = String(
      sellerProfile?.id || sellerProfile?._id || fallbackUser?.id || fallbackUser?._id || ""
    ).trim();
    if (!ownSellerId) {
      ownSellerId = readUserIdFromToken();
    }
    if (!ownSellerId) {
      const token = localStorage.getItem("token");
      if (token) {
        try {
          const res = await fetch(`${API_URL}/api/users/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await res.json();
          if (res.ok) {
            ownSellerId = String(data?.id || data?._id || "").trim();
            if (ownSellerId) {
              setSellerProfile(data);
              persistUserToStorage({
                ...fallbackUser,
                id: ownSellerId,
                name: data.name,
                email: data.email,
                role: data.role,
                sellerStatus: data.sellerStatus,
                storeName: data.storeName,
                phone: data.phone,
                supportEmail: data.supportEmail,
                profileImage: data.profileImage,
                storeCoverImage: data.storeCoverImage,
              });
            }
          }
        } catch {
          // Fallback handled below.
        }
      }
    }
    if (!ownSellerId) {
      setError("Unable to open store now. Please refresh dashboard once.");
      return;
    }
    navigate(`/store/${ownSellerId}${withEdit ? "?edit=1" : ""}`);
  };

  return (
    <div className="page seller-page">
      <Header variant="seller" />

      <section className="seller-hero">
        <div>
          <p className="seller-kicker">Seller Hub</p>
          <h2>Welcome back, {sellerName}</h2>
          <p className="seller-subtitle">
            Manage listings, track orders, and grow your craft business with
            real-time insights.
          </p>
          <div className="seller-meta">
            <span className="seller-chip">Store: {storeName}</span>
            <span className="seller-chip">Status: {sellerStatusLabel}</span>
            <span className="seller-chip">{orders.length} total orders</span>
          </div>
        </div>
        <div className="seller-actions">
          <button className="btn primary" type="button" onClick={() => goToProducts({ new: true })}>
            Add new product
          </button>
          <button className="btn ghost" type="button" onClick={() => openMyStore(false)}>
            View my store
          </button>
          <button className="btn ghost" type="button" onClick={() => openMyStore(true)}>
            Edit store profile
          </button>
          <button className="btn ghost" type="button" onClick={downloadReport}>
            Download report
          </button>
          <button className="btn ghost" type="button" onClick={loadDashboard}>
            Refresh data
          </button>
        </div>
      </section>

      {sellerStatus !== "approved" && (
        <div className="seller-alert">
          <strong>Approval pending.</strong> You can set up your store profile
          and prepare listings while we verify your documents.
        </div>
      )}

      {loading && <p className="field-hint">Loading seller dashboard...</p>}
      {error && <p className="field-hint">{error}</p>}
      {notice && <p className="field-hint">{notice}</p>}

      <div className="seller-main">
        <div className="seller-overview">
          <div className="seller-panel">
            <div className="card-head">
              <h3 className="card-title">This month</h3>
              <span className="chip">{monthLabel(insights.now)}</span>
            </div>
            <div className="stat-grid">
              {insights.stats.map((item) => (
                <div key={item.label} className="stat-card">
                  <p className="stat-label">{item.label}</p>
                  <p className="stat-value">{item.value}</p>
                  <p className="stat-delta">{item.delta}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="seller-panel">
            <div className="card-head">
              <h3 className="card-title">Orders in progress</h3>
              <button className="btn ghost" type="button" onClick={() => goToOrders()}>
                View all
              </button>
            </div>
            <div className="orders-table compact">
              <div className="order-row order-head">
                <span>Order</span>
                <span>Customer</span>
                <span>Status</span>
                <span>Total</span>
              </div>
              {insights.inProgressOrders.slice(0, 3).map((order) => (
                <div key={order._id} className="order-row">
                  <span>{order._id?.slice(-8)?.toUpperCase()}</span>
                  <span>{order.customer?.name || "Customer"}</span>
                  <span className={`status-pill ${orderStatusClass(order.status)}`}>
                    {order.status}
                  </span>
                  <span className="order-total">{money(order.total)}</span>
                </div>
              ))}
              {!loading && insights.inProgressOrders.length === 0 && (
                <p className="field-hint">No in-progress orders right now.</p>
              )}
            </div>
          </div>

          <div className="seller-panel">
            <div className="card-head">
              <h3 className="card-title">Action items</h3>
            </div>
            <ul className="seller-list">
              <li>
                <span>{insights.awaitingAcceptanceCount} orders waiting acceptance</span>
                <button className="btn ghost" type="button" onClick={() => goToOrders("placed")}>
                  Review
                </button>
              </li>
              <li>
                <span>Update stock for {insights.lowStockCount} listings</span>
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => goToProducts({ lowStock: true })}
                >
                  Restock
                </button>
              </li>
              <li>
                <span>{insights.returnRequestedCount} return requests pending</span>
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => goToOrders("return_requested")}
                >
                  Handle
                </button>
              </li>
            </ul>
          </div>

          <div className="seller-panel">
            <div className="card-head">
              <h3 className="card-title">Top products</h3>
            </div>
            <div className="seller-mini-grid">
              {insights.topProducts.map((item) => (
                <button
                  key={item._id}
                  type="button"
                  className="mini-card mini-card-action"
                  onClick={() => openProductDetail(item._id)}
                >
                  <img src={getProductImage(item)} alt={item.name} />
                  <div>
                    <p className="mini-title">{item.name}</p>
                    <p className="mini-sub">
                      {money(item.price)} • {Number(item.stock || 0)} in stock •{" "}
                      {insights.soldByProductId[item._id] || 0} sold
                    </p>
                  </div>
                </button>
              ))}
              {!loading && insights.topProducts.length === 0 && (
                <p className="field-hint">No products yet. Add your first listing.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
