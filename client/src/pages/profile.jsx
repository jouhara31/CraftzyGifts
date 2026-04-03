import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import Header from "../components/Header";
import logoPng from "../assets/logo.png";
import { addToCart } from "../utils/cart";
import { optimizeImageFile } from "../utils/imageUpload";
import { getProductImage } from "../utils/productMedia";
import { getWishlist, toggleWishlist } from "../utils/wishlist";

import { API_URL } from "../apiBase";
import {
  apiFetchJson,
  clearAuthSession,
  hasActiveSession,
  logoutSession,
  persistStoredUser,
  readStoredUser,
} from "../utils/authSession";
import {
  buildSellerSidebarSections,
  isWorkspacePathActive,
} from "../utils/sellerWorkspace";

const ROLE_LABEL = {
  customer: "Customer",
  seller: "Seller",
  admin: "Admin",
};

const ACTIVE_ORDER_STATUSES = new Set([
  "pending_payment",
  "placed",
  "processing",
  "shipped",
  "out_for_delivery",
  "return_requested",
]);
const CUSTOMER_ACCOUNT_DEFAULT_TAB = "profile";
const CUSTOMER_ACCOUNT_TABS = new Set(["profile", "addresses", "orders", "wishlist"]);
const CUSTOMER_ORDER_STATUS_LABELS = {
  pending_payment: "Awaiting payment",
  placed: "Order placed",
  processing: "Processing",
  shipped: "Shipped",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  return_requested: "Return requested",
  return_rejected: "Return rejected",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

const formatMoney = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const formatJoinedDate = (value) => {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
};
const formatFullDate = (value) => {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};
const formatAccountAddress = (address = {}) =>
  [
    address?.line1,
    address?.line2,
    address?.city,
    address?.state,
    address?.pincode,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ") || "Not set";
const formatAccountStatus = (value) => {
  const status = String(value || "").trim();
  if (!status) return "Unknown";
  return (
    CUSTOMER_ORDER_STATUS_LABELS[status] ||
    status.replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase())
  );
};
const normalizeCustomerTab = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return CUSTOMER_ACCOUNT_TABS.has(normalized) ? normalized : CUSTOMER_ACCOUNT_DEFAULT_TAB;
};
const buildCustomerTabPath = (tab) =>
  tab === CUSTOMER_ACCOUNT_DEFAULT_TAB ? "/profile" : `/profile?tab=${tab}`;

const createUnauthorizedError = () => {
  const error = new Error("Session expired. Please login again.");
  error.status = 401;
  return error;
};

const buildSidebarSections = (role, { sellerStorePath = "/seller/dashboard" } = {}) => {
  if (role === "seller") {
    return buildSellerSidebarSections({ sellerStorePath });
  }

  if (role === "admin") {
    return [
      {
        title: "Admin Console",
        items: [
          { label: "Profile Information", active: true },
          { label: "Dashboard", path: "/admin/dashboard" },
          { label: "Customers", path: "/admin/customers" },
          { label: "Products", path: "/admin/products" },
          { label: "Categories", path: "/admin/categories" },
          { label: "Orders", path: "/admin/orders" },
          { label: "Inventory", path: "/admin/inventory" },
          { label: "Analytics", path: "/admin/analytics" },
          { label: "Settings", path: "/admin/settings" },
          { label: "Account", path: "/admin/account" },
        ],
      },
      {
        title: "Shortcuts",
        items: [{ label: "View product catalog", path: "/products" }],
      },
    ];
  }

  return [
    {
      title: "Shopping",
      items: [
        { label: "Orders", tab: "orders" },
        { label: "Wishlist", tab: "wishlist" },
        { label: "Cart", path: "/cart" },
      ],
    },
    {
      title: "Account",
      items: [
        { label: "Profile Information", tab: "profile" },
        { label: "Manage Addresses", tab: "addresses" },
      ],
    },
  ];
};

