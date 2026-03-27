import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Header from "../components/Header";
import ProductHoverImage from "../components/ProductHoverImage";
import { addToCart } from "../utils/cart";
import { getWishlist, toggleWishlist } from "../utils/wishlist";
import {
  DEFAULT_CATEGORY_TREE,
  findCategoryGroup,
  loadCategoryTree,
  normalizeCategoryKey,
} from "../utils/categoryMaster";
import { getProductImage } from "../utils/productMedia";
import {
  getPurchaseBlockedMessage,
  isPurchaseBlockedRole,
  readStoredSessionClaims,
} from "../utils/authRoute";
import { fetchJsonCached } from "../utils/jsonCache";
import { prefetchProductDetail } from "../utils/productDetailCache";

import { API_URL } from "../apiBase";
const PAGE_SIZE = 16;
const PRICE_FILTER_MIN = 0;
const PRICE_FILTER_MAX = 40000;
const PRICE_FILTER_STEP = 500;
const parseOptionalNumber = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
};

const clampPriceFilterValue = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return PRICE_FILTER_MAX;
  return Math.min(Math.max(Math.round(numeric), PRICE_FILTER_MIN), PRICE_FILTER_MAX);
};

const filterAndSortProducts = (
  source,
  { query, category, subcategory, customOnly, minPrice, maxPrice, sort }
) => {
  const normalizedQuery = query.trim().toLowerCase();
  const min = parseOptionalNumber(minPrice);
  const max = parseOptionalNumber(maxPrice);
  const normalizedSubcategory = String(subcategory || "").trim().toLowerCase();

  let filtered = source.filter((item) => {
    const text = `${item?.name || ""} ${item?.category || ""} ${
      item?.subcategory || ""
    } ${item?.description || ""}`
      .toLowerCase();
    const itemSubcategory = String(item?.subcategory || "").trim().toLowerCase();
    const queryMatch = !normalizedQuery || text.includes(normalizedQuery);
    const categoryMatch =
      category === "All" ||
      (item?.category || "").toLowerCase() === category.toLowerCase();
    const subcategoryMatch =
      !normalizedSubcategory ||
      itemSubcategory === normalizedSubcategory ||
      text.includes(normalizedSubcategory);
    const customMatch = !customOnly || Boolean(item?.isCustomizable);
    const price = Number(item?.price || 0);
    const minMatch = min === null || price >= min;
    const maxMatch = max === null || price <= max;
    return (
      queryMatch &&
      categoryMatch &&
      subcategoryMatch &&
      customMatch &&
      minMatch &&
      maxMatch
    );
  });

  if (sort === "price_asc") {
    filtered = filtered.sort((a, b) => a.price - b.price);
  } else if (sort === "price_desc") {
    filtered = filtered.sort((a, b) => b.price - a.price);
  } else if (sort === "name_asc") {
    filtered = filtered.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sort === "name_desc") {
    filtered = filtered.sort((a, b) => b.name.localeCompare(a.name));
  }

  return filtered;
};

const paginateProducts = (items, page) => {
  const total = items.length;
  const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const currentPage = Math.min(Math.max(page, 1), pages);
  const start = (currentPage - 1) * PAGE_SIZE;

  return {
    items: items.slice(start, start + PAGE_SIZE),
    total,
    page: currentPage,
    pages,
  };
};

const normalizeProductsResponse = (data) => {
  if (Array.isArray(data)) {
    return {
      items: data,
      total: data.length,
      page: 1,
      pages: 1,
    };
  }

  const items = Array.isArray(data?.items) ? data.items : [];
  const total =
    typeof data?.total === "number" ? data.total : items.length;
  const page = typeof data?.page === "number" ? data.page : 1;
  const pages =
    typeof data?.pages === "number"
      ? Math.max(data.pages, 1)
      : Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return { items, total, page, pages };
};

