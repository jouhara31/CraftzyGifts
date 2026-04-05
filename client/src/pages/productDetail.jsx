import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Header from "../components/Header";
import ProductHoverImage from "../components/ProductHoverImage";
import { addToCart } from "../utils/cart";
import { getWishlist, toggleWishlist } from "../utils/wishlist";
import { saveBuyNowCheckoutItem } from "../utils/buyNowCheckout";
import { getProductImage, getProductImages } from "../utils/productMedia";
import { getCachedProductDetail, loadProductDetail } from "../utils/productDetailCache";
import {
  getPurchaseBlockedMessage,
  isPurchaseBlockedRole,
  readStoredSessionClaims,
} from "../utils/authRoute";
import { hasActiveSession } from "../utils/authSession";
import {
  loadSellerStore as loadCachedSellerStore,
  prefetchSellerStore,
} from "../utils/sellerStoreCache";

import { API_URL } from "../apiBase";
const SELLER_STORE_SUMMARY_OPTIONS = {
  includeProducts: false,
  includeFeedbacks: false,
  includeProductRatings: false,
};
const SELLER_STORE_PREFETCH_OPTIONS = {
  limit: 60,
  includeProducts: true,
  includeFeedbacks: false,
  includeProductRatings: true,
};

const parsePrice = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatPrice = (value) => Number(value || 0).toLocaleString("en-IN");
const toStarText = (value) => {
  const safe = Math.min(5, Math.max(0, Math.round(Number(value) || 0)));
  return "★".repeat(safe).padEnd(5, "☆");
};
const formatReviewDate = (value) => {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
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

const normalizeProductVariants = (variants = []) =>
  (Array.isArray(variants) ? variants : [])
    .map((variant, index) => {
      const id = String(variant?.id || `variant_${index + 1}`).trim();
      if (!id || variant?.active === false) return null;
      return {
        id,
        size: String(variant?.size || "").trim(),
        color: String(variant?.color || "").trim(),
        material: String(variant?.material || "").trim(),
        sku: String(variant?.sku || "").trim(),
        price: Number(variant?.price || 0),
        stock: Math.max(0, Number(variant?.stock || 0)),
      };
    })
    .filter(Boolean);

const buildVariantLabel = (variant = {}) =>
  [variant?.size, variant?.color, variant?.material]
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)
    .join(" / ");

