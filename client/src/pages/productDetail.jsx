import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Header from "../components/Header";
import { addToCart } from "../utils/cart";
import { getWishlist, toggleWishlist } from "../utils/wishlist";
import { getProductImage } from "../utils/productMedia";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const parsePrice = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatPrice = (value) => Number(value || 0).toLocaleString("en-IN");

const readStoredUserRole = () => {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return String(parsed?.role || "").trim().toLowerCase();
  } catch {
    return "";
  }
};

const cleanTextList = (value = [], maxItems = 20) =>
  Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
    )
  ).slice(0, maxItems);

const splitDescriptionHighlights = (description = "", maxItems = 4) =>
  String(description || "")
    .split(/[.!?]\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, maxItems);

const formatLabelFromKey = (value = "") => {
  const cleaned = String(value || "")
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "";
};

const normalizePackagingStyles = (styles = []) =>
  (Array.isArray(styles) ? styles : [])
    .map((style, index) => {
      const title = String(style?.title || style?.name || "").trim();
      if (!title) return null;
      return {
        id: String(style?.id || `pack_${index}`).trim(),
        title,
        detail: String(style?.detail || style?.description || "").trim(),
        extraCharge: Number(style?.extraCharge || 0),
        active: style?.active !== false,
      };
    })
    .filter((style) => style && style.active !== false);

const getRecoVisibleCount = () => {
  if (typeof window === "undefined") return 4;
  const width = window.innerWidth;
  if (width <= 560) return 1;
  if (width <= 900) return 2;
  if (width <= 1200) return 3;
  return 4;
};

