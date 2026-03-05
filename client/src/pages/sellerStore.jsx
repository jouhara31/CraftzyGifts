import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import Header from "../components/Header";
import { getProductImage } from "../utils/productMedia";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const USER_PROFILE_IMAGE_KEY = "user_profile_image";
const STORE_TABS = ["Seller Products", "Feedbacks", "Policy", "Description", "Extra Info"];

const formatPrice = (value) => Number(value || 0).toLocaleString("en-IN");

const formatDate = (value) => {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const readStoredUser = () => {
  try {
    const data = JSON.parse(localStorage.getItem("user") || "{}");
    return data && typeof data === "object" ? data : {};
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

const persistStoredUser = (nextUser) => {
  const safeUser = nextUser && typeof nextUser === "object" ? nextUser : {};
  localStorage.setItem("user", JSON.stringify(safeUser));
  if (typeof safeUser.profileImage === "string" && safeUser.profileImage) {
    localStorage.setItem(USER_PROFILE_IMAGE_KEY, safeUser.profileImage);
  } else {
    localStorage.removeItem(USER_PROFILE_IMAGE_KEY);
  }
  window.dispatchEvent(new Event("user:updated"));
};

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });

const toPhoneHref = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `tel:+91${digits}`;
  return `tel:+${digits}`;
};

const getLocationText = (pickupAddress = {}) =>
  [pickupAddress?.city, pickupAddress?.state, pickupAddress?.pincode]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(", ");

const getPickupAddressText = (pickupAddress = {}) =>
  [pickupAddress?.line1, pickupAddress?.city, pickupAddress?.state, pickupAddress?.pincode]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(", ");

const mapSortableProducts = (items = []) =>
  items.map((item) => {
    const createdAt = new Date(item?.createdAt || 0).getTime();
    return {
      ...item,
      _sortCreatedAt: Number.isNaN(createdAt) ? 0 : createdAt,
      _sortPrice: Number(item?.price || 0),
      _sortStock: Number(item?.stock || 0),
      _sortName: String(item?.name || "").toLowerCase(),
    };
  });

const resolveImageSource = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text) || /^data:image\//i.test(text)) return text;
  return `${API_URL}/${text.replace(/^\/+/, "")}`;
};

const buildDraftFromSeller = (seller = {}) => ({
  storeName: String(seller?.storeName || seller?.name || "").trim(),
  about: String(seller?.about || "").trim(),
  supportEmail: String(seller?.supportEmail || "").trim(),
  phone: String(seller?.phone || "").trim(),
  profileImage: String(seller?.profileImage || "").trim(),
  storeCoverImage: String(seller?.storeCoverImage || "").trim(),
  pickupLine1: String(seller?.pickupAddress?.line1 || "").trim(),
  city: String(seller?.pickupAddress?.city || "").trim(),
  state: String(seller?.pickupAddress?.state || "").trim(),
  pincode: String(seller?.pickupAddress?.pincode || "").trim(),
  pickupWindow: String(seller?.pickupAddress?.pickupWindow || "10-6").trim() || "10-6",
});