const ProfileMenuIcon = ({ name }) => {
  const key = String(name || "").toLowerCase();

  if (key.includes("wishlist") || key.includes("favour") || key.includes("favorite")) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 20s-7-4.7-7-10a4.2 4.2 0 0 1 7-2.9A4.2 4.2 0 0 1 19 10c0 5.3-7 10-7 10Z" />
      </svg>
    );
  }

  if (key.includes("order")) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 6.5h14v12H5z" />
        <path d="M8 4.5h8" />
        <path d="M8.5 10.5h7M8.5 14h5" />
      </svg>
    );
  }

  if (key.includes("product") || key.includes("inventory") || key.includes("hamper")) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4.5" y="4.5" width="6.5" height="6.5" rx="1.2" />
        <rect x="13" y="4.5" width="6.5" height="6.5" rx="1.2" />
        <rect x="4.5" y="13" width="6.5" height="6.5" rx="1.2" />
        <rect x="13" y="13" width="6.5" height="6.5" rx="1.2" />
      </svg>
    );
  }

  if (key.includes("cart")) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="9" cy="19" r="1.7" />
        <circle cx="17" cy="19" r="1.7" />
        <path d="M3 5h2l2.2 9.2a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.8L20 8H7" />
      </svg>
    );
  }

  if (key.includes("address") || key.includes("location")) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 21s7-7.4 7-12a7 7 0 0 0-14 0c0 4.6 7 12 7 12Z" />
        <circle cx="12" cy="9" r="2.6" />
      </svg>
    );
  }

  if (key.includes("download")) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v11" />
        <path d="M8 10l4 4 4-4" />
        <path d="M4.5 20.5h15" />
      </svg>
    );
  }

  if (key.includes("language")) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M3.5 12h17" />
        <path d="M12 3.5a14 14 0 0 1 0 17" />
        <path d="M12 3.5a14 14 0 0 0 0 17" />
      </svg>
    );
  }

  if (key.includes("subscription") || key.includes("payment")) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.5" y="6" width="17" height="12" rx="2.4" />
        <path d="M3.5 10h17" />
        <path d="M7.5 15h4" />
      </svg>
    );
  }

  if (key.includes("shipping") || key.includes("delivery")) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.5 7.5h10v8h-10z" />
        <path d="M13.5 10h3.2l2.3 2.4v3.1h-5.5z" />
        <circle cx="8" cy="17" r="1.6" />
        <circle cx="17" cy="17" r="1.6" />
      </svg>
    );
  }

  if (key.includes("report") || key.includes("analytics") || key.includes("dashboard")) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 18.5h14" />
        <path d="M7 15V10" />
        <path d="M12 15V6" />
        <path d="M17 15v-3.5" />
      </svg>
    );
  }

  if (key.includes("review") || key.includes("rating")) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 4 2.3 4.7 5.2.7-3.8 3.7.9 5.2L12 15.7 7.4 18.3l.9-5.2-3.8-3.7 5.2-.7Z" />
      </svg>
    );
  }

  if (key.includes("message") || key.includes("support") || key.includes("customer")) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 6.5h15a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-8l-4.5 3v-3h-2a1.5 1.5 0 0 1-1.5-1.5V8a1.5 1.5 0 0 1 1.5-1.5Z" />
        <path d="M7.5 10.5h9" />
        <path d="M7.5 13.5h6" />
      </svg>
    );
  }

  if (key.includes("document") || key.includes("compliance") || key.includes("gst")) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 4.5h7l3 3v12H7z" />
        <path d="M14 4.5v3h3" />
        <path d="M9 12h6" />
        <path d="M9 15h4" />
      </svg>
    );
  }

  if (key.includes("marketing") || key.includes("offer")) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 8.5h14v9H5z" />
        <path d="m9 8.5 2.5-3h1L15 8.5" />
        <path d="M12 8.5v9" />
      </svg>
    );
  }

  if (key.includes("profile") || key.includes("account")) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </svg>
    );
  }

  if (key.includes("logout") || key.includes("sign out")) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M10 6h8v12h-8" />
        <path d="M6 12h10" />
        <path d="M10 8l-4 4 4 4" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" />
    </svg>
  );
};

const fetchRoleOverview = async (role) => {
  if (role === "seller") {
    const [productResult, orderResult] = await Promise.all([
      apiFetchJson(`${API_URL}/api/products/seller/me`),
      apiFetchJson(`${API_URL}/api/orders/seller`),
    ]);
    const productRes = productResult.response;
    const orderRes = orderResult.response;
    const productsData = productResult.data;
    const ordersData = orderResult.data;

    if ([productRes, orderRes].some((response) => response.status === 401)) {
      throw createUnauthorizedError();
    }

    if (!productRes.ok) throw new Error(productsData.message || "Unable to load seller products.");
    if (!orderRes.ok) throw new Error(ordersData.message || "Unable to load seller orders.");

    const products = Array.isArray(productsData) ? productsData : [];
    const orders = Array.isArray(ordersData) ? ordersData : [];
    const paidRevenue = orders
      .filter((order) => order.paymentStatus === "paid")
      .reduce((sum, order) => sum + Number(order.total || 0), 0);
    const pendingActions = orders.filter((order) =>
      ["placed", "processing", "return_requested"].includes(order.status)
    ).length;

    return {
      cards: [
        { label: "Active listings", value: String(products.filter((item) => item.status !== "inactive").length) },
        { label: "Low stock", value: String(products.filter((item) => Number(item.stock || 0) <= 5).length) },
        { label: "Open actions", value: String(pendingActions) },
        { label: "Paid revenue", value: formatMoney(paidRevenue) },
      ],
      rowsTitle: "Recent seller orders",
      rows: orders.slice(0, 5).map((order) => ({
        key: order._id?.slice(-8)?.toUpperCase() || "Order",
        value: `${order.status} • ${formatMoney(order.total)}`,
      })),
    };
  }

  if (role === "admin") {
    const { response: sellersRes, data: sellersData } = await apiFetchJson(
      `${API_URL}/api/admin/sellers`
    );
    if (sellersRes.status === 401) {
      throw createUnauthorizedError();
    }
    if (!sellersRes.ok) {
      throw new Error(sellersData.message || "Unable to load seller accounts.");
    }

    const sellers = Array.isArray(sellersData) ? sellersData : [];
    const pending = sellers.filter((seller) => seller.sellerStatus === "pending");
    const approved = sellers.filter((seller) => seller.sellerStatus === "approved");
    const rejected = sellers.filter((seller) => seller.sellerStatus === "rejected");

    return {
      cards: [
        { label: "Total sellers", value: String(sellers.length) },
        { label: "Pending approvals", value: String(pending.length) },
        { label: "Approved sellers", value: String(approved.length) },
        { label: "Rejected sellers", value: String(rejected.length) },
      ],
      rowsTitle: "Pending seller queue",
      rows: pending.slice(0, 6).map((seller) => ({
        key: seller.storeName || seller.name || "Seller",
        value: seller.email || "No email",
      })),
    };
  }

  const { response: ordersRes, data: ordersData } = await apiFetchJson(`${API_URL}/api/orders/my`);
  if (ordersRes.status === 401) {
    throw createUnauthorizedError();
  }
  if (!ordersRes.ok) throw new Error(ordersData.message || "Unable to load your orders.");

  const orders = Array.isArray(ordersData) ? ordersData : [];
  const activeOrders = orders.filter((order) => ACTIVE_ORDER_STATUSES.has(order.status)).length;
  const delivered = orders.filter((order) => order.status === "delivered").length;

  return {
    cards: [
      { label: "Total orders", value: String(orders.length) },
      { label: "Active orders", value: String(activeOrders) },
      { label: "Delivered", value: String(delivered) },
      { label: "Wishlist items", value: String(getWishlist().length) },
    ],
    rowsTitle: "My Orders",
    rows: orders.slice(0, 5).map((order) => ({
      key: order._id?.slice(-8)?.toUpperCase() || "Order",
      value: `${order.status} • ${formatMoney(order.total)}`,
    })),
  };
};