export default function ProductDetail() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [sellerStoreData, setSellerStoreData] = useState({
    seller: null,
    products: [],
    stats: null,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [selectedOccasion, setSelectedOccasion] = useState("");
  const [selectedPackagingId, setSelectedPackagingId] = useState("");
  const [giftNote, setGiftNote] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [catalogPool, setCatalogPool] = useState([]);
  const [recoVisibleCount, setRecoVisibleCount] = useState(getRecoVisibleCount);
  const [recoStartIndex, setRecoStartIndex] = useState(0);
  const [notice, setNotice] = useState("");
  const [wishlistNotice, setWishlistNotice] = useState("");
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [userRole, setUserRole] = useState(() => readStoredUserRole());
  const navigate = useNavigate();

  const requireLogin = () => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return false;
    }
    return true;
  };

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      setLoading(true);
      setLoadError("");
      try {
        const res = await fetch(`${API_URL}/api/products/${id}`);
        if (!res.ok) {
          throw new Error(
            res.status === 404
              ? "Product not found."
              : "Unable to load product right now."
          );
        }
        const data = await res.json();
        if (ignore) return;
        setProduct(data);
        setActiveImageIndex(0);
        setGiftNote("");
      } catch (error) {
        if (ignore) return;
        setProduct(null);
        setLoadError(error?.message || "Unable to load product right now.");
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    load();

    return () => {
      ignore = true;
    };
  }, [id]);

  useEffect(() => {
    let ignore = false;

    const loadCatalog = async () => {
      try {
        const res = await fetch(`${API_URL}/api/products`);
        if (!res.ok) return;
        const data = await res.json();
        if (ignore) return;
        const products = Array.isArray(data)
          ? data
          : Array.isArray(data?.items)
            ? data.items
            : [];
        setCatalogPool(products);
      } catch {
        if (!ignore) setCatalogPool([]);
      }
    };

    loadCatalog();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    const syncUserRole = () => setUserRole(readStoredUserRole());
    window.addEventListener("user:updated", syncUserRole);
    return () => window.removeEventListener("user:updated", syncUserRole);
  }, []);

  useEffect(() => {
    const syncWishlistState = () => {
      const productId = String(product?._id || "").trim();
      if (!productId) {
        setIsWishlisted(false);
        return;
      }
      const list = getWishlist();
      const exists = list.some(
        (entry) => String(entry?.id || entry?._id || "").trim() === productId
      );
      setIsWishlisted(exists);
    };

    syncWishlistState();
    window.addEventListener("wishlist:updated", syncWishlistState);
    return () => window.removeEventListener("wishlist:updated", syncWishlistState);
  }, [product?._id]);

  useEffect(() => {
    if (!wishlistNotice) return;
    const timerId = window.setTimeout(() => setWishlistNotice(""), 1800);
    return () => window.clearTimeout(timerId);
  }, [wishlistNotice]);

  const isCustomizationEnabled = Boolean(product?.isCustomizable);
  const baseMakingCharge = Number(product?.makingCharge || 0);
  const availableStock = Math.max(0, Number(product?.stock || 0));
  const isOutOfStock = availableStock <= 0;
  const isSellerAccount = userRole === "seller";
  const maxQuantity = Math.max(1, availableStock);
  const purchaseDisabled = isOutOfStock || isSellerAccount;

  useEffect(() => {
    setQuantity((prev) => Math.max(1, Math.min(prev, maxQuantity)));
  }, [maxQuantity]);

  const galleryImages = useMemo(() => {
    const unique = [];
    const add = (value) => {
      const src = String(value || "").trim();
      if (!src || unique.includes(src)) return;
      unique.push(src);
    };

    add(product?.image);
    if (Array.isArray(product?.images)) {
      product.images.forEach(add);
    }
    add(getProductImage(product || {}));

    return unique;
  }, [product]);

  const safeImageIndex =
    galleryImages.length > 0
      ? Math.min(activeImageIndex, galleryImages.length - 1)
      : 0;
  const activeImage = galleryImages[safeImageIndex] || getProductImage(product || {});

  useEffect(() => {
    if (activeImageIndex > safeImageIndex) {
      setActiveImageIndex(safeImageIndex);
    }
  }, [activeImageIndex, safeImageIndex]);

  const quantityChoices = Array.from(
    { length: Math.min(Math.max(maxQuantity, 1), 10) },
    (_, index) => index + 1
  );

  const sellerName = product?.seller?.storeName || product?.seller?.name || "";
  const sellerId = String(product?.seller?._id || "").trim();
  const sellerProfile =
    sellerStoreData?.seller && typeof sellerStoreData.seller === "object"
      ? sellerStoreData.seller
      : product?.seller || {};
  const sellerDisplayName = sellerProfile?.storeName || sellerProfile?.name || sellerName || "Seller";
  const sellerAbout = String(sellerProfile?.about || "").trim();
  const sellerProfileImageRaw = String(sellerProfile?.profileImage || "").trim();
  const sellerProfileImage =
    sellerProfileImageRaw &&
    (sellerProfileImageRaw.startsWith("http://") ||
    sellerProfileImageRaw.startsWith("https://") ||
    sellerProfileImageRaw.startsWith("data:")
      ? sellerProfileImageRaw
      : `${API_URL}/${sellerProfileImageRaw.replace(/^\/+/, "")}`);
  const unitPrice = parsePrice(product?.price);
  const mrp = parsePrice(product?.mrp);
  const hasDiscount = mrp > unitPrice;
  const discountPercent = hasDiscount
    ? Math.round(((mrp - unitPrice) / mrp) * 100)
    : 0;

  const deliveryMinDays = Math.max(0, Number(product?.deliveryMinDays || 0));
  const deliveryMaxRaw = Math.max(0, Number(product?.deliveryMaxDays || 0));
  const deliveryMaxDays =
    deliveryMinDays > 0 ? Math.max(deliveryMaxRaw, deliveryMinDays) : deliveryMaxRaw;
  const deliveryWindowText =
    deliveryMinDays > 0 && deliveryMaxDays > 0
      ? `${deliveryMinDays}-${deliveryMaxDays} days`
      : deliveryMinDays > 0
        ? `${deliveryMinDays} day(s)`
        : "";

  const occasionOptions = useMemo(() => {
    const direct = cleanTextList(product?.occasions, 8);
    return direct;
  }, [product]);
  const showInlineStockWithOccasion = isCustomizationEnabled && occasionOptions.length > 0;

  const packagingStyles = useMemo(
    () => normalizePackagingStyles(product?.packagingStyles),
    [product]
  );

  const selectedPackagingStyle = useMemo(
    () =>
      packagingStyles.find((style) => style.id === selectedPackagingId) || null,
    [packagingStyles, selectedPackagingId]
  );
  const normalizedGiftNote = giftNote.trim().slice(0, 180);
  const hasCustomizationSelection =
    isCustomizationEnabled &&
    Boolean(selectedOccasion || selectedPackagingId || normalizedGiftNote.length > 0);
  const selectedPackagingCharge = hasCustomizationSelection
    ? Math.max(0, Number(selectedPackagingStyle?.extraCharge || 0))
    : 0;
  const hasChargeablePackagingStyle = selectedPackagingCharge > 0;
  const effectiveCustomizationCharge = hasCustomizationSelection
    ? hasChargeablePackagingStyle
      ? selectedPackagingCharge
      : Math.max(0, baseMakingCharge)
    : 0;
  const displayHamperPrice = unitPrice + selectedPackagingCharge;

  useEffect(() => {
    setSelectedOccasion((prev) =>
      occasionOptions.includes(prev) ? prev : ""
    );
  }, [occasionOptions]);

  useEffect(() => {
    const ids = packagingStyles.map((style) => style.id);
    setSelectedPackagingId((prev) => (ids.includes(prev) ? prev : ""));
  }, [packagingStyles]);

  const hamperIncludes = useMemo(() => {
    const direct = cleanTextList(product?.includedItems, 20);
    if (direct.length > 0) return direct.slice(0, 6);

    const derived = [];
    if (Array.isArray(product?.customizationCatalog)) {
      product.customizationCatalog.forEach((section) => {
        const itemCount = Array.isArray(section?.items)
          ? section.items.filter((item) => item?.active !== false).length
          : 0;
        if (itemCount > 0 && section?.name) {
          derived.push(`${itemCount}+ ${section.name}`);
        }
      });
    }

    if (product?.customizationOptions && typeof product.customizationOptions === "object") {
      Object.entries(product.customizationOptions).forEach(([key, value]) => {
        if (Array.isArray(value) && value.length > 0) {
          derived.push(`${value.length}+ ${formatLabelFromKey(key)}`);
        }
      });
    }

    return cleanTextList(derived, 6);
  }, [product]);

  const detailPoints = useMemo(() => {
    const direct = cleanTextList(product?.highlights, 20);
    if (direct.length > 0) return direct.slice(0, 6);
    return splitDescriptionHighlights(product?.description, 6);
  }, [product]);

  useEffect(() => {
    let ignore = false;

    const loadSellerStore = async () => {
      if (!sellerId) {
        if (!ignore) {
          setSellerStoreData({ seller: null, products: [], stats: null });
        }
        return;
      }

      try {
        const res = await fetch(`${API_URL}/api/products/seller/${sellerId}/public?limit=16`);
        if (!res.ok) {
          throw new Error("Unable to load seller store.");
        }
        const data = await res.json();
        if (ignore) return;
        setSellerStoreData({
          seller: data?.seller || null,
          products: Array.isArray(data?.products) ? data.products : [],
          stats: data?.stats || null,
        });
      } catch {
        if (ignore) return;
        setSellerStoreData({ seller: null, products: [], stats: null });
      }
    };

    loadSellerStore();
    return () => {
      ignore = true;
    };
  }, [sellerId]);

  const recommendations = useMemo(() => {
    const activeProductId = String(product?._id || "").trim();
    const referenceCategory = String(product?.category || "").trim().toLowerCase();
    const productPool = Array.isArray(catalogPool) ? catalogPool : [];

    return productPool
      .filter((item) => String(item?._id || item?.id || "").trim() !== activeProductId)
      .sort((left, right) => {
        const leftSameCategory =
          String(left?.category || "").trim().toLowerCase() === referenceCategory ? 1 : 0;
        const rightSameCategory =
          String(right?.category || "").trim().toLowerCase() === referenceCategory ? 1 : 0;
        if (leftSameCategory !== rightSameCategory) {
          return rightSameCategory - leftSameCategory;
        }
        return (
          new Date(right?.createdAt || 0).getTime() -
          new Date(left?.createdAt || 0).getTime()
        );
      })
      .slice(0, 8);
  }, [catalogPool, product?._id, product?.category]);

  const normalizedRecoStart =
    recommendations.length > 0 ? recoStartIndex % recommendations.length : 0;

  const visibleRecommendations = useMemo(() => {
    const total = recommendations.length;
    if (total === 0) return [];

    const count = Math.min(recoVisibleCount, total);
    return Array.from({ length: count }, (_, offset) => {
      const index = (normalizedRecoStart + offset) % total;
      return recommendations[index];
    });
  }, [recommendations, recoVisibleCount, normalizedRecoStart]);

  const handleRecoArrow = (direction) => {
    const total = recommendations.length;
    if (total <= 1) return;
    const step = direction > 0 ? 1 : -1;
    setRecoStartIndex((prev) => (prev + step + total) % total);
  };

  useEffect(() => {
    const syncRecoLayout = () => setRecoVisibleCount(getRecoVisibleCount());
    syncRecoLayout();
    window.addEventListener("resize", syncRecoLayout);
    return () => window.removeEventListener("resize", syncRecoLayout);
  }, []);

  if (loading) {
    return (
      <div className="page product-detail-page">
        <Header />
        <div className="pdp-status-card">
          <p>Loading product...</p>
        </div>
      </div>
    );
  }

  if (loadError || !product) {
    return (
      <div className="page product-detail-page">
        <Header />
        <div className="pdp-status-card">
          <p>{loadError || "Product not found."}</p>
          <Link className="link" to="/products">
            Back to products
          </Link>
        </div>
      </div>
    );
  }

  const buildCurrentCheckoutItem = () => {
    const selectedOptions = {};
    if (hasCustomizationSelection && selectedOccasion) {
      selectedOptions.occasion = selectedOccasion;
    }
    if (hasCustomizationSelection && selectedPackagingStyle?.title) {
      selectedOptions.packaging = selectedPackagingStyle.title;
    }

    const totalCustomizationCharge = effectiveCustomizationCharge;

    const customizationPayload = hasCustomizationSelection
      ? {
          ...(Object.keys(selectedOptions).length > 0
            ? { selectedOptions }
            : {}),
          ...(normalizedGiftNote ? { wishCardText: normalizedGiftNote } : {}),
          ...(totalCustomizationCharge > 0
            ? { makingCharge: totalCustomizationCharge }
            : {}),
        }
      : undefined;

    return {
      id: product._id,
      name: product.name,
      price: unitPrice,
      mrp,
      isCustomizable: product.isCustomizable,
      quantity,
      category: product.category,
      deliveryMinDays,
      deliveryMaxDays,
      image: getProductImage(product),
      seller: {
        id: sellerId,
        name: String(sellerProfile?.name || "").trim(),
        storeName: String(sellerDisplayName || "").trim(),
        profileImage: String(sellerProfile?.profileImage || "").trim(),
      },
      ...(customizationPayload && Object.keys(customizationPayload).length > 0
        ? { customization: customizationPayload }
        : {}),
    };
  };

  const addCurrentItemToCart = () => {
    addToCart(buildCurrentCheckoutItem());
  };

  const toRecommendationCartItem = (item) => ({
    id: item?._id || item?.id,
    name: item?.name,
    price: Number(item?.price || 0),
    mrp: Number(item?.mrp || 0),
    isCustomizable: Boolean(item?.isCustomizable),
    category: item?.category,
    deliveryMinDays: Number(item?.deliveryMinDays || 0),
    deliveryMaxDays: Number(item?.deliveryMaxDays || 0),
    image: getProductImage(item || {}),
    seller: {
      id: String(item?.seller?._id || item?.seller?.id || "").trim(),
      name: String(item?.seller?.name || "").trim(),
      storeName: String(item?.seller?.storeName || "").trim(),
      profileImage: String(item?.seller?.profileImage || "").trim(),
    },
  });

  return (
    <div className="page product-detail-page">
      <Header />
      <div className="pdp-breadcrumb">
        <Link className="link" to="/products">
          Products
        </Link>
        <span>/</span>
        <span>{product.name}</span>
      </div>

      <div className="pdp-shell">
        <div className="pdp-main-row">
          <aside className="pdp-buy-panel">
            {product.category ? (
              <div className="pdp-head-row">
                <p className="pdp-kicker">{product.category}</p>
              </div>
            ) : null}
            <div className="pdp-hero-strip">
              <div className="pdp-hero-main">
                <div className="pdp-title-stack">
                  <div className="pdp-title-row">
                    <h1 className="pdp-title">{product.name}</h1>
                    <div className="pdp-qty-inline pdp-qty-inline-title">
                      <label htmlFor="qty">Qty</label>
                      <select
                        id="qty"
                        disabled={purchaseDisabled}
                        value={quantity}
                        onChange={(event) => setQuantity(Number(event.target.value) || 1)}
                      >
                        {quantityChoices.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="pdp-rating-row">
                    <span className="pdp-rating-copy">Sold by {sellerDisplayName}</span>
                    <span className="pdp-rating-copy">
                      {isCustomizationEnabled ? "Customizable" : "Ready-made"}
                    </span>
                  </div>
                </div>

                <div className="pdp-option-group pdp-include-compact">
                  <p className="pdp-option-label">What's included</p>
                  {hamperIncludes.length > 0 ? (
                    <ul className="pdp-inside-list">
                      {hamperIncludes.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="field-hint">Seller has not added inside-item details yet.</p>
                  )}
                  {detailPoints.length > 0 && (
                    <ul className="pdp-detail-list pdp-detail-list-compact">
                      {detailPoints.map((point, index) => (
                        <li key={`${point}-${index}`}>{point}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="pdp-hero-price">
                <p className="pdp-price-display">₹{formatPrice(displayHamperPrice)}/-</p>
                <div className="pdp-price-meta-card">
                  {hasDiscount ? (
                    <p className="pdp-mrp-discount-line">
                      <span>-{discountPercent}%</span> off on M.R.P. ₹{formatPrice(mrp)}
                    </p>
                  ) : (
                    <p className="pdp-mrp-discount-line">M.R.P. ₹{formatPrice(unitPrice)}</p>
                  )}
                  {isCustomizationEnabled &&
                  hasCustomizationSelection &&
                  baseMakingCharge > 0 &&
                  !hasChargeablePackagingStyle ? (
                    <p>+ ₹{formatPrice(baseMakingCharge)} customization charge</p>
                  ) : (
                    <p>Inclusive of all taxes</p>
                  )}
                  {isCustomizationEnabled &&
                    hasCustomizationSelection &&
                    selectedPackagingCharge > 0 && (
                    <p>+ ₹{formatPrice(selectedPackagingCharge)} packaging style</p>
                  )}
                  <p className="pdp-price-meta-sub">
                    {deliveryWindowText
                      ? `Delivery in ${deliveryWindowText}`
                      : "Delivery timeline by seller"}
                  </p>
                </div>
              </div>

              <figure className="pdp-side-preview" aria-label="Product preview">
                <img src={activeImage} alt={`${product.name} small preview`} loading="lazy" />
                <button
                  className={`pdp-wishlist-icon ${isWishlisted ? "active" : ""}`}
                  type="button"
                  aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
                  aria-pressed={isWishlisted}
                  onClick={() => {
                    if (!requireLogin()) return;
                    const nextList = toggleWishlist({
                      id: product._id,
                      name: product.name,
                      price: product.price,
                      category: product.category,
                      image: getProductImage(product),
                    });
                    const activeProductId = String(product?._id || "").trim();
                    const added = nextList.some(
                      (entry) =>
                        String(entry?.id || entry?._id || "").trim() === activeProductId
                    );
                    setIsWishlisted(added);
                    setWishlistNotice(added ? "Added to wishlist" : "Removed from wishlist");
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M12 20.5 4.8 13.6a4.8 4.8 0 0 1 6.8-6.8L12 7.2l.4-.4a4.8 4.8 0 0 1 6.8 6.8L12 20.5Z"
                      fill={isWishlisted ? "currentColor" : "none"}
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                {wishlistNotice && (
                  <span className="pdp-wishlist-note" role="status" aria-live="polite">
                    {wishlistNotice}
                  </span>
                )}
              </figure>
            </div>

            <div className="pdp-divider" />

          {isCustomizationEnabled && (
            <div className="pdp-top-options">
              <div className="pdp-option-group">
                <div className="pdp-option-head">
                  <p className="pdp-option-label">Best for occasion</p>
                  <span
                    className={`status-pill ${
                      isOutOfStock ? "locked" : "available"
                    } pdp-stock-inline`}
                  >
                    {isOutOfStock ? "Out of stock" : `${availableStock} in stock`}
                  </span>
                </div>
                {occasionOptions.length > 0 ? (
                  <div className="pdp-chip-row">
                    {occasionOptions.map((occasion) => (
                      <button
                        key={occasion}
                        type="button"
                        className={`pdp-choice-chip ${
                          selectedOccasion === occasion ? "active" : ""
                        }`}
                      onClick={() =>
                        setSelectedOccasion((prev) => (prev === occasion ? "" : occasion))
                      }
                      >
                        {occasion}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="field-hint">Seller has not added occasion tags yet.</p>
                )}
              </div>

              <div className="pdp-option-group pdp-gift-note-inline">
                <div className="pdp-option-head">
                  <p className="pdp-option-label">Gift message</p>
                  <span className="pdp-size-help">{normalizedGiftNote.length}/180</span>
                </div>
                <textarea
                  className="pdp-note-input"
                  placeholder="Add a short message for the wish card"
                  maxLength={180}
                  value={giftNote}
                  onChange={(event) => setGiftNote(event.target.value)}
                />
              </div>

              <div className="pdp-option-group pdp-pack-inline">
                <div className="pdp-option-head pdp-pack-head">
                  <p className="pdp-option-label">Packaging style</p>
                </div>
                {packagingStyles.length > 0 ? (
                  <div className="pdp-wrap-grid pdp-wrap-grid-inline">
                    {packagingStyles.map((style) => (
                      <button
                        key={style.id}
                        type="button"
                      className={`pdp-wrap-card ${
                        selectedPackagingId === style.id ? "active" : ""
                      }`}
                      onClick={() =>
                        setSelectedPackagingId((prev) => (prev === style.id ? "" : style.id))
                      }
                    >
                        <span
                          className={`pdp-wrap-radio ${
                            selectedPackagingId === style.id ? "active" : ""
                          }`}
                          aria-hidden="true"
                        />
                        <strong>{style.title}</strong>
                        {style.detail ? <span>{style.detail}</span> : null}
                        {Number(style.extraCharge || 0) > 0 && (
                          <span>+₹{formatPrice(style.extraCharge)}</span>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="field-hint">Seller has not added packaging styles yet.</p>
                )}
              </div>
            </div>
          )}

          <div className="pdp-divider" />

          {isCustomizationEnabled && (
            <div className="pdp-action-row-right">
              <div className="pdp-inline-seller">
                <div className="pdp-inline-seller-top">
                  <div className="pdp-inline-seller-identity">
                    <div className="pdp-inline-seller-avatar" aria-hidden="true">
                      {sellerProfileImage ? (
                        <img src={sellerProfileImage} alt="" />
                      ) : (
                        String(sellerDisplayName || "S").trim().charAt(0).toUpperCase() || "S"
                      )}
                    </div>
                    <p className="pdp-inline-seller-name">{sellerDisplayName}</p>
                  </div>
                  <button
                    className="pdp-inline-seller-link"
                    type="button"
                    onClick={() => navigate(`/store/${sellerId}`)}
                    disabled={!sellerId}
                  >
                    <span aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path
                          d="M4 7h16M6 7l1 12h10l1-12M9 11h6"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                    Visit store
                  </button>
                </div>
                {sellerAbout ? (
                  <p className="pdp-inline-seller-about">{sellerAbout}</p>
                ) : null}
              </div>

              <div className="pdp-action-row-buttons">
                <button
                  className="pdp-btn pdp-btn-primary"
                  type="button"
                  disabled={purchaseDisabled}
                  onClick={() => {
                    if (isSellerAccount) {
                      setNotice("Seller account cannot place orders.");
                      return;
                    }
                    if (!requireLogin()) return;
                    addCurrentItemToCart();
                    setNotice("Added to cart");
                  }}
                >
                  {isOutOfStock ? "Out of stock" : "Add to cart"}
                </button>
                <button
                  className="pdp-btn pdp-btn-outline"
                  type="button"
                  disabled={purchaseDisabled}
                  onClick={() => {
                    if (isSellerAccount) {
                      setNotice("Seller account cannot place orders.");
                      return;
                    }
                    if (!requireLogin()) return;
                    navigate("/checkout", {
                      state: { buyNowItem: buildCurrentCheckoutItem() },
                    });
                  }}
                >
                  Gift now
                </button>
                <button
                  className="pdp-btn pdp-btn-outline"
                  type="button"
                  onClick={() => navigate(`/customize/${product._id}`)}
                >
                  Customize
                </button>
              </div>
            </div>
          )}

          {!showInlineStockWithOccasion && (
            <div className="pdp-price-row">
              <span className={`status-pill ${isOutOfStock ? "locked" : "available"}`}>
                {isOutOfStock ? "Out of stock" : `${availableStock} in stock`}
              </span>
            </div>
          )}
          {isSellerAccount && (
            <p className="pdp-note">Seller account cannot place orders. Use a customer account.</p>
          )}

          {!isCustomizationEnabled && (
            <div className="pdp-action-stack tight">
              <button
                className="pdp-btn pdp-btn-primary"
                type="button"
                disabled={purchaseDisabled}
                onClick={() => {
                  if (isSellerAccount) {
                    setNotice("Seller account cannot place orders.");
                    return;
                  }
                  if (!requireLogin()) return;
                  addCurrentItemToCart();
                  setNotice("Added to cart");
                }}
              >
                {isOutOfStock ? "Out of stock" : "Add hamper to cart"}
              </button>
              <button
                className="pdp-btn pdp-btn-outline"
                type="button"
                disabled={purchaseDisabled}
                onClick={() => {
                  if (isSellerAccount) {
                    setNotice("Seller account cannot place orders.");
                    return;
                  }
                  if (!requireLogin()) return;
                  navigate("/checkout", {
                    state: { buyNowItem: buildCurrentCheckoutItem() },
                  });
                }}
              >
                Gift now
              </button>
            </div>
          )}

          {notice && (
            <p className="pdp-notice" role="status" aria-live="polite">
              {notice}
            </p>
          )}

          </aside>
        </div>

        {recommendations.length > 0 && (
          <section className="cart-reco-section pdp-reco-section" aria-label="You may also like">
            <div className="cart-reco-head">
              <h3>You may also like</h3>
            </div>
            <div className="cart-reco-rail">
              <button
                type="button"
                className="cart-reco-side-btn left"
                aria-label="Previous recommendation"
                onClick={() => handleRecoArrow(-1)}
                disabled={recommendations.length <= 1}
              >
                &#8249;
              </button>
              <div className="cart-reco-carousel">
                <div className="cart-reco-row">
                  {visibleRecommendations.map((item) => (
                    <article key={item?._id || item?.id} className="cart-reco-card">
                      <button
                        type="button"
                        className="cart-reco-image-btn"
                        onClick={() =>
                          navigate(item?._id ? `/products/${item._id}` : "/products")
                        }
                      >
                        <img
                          className="cart-reco-thumb"
                          src={getProductImage(item)}
                          alt={item?.name}
                          loading="lazy"
                        />
                      </button>
                      <h4>{item?.name}</h4>
                      <p>₹{formatPrice(item?.price)}</p>
                      <button
                        className="cart-reco-add-btn"
                        type="button"
                        onClick={() => {
                          if (isSellerAccount) {
                            setNotice(
                              "Seller account cannot place orders. Use a customer account."
                            );
                            return;
                          }
                          addToCart(toRecommendationCartItem(item));
                          setNotice("Added to cart");
                        }}
                        disabled={isSellerAccount}
                      >
                        Add to cart
                      </button>
                    </article>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="cart-reco-side-btn right"
                aria-label="Next recommendation"
                onClick={() => handleRecoArrow(1)}
                disabled={recommendations.length <= 1}
              >
                &#8250;
              </button>
            </div>
          </section>
        )}
      </div>

    </div>
  );
}
