import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import Header from "../components/Header";
import CustomizationPanel from "../components/customizationPanel";
import { getProductImage } from "../utils/productMedia";
import { optimizeImageFiles } from "../utils/imageUpload";
import { clearBuyNowCheckoutItem } from "../utils/buyNowCheckout";
import { addToCart, getCart, setCustomization } from "../utils/cart";
import {
  buildBaseSelectionSummary,
  buildAddonItemSummary,
  isBulkHamperCustomization,
  formatBaseSelectionLabel,
} from "../utils/hamperBuildSummary";
import {
  getPurchaseBlockedMessage,
  isPurchaseBlockedRole,
  readStoredSessionClaims,
} from "../utils/authRoute";
import { hasActiveSession } from "../utils/authSession";

import { API_URL } from "../apiBase";
const OPTION_LABELS = {
  giftBoxes: "Gift box",
  chocolates: "Chocolates",
  frames: "Frame style",
  perfumes: "Perfume",
  cards: "Card type",
};
const HIDDEN_EXISTING_OPTION_KEYS = new Set(["custom_hamper_items"]);
const GENERIC_HAMPER_LABEL = "Build Your Own Hamper";
const BASE_CATEGORY_KIND = "base_category";

const roundAmount = (value) => Math.round(Number(value || 0) * 100) / 100;
const formatPrice = (value) => Number(value || 0).toLocaleString("en-IN");
const calculateOfferPercent = (mrp, price) => {
  const livePrice = Number(price || 0);
  const originalPrice = Number(mrp || 0);
  if (!Number.isFinite(livePrice) || !Number.isFinite(originalPrice)) return 0;
  if (originalPrice <= 0 || originalPrice <= livePrice) return 0;
  return Math.round(((originalPrice - livePrice) / originalPrice) * 100);
};
const normalizeItemType = (value) =>
  String(value || "").trim().toLowerCase() === "base" ? "base" : "item";
const normalizeMainItem = (value, fallback = "") => String(value || "").trim() || fallback;
const normalizeSubItem = (value) => String(value || "").trim();
const composeItemName = (mainItem, subItem, fallback = "") =>
  [String(mainItem || "").trim(), String(subItem || "").trim()].filter(Boolean).join(" - ") ||
  fallback;
const describeBaseVariant = (item) =>
  String(item?.subItem || "").trim() || String(item?.size || "").trim();

const getSellerCatalogCategories = (product) =>
  (Array.isArray(product?.customizationCatalog) ? product.customizationCatalog : [])
    .map((category) => ({
      id: String(category?.id || ""),
      label: String(category?.name || "").trim(),
      kind:
        String(category?.kind || "").trim().toLowerCase() === BASE_CATEGORY_KIND
          ? BASE_CATEGORY_KIND
          : "item_collection",
      image: String(category?.image || "").trim(),
      description: String(category?.description || "").trim(),
      items: (Array.isArray(category?.items) ? category.items : [])
        .filter((item) => item?.active !== false)
        .map((item) => {
          const mainItem = normalizeMainItem(item?.mainItem, String(item?.name || "").trim());
          const subItem = normalizeSubItem(item?.subItem);
          const name = composeItemName(mainItem, subItem, String(item?.name || "").trim());
          return {
            id: String(item?.id || ""),
            name,
            mainItem,
            subItem,
            categoryId: String(category?.id || ""),
            type: normalizeItemType(item?.type),
            size: String(item?.size || "").trim(),
            price: Number(item?.price || 0),
            mrp: Number(item?.mrp || 0),
            stock: Number(item?.stock || 0),
            image: String(item?.image || "").trim(),
            source:
              String(item?.source || "").trim().toLowerCase() === "admin" ? "admin" : "custom",
          };
        })
        .filter((item) => item.id && item.name),
    }))
    .filter((category) => category.id && category.label);

const getSellerCatalogItems = (product) =>
  getSellerCatalogCategories(product).flatMap((category) =>
    category.items.map((item) => ({
      ...item,
      category: category.label,
      categoryKind: category.kind,
      categoryImage: category.image,
      categoryDescription: category.description,
    }))
  );

const isBuildEnabledForProduct = (product = {}) =>
  Boolean(product?.buildYourOwnEnabled ?? product?.isCustomizable);

const resolveBuildYourOwnPercent = (product = {}) => {
  const directValue = Number(product?.buildYourOwnPercent);
  if (Number.isFinite(directValue) && directValue >= 0) {
    return directValue;
  }

  const legacyValue = Number(product?.buildYourOwnCharge);
  if (Number.isFinite(legacyValue) && legacyValue >= 0 && legacyValue <= 100) {
    return legacyValue;
  }

  return 0;
};

const getDefaultExistingSelections = () => ({});

const getDefaultExistingCustomization = (product) => ({
  selectedOptions: getDefaultExistingSelections(product),
  wishCardText: "",
  referenceImageUrl: "",
  referenceImageUrls: [],
  specialNote: "",
  ideaDescription: "",
  addGiftWrap: true,
});

const inferSavedMode = (savedCustomization) => {
  if (!savedCustomization || typeof savedCustomization !== "object") return "";
  if (savedCustomization.mode === "existing") return "existing";
  if (savedCustomization.mode === "build_bulk") return "build_bulk";
  if (savedCustomization.mode === "build") return "build";

  const savedItems = Array.isArray(savedCustomization.selectedItems)
    ? savedCustomization.selectedItems
    : [];
  const baseItems = savedItems.filter(
    (item) => String(item?.type || "").trim().toLowerCase() === "base"
  );
  if (
    isBulkHamperCustomization(savedCustomization) ||
    baseItems.length > 1 ||
    baseItems.some((item) => Number(item?.quantity || 0) > 1)
  ) {
    return "build_bulk";
  }
  if (savedItems.length > 0) return "build";

  const savedOptions = savedCustomization.selectedOptions || {};
  if (savedOptions.hamperBase || savedOptions.hamperPackage) return "build";
  if (Object.keys(savedOptions).length > 0) return "existing";

  return "";
};

const getReferenceImages = (customization) => {
  if (!customization) return [];
  if (Array.isArray(customization.referenceImageUrls)) {
    return customization.referenceImageUrls.filter(Boolean).slice(0, 3);
  }
  if (customization.referenceImageUrl) {
    return [customization.referenceImageUrl];
  }
  return [];
};

const isImageReference = (value) => {
  const text = String(value || "").trim();
  if (!text) return false;
  return (
    text.startsWith("data:image/") ||
    text.startsWith("/") ||
    text.startsWith("http://") ||
    text.startsWith("https://")
  );
};

const truncate = (text, size = 44) =>
  text.length > size ? `${text.slice(0, size - 3)}...` : text;
const sanitizeExistingSelections = (selectedOptions) =>
  Object.entries(
    selectedOptions && typeof selectedOptions === "object" ? selectedOptions : {}
  ).reduce((acc, [key, value]) => {
    const normalizedKey = String(key || "").trim().toLowerCase();
    if (HIDDEN_EXISTING_OPTION_KEYS.has(normalizedKey)) return acc;
    acc[key] = value;
    return acc;
  }, {});

