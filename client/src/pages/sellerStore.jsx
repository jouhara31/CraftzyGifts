import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import Header from "../components/Header";
import { getProductImage } from "../utils/productMedia";
import { prefetchProductDetail } from "../utils/productDetailCache";
import {
  clearSellerStoreCache,
  getCachedSellerStore,
  loadSellerStore,
} from "../utils/sellerStoreCache";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const USER_PROFILE_IMAGE_KEY = "user_profile_image";
const STORE_TABS = ["All Products", "Feedbacks", "Policy", "Description", "Extra Info"];
const EMPTY_RATING_BREAKDOWN = {};
const STORE_CORE_LOAD_OPTIONS = {
  limit: 60,
  includeProducts: true,
  includeFeedbacks: false,
  includeProductRatings: true,
};
const STORE_FEEDBACK_LOAD_OPTIONS = {
  includeProducts: false,
  includeFeedbacks: true,
  includeProductRatings: false,
  feedbackLimit: 8,
};

const formatPrice = (value) => Number(value || 0).toLocaleString("en-IN");
const toStarText = (value) => {
  const safe = Math.min(5, Math.max(0, Math.round(Number(value) || 0)));
  return "★".repeat(safe).padEnd(5, "☆");
};
const getRatingRows = (ratingBreakdown, totalFeedbacks = 0, verifiedFeedbacks = 0) => {
  const safeBreakdown =
    ratingBreakdown && typeof ratingBreakdown === "object"
      ? ratingBreakdown
      : EMPTY_RATING_BREAKDOWN;
  const rows = [5, 4, 3, 2, 1].map((star) => {
    const row = safeBreakdown?.[star] || safeBreakdown?.[String(star)] || {};
    const count = Number(typeof row === "number" ? row : row?.count || 0);
    const share = Number(typeof row === "number" ? 0 : row?.share || 0);
    return {
      star,
      count: Number.isFinite(count) ? Math.max(0, count) : 0,
      share,
    };
  });
  const countedTotal = rows.reduce((sum, row) => sum + row.count, 0);
  const denominator = Math.max(verifiedFeedbacks, totalFeedbacks, countedTotal);
  const ratingRows = rows.map((row) => {
    const normalizedShare =
      Number.isFinite(row.share) && row.share > 0
        ? row.share
        : denominator > 0
          ? (row.count / denominator) * 100
          : 0;
    return {
      ...row,
      share: Math.min(100, Math.max(0, normalizedShare)),
    };
  });
  return {
    ratingRows,
    totalRatingVotes: Math.max(verifiedFeedbacks, totalFeedbacks, countedTotal),
  };
};

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

const normalizeReviewImages = (value = []) =>
  Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((entry) => String(entry || "").trim())
        .filter(
          (entry) =>
            /^https?:\/\//i.test(entry) || /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(entry)
        )
    )
  ).slice(0, 4);

const moveFeedbackViewerIndex = (viewer, direction) => {
  if (!viewer || !Array.isArray(viewer.images) || viewer.images.length === 0) {
    return viewer;
  }
  const currentIndex = Math.min(
    Math.max(Number(viewer.index || 0), 0),
    viewer.images.length - 1
  );
  const nextIndex = Math.min(
    Math.max(currentIndex + direction, 0),
    viewer.images.length - 1
  );
  if (nextIndex === currentIndex) return viewer;
  return {
    ...viewer,
    index: nextIndex,
  };
};