const getVariantUnitPrice = (product = {}, variant = null) => {
  if (variant && Number.isFinite(Number(variant?.price)) && Number(variant.price) > 0) {
    return Number(variant.price);
  }
  return parsePrice(product?.price);
};

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
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [giftNote, setGiftNote] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [catalogPool, setCatalogPool] = useState([]);
  const [recoVisibleCount, setRecoVisibleCount] = useState(getRecoVisibleCount);
  const [recoStartIndex, setRecoStartIndex] = useState(0);
  const [notice, setNotice] = useState("");
  const [wishlistNotice, setWishlistNotice] = useState("");
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [sessionClaims, setSessionClaims] = useState(() => readStoredSessionClaims());
  const navigate = useNavigate();
  const userRole = sessionClaims.role;
  const isPurchaseBlocked = isPurchaseBlockedRole(userRole);
  const purchaseBlockedMessage = getPurchaseBlockedMessage(userRole);

  const requireLogin = () => {
    if (!hasActiveSession() || sessionClaims.isExpired) {
      navigate("/login");
      return false;
    }
    return true;
  };

  useEffect(() => {
    let ignore = false;
    const cachedProduct = getCachedProductDetail(id);
    const hasCachedProduct = Boolean(cachedProduct);

    if (hasCachedProduct) {
      setProduct(cachedProduct);
      setActiveImageIndex(0);
      setGiftNote("");
      setLoadError("");
      setLoading(false);
    }

    const load = async () => {
      if (!hasCachedProduct) {
        setLoading(true);
      }
      setLoadError("");
      try {
        const data = await loadProductDetail(id, { includeFeedback: true, feedbackLimit: 6 });
        if (ignore) return;
        setProduct(data);
        setActiveImageIndex(0);
        setGiftNote("");
      } catch (error) {
        if (ignore) return;
        if (!hasCachedProduct) {
          setProduct(null);
          setLoadError(error?.message || "Unable to load product right now.");
        }
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
        const params = new URLSearchParams({
          page: "1",
          limit: "24",
          sort: "newest",
        });
        const res = await fetch(`${API_URL}/api/products?${params.toString()}`);
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
    const syncSessionClaims = () => setSessionClaims(readStoredSessionClaims());
    window.addEventListener("user:updated", syncSessionClaims);
    return () => window.removeEventListener("user:updated", syncSessionClaims);
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
  const isBuildYourOwnEnabled = Boolean(product?.buildYourOwnEnabled ?? product?.isCustomizable);
  const baseMakingCharge = Number(product?.makingCharge || 0);
  const readyMadeVariants = useMemo(
    () => normalizeProductVariants(product?.variants),
    [product]
  );
  const hasSelectableVariants = readyMadeVariants.length > 0;
  const selectedVariant = useMemo(
    () => readyMadeVariants.find((variant) => variant.id === selectedVariantId) || null,
    [readyMadeVariants, selectedVariantId]
  );
  const variantSelectionPending = hasSelectableVariants && !selectedVariant;
  const availableStock = hasSelectableVariants
    ? selectedVariant
      ? Math.max(0, Number(selectedVariant.stock || 0))
      : Math.max(0, Number(product?.stock || 0))
    : Math.max(0, Number(product?.stock || 0));
  const isOutOfStock = availableStock <= 0;
  const maxQuantity = Math.max(1, availableStock);
  const purchaseDisabled = isOutOfStock || isPurchaseBlocked || variantSelectionPending;

  useEffect(() => {
    setQuantity((prev) => Math.max(1, Math.min(prev, maxQuantity)));
  }, [maxQuantity]);

  const galleryImages = useMemo(() => getProductImages(product || {}), [product]);

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

  useEffect(() => {
    setActiveImageIndex(0);
  }, [product?._id]);

  useEffect(() => {
    const ids = readyMadeVariants.map((variant) => variant.id);
    setSelectedVariantId((prev) => {
      if (ids.includes(prev)) return prev;
      return readyMadeVariants.length === 1 ? readyMadeVariants[0].id : "";
    });
  }, [readyMadeVariants]);

  const quantityChoices = Array.from(
    { length: Math.min(Math.max(maxQuantity, 1), 10) },
    (_, index) => index + 1
  );

  const sellerName = product?.seller?.storeName || product?.seller?.name || "";
  const sellerId = String(product?.seller?._id || product?.seller || "").trim();
  const sellerProfile =
    sellerStoreData?.seller && typeof sellerStoreData.seller === "object"
      ? sellerStoreData.seller
      : product?.seller || {};
  const sellerDisplayName = sellerProfile?.storeName || sellerProfile?.name || sellerName || "Seller";
  const sellerAbout = String(sellerProfile?.about || "").trim();
  const sellerDisplayRating = Number(
    sellerStoreData?.stats?.displayRating || sellerStoreData?.stats?.avgRating || 0
  );
  const sellerRatingCount = Number(
    sellerStoreData?.stats?.verifiedFeedbacks || sellerStoreData?.stats?.totalFeedbacks || 0
  );
  const sellerProductCount = Number(
    sellerStoreData?.stats?.totalProducts || sellerStoreData?.products?.length || 0
  );
  const productReviewStats =
    product?.reviewStats && typeof product.reviewStats === "object"
      ? product.reviewStats
      : {};
  const productReviewDisplayRating = Number(
    productReviewStats?.displayRating || productReviewStats?.avgRating || 0
  );
  const productReviewCount = Number(
    productReviewStats?.verifiedFeedbacks || productReviewStats?.totalFeedbacks || 0
  );
  const productRatingBreakdown =
    productReviewStats?.ratingBreakdown && typeof productReviewStats.ratingBreakdown === "object"
      ? productReviewStats.ratingBreakdown
      : {};
  const productFeedbackRows = Array.isArray(product?.feedbacks)
    ? product.feedbacks.slice(0, 6)
    : [];
  const sellerProfileImageRaw = String(sellerProfile?.profileImage || "").trim();
  const sellerProfileImage =
    sellerProfileImageRaw &&
    (sellerProfileImageRaw.startsWith("http://") ||
    sellerProfileImageRaw.startsWith("https://") ||
    sellerProfileImageRaw.startsWith("data:")
      ? sellerProfileImageRaw
      : `${API_URL}/${sellerProfileImageRaw.replace(/^\/+/, "")}`);
  const unitPrice = hasSelectableVariants
    ? getVariantUnitPrice(product, selectedVariant)
    : parsePrice(product?.price);
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
  const showInlineStockWithOccasion = occasionOptions.length > 0 && isOutOfStock;

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
  const hasOrderPreferences = Boolean(
    selectedOccasion || selectedPackagingId || normalizedGiftNote.length > 0
  );
  const selectedPackagingCharge = Math.max(0, Number(selectedPackagingStyle?.extraCharge || 0));
  const hasChargeablePackagingStyle = selectedPackagingCharge > 0;
  const effectiveCustomizationCharge = isCustomizationEnabled
    ? hasOrderPreferences
      ? hasChargeablePackagingStyle
        ? selectedPackagingCharge
        : Math.max(0, baseMakingCharge)
      : 0
    : selectedPackagingCharge;
  const displayHamperPrice = unitPrice + selectedPackagingCharge;
  const selectedVariantLabel = buildVariantLabel(selectedVariant);

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

    const hydrateSellerStore = async () => {
      if (!sellerId) {
        if (!ignore) {
          setSellerStoreData({ seller: null, products: [], stats: null });
        }
        return;
      }

      try {
        const data = await loadCachedSellerStore(sellerId, {
          ...SELLER_STORE_SUMMARY_OPTIONS,
          authenticated: hasActiveSession(),
        });
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

    hydrateSellerStore();
    return () => {
      ignore = true;
    };
  }, [sellerId]);

  const prefetchSellerStorePage = () => {
    if (!sellerId) return;
    prefetchSellerStore(sellerId, {
      ...SELLER_STORE_PREFETCH_OPTIONS,
      authenticated: hasActiveSession(),
    });
  };

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
    const preferenceNotes = [];
    if (selectedOccasion) {
      preferenceNotes.push(`Occasion: ${selectedOccasion}`);
    }
    if (selectedPackagingStyle?.title) {
      preferenceNotes.push(`Packaging: ${selectedPackagingStyle.title}`);
    }
    const customizationPreferenceNote = preferenceNotes.join(" | ");

    const totalCustomizationCharge = effectiveCustomizationCharge;

    const customizationPayload = hasOrderPreferences
      ? {
          ...(normalizedGiftNote ? { wishCardText: normalizedGiftNote } : {}),
          ...(customizationPreferenceNote
            ? { specialNote: customizationPreferenceNote }
            : {}),
          ...(selectedOccasion ? { selectedOccasion } : {}),
          ...(selectedPackagingStyle?.id
            ? { packagingStyleId: selectedPackagingStyle.id }
            : {}),
          ...(selectedPackagingStyle?.title
            ? { packagingStyleTitle: selectedPackagingStyle.title }
            : {}),
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
      buildYourOwnEnabled: isBuildYourOwnEnabled,
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
      ...(selectedVariant
        ? {
            variantId: selectedVariant.id,
            selectedVariant: {
              id: selectedVariant.id,
              size: selectedVariant.size,
              color: selectedVariant.color,
              material: selectedVariant.material,
              sku: selectedVariant.sku,
              price: getVariantUnitPrice(product, selectedVariant),
              label: selectedVariantLabel,
            },
          }
        : {}),
      ...(customizationPayload && Object.keys(customizationPayload).length > 0
        ? { customization: customizationPayload }
        : {}),
    };
  };

  const addCurrentItemToCart = () => {
    addToCart(buildCurrentCheckoutItem());
  };

  const handleAddCurrentItemToCart = () => {
    if (variantSelectionPending) {
      setNotice("Select a product variant before adding this item to cart.");
      return;
    }
    if (!guardPurchaseAction()) return;
    addCurrentItemToCart();
    setNotice("Added to cart");
  };

  const handleGiftNow = () => {
    if (variantSelectionPending) {
      setNotice("Select a product variant before continuing to checkout.");
      return;
    }
    if (!guardPurchaseAction()) return;
    const nextCheckoutItem = buildCurrentCheckoutItem();
    saveBuyNowCheckoutItem(nextCheckoutItem);
    navigate("/checkout", {
      state: { buyNowItem: nextCheckoutItem },
    });
  };

  const handleOpenCustomization = () => {
    if (isPurchaseBlocked) {
      setNotice(purchaseBlockedMessage);
      return;
    }
    if (!sellerId) {
      setNotice("Store details are unavailable right now. Please try customization again shortly.");
      return;
    }
    navigate(`/customize/seller/${sellerId}?productId=${product._id}`);
  };

  const handleOpenBuildYourOwnHamper = () => {
    if (isPurchaseBlocked) {
      setNotice(purchaseBlockedMessage);
      return;
    }
    if (!sellerId) {
      setNotice("Store details are unavailable right now. The hamper builder will be back shortly.");
      return;
    }
    if (!isBuildYourOwnEnabled) {
      setNotice("Build your own hamper is not enabled for this product.");
      return;
    }
    const params = new URLSearchParams();
    params.set("mode", "build");
    params.set("productId", product._id);
    navigate(`/customize/seller/${sellerId}?${params.toString()}`);
  };

  const guardPurchaseAction = () => {
    if (isPurchaseBlocked) {
      setNotice(purchaseBlockedMessage);
      return false;
    }
    if (!requireLogin()) return false;
    return true;
  };

  const toRecommendationCartItem = (item) => {
    const variants = normalizeProductVariants(item?.variants);
    const preferredVariant = variants.length === 1 ? variants[0] : null;
    return {
      id: item?._id || item?.id,
      name: item?.name,
      price: preferredVariant
        ? getVariantUnitPrice(item, preferredVariant)
        : Number(item?.price || 0),
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
      ...(preferredVariant
        ? {
            variantId: preferredVariant.id,
            selectedVariant: {
              id: preferredVariant.id,
              size: preferredVariant.size,
              color: preferredVariant.color,
              material: preferredVariant.material,
              sku: preferredVariant.sku,
              price: getVariantUnitPrice(item, preferredVariant),
              label: buildVariantLabel(preferredVariant),
            },
          }
        : {}),
    };
  };

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
                    {sellerRatingCount > 0 ? (
                      <span className="pdp-rating-copy">
                        {sellerDisplayRating.toFixed(1)} ★ ({sellerRatingCount} ratings)
                      </span>
                    ) : (
                      <span className="pdp-rating-copy">No ratings yet</span>
                    )}
                    <span className="pdp-rating-copy">
                      {isCustomizationEnabled && isBuildYourOwnEnabled
                        ? "Custom + Build"
                        : isCustomizationEnabled
                          ? "Customizable"
                          : isBuildYourOwnEnabled
                            ? "Build-your-own"
                            : "Ready-made"}
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
                    <p className="field-hint">Inside-item details will appear here soon.</p>
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
                  hasOrderPreferences &&
                  baseMakingCharge > 0 &&
                  !hasChargeablePackagingStyle ? (
                    <p>+ ₹{formatPrice(baseMakingCharge)} customization charge</p>
                  ) : (
                    <p>Inclusive of all taxes</p>
                  )}
                  {selectedPackagingCharge > 0 && (
                    <p>+ ₹{formatPrice(selectedPackagingCharge)} packaging style</p>
                  )}
                  <p className="pdp-price-meta-sub">
                    {deliveryWindowText
                      ? `Delivery in ${deliveryWindowText}`
                      : "Delivery timeline will be confirmed soon"}
                  </p>
                </div>
              </div>

              <figure
                className={`pdp-side-preview ${
                  galleryImages.length > 1 ? "has-gallery-thumbs" : ""
                }`}
                aria-label="Product preview"
              >
                <div className="pdp-side-preview-main">
                  <img src={activeImage} alt={`${product.name} preview`} loading="lazy" />
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
                </div>
                {galleryImages.length > 1 ? (
                  <div className="pdp-side-preview-thumbs" aria-label="Product image thumbnails">
                    {galleryImages.map((image, index) => (
                      <button
                        key={`${image}-${index}`}
                        type="button"
                        className={`pdp-thumb-btn ${safeImageIndex === index ? "active" : ""}`}
                        onClick={() => setActiveImageIndex(index)}
                        aria-label={`Show image ${index + 1}`}
                        aria-pressed={safeImageIndex === index}
                      >
                        <img src={image} alt={`${product.name} thumbnail ${index + 1}`} />
                      </button>
                    ))}
                  </div>
                ) : null}
              </figure>
            </div>

            <div className="pdp-divider" />

          <div className="pdp-top-options">
            {hasSelectableVariants ? (
              <div className="pdp-option-group">
                <div className="pdp-option-head">
                  <p className="pdp-option-label">Choose variant</p>
                  <span className="pdp-size-help">
                    {selectedVariant
                      ? `${Math.max(0, Number(selectedVariant.stock || 0))} in stock`
                      : "Select one to continue"}
                  </span>
                </div>
                <div className="pdp-variant-grid">
                  {readyMadeVariants.map((variant) => {
                    const variantLabel = buildVariantLabel(variant);
                    const selected = selectedVariantId === variant.id;
                    return (
                      <button
                        key={variant.id}
                        type="button"
                        className={`pdp-variant-card ${selected ? "active" : ""}`}
                        onClick={() =>
                          setSelectedVariantId((prev) => (prev === variant.id ? "" : variant.id))
                        }
                      >
                        <strong>{variantLabel || variant.sku || `Variant ${variant.id}`}</strong>
                        <span>
                          SKU: {variant.sku || "Not set"} • {Math.max(0, Number(variant.stock || 0))} left
                        </span>
                        <span>₹{formatPrice(getVariantUnitPrice(product, variant))}</span>
                      </button>
                    );
                  })}
                </div>
                {variantSelectionPending ? (
                  <p className="field-hint">
                    Choose a size, color, or material option before adding this item to cart.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="pdp-option-group">
              <div className="pdp-option-head">
                <p className="pdp-option-label">Best for occasion</p>
                {isOutOfStock ? (
                  <span className="status-pill locked pdp-stock-inline">Out of stock</span>
                ) : null}
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
                <p className="field-hint">Occasion ideas will appear here soon.</p>
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
                <p className="field-hint">Packaging styles will appear here soon.</p>
              )}
            </div>
          </div>

          <div className="pdp-divider" />

          {!showInlineStockWithOccasion && isOutOfStock && (
            <div className="pdp-price-row">
              <span className="status-pill locked">Out of stock</span>
            </div>
          )}

          <div className="pdp-divider" />

          <div className="pdp-lower-grid">
            <section className="pdp-product-review-block" aria-label="Customer reviews">
              <div className="card-head">
                <p className="card-title">Customer reviews</p>
                <span className="chip">{productReviewCount} ratings</span>
              </div>
              {productReviewCount > 0 ? (
                <>
                  <p className="pdp-product-review-rating">
                    <span
                      className="rating-stars"
                      role="img"
                      aria-label={`${productReviewDisplayRating.toFixed(1)} out of 5`}
                    >
                      {toStarText(productReviewDisplayRating)}
                    </span>
                    <strong>{productReviewDisplayRating.toFixed(1)}/5</strong>
                    <span>{productReviewCount} verified ratings</span>
                  </p>
                  <div className="pdp-product-review-breakdown">
                    {[5, 4, 3, 2, 1].map((star) => {
                      const row =
                        productRatingBreakdown?.[star] ||
                        productRatingBreakdown?.[String(star)] ||
                        {};
                      const count = Number(typeof row === "number" ? row : row?.count || 0);
                      const share = Number(typeof row === "number" ? 0 : row?.share || 0);
                      return (
                        <p key={`pdp-rating-${star}`}>
                          <strong>{star}★:</strong> {count}{" "}
                          {Number.isFinite(share) && share > 0 ? `(${share.toFixed(1)}%)` : ""}
                        </p>
                      );
                    })}
                  </div>
                  {productFeedbackRows.length > 0 ? (
                    <div className="pdp-product-review-list">
                      {productFeedbackRows.map((entry, index) => {
                        const reviewImages = normalizeReviewImages(entry?.images);
                        return (
                          <article
                            key={entry?.id || `${entry?.customerName || "customer"}-${index}`}
                            className="pdp-product-review-item"
                          >
                            <p className="pdp-product-review-head">
                              <strong>{entry?.customerName || "Customer"}</strong>
                              <span
                                className="rating-stars"
                                role="img"
                                aria-label={`${Number(entry?.rating || 0)} out of 5`}
                              >
                                {toStarText(entry?.rating)}
                              </span>
                            </p>
                            <p className="field-hint">
                              Verified purchase • {formatReviewDate(entry?.createdAt)}
                            </p>
                            {entry?.comment ? (
                              <p>{entry.comment}</p>
                            ) : (
                              <p className="field-hint">No written review.</p>
                            )}
                            {reviewImages.length > 0 ? (
                              <div className="pdp-product-review-images">
                                {reviewImages.map((image, imageIndex) => (
                                  <img
                                    key={`${entry?.id || index}-review-image-${imageIndex}`}
                                    src={image}
                                    alt={`Customer review image ${imageIndex + 1}`}
                                    loading="lazy"
                                  />
                                ))}
                              </div>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="field-hint">No reviews for this product yet.</p>
              )}
            </section>

            <aside className="pdp-side-rail" aria-label="Purchase actions and store details">
              <div className="pdp-side-card pdp-side-action-card">
                <div className="pdp-action-row-buttons-stack">
                  <button
                    className="pdp-btn pdp-btn-primary"
                    type="button"
                    disabled={purchaseDisabled}
                    onClick={handleAddCurrentItemToCart}
                  >
                    {variantSelectionPending
                      ? "Select variant"
                      : isOutOfStock
                      ? "Out of stock"
                      : isCustomizationEnabled
                        ? "Add to cart"
                        : "Add hamper to cart"}
                  </button>
                  <button
                    className="pdp-btn pdp-btn-outline"
                    type="button"
                    disabled={purchaseDisabled}
                    onClick={handleGiftNow}
                  >
                    Gift now
                  </button>
                  {isCustomizationEnabled && (
                    <button
                      className="pdp-btn pdp-btn-outline"
                      type="button"
                      disabled={isPurchaseBlocked || !sellerId}
                      onClick={handleOpenCustomization}
                    >
                      Customize
                    </button>
                  )}
                </div>
                {sellerId && isBuildYourOwnEnabled && (
                  <div className="pdp-build-helper">
                    <span>Want a fully custom hamper?</span>
                    <button
                      className="pdp-build-helper-link"
                      type="button"
                      disabled={isPurchaseBlocked || !sellerId}
                      onClick={handleOpenBuildYourOwnHamper}
                    >
                      Build your own
                    </button>
                  </div>
                )}
                {isPurchaseBlocked && (
                  <p className="pdp-note">{purchaseBlockedMessage}</p>
                )}
                {notice && (
                  <p className="pdp-notice" role="status" aria-live="polite">
                    {notice}
                  </p>
                )}
              </div>

              <section className="pdp-seller-card" aria-label="Store details">
                {sellerProductCount > 0 ? (
                  <div className="card-head">
                    <span className="chip">{sellerProductCount} products</span>
                  </div>
                ) : null}
                <div className="pdp-seller-head">
                  <div className="pdp-seller-avatar" aria-hidden="true">
                    {sellerProfileImage ? (
                      <img src={sellerProfileImage} alt="" />
                    ) : (
                      String(sellerDisplayName || "S").trim().charAt(0).toUpperCase() || "S"
                    )}
                  </div>
                  <div>
                    <h3>{sellerDisplayName}</h3>
                    <p className="field-hint">
                      {sellerRatingCount > 0
                        ? `${sellerDisplayRating.toFixed(1)}★ from ${sellerRatingCount} ratings`
                        : "Customer ratings will appear here soon"}
                    </p>
                  </div>
                </div>
                {sellerAbout ? (
                  <p className="pdp-seller-about">{sellerAbout}</p>
                ) : (
                  <p className="pdp-seller-about">A thoughtfully curated gifting studio on CraftzyGifts.</p>
                )}
                <div className="pdp-seller-meta">
                  <p>
                    <span className="pdp-mini-icon" aria-hidden="true">
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
                    {sellerProductCount > 0
                      ? `${sellerProductCount} products in this store`
                      : "Store products available"}
                  </p>
                  <p>
                    <span className="pdp-mini-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path
                          d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    {deliveryWindowText
                      ? `Delivery in ${deliveryWindowText}`
                      : "Delivery timeline will be confirmed soon"}
                  </p>
                </div>
                <button
                  className="pdp-btn pdp-btn-outline pdp-store-visit-btn"
                  type="button"
                  onClick={() => navigate(`/store/${sellerId}`)}
                  onMouseEnter={prefetchSellerStorePage}
                  onFocus={prefetchSellerStorePage}
                  onTouchStart={prefetchSellerStorePage}
                  disabled={!sellerId}
                >
                  View store
                </button>
              </section>
            </aside>
          </div>

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
                        <ProductHoverImage
                          className="cart-reco-thumb"
                          product={item}
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
                          if (!guardPurchaseAction()) return;
                          addToCart(toRecommendationCartItem(item));
                          setNotice("Added to cart");
                        }}
                        disabled={isPurchaseBlocked}
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