export default function Customization() {
  const { id, sellerId: sellerIdParam } = useParams();
  const location = useLocation();
  const isBuildOnly = useMemo(() => {
    const mode = new URLSearchParams(location.search).get("mode");
    return String(mode || "").trim().toLowerCase() === "build";
  }, [location.search]);
  const [product, setProduct] = useState(null);
  const [existingProduct, setExistingProduct] = useState(null);
  const [catalogProductId, setCatalogProductId] = useState("");
  const [catalogSellerId, setCatalogSellerId] = useState("");
  const [sellerProfile, setSellerProfile] = useState(null);
  const [sellerBuildFeePercent, setSellerBuildFeePercent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [sessionClaims, setSessionClaims] = useState(() => readStoredSessionClaims());
  const [customizationMode, setCustomizationMode] = useState(() => (isBuildOnly ? "build" : ""));

  const [existingCustomization, setExistingCustomization] = useState(
    getDefaultExistingCustomization()
  );

  const [selectedSellerBaseId, setSelectedSellerBaseId] = useState("");
  const [selectedSellerBaseMain, setSelectedSellerBaseMain] = useState("");
  const [showBaseVariants, setShowBaseVariants] = useState(false);
  const [enableBulkBases, setEnableBulkBases] = useState(false);
  const [bulkBaseQuantities, setBulkBaseQuantities] = useState({});
  const [selectedSellerAddonMain, setSelectedSellerAddonMain] = useState("");
  const [itemQuantities, setItemQuantities] = useState({});
  const [buildWishCardText, setBuildWishCardText] = useState("");
  const [buildSpecialNote, setBuildSpecialNote] = useState("");
  const [buildIdeaDescription, setBuildIdeaDescription] = useState("");
  const [buildReferenceImageNames, setBuildReferenceImageNames] = useState([]);
  const navigate = useNavigate();
  const userRole = sessionClaims.role;
  const isPurchaseBlocked = isPurchaseBlockedRole(userRole);
  const purchaseBlockedMessage = getPurchaseBlockedMessage(userRole);

  useEffect(() => {
    const load = async () => {
      if (!hasActiveSession() || sessionClaims.isExpired) {
        navigate("/login");
        setLoading(false);
        return;
      }

      setCatalogProductId("");
      setCatalogSellerId("");
      setSellerProfile(null);
      setSellerBuildFeePercent(0);
      setProduct(null);
      setExistingProduct(null);
      setEnableBulkBases(false);
      setBulkBaseQuantities({});
      setSelectedSellerBaseId("");
      setSelectedSellerBaseMain("");
      setShowBaseVariants(false);
      setItemQuantities({});
      setSelectedSellerAddonMain("");

      try {
        const searchParams = new URLSearchParams(location.search);
        const queryMode = String(searchParams.get("mode") || "").trim().toLowerCase();
        const preferBuild = queryMode === "build";
        const queryProductId = String(searchParams.get("productId") || "").trim();
        const existingProductId = String(
          queryProductId || (!sellerIdParam ? id : "") || ""
        ).trim();

        let activeSellerId = String(sellerIdParam || "").trim();
        let resolvedExistingProduct = null;

        if (existingProductId) {
          const productRes = await fetch(`${API_URL}/api/products/${existingProductId}`);
          if (productRes.ok) {
            resolvedExistingProduct = await productRes.json();
            if (!activeSellerId) {
              activeSellerId = String(
                resolvedExistingProduct?.seller?._id ||
                  resolvedExistingProduct?.seller ||
                  ""
              ).trim();
            }
          }
        }

        if (!activeSellerId) {
          setProduct(null);
          return;
        }

        const catalogRes = await fetch(
          `${API_URL}/api/products/seller/${activeSellerId}/customization`
        );
        if (!catalogRes.ok) {
          setCatalogSellerId(activeSellerId);
          setProduct(null);
          setExistingProduct(resolvedExistingProduct);
          setExistingCustomization(getDefaultExistingCustomization(resolvedExistingProduct));
          if (resolvedExistingProduct?.seller && typeof resolvedExistingProduct.seller === "object") {
            setSellerProfile(resolvedExistingProduct.seller);
          }
          if (preferBuild) {
            setCustomizationMode("build");
            setNotice("Build your own hamper is not enabled for this seller yet.");
          }
          return;
        }
        const catalogData = await catalogRes.json();
        const catalogProduct = catalogData?.catalogProduct || null;
        const resolvedCatalogProductId = String(
          catalogData?.catalogProductId || catalogProduct?._id || ""
        ).trim();

        setCatalogSellerId(activeSellerId);
        setSellerProfile(catalogData?.seller || null);
        setCatalogProductId(resolvedCatalogProductId);
        setSellerBuildFeePercent(
          Number(
            catalogData?.sellerBuildFeePercent ?? resolveBuildYourOwnPercent(catalogProduct)
          )
        );
        setProduct(catalogProduct);
        setExistingProduct(resolvedExistingProduct);
        setExistingCustomization(
          getDefaultExistingCustomization(resolvedExistingProduct || catalogProduct)
        );

        const sellerItems = getSellerCatalogItems(catalogProduct);
        const hasSellerCatalog = sellerItems.length > 0;
        if (preferBuild) {
          setCustomizationMode("build");
          setNotice(hasSellerCatalog ? "" : "Seller has not listed custom hamper items yet.");
        }

        const cart = getCart();
        const savedCustomization =
          (existingProductId
            ? cart.find((item) => item.id === existingProductId)?.customization
            : null) ||
          cart.find((item) => item.id === resolvedCatalogProductId)?.customization;
        if (!savedCustomization) return;

        const savedMode = inferSavedMode(savedCustomization);
        if (savedMode && !preferBuild) {
          setCustomizationMode(savedMode === "build_bulk" ? "build" : savedMode);
        }

        if (savedMode === "build" || savedMode === "build_bulk") {
          const sellerBaseIds = new Set(
            sellerItems
              .filter((item) => item.type === "base")
              .map((item) => item.id)
          );
          setEnableBulkBases(savedMode === "build_bulk");
          setBuildWishCardText(savedCustomization.wishCardText || "");
          setBuildSpecialNote(savedCustomization.specialNote || "");
          setBuildIdeaDescription(savedCustomization.ideaDescription || "");
          setBuildReferenceImageNames(getReferenceImages(savedCustomization));

          const savedOptions = savedCustomization.selectedOptions || {};
          if (hasSellerCatalog && savedMode !== "build_bulk") {
            const savedBase = String(savedOptions.hamperBase || "").trim();
            if (savedBase) setSelectedSellerBaseId(savedBase);
          }

          const savedItems = Array.isArray(savedCustomization.selectedItems)
            ? savedCustomization.selectedItems
            : [];
          const restoredQuantities = savedItems.reduce((acc, item) => {
            if (!item?.id) return acc;
            const qty = Number(item.quantity || 0);
            if (hasSellerCatalog && sellerBaseIds.has(item.id) && qty > 0) {
              if (savedMode === "build_bulk") {
                acc[item.id] = qty;
                return acc;
              }
              setSelectedSellerBaseId(item.id);
              return acc;
            }
            if (qty > 0) acc[item.id] = qty;
            return acc;
          }, {});
          if (savedMode === "build_bulk") {
            const nextBulkBaseQuantities = {};
            const nextItemQuantities = {};
            Object.entries(restoredQuantities).forEach(([itemId, qty]) => {
              if (sellerBaseIds.has(itemId)) {
                nextBulkBaseQuantities[itemId] = qty;
                return;
              }
              nextItemQuantities[itemId] = qty;
            });
            setBulkBaseQuantities(nextBulkBaseQuantities);
            setItemQuantities(nextItemQuantities);
          } else {
            setItemQuantities(restoredQuantities);
            setBulkBaseQuantities({});
          }
        } else if (savedMode === "existing" && !preferBuild) {
          const savedReferences = getReferenceImages(savedCustomization);
          const savedSelections = sanitizeExistingSelections(
            savedCustomization.selectedOptions
          );
          setExistingCustomization((current) => ({
            ...current,
            selectedOptions: {
              ...current.selectedOptions,
              ...savedSelections,
            },
            wishCardText: savedCustomization.wishCardText || "",
            specialNote: savedCustomization.specialNote || "",
            ideaDescription: savedCustomization.ideaDescription || "",
            referenceImageUrl: savedReferences[0] || "",
            referenceImageUrls: savedReferences,
            addGiftWrap:
              typeof savedCustomization.addGiftWrap === "boolean"
                ? savedCustomization.addGiftWrap
                : current.addGiftWrap,
          }));
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, location.search, navigate, sellerIdParam, sessionClaims.isExpired]);

  useEffect(() => {
    const syncSessionClaims = () => setSessionClaims(readStoredSessionClaims());
    window.addEventListener("user:updated", syncSessionClaims);
    return () => window.removeEventListener("user:updated", syncSessionClaims);
  }, []);

  const existingContentCategories = useMemo(
    () => getSellerCatalogCategories(existingProduct),
    [existingProduct]
  );
  const sellerCatalogCategories = useMemo(
    () => getSellerCatalogCategories(product),
    [product]
  );
  const sellerCatalogItems = useMemo(
    () => getSellerCatalogItems(product),
    [product]
  );
  const sellerBaseItems = useMemo(
    () => sellerCatalogItems.filter((item) => item.type === "base"),
    [sellerCatalogItems]
  );
  const sellerAddonItems = useMemo(
    () => sellerCatalogItems.filter((item) => item.type !== "base"),
    [sellerCatalogItems]
  );
  const sellerBaseGroups = useMemo(() => {
    const explicitBaseGroups = sellerCatalogCategories
      .filter((category) => category.kind === BASE_CATEGORY_KIND)
      .map((category) => {
        const variants = category.items.filter((item) => item.type === "base");
        return {
          key: String(category.id || category.label).trim() || category.label.toLowerCase(),
          mainItem: category.label,
          thumbnail:
            category.image ||
            variants.find((item) => item.image)?.image ||
            getProductImage(product),
          description:
            category.description ||
            `${variants.length} type${variants.length > 1 ? "s" : ""} available`,
          variants,
        };
      })
      .filter((group) => group.mainItem && group.variants.length > 0);
    if (explicitBaseGroups.length > 0) return explicitBaseGroups;

    const groups = new Map();
    sellerBaseItems.forEach((item) => {
      const mainItem = normalizeMainItem(item.mainItem, item.name);
      if (!mainItem) return;
      const key = mainItem.toLowerCase();
      const description = describeBaseVariant(item);
      const existing = groups.get(key);
      if (existing) {
        existing.variants.push(item);
        if (!existing.thumbnail && item.image) existing.thumbnail = item.image;
        if (!existing.description && description) existing.description = description;
        return;
      }
      groups.set(key, {
        key,
        mainItem,
        thumbnail: item.image || "",
        description,
        variants: [item],
      });
    });
    return Array.from(groups.values()).map((group) => ({
      ...group,
      description:
        group.description ||
        `${group.variants.length} type${group.variants.length > 1 ? "s" : ""} available`,
    }));
  }, [product, sellerBaseItems, sellerCatalogCategories]);
  const sellerBaseVariants = useMemo(() => {
    const selectedGroup = sellerBaseGroups.find(
      (group) => group.mainItem === selectedSellerBaseMain
    );
    return selectedGroup?.variants || [];
  }, [selectedSellerBaseMain, sellerBaseGroups]);
  const sellerAddonGroups = useMemo(() => {
    const groups = new Map();
    sellerAddonItems.forEach((item) => {
      const mainItem = normalizeMainItem(item.mainItem, item.name);
      if (!mainItem) return;
      const key = mainItem.toLowerCase();
      const existing = groups.get(key);
      if (existing) {
        existing.variants.push(item);
        return;
      }
      groups.set(key, {
        key,
        mainItem,
        variants: [item],
      });
    });
    return Array.from(groups.values());
  }, [sellerAddonItems]);
  const sellerAddonVariants = useMemo(() => {
    const selectedGroup = sellerAddonGroups.find(
      (group) => group.mainItem === selectedSellerAddonMain
    );
    return selectedGroup?.variants || [];
  }, [selectedSellerAddonMain, sellerAddonGroups]);
  const hasSellerBuildOptions = sellerCatalogItems.length > 0;

  useEffect(() => {
    if (!hasSellerBuildOptions) return;
    if (sellerBaseItems.length === 0) {
      setSelectedSellerBaseId("");
      return;
    }
    if (!selectedSellerBaseId) return;
    const selected = sellerBaseItems.find((item) => item.id === selectedSellerBaseId);
    if (!selected || Number(selected.stock || 0) <= 0) {
      setSelectedSellerBaseId("");
    }
  }, [hasSellerBuildOptions, sellerBaseItems, selectedSellerBaseId]);

  useEffect(() => {
    if (!hasSellerBuildOptions) return;
    if (Object.keys(bulkBaseQuantities).length === 0) return;
    setBulkBaseQuantities((current) => {
      const next = Object.entries(current).reduce((acc, [itemId, qty]) => {
        const match = sellerBaseItems.find((item) => item.id === itemId);
        if (!match || Number(match.stock || 0) <= 0) {
          return acc;
        }
        const nextQty = Math.min(Number(qty || 0), Number(match.stock || 0));
        if (nextQty > 0) acc[itemId] = nextQty;
        return acc;
      }, {});
      return JSON.stringify(next) === JSON.stringify(current) ? current : next;
    });
  }, [bulkBaseQuantities, hasSellerBuildOptions, sellerBaseItems]);

  useEffect(() => {
    if (!hasSellerBuildOptions) return;
    if (sellerBaseGroups.length === 0) {
      setSelectedSellerBaseMain("");
      return;
    }

    const selectedBase = sellerBaseItems.find((item) => item.id === selectedSellerBaseId);
    const selectedMain = normalizeMainItem(selectedBase?.mainItem, selectedBase?.name);
    if (selectedMain) {
      if (selectedMain !== selectedSellerBaseMain) {
        setSelectedSellerBaseMain(selectedMain);
      }
      return;
    }

    if (
      selectedSellerBaseMain &&
      !sellerBaseGroups.some((group) => group.mainItem === selectedSellerBaseMain)
    ) {
      setSelectedSellerBaseMain("");
    }
  }, [
    hasSellerBuildOptions,
    sellerBaseGroups,
    sellerBaseItems,
    selectedSellerBaseId,
    selectedSellerBaseMain,
  ]);
  useEffect(() => {
    if (!showBaseVariants) return;
    if (!sellerBaseGroups.some((group) => group.mainItem === selectedSellerBaseMain)) {
      setShowBaseVariants(false);
    }
  }, [selectedSellerBaseMain, sellerBaseGroups, showBaseVariants]);
  useEffect(() => {
    if (!hasSellerBuildOptions) return;
    if (sellerAddonGroups.length === 0) {
      setSelectedSellerAddonMain("");
      return;
    }
    if (sellerAddonGroups.some((group) => group.mainItem === selectedSellerAddonMain)) {
      return;
    }

    const selectedAddon = sellerAddonItems.find(
      (item) => Number(itemQuantities[item.id] || 0) > 0
    );
    const selectedMain = normalizeMainItem(selectedAddon?.mainItem, selectedAddon?.name);
    if (selectedMain) {
      setSelectedSellerAddonMain(selectedMain);
      return;
    }

    setSelectedSellerAddonMain(sellerAddonGroups[0]?.mainItem || "");
  }, [
    hasSellerBuildOptions,
    itemQuantities,
    selectedSellerAddonMain,
    sellerAddonGroups,
    sellerAddonItems,
  ]);

  const selectedSellerBase =
    sellerBaseItems.find(
      (item) =>
        item.id === selectedSellerBaseId && Number(item.stock || 0) > 0
    ) || null;

  const selectedBulkBaseItems = useMemo(
    () =>
      sellerBaseItems
        .filter((item) => Number(item.stock || 0) > 0)
        .filter((item) => Number(bulkBaseQuantities[item.id] || 0) > 0)
        .map((item) => ({
          ...item,
          type: "base",
          quantity: Number(bulkBaseQuantities[item.id] || 0),
        })),
    [bulkBaseQuantities, sellerBaseItems]
  );

  const selectedSellerAddonItems = useMemo(
    () =>
      sellerAddonItems
        .filter((item) => Number(itemQuantities[item.id] || 0) > 0)
        .map((item) => ({
          ...item,
          type: "item",
          price: Number(item.price || 0),
          quantity: Number(itemQuantities[item.id] || 0),
        })),
    [sellerAddonItems, itemQuantities]
  );

  const selectedItems = useMemo(() => {
    const baseLine = enableBulkBases
      ? selectedBulkBaseItems
      : selectedSellerBase
        ? [
            {
              ...selectedSellerBase,
              type: "base",
              quantity: 1,
            },
          ]
        : [];
    return [...baseLine, ...selectedSellerAddonItems];
  }, [enableBulkBases, selectedBulkBaseItems, selectedSellerBase, selectedSellerAddonItems]);

  const selectedBaseSubtotal = useMemo(
    () =>
      selectedItems
        .filter((item) => item.type === "base")
        .reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0),
    [selectedItems]
  );

  const selectedAddonSubtotal = useMemo(
    () =>
      selectedSellerAddonItems.reduce(
        (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
        0
      ),
    [selectedSellerAddonItems]
  );

  const bulkHamperCount = useMemo(
    () =>
      enableBulkBases
        ? selectedBulkBaseItems.reduce(
            (sum, item) => sum + Math.max(0, Number(item.quantity || 0)),
            0
          )
        : 0,
    [enableBulkBases, selectedBulkBaseItems]
  );

  const optionLabelLookup = useMemo(() => {
    const lookup = { ...OPTION_LABELS };
    existingContentCategories.forEach((category) => {
      lookup[category.id] = category.label;
    });
    return lookup;
  }, [existingContentCategories]);

  const optionValueLookup = useMemo(() => {
    const lookup = {};

    Object.keys(OPTION_LABELS).forEach((key) => {
      const options = Array.isArray(existingProduct?.customizationOptions?.[key])
        ? existingProduct.customizationOptions[key]
        : [];
      lookup[key] = options.reduce((acc, option) => {
        const text = String(option || "").trim();
        if (text) acc[text] = text;
        return acc;
      }, {});
    });

    existingContentCategories.forEach((category) => {
      lookup[category.id] = category.items.reduce((acc, item) => {
        acc[item.id] = item.name;
        acc[item.name] = item.name;
        return acc;
      }, {});
    });

    return lookup;
  }, [existingProduct, existingContentCategories]);

  const existingSummaryItems = useMemo(() => {
    const selectedOptions = sanitizeExistingSelections(
      existingCustomization?.selectedOptions
    );
    const referenceImages = getReferenceImages(existingCustomization);
    const entries = Object.entries(selectedOptions)
      .filter(([, value]) => Boolean(value))
      .map(([key, value]) => ({
        label: optionLabelLookup[key] || key,
        value:
          optionValueLookup[key]?.[String(value)] ||
          optionValueLookup[key]?.[value] ||
          value,
      }));

    if (existingCustomization?.addGiftWrap) {
      entries.push({ label: "Gift wrap", value: "Premium wrap" });
    }
    if (existingCustomization?.ideaDescription?.trim()) {
      entries.push({
        label: "Idea",
        value: truncate(existingCustomization.ideaDescription.trim()),
      });
    }
    if (referenceImages.length > 0) {
      entries.push({
        label: "References",
        value: `${referenceImages.length} image(s)`,
      });
    }

    return entries;
  }, [existingCustomization, optionLabelLookup, optionValueLookup]);

  const buildSummaryExtras = useMemo(() => {
    const entries = [];
    if (buildIdeaDescription.trim()) {
      entries.push({
        id: "idea",
        label: "Idea",
        value: truncate(buildIdeaDescription.trim()),
      });
    }
    if ((buildReferenceImageNames || []).length > 0) {
      entries.push({
        id: "refs",
        label: "References",
        value: `${buildReferenceImageNames.length} image(s)`,
      });
    }
    return entries;
  }, [buildIdeaDescription, buildReferenceImageNames]);
  const buildImageReferences = useMemo(
    () => buildReferenceImageNames.filter(isImageReference),
    [buildReferenceImageNames]
  );
  const buildTextReferences = useMemo(
    () => buildReferenceImageNames.filter((reference) => !isImageReference(reference)),
    [buildReferenceImageNames]
  );

  const selectedQuantity = selectedItems.reduce((sum, item) => sum + item.quantity, 0);
  const itemSubtotal = selectedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const buildFeePercent = Math.max(0, Number(sellerBuildFeePercent || 0));
  const buildFeeAmount = roundAmount((itemSubtotal * buildFeePercent) / 100);
  const buildModeCharge = roundAmount(itemSubtotal + buildFeeAmount);
  const existingModeCharge = Number(existingProduct?.makingCharge || 0);
  const effectiveCustomizationCharge =
    customizationMode === "build"
      ? buildModeCharge
      : customizationMode === "existing"
        ? existingModeCharge
        : 0;
  const existingBasePrice = Number(existingProduct?.price || 0);
  const totalPrice =
    customizationMode === "existing"
      ? existingBasePrice + existingModeCharge
      : effectiveCustomizationCharge;

  const sellerDisplayName = String(
    sellerProfile?.storeName || sellerProfile?.name || ""
  ).trim();
  const isExistingUnavailable = !existingProduct || !existingProduct.isCustomizable;
  const isBuildDisabled = !product || !isBuildEnabledForProduct(product);
  const isDisabled = customizationMode === "existing" ? isExistingUnavailable : isBuildDisabled;
  const isBuildUnavailable = customizationMode === "build" && !hasSellerBuildOptions;
  const isModeChosen = Boolean(customizationMode);
  const existingProductId = String(
    existingProduct?._id || existingProduct?.id || ""
  ).trim();
  const showExistingProduct = customizationMode === "existing" && existingProduct;
  const buildSummaryImage = enableBulkBases
    ? selectedBulkBaseItems[0]?.image || ""
    : selectedSellerBase?.image || "";
  const summaryImage = showExistingProduct ? getProductImage(existingProduct) : buildSummaryImage;
  const summaryTitle = showExistingProduct
    ? String(existingProduct?.name || GENERIC_HAMPER_LABEL).trim()
    : GENERIC_HAMPER_LABEL;
  const bulkBaseSummary = useMemo(
    () =>
      enableBulkBases
        ? buildBaseSelectionSummary(
            {
              mode: "build_bulk",
              selectedItems,
              bulkPlan: { totalHampers: bulkHamperCount, baseSelections: selectedBulkBaseItems },
            },
            3
          )
        : "",
    [bulkHamperCount, enableBulkBases, selectedBulkBaseItems, selectedItems]
  );
  const addonSummary = useMemo(
    () => buildAddonItemSummary({ selectedItems }, 3),
    [selectedItems]
  );

  const updateQuantity = (itemId, change) => {
    setItemQuantities((current) => {
      const nextValue = Math.max(0, Number(current[itemId] || 0) + change);
      if (nextValue === 0) {
        const { [itemId]: _, ...rest } = current;
        return rest;
      }
      return { ...current, [itemId]: nextValue };
    });
    setNotice("");
  };
  const updateBulkBaseQuantity = (itemId, change, maxStock) => {
    setBulkBaseQuantities((current) => {
      const nextValue = Math.max(
        0,
        Math.min(Number(maxStock || 0), Number(current[itemId] || 0) + change)
      );
      if (nextValue === 0) {
        const { [itemId]: _removed, ...rest } = current;
        return rest;
      }
      return { ...current, [itemId]: nextValue };
    });
    setNotice("");
  };
  const removeSelectedBuildItem = (item) => {
    if (!item?.id) return;
    if (item.type === "base") {
      if (!enableBulkBases) return;
      setBulkBaseQuantities((current) => {
        if (!(item.id in current)) return current;
        const { [item.id]: _removed, ...rest } = current;
        return rest;
      });
      setNotice("");
      return;
    }
    setItemQuantities((current) => {
      if (!(item.id in current)) return current;
      const { [item.id]: _removed, ...rest } = current;
      return rest;
    });
    setNotice("");
  };

  const saveCustomization = () => {
    if (isPurchaseBlocked) {
      setNotice(purchaseBlockedMessage);
      return false;
    }
    if (!customizationMode) {
      setNotice("Please choose a customization option first.");
      return false;
    }
    if (customizationMode === "existing") {
      if (!existingProduct || !existingProduct.isCustomizable) {
        setNotice("This product is not customizable.");
        return false;
      }
    } else if (customizationMode === "build") {
      if (!product || !isBuildEnabledForProduct(product)) return false;
      if (!hasSellerBuildOptions) {
        setNotice("Seller has not listed custom hamper items yet.");
        return false;
      }
      if (enableBulkBases) {
        if (sellerBaseItems.length > 0 && selectedBulkBaseItems.length === 0) {
          setNotice("Please choose at least one hamper base type and quantity.");
          return false;
        }
      } else if (sellerBaseItems.length > 0 && !selectedSellerBase) {
        setNotice("Please select one hamper base to continue.");
        return false;
      }
      if (!catalogSellerId) {
        setNotice("Unable to link hamper to seller.");
        return false;
      }
      if (!catalogProductId) {
        setNotice("Unable to link hamper to seller catalog.");
        return false;
      }
    }

    const cart = getCart();

    const existingReferenceImages = getReferenceImages(existingCustomization);
    const buildReferenceImages = (buildReferenceImageNames || [])
      .filter(Boolean)
      .slice(0, 3);

    if (customizationMode === "existing") {
      const existingProductId = String(
        existingProduct?._id || existingProduct?.id || ""
      ).trim();
      if (!existingProductId) {
        setNotice("Unable to link customization to product.");
        return false;
      }
      const exists = cart.some((item) => item.id === existingProductId);
      if (!exists) {
        const sellerInfo =
          existingProduct?.seller && typeof existingProduct.seller === "object"
            ? existingProduct.seller
            : null;
        const sellerId = String(
          sellerInfo?._id ||
            sellerInfo?.id ||
            existingProduct?.seller ||
            catalogSellerId ||
            ""
        ).trim();
        addToCart({
          id: existingProductId,
          name: String(existingProduct?.name || GENERIC_HAMPER_LABEL).trim(),
          price: Number(existingProduct?.price || 0),
          isCustomizable: Boolean(existingProduct?.isCustomizable),
          buildYourOwnEnabled: isBuildEnabledForProduct(existingProduct),
          category: String(existingProduct?.category || "Custom hamper").trim(),
          image: getProductImage(existingProduct || {}),
          seller: {
            id: sellerId,
            name: String(sellerInfo?.name || sellerProfile?.name || "").trim(),
            storeName: String(
              sellerInfo?.storeName || sellerProfile?.storeName || ""
            ).trim(),
            profileImage: String(
              sellerInfo?.profileImage || sellerProfile?.profileImage || ""
            ).trim(),
            shippingSummary:
              (sellerInfo?.shippingSummary && typeof sellerInfo.shippingSummary === "object"
                ? sellerInfo.shippingSummary
                : sellerProfile?.shippingSummary) || undefined,
          },
        });
      }

      const payload = {
        mode: "existing",
        selectedOptions: sanitizeExistingSelections(existingCustomization.selectedOptions),
        selectedItems: [],
        wishCardText: existingCustomization.wishCardText?.trim() || "",
        specialNote: existingCustomization.specialNote?.trim() || "",
        ideaDescription: existingCustomization.ideaDescription?.trim() || "",
        referenceImageUrls: existingReferenceImages,
        referenceImageUrl: existingReferenceImages[0] || "",
        addGiftWrap: Boolean(existingCustomization.addGiftWrap),
        makingCharge: existingModeCharge,
      };

      setCustomization(existingProductId, payload);
      setNotice("Customization saved to cart.");
      return true;
    }

    const exists = cart.some((item) => item.id === catalogProductId);
    if (!exists) {
      const sellerId = catalogSellerId || String(product?.seller?._id || product?.seller || "");
      addToCart({
        id: catalogProductId,
        name: GENERIC_HAMPER_LABEL,
        price: 0,
        isCustomizable: false,
        buildYourOwnEnabled: isBuildEnabledForProduct(product),
        category: "Custom hamper",
        image: "",
        isGenericHamper: true,
        seller: {
          id: String(sellerId || "").trim(),
          name: String(sellerProfile?.name || "").trim(),
          storeName: String(sellerProfile?.storeName || "").trim(),
          profileImage: String(sellerProfile?.profileImage || "").trim(),
          shippingSummary:
            sellerProfile?.shippingSummary && typeof sellerProfile.shippingSummary === "object"
              ? sellerProfile.shippingSummary
              : undefined,
        },
      });
    }

    const payload = {
      mode: enableBulkBases ? "build_bulk" : "build",
      selectedOptions:
        !enableBulkBases && selectedSellerBase ? { hamperBase: selectedSellerBase.id } : {},
      selectedItems,
      ...(enableBulkBases
        ? {
            bulkPlan: {
              totalHampers: bulkHamperCount,
              baseSelections: selectedBulkBaseItems.map((item) => ({
                id: item.id,
                name: item.name,
                mainItem: item.mainItem,
                subItem: item.subItem,
                category: item.category || item.mainItem,
                categoryId: item.categoryId,
                size: item.size,
                quantity: item.quantity,
                price: item.price,
                image: item.image,
              })),
            },
          }
        : {}),
      wishCardText: buildWishCardText.trim(),
      specialNote: buildSpecialNote.trim(),
      ideaDescription: buildIdeaDescription.trim(),
      referenceImageUrls: buildReferenceImages,
      referenceImageUrl: buildReferenceImages[0] || "",
      makingCharge: buildModeCharge,
      buildFeePercent,
      buildFeeAmount,
      buildItemsSubtotal: itemSubtotal,
      catalogSellerId: catalogSellerId || undefined,
    };

    setCustomization(catalogProductId, payload);
    setNotice("Customization saved to cart.");
    return true;
  };

  if (loading) {
    return (
      <div className="page custom-builder-page">
        <Header />
        <p>Loading customization...</p>
      </div>
    );
  }

  if (!product && !existingProduct) {
    return (
      <div className="page custom-builder-page">
        <Header />
        <p>Unable to load hamper customization.</p>
      </div>
    );
  }

  return (
    <div className="page custom-builder-page">
      <Header />
      <div className="section-head">
        <div>
          <h2>{isBuildOnly ? "Build your own hamper" : "Customize hamper"}</h2>
          <p>
            {isBuildOnly
              ? "Choose items listed by this seller and build a hamper from scratch."
              : "Select a customization path to continue: refine preset options or build a hamper from scratch."}
          </p>
        </div>
        <Link
          className="link"
          to={
            existingProductId
              ? `/products/${existingProductId}`
              : catalogSellerId
                ? `/store/${catalogSellerId}`
                : "/products"
          }
        >
          {existingProductId ? "Back to product" : "Back to store"}
        </Link>
      </div>

      {isDisabled && (
        <p className="field-hint">
          {customizationMode === "existing"
            ? "This product is marked non-customizable by the seller."
            : "This hamper is marked non-customizable by the seller."}
        </p>
      )}
      {isPurchaseBlocked && (
        <p className="field-hint">
          {purchaseBlockedMessage}
        </p>
      )}

      <div className="hamper-builder-layout">
        <div className="hamper-builder-main">
          {!isBuildOnly ? (
            <section className="hamper-builder-block">
              <h3 className="hamper-block-title">Choose customization type</h3>
              <div className="hamper-mode-grid">
                <button
                  type="button"
                  className={`hamper-mode-card ${
                    customizationMode === "existing" ? "active" : ""
                  }`}
                  onClick={() => {
                    setCustomizationMode("existing");
                    setNotice("");
                  }}
                  disabled={isExistingUnavailable}
                >
                  <strong>Modify existing hamper</strong>
                  <small>
                    Adjust preset options such as gift box, chocolates, frame,
                    perfume, and card.
                  </small>
                </button>
                <button
                  type="button"
                  className={`hamper-mode-card hamper-build-card ${
                    customizationMode === "build" ? "active" : ""
                  }`}
                  onClick={() => {
                    if (!hasSellerBuildOptions) {
                      navigate(
                        catalogSellerId ? `/store/${catalogSellerId}` : "/products"
                      );
                      return;
                    }
                    const targetSellerId = catalogSellerId || sellerIdParam;
                    if (targetSellerId) {
                      const params = new URLSearchParams();
                      params.set("mode", "build");
                      if (existingProductId) params.set("productId", existingProductId);
                      navigate(`/customize/seller/${targetSellerId}?${params.toString()}`);
                      return;
                    }
                    setCustomizationMode("build");
                    setNotice("");
                  }}
                  disabled={isBuildDisabled}
                >
                  <span className="hamper-mode-thumb" aria-hidden="true">
                    <img src="/images/hamper-btn.png" alt="" />
                  </span>
                  <strong>Build your own hamper</strong>
                  <small>
                    {hasSellerBuildOptions
                      ? "Choose items listed by this seller and set quantity."
                      : "Available only after seller lists custom hamper items."}
                  </small>
                </button>
              </div>
              {!isModeChosen && (
                <p className="hamper-mode-note">
                  Select one option to continue.
                </p>
              )}
            </section>
          ) : (
            <section className="hamper-builder-block">
              <h3 className="hamper-block-title">You can make your own hamper</h3>
              <p className="field-hint">
                Choose a base, add items, and personalize your gift. We will craft
                it exactly as you want.
              </p>
            </section>
          )}

          {customizationMode === "existing" && (
            <section className="hamper-builder-block">
              <h3 className="hamper-block-title">Existing hamper changes</h3>
              <div className="hamper-existing-form">
                <CustomizationPanel
                  product={existingProduct || product}
                  value={existingCustomization}
                  onChange={(nextValue) => {
                    setExistingCustomization(nextValue);
                    setNotice("");
                  }}
                />
              </div>
            </section>
          )}

          {customizationMode === "build" && (
            <>
              {hasSellerBuildOptions ? (
                <>
                  <section className="hamper-builder-block">
                    <h3 className="hamper-block-title">Hamper base</h3>
                    {sellerBaseItems.length === 0 && (
                      <p className="field-hint">
                        Seller has not listed any hamper base yet.
                      </p>
                    )}
                    {sellerBaseGroups.length > 0 && (
                      <div className="hamper-base-picker-shell">
                        <div className="hamper-bulk-toggle">
                          <div className="hamper-bulk-toggle-copy">
                            <strong>Need multiple hampers?</strong>
                            <p className="field-hint">
                              Turn this on to choose several base types with quantities. Shared
                              hamper items will apply to all selected bases.
                            </p>
                          </div>
                          <button
                            type="button"
                            className={`btn ${enableBulkBases ? "primary" : "ghost"}`}
                            onClick={() => {
                              setEnableBulkBases((current) => {
                                const next = !current;
                                if (next) {
                                  setShowBaseVariants(false);
                                }
                                return next;
                              });
                              setNotice("");
                            }}
                            disabled={isDisabled}
                          >
                            {enableBulkBases ? "Use single base" : "Select multiple bases"}
                          </button>
                        </div>

                        {!enableBulkBases ? (
                          !showBaseVariants ? (
                            <>
                              <p className="field-hint">Choose hamper base</p>
                              <div className="hamper-main-item-grid">
                                {sellerBaseGroups.map((group) => (
                                  <button
                                    key={group.key}
                                    type="button"
                                    className={`hamper-main-item ${
                                      selectedSellerBaseMain === group.mainItem ? "active" : ""
                                    }`}
                                    onClick={() => {
                                      const preferredVariant = group.variants.find(
                                        (item) => item.id === selectedSellerBaseId
                                      );
                                      setSelectedSellerBaseMain(group.mainItem);
                                      setSelectedSellerBaseId(preferredVariant?.id || "");
                                      setShowBaseVariants(true);
                                      setNotice("");
                                    }}
                                    disabled={isDisabled}
                                  >
                                    <span className="hamper-main-item-media">
                                      <img
                                        src={group.thumbnail || getProductImage(product)}
                                        alt={group.mainItem}
                                        loading="lazy"
                                      />
                                    </span>
                                    <span className="hamper-main-item-content">
                                      <strong>{group.mainItem}</strong>
                                      <small>{group.description}</small>
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="hamper-base-picker-head">
                                <p className="field-hint">Choose hamper base type</p>
                                <button
                                  type="button"
                                  className="btn ghost hamper-base-back"
                                  onClick={() => setShowBaseVariants(false)}
                                  disabled={isDisabled}
                                >
                                  Change base
                                </button>
                              </div>
                              <p className="hamper-items-title">{selectedSellerBaseMain}</p>
                              <div className="hamper-choice-grid">
                                {sellerBaseVariants.map((option) => (
                                  <button
                                    key={option.id}
                                    type="button"
                                    className={`hamper-choice-card ${
                                      selectedSellerBaseId === option.id ? "active" : ""
                                    }`}
                                    onClick={() => {
                                      if (Number(option.stock || 0) <= 0) return;
                                      setSelectedSellerBaseId(option.id);
                                      setNotice("");
                                    }}
                                    disabled={isDisabled || Number(option.stock || 0) <= 0}
                                  >
                                    <span className="hamper-choice-media">
                                      <img
                                        src={option.image || getProductImage(product)}
                                        alt={option.name}
                                      />
                                    </span>
                                    <div className="hamper-choice-body">
                                      <strong>{option.subItem || option.name}</strong>
                                      <small>{option.mainItem}</small>
                                      {option.size ? (
                                        <small className="hamper-choice-size">{option.size}</small>
                                      ) : null}
                                      <div className="hamper-choice-pricing">
                                        {Number(option.mrp || 0) > Number(option.price || 0) ? (
                                          <span className="hamper-choice-mrp">
                                            ₹{formatPrice(option.mrp)}
                                          </span>
                                        ) : null}
                                        <span className="hamper-choice-price">
                                          ₹{formatPrice(option.price)}
                                        </span>
                                        {calculateOfferPercent(option.mrp, option.price) > 0 ? (
                                          <span className="hamper-choice-offer">
                                            {calculateOfferPercent(option.mrp, option.price)}% off
                                          </span>
                                        ) : null}
                                      </div>
                                      {Number(option.stock || 0) <= 0 ? (
                                        <small>Out of stock</small>
                                      ) : null}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </>
                          )
                        ) : (
                          <div className="hamper-bulk-builder">
                            <div className="hamper-base-picker-head">
                              <p className="field-hint">
                                Choose as many base types as you need. Total hampers will be
                                counted automatically.
                              </p>
                              <span className="hamper-bulk-total">
                                {bulkHamperCount} hamper{bulkHamperCount === 1 ? "" : "s"}
                              </span>
                            </div>
                            <div className="hamper-bulk-group-stack">
                              {sellerBaseGroups.map((group) => (
                                <section key={group.key} className="hamper-bulk-group">
                                  <div className="hamper-bulk-group-head">
                                    <div>
                                      <p>{group.mainItem}</p>
                                      <small>{group.description}</small>
                                    </div>
                                    <span>{group.variants.length} types</span>
                                  </div>
                                  <div className="hamper-choice-grid hamper-choice-grid-bulk">
                                    {group.variants.map((option) => {
                                      const quantity = Number(bulkBaseQuantities[option.id] || 0);
                                      const isOutOfStock = Number(option.stock || 0) <= 0;
                                      return (
                                        <article
                                          key={option.id}
                                          className={`hamper-choice-card hamper-choice-card-bulk ${
                                            quantity > 0 ? "active" : ""
                                          }`}
                                        >
                                          <span className="hamper-choice-media">
                                            <img
                                              src={option.image || getProductImage(product)}
                                              alt={option.name}
                                            />
                                          </span>
                                          <div className="hamper-choice-body">
                                            <strong>{option.subItem || option.name}</strong>
                                            <small>{option.mainItem}</small>
                                            {option.size ? (
                                              <small className="hamper-choice-size">{option.size}</small>
                                            ) : null}
                                            <div className="hamper-choice-pricing">
                                              {Number(option.mrp || 0) > Number(option.price || 0) ? (
                                                <span className="hamper-choice-mrp">
                                                  ₹{formatPrice(option.mrp)}
                                                </span>
                                              ) : null}
                                              <span className="hamper-choice-price">
                                                ₹{formatPrice(option.price)}
                                              </span>
                                              {calculateOfferPercent(option.mrp, option.price) > 0 ? (
                                                <span className="hamper-choice-offer">
                                                  {calculateOfferPercent(option.mrp, option.price)}% off
                                                </span>
                                              ) : null}
                                            </div>
                                          </div>
                                          <div className="hamper-choice-footer">
                                            <small className="hamper-choice-stock">
                                              {isOutOfStock
                                                ? "Out of stock"
                                                : `${Number(option.stock || 0)} available`}
                                            </small>
                                            <div className="hamper-stepper">
                                              <button
                                                type="button"
                                                className="hamper-step-btn minus"
                                                onClick={() =>
                                                  updateBulkBaseQuantity(
                                                    option.id,
                                                    -1,
                                                    Number(option.stock || 0)
                                                  )
                                                }
                                                disabled={quantity === 0 || isDisabled}
                                                aria-label={`Reduce ${option.name}`}
                                              >
                                                -
                                              </button>
                                              <span className="hamper-step-value">{quantity}</span>
                                              <button
                                                type="button"
                                                className="hamper-step-btn plus"
                                                onClick={() =>
                                                  updateBulkBaseQuantity(
                                                    option.id,
                                                    1,
                                                    Number(option.stock || 0)
                                                  )
                                                }
                                                disabled={
                                                  isDisabled ||
                                                  isOutOfStock ||
                                                  Number(option.stock || 0) <= quantity
                                                }
                                                aria-label={`Add ${option.name}`}
                                              >
                                                +
                                              </button>
                                            </div>
                                          </div>
                                        </article>
                                      );
                                    })}
                                  </div>
                                </section>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </section>

                  <section className="hamper-builder-block">
                    <h3 className="hamper-block-title">Hamper contents</h3>
                    {sellerAddonItems.length === 0 ? (
                      <p className="field-hint">
                        Seller has not listed hamper content items yet.
                      </p>
                    ) : (
                      <>
                        {enableBulkBases && (
                          <p className="field-hint">
                            Shared hamper contents below will be added across all selected hampers.
                          </p>
                        )}
                        <div className="hamper-content-layout">
                          <section className="hamper-content-pane hamper-content-pane-nav">
                            <div className="hamper-content-pane-head">
                              <p className="field-hint">Step 1</p>
                              <strong>Main items</strong>
                            </div>
                            <div className="hamper-category-stack">
                              {sellerAddonGroups.map((group) => (
                                <button
                                  key={group.key}
                                  type="button"
                                  className={`hamper-category-row ${
                                    selectedSellerAddonMain === group.mainItem ? "active" : ""
                                  }`}
                                  onClick={() => {
                                    setSelectedSellerAddonMain(group.mainItem);
                                    setNotice("");
                                  }}
                                  disabled={isDisabled}
                                >
                                  <span>{group.mainItem}</span>
                                  <strong>{group.variants.length}</strong>
                                </button>
                              ))}
                            </div>
                          </section>

                          <section className="hamper-content-pane hamper-content-pane-items">
                            <div className="hamper-content-pane-head">
                              <p className="field-hint">Step 2</p>
                              <strong>Sub items and quantity</strong>
                            </div>
                            <div className="hamper-items-shell">
                              <p className="hamper-items-title">
                                {selectedSellerAddonMain || "Hamper contents"}
                              </p>
                              {sellerAddonVariants.length > 0 ? (
                                <div className="hamper-items-grid">
                                  {sellerAddonVariants.map((item) => {
                                    const quantity = Number(itemQuantities[item.id] || 0);
                                    return (
                                      <article key={item.id} className="hamper-item-card">
                                        <img
                                          className="hamper-item-image"
                                          src={item.image || getProductImage(product)}
                                          alt={item.name}
                                          loading="lazy"
                                        />
                                        <h4>{item.subItem || item.name}</h4>
                                        <p className="field-hint">{item.mainItem || item.name}</p>
                                        <p className="hamper-item-price">
                                          ₹{formatPrice(item.price)}
                                          {item.size ? ` | ${item.size}` : ""}
                                        </p>
                                        {Number(item.stock || 0) <= 0 ? (
                                          <p className="field-hint">Out of stock</p>
                                        ) : null}
                                        <div className="hamper-stepper">
                                          <button
                                            type="button"
                                            className="hamper-step-btn minus"
                                            onClick={() => updateQuantity(item.id, -1)}
                                            disabled={quantity === 0 || isDisabled}
                                            aria-label={`Reduce ${item.name}`}
                                          >
                                            -
                                          </button>
                                          <span className="hamper-step-value">{quantity}</span>
                                          <button
                                            type="button"
                                            className="hamper-step-btn plus"
                                            onClick={() => updateQuantity(item.id, 1)}
                                            disabled={
                                              isDisabled || Number(item.stock || 0) <= quantity
                                            }
                                            aria-label={`Add ${item.name}`}
                                          >
                                            +
                                          </button>
                                        </div>
                                      </article>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="field-hint">No sub items found under this main item.</p>
                              )}
                            </div>
                          </section>
                        </div>
                      </>
                    )}
                  </section>
                </>
              ) : (
                <section className="hamper-builder-block">
                  <p className="field-hint">
                    Seller has not listed custom hamper items yet.
                  </p>
                </section>
              )}
            </>
          )}

          {!customizationMode && (
            <section className="hamper-builder-block">
              <p className="hamper-placeholder-copy">
                Choose one customization type to unlock the relevant section.
              </p>
            </section>
          )}
        </div>

        <aside className="hamper-summary-panel">
          <div className="hamper-summary-head">
            <h3>Your hamper</h3>
            <span>
              {customizationMode === "build"
                ? enableBulkBases
                  ? `${bulkHamperCount} hamper${bulkHamperCount === 1 ? "" : "s"}`
                  : `${selectedQuantity} items`
                : `${existingSummaryItems.length} selected`}
            </span>
          </div>

          <div className="hamper-summary-meta">
            <div className="hamper-summary-media">
              {summaryImage ? (
                <img src={summaryImage} alt={summaryTitle || GENERIC_HAMPER_LABEL} />
              ) : (
                <span
                  className="hamper-summary-loader"
                  role="status"
                  aria-label="Select items to preview"
                />
              )}
            </div>
            <div>
              <p>{summaryTitle}</p>
              {!showExistingProduct && sellerDisplayName && (
                <small>
                  Seller: <strong>{sellerDisplayName}</strong>
                </small>
              )}
              <small>
                Mode:{" "}
                <strong>
                  {customizationMode === "existing"
                    ? "Modify existing hamper"
                    : customizationMode === "build" && enableBulkBases
                      ? "Build multiple hampers"
                      : customizationMode === "build"
                      ? "Build your own hamper"
                      : "Not selected"}
                </strong>
              </small>
              {customizationMode === "build" && (
                <small>
                  Base:{" "}
                  <strong>
                    {hasSellerBuildOptions
                      ? enableBulkBases
                        ? bulkBaseSummary || "Not selected"
                        : selectedSellerBase
                          ? `${selectedSellerBase.mainItem || selectedSellerBase.name}${
                              selectedSellerBase.subItem
                                ? ` - ${selectedSellerBase.subItem}`
                                : ""
                            }${
                              selectedSellerBase.size
                                ? ` (${selectedSellerBase.size})`
                                : ""
                            }`
                          : "Not selected"
                      : "Seller items not available"}
                  </strong>
                </small>
              )}
              {customizationMode === "build" && enableBulkBases && addonSummary && (
                <small>
                  Shared items: <strong>{addonSummary}</strong>
                </small>
              )}
            </div>
          </div>

          <div className="hamper-summary-list-head">
            <span>{customizationMode === "existing" ? "Option" : "Item"}</span>
            <span>{customizationMode === "existing" ? "Selection" : "Qty"}</span>
          </div>
          <ul className="hamper-summary-list">
            {!customizationMode && (
              <li>
                <span>Choose a customization type first</span>
                <strong>-</strong>
              </li>
            )}

            {customizationMode === "existing" &&
              (existingSummaryItems.length === 0 ? (
                <li>
                  <span>No selections yet</span>
                  <strong>0</strong>
                </li>
              ) : (
                existingSummaryItems.map((item) => (
                  <li key={`${item.label}-${item.value}`}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </li>
                ))
              ))}

            {customizationMode === "build" &&
              (selectedItems.length === 0 ? (
                <li>
                  <span>No contents selected</span>
                  <strong>0</strong>
                </li>
              ) : (
                selectedItems.map((item) => (
                  <li key={item.id}>
                    <span>
                      {item.type === "base"
                        ? formatBaseSelectionLabel(item)
                        : `${item.mainItem || item.name}${
                            item.subItem ? ` - ${item.subItem}` : ""
                          }${item.size ? ` (${item.size})` : ""}`}
                    </span>
                    <div className="hamper-summary-item-right">
                      <strong>x{item.quantity}</strong>
                      {(item.type !== "base" || enableBulkBases) && (
                        <button
                          type="button"
                          className="hamper-summary-remove"
                          onClick={() => removeSelectedBuildItem(item)}
                          aria-label={`Remove ${item.name}`}
                          disabled={isDisabled}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </li>
                ))
              ))}
            {customizationMode === "build" &&
              buildSummaryExtras.map((item) => (
                <li key={item.id}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </li>
              ))}
          </ul>

          <div className="hamper-total-card">
            {customizationMode === "existing" && (
              <>
                <div className="hamper-total-row">
                  <span>Base product price</span>
                  <strong>₹{formatPrice(existingBasePrice)}</strong>
                </div>
                <div className="hamper-total-row">
                  <span>Customization charge</span>
                  <strong>₹{formatPrice(existingModeCharge)}</strong>
                </div>
              </>
            )}

            {customizationMode === "build" && (
              <>
                <div className="hamper-total-row">
                  <span>Build fee ({buildFeePercent}%)</span>
                  <strong>₹{formatPrice(buildFeeAmount)}</strong>
                </div>
                {enableBulkBases && (
                  <div className="hamper-total-row">
                    <span>Total hampers</span>
                    <strong>{bulkHamperCount}</strong>
                  </div>
                )}
                <div className="hamper-total-row">
                  <span>{enableBulkBases ? "Selected items total" : "Selected items total"}</span>
                  <strong>₹{formatPrice(enableBulkBases ? selectedBaseSubtotal : itemSubtotal)}</strong>
                </div>
                {selectedAddonSubtotal > 0 && (
                  <div className="hamper-total-row">
                    <span>Shared hamper items</span>
                    <strong>₹{formatPrice(selectedAddonSubtotal)}</strong>
                  </div>
                )}
              </>
            )}

            <div className="hamper-total-row total">
              <span>Total</span>
              <strong>₹{formatPrice(totalPrice)}</strong>
            </div>
          </div>

          {customizationMode === "build" && hasSellerBuildOptions && (
            <div className="hamper-note-block">
              <label htmlFor="hamperMessage">Personalized message</label>
              <textarea
                id="hamperMessage"
                value={buildWishCardText}
                onChange={(event) => setBuildWishCardText(event.target.value)}
                placeholder="Type your message here"
                disabled={isDisabled}
              />
              <label htmlFor="hamperDescription">
                Description (optional)
              </label>
              <textarea
                id="hamperDescription"
                value={buildIdeaDescription}
                onChange={(event) => setBuildIdeaDescription(event.target.value)}
                placeholder="Describe your idea, style, color, or arrangement..."
                disabled={isDisabled}
              />
              <label htmlFor="hamperReference">Reference images (max 3)</label>
              <input
                id="hamperReference"
                type="file"
                accept="image/*"
                multiple
                onChange={async (event) => {
                  try {
                    const references = await optimizeImageFiles(
                      Array.from(event.target.files || []).slice(0, 3),
                      {
                        maxWidth: 1400,
                        maxHeight: 1400,
                        quality: 0.82,
                        uploadFolder: "customization",
                        uploadPrefix: "reference",
                      }
                    );
                    setBuildReferenceImageNames(references);
                  } finally {
                    event.target.value = "";
                  }
                }}
                disabled={isDisabled}
              />
              {buildImageReferences.length > 0 && (
                <div className="reference-preview-grid">
                  {buildImageReferences.map((source, index) => (
                    <img
                      key={`${source.slice(0, 32)}-${index}`}
                      src={source}
                      alt={`Reference ${index + 1}`}
                      className="reference-preview-thumb"
                    />
                  ))}
                </div>
              )}
              {buildTextReferences.length > 0 && (
                <p className="hamper-upload-hint">{buildTextReferences.join(" | ")}</p>
              )}
              <label htmlFor="hamperNote">Packaging note</label>
              <input
                id="hamperNote"
                type="text"
                value={buildSpecialNote}
                onChange={(event) => setBuildSpecialNote(event.target.value)}
                placeholder="Any special handling instructions?"
                disabled={isDisabled}
              />
            </div>
          )}

          {notice && <p className="hamper-notice">{notice}</p>}

          <div className="hamper-summary-actions">
            <button
              className="btn ghost"
              type="button"
              onClick={saveCustomization}
              disabled={isPurchaseBlocked || isDisabled || !isModeChosen || isBuildUnavailable}
            >
              Save customization
            </button>
            <button
              className="btn primary"
              type="button"
              onClick={() => {
                const saved = saveCustomization();
                if (saved) {
                  clearBuyNowCheckoutItem();
                  navigate("/checkout");
                }
              }}
              disabled={isPurchaseBlocked || isDisabled || !isModeChosen || isBuildUnavailable}
            >
              Continue to checkout
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
