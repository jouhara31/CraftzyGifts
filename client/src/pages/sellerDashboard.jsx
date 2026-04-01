import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getProductImage } from "../utils/productMedia";
import useHashScroll from "../utils/useHashScroll";

import { API_URL } from "../apiBase";
const USER_PROFILE_IMAGE_KEY = "user_profile_image";
const DASHBOARD_REFRESH_INTERVAL_MS = 60000;
const CUSTOMER_MESSAGES_HASH = "#customer-messages";
const CUSTOMER_MESSAGES_SECTION_ID = "customer-messages";
const CONTACT_REQUEST_QUERY_KEY = "contactRequest";
const SELLER_DASHBOARD_CACHE_KEY = "seller_dashboard_snapshot";

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

const readSellerDashboardSnapshot = () => {
  try {
    const raw = sessionStorage.getItem(SELLER_DASHBOARD_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const currentUser = readStoredUser();
    const snapshotUserId = String(parsed.userId || "").trim();
    const currentUserId = String(currentUser?.id || currentUser?._id || "").trim();
    if (snapshotUserId && currentUserId && snapshotUserId !== currentUserId) {
      return null;
    }

    return {
      sellerProfile:
        parsed.sellerProfile && typeof parsed.sellerProfile === "object"
          ? parsed.sellerProfile
          : currentUser,
      products: Array.isArray(parsed.products) ? parsed.products : [],
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
      notificationUnreadCount: Math.max(0, Number(parsed.notificationUnreadCount || 0)),
      contactRequests: Array.isArray(parsed.contactRequests) ? parsed.contactRequests : [],
      contactRequestTotal: Math.max(0, Number(parsed.contactRequestTotal || 0)),
    };
  } catch {
    return null;
  }
};

const persistSellerDashboardSnapshot = (snapshot = {}) => {
  try {
    sessionStorage.setItem(
      SELLER_DASHBOARD_CACHE_KEY,
      JSON.stringify({
        userId: String(snapshot.userId || "").trim(),
        sellerProfile: snapshot.sellerProfile || {},
        products: Array.isArray(snapshot.products) ? snapshot.products : [],
        orders: Array.isArray(snapshot.orders) ? snapshot.orders : [],
        notifications: Array.isArray(snapshot.notifications) ? snapshot.notifications : [],
        notificationUnreadCount: Math.max(0, Number(snapshot.notificationUnreadCount || 0)),
        contactRequests: Array.isArray(snapshot.contactRequests) ? snapshot.contactRequests : [],
        contactRequestTotal: Math.max(0, Number(snapshot.contactRequestTotal || 0)),
      })
    );
  } catch {
    // Ignore sessionStorage failures.
  }
};

const clearSellerDashboardSnapshot = () => {
  try {
    sessionStorage.removeItem(SELLER_DASHBOARD_CACHE_KEY);
  } catch {
    // Ignore sessionStorage failures.
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

const fullDateLabel = (value) => {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
};

const isSameMonth = (dateValue, baseDate) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  return date.getMonth() === baseDate.getMonth() && date.getFullYear() === baseDate.getFullYear();
};

const formatStatusLabel = (value) =>
  String(value || "")
    .trim()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase()) || "Unknown";

const truncateText = (value, max = 180) => {
  const text = String(value || "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3).trimEnd()}...`;
};

const MessageActionIcon = () => (
  <svg
    className="seller-dashboard-message-icon"
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M10 7H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h8" />
    <path d="m14 8 4 4-4 4" />
    <path d="M18 12H9" />
  </svg>
);

const NotificationTypeIcon = ({ type }) => {
  if (type === "new_order") {
    return (
      <svg className="seller-dashboard-notification-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 7h12l-1.2 7H7.2L6 7Z" />
        <path d="M8.5 7V5.8A1.8 1.8 0 0 1 10.3 4h3.4a1.8 1.8 0 0 1 1.8 1.8V7" />
        <path d="M9.3 10.2h5.4" />
      </svg>
    );
  }
  if (type === "customer_message") {
    return (
      <svg className="seller-dashboard-notification-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 6.5h15a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-9l-4 3v-3h-2A1.5 1.5 0 0 1 3 16V8a1.5 1.5 0 0 1 1.5-1.5Z" />
        <path d="m6 9 6 4 6-4" />
      </svg>
    );
  }
  if (type === "review_received") {
    return (
      <svg className="seller-dashboard-notification-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 4 2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 9.2l5-.7Z" />
      </svg>
    );
  }
  if (type === "return_request") {
    return (
      <svg className="seller-dashboard-notification-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 8V4H3" />
        <path d="M3.5 8A7.5 7.5 0 0 1 18 6.2" />
        <path d="M17 16v4h4" />
        <path d="M20.5 16A7.5 7.5 0 0 1 6 17.8" />
      </svg>
    );
  }
  if (type === "out_of_stock" || type === "low_stock") {
    return (
      <svg className="seller-dashboard-notification-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3.8 3.8 18h16.4L12 3.8Z" />
        <path d="M12 9.2v4.8" />
        <path d="M12 17.2h.01" />
      </svg>
    );
  }
  return (
    <svg className="seller-dashboard-notification-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4.5a4 4 0 0 1 4 4v2.5c0 1.5.5 2.7 1.5 3.7l.8.8H5.7l.8-.8c1-1 1.5-2.2 1.5-3.7V8.5a4 4 0 0 1 4-4Z" />
      <path d="M10.2 18.2a2 2 0 0 0 3.6 0" />
    </svg>
  );
};

export default function SellerDashboard() {
  const location = useLocation();
  const initialDashboardSnapshot = useMemo(() => readSellerDashboardSnapshot(), []);
  const hasHydratedDashboardRef = useRef(Boolean(initialDashboardSnapshot));
  const [sellerProfile, setSellerProfile] = useState(
    () => initialDashboardSnapshot?.sellerProfile || readStoredUser()
  );
  const [products, setProducts] = useState(() => initialDashboardSnapshot?.products || []);
  const [orders, setOrders] = useState(() => initialDashboardSnapshot?.orders || []);
  const [notifications, setNotifications] = useState(
    () => initialDashboardSnapshot?.notifications || []
  );
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(
    () => initialDashboardSnapshot?.notificationUnreadCount || 0
  );
  const [contactRequests, setContactRequests] = useState(
    () => initialDashboardSnapshot?.contactRequests || []
  );
  const [contactRequestTotal, setContactRequestTotal] = useState(
    () => initialDashboardSnapshot?.contactRequestTotal || 0
  );
  const [loading, setLoading] = useState(() => !initialDashboardSnapshot);
  const [hasLoadedDashboard, setHasLoadedDashboard] = useState(() => Boolean(initialDashboardSnapshot));
  const [notificationsBusy, setNotificationsBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const navigate = useNavigate();
  useHashScroll();
  const clearSessionAndRedirect = useCallback(() => {
    clearSellerDashboardSnapshot();
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem(USER_PROFILE_IMAGE_KEY);
    window.dispatchEvent(new Event("user:updated"));
    navigate("/login");
  }, [navigate]);
  const focusedContactRequestId = useMemo(
    () => String(new URLSearchParams(location.search).get(CONTACT_REQUEST_QUERY_KEY) || "").trim(),
    [location.search]
  );
  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    const token = localStorage.getItem("token");
    if (!token) {
      clearSessionAndRedirect();
      return;
    }

    if (!silent && !hasHydratedDashboardRef.current) {
      setLoading(true);
    }
    setError("");
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const contactQuery = new URLSearchParams({ limit: "5" });
      if (focusedContactRequestId) {
        contactQuery.set(CONTACT_REQUEST_QUERY_KEY, focusedContactRequestId);
      }
      const [profileRes, productsRes, ordersRes, contactRes, notificationsRes] = await Promise.all([
        fetch(`${API_URL}/api/users/me`, { headers }),
        fetch(`${API_URL}/api/products/seller/me`, { headers }),
        fetch(`${API_URL}/api/orders/seller`, { headers }),
        fetch(`${API_URL}/api/users/me/contact-requests?${contactQuery.toString()}`, { headers }),
        fetch(`${API_URL}/api/users/me/notifications?limit=8`, { headers }),
      ]);
      const [profileData, productsData, ordersData, contactData, notificationsData] = await Promise.all([
        profileRes.json(),
        productsRes.json(),
        ordersRes.json(),
        contactRes.json(),
        notificationsRes.json(),
      ]);

      if (
        profileRes.status === 401 ||
        productsRes.status === 401 ||
        ordersRes.status === 401 ||
        contactRes.status === 401 ||
        notificationsRes.status === 401
      ) {
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
      setContactRequests(
        contactRes.ok && Array.isArray(contactData?.items) ? contactData.items : []
      );
      setContactRequestTotal(
        contactRes.ok ? Number(contactData?.total || 0) : 0
      );
      setNotifications(
        notificationsRes.ok && Array.isArray(notificationsData?.items)
          ? notificationsData.items
          : []
      );
      setNotificationUnreadCount(
        notificationsRes.ok ? Number(notificationsData?.unreadCount || 0) : 0
      );

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
      persistSellerDashboardSnapshot({
        userId: profileData.id,
        sellerProfile: profileData || {},
        products: Array.isArray(productsData) ? productsData : [],
        orders: Array.isArray(ordersData) ? ordersData : [],
        notifications:
          notificationsRes.ok && Array.isArray(notificationsData?.items)
            ? notificationsData.items
            : [],
        notificationUnreadCount:
          notificationsRes.ok ? Number(notificationsData?.unreadCount || 0) : 0,
        contactRequests:
          contactRes.ok && Array.isArray(contactData?.items) ? contactData.items : [],
        contactRequestTotal: contactRes.ok ? Number(contactData?.total || 0) : 0,
      });
      window.dispatchEvent(new Event("user:updated"));
    } catch {
      setError("Unable to load seller dashboard.");
    } finally {
      hasHydratedDashboardRef.current = true;
      setHasLoadedDashboard(true);
      if (!silent) {
        setLoading(false);
      }
    }
  }, [clearSessionAndRedirect, focusedContactRequestId]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      loadDashboard({ silent: true });
    }, DASHBOARD_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [loadDashboard]);

  useEffect(() => {
    const handleNotificationSync = () => {
      loadDashboard({ silent: true });
    };

    window.addEventListener("seller:notifications-updated", handleNotificationSync);
    return () => {
      window.removeEventListener("seller:notifications-updated", handleNotificationSync);
    };
  }, [loadDashboard]);

  useEffect(() => {
    if (location.hash !== CUSTOMER_MESSAGES_HASH) return;

    const frameId = window.requestAnimationFrame(() => {
      const target = focusedContactRequestId
        ? document.getElementById(`contact-request-${focusedContactRequestId}`)
        : document.getElementById(CUSTOMER_MESSAGES_SECTION_ID);
      if (!target) return;
      target.scrollIntoView({
        behavior: "smooth",
        block: focusedContactRequestId ? "center" : "start",
      });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [contactRequests.length, focusedContactRequestId, loading, location.hash]);

  const sellerName = sellerProfile?.name || "Seller";
  const sellerStatus = sellerProfile?.sellerStatus || "approved";
  const storeName = sellerProfile?.storeName || "CraftzyGifts Studio";
  const sellerStatusLabel =
    typeof sellerStatus === "string" && sellerStatus.length > 0
      ? sellerStatus.slice(0, 1).toUpperCase() + sellerStatus.slice(1)
      : "Pending";
  const sellerLocation =
    [sellerProfile?.pickupAddress?.city, sellerProfile?.pickupAddress?.state]
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .join(", ") || "Location not shared";
  const sellerJoinedLabel = fullDateLabel(sellerProfile?.createdAt);
  const sellerSupportLabel = "Private seller inbox";
  const showDashboardLoading = loading && !hasLoadedDashboard;

  const orderStatusClass = (status) => {
    if (["placed", "pending_payment", "return_requested"].includes(status)) return "warning";
    if (["processing", "shipped"].includes(status)) return "info";
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
      ["placed", "processing", "shipped", "return_requested"].includes(order.status)
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
      monthlyRevenue,
      avgOrderValue,
      activeListings,
      monthlyOrders,
      inProgressOrders,
      topProducts: rankedProducts.slice(0, 3),
      soldByProductId,
      awaitingAcceptanceCount,
      lowStockCount,
      returnRequestedCount,
    };
  }, [orders, products]);

  const pendingOpsCount =
    insights.awaitingAcceptanceCount + insights.lowStockCount + insights.returnRequestedCount;
  const heroHighlights = [
    {
      label: "This month",
      value: money(insights.monthlyRevenue),
      note: `${insights.monthlyOrders.length} orders in ${monthLabel(insights.now)}`,
    },
    {
      label: "Open tasks",
      value: String(pendingOpsCount),
      note: pendingOpsCount > 0 ? "Orders, returns, or stock need attention" : "No urgent actions right now",
    },
    {
      label: "Live listings",
      value: String(insights.activeListings),
      note: `${insights.lowStockCount} low stock • Avg order ${money(insights.avgOrderValue)}`,
    },
  ];
  const actionItems = [
    {
      label: "Orders waiting acceptance",
      value: insights.awaitingAcceptanceCount,
      note: "New orders to review and move into processing.",
      cta: "Review",
      onClick: () => goToOrders("placed"),
    },
    {
      label: "Low-stock listings",
      value: insights.lowStockCount,
      note: "Products with 5 or fewer items remaining.",
      cta: "Restock",
      onClick: () => goToProducts({ lowStock: true }),
    },
    {
      label: "Return requests",
      value: insights.returnRequestedCount,
      note: "Customer return or refund requests pending action.",
      cta: "Handle",
      onClick: () => goToOrders("return_requested"),
    },
  ];

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

  const syncNotificationsReadState = useCallback((ids = [], unreadCountOverride = null) => {
    const normalizedIds = Array.isArray(ids)
      ? ids.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
    if (normalizedIds.length > 0) {
      setNotifications((prev) =>
        prev.map((item) =>
          normalizedIds.includes(String(item?.id || "").trim())
            ? { ...item, isRead: true }
            : item
        )
      );
    }
    if (Number.isFinite(unreadCountOverride)) {
      setNotificationUnreadCount(Math.max(0, Number(unreadCountOverride || 0)));
    }
    window.dispatchEvent(new Event("seller:notifications-updated"));
  }, []);

  const markNotificationsRead = useCallback(
    async ({ ids = [], all = false } = {}) => {
      const token = localStorage.getItem("token");
      if (!token) return null;

      setNotificationsBusy(true);
      try {
        const res = await fetch(`${API_URL}/api/users/me/notifications/read`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ ids, all }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 401) {
            clearSessionAndRedirect();
          }
          return null;
        }
        syncNotificationsReadState(all ? notifications.map((item) => item.id) : ids, data?.unreadCount);
        return data;
      } catch {
        return null;
      } finally {
        setNotificationsBusy(false);
      }
    },
    [clearSessionAndRedirect, notifications, syncNotificationsReadState]
  );

  const handleNotificationOpen = useCallback(
    async (item) => {
      const nextLink = String(item?.link || "").trim();
      const itemId = String(item?.id || "").trim();
      if (itemId && item?.isRead !== true) {
        await markNotificationsRead({ ids: [itemId] });
      }
      if (nextLink) {
        navigate(nextLink);
      }
    },
    [markNotificationsRead, navigate]
  );

  const handleMarkAllNotificationsRead = useCallback(async () => {
    if (notificationUnreadCount <= 0) return;
    await markNotificationsRead({ all: true });
  }, [markNotificationsRead, notificationUnreadCount]);

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
    navigate(`/seller/store/${ownSellerId}${withEdit ? "?edit=1" : ""}`);
  };

  return (
    <div className="seller-shell-view seller-dashboard-page">
      <section className="seller-hero seller-dashboard-hero" id="dashboard-overview">
        <div className="seller-dashboard-hero-main">
          <p className="seller-kicker">Seller Hub</p>
          <h2>Welcome back, {sellerName}</h2>
          <p className="seller-subtitle">
            Manage listings, track orders, and grow your craft business with
            real-time insights.
          </p>
          <div className="seller-meta seller-dashboard-meta">
            <span className="seller-chip">Store: {storeName}</span>
            <span className="seller-chip">Status: {sellerStatusLabel}</span>
            <span className="seller-chip">{orders.length} total orders</span>
            <span className="seller-chip">Joined: {sellerJoinedLabel}</span>
          </div>
          <div className="seller-actions seller-dashboard-actions">
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
        </div>
        <aside className="seller-dashboard-hero-aside" aria-label="Overview highlights">
          {heroHighlights.map((item) => (
            <article key={item.label} className="seller-dashboard-glance-card">
              <p>{item.label}</p>
              <strong>{item.value}</strong>
              <span>{item.note}</span>
            </article>
          ))}
        </aside>
      </section>

      {sellerStatus !== "approved" && (
        <div className="seller-alert">
          <strong>Approval pending.</strong> You can set up your store profile
          and prepare listings while we verify your documents.
        </div>
      )}

      {showDashboardLoading && <p className="field-hint">Loading seller dashboard...</p>}
      {error && <p className="field-hint">{error}</p>}
      {notice && <p className="field-hint">{notice}</p>}

      <div className="seller-main seller-dashboard-main">
        <div className="seller-overview seller-dashboard-grid">
          <div className="seller-dashboard-primary">
            <div className="seller-panel seller-dashboard-panel seller-anchor-section" id="seller-dashboard-metrics">
              <div className="card-head seller-dashboard-head">
                <div>
                  <h3 className="card-title">This month</h3>
                  <p className="seller-dashboard-panel-subtitle">
                    Track revenue, order volume, average ticket size, and listing health.
                  </p>
                </div>
                <span className="chip">{monthLabel(insights.now)}</span>
              </div>
              <div className="stat-grid seller-dashboard-stat-grid">
                {insights.stats.map((item) => (
                  <div key={item.label} className="stat-card seller-dashboard-stat-card">
                    <p className="stat-label">{item.label}</p>
                    <p className="stat-value">{item.value}</p>
                    <p className="stat-delta">{item.delta}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="seller-panel seller-dashboard-panel seller-anchor-section" id="seller-dashboard-orders">
              <div className="card-head seller-dashboard-head">
                <div>
                  <h3 className="card-title">Orders in progress</h3>
                  <p className="seller-dashboard-panel-subtitle">
                    Keep the latest customer orders moving without opening the full order page.
                  </p>
                </div>
                <button className="btn ghost" type="button" onClick={() => goToOrders()}>
                  View all
                </button>
              </div>
              <div className="seller-dashboard-order-list">
                {insights.inProgressOrders.slice(0, 4).map((order) => (
                  <article key={order._id} className="seller-dashboard-order-card">
                    <div className="seller-dashboard-order-main">
                      <p className="seller-dashboard-order-code">
                        #{order._id?.slice(-8)?.toUpperCase() || "ORDER"}
                      </p>
                      <strong>{order.customer?.name || "Customer"}</strong>
                      <span>{order.product?.name || "Product"}</span>
                    </div>
                    <div className="seller-dashboard-order-side">
                      <span className={`status-pill ${orderStatusClass(order.status)}`}>
                        {formatStatusLabel(order.status)}
                      </span>
                      <strong>{money(order.total)}</strong>
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() => goToOrders(order.status)}
                      >
                        Open
                      </button>
                    </div>
                  </article>
                ))}
                {hasLoadedDashboard && insights.inProgressOrders.length === 0 && (
                  <p className="field-hint">No in-progress orders right now.</p>
                )}
              </div>
            </div>

            <div
              className="seller-panel seller-dashboard-panel seller-anchor-section"
              id={CUSTOMER_MESSAGES_SECTION_ID}
            >
              <div className="card-head seller-dashboard-head">
                <div>
                  <h3 className="card-title">Customer messages</h3>
                  <p className="seller-dashboard-panel-subtitle">
                    Secure contact requests sent from your public store page.
                  </p>
                </div>
                <span className="chip">{contactRequestTotal} total</span>
              </div>
              <div className="seller-dashboard-message-list">
                {contactRequests.map((item) => (
                  <article
                    key={item.id}
                    id={`contact-request-${item.id}`}
                    className={`seller-dashboard-message-card ${
                      focusedContactRequestId && item.id === focusedContactRequestId
                        ? "is-focused"
                        : ""
                    }`.trim()}
                  >
                    <div className="seller-dashboard-message-head">
                      <div className="seller-dashboard-message-meta">
                        <strong>{item.senderName || "Customer"}</strong>
                        <span>{item.senderEmail || "Email not provided"}</span>
                      </div>
                      <span>{fullDateLabel(item.createdAt)}</span>
                    </div>
                    <p className="seller-dashboard-message-body">
                      {truncateText(item.message, 180)}
                    </p>
                    <a className="btn seller-dashboard-message-reply" href={`mailto:${item.senderEmail}`}>
                      <MessageActionIcon />
                      Reply by email
                    </a>
                  </article>
                ))}
                {hasLoadedDashboard && contactRequests.length === 0 && (
                  <p className="field-hint">No customer messages yet.</p>
                )}
              </div>
            </div>
          </div>

          <aside className="seller-dashboard-rail">
            <div
              className="seller-panel seller-dashboard-panel seller-anchor-section"
              id="seller-dashboard-notifications"
            >
              <div className="card-head seller-dashboard-head">
                <div>
                  <h3 className="card-title">Notifications</h3>
                  <p className="seller-dashboard-panel-subtitle">
                    Orders, reviews, customer messages, and stock alerts from your store.
                  </p>
                </div>
                <button
                  className="btn ghost"
                  type="button"
                  onClick={handleMarkAllNotificationsRead}
                  disabled={notificationsBusy || notificationUnreadCount <= 0}
                >
                  Mark all read
                </button>
              </div>
              <div className="seller-dashboard-notification-list">
                {notifications.map((item) => (
                  <article
                    key={item.id}
                    className={`seller-dashboard-notification-card ${
                      item.isRead ? "" : "is-unread"
                    }`}
                  >
                    <div className="seller-dashboard-notification-icon-wrap">
                      <NotificationTypeIcon type={item.type} />
                    </div>
                    <div className="seller-dashboard-notification-copy">
                      <div className="seller-dashboard-notification-head">
                        <strong>{item.title || "Notification"}</strong>
                        <span>{fullDateLabel(item.createdAt)}</span>
                      </div>
                      <p>{item.message || "Seller activity update."}</p>
                      <div className="seller-dashboard-notification-actions">
                        {!item.isRead ? <span className="chip">Unread</span> : null}
                        <button
                          className="btn ghost"
                          type="button"
                          onClick={() => handleNotificationOpen(item)}
                        >
                          Open
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
                {hasLoadedDashboard && notifications.length === 0 && (
                  <p className="field-hint">No notifications yet.</p>
                )}
              </div>
            </div>

            <div className="seller-panel seller-dashboard-panel">
              <div className="card-head seller-dashboard-head">
                <div>
                  <h3 className="card-title">Action items</h3>
                  <p className="seller-dashboard-panel-subtitle">
                    High-signal tasks that affect fulfilment and store health.
                  </p>
                </div>
              </div>
              <div className="seller-dashboard-action-list">
                {actionItems.map((item) => (
                  <div key={item.label} className="seller-dashboard-action-item">
                    <span className="seller-dashboard-action-count">{item.value}</span>
                    <div className="seller-dashboard-action-copy">
                      <strong>{item.label}</strong>
                      <p>{item.note}</p>
                    </div>
                    <button className="btn ghost" type="button" onClick={item.onClick}>
                      {item.cta}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="seller-panel seller-dashboard-panel">
              <div className="card-head seller-dashboard-head">
                <div>
                  <h3 className="card-title">Store snapshot</h3>
                  <p className="seller-dashboard-panel-subtitle">
                    The current profile details customers see with your store.
                  </p>
                </div>
              </div>
              <div className="seller-dashboard-pulse-list">
                <div className="seller-dashboard-pulse-item">
                  <span>Store name</span>
                  <strong>{storeName}</strong>
                </div>
                <div className="seller-dashboard-pulse-item">
                  <span>Status</span>
                  <strong>{sellerStatusLabel}</strong>
                </div>
                <div className="seller-dashboard-pulse-item">
                  <span>Location</span>
                  <strong>{sellerLocation}</strong>
                </div>
                <div className="seller-dashboard-pulse-item">
                  <span>Support</span>
                  <strong>{sellerSupportLabel}</strong>
                </div>
              </div>
              <div className="seller-dashboard-pulse-actions">
                <button className="btn ghost" type="button" onClick={() => openMyStore(false)}>
                  View store
                </button>
                <button className="btn ghost" type="button" onClick={() => openMyStore(true)}>
                  Edit profile
                </button>
              </div>
            </div>

            <div className="seller-panel seller-dashboard-panel">
              <div className="card-head seller-dashboard-head">
                <div>
                  <h3 className="card-title">Top products</h3>
                  <p className="seller-dashboard-panel-subtitle">
                    Best-performing listings by sold quantity and stock movement.
                  </p>
                </div>
              </div>
              <div className="seller-dashboard-product-list">
                {insights.topProducts.map((item, index) => (
                  <button
                    key={item._id}
                    type="button"
                    className="seller-dashboard-product-card"
                    onClick={() => openProductDetail(item._id)}
                  >
                    <img src={getProductImage(item)} alt={item.name} />
                    <div className="seller-dashboard-product-copy">
                      <p className="seller-dashboard-product-rank">
                        #{index + 1} performer
                      </p>
                      <p className="mini-title">{item.name}</p>
                      <p className="mini-sub">
                        {money(item.price)} • {Number(item.stock || 0)} in stock
                      </p>
                    </div>
                    <span className="seller-dashboard-product-sales">
                      {insights.soldByProductId[item._id] || 0} sold
                    </span>
                  </button>
                ))}
                {hasLoadedDashboard && insights.topProducts.length === 0 && (
                  <p className="field-hint">No products yet. Add your first listing.</p>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