const buildDraftFromSeller = (seller = {}) => ({
  storeName: String(seller?.storeName || seller?.name || "").trim(),
  ownerName: String(seller?.name || seller?.storeName || "").trim(),
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

const buildSellerContactForm = (viewer = {}) => ({
  name: String(viewer?.name || "").trim(),
  email: String(viewer?.email || "").trim(),
  message: "",
});

const resolveRequestedStoreTab = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return STORE_TABS[0];
  if (["feedback", "feedbacks", "review", "reviews"].includes(normalized)) {
    return STORE_TABS[1];
  }
  if (["policy", "policies"].includes(normalized)) {
    return STORE_TABS[2];
  }
  if (["description", "about"].includes(normalized)) {
    return STORE_TABS[3];
  }
  if (["extra", "extra-info", "extrainfo"].includes(normalized)) {
    return STORE_TABS[4];
  }
  return STORE_TABS[0];
};

const StoreActionIcon = ({ name }) => {
  if (name === "back") {
    return (
      <svg className="seller-store-action-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m10 6-6 6 6 6" />
        <path d="M5 12h15" />
      </svg>
    );
  }
  if (name === "edit") {
    return (
      <svg className="seller-store-action-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 16.5V20h3.5l9.6-9.6-3.5-3.5L4 16.5z" />
        <path d="M12.9 7.5l3.5 3.5" />
      </svg>
    );
  }
  if (name === "close") {
    return (
      <svg className="seller-store-action-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m6 6 12 12" />
        <path d="M18 6 6 18" />
      </svg>
    );
  }
  if (name === "save") {
    return (
      <svg className="seller-store-action-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 4h12l2 2v14H5z" />
        <path d="M8 4v5h7V4" />
        <path d="M8 14h8" />
      </svg>
    );
  }
  if (name === "call") {
    return (
      <svg className="seller-store-action-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7.8 3.8 5.6 6a2 2 0 0 0-.4 2.2A20.5 20.5 0 0 0 15.8 18.8a2 2 0 0 0 2.2-.4l2.2-2.2a2 2 0 0 0-.2-3l-2.4-1.8a2 2 0 0 0-2.5.1l-1.1.9a14.7 14.7 0 0 1-2.9-2.9l.9-1.1a2 2 0 0 0 .1-2.5L10.8 4a2 2 0 0 0-3-.2z" />
      </svg>
    );
  }
  if (name === "email") {
    return (
      <svg className="seller-store-action-icon" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
        <path d="m4.5 7 7.5 6 7.5-6" />
      </svg>
    );
  }
  if (name === "view") {
    return (
      <svg className="seller-store-action-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M2.5 12s3.6-6 9.5-6 9.5 6 9.5 6-3.6 6-9.5 6-9.5-6-9.5-6z" />
        <circle cx="12" cy="12" r="2.6" />
      </svg>
    );
  }
  if (name === "more") {
    return (
      <svg className="seller-store-action-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>
    );
  }
  return null;
};

export default function SellerStore() {
  const { sellerId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editRequested = searchParams.get("edit") === "1";
  const requestedTab = resolveRequestedStoreTab(searchParams.get("tab"));
  const coverInputRef = useRef(null);
  const avatarInputRef = useRef(null);
  const ratingPopoverRef = useRef(null);
  const feedbackListRef = useRef(null);
  const feedbackSwipeStartRef = useRef({ x: 0, y: 0 });
  const autoEditAppliedRef = useRef(false);
  const feedbackLoadAttemptedRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState(STORE_TABS[0]);
  const [searchText, setSearchText] = useState("");
  const [sortBy, setSortBy] = useState("latest");
  const [showCount, setShowCount] = useState(12);
  const [viewer, setViewer] = useState(readStoredUser);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editNotice, setEditNotice] = useState("");
  const [editError, setEditError] = useState("");
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [isRatingPopoverOpen, setIsRatingPopoverOpen] = useState(false);
  const [activeProductRatingId, setActiveProductRatingId] = useState("");
  const [activeFeedbackViewer, setActiveFeedbackViewer] = useState(null);
  const [contactForm, setContactForm] = useState(() =>
    buildSellerContactForm(readStoredUser())
  );
  const [contactOpen, setContactOpen] = useState(false);
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactError, setContactError] = useState("");
  const [contactNotice, setContactNotice] = useState("");
  const [draft, setDraft] = useState(buildDraftFromSeller({}));
  const [storeData, setStoreData] = useState({
    seller: null,
    products: [],
    feedbacks: [],
    stats: null,
  });

  useEffect(() => {
    let ignore = false;
    const storedViewer = readStoredUser();
    setViewer(storedViewer);

    const loadViewer = async () => {
      const token = localStorage.getItem("token");
      const storedViewerId = String(
        storedViewer?.id || storedViewer?._id || readUserIdFromToken()
      ).trim();
      const shouldRefreshViewer =
        Boolean(token) &&
        Boolean(storedViewerId) &&
        storedViewerId === String(sellerId || "").trim();

      if (!shouldRefreshViewer) {
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
  }, [sellerId]);

  useEffect(() => {
    let ignore = false;

    const loadStore = async () => {
      const token = localStorage.getItem("token");
      const cacheOptions = { ...STORE_CORE_LOAD_OPTIONS, token };
      const cached = getCachedSellerStore(sellerId, cacheOptions);
      if (cached) {
        const seller = cached?.seller || null;
        const feedbacks = Array.isArray(cached?.feedbacks) ? cached.feedbacks : [];
        feedbackLoadAttemptedRef.current = feedbacks.length > 0;
        setStoreData({
          seller,
          products: Array.isArray(cached?.products) ? cached.products : [],
          feedbacks,
          stats: cached?.stats || null,
        });
        setDraft(buildDraftFromSeller(seller || {}));
        setLoading(false);
      } else {
        setLoading(true);
      }
      setError("");
      setFeedbackLoading(false);
      feedbackLoadAttemptedRef.current = false;
      try {
        const data = await loadSellerStore(sellerId, cacheOptions);
        if (ignore) return;
        const seller = data?.seller || null;
        const feedbacks = Array.isArray(data?.feedbacks) ? data.feedbacks : [];
        feedbackLoadAttemptedRef.current = feedbacks.length > 0;
        setStoreData({
          seller,
          products: Array.isArray(data?.products) ? data.products : [],
          feedbacks,
          stats: data?.stats || null,
        });
        setDraft(buildDraftFromSeller(seller || {}));
        setSearchText("");
        setSortBy("latest");
        setShowCount(12);
      } catch (loadErr) {
        if (ignore) return;
        setStoreData({ seller: null, products: [], feedbacks: [], stats: null });
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

  const seller = useMemo(() => storeData?.seller || {}, [storeData?.seller]);
  const sellerDraftSeed = useMemo(() => buildDraftFromSeller(seller), [seller]);
  const products = useMemo(
    () => (Array.isArray(storeData?.products) ? storeData.products : []),
    [storeData?.products]
  );
  const feedbacks = useMemo(
    () => (Array.isArray(storeData?.feedbacks) ? storeData.feedbacks : []),
    [storeData?.feedbacks]
  );
  const viewerId = String(viewer?.id || viewer?._id || readUserIdFromToken()).trim();
  const isOwnerSeller =
    String(viewer?.role || "").toLowerCase() === "seller" &&
    viewerId &&
    String(sellerId || "").trim() === viewerId;

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

  useEffect(() => {
    setActiveTab(requestedTab);
  }, [requestedTab]);

  const sellerName = String(seller?.storeName || seller?.name || "Seller Store").trim();
  const sellerShopName = String(seller?.storeName || "").trim() || "Seller Store";
  const sellerOwnerName = String(seller?.name || seller?.storeName || "Seller").trim();
  const sellerAbout =
    String(seller?.about || "").trim() ||
    "Handmade gifting collections with curated items and custom options.";
  const sellerInitial = sellerOwnerName.charAt(0).toUpperCase() || "S";
  const sellerEmail = String(seller?.supportEmail || "").trim();
  const supportEmailConfigured = Boolean(sellerEmail);
  const joinedText = formatDate(seller?.createdAt);
  const locationText = getLocationText(seller?.pickupAddress) || "Location not shared";
  const pickupAddressText =
    getPickupAddressText(seller?.pickupAddress) || "Pickup address will be shared by seller";
  const sellerSupportChannelLabel = isOwnerSeller
    ? supportEmailConfigured
      ? "Inbox active"
      : "Inbox ready"
    : "Private seller inbox";
  const sellerSupportMessage = isOwnerSeller
    ? "Customer messages stay private and show up in your seller dashboard."
    : "Send a secure message and our team will contact you soon.";
  const listedProducts = Number(storeData?.stats?.totalProducts || products.length || 0);
  const totalFeedbacks = Number(storeData?.stats?.totalFeedbacks || feedbacks.length || 0);
  const avgRating = Number(storeData?.stats?.avgRating || 0);
  const displayRating = Number(storeData?.stats?.displayRating || avgRating || 0);
  const verifiedFeedbacks = Number(storeData?.stats?.verifiedFeedbacks || totalFeedbacks || 0);
  const ratingBreakdown =
    storeData?.stats?.ratingBreakdown && typeof storeData.stats.ratingBreakdown === "object"
      ? storeData.stats.ratingBreakdown
      : EMPTY_RATING_BREAKDOWN;
  const { ratingRows, totalRatingVotes } = useMemo(
    () => getRatingRows(ratingBreakdown, totalFeedbacks, verifiedFeedbacks),
    [ratingBreakdown, totalFeedbacks, verifiedFeedbacks]
  );
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
  const selectedTab = STORE_TABS.includes(activeTab) ? activeTab : STORE_TABS[0];
  const isProductsTab = selectedTab === STORE_TABS[0];
  const isFeedbackTab = selectedTab === STORE_TABS[1];
  const backCatalogPath = isOwnerSeller ? "/seller/products" : "/products";
  const backCatalogLabel = isOwnerSeller ? "Back to seller panel" : "Back to products";

  useEffect(() => {
    let ignore = false;

    if (!sellerId || !isFeedbackTab || feedbackLoadAttemptedRef.current || feedbacks.length > 0) {
      return () => {
        ignore = true;
      };
    }
    if (totalFeedbacks === 0) {
      return () => {
        ignore = true;
      };
    }

    feedbackLoadAttemptedRef.current = true;
    setFeedbackLoading(true);

    const loadStoreFeedbacks = async () => {
      try {
        const token = localStorage.getItem("token");
        const data = await loadSellerStore(sellerId, {
          ...STORE_FEEDBACK_LOAD_OPTIONS,
          token,
        });
        if (ignore) return;
        setStoreData((prev) => ({
          ...prev,
          feedbacks: Array.isArray(data?.feedbacks) ? data.feedbacks : prev.feedbacks,
          stats: data?.stats || prev.stats,
        }));
      } catch {
        if (ignore) return;
      } finally {
        if (!ignore) setFeedbackLoading(false);
      }
    };

    loadStoreFeedbacks();
    return () => {
      ignore = true;
    };
  }, [sellerId, isFeedbackTab, feedbacks.length, totalFeedbacks]);

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
    const ownerName = String(draft.ownerName || "").trim();
    if (!storeName) {
      setEditError("Store name is required.");
      return;
    }
    if (!ownerName) {
      setEditError("Owner name is required.");
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
        name: ownerName,
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
      clearSellerStoreCache(sellerId);
      setStoreData((prev) => ({
        ...prev,
        seller: {
          ...(prev?.seller || {}),
          ...refreshedSeller,
        },
      }));
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

  useEffect(() => {
    if (!isFeedbackTab) {
      setIsRatingPopoverOpen(false);
    }
  }, [isFeedbackTab]);

  useEffect(() => {
    if (!isProductsTab) {
      setActiveProductRatingId("");
    }
  }, [isProductsTab]);

  useEffect(() => {
    if (!isFeedbackTab) {
      setActiveFeedbackViewer(null);
    }
  }, [isFeedbackTab]);

  useEffect(() => {
    setContactForm((prev) => ({
      name: prev.name || String(viewer?.name || "").trim(),
      email: prev.email || String(viewer?.email || "").trim(),
      message: prev.message,
    }));
  }, [viewer?.name, viewer?.email]);

  useEffect(() => {
    if (!sellerId) return;
    setContactOpen(false);
    setContactError("");
    setContactNotice("");
    setContactForm((prev) => ({
      name: String(viewer?.name || prev.name || "").trim(),
      email: String(viewer?.email || prev.email || "").trim(),
      message: "",
    }));
  }, [sellerId, viewer?.name, viewer?.email]);

  useEffect(() => {
    if (!isRatingPopoverOpen) return;
    const handlePointerDown = (event) => {
      if (!ratingPopoverRef.current) return;
      if (event.target instanceof Node && !ratingPopoverRef.current.contains(event.target)) {
        setIsRatingPopoverOpen(false);
      }
    };
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsRatingPopoverOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isRatingPopoverOpen]);

  useEffect(() => {
    if (!activeProductRatingId) return;
    const handlePointerDown = (event) => {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-product-rating-anchor='true']")
      ) {
        return;
      }
      setActiveProductRatingId("");
    };
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setActiveProductRatingId("");
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [activeProductRatingId]);

  useEffect(() => {
    if (!activeFeedbackViewer) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setActiveFeedbackViewer(null);
        return;
      }
      if (event.key === "ArrowLeft") {
        setActiveFeedbackViewer((prev) => moveFeedbackViewerIndex(prev, -1));
        return;
      }
      if (event.key === "ArrowRight") {
        setActiveFeedbackViewer((prev) => moveFeedbackViewerIndex(prev, 1));
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeFeedbackViewer]);

  const handleSeeCustomerReviews = () => {
    setIsRatingPopoverOpen(false);
    feedbackListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const handleContactField = (field) => (event) => {
    setContactForm((prev) => ({
      ...prev,
      [field]: event.target.value,
    }));
  };
  const submitContactRequest = async (event) => {
    event.preventDefault();
    if (!sellerId || isOwnerSeller) return;

    setContactError("");
    setContactNotice("");
    setContactSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/users/sellers/${sellerId}/contact`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: contactForm.name,
          email: contactForm.email,
          message: contactForm.message,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setContactError(data?.message || "Unable to send your message right now.");
        return;
      }
      setContactNotice(data?.message || "Message sent to the store team.");
      setContactOpen(false);
      setContactForm((prev) => ({
        ...prev,
        message: "",
      }));
    } catch {
      setContactError("Unable to send your message right now.");
    } finally {
      setContactSubmitting(false);
    }
  };

  const activeFeedbackImages = Array.isArray(activeFeedbackViewer?.images)
    ? activeFeedbackViewer.images
    : [];
  const activeFeedbackIndex =
    activeFeedbackImages.length > 0
      ? Math.min(
          Math.max(Number(activeFeedbackViewer?.index || 0), 0),
          activeFeedbackImages.length - 1
        )
      : 0;
  const activeFeedbackImageSrc = activeFeedbackImages[activeFeedbackIndex] || "";
  const activeFeedbackImageCount = activeFeedbackImages.length;
  const canViewPrevFeedbackImage = activeFeedbackIndex > 0;
  const canViewNextFeedbackImage =
    activeFeedbackIndex < activeFeedbackImageCount - 1;
  const activeFeedbackImageAlt = `Customer review image ${
    activeFeedbackIndex + 1
  } for ${activeFeedbackViewer?.productName || "Gift hamper"}`;
  const handleFeedbackViewerTouchStart = (event) => {
    const touch = event.changedTouches?.[0];
    if (!touch) return;
    feedbackSwipeStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
    };
  };
  const handleFeedbackViewerTouchEnd = (event) => {
    if (activeFeedbackImageCount <= 1) return;
    const touch = event.changedTouches?.[0];
    if (!touch) return;
    const { x, y } = feedbackSwipeStartRef.current;
    const deltaX = touch.clientX - x;
    const deltaY = touch.clientY - y;
    feedbackSwipeStartRef.current = { x: 0, y: 0 };
    if (Math.abs(deltaX) < 44 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    setActiveFeedbackViewer((prev) =>
      moveFeedbackViewerIndex(prev, deltaX < 0 ? 1 : -1)
    );
  };

  return (
    <div className="page seller-store-page">
      <Header variant={isOwnerSeller ? "seller" : undefined} />
      <div className="seller-store-shell">
        <div className="seller-store-headline">
          <div>
            <h2>{sellerName}</h2>
            <p>Storefront with live products and profile details.</p>
          </div>
          <div className="seller-store-headline-actions">
            <Link className="btn ghost" to={backCatalogPath}>
              <StoreActionIcon name="back" />
              {backCatalogLabel}
            </Link>
            {isOwnerSeller && !editMode ? (
              <button className="btn primary" type="button" onClick={beginEditMode}>
                <StoreActionIcon name="edit" />
                Edit store
              </button>
            ) : null}
            {isOwnerSeller && editMode ? (
              <>
                <button className="btn ghost" type="button" onClick={cancelEditMode} disabled={saving}>
                  <StoreActionIcon name="close" />
                  Cancel
                </button>
                <button className="btn primary" type="button" onClick={saveStoreEdits} disabled={saving}>
                  <StoreActionIcon name="save" />
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
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M4 16.9V20h3.1l9.4-9.4-3.1-3.1L4 16.9Zm14.7-8.5a.9.9 0 0 0 0-1.2l-1.9-1.9a.9.9 0 0 0-1.2 0l-1.5 1.5 3.1 3.1 1.5-1.5Z"
                            fill="currentColor"
                          />
                        </svg>
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
                  <div className="seller-store-info-row">
                    <div className="seller-store-info-text">
                      <div className={`seller-store-brand-row ${isOwnerSeller && editMode ? "is-editing" : ""}`}>
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
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                  <path
                                    d="M4 16.9V20h3.1l9.4-9.4-3.1-3.1L4 16.9Zm14.7-8.5a.9.9 0 0 0 0-1.2l-1.9-1.9a.9.9 0 0 0-1.2 0l-1.5 1.5 3.1 3.1 1.5-1.5Z"
                                    fill="currentColor"
                                  />
                                </svg>
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
                            <h3>{sellerShopName}</h3>
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
                          <span>All Products</span>
                          <strong>{listedProducts}</strong>
                        </div>
                      </div>
                    </div>
                    {sellerId ? (
                      <Link
                        className="seller-store-hamper-btn"
                        to={`/customize/seller/${sellerId}?mode=build`}
                        aria-label="Build your own hamper"
                      >
                        <img
                          className="hamper-btn-image"
                          src="/images/hamper-btn.png"
                          alt=""
                          aria-hidden="true"
                        />
                        <span className="hamper-btn-text">Build your own hamper</span>
                      </Link>
                    ) : null}
                  </div>

                  {isOwnerSeller && editMode ? (
                    <div className="seller-store-inline-form">
                      <input
                        type="text"
                        value={draft.ownerName}
                        onChange={handleDraft("ownerName")}
                        placeholder="Owner name"
                      />
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
                      <select value={draft.pickupWindow} onChange={handleDraft("pickupWindow")}>
                        <option value="9-5">Pickup window: 09:00 - 17:00</option>
                        <option value="10-6">Pickup window: 10:00 - 18:00</option>
                        <option value="11-7">Pickup window: 11:00 - 19:00</option>
                      </select>
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
                <span className="seller-store-owner-kicker">
                  {isOwnerSeller ? "Customer inbox" : "Store team"}
                </span>
                <p className="seller-store-owner-title">
                  {isOwnerSeller ? "Private inbox" : sellerName}
                </p>
                <p className="seller-store-owner-name">
                  {isOwnerSeller
                    ? "Questions from shoppers land here inside your dashboard."
                    : `Managed by ${sellerOwnerName}`}
                </p>
                <div className="seller-store-owner-contacts">
                  <span>{sellerSupportChannelLabel}</span>
                </div>
                <p className="seller-store-owner-support-note">{sellerSupportMessage}</p>
                {contactNotice ? (
                  <p className="seller-store-owner-success" role="status" aria-live="polite">
                    {contactNotice}
                  </p>
                ) : null}
                {contactError ? (
                  <p className="seller-store-owner-error" role="alert">
                    {contactError}
                  </p>
                ) : null}
                {isOwnerSeller ? (
                  <div className="seller-store-owner-actions">
                    <button
                      className="btn seller-store-owner-email-btn"
                      type="button"
                      onClick={() => navigate("/seller/dashboard")}
                    >
                      <StoreActionIcon name="view" />
                      Open inbox
                    </button>
                  </div>
                ) : contactOpen ? (
                  <form className="seller-store-contact-form" onSubmit={submitContactRequest}>
                    <label className="seller-store-contact-field">
                      <span>Name</span>
                      <input
                        type="text"
                        value={contactForm.name}
                        onChange={handleContactField("name")}
                        placeholder="Your name"
                        minLength={2}
                        maxLength={80}
                        required
                      />
                    </label>
                    <label className="seller-store-contact-field">
                      <span>Email</span>
                      <input
                        type="email"
                        value={contactForm.email}
                        onChange={handleContactField("email")}
                        placeholder="you@example.com"
                        maxLength={160}
                        required
                      />
                    </label>
                    <label className="seller-store-contact-field seller-store-contact-field-full">
                      <span>Message</span>
                      <textarea
                        value={contactForm.message}
                        onChange={handleContactField("message")}
                        placeholder="Tell the store team what you need help with."
                        rows={4}
                        minLength={10}
                        maxLength={1200}
                        required
                      />
                    </label>
                    <p className="seller-store-contact-disclaimer">
                      Your message stays inside the seller&apos;s private dashboard.
                    </p>
                    <div className="seller-store-owner-actions seller-store-contact-actions">
                      <button
                        className="btn seller-store-owner-email-btn"
                        type="submit"
                        disabled={contactSubmitting}
                      >
                        <StoreActionIcon name="email" />
                        {contactSubmitting ? "Sending..." : "Send message"}
                      </button>
                      <button
                        className="btn ghost seller-store-owner-cancel-btn"
                        type="button"
                        onClick={() => {
                          setContactOpen(false);
                          setContactError("");
                          setContactNotice("");
                        }}
                        disabled={contactSubmitting}
                      >
                        <StoreActionIcon name="close" />
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="seller-store-owner-actions">
                    <button
                      className="btn seller-store-owner-email-btn"
                      type="button"
                      onClick={() => {
                        setContactOpen(true);
                        setContactError("");
                        setContactNotice("");
                      }}
                    >
                      <StoreActionIcon name="email" />
                      Send a message
                    </button>
                  </div>
                )}
              </aside>
            </section>

            <section className="seller-store-market">
              <div className="seller-store-market-head">
                <div className="seller-store-tabs" role="tablist" aria-label="Store sections">
                  {STORE_TABS.map((tab) => (
                    <button
                      key={tab}
                      className={`seller-store-tab ${tab === selectedTab ? "active" : ""}`}
                      type="button"
                      aria-pressed={tab === selectedTab}
                      onClick={() => setActiveTab(tab)}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                {isProductsTab ? (
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
                ) : null}
              </div>

              {isProductsTab ? (
                filteredProducts.length === 0 ? (
                  <p className="field-hint">No products match this search.</p>
                ) : (
                  <>
                    <div className="seller-store-grid">
                      {visibleProducts.map((item, index) => {
                        const livePrice = Number(item?.price || 0);
                        const mrp = Number(item?.mrp || 0);
                        const hasDiscount = mrp > livePrice;
                        const discountPercent = hasDiscount
                          ? Math.round(((mrp - livePrice) / mrp) * 100)
                          : 0;
                        const stock = Number(item?.stock || 0);
                        const productId = String(item?._id || "").trim();
                        const productReviewStats =
                          item?.reviewStats && typeof item.reviewStats === "object"
                            ? item.reviewStats
                            : null;
                        const productDisplayRating = Number(
                          productReviewStats?.displayRating || productReviewStats?.avgRating || 0
                        );
                        const productTotalFeedbacks = Number(
                          productReviewStats?.totalFeedbacks || 0
                        );
                        const productVerifiedFeedbacks = Number(
                          productReviewStats?.verifiedFeedbacks || productTotalFeedbacks || 0
                        );
                        const { ratingRows: productRatingRows, totalRatingVotes: productRatingVotes } =
                          getRatingRows(
                            productReviewStats?.ratingBreakdown,
                            productTotalFeedbacks,
                            productVerifiedFeedbacks
                          );
                        const isProductRatingOpen =
                          Boolean(productId) && activeProductRatingId === productId;
                        const productRatingPopoverId = `seller-store-product-rating-${
                          productId || index
                        }`;
                        const productUrl = `/products/${item._id}`;
                        const prefetchCurrentProduct = () => {
                          if (!productId) return;
                          prefetchProductDetail(productId, {
                            includeFeedback: true,
                            feedbackLimit: 6,
                          });
                        };

                        return (
                          <article
                            key={item._id}
                            className="seller-store-product"
                            onMouseEnter={prefetchCurrentProduct}
                          >
                            <Link
                              className="seller-store-product-image-link"
                              to={productUrl}
                              aria-label={`Open ${item.name}`}
                              onMouseEnter={prefetchCurrentProduct}
                              onFocus={prefetchCurrentProduct}
                              onTouchStart={prefetchCurrentProduct}
                            >
                              <img src={getProductImage(item)} alt={item.name} loading="lazy" />
                            </Link>
                            <div className="seller-store-product-body">
                              <h4>
                                <Link
                                  className="seller-store-product-title-link"
                                  to={productUrl}
                                  onMouseEnter={prefetchCurrentProduct}
                                  onFocus={prefetchCurrentProduct}
                                  onTouchStart={prefetchCurrentProduct}
                                >
                                  {item.name}
                                </Link>
                              </h4>
                              <p>{item.category || "Gift hamper"}</p>
                              {productRatingVotes > 0 ? (
                                <div
                                  className="seller-store-product-rating-anchor"
                                  data-product-rating-anchor="true"
                                >
                                  <button
                                    className="seller-store-product-rating-trigger"
                                    type="button"
                                    onClick={() =>
                                      setActiveProductRatingId((prev) =>
                                        prev === productId ? "" : productId
                                      )
                                    }
                                    aria-expanded={isProductRatingOpen}
                                    aria-controls={productRatingPopoverId}
                                  >
                                    <span className="seller-store-product-rating-value">
                                      {productDisplayRating.toFixed(1)}
                                    </span>
                                    <span
                                      className="rating-stars"
                                      role="img"
                                      aria-label={`${productDisplayRating.toFixed(1)} out of 5`}
                                    >
                                      {toStarText(productDisplayRating)}
                                    </span>
                                    <svg
                                      className={`seller-store-product-rating-caret ${
                                        isProductRatingOpen ? "open" : ""
                                      }`}
                                      viewBox="0 0 24 24"
                                      aria-hidden="true"
                                    >
                                      <path d="m7 10 5 5 5-5" />
                                    </svg>
                                    <span className="seller-store-product-rating-count">
                                      ({productRatingVotes})
                                    </span>
                                  </button>
                                  {isProductRatingOpen ? (
                                    <div
                                      id={productRatingPopoverId}
                                      className="seller-store-product-rating-popover"
                                      role="dialog"
                                      aria-label={`Rating breakdown for ${
                                        item?.name || "this product"
                                      }`}
                                    >
                                      <div className="seller-store-product-rating-popover-head">
                                        <strong>{productDisplayRating.toFixed(1)} out of 5</strong>
                                        <button
                                          type="button"
                                          className="seller-store-product-rating-popover-close"
                                          aria-label="Close rating breakdown"
                                          onClick={() => setActiveProductRatingId("")}
                                        >
                                          ×
                                        </button>
                                      </div>
                                      <p className="seller-store-product-rating-popover-count">
                                        {productRatingVotes} global ratings
                                      </p>
                                      <div className="seller-store-product-rating-breakdown">
                                        {productRatingRows.map((row) => (
                                          <div
                                            key={`${productId || index}-rating-${row.star}`}
                                            className="seller-store-product-rating-breakdown-row"
                                          >
                                            <span>{row.star} star</span>
                                            <div
                                              className="seller-store-product-rating-breakdown-track"
                                              aria-hidden="true"
                                            >
                                              <span
                                                className="seller-store-product-rating-breakdown-fill"
                                                style={{ width: `${row.share}%` }}
                                              />
                                            </div>
                                            <span>{Math.round(row.share)}%</span>
                                          </div>
                                        ))}
                                      </div>
                                      <Link
                                        className="seller-store-product-rating-link"
                                        to={productUrl}
                                        onMouseEnter={prefetchCurrentProduct}
                                        onFocus={prefetchCurrentProduct}
                                        onTouchStart={prefetchCurrentProduct}
                                        onClick={() => setActiveProductRatingId("")}
                                      >
                                        See customer reviews
                                      </Link>
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <p className="seller-store-product-rating-empty">No ratings yet</p>
                              )}
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
                                <Link
                                  className="btn ghost seller-store-link"
                                  to={productUrl}
                                  onMouseEnter={prefetchCurrentProduct}
                                  onFocus={prefetchCurrentProduct}
                                  onTouchStart={prefetchCurrentProduct}
                                >
                                  <StoreActionIcon name="view" />
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
                          <StoreActionIcon name="more" />
                          Show more products
                        </button>
                      </div>
                    )}
                  </>
                )
              ) : selectedTab === STORE_TABS[1] ? (
                <>
                  <div className="seller-store-tab-copy seller-store-feedback-summary">
                    {totalFeedbacks > 0 ? (
                      <>
                        <div className="seller-store-rating-popover-anchor" ref={ratingPopoverRef}>
                          <p className="seller-store-feedback-rating-line">
                            <strong>Customer rating:</strong>
                            <button
                              className="seller-store-rating-trigger"
                              type="button"
                              onClick={() => setIsRatingPopoverOpen((prev) => !prev)}
                              aria-expanded={isRatingPopoverOpen}
                              aria-controls="seller-store-rating-popover"
                            >
                              <span className="seller-store-rating-value">
                                {displayRating.toFixed(1)}
                              </span>
                              <span
                                className="rating-stars"
                                role="img"
                                aria-label={`${displayRating.toFixed(1)} out of 5`}
                              >
                                {toStarText(displayRating)}
                              </span>
                              <svg
                                className={`seller-store-rating-caret ${
                                  isRatingPopoverOpen ? "open" : ""
                                }`}
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                              >
                                <path d="m7 10 5 5 5-5" />
                              </svg>
                              <span className="seller-store-rating-count">({totalRatingVotes})</span>
                            </button>
                          </p>
                          {isRatingPopoverOpen ? (
                            <div
                              id="seller-store-rating-popover"
                              className="seller-store-rating-popover"
                              role="dialog"
                              aria-label="Rating breakdown"
                            >
                              <div className="seller-store-rating-popover-head">
                                <div className="seller-store-rating-popover-title">
                                  <span
                                    className="rating-stars"
                                    role="img"
                                    aria-label={`${displayRating.toFixed(1)} out of 5`}
                                  >
                                    {toStarText(displayRating)}
                                  </span>
                                  <strong>{displayRating.toFixed(1)} out of 5</strong>
                                </div>
                                <button
                                  type="button"
                                  className="seller-store-rating-popover-close"
                                  aria-label="Close rating breakdown"
                                  onClick={() => setIsRatingPopoverOpen(false)}
                                >
                                  ×
                                </button>
                              </div>
                              <p className="seller-store-rating-popover-count">
                                {totalRatingVotes} global ratings
                              </p>
                              <div className="seller-store-rating-breakdown">
                                {ratingRows.map((row) => (
                                  <div
                                    key={`seller-breakdown-${row.star}`}
                                    className="seller-store-rating-breakdown-row"
                                  >
                                    <span className="seller-store-rating-breakdown-label">
                                      {row.star} star
                                    </span>
                                    <div
                                      className="seller-store-rating-breakdown-track"
                                      aria-hidden="true"
                                    >
                                      <span
                                        className="seller-store-rating-breakdown-fill"
                                        style={{ width: `${row.share}%` }}
                                      />
                                    </div>
                                    <span className="seller-store-rating-breakdown-percent">
                                      {Math.round(row.share)}%
                                    </span>
                                  </div>
                                ))}
                              </div>
                              {feedbacks.length > 0 ? (
                                <button
                                  type="button"
                                  className="seller-store-rating-popover-link"
                                  onClick={handleSeeCustomerReviews}
                                >
                                  See customer reviews
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                        <p className="seller-store-feedback-subcopy">
                          {displayRating.toFixed(1)}/5 from {verifiedFeedbacks} verified ratings
                        </p>
                      </>
                    ) : (
                      <p>No customer feedback yet.</p>
                    )}
                  </div>
                  {feedbackLoading && feedbacks.length === 0 ? (
                    <p className="field-hint">Loading customer reviews...</p>
                  ) : null}
                  {feedbacks.length > 0 ? (
                    <div className="seller-store-feedback-list" ref={feedbackListRef}>
                      {feedbacks.map((item, index) => {
                        const feedbackProductId = String(item?.productId || "").trim();
                        const reviewImages = normalizeReviewImages(item?.images);
                        const canOpenProduct = Boolean(feedbackProductId);
                        const openProduct = () => {
                          if (!canOpenProduct) return;
                          navigate(`/products/${feedbackProductId}`);
                        };
                        return (
                          <article
                            key={
                              item?.id ||
                              `${item?.customerName || "customer"}-${item?.createdAt || index}`
                            }
                            className={`seller-store-feedback-item ${
                              canOpenProduct ? "is-clickable" : ""
                            }`}
                            role={canOpenProduct ? "button" : undefined}
                            tabIndex={canOpenProduct ? 0 : undefined}
                            onClick={canOpenProduct ? openProduct : undefined}
                            onKeyDown={
                              canOpenProduct
                                ? (event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      openProduct();
                                    }
                                  }
                                : undefined
                            }
                            aria-label={
                              canOpenProduct
                                ? `Open product ${item?.productName || "Gift hamper"}`
                                : undefined
                            }
                          >
                            <div className="seller-store-feedback-head">
                              <p>{item?.customerName || "Customer"}</p>
                              <span
                                className="rating-stars"
                              role="img"
                              aria-label={`${Number(item?.rating || 0)} out of 5`}
                            >
                              {toStarText(item?.rating)}
                            </span>
                          </div>
                          <p className="seller-store-feedback-product">
                            {item?.productName || "Gift hamper"}
                            {canOpenProduct ? " • Click to view product" : ""}
                          </p>
                          {item?.verifiedPurchase ? (
                            <p className="field-hint">Verified purchase</p>
                          ) : null}
                          {item?.comment ? (
                            <p className="seller-store-feedback-comment">{item.comment}</p>
                          ) : (
                            <p className="field-hint">Customer did not add a written review.</p>
                          )}
                          {reviewImages.length > 0 ? (
                            <div
                              className="seller-store-feedback-images"
                              aria-label="Customer review photos"
                            >
                              {reviewImages.map((image, imageIndex) => (
                                <button
                                  key={`${item?.id || index}-review-image-${imageIndex}`}
                                  type="button"
                                  className="seller-store-feedback-image-btn"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setActiveFeedbackViewer({
                                      images: reviewImages,
                                      index: imageIndex,
                                      customerName: item?.customerName || "Customer",
                                      productName: item?.productName || "Gift hamper",
                                      createdAt: item?.createdAt || null,
                                    });
                                  }}
                                  onKeyDown={(event) => {
                                    event.stopPropagation();
                                  }}
                                  aria-label={`Open review image ${imageIndex + 1} from ${
                                    item?.customerName || "customer"
                                  }`}
                                >
                                  <img
                                    src={image}
                                    alt={`Customer review image ${imageIndex + 1}`}
                                    loading="lazy"
                                  />
                                </button>
                              ))}
                            </div>
                          ) : null}
                          <p className="field-hint">
                            {item?.createdAt ? formatDate(item.createdAt) : "Date unavailable"}
                          </p>
                        </article>
                      );
                    })}
                  </div>
                  ) : null}
                </>
              ) : selectedTab === STORE_TABS[2] ? (
                <div className="seller-store-tab-copy">
                  <p>
                    <strong>Pickup address:</strong> {pickupAddressText}
                  </p>
                  <p>
                    <strong>Pickup window:</strong> {String(seller?.pickupAddress?.pickupWindow || "10-6")}
                  </p>
                  <p>
                    <strong>Contact channel:</strong> {sellerSupportChannelLabel}
                  </p>
                  <p>
                    <strong>Support team:</strong> {sellerSupportMessage}
                  </p>
                </div>
              ) : selectedTab === STORE_TABS[3] ? (
                <div className="seller-store-tab-copy">
                  <p>{sellerAbout}</p>
                </div>
              ) : (
                <div className="seller-store-tab-copy">
                  <p>
                    <strong>Store name:</strong> {sellerName}
                  </p>
                  <p>
                    <strong>All Products:</strong> {listedProducts}
                  </p>
                  <p>
                    <strong>Categories:</strong> {categoryCount}
                  </p>
                  <p>
                    <strong>Joined:</strong> {joinedText}
                  </p>
                  <p>
                    <strong>Location:</strong> {locationText}
                  </p>
                </div>
              )}
            </section>

            <section className="seller-store-insights">
              <article className="seller-store-insight-card">
                <h4>Store Insights</h4>
                <div className="seller-store-insight-grid">
                  <p>
                    <span>All Products</span>
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
                    <span>Contact channel</span>
                    <strong>{sellerSupportChannelLabel}</strong>
                  </p>
                  <p>
                    <span>Support team</span>
                    <strong>{sellerSupportMessage}</strong>
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
      {activeFeedbackViewer ? (
        <div
          className="seller-store-review-viewer"
          role="dialog"
          aria-modal="true"
          aria-label="Customer review image"
          onClick={() => setActiveFeedbackViewer(null)}
        >
          <div
            className="seller-store-review-viewer-card"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="seller-store-review-viewer-close"
              aria-label="Close review image"
              onClick={() => setActiveFeedbackViewer(null)}
            >
              ×
            </button>
            <div
              className="seller-store-review-viewer-stage"
              onTouchStart={handleFeedbackViewerTouchStart}
              onTouchEnd={handleFeedbackViewerTouchEnd}
            >
              <p className="seller-store-review-viewer-count">
                {activeFeedbackIndex + 1}/{activeFeedbackImageCount || 1}
              </p>
              <button
                type="button"
                className="seller-store-review-viewer-nav seller-store-review-viewer-nav-prev"
                aria-label="Show previous review image"
                onClick={() =>
                  setActiveFeedbackViewer((prev) =>
                    moveFeedbackViewerIndex(prev, -1)
                  )
                }
                disabled={!canViewPrevFeedbackImage}
              >
                ‹
              </button>
              <img
                className="seller-store-review-viewer-image"
                src={activeFeedbackImageSrc}
                alt={activeFeedbackImageAlt}
              />
              <button
                type="button"
                className="seller-store-review-viewer-nav seller-store-review-viewer-nav-next"
                aria-label="Show next review image"
                onClick={() =>
                  setActiveFeedbackViewer((prev) =>
                    moveFeedbackViewerIndex(prev, 1)
                  )
                }
                disabled={!canViewNextFeedbackImage}
              >
                ›
              </button>
            </div>
            <div className="seller-store-review-viewer-copy">
              <p>
                <strong>{activeFeedbackViewer.customerName}</strong> on{" "}
                {activeFeedbackViewer.productName}
              </p>
              <p>
                {activeFeedbackViewer.createdAt
                  ? formatDate(activeFeedbackViewer.createdAt)
                  : "Date unavailable"}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