const formatPrice = (value) => Number(value || 0).toLocaleString("en-IN");
const toStarText = (value) => {
  const safe = Math.min(5, Math.max(0, Math.round(Number(value) || 0)));
  return "★".repeat(safe).padEnd(5, "☆");
};
const getRatingRows = (ratingBreakdown, totalFeedbacks = 0, verifiedFeedbacks = 0) => {
  const safeBreakdown =
    ratingBreakdown && typeof ratingBreakdown === "object" ? ratingBreakdown : {};
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
  return {
    ratingRows: rows.map((row) => {
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
    }),
    totalRatingVotes: Math.max(verifiedFeedbacks, totalFeedbacks, countedTotal),
  };
};
const parsePrice = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const getWishlistIdSet = () =>
  new Set(getWishlist().map((entry) => String(entry.id)));

const buildPaginationItems = (currentPage, totalPages) => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) pages.push("ellipsis-left");
  for (let pageNo = start; pageNo <= end; pageNo += 1) {
    pages.push(pageNo);
  }
  if (end < totalPages - 1) pages.push("ellipsis-right");
  pages.push(totalPages);

  return pages;
};

export default function Products() {
  const [catalog, setCatalog] = useState({
    items: [],
    total: 0,
    page: 1,
    pages: 1,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [addedItemId, setAddedItemId] = useState("");
  const [cartAnimatingId, setCartAnimatingId] = useState("");
  const [wishlistAnimatingId, setWishlistAnimatingId] = useState("");
  const [wishlistIds, setWishlistIds] = useState(() => getWishlistIdSet());
  const [sessionClaims, setSessionClaims] = useState(() => readStoredSessionClaims());
  const [activeRatingProductId, setActiveRatingProductId] = useState("");
  const [categoryTree, setCategoryTree] = useState(DEFAULT_CATEGORY_TREE);
  const [searchParams, setSearchParams] = useSearchParams();
  const category = searchParams.get("category") || "All";
  const categoryOptions =
    Array.isArray(categoryTree) && categoryTree.length > 0
      ? categoryTree
      : DEFAULT_CATEGORY_TREE;
  const rawSubcategory = searchParams.get("subcategory") || "";
  const rawQuery = searchParams.get("q") || "";
  const selectedCategoryConfig =
    findCategoryGroup(categoryOptions, category) || categoryOptions[0];
  const derivedLegacySubcategory =
    category !== "All"
      ? selectedCategoryConfig?.subcategories?.find(
          (item) => normalizeCategoryKey(item) === normalizeCategoryKey(rawQuery)
        ) || ""
      : "";
  const subcategory = rawSubcategory || derivedLegacySubcategory;
  const query = subcategory ? searchParams.get("search") || "" : rawQuery || searchParams.get("search") || "";
  const activeSubcategoryKey = normalizeCategoryKey(subcategory);
  const sort = searchParams.get("sort") || "newest";
  const customOnly = searchParams.get("custom") === "1";
  const minPrice = searchParams.get("minPrice") || "";
  const maxPrice = searchParams.get("maxPrice") || "";
  const page = Math.max(Number(searchParams.get("page")) || 1, 1);
  const [priceSliderValue, setPriceSliderValue] = useState(() =>
    clampPriceFilterValue(maxPrice || PRICE_FILTER_MAX)
  );
  const [filtersOpen, setFiltersOpen] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return true;
    }
    return !window.matchMedia("(max-width: 980px)").matches;
  });
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [activeMenuCategory, setActiveMenuCategory] = useState(
    () => (category !== "All" ? category : categoryOptions[0]?.category || "")
  );
  const categoryMenuRef = useRef(null);
  const navigate = useNavigate();
  const pageItems = useMemo(
    () => buildPaginationItems(page, catalog.pages),
    [page, catalog.pages]
  );
  const activeMenuCategoryGroup =
    findCategoryGroup(categoryOptions, activeMenuCategory) ||
    selectedCategoryConfig;
  const categoryToggleLabel =
    category === "All"
      ? "All categories"
      : subcategory
      ? `${category} - ${subcategory}`
      : category;
  const userRole = sessionClaims.role;
  const isPurchaseBlocked = isPurchaseBlockedRole(userRole);
  const purchaseBlockedMessage = getPurchaseBlockedMessage(userRole);

  useEffect(() => {
    const syncWishlist = () => {
      setWishlistIds(getWishlistIdSet());
    };
    syncWishlist();
    window.addEventListener("wishlist:updated", syncWishlist);
    return () => {
      window.removeEventListener("wishlist:updated", syncWishlist);
    };
  }, []);

  useEffect(() => {
    const syncSessionClaims = () => setSessionClaims(readStoredSessionClaims());
    window.addEventListener("user:updated", syncSessionClaims);
    return () => window.removeEventListener("user:updated", syncSessionClaims);
  }, []);

  useEffect(() => {
    let ignore = false;

    const hydrateCategoryTree = async () => {
      const nextTree = await loadCategoryTree();
      if (!ignore && Array.isArray(nextTree) && nextTree.length > 0) {
        setCategoryTree(nextTree);
      }
    };

    hydrateCategoryTree();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(max-width: 980px)");
    const syncSidebarState = (event) => {
      setFiltersOpen(!event.matches);
    };

    syncSidebarState(mediaQuery);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncSidebarState);
      return () => mediaQuery.removeEventListener("change", syncSidebarState);
    }

    mediaQuery.addListener(syncSidebarState);
    return () => mediaQuery.removeListener(syncSidebarState);
  }, []);

  useEffect(() => {
    setPriceSliderValue(clampPriceFilterValue(maxPrice || PRICE_FILTER_MAX));
  }, [maxPrice]);

  useEffect(() => {
    if (category !== "All") {
      setActiveMenuCategory(category);
      return;
    }
    if (!categoryOptions.some((item) => item.category === activeMenuCategory)) {
      setActiveMenuCategory(categoryOptions[0]?.category || "");
    }
  }, [category, categoryOptions, activeMenuCategory]);

  useEffect(() => {
    if (!categoryMenuOpen) return undefined;

    const handleOutsideClick = (event) => {
      if (categoryMenuRef.current && !categoryMenuRef.current.contains(event.target)) {
        setCategoryMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") setCategoryMenuOpen(false);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [categoryMenuOpen]);

  useEffect(() => {
    if (!activeRatingProductId) return undefined;
    const handleOutsideClick = (event) => {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-catalog-rating-anchor='true']")
      ) {
        return;
      }
      setActiveRatingProductId("");
    };
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setActiveRatingProductId("");
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [activeRatingProductId]);

  const updateParams = (updates, resetPage = true) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (
        value === null ||
        value === undefined ||
        value === false ||
        value === ""
      ) {
        next.delete(key);
      } else {
        next.set(key, String(value));
      }
    });

    if (resetPage) {
      next.delete("page");
    }

    setSearchParams(next, { replace: true });
  };

  const applyCategoryFromMenu = (nextCategory) => {
    setCategoryMenuOpen(false);
    updateParams({
      category: nextCategory === "All" ? null : nextCategory,
      subcategory: null,
      q: null,
      search: null,
    });
  };

  const applySubcategoryFromMenu = (nextSubcategory) => {
    setCategoryMenuOpen(false);
    updateParams({
      category: activeMenuCategoryGroup.category,
      subcategory: nextSubcategory || null,
      q: null,
      search: null,
    });
  };

  const clearAllFilters = () => {
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const requireLogin = () => {
    const token = localStorage.getItem("token");
    if (!token || sessionClaims.isExpired) {
      navigate("/login");
      return false;
    }
    return true;
  };

  const toCartItem = (item) => ({
    id: item._id,
    name: item.name,
    price: item.price,
    mrp: item.mrp,
    isCustomizable: item.isCustomizable,
    category: item.category,
    deliveryMinDays: item.deliveryMinDays,
    deliveryMaxDays: item.deliveryMaxDays,
    image: getProductImage(item),
    seller: {
      id: String(item?.seller?._id || item?.seller?.id || "").trim(),
      name: String(item?.seller?.name || "").trim(),
      storeName: String(item?.seller?.storeName || "").trim(),
      profileImage: String(item?.seller?.profileImage || "").trim(),
    },
  });

  const addItemToCart = (item) => {
    const availableStock = Number(item?.stock || 0);
    if (availableStock <= 0) return false;
    if (isPurchaseBlocked) return false;
    if (!requireLogin()) return false;
    setCartAnimatingId(String(item._id));
    addToCart(toCartItem(item));
    setAddedItemId(String(item._id));
    return true;
  };

  const updateWishlistForItem = (item) => {
    if (!requireLogin()) return;
    setWishlistAnimatingId(String(item._id));
    const next = toggleWishlist({
      id: item._id,
      name: item.name,
      price: item.price,
      tag: item.category,
      category: item.category,
      image: getProductImage(item),
    });
    setWishlistIds(new Set(next.map((entry) => String(entry.id))));
  };

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (query) params.set("search", query);
        if (category !== "All") params.set("category", category);
        if (subcategory) params.set("subcategory", subcategory);
        if (customOnly) params.set("customizable", "true");
        if (minPrice) params.set("minPrice", minPrice);
        if (maxPrice) params.set("maxPrice", maxPrice);
        params.set("sort", sort);
        params.set("page", String(page));
        params.set("limit", String(PAGE_SIZE));

        const data = await fetchJsonCached(`${API_URL}/api/products?${params.toString()}`, {
          ttlMs: 45_000,
        });
        if (ignore) return;
        const normalized = normalizeProductsResponse(data);

        if (Array.isArray(data)) {
          // Supports older backend responses by applying filters client-side.
          const hydratedCatalog = paginateProducts(
            filterAndSortProducts(normalized.items, {
              query,
              category,
              subcategory,
              customOnly,
              minPrice,
              maxPrice,
              sort,
            }),
            page
          );

          setCatalog(hydratedCatalog);
          return;
        }

        setCatalog(normalized);
      } catch {
        if (ignore) return;
        setCatalog({
          items: [],
          total: 0,
          page: 1,
          pages: 1,
        });
        setError("Unable to load live catalog.");
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    load();

    return () => {
      ignore = true;
    };
  }, [query, category, subcategory, customOnly, minPrice, maxPrice, sort, page]);

  useEffect(() => {
    if (catalog.pages > 0 && page > catalog.pages) {
      const next = new URLSearchParams(searchParams);
      if (catalog.pages > 1) {
        next.set("page", String(catalog.pages));
      } else {
        next.delete("page");
      }
      setSearchParams(next, { replace: true });
    }
  }, [catalog.pages, page, searchParams, setSearchParams]);

  useEffect(() => {
    if (!addedItemId) return undefined;
    const timer = window.setTimeout(() => setAddedItemId(""), 900);
    return () => window.clearTimeout(timer);
  }, [addedItemId]);

  useEffect(() => {
    if (!cartAnimatingId) return undefined;
    const timer = window.setTimeout(() => setCartAnimatingId(""), 420);
    return () => window.clearTimeout(timer);
  }, [cartAnimatingId]);

  useEffect(() => {
    if (!wishlistAnimatingId) return undefined;
    const timer = window.setTimeout(() => setWishlistAnimatingId(""), 420);
    return () => window.clearTimeout(timer);
  }, [wishlistAnimatingId]);

  return (
    <div className="page products-page">
      <Header
        onFilterClick={() => setFiltersOpen(true)}
        isFilterActive={filtersOpen}
      />

      <div className={`catalog-shell ${filtersOpen ? "filters-open" : ""}`}>
        <button
          className={`catalog-sidebar-backdrop ${filtersOpen ? "show" : ""}`}
          type="button"
          aria-label="Close filters"
          onClick={() => setFiltersOpen(false)}
        />

        <aside
          className={`catalog-sidebar ${filtersOpen ? "open" : ""}`}
          aria-label="Product filters"
        >
          <div className="catalog-toolbar">
            <div className="catalog-sidebar-categories">
              <p className="catalog-sidebar-label">All categories</p>
              <div className={`catalog-category-dropdown ${categoryMenuOpen ? "open" : ""}`} ref={categoryMenuRef}>
                <button
                  type="button"
                  className="catalog-category-toggle"
                  aria-haspopup="dialog"
                  aria-expanded={categoryMenuOpen}
                  onClick={() => setCategoryMenuOpen((prev) => !prev)}
                >
                  <span>{categoryToggleLabel}</span>
                  <span className="catalog-category-caret" aria-hidden="true">
                    ▾
                  </span>
                </button>

                {categoryMenuOpen && (
                  <div className="catalog-categories-grid expanded catalog-categories-menu" role="dialog">
                    <div className="catalog-categories-main">
                      {categoryOptions.map((item) => {
                        const isActive = activeMenuCategoryGroup.category === item.category;
                        return (
                          <button
                            key={item.category}
                            type="button"
                            className={`catalog-tree-item ${isActive ? "active" : ""}`}
                            onMouseEnter={() => setActiveMenuCategory(item.category)}
                            onFocus={() => setActiveMenuCategory(item.category)}
                            onClick={() => applyCategoryFromMenu(item.category)}
                          >
                            <span>{item.category}</span>
                            <span className="catalog-tree-arrow" aria-hidden="true">
                              ›
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="catalog-categories-sub">
                      <div className="catalog-categories-sub-head">
                        <p>{activeMenuCategoryGroup.category}</p>
                        <button
                          className="catalog-view-all-btn"
                          type="button"
                          onClick={() => applyCategoryFromMenu(activeMenuCategoryGroup.category)}
                        >
                          View all
                        </button>
                      </div>
                      <div className="catalog-categories-sub-list">
                        {activeMenuCategoryGroup.subcategories.length > 0 ? (
                          activeMenuCategoryGroup.subcategories.map((item) => {
                            const isActive =
                              activeSubcategoryKey === normalizeCategoryKey(item);
                            return (
                              <button
                                key={`${activeMenuCategoryGroup.category}-${item}`}
                                type="button"
                                className={`catalog-sub-item ${isActive ? "active" : ""}`}
                                onClick={() => applySubcategoryFromMenu(item)}
                              >
                                {item}
                              </button>
                            );
                          })
                        ) : (
                          <button
                            type="button"
                            className="catalog-sub-item"
                            onClick={() => applySubcategoryFromMenu("")}
                          >
                            Shop {activeMenuCategoryGroup.category}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="catalog-toolbar-head">
              <div>
                <p className="catalog-filter-title">Filter by</p>
              </div>
              <button
                className="catalog-sidebar-close"
                type="button"
                aria-label="Close filters"
                onClick={() => setFiltersOpen(false)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 6l12 12" />
                  <path d="M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div className="catalog-sidebar-section">
              <p className="catalog-sidebar-label">Sort by</p>
              <div className="catalog-controls">
                <select
                  className="catalog-select"
                  value={sort}
                  onChange={(event) =>
                    updateParams({
                      sort:
                        event.target.value === "newest"
                          ? null
                          : event.target.value,
                    })
                  }
                >
                  <option value="newest">Newest first</option>
                  <option value="price_asc">Price: Low to high</option>
                  <option value="price_desc">Price: High to low</option>
                  <option value="name_asc">Name: A to Z</option>
                  <option value="name_desc">Name: Z to A</option>
                </select>
              </div>
            </div>

            <div className="catalog-sidebar-section catalog-price-section">
              <p className="catalog-sidebar-label">Filter by price</p>
              <div className="catalog-price-slider-wrap">
                <input
                  className="catalog-price-slider"
                  type="range"
                  min={PRICE_FILTER_MIN}
                  max={PRICE_FILTER_MAX}
                  step={PRICE_FILTER_STEP}
                  value={priceSliderValue}
                  onChange={(event) => {
                    const nextValue = clampPriceFilterValue(event.target.value);
                    setPriceSliderValue(nextValue);
                    updateParams({
                      minPrice: null,
                      maxPrice: nextValue >= PRICE_FILTER_MAX ? null : nextValue,
                    });
                  }}
                  aria-label="Maximum price"
                />
                <div className="catalog-price-slider-meta">
                  <p className="catalog-price-slider-value">
                    Price: <strong>₹{formatPrice(PRICE_FILTER_MIN)}</strong> —{" "}
                    <strong>₹{formatPrice(priceSliderValue)}</strong>
                  </p>
                </div>
                <div className="catalog-price-quick-list">
                  <button
                    className={`catalog-price-quick-btn ${
                      !minPrice && maxPrice === "2000" ? "active" : ""
                    }`}
                    type="button"
                    onClick={() => {
                      setPriceSliderValue(2000);
                      updateParams({ minPrice: null, maxPrice: "2000" });
                    }}
                  >
                    Below ₹2000
                  </button>
                  <button
                    className={`catalog-price-quick-btn ${
                      minPrice === "2000" && maxPrice === "3000" ? "active" : ""
                    }`}
                    type="button"
                    onClick={() => {
                      setPriceSliderValue(3000);
                      updateParams({ minPrice: "2000", maxPrice: "3000" });
                    }}
                  >
                    ₹2000 - ₹3000
                  </button>
                  <button
                    className={`catalog-price-quick-btn ${
                      minPrice === "3000" && !maxPrice ? "active" : ""
                    }`}
                    type="button"
                    onClick={() => {
                      setPriceSliderValue(PRICE_FILTER_MAX);
                      updateParams({ minPrice: "3000", maxPrice: null });
                    }}
                  >
                    Above ₹3000
                  </button>
                </div>
              </div>
            </div>

            <div className="catalog-sidebar-section">
              <p className="catalog-sidebar-label">Features</p>
              <label className="catalog-check">
                <input
                  type="checkbox"
                  checked={customOnly}
                  onChange={(event) =>
                    updateParams({ custom: event.target.checked ? "1" : null })
                  }
                />
                Customizable only
              </label>
            </div>

            <button className="btn ghost catalog-sidebar-reset" type="button" onClick={clearAllFilters}>
              Reset filters
            </button>
          </div>
        </aside>

        <section className="catalog-results">
          {(loading || error) && (
            <div className="catalog-meta">
              {error && <p className="field-hint">{error}</p>}
            </div>
          )}
          {isPurchaseBlocked && (
            <div className="catalog-meta">
              <p className="field-hint">
                {purchaseBlockedMessage}
              </p>
            </div>
          )}

          {catalog.items.length === 0 && !loading ? (
            <div className="catalog-empty">
              <h3>No matching gifts found</h3>
              <p>Try a different category, search term, or price range to discover more curated finds.</p>
            </div>
          ) : (
            <div className="product-grid catalog-product-grid">
              {catalog.items.map((item) => {
                const prefetchCurrentProduct = () => {
                  if (!item?._id) return;
                  prefetchProductDetail(String(item._id), {
                    token: localStorage.getItem("token"),
                  });
                };
                const sellerName =
                  item?.seller?.storeName || item?.seller?.name || "Craftzy seller";
                const reviewStats =
                  item?.reviewStats && typeof item.reviewStats === "object"
                    ? item.reviewStats
                    : null;
                const displayRating = Number(
                  reviewStats?.displayRating || reviewStats?.avgRating || 0
                );
                const totalFeedbacks = Number(reviewStats?.totalFeedbacks || 0);
                const verifiedFeedbacks = Number(
                  reviewStats?.verifiedFeedbacks || totalFeedbacks || 0
                );
                const { ratingRows, totalRatingVotes } = getRatingRows(
                  reviewStats?.ratingBreakdown,
                  totalFeedbacks,
                  verifiedFeedbacks
                );
                const livePrice = parsePrice(item?.price);
                const mrp = parsePrice(item?.mrp);
                const hasDiscount = mrp > livePrice;
                const discountPercent = hasDiscount
                  ? Math.round(((mrp - livePrice) / mrp) * 100)
                  : 0;
                const stockCount = Number(item?.stock || 0);
                const isOutOfStock = stockCount <= 0;
                const isWishlisted = wishlistIds.has(String(item._id));
                const itemId = String(item._id);
                const isWishlistAnimating = wishlistAnimatingId === itemId;
                const isCartAnimating = cartAnimatingId === itemId;
                const isAdded = addedItemId === itemId;
                const disablePurchase = isOutOfStock || isPurchaseBlocked;
                const isRatingOpen = activeRatingProductId === itemId;
                const ratingPopoverId = `catalog-rating-popover-${itemId}`;

                return (
                  <article key={item._id} className="product-card catalog-product-card">
                    <div className="catalog-product-media">
                      {item.isCustomizable && (
                        <span className="catalog-custom-tag">Customizable</span>
                      )}
                      <button
                        className={`catalog-wishlist-btn ${
                          isWishlisted ? "active" : ""
                        } ${isWishlistAnimating ? "is-animating" : ""}`}
                        type="button"
                        aria-label={
                          isWishlisted ? "Remove from wishlist" : "Add to wishlist"
                        }
                        onClick={() => updateWishlistForItem(item)}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09A6 6 0 0 1 16.5 3C19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35Z" />
                        </svg>
                      </button>
                      <Link
                        className="catalog-image-link"
                        to={`/products/${item._id}`}
                        onMouseEnter={prefetchCurrentProduct}
                        onFocus={prefetchCurrentProduct}
                        onTouchStart={prefetchCurrentProduct}
                      >
                        <ProductHoverImage
                          className="product-image"
                          product={item}
                          alt={item.name}
                        />
                      </Link>
                    </div>

                    <div className="product-body catalog-product-body">
                      <h3 className="catalog-product-title">
                        <Link
                          to={`/products/${item._id}`}
                          onMouseEnter={prefetchCurrentProduct}
                          onFocus={prefetchCurrentProduct}
                          onTouchStart={prefetchCurrentProduct}
                        >
                          {item.name}
                        </Link>
                      </h3>
                      <p className="catalog-product-seller">by {sellerName}</p>
                      {totalRatingVotes > 0 ? (
                        <div className="catalog-rating-anchor" data-catalog-rating-anchor="true">
                          <button
                            className="catalog-rating-trigger"
                            type="button"
                            onClick={() =>
                              setActiveRatingProductId((prev) =>
                                prev === itemId ? "" : itemId
                              )
                            }
                            aria-expanded={isRatingOpen}
                            aria-controls={ratingPopoverId}
                          >
                            <span className="catalog-rating-pill">
                              <span>{displayRating.toFixed(1)}</span>
                              <span className="catalog-rating-star">{toStarText(displayRating)}</span>
                            </span>
                            <span className="catalog-rating-count">({totalRatingVotes})</span>
                            <svg
                              className={`catalog-rating-caret ${isRatingOpen ? "open" : ""}`}
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                            >
                              <path d="m7 10 5 5 5-5" />
                            </svg>
                          </button>
                          {isRatingOpen ? (
                            <div
                              id={ratingPopoverId}
                              className="catalog-rating-popover"
                              role="dialog"
                              aria-label={`Rating breakdown for ${item?.name || "this product"}`}
                            >
                              <div className="catalog-rating-popover-head">
                                <strong>{displayRating.toFixed(1)} out of 5</strong>
                                <button
                                  type="button"
                                  className="catalog-rating-popover-close"
                                  aria-label="Close rating breakdown"
                                  onClick={() => setActiveRatingProductId("")}
                                >
                                  ×
                                </button>
                              </div>
                              <p className="catalog-rating-popover-count">
                                {totalRatingVotes} global ratings
                              </p>
                              <div className="catalog-rating-popover-breakdown">
                                {ratingRows.map((row) => (
                                  <div
                                    key={`${itemId}-rating-${row.star}`}
                                    className="catalog-rating-popover-row"
                                  >
                                    <span>{row.star} star</span>
                                    <div className="catalog-rating-popover-track" aria-hidden="true">
                                      <span
                                        className="catalog-rating-popover-fill"
                                        style={{ width: `${row.share}%` }}
                                      />
                                    </div>
                                    <span>{Math.round(row.share)}%</span>
                                  </div>
                                ))}
                              </div>
                              <Link
                                className="catalog-rating-popover-link"
                                to={`/products/${item._id}`}
                                onClick={() => setActiveRatingProductId("")}
                              >
                                See customer reviews
                              </Link>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <p className="catalog-rating-empty">No ratings yet</p>
                      )}

                      <div className="catalog-price-row">
                        <strong className="catalog-price-live">
                          ₹{formatPrice(livePrice)}
                        </strong>
                        {hasDiscount && (
                          <span className="catalog-price-original">
                            ₹{formatPrice(mrp)}
                          </span>
                        )}
                        {hasDiscount && (
                          <span className="catalog-offer">{discountPercent}% off</span>
                        )}
                      </div>
                      {isOutOfStock ? (
                        <div className="product-flags catalog-stock-flags">
                          <span className="status-pill locked">Out of stock</span>
                        </div>
                      ) : null}

                      <div className="catalog-action-row">
                        <button
                          className="catalog-buy-btn"
                          type="button"
                          disabled={disablePurchase}
                          onClick={() =>
                            navigate(item?._id ? `/products/${item._id}` : "/products")
                          }
                        >
                          {isOutOfStock ? "Out of stock" : "Buy now"}
                        </button>
                        <button
                          className={`catalog-cart-btn ${
                            isAdded ? "added" : ""
                          } ${isCartAnimating ? "is-animating" : ""}`}
                          type="button"
                          disabled={disablePurchase}
                          aria-label={
                            isOutOfStock
                              ? `${item.name} is out of stock`
                              : isPurchaseBlocked
                              ? purchaseBlockedMessage
                              : isAdded
                              ? `${item.name} added to cart`
                              : "Add to cart"
                          }
                          onClick={() => {
                            addItemToCart(item);
                          }}
                        >
                          {isAdded ? (
                            <>
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M5 12.5l4 4L19 7.5" />
                              </svg>
                              <span>Added</span>
                            </>
                          ) : (
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <circle cx="9" cy="20" r="1.4" />
                              <circle cx="18" cy="20" r="1.4" />
                              <path d="M3 4h2l2.4 10.1a1.6 1.6 0 0 0 1.56 1.24h8.56a1.6 1.6 0 0 0 1.56-1.24L21 7H7.2" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {catalog.pages > 1 && (
        <nav className="catalog-pagination" aria-label="Catalog pagination">
          <button
            className="catalog-page-nav"
            type="button"
            onClick={() => updateParams({ page: Math.max(page - 1, 1) }, false)}
            disabled={page <= 1 || loading}
            aria-label="Go to previous page"
          >
            <svg className="catalog-page-icon" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M11.5 4.5L6 10l5.5 5.5" />
            </svg>
          </button>

          <ul className="catalog-page-list">
            {pageItems.map((item, index) => {
              if (typeof item !== "number") {
                return (
                  <li key={`${item}-${index}`} className="catalog-page-ellipsis" aria-hidden="true">
                    ...
                  </li>
                );
              }

              return (
                <li key={item}>
                  <button
                    className={`catalog-page-btn ${item === page ? "active" : ""}`}
                    type="button"
                    onClick={() => updateParams({ page: item }, false)}
                    disabled={loading}
                    aria-current={item === page ? "page" : undefined}
                    aria-label={`Go to page ${item}`}
                  >
                    {item}
                  </button>
                </li>
              );
            })}
          </ul>

          <button
            className="catalog-page-nav"
            type="button"
            onClick={() =>
              updateParams(
                { page: Math.min(page + 1, catalog.pages) },
                false
              )
            }
            disabled={page >= catalog.pages || loading}
            aria-label="Go to next page"
          >
            <svg className="catalog-page-icon" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M8.5 4.5L14 10l-5.5 5.5" />
            </svg>
          </button>
        </nav>
      )}
    </div>
  );
}