export default function SellerStore() {
  const { sellerId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const coverInputRef = useRef(null);
  const avatarInputRef = useRef(null);
  const autoEditAppliedRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchText, setSearchText] = useState("");
  const [sortBy, setSortBy] = useState("latest");
  const [showCount, setShowCount] = useState(12);
  const [viewer, setViewer] = useState(readStoredUser);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editNotice, setEditNotice] = useState("");
  const [editError, setEditError] = useState("");
  const [draft, setDraft] = useState(buildDraftFromSeller({}));
  const [storeData, setStoreData] = useState({
    seller: null,
    products: [],
    stats: null,
  });

  useEffect(() => {
    let ignore = false;

    const loadViewer = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        setViewer(readStoredUser());
        return;
      }

      try {
        const res = await fetch(`${API_URL}/api/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok || ignore) return;
        setViewer(data);
        persistStoredUser({
          ...readStoredUser(),
          id: data.id,
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
      } catch {
        if (!ignore) setViewer(readStoredUser());
      }
    };

    loadViewer();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    const loadStore = async () => {
      setLoading(true);
      setError("");
      try {
        const token = localStorage.getItem("token");
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
        const res = await fetch(`${API_URL}/api/products/seller/${sellerId}/public?limit=60`, {
          headers,
        });
        if (!res.ok) {
          throw new Error(
            res.status === 404 ? "Seller store not found." : "Unable to load seller store."
          );
        }
        const data = await res.json();
        if (ignore) return;
        const seller = data?.seller || null;
        setStoreData({
          seller,
          products: Array.isArray(data?.products) ? data.products : [],
          stats: data?.stats || null,
        });
        setDraft(buildDraftFromSeller(seller || {}));
        setSearchText("");
        setSortBy("latest");
        setShowCount(12);
      } catch (loadErr) {
        if (ignore) return;
        setStoreData({ seller: null, products: [], stats: null });
        setError(loadErr?.message || "Unable to load seller store.");
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    if (sellerId) {
      loadStore();
    } else {
      setLoading(false);
      setError("Seller id is missing.");
    }

    return () => {
      ignore = true;
    };
  }, [sellerId]);

  const seller = storeData?.seller || {};
  const sellerDraftSeed = useMemo(() => buildDraftFromSeller(seller), [seller]);
  const products = useMemo(
    () => (Array.isArray(storeData?.products) ? storeData.products : []),
    [storeData?.products]
  );
  const viewerId = String(viewer?.id || viewer?._id || readUserIdFromToken()).trim();
  const isOwnerSeller =
    String(viewer?.role || "").toLowerCase() === "seller" &&
    viewerId &&
    String(sellerId || "").trim() === viewerId;
  const editRequested = searchParams.get("edit") === "1";

  useEffect(() => {
    if (!isOwnerSeller) {
      setEditMode(false);
      autoEditAppliedRef.current = false;
      return;
    }
    if (isOwnerSeller && editRequested && !autoEditAppliedRef.current) {
      setDraft(sellerDraftSeed);
      setEditMode(true);
      setEditError("");
      setEditNotice("");
      autoEditAppliedRef.current = true;
      return;
    }
    if (!editRequested) {
      autoEditAppliedRef.current = false;
    }
  }, [isOwnerSeller, editRequested, sellerDraftSeed]);

  const sellerName = String(seller?.storeName || seller?.name || "Seller Store").trim();
  const sellerOwnerName = String(seller?.name || seller?.storeName || "Seller").trim();
  const sellerAbout =
    String(seller?.about || "").trim() ||
    "Handmade gifting collections with curated items and custom options.";
  const sellerInitial = sellerOwnerName.charAt(0).toUpperCase() || "S";
  const sellerEmail = String(seller?.supportEmail || "").trim();
  const sellerPhone = String(seller?.phone || "").trim();
  const phoneHref = toPhoneHref(sellerPhone);
  const joinedText = formatDate(seller?.createdAt);
  const locationText = getLocationText(seller?.pickupAddress) || "Location not shared";
  const pickupAddressText =
    getPickupAddressText(seller?.pickupAddress) || "Pickup address will be shared by seller";
  const listedProducts = Number(storeData?.stats?.totalProducts || products.length || 0);
  const categoryCount = useMemo(
    () =>
      new Set(
        products
          .map((item) => String(item?.category || "").trim())
          .filter(Boolean)
      ).size,
    [products]
  );
  const inStockCount = useMemo(
    () => products.filter((item) => Number(item?.stock || 0) > 0).length,
    [products]
  );
  const avgPrice = useMemo(() => {
    if (products.length === 0) return 0;
    const total = products.reduce((sum, item) => sum + Number(item?.price || 0), 0);
    return Math.round(total / products.length);
  }, [products]);

  const profileImageRaw = editMode ? draft.profileImage : seller?.profileImage;
  const sellerProfileImage = resolveImageSource(profileImageRaw);
  const coverImageRaw = editMode ? draft.storeCoverImage : seller?.storeCoverImage;
  const coverImage = resolveImageSource(coverImageRaw) || (products[0] ? getProductImage(products[0]) : "");

  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();
    let nextItems = mapSortableProducts(products);

    if (normalizedSearch) {
      nextItems = nextItems.filter((item) => {
        const name = String(item?.name || "").toLowerCase();
        const category = String(item?.category || "").toLowerCase();
        return name.includes(normalizedSearch) || category.includes(normalizedSearch);
      });
    }

    nextItems.sort((left, right) => {
      if (sortBy === "price_low") return left._sortPrice - right._sortPrice;
      if (sortBy === "price_high") return right._sortPrice - left._sortPrice;
      if (sortBy === "stock") return right._sortStock - left._sortStock;
      if (sortBy === "name") return left._sortName.localeCompare(right._sortName);
      return right._sortCreatedAt - left._sortCreatedAt;
    });

    return nextItems;
  }, [products, searchText, sortBy]);

  const visibleProducts = filteredProducts.slice(0, showCount);
  const canShowMore = filteredProducts.length > showCount;

  const beginEditMode = () => {
    setDraft(buildDraftFromSeller(seller));
    setEditMode(true);
    setEditError("");
    setEditNotice("");
    autoEditAppliedRef.current = true;
  };

  const cancelEditMode = () => {
    setDraft(buildDraftFromSeller(seller));
    setEditMode(false);
    setEditError("");
  };

  const handleDraft = (field) => (event) => {
    setDraft((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleImagePick = async (event, field) => {
    const file = event?.target?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setEditError("Please select a valid image file.");
      return;
    }
    try {
      const dataUrl = await readAsDataUrl(file);
      setDraft((prev) => ({ ...prev, [field]: dataUrl }));
      setEditError("");
    } catch {
      setEditError("Unable to read selected image.");
    } finally {
      event.target.value = "";
    }
  };

  const saveStoreEdits = async () => {
    if (!isOwnerSeller) return;
    setEditError("");
    setEditNotice("");

    const storeName = String(draft.storeName || "").trim();
    if (!storeName) {
      setEditError("Store name is required.");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      setEditError("Login required to update store.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: storeName,
        storeName,
        about: String(draft.about || "").trim(),
        supportEmail: String(draft.supportEmail || "").trim(),
        phone: String(draft.phone || "").trim(),
        profileImage: String(draft.profileImage || "").trim(),
        storeCoverImage: String(draft.storeCoverImage || "").trim(),
        pickupAddress: {
          line1: String(draft.pickupLine1 || "").trim(),
          city: String(draft.city || "").trim(),
          state: String(draft.state || "").trim(),
          pincode: String(draft.pincode || "").trim(),
          pickupWindow: String(draft.pickupWindow || "10-6").trim() || "10-6",
        },
      };
      const submittedProfileImage = payload.profileImage;
      const submittedCoverImage = payload.storeCoverImage;

      const res = await fetch(`${API_URL}/api/users/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          setEditError("Session expired. Please login again.");
          return;
        }
        setEditError(data?.message || "Unable to save store changes.");
        return;
      }
      let refreshedSeller = {
        name: data.name,
        storeName: data.storeName,
        supportEmail: data.supportEmail,
        phone: data.phone,
        about: data.about,
        profileImage:
          submittedProfileImage || data.profileImage || String(seller?.profileImage || "").trim(),
        storeCoverImage:
          submittedCoverImage ||
          data.storeCoverImage ||
          String(seller?.storeCoverImage || "").trim(),
        pickupAddress: data.pickupAddress || {},
        createdAt: data.createdAt,
      };
      try {
        const refreshRes = await fetch(`${API_URL}/api/products/seller/${sellerId}/public?limit=60`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          if (refreshData?.seller) {
            refreshedSeller = {
              ...refreshData.seller,
              profileImage:
                submittedProfileImage ||
                refreshData?.seller?.profileImage ||
                data.profileImage ||
                "",
              storeCoverImage:
                submittedCoverImage ||
                refreshData?.seller?.storeCoverImage ||
                data.storeCoverImage ||
                "",
            };
          }
          setStoreData((prev) => ({
            ...prev,
            seller: refreshedSeller,
            products: Array.isArray(refreshData?.products) ? refreshData.products : prev.products,
            stats: refreshData?.stats || prev.stats,
          }));
        } else {
          setStoreData((prev) => ({
            ...prev,
            seller: {
              ...(prev?.seller || {}),
              ...refreshedSeller,
            },
          }));
        }
      } catch {
        setStoreData((prev) => ({
          ...prev,
          seller: {
            ...(prev?.seller || {}),
            ...refreshedSeller,
          },
        }));
      }
      setViewer((prev) => ({
        ...prev,
        ...data,
        profileImage:
          submittedProfileImage || data.profileImage || String(prev?.profileImage || "").trim(),
        storeCoverImage:
          submittedCoverImage ||
          data.storeCoverImage ||
          String(prev?.storeCoverImage || "").trim(),
      }));
      persistStoredUser({
        ...readStoredUser(),
        id: data.id,
        name: data.name,
        email: data.email,
        role: data.role,
        sellerStatus: data.sellerStatus,
        storeName: data.storeName,
        phone: data.phone,
        supportEmail: data.supportEmail,
        profileImage:
          submittedProfileImage || data.profileImage || String(seller?.profileImage || "").trim(),
        storeCoverImage:
          submittedCoverImage ||
          data.storeCoverImage ||
          String(seller?.storeCoverImage || "").trim(),
      });
      setDraft(buildDraftFromSeller(refreshedSeller));
      setEditMode(false);
      setEditNotice("Store profile updated successfully.");
      if (editRequested) {
        navigate(`/store/${sellerId}`, { replace: true });
      }
    } catch {
      setEditError("Unable to save store changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page seller-store-page">
      <Header />
      <div className="seller-store-shell">
        <div className="seller-store-headline">
          <div>
            <h2>{sellerName}</h2>
            <p>Storefront by seller with live products and profile details.</p>
          </div>
          <div className="seller-store-headline-actions">
            <Link className="btn ghost" to="/products">
              Back to products
            </Link>
            {isOwnerSeller && !editMode ? (
              <button className="btn primary" type="button" onClick={beginEditMode}>
                Edit store
              </button>
            ) : null}
            {isOwnerSeller && editMode ? (
              <>
                <button className="btn ghost" type="button" onClick={cancelEditMode} disabled={saving}>
                  Cancel
                </button>
                <button className="btn primary" type="button" onClick={saveStoreEdits} disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </button>
              </>
            ) : null}
          </div>
        </div>

        {editError ? <p className="field-hint">{editError}</p> : null}
        {editNotice ? <p className="field-hint">{editNotice}</p> : null}

        {loading && (
          <section className="seller-store-status">
            <p>Loading store...</p>
          </section>
        )}

        {!loading && error && (
          <section className="seller-store-status">
            <p>{error}</p>
          </section>
        )}

        {!loading && !error && (
          <>
            <section className="seller-store-overview">
              <article className="seller-store-main-card">
                <div className={`seller-store-cover ${isOwnerSeller && editMode ? "is-editable" : ""}`}>
                  {coverImage ? <img src={coverImage} alt={sellerName} /> : <div className="seller-store-cover-fallback" />}
                  {isOwnerSeller && editMode ? (
                    <>
                      <button
                        className="seller-store-image-edit-btn seller-store-cover-edit"
                        type="button"
                        onClick={() => coverInputRef.current?.click()}
                        aria-label="Edit store cover"
                      >
                        Edit cover
                      </button>
                      <input
                        ref={coverInputRef}
                        type="file"
                        accept="image/*"
                        className="seller-store-file-input"
                        onChange={(event) => handleImagePick(event, "storeCoverImage")}
                      />
                    </>
                  ) : null}
                </div>
                <div className="seller-store-main-body">
                  <div className="seller-store-brand-row">
                    <div className={`seller-store-avatar ${isOwnerSeller && editMode ? "is-editable" : ""}`} aria-hidden="true">
                      {sellerProfileImage ? <img src={sellerProfileImage} alt="" /> : sellerInitial}
                      {isOwnerSeller && editMode ? (
                        <>
                          <button
                            className="seller-store-image-edit-btn seller-store-avatar-edit"
                            type="button"
                            onClick={() => avatarInputRef.current?.click()}
                            aria-label="Edit store profile image"
                          >
                            Edit
                          </button>
                          <input
                            ref={avatarInputRef}
                            type="file"
                            accept="image/*"
                            className="seller-store-file-input"
                            onChange={(event) => handleImagePick(event, "profileImage")}
                          />
                        </>
                      ) : null}
                    </div>
                    {isOwnerSeller && editMode ? (
                      <div className="seller-store-brand-edit">
                        <input
                          type="text"
                          value={draft.storeName}
                          onChange={handleDraft("storeName")}
                          placeholder="Store name"
                        />
                        <textarea
                          value={draft.about}
                          onChange={handleDraft("about")}
                          placeholder="About your store"
                          rows={3}
                        />
                      </div>
                    ) : (
                      <div className="seller-store-brand-copy">
                        <h3>{sellerName}</h3>
                        <p>{sellerAbout}</p>
                      </div>
                    )}
                  </div>

                  <div className="seller-store-kpi-row">
                    <div className="seller-store-kpi">
                      <span>Location</span>
                      <strong>{locationText}</strong>
                    </div>
                    <div className="seller-store-kpi">
                      <span>Joined</span>
                      <strong>{joinedText}</strong>
                    </div>
                    <div className="seller-store-kpi">
                      <span>Total Product</span>
                      <strong>{listedProducts}</strong>
                    </div>
                    {sellerEmail ? (
                      <a className="seller-store-follow-btn" href={`mailto:${sellerEmail}`}>
                        Contact
                      </a>
                    ) : (
                      <span className="seller-store-follow-btn muted">Seller</span>
                    )}
                  </div>

                  {isOwnerSeller && editMode ? (
                    <div className="seller-store-inline-form">
                      <input
                        type="email"
                        value={draft.supportEmail}
                        onChange={handleDraft("supportEmail")}
                        placeholder="Support email"
                      />
                      <input
                        type="tel"
                        value={draft.phone}
                        onChange={handleDraft("phone")}
                        placeholder="Phone"
                      />
                      <input type="text" value={draft.city} onChange={handleDraft("city")} placeholder="City" />
                      <input type="text" value={draft.state} onChange={handleDraft("state")} placeholder="State" />
                      <input
                        type="text"
                        value={draft.pincode}
                        onChange={handleDraft("pincode")}
                        placeholder="Pincode"
                      />
                      <textarea
                        value={draft.pickupLine1}
                        onChange={handleDraft("pickupLine1")}
                        placeholder="Pickup address line"
                        rows={2}
                      />
                    </div>
                  ) : null}
                </div>
              </article>

              <aside className="seller-store-owner-card">
                <p className="seller-store-owner-title">{sellerOwnerName}</p>
                <div className="seller-store-owner-photo" aria-hidden="true">
                  {sellerProfileImage ? <img src={sellerProfileImage} alt="" /> : sellerInitial}
                </div>
                <p className="seller-store-owner-name">{sellerOwnerName}</p>
                <div className="seller-store-owner-contacts">
                  {sellerPhone ? <span>{sellerPhone}</span> : null}
                  {sellerEmail ? <span>{sellerEmail}</span> : null}
                </div>
                <div className="seller-store-owner-actions">
                  {phoneHref ? (
                    <a className="btn ghost" href={phoneHref}>
                      Call
                    </a>
                  ) : null}
                  {sellerEmail ? (
                    <a className="btn ghost" href={`mailto:${sellerEmail}`}>
                      Email
                    </a>
                  ) : null}
                </div>
              </aside>
            </section>

            <section className="seller-store-market">
              <div className="seller-store-market-head">
                <div className="seller-store-tabs" role="tablist" aria-label="Store sections">
                  {STORE_TABS.map((tab, index) => (
                    <button
                      key={tab}
                      className={`seller-store-tab ${index === 0 ? "active" : ""}`}
                      type="button"
                      disabled={index !== 0}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                <div className="seller-store-controls">
                  <div className="seller-store-search">
                    <input
                      type="search"
                      placeholder="Search products..."
                      value={searchText}
                      onChange={(event) => setSearchText(event.target.value)}
                    />
                  </div>
                  <select
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value)}
                    aria-label="Sort products"
                  >
                    <option value="latest">Sort by latest</option>
                    <option value="price_low">Price: Low to high</option>
                    <option value="price_high">Price: High to low</option>
                    <option value="stock">Stock: High to low</option>
                    <option value="name">Name: A to Z</option>
                  </select>
                  <select
                    value={showCount}
                    onChange={(event) => setShowCount(Number(event.target.value) || 12)}
                    aria-label="Show item count"
                  >
                    <option value={8}>Show 8</option>
                    <option value={12}>Show 12</option>
                    <option value={16}>Show 16</option>
                    <option value={24}>Show 24</option>
                  </select>
                </div>
              </div>

              {filteredProducts.length === 0 ? (
                <p className="field-hint">No products match this search.</p>
              ) : (
                <>
                  <div className="seller-store-grid">
                    {visibleProducts.map((item) => {
                      const livePrice = Number(item?.price || 0);
                      const mrp = Number(item?.mrp || 0);
                      const hasDiscount = mrp > livePrice;
                      const discountPercent = hasDiscount
                        ? Math.round(((mrp - livePrice) / mrp) * 100)
                        : 0;
                      const stock = Number(item?.stock || 0);

                      return (
                        <article key={item._id} className="seller-store-product">
                          <img src={getProductImage(item)} alt={item.name} loading="lazy" />
                          <div className="seller-store-product-body">
                            <h4>{item.name}</h4>
                            <p>{item.category || "Gift hamper"}</p>
                            <div className="seller-store-product-row">
                              <div className="seller-store-product-pricing">
                                <strong>₹{formatPrice(livePrice)}</strong>
                                {hasDiscount ? (
                                  <>
                                    <span className="seller-store-product-mrp">₹{formatPrice(mrp)}</span>
                                    <span className="seller-store-product-discount">-{discountPercent}%</span>
                                  </>
                                ) : null}
                              </div>
                            </div>
                            <div className="seller-store-product-foot">
                              <span className={`status-pill ${stock > 0 ? "available" : "locked"}`}>
                                {stock > 0 ? `${stock} in stock` : "Out of stock"}
                              </span>
                              <Link className="btn ghost seller-store-link" to={`/products/${item._id}`}>
                                View
                              </Link>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  {canShowMore && (
                    <div className="seller-store-more-row">
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() => setShowCount((prev) => prev + 8)}
                      >
                        Show more products
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>

            <section className="seller-store-insights">
              <article className="seller-store-insight-card">
                <h4>Store Insights</h4>
                <div className="seller-store-insight-grid">
                  <p>
                    <span>Products listed</span>
                    <strong>{listedProducts}</strong>
                  </p>
                  <p>
                    <span>Categories</span>
                    <strong>{categoryCount}</strong>
                  </p>
                  <p>
                    <span>In stock</span>
                    <strong>{inStockCount}</strong>
                  </p>
                  <p>
                    <span>Avg. price</span>
                    <strong>₹{formatPrice(avgPrice)}</strong>
                  </p>
                </div>
              </article>

              <article className="seller-store-insight-card">
                <h4>Store Information</h4>
                <div className="seller-store-info-list">
                  <p>
                    <span>Pickup address</span>
                    <strong>{pickupAddressText}</strong>
                  </p>
                  <p>
                    <span>Support email</span>
                    <strong>{sellerEmail || "Not shared"}</strong>
                  </p>
                  <p>
                    <span>Support phone</span>
                    <strong>{sellerPhone || "Not shared"}</strong>
                  </p>
                  <p>
                    <span>Seller joined</span>
                    <strong>{joinedText}</strong>
                  </p>
                </div>
              </article>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