export default function Profile() {
  const location = useLocation();
  const [profile, setProfile] = useState(null);
  const [overview, setOverview] = useState({ cards: [], rowsTitle: "", rows: [] });
  const [customerOrders, setCustomerOrders] = useState([]);
  const [customerOrdersError, setCustomerOrdersError] = useState("");
  const [wishlistItems, setWishlistItems] = useState(() => getWishlist());
  const [overviewError, setOverviewError] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [profileImageModalOpen, setProfileImageModalOpen] = useState(false);
  const [profileImageDraft, setProfileImageDraft] = useState("");
  const [profileImageDraftName, setProfileImageDraftName] = useState("");
  const [imageUpdating, setImageUpdating] = useState(false);
  const profileImageInputRef = useRef(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const role = profile?.role || "customer";
  const headerVariant =
    role === "seller" ? "seller" : role === "admin" ? "admin" : undefined;
  const roleLabel = ROLE_LABEL[role] || "Customer";
  const sellerStorePath =
    role === "seller" && String(profile?.id || profile?._id || "").trim()
      ? `/seller/store/${String(profile?.id || profile?._id || "").trim()}`
      : "/seller/dashboard";
  const sidebarSections = useMemo(
    () => buildSidebarSections(role, { sellerStorePath }),
    [role, sellerStorePath]
  );
  const isSellerProfileViewOnly = role === "seller";
  const isCustomerProfile = role === "customer";
  const ordersPath = role === "seller" ? "/seller/orders" : "/orders";
  const pageClassName =
    role === "customer" ? "page profile-page customer-profile" : "page profile-page";
  const profileImageActionLabel = isCustomerProfile ? "Save" : "Update";
  const profileImageActionLoadingLabel = isCustomerProfile ? "Saving..." : "Updating...";
  const selectedCustomerTab = normalizeCustomerTab(searchParams.get("tab"));
  const pickupAddressLabel = [
    profile?.pickupAddress?.line1,
    profile?.pickupAddress?.city,
    profile?.pickupAddress?.state,
    profile?.pickupAddress?.pincode,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");
  const sellerLocationLabel =
    [profile?.pickupAddress?.city, profile?.pickupAddress?.state]
      .map((part) => String(part || "").trim())
      .filter(Boolean)
      .join(", ") || "Not set";
  const sellerJoinedLabel = formatJoinedDate(profile?.createdAt);
  const sellerDisplayName = profile?.storeName || profile?.name || "Seller Store";
  const sidebarAvatarInitial =
    (profile?.name || profile?.storeName || "U").trim().slice(0, 1).toUpperCase() || "U";
  const showSidebarAvatarImage = Boolean(profile?.profileImage);
  const clearSessionAndRedirect = useCallback((path = "/login") => {
    clearAuthSession();
    navigate(path, { replace: path === "/login" });
  }, [navigate]);

  useEffect(() => {
    const load = async () => {
      if (!hasActiveSession()) {
        clearSessionAndRedirect("/login");
        return;
      }

      try {
        const { response, data } = await apiFetchJson(`${API_URL}/api/users/me`);
        if (!response.ok) {
          if (response.status === 401) {
            clearSessionAndRedirect("/login");
            return;
          }
          setError(data.message || "Unable to load profile.");
          return;
        }
        const nextUserSnapshot = {
          id: data.id,
          name: data.name,
          email: data.email,
          role: data.role,
          sellerStatus: data.sellerStatus,
          storeName: data.storeName,
          phone: data.phone,
          profileImage: data.profileImage,
        };
        if (data.role === "admin") {
          persistStoredUser(nextUserSnapshot);
          navigate("/admin/account", { replace: true });
          return;
        }
        if (data.role === "seller") {
          persistStoredUser(nextUserSnapshot);
          const sellerProfileId = String(data.id || data._id || "").trim();
          if (sellerProfileId) {
            navigate(`/seller/store/${sellerProfileId}`, { replace: true });
            return;
          }
        }
        setProfile(data);
        setOverviewError("");
        if (data.role === "customer") {
          setOverview({ cards: [], rowsTitle: "", rows: [] });
        } else {
          try {
            const roleOverview = await fetchRoleOverview(data.role);
            setOverview(roleOverview);
          } catch (overviewLoadError) {
            if (overviewLoadError?.status === 401) {
              clearSessionAndRedirect("/login");
              return;
            }
            setOverview({ cards: [], rowsTitle: "", rows: [] });
            setOverviewError(overviewLoadError.message || "Unable to load role summary.");
          }
        }
        persistStoredUser(nextUserSnapshot);
      } catch {
        setError("Unable to load profile.");
      }
    };
    load();
  }, [clearSessionAndRedirect, navigate]);

  useEffect(() => {
    if (!isCustomerProfile || !profile) {
      setCustomerOrders([]);
      setCustomerOrdersError("");
      return;
    }

    if (!hasActiveSession()) {
      clearSessionAndRedirect("/login");
      return;
    }

    let cancelled = false;
    const loadCustomerOrders = async () => {
      try {
        const { response, data } = await apiFetchJson(`${API_URL}/api/orders/my`);
        if (cancelled) return;
        if (response.status === 401) {
          clearSessionAndRedirect("/login");
          return;
        }
        if (!response.ok) {
          setCustomerOrders([]);
          setCustomerOrdersError(data.message || "Unable to load orders.");
          return;
        }
        setCustomerOrders(Array.isArray(data) ? data : []);
        setCustomerOrdersError("");
      } catch {
        if (!cancelled) {
          setCustomerOrders([]);
          setCustomerOrdersError("Unable to load orders.");
        }
      }
    };

    loadCustomerOrders();
    return () => {
      cancelled = true;
    };
  }, [clearSessionAndRedirect, isCustomerProfile, profile]);

  useEffect(() => {
    if (!isCustomerProfile) return undefined;

    const syncWishlist = () => setWishlistItems(getWishlist());
    syncWishlist();
    window.addEventListener("wishlist:updated", syncWishlist);
    window.addEventListener("storage", syncWishlist);
    return () => {
      window.removeEventListener("wishlist:updated", syncWishlist);
      window.removeEventListener("storage", syncWishlist);
    };
  }, [isCustomerProfile]);

  useEffect(() => {
    if (!profileImageModalOpen) return undefined;
    const onEscape = (event) => {
      if (event.key === "Escape") {
        setProfileImageModalOpen(false);
      }
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [profileImageModalOpen]);

  const customerShippingAddressLabel = formatAccountAddress(profile?.shippingAddress);
  const customerBillingAddressLabel = profile?.billingSameAsShipping
    ? customerShippingAddressLabel === "Not set"
      ? "Not set"
      : "Same as shipping"
    : formatAccountAddress(profile?.billingAddress);
  const customerGenderLabel = profile?.gender
    ? profile.gender === "prefer_not"
      ? "Prefer not to say"
      : profile.gender.replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase())
    : "Not set";
  const customerSavedAddresses = Array.isArray(profile?.savedAddresses) ? profile.savedAddresses : [];
  const customerProfileRows = [
    { label: "Full Name", value: profile?.name || "Not set" },
    { label: "Email", value: profile?.email || "Not set" },
    { label: "Phone", value: profile?.phone || "Not set" },
    { label: "Gender", value: customerGenderLabel },
    { label: "Date of Birth", value: formatFullDate(profile?.dateOfBirth) },
    { label: "Shipping Address", value: customerShippingAddressLabel },
    { label: "Billing Address", value: customerBillingAddressLabel },
    { label: "Password", value: <span className="profile-password-mask">••••••••</span> },
  ];
  const customerActiveOrders = customerOrders.filter((order) =>
    ACTIVE_ORDER_STATUSES.has(String(order?.status || "").trim())
  ).length;
  const customerDeliveredOrders = customerOrders.filter(
    (order) => String(order?.status || "").trim() === "delivered"
  ).length;
  const customerOverviewCards = [
    { label: "Total orders", value: String(customerOrders.length) },
    { label: "Active orders", value: String(customerActiveOrders) },
    { label: "Delivered", value: String(customerDeliveredOrders) },
    { label: "Wishlist items", value: String(wishlistItems.length) },
  ];
  const customerRecentOrders = customerOrders.slice(0, 4);

  const removeWishlistItem = (item) => {
    setWishlistItems(toggleWishlist(item));
    setNotice("Wishlist updated.");
  };

  const addWishlistItemToCart = (item) => {
    addToCart({
      id: item?.id || item?._id,
      name: item?.name,
      price: item?.price,
      mrp: item?.mrp,
      image: getProductImage(item),
      category: item?.category || item?.tag,
      tag: item?.tag,
      deliveryMinDays: item?.deliveryMinDays,
      deliveryMaxDays: item?.deliveryMaxDays,
      seller: item?.seller,
    });
    setNotice("Added to cart.");
  };

  const openProfileImageModal = () => {
    setProfileImageDraft(profile?.profileImage || "");
    setProfileImageDraftName("");
    setError("");
    setNotice("");
    setProfileImageModalOpen(true);
  };

  const closeProfileImageModal = () => {
    setProfileImageModalOpen(false);
    setProfileImageDraftName("");
    if (profileImageInputRef.current) {
      profileImageInputRef.current.value = "";
    }
  };

  const openProfileImagePicker = () => {
    profileImageInputRef.current?.click();
  };

  const handleProfileImageUpload = async (event) => {
    const inputElement = event.target;
    const file = inputElement.files?.[0];
    if (!file) return;

    if (!String(file.type || "").startsWith("image/")) {
      setError("Please choose an image file.");
      inputElement.value = "";
      return;
    }

    setError("");
    try {
      const uploadedImage = await optimizeImageFile(file, {
        maxWidth: 1280,
        maxHeight: 1280,
        quality: 0.8,
        uploadFolder: "profiles",
        uploadPrefix: "avatar",
      });
      setProfileImageDraft(uploadedImage);
      setProfileImageDraftName(file.name);
    } catch (uploadError) {
      setError(uploadError?.message || "Unable to process selected image.");
    } finally {
      inputElement.value = "";
    }
  };

  const removeProfileImageDraft = () => {
    setProfileImageDraft("");
    setProfileImageDraftName("");
    if (profileImageInputRef.current) {
      profileImageInputRef.current.value = "";
    }
  };

  const updateProfileImage = async (
    imageValue = profileImageDraft,
    imageName = profileImageDraftName,
    closeAfterSave = true
  ) => {
    if (!hasActiveSession()) {
      clearSessionAndRedirect("/login");
      return;
    }

    setImageUpdating(true);
    setError("");
    setNotice("");
    try {
      const nextImageValue = typeof imageValue === "string" ? imageValue.trim() : "";

      const { response, data } = await apiFetchJson(`${API_URL}/api/users/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          profileImage: nextImageValue,
        }),
      });
      if (!response.ok) {
        if (response.status === 401) {
          clearSessionAndRedirect("/login");
          return;
        }
        const message = data?.message || "Unable to update profile image.";
        setError(`${message} (HTTP ${response.status})`);
        return;
      }

      const existingUser = readStoredUser() || {};
      const serverProfileImage = typeof data?.profileImage === "string" ? data.profileImage : "";
      const finalProfile = {
        ...(profile || {}),
        ...(data && typeof data === "object" ? data : {}),
        profileImage: serverProfileImage || nextImageValue,
      };
      setProfile(finalProfile);
      persistStoredUser({
        ...existingUser,
        id: finalProfile.id,
        name: finalProfile.name,
        email: finalProfile.email,
        role: finalProfile.role,
        sellerStatus: finalProfile.sellerStatus,
        storeName: finalProfile.storeName,
        phone: finalProfile.phone,
        supportEmail: finalProfile.supportEmail,
        profileImage: finalProfile.profileImage,
      });
      if (imageName) {
        setProfileImageDraftName(imageName);
      }
      setNotice("Profile picture updated.");
      if (closeAfterSave) {
        closeProfileImageModal();
      }
    } catch (updateError) {
      const detail =
        typeof updateError?.message === "string" && updateError.message.trim()
          ? ` ${updateError.message}`
          : "";
      setError(`Unable to update profile image.${detail}`);
    } finally {
      setImageUpdating(false);
    }
  };

  const renderCustomerContent = () => {
    if (selectedCustomerTab === "addresses") {
      return (
        <>
          <div className="profile-card profile-account-panel">
            <div className="profile-section-header profile-account-head">
              <h3>Addresses</h3>
              <Link className="btn ghost profile-inline-action" to="/profile-info?edit=1#saved-addresses">
                Edit
              </Link>
            </div>
            <div className="account-address-grid">
              <div className="account-address-card">
                <p className="profile-menu-title">Shipping</p>
                <p className="account-address-text">{customerShippingAddressLabel}</p>
              </div>
              <div className="account-address-card">
                <p className="profile-menu-title">Billing</p>
                <p className="account-address-text">{customerBillingAddressLabel}</p>
              </div>
            </div>
          </div>

          <div className="profile-card profile-account-panel">
            <div className="profile-section-header profile-account-head">
              <h3>Saved Addresses</h3>
              <span className="chip account-meta-pill">{customerSavedAddresses.length} saved</span>
            </div>
            {customerSavedAddresses.length === 0 ? (
              <p className="field-hint">No saved addresses yet.</p>
            ) : (
              <div className="account-address-list">
                {customerSavedAddresses.map((entry, index) => (
                  <div
                    key={entry.id || entry._id || `saved-address-${index}`}
                    className="account-address-card account-address-card-saved"
                  >
                    <p className="account-address-label">{entry.label || `Address ${index + 1}`}</p>
                    <p className="account-address-text">{formatAccountAddress(entry)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      );
    }

    if (selectedCustomerTab === "orders") {
      return (
        <div className="profile-card profile-account-panel">
          <div className="profile-section-header profile-account-head">
            <h3>Orders</h3>
            <Link className="btn ghost profile-inline-action" to="/orders">
              Full Page
            </Link>
          </div>
          {customerOrdersError && <p className="field-hint">{customerOrdersError}</p>}
          {!customerOrdersError && customerOrders.length === 0 && (
            <p className="field-hint">No orders yet.</p>
          )}
          {!customerOrdersError && customerOrders.length > 0 && (
            <div className="account-order-list">
              {customerOrders.map((order) => {
                const orderId = String(order?._id || "").trim();
                const quantity = Math.max(1, Number(order?.quantity || 1));
                const paymentStatus = String(order?.paymentStatus || "").trim();
                const productName = order?.product?.name || "Gift order";

                return (
                  <article key={orderId || productName} className="account-order-card">
                    <div className="account-order-top">
                      <div>
                        <p className="account-order-code">
                          {orderId ? `#${orderId.slice(-8).toUpperCase()}` : "#ORDER"}
                        </p>
                        <h4>{productName}</h4>
                      </div>
                      <span className="chip account-order-status">
                        {formatAccountStatus(order?.status)}
                      </span>
                    </div>
                    <div className="account-order-meta">
                      <span>{formatFullDate(order?.createdAt)}</span>
                      <span>{quantity} item{quantity === 1 ? "" : "s"}</span>
                      <span>{paymentStatus ? `Payment: ${formatAccountStatus(paymentStatus)}` : "Payment pending"}</span>
                    </div>
                    <div className="account-order-bottom">
                      <div>
                        <p className="account-order-total-label">Total</p>
                        <strong className="account-order-total">{formatMoney(order?.total)}</strong>
                      </div>
                      <Link className="btn ghost profile-inline-action" to="/orders">
                        View Details
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    if (selectedCustomerTab === "wishlist") {
      return (
        <div className="profile-card profile-account-panel">
          <div className="profile-section-header profile-account-head">
            <h3>Wishlist</h3>
            <Link className="btn ghost profile-inline-action" to="/products">
              Browse Products
            </Link>
          </div>
          {wishlistItems.length === 0 ? (
            <p className="field-hint">No wishlist items yet.</p>
          ) : (
            <div className="account-wishlist-list">
              {wishlistItems.map((item) => {
                const productId = String(item?.id || item?._id || "").trim();
                const productPath = productId ? `/products/${productId}` : "/products";

                return (
                  <article key={productId || item?.name} className="account-wishlist-card">
                    <Link className="account-wishlist-media" to={productPath}>
                      <img src={getProductImage(item)} alt={item?.name || "Wishlist item"} />
                    </Link>
                    <div className="account-wishlist-body">
                      <div className="account-wishlist-top">
                        <div>
                          <h4>{item?.name || "Saved item"}</h4>
                          <p className="account-wishlist-note">{item?.tag || "Saved item"}</p>
                        </div>
                        <strong className="account-wishlist-price">{formatMoney(item?.price)}</strong>
                      </div>
                      <div className="account-wishlist-actions">
                        <Link className="btn ghost profile-inline-action" to={productPath}>
                          View
                        </Link>
                        <button
                          className="btn ghost profile-inline-action"
                          type="button"
                          onClick={() => addWishlistItemToCart(item)}
                        >
                          Add to Cart
                        </button>
                        <button
                          className="btn ghost profile-inline-action account-remove-action"
                          type="button"
                          onClick={() => removeWishlistItem(item)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    return (
      <>
        <div className="profile-card profile-account-panel" id="profile-details">
          <div className="profile-section-header profile-account-head">
            <h3>Profile Information</h3>
            <Link className="btn ghost profile-inline-action" to="/profile-info?edit=1">
              Edit
            </Link>
          </div>
          <div className="classic-profile-list">
            {customerProfileRows.map((row) => (
              <div key={row.label} className="classic-profile-row">
                <p className="classic-profile-label">{row.label}</p>
                <p className="classic-profile-value">{row.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="profile-card profile-account-panel">
          <div className="profile-section-header profile-account-head">
            <h3>Overview</h3>
          </div>
          <div className="stat-grid">
            {customerOverviewCards.map((card) => (
              <div key={card.label} className="stat-card">
                <p className="stat-label">{card.label}</p>
                <p className="stat-value">{card.value}</p>
              </div>
            ))}
          </div>
          {customerOrdersError && <p className="field-hint">{customerOrdersError}</p>}
          {!customerOrdersError && customerRecentOrders.length > 0 && (
            <div className="profile-role-table account-compact-table">
              <p className="profile-menu-title">Recent Orders</p>
              {customerRecentOrders.map((order) => {
                const orderId = String(order?._id || "").trim();
                return (
                  <div key={orderId || `${order?.createdAt}-${order?.total}`} className="profile-role-row">
                    <span className="profile-role-key">
                      {orderId ? `#${orderId.slice(-8).toUpperCase()}` : "Order"}
                    </span>
                    <span className="profile-role-value">
                      {formatAccountStatus(order?.status)} • {formatMoney(order?.total)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </>
    );
  };

  const logout = async () => {
    await logoutSession();
    navigate("/");
  };

  return (
    <div className={pageClassName}>
      <Header variant={headerVariant} />
      {isCustomerProfile && (
        <div className="profile-topbar">
          <div className="profile-topbar-brand">
            <img className="brand-logo-head" src={logoPng} alt="CraftzyGifts" />
            <div className="profile-topbar-copy">
              <span className="brand-head-text">CraftzyGifts</span>
              <span className="profile-topbar-sub">My Profile</span>
            </div>
          </div>
          <Link className="profile-topbar-settings" to="/settings" aria-label="Settings">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="3.2" />
              <path d="M19.5 13.3v-2.6l-1.9-.5a5.9 5.9 0 0 0-.5-1.3l1-1.7-1.8-1.8-1.7 1a5.9 5.9 0 0 0-1.3-.5l-.5-1.9h-2.6l-.5 1.9a5.9 5.9 0 0 0-1.3.5l-1.7-1-1.8 1.8 1 1.7a5.9 5.9 0 0 0-.5 1.3l-1.9.5v2.6l1.9.5a5.9 5.9 0 0 0 .5 1.3l-1 1.7 1.8 1.8 1.7-1a5.9 5.9 0 0 0 1.3.5l.5 1.9h2.6l.5-1.9a5.9 5.9 0 0 0 1.3-.5l1.7 1 1.8-1.8-1-1.7a5.9 5.9 0 0 0 .5-1.3z" />
            </svg>
          </Link>
        </div>
      )}
      <div className="section-head">
        <div>
          <h2>{isSellerProfileViewOnly ? "Seller Profile" : "My Account"}</h2>
        </div>
        {!isCustomerProfile && (
          <Link className="link" to={ordersPath}>
            View orders
          </Link>
        )}
      </div>

      {!profile && !error && <p className="field-hint">Loading profile...</p>}
      {error && <p className="field-hint">{error}</p>}

      {profile && (
        <div className="profile-layout">
          <aside className="profile-sidebar">
            <div className={`profile-card${isCustomerProfile ? " profile-hero-card" : ""}`}>
              {isCustomerProfile ? (
                <div className="customer-profile-hero">
                  <div className="profile-avatar">
                    {showSidebarAvatarImage ? (
                      <img src={profile.profileImage} alt={profile.name || "Profile"} />
                    ) : (
                      sidebarAvatarInitial
                    )}
                    <button
                      className="customer-avatar-edit-btn"
                      type="button"
                      onClick={openProfileImageModal}
                      aria-haspopup="dialog"
                      aria-expanded={profileImageModalOpen}
                      aria-label="Edit profile picture"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <rect
                          x="3.5"
                          y="6.5"
                          width="17"
                          height="13"
                          rx="2.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                        />
                        <path
                          d="M8 6.5l1.6-2h4.8l1.6 2"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <circle
                          cx="12"
                          cy="13"
                          r="3.2"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                        />
                      </svg>
                    </button>
                  </div>
                  <div className="customer-profile-copy">
                    <p className="profile-name">{profile.name}</p>
                    <p className="profile-role-meta">{profile.email}</p>
                    <Link className="btn primary profile-edit-btn" to="/profile-info?edit=1">
                      Edit Profile
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  <div className="profile-hello">
                    {role !== "seller" && (
                      <div className="profile-avatar">
                        {showSidebarAvatarImage ? (
                          <img src={profile.profileImage} alt={profile.name || "Profile"} />
                        ) : (
                          sidebarAvatarInitial
                        )}
                      </div>
                    )}
                    <div>
                      <p className="muted">{roleLabel} account</p>
                      <p className="profile-name">{profile.name}</p>
                      <p className="profile-role-meta">{profile.email}</p>
                    </div>
                  </div>
                  <div className="profile-role-badges">
                    <span className="chip">{roleLabel}</span>
                    {role === "seller" && (
                      <span className="chip">Status: {profile.sellerStatus || "pending"}</span>
                    )}
                  </div>
                </>
              )}
            </div>

            {sidebarSections.map((section) => (
              <div key={section.title} className="profile-card">
                <div className="profile-menu">
                  <p className="profile-menu-title">{section.title}</p>
                  {section.items.map((item) => {
                    const visibilityClass = item.mobileOnly
                      ? "mobile-only"
                      : item.desktopOnly
                        ? "desktop-only"
                        : "";
                    const isActiveCustomerItem = isCustomerProfile && item.tab === selectedCustomerTab;
                    const targetPath = item.tab ? buildCustomerTabPath(item.tab) : item.path;
                    const isActivePathItem =
                      !item.tab && targetPath
                        ? isWorkspacePathActive(location, { ...item, path: targetPath })
                        : false;
                    if (targetPath) {
                      return (
                        <Link
                          key={item.key || item.label}
                          className={`profile-link ${visibilityClass} ${
                            isActiveCustomerItem || isActivePathItem ? "active" : ""
                          }`.trim()}
                          to={targetPath}
                        >
                          <span className="profile-link-icon" aria-hidden="true">
                            <ProfileMenuIcon name={item.label} />
                          </span>
                          <span className="profile-link-text">{item.label}</span>
                        </Link>
                      );
                    }
                    return (
                      <span
                        key={item.key || item.label}
                        className={`profile-link ${visibilityClass} ${item.active ? "active" : ""} ${
                          item.muted ? "muted" : ""
                        }`.trim()}
                      >
                        <span className="profile-link-icon" aria-hidden="true">
                          <ProfileMenuIcon name={item.label} />
                        </span>
                        <span className="profile-link-text">{item.label}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}

            <button className="profile-logout" type="button" onClick={logout}>
              <span className="profile-link-icon" aria-hidden="true">
                <ProfileMenuIcon name="Logout" />
              </span>
              <span className="profile-link-text">Logout</span>
            </button>
          </aside>

          <main className="profile-content">
            {isCustomerProfile ? (
              <>
                {notice && <p className="field-hint">{notice}</p>}
                {renderCustomerContent()}
              </>
            ) : (
              <>
                {isSellerProfileViewOnly && (
                  <div className="profile-card seller-profile-hero-card">
                    <div className="seller-profile-hero-main">
                      <div className="seller-profile-hero-avatar-wrap">
                        <div className="seller-profile-hero-avatar">
                          {profile.profileImage ? (
                            <img src={profile.profileImage} alt={sellerDisplayName} />
                          ) : (
                            <span>{sellerDisplayName.slice(0, 1).toUpperCase()}</span>
                          )}
                        </div>
                        <button
                          className="seller-profile-avatar-edit-btn"
                          type="button"
                          onClick={openProfileImageModal}
                          aria-haspopup="dialog"
                          aria-expanded={profileImageModalOpen}
                          aria-label="Edit profile picture"
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path
                              d="M4 16.5V20h3.5l9.6-9.6-3.5-3.5L4 16.5z"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.7"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M12.9 7.5l3.5 3.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.7"
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>
                      </div>
                      <div className="seller-profile-hero-copy">
                        <h3>{sellerDisplayName}</h3>
                        <p>Joined: {sellerJoinedLabel}</p>
                        <p>Location: {sellerLocationLabel}</p>
                        <p className="seller-profile-hero-rating">
                          Seller status: {profile.sellerStatus || "pending"}
                        </p>
                      </div>
                    </div>
                    <div className="seller-profile-hero-actions">
                      <Link className="btn ghost" to="/seller/settings">
                        Edit Store
                      </Link>
                    </div>
                  </div>
                )}

                <div className="profile-card" id="profile-details">
                  <div className="profile-section-header">
                    <h3>Profile Details</h3>
                  </div>
                  {notice && <p className="field-hint">{notice}</p>}
                  <div className="classic-profile-list">
                    <div className="classic-profile-row">
                      <p className="classic-profile-label">Owner Name</p>
                      <p className="classic-profile-value">{profile.name || "Not set"}</p>
                    </div>
                    <div className="classic-profile-row">
                      <p className="classic-profile-label">Email</p>
                      <p className="classic-profile-value">{profile.email || "Not set"}</p>
                    </div>
                    <div className="classic-profile-row">
                      <p className="classic-profile-label">Phone</p>
                      <p className="classic-profile-value">{profile.phone || "Not set"}</p>
                    </div>
                    <div className="classic-profile-row">
                      <p className="classic-profile-label">Store Name</p>
                      <p className="classic-profile-value">{profile.storeName || "Not set"}</p>
                    </div>
                    <div className="classic-profile-row">
                      <p className="classic-profile-label">Support Email</p>
                      <p className="classic-profile-value">{profile.supportEmail || "Not set"}</p>
                    </div>
                    <div className="classic-profile-row">
                      <p className="classic-profile-label">Seller Status</p>
                      <p className="classic-profile-value">{profile.sellerStatus || "pending"}</p>
                    </div>
                    <div className="classic-profile-row">
                      <p className="classic-profile-label">About Store</p>
                      <p className="classic-profile-value">{profile.about || "Not added yet"}</p>
                    </div>
                    <div className="classic-profile-row">
                      <p className="classic-profile-label">Pickup Address</p>
                      <p className="classic-profile-value">{pickupAddressLabel || "Not set"}</p>
                    </div>
                    <div className="classic-profile-row">
                      <p className="classic-profile-label">Pickup Window</p>
                      <p className="classic-profile-value">
                        {profile.pickupAddress?.pickupWindow || "Not set"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="profile-card">
                  <div className="card-head">
                    <h3 className="card-title">{roleLabel} Overview</h3>
                  </div>
                  {overviewError && <p className="field-hint">{overviewError}</p>}
                  {!overviewError && overview.cards.length > 0 && (
                    <div className="stat-grid">
                      {overview.cards.map((card) => (
                        <div key={card.label} className="stat-card">
                          <p className="stat-label">{card.label}</p>
                          <p className="stat-value">{card.value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {!overviewError && overview.rows.length > 0 && (
                    <div className="profile-role-table">
                      <p className="profile-menu-title">{overview.rowsTitle}</p>
                      {overview.rows.map((row) => (
                        <div key={`${row.key}-${row.value}`} className="profile-role-row">
                          <span className="profile-role-key">{row.key}</span>
                          <span className="profile-role-value">{row.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </main>
        </div>
      )}

      {profileImageModalOpen && (
        <div
          className="profile-image-modal-backdrop"
          onClick={closeProfileImageModal}
          role="presentation"
        >
          <div
            className="profile-image-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profileImageModalTitle"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="profile-image-modal-head">
              <h4 id="profileImageModalTitle">Update Profile Picture</h4>
              <button
                className="profile-image-modal-close"
                type="button"
                onClick={closeProfileImageModal}
                aria-label="Close dialog"
              >
                ×
              </button>
            </div>
            <div className="profile-image-modal-body">
              <div className="profile-image-modal-preview">
                {profileImageDraft ? (
                  <img src={profileImageDraft} alt={sellerDisplayName} />
                ) : (
                  <span>{sellerDisplayName.slice(0, 1).toUpperCase()}</span>
                )}
              </div>
              <input
                ref={profileImageInputRef}
                className="profile-image-modal-input"
                type="file"
                accept="image/*"
                onChange={handleProfileImageUpload}
              />
              <div className="profile-image-modal-actions">
                <button className="btn ghost" type="button" onClick={openProfileImagePicker}>
                  Upload
                </button>
                <button
                  className="btn ghost"
                  type="button"
                  onClick={removeProfileImageDraft}
                  disabled={!profileImageDraft}
                >
                  Remove
                </button>
              </div>
              {profileImageDraftName && (
                <p className="field-hint">Selected: {profileImageDraftName}</p>
              )}
              {error && <p className="field-hint">{error}</p>}
              <p className="field-hint">Use JPG, PNG or WebP. Large images are auto-optimized before update.</p>
            </div>
            <div className="profile-image-modal-foot">
              <button className="btn ghost" type="button" onClick={closeProfileImageModal}>
                Cancel
              </button>
              <button
                className="btn primary"
                type="button"
                onClick={() => updateProfileImage()}
                disabled={imageUpdating}
              >
                {imageUpdating ? profileImageActionLoadingLabel : profileImageActionLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

