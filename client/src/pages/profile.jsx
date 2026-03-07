import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { getWishlist } from "../utils/wishlist";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const USER_PROFILE_IMAGE_KEY = "user_profile_image";

const ROLE_LABEL = {
  customer: "Buyer",
  seller: "Seller",
  admin: "Admin",
};

const ACTIVE_ORDER_STATUSES = new Set([
  "pending_payment",
  "placed",
  "processing",
  "shipped",
  "return_requested",
  "refund_initiated",
]);

const formatMoney = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const formatJoinedDate = (value) => {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
};

const loadImageFromSource = (source) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image load failed"));
    image.src = source;
  });

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });

const optimizeProfileImage = async (file) => {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageFromSource(objectUrl);
    const sourceWidth = image.naturalWidth || image.width || 1;
    const sourceHeight = image.naturalHeight || image.height || 1;
    const maxBytes = 360 * 1024;
    const dimensions = [1280, 1024, 800, 640];
    const qualities = [0.88, 0.8, 0.72, 0.64, 0.56];
    let bestDataUrl = "";
    let bestBytes = Number.POSITIVE_INFINITY;

    for (const maxDimension of dimensions) {
      const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.drawImage(image, 0, 0, width, height);

      for (const quality of qualities) {
        const candidate = canvas.toDataURL("image/jpeg", quality);
        const candidateBytes = dataUrlByteLength(candidate);
        if (candidateBytes < bestBytes) {
          bestBytes = candidateBytes;
          bestDataUrl = candidate;
        }
        if (candidateBytes <= maxBytes) {
          return candidate;
        }
      }
    }

    if (bestDataUrl) return bestDataUrl;
    return await readFileAsDataUrl(file);
  } catch {
    return await readFileAsDataUrl(file);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const optimizeDataUrlForUpload = async (dataUrl) => {
  try {
    const image = await loadImageFromSource(dataUrl);
    const sourceWidth = image.naturalWidth || image.width || 1;
    const sourceHeight = image.naturalHeight || image.height || 1;
    const maxBytes = 360 * 1024;
    const dimensions = [1280, 1024, 800, 640];
    const qualities = [0.88, 0.8, 0.72, 0.64, 0.56];
    let bestDataUrl = dataUrl;
    let bestBytes = dataUrlByteLength(dataUrl);

    for (const maxDimension of dimensions) {
      const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.drawImage(image, 0, 0, width, height);

      for (const quality of qualities) {
        const candidate = canvas.toDataURL("image/jpeg", quality);
        const candidateBytes = dataUrlByteLength(candidate);
        if (candidateBytes < bestBytes) {
          bestBytes = candidateBytes;
          bestDataUrl = candidate;
        }
        if (candidateBytes <= maxBytes) {
          return candidate;
        }
      }
    }

    return bestDataUrl;
  } catch {
    return dataUrl;
  }
};

const dataUrlByteLength = (dataUrl = "")  => {
  const parts = String(dataUrl || "").split(",");
  if (parts.length < 2) return 0;
  const base64 = parts[1];
  const padding = (base64.match(/=+$/) || [""])[0].length;
  return Math.floor((base64.length * 3) / 4) - padding;
};

const readApiPayload = async (response) => {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return await response.json();
  }

  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

const persistUserToStorage = (user) => {
  if (!user || typeof user !== "object") return;
  const profileImage = typeof user.profileImage === "string" ? user.profileImage : "";
  try {
    localStorage.setItem("user", JSON.stringify(user));
    if (profileImage) {
      localStorage.setItem(USER_PROFILE_IMAGE_KEY, profileImage);
    } else {
      localStorage.removeItem(USER_PROFILE_IMAGE_KEY);
    }
  } catch {
    try {
      const { profileImage: _profileImage, ...rest } = user;
      localStorage.setItem("user", JSON.stringify(rest));
      if (profileImage) {
        localStorage.setItem(USER_PROFILE_IMAGE_KEY, profileImage);
      } else {
        localStorage.removeItem(USER_PROFILE_IMAGE_KEY);
      }
    } catch {
      // Ignore storage quota errors to avoid crashes.
    }
  }
  window.dispatchEvent(new Event("user:updated"));
};

const buildSidebarSections = (role) => {
  if (role === "seller") {
    return [
      {
        title: "Seller Hub",
        items: [
          { label: "Dashboard", path: "/seller/dashboard" },
          { label: "Products", path: "/seller/products" },
          { label: "Custom Hamper Items", path: "/seller/listed-items" },
          { label: "Orders", path: "/seller/orders" },
          { label: "Payments", path: "/seller/payments" },
          { label: "Edit Store", path: "/seller/settings" },
        ],
      },
      {
        title: "Account",
        items: [{ label: "Profile Information", active: true }],
      },
    ];
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
        { label: "Orders", path: "/orders" },
        { label: "Wishlist", path: "/wishlist" },
        { label: "Cart", path: "/cart" },
      ],
    },
    {
      title: "Account",
      items: [
        { label: "Profile Information", active: true },
        { label: "Manage Addresses", path: "/checkout" },
      ],
    },
  ];
};

const fetchRoleOverview = async (role, token) => {
  const headers = { Authorization: `Bearer ${token}` };

  if (role === "seller") {
    const [productRes, orderRes] = await Promise.all([
      fetch(`${API_URL}/api/products/seller/me`, { headers }),
      fetch(`${API_URL}/api/orders/seller`, { headers }),
    ]);
    const [productsData, ordersData] = await Promise.all([
      productRes.json(),
      orderRes.json(),
    ]);

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
    const sellersRes = await fetch(`${API_URL}/api/admin/sellers`, { headers });
    const sellersData = await sellersRes.json();
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

  const ordersRes = await fetch(`${API_URL}/api/orders/my`, { headers });
  const ordersData = await ordersRes.json();
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
    rowsTitle: "Recent buyer orders",
    rows: orders.slice(0, 5).map((order) => ({
      key: order._id?.slice(-8)?.toUpperCase() || "Order",
      value: `${order.status} • ${formatMoney(order.total)}`,
    })),
  };
};

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", storeName: "" });
  const [overview, setOverview] = useState({ cards: [], rowsTitle: "", rows: [] });
  const [overviewError, setOverviewError] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [profileImageModalOpen, setProfileImageModalOpen] = useState(false);
  const [profileImageDraft, setProfileImageDraft] = useState("");
  const [profileImageDraftName, setProfileImageDraftName] = useState("");
  const [imageUpdating, setImageUpdating] = useState(false);
  const profileImageInputRef = useRef(null);
  const navigate = useNavigate();
  const role = profile?.role || "customer";
  const headerVariant =
    role === "seller" ? "seller" : role === "admin" ? "admin" : undefined;
  const roleLabel = ROLE_LABEL[role] || "Buyer";
  const sidebarSections = useMemo(() => buildSidebarSections(role), [role]);
  const isSellerProfileViewOnly = role === "seller";
  const ordersPath = role === "seller" ? "/seller/orders" : "/orders";
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
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem(USER_PROFILE_IMAGE_KEY);
    window.dispatchEvent(new Event("user:updated"));
    navigate(path);
  }, [navigate]);

  useEffect(() => {
    const load = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        clearSessionAndRedirect("/login");
        return;
      }

      try {
        const res = await fetch(`${API_URL}/api/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await readApiPayload(res);
        if (!res.ok) {
          if (res.status === 401) {
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
          persistUserToStorage(nextUserSnapshot);
          navigate("/admin/account", { replace: true });
          return;
        }
        if (data.role === "seller") {
          persistUserToStorage(nextUserSnapshot);
          const sellerProfileId = String(data.id || data._id || "").trim();
          if (sellerProfileId) {
            navigate(`/store/${sellerProfileId}`, { replace: true });
            return;
          }
        }
        setProfile(data);
        setForm({
          name: data.name || "",
          phone: data.phone || "",
          storeName: data.storeName || "",
        });
        setOverviewError("");
        try {
          const roleOverview = await fetchRoleOverview(data.role, token);
          setOverview(roleOverview);
        } catch (overviewLoadError) {
          setOverview({ cards: [], rowsTitle: "", rows: [] });
          setOverviewError(overviewLoadError.message || "Unable to load role summary.");
        }
        persistUserToStorage(nextUserSnapshot);
      } catch {
        setError("Unable to load profile.");
      }
    };
    load();
  }, [clearSessionAndRedirect, navigate]);

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

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
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
      const optimizedImage = await optimizeProfileImage(file);
      setProfileImageDraft(optimizedImage);
      setProfileImageDraftName(file.name);
    } catch {
      setError("Unable to process selected image.");
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
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    setImageUpdating(true);
    setError("");
    setNotice("");
    const previousProfileImage = String(profile?.profileImage || "");
    let optimisticApplied = false;
    try {
      let nextImageValue = typeof imageValue === "string" ? imageValue : "";
      if (nextImageValue.startsWith("data:image/")) {
        nextImageValue = await optimizeDataUrlForUpload(nextImageValue);
      }

      if (nextImageValue) {
        optimisticApplied = true;
        setProfile((prev) => ({
          ...(prev || {}),
          profileImage: nextImageValue,
        }));
      }

      const res = await fetch(`${API_URL}/api/users/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          profileImage: nextImageValue,
        }),
      });
      const data = await readApiPayload(res);
      if (!res.ok) {
        if (optimisticApplied) {
          setProfile((prev) => ({
            ...(prev || {}),
            profileImage: previousProfileImage,
          }));
        }
        if (res.status === 401) {
          clearSessionAndRedirect("/login");
          return;
        }
        const message = data?.message || "Unable to update profile image.";
        setError(`${message} (HTTP ${res.status})`);
        return;
      }

      let existingUser = {};
      try {
        existingUser = JSON.parse(localStorage.getItem("user") || "{}");
      } catch {
        existingUser = {};
      }
      const serverProfileImage = typeof data?.profileImage === "string" ? data.profileImage : "";
      const resolvedProfile = {
        ...(profile || {}),
        ...(data && typeof data === "object" ? data : {}),
        profileImage: serverProfileImage || (nextImageValue ? nextImageValue : ""),
      };
      setProfile(resolvedProfile);

      const rollbackToPreviousImage = () => {
        setProfile((prev) => ({
          ...(prev || {}),
          profileImage: previousProfileImage,
        }));
        persistUserToStorage({
          ...existingUser,
          profileImage: previousProfileImage,
        });
      };

      try {
        const verifyRes = await fetch(`${API_URL}/api/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (verifyRes.status === 401) {
          clearSessionAndRedirect("/login");
          return;
        }
        if (!verifyRes.ok) {
          rollbackToPreviousImage();
          setError("Unable to confirm profile image save. Please try again.");
          return;
        }
        const verifyData = await readApiPayload(verifyRes);
        const verifyProfileImage =
          typeof verifyData?.profileImage === "string" ? verifyData.profileImage : "";
        if (nextImageValue && !verifyProfileImage) {
          rollbackToPreviousImage();
          setError("Unable to persist profile image on server. Please try again.");
          return;
        }
        if (!nextImageValue && verifyProfileImage) {
          rollbackToPreviousImage();
          setError("Unable to remove profile image on server. Please try again.");
          return;
        }
        const finalProfile = {
          ...resolvedProfile,
          ...(verifyData && typeof verifyData === "object" ? verifyData : {}),
          profileImage: verifyProfileImage,
        };
        setProfile(finalProfile);
        persistUserToStorage({
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
      } catch {
        rollbackToPreviousImage();
        setError("Unable to confirm profile image save. Please try again.");
      }
    } catch (updateError) {
      if (optimisticApplied) {
        setProfile((prev) => ({
          ...(prev || {}),
          profileImage: previousProfileImage,
        }));
      }
      const detail =
        typeof updateError?.message === "string" && updateError.message.trim()
          ? ` ${updateError.message}`
          : "";
      setError(`Unable to update profile image.${detail}`);
    } finally {
      setImageUpdating(false);
    }
  };

  const saveProfile = async () => {
    setNotice("");
    setError("");
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/users/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          storeName: form.storeName,
        }),
      });
      const data = await readApiPayload(res);
      if (!res.ok) {
        if (res.status === 401) {
          clearSessionAndRedirect("/login");
          return;
        }
        setError(data.message || "Unable to save profile.");
        return;
      }
      setProfile(data);
      setForm({
        name: data.name || "",
        phone: data.phone || "",
        storeName: data.storeName || "",
      });
      persistUserToStorage({
        id: data.id,
        name: data.name,
        email: data.email,
        role: data.role,
        sellerStatus: data.sellerStatus,
        storeName: data.storeName,
        phone: data.phone,
        profileImage: data.profileImage,
      });
      setNotice("Profile updated.");
    } catch {
      setError("Unable to save profile.");
    } finally {
      setSaving(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem(USER_PROFILE_IMAGE_KEY);
    window.dispatchEvent(new Event("user:updated"));
    navigate("/");
  };

  return (
    <div className="page profile-page">
      <Header variant={headerVariant} />
      <div className="section-head">
        <div>
          <h2>{isSellerProfileViewOnly ? "Seller Profile" : "My Account"}</h2>
          <p>
            {isSellerProfileViewOnly
              ? "View your seller details here. Use Store Settings to edit profile and pickup info."
              : "Manage your personal information and saved settings."}
          </p>
        </div>
        <Link className="link" to={ordersPath}>
          View orders
        </Link>
      </div>

      {!profile && !error && <p className="field-hint">Loading profile...</p>}
      {error && <p className="field-hint">{error}</p>}

      {profile && (
        <div className="profile-layout">
          <aside className="profile-sidebar">
            <div className="profile-card">
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
            </div>

            {sidebarSections.map((section) => (
              <div key={section.title} className="profile-card">
                <div className="profile-menu">
                  <p className="profile-menu-title">{section.title}</p>
                  {section.items.map((item) => {
                    if (item.path) {
                      return (
                        <Link key={item.label} className="profile-link" to={item.path}>
                          {item.label}
                        </Link>
                      );
                    }
                    return (
                      <span
                        key={item.label}
                        className={`profile-link ${item.active ? "active" : ""} ${
                          item.muted ? "muted" : ""
                        }`}
                      >
                        {item.label}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}

            <button className="profile-logout" type="button" onClick={logout}>
              Logout
            </button>
          </aside>

          <main className="profile-content">
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

            <div className="profile-card">
              <div className="profile-section-header">
                <h3>{isSellerProfileViewOnly ? "Profile Details" : "Personal Information"}</h3>
              </div>
              {notice && <p className="field-hint">{notice}</p>}
              {isSellerProfileViewOnly ? (
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
              ) : (
                <>
                  <div className="profile-grid">
                    <div className="field">
                      <label>Full name</label>
                      <input name="name" value={form.name} onChange={handleChange} />
                    </div>
                    <div className="field">
                      <label>Email</label>
                      <input value={profile.email} disabled />
                    </div>
                  </div>
                  <div className="profile-grid">
                    <div className="field">
                      <label>Mobile number</label>
                      <input
                        name="phone"
                        value={form.phone}
                        onChange={handleChange}
                      />
                    </div>
                  </div>
                  {profile.role === "seller" && (
                    <div className="field">
                      <label>Store name</label>
                      <input
                        name="storeName"
                        value={form.storeName}
                        onChange={handleChange}
                      />
                      <p className="field-hint">
                        Seller status: {profile.sellerStatus}
                      </p>
                    </div>
                  )}
                  <div className="hero-actions">
                    <button
                      className="btn primary"
                      type="button"
                      onClick={saveProfile}
                      disabled={saving}
                    >
                      {saving ? "Saving..." : "Save changes"}
                    </button>
                  </div>
                </>
              )}
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
                {imageUpdating ? "Updating..." : "Update"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
