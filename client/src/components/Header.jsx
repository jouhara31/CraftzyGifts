import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import logoPng from "../assets/logo.png";
import logoCartPng from "../assets/logo-cart.png";
import { getCart } from "../utils/cart";
import { getWishlist } from "../utils/wishlist";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const USER_PROFILE_IMAGE_KEY = "user_profile_image";

const readStoredProfileImage = () => {
  try {
    return localStorage.getItem(USER_PROFILE_IMAGE_KEY) || "";
  } catch {
    return "";
  }
};

const readStoredUser = () => {
  try {
    const stored = localStorage.getItem("user");
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.profileImage) {
      const fallbackImage = readStoredProfileImage();
      if (fallbackImage) {
        parsed.profileImage = fallbackImage;
      }
    }
    return parsed;
  } catch {
    return null;
  }
};

const persistUserWithProfileImage = (nextUser) => {
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
    // Fallback: keep lightweight user payload while storing profile image separately.
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
    // Ignore storage quota errors.
  }
};

const readCounts = (currentUser) => {
  if (!currentUser) {
    return { cartCount: 0, wishlistCount: 0 };
  }

  return {
    cartCount: getCart().reduce((sum, item) => sum + item.quantity, 0),
    wishlistCount: getWishlist().length,
  };
};

const CUSTOMER_CATEGORY_TREE = [
  { label: "Valentine's Day", category: "Valentine's Day", subcategories: [] },
  {
    label: "Birthday",
    category: "Birthday",
    subcategories: [
      "For Him",
      "For Her",
      "For Boys",
      "For Girls",
      "For Husband",
      "For Wife",
      "For Boyfriend",
      "For Girlfriend",
      "For Brother",
      "For Sister",
      "For Dad",
      "For Mom",
      "For Friends",
    ],
  },
  {
    label: "Anniversary",
    category: "Anniversary",
    subcategories: [
      "For Couples",
      "For Husband",
      "For Wife",
      "For Boyfriend",
      "For Girlfriend",
      "For Parents",
      "For Friends",
    ],
  },
  {
    label: "Wedding",
    category: "Wedding",
    subcategories: [
      "Couples",
      "Groom",
      "Bride",
      "Bride to be Gifts",
      "Groom to be",
      "Bridesmaid Gifts",
      "For Friends",
    ],
  },
  {
    label: "Engagement",
    category: "Engagement",
    subcategories: ["For Couples", "For Bride to be", "For Groom to be"],
  },
  { label: "Festivals", category: "Festivals", subcategories: [] },
  {
    label: "Special Days",
    category: "Special Days",
    subcategories: [
      "Valentine's Day Gifts",
      "Friendship Day",
      "Mother's Day",
      "Doctors Day Gifts",
      "Father's Day Gifts",
      "Women's Day",
      "New Year Gifts",
      "Holiday",
      "Men's Day",
      "Year Ending",
      "Children's Day",
    ],
  },
  {
    label: "Other Occasions",
    category: "Other Occasions",
    subcategories: [
      "Congratulations",
      "Housewarming",
      "Home Visit",
      "New Born",
      "Retirement",
      "Dad to Be",
      "Mom to Be",
      "Token of Love",
      "Apology Gifts",
      "Party",
    ],
  },
  {
    label: "Thank You",
    category: "Thank You",
    subcategories: ["Thank You Advocate", "Thank You Doctor", "Token of Love"],
  },
  {
    label: "Gourmet Gifts",
    category: "Gourmet Gifts",
    subcategories: ["Yummy Hamper", "Snacks Hamper", "Coffee Hamper"],
  },
  {
    label: "Corporate Gifts",
    category: "Corporate",
    subcategories: [
      "Vacuum Mug Gift Set",
      "Powerbank Gift Set",
      "Pendrive Gift Set",
      "Pen Gift Set",
      "Mug Gift Set",
      "Mouse Gift Set",
      "Keychain Gift Set",
      "Diary Gift Set",
      "Bottle Gift Set",
      "Belt Gift Set",
      "Appreciation",
      "Promotion",
      "Kerala",
    ],
  },
  { label: "Return Gifts", category: "Return gifts", subcategories: [] },
  {
    label: "Kerala Specials",
    category: "Kerala Specials",
    subcategories: [
      "Handicrafts",
      "Kerala Hampers",
      "Vishu Kani Items",
      "Thiru Udayada",
      "Spices",
      "Snacks",
    ],
  },
  { label: "Gift Items", category: "Gift Items", subcategories: [] },
];

const buildCategoryPath = ({ category, query } = {}) => {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (query) params.set("q", query);
  return `/products?${params.toString()}`;
};

export default function Header({ variant, onFilterClick, isFilterActive = false }) {
  const [user, setUser] = useState(readStoredUser);
  const [accountOpen, setAccountOpen] = useState(false);
  const [allCategoriesOpen, setAllCategoriesOpen] = useState(false);
  const [canScrollCategoryRight, setCanScrollCategoryRight] = useState(false);
  const [activeMenuCategory, setActiveMenuCategory] = useState(
    CUSTOMER_CATEGORY_TREE[0]?.label || ""
  );
  const [counts, setCounts] = useState(() => readCounts(readStoredUser()));
  const [searchText, setSearchText] = useState(() => {
    try {
      if (typeof window === "undefined") return "";
      const params = new URLSearchParams(window.location.search);
      return params.get("q") || "";
    } catch {
      return "";
    }
  });
  const navigate = useNavigate();
  const location = useLocation();
  const accountRef = useRef(null);
  const categoriesMenuRef = useRef(null);
  const categoryLinksRef = useRef(null);
  const isAuthNav = variant === "auth";
  const isSellerNav = variant === "seller";
  const isAdminNav = variant === "admin";
  const isCartRoute = location.pathname === "/cart";
  const brandLogo = isCartRoute ? logoCartPng : logoPng;
  const brandLabel = isCartRoute ? "Your Cart" : "Craftzy Gifts";
  const brandSubtext = isCartRoute ? "Review your items before checkout" : "";

  useEffect(() => {
    const syncUser = () => {
      const nextUser = readStoredUser();
      setUser(nextUser);
      setCounts(readCounts(nextUser));
    };
    window.addEventListener("user:updated", syncUser);
    return () => window.removeEventListener("user:updated", syncUser);
  }, []);

  useEffect(() => {
    if (!user || user.profileImage) return;

    const token = localStorage.getItem("token");
    if (!token) return;

    let active = true;
    const hydrateProfileImage = async () => {
      try {
        const res = await fetch(`${API_URL}/api/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          localStorage.removeItem(USER_PROFILE_IMAGE_KEY);
          if (active) {
            setUser(null);
            setCounts(readCounts(null));
          }
          window.dispatchEvent(new Event("user:updated"));
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (!active || !data || typeof data !== "object") return;

        const mergedUser = {
          ...(readStoredUser() || {}),
          ...data,
        };
        persistUserWithProfileImage(mergedUser);
        setUser(mergedUser);
        setCounts(readCounts(mergedUser));
      } catch {
        // No-op: keep existing local user if fetch fails.
      }
    };

    hydrateProfileImage();
    return () => {
      active = false;
    };
  }, [user?.email, user?.profileImage]);

  useEffect(() => {
    const syncCounts = () => setCounts(readCounts(readStoredUser()));
    window.addEventListener("cart:updated", syncCounts);
    window.addEventListener("wishlist:updated", syncCounts);
    window.addEventListener("user:updated", syncCounts);
    return () => {
      window.removeEventListener("cart:updated", syncCounts);
      window.removeEventListener("wishlist:updated", syncCounts);
      window.removeEventListener("user:updated", syncCounts);
    };
  }, []);

  useEffect(() => {
    if (!accountOpen) return undefined;
    const handleOutsideClick = (event) => {
      if (accountRef.current && !accountRef.current.contains(event.target)) {
        setAccountOpen(false);
      }
    };
    const handleEscape = (event) => {
      if (event.key === "Escape") setAccountOpen(false);
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [accountOpen]);

  const closeAccount = () => setAccountOpen(false);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem(USER_PROFILE_IMAGE_KEY);
    setUser(null);
    closeAccount();
    window.dispatchEvent(new Event("user:updated"));
    navigate("/");
  };

  const handleProtectedNav = (path) => {
    closeAccount();
    if (!user) {
      navigate("/login");
      return;
    }
    navigate(path);
  };

  const handleCatalogSearch = (event) => {
    event.preventDefault();
    const query = searchText.trim();
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    const suffix = params.toString();
    navigate(`/products${suffix ? `?${suffix}` : ""}`);
  };
  const { cartCount, wishlistCount } = counts;

  const toAuthPath = (path) => (user ? path : "/login");
  const sellerActive = (path) => location.pathname.startsWith(path);
  const adminActive = (path) => location.pathname.startsWith(path);
  const showCategoryToggle =
    typeof onFilterClick === "function" && location.pathname === "/products";
  const isHomeRoute = location.pathname === "/";
  const showAllCategoriesMenu = isHomeRoute;
  const showGuestAuthButtons = !user && isHomeRoute;
  const isCustomerItemActive = (path) => {
    const [targetPath, targetQuery = ""] = path.split("?");
    if (location.pathname !== targetPath) return false;

    const targetParams = new URLSearchParams(targetQuery);
    const currentParams = new URLSearchParams(location.search);

    const targetEntries = Array.from(targetParams.entries());
    if (targetEntries.length === 0) {
      return Array.from(currentParams.keys()).length === 0;
    }

    return targetEntries.every(
      ([key, value]) => currentParams.get(key) === value
    );
  };
  const authLabel = user ? `Hi, ${(user.name || "User").split(" ")[0]}` : "Login";
  const accountAvatarSrc =
    user?.profileImage || user?.avatar || user?.photo || user?.image || user?.imageUrl || "";
  const accountAvatarInitial =
    ((user?.name || user?.storeName || "U").trim().slice(0, 1).toUpperCase() || "U");
  const sellerNameLabel = (user?.storeName || user?.name || "Seller").trim() || "Seller";
  const sellerAvatarSrc =
    user?.profileImage || user?.avatar || user?.photo || user?.image || user?.imageUrl || "";
  const sellerAvatarInitial = sellerNameLabel.slice(0, 1).toUpperCase() || "S";
  const sellerPendingOrders = Math.max(Number(user?.sellerPendingOrders || 0), 0);
  const scrollCategoryLinks = (direction = 1) => {
    const node = categoryLinksRef.current;
    if (!node) return;
    const delta = Math.max(Math.round(node.clientWidth * 0.62), 180) * direction;
    node.scrollBy({ left: delta, behavior: "smooth" });
  };
  const toggleAllCategories = (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    setAllCategoriesOpen((prev) => !prev);
  };

  const customerNavItems = CUSTOMER_CATEGORY_TREE.map((item) => ({
    label: item.label,
    path: buildCategoryPath({ category: item.category }),
  }));
  const activeCategoryGroup =
    CUSTOMER_CATEGORY_TREE.find((item) => item.label === activeMenuCategory) ||
    CUSTOMER_CATEGORY_TREE[0];

  useEffect(() => {
    setAllCategoriesOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!allCategoriesOpen) return undefined;

    const handleOutsideClick = (event) => {
      if (
        categoriesMenuRef.current &&
        !categoriesMenuRef.current.contains(event.target)
      ) {
        setAllCategoriesOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") setAllCategoriesOpen(false);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [allCategoriesOpen]);

  useEffect(() => {
    const node = categoryLinksRef.current;
    if (!node || isCartRoute) return undefined;

    const syncCategoryScrollState = () => {
      const maxScrollLeft = Math.max(node.scrollWidth - node.clientWidth, 0);
      setCanScrollCategoryRight(maxScrollLeft > 1 && node.scrollLeft < maxScrollLeft - 1);
    };

    syncCategoryScrollState();
    node.addEventListener("scroll", syncCategoryScrollState, { passive: true });
    window.addEventListener("resize", syncCategoryScrollState);

    return () => {
      node.removeEventListener("scroll", syncCategoryScrollState);
      window.removeEventListener("resize", syncCategoryScrollState);
    };
  }, [isCartRoute, location.pathname, location.search]);

  if (isAuthNav) {
    const isRegisterRoute = location.pathname === "/register";
    const sellerIntent = new URLSearchParams(location.search).get("seller") === "1";

    return (
      <header className="main-header auth-minimal-header">
        <Link className="brand" to="/">
          <img src={brandLogo} alt="Craftzy Gifts logo" className="brand-logo-head" />
          <span className="brand-head-copy">
            <span className="brand-head-text">Craftzy Gifts</span>
          </span>
        </Link>
        <nav className="auth-header-nav" aria-label="Auth actions">
          <Link className="auth-header-link" to="/">
            Back to Home
          </Link>
          {isRegisterRoute ? (
            <>
              <Link className="auth-header-link" to="/login">
                Login
              </Link>
              <Link
                className={`auth-header-link ${sellerIntent ? "active" : ""}`}
                to="/register?seller=1"
              >
                Become a Seller
              </Link>
            </>
          ) : (
            <Link className="auth-header-link" to="/register">
              Create Account
            </Link>
          )}
        </nav>
      </header>
    );
  }

  if (isSellerNav) {
      return (
        <header className="main-header seller-header seller-nav-header">
          <Link className="brand" to="/">
            <img src={brandLogo} alt="Craftzy Gifts logo" className="brand-logo-head" />
            <span className="brand-head-copy">
              <span className="brand-head-text">{brandLabel}</span>
              {brandSubtext && <span className="brand-head-sub">{brandSubtext}</span>}
            </span>
          </Link>

          <form className="search wide seller-search-form" onSubmit={handleCatalogSearch}>
            <input
              className="search-input seller-search-input"
              type="search"
              placeholder="Search hampers, gifts..."
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <button className="seller-search-submit" type="submit" aria-label="Search">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle
                  cx="11"
                  cy="11"
                  r="6.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                />
                <path d="M16 16l4.2 4.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
              </svg>
            </button>
          </form>

          <div className="seller-profile-wrap">
            <button
              className="icon-btn seller-notification-btn"
              type="button"
              aria-label="Pending orders"
              onClick={() => handleProtectedNav("/seller/orders?status=placed")}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 4.5a4 4 0 0 1 4 4v2.5c0 1.5.5 2.7 1.5 3.7l.8.8H5.7l.8-.8c1-1 1.5-2.2 1.5-3.7V8.5a4 4 0 0 1 4-4z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M10.2 18.2a2 2 0 0 0 3.6 0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              {sellerPendingOrders > 0 && <span className="icon-badge">{sellerPendingOrders}</span>}
            </button>
            <a className="seller-help-link" href="/#support">
              Help
            </a>
            <span className="seller-profile-name">{sellerNameLabel}</span>
            <div className="icon-group seller-icon-group">
              <div className="account-menu seller-account-menu" ref={accountRef}>
                <button
                  className={`icon-btn profile-icon-btn ${sellerAvatarSrc ? "has-avatar" : ""} ${
                    accountOpen ? "active" : ""
                  }`}
                  type="button"
                  aria-label="Profile menu"
                  aria-haspopup="menu"
                  aria-expanded={accountOpen}
                  onClick={() => {
                    if (!user) {
                      navigate("/login");
                      return;
                    }
                    setAccountOpen((prev) => !prev);
                  }}
                >
                  {sellerAvatarSrc ? (
                    <img className="seller-avatar-thumb" src={sellerAvatarSrc} alt={sellerNameLabel} />
                  ) : (
                    <span className="seller-avatar-fallback">{sellerAvatarInitial}</span>
                  )}
                </button>
                {accountOpen && (
                  <div className="account-dropdown seller-account-dropdown" role="menu">
                    {user ? (
                      <>
                        <button
                          className="dropdown-item"
                          type="button"
                          onClick={() => handleProtectedNav("/")}
                        >
                          Home
                        </button>
                        <button
                          className="dropdown-item"
                          type="button"
                          onClick={() => handleProtectedNav("/profile")}
                        >
                          My Profile
                        </button>
                        <button className="dropdown-item danger" type="button" onClick={handleLogout}>
                          Logout
                        </button>
                      </>
                    ) : (
                      <button
                        className="dropdown-item"
                        type="button"
                        onClick={() => handleProtectedNav("/login")}
                      >
                        Login
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

        <nav className="nav-links">
          <Link
            className={`nav-link ${sellerActive("/seller/dashboard") ? "active" : ""}`}
            to="/seller/dashboard"
          >
            Overview
          </Link>
          <Link
            className={`nav-link ${sellerActive("/seller/products") ? "active" : ""}`}
            to="/seller/products"
          >
            Products
          </Link>
          <Link
            className={`nav-link ${sellerActive("/seller/listed-items") ? "active" : ""}`}
            to="/seller/listed-items"
          >
            Custom Hamper Items
          </Link>
          <Link
            className={`nav-link ${sellerActive("/seller/orders") ? "active" : ""}`}
            to="/seller/orders"
          >
            Orders
          </Link>
          <Link
            className={`nav-link ${sellerActive("/seller/payments") ? "active" : ""}`}
            to="/seller/payments"
          >
            Payments
          </Link>
          <Link
            className={`nav-link ${sellerActive("/seller/settings") ? "active" : ""}`}
            to="/seller/settings"
          >
            Settings
          </Link>
          <Link
            className={`nav-link ${sellerActive("/profile") ? "active" : ""}`}
            to="/profile"
          >
            My Profile
          </Link>
        </nav>
      </header>
    );
  }

  if (isAdminNav) {
    return (
      <header className="main-header seller-header">
        <Link className="brand" to="/">
          <img src={brandLogo} alt="Craftzy Gifts logo" className="brand-logo-head" />
          <span className="brand-head-copy">
            <span className="brand-head-text">{brandLabel}</span>
            {brandSubtext && <span className="brand-head-sub">{brandSubtext}</span>}
          </span>
        </Link>

        <nav className="nav-links">
          <Link
            className={`nav-link ${adminActive("/admin/dashboard") ? "active" : ""}`}
            to="/admin/dashboard"
          >
            Dashboard
          </Link>
          <Link
            className={`nav-link ${adminActive("/admin/sellers") ? "active" : ""}`}
            to="/admin/sellers"
          >
            Sellers
          </Link>
          <Link
            className={`nav-link ${adminActive("/admin/products") ? "active" : ""}`}
            to="/admin/products"
          >
            Products
          </Link>
          <Link
            className={`nav-link ${adminActive("/admin/orders") ? "active" : ""}`}
            to="/admin/orders"
          >
            Orders
          </Link>
          <Link
            className={`nav-link ${adminActive("/admin/reports") ? "active" : ""}`}
            to="/admin/reports"
          >
            Reports
          </Link>
        </nav>

        <div className="header-right">
          <form className="search wide" onSubmit={handleCatalogSearch}>
            <input
              className="search-input"
              type="search"
              placeholder="Search products..."
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </form>
          <div className="seller-toolbar">
            <button className="btn ghost" type="button" onClick={() => navigate("/profile")}>
              Profile
            </button>
            <button className="btn ghost" type="button" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="main-header modern-shop-header">
      <div className="header-utility-bar">
        <div className="utility-left">
          <span className="utility-item">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 7h11v8H3z" />
              <path d="M14 10h3l2 2v3h-5z" />
              <circle cx="7" cy="17" r="1.4" />
              <circle cx="17" cy="17" r="1.4" />
            </svg>
            Free Shipping over ₹499
          </span>
          <span className="utility-item">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3l7 3v5c0 4.4-2.8 8.4-7 10-4.2-1.6-7-5.6-7-10V6l7-3z" />
            </svg>
            100% Handmade Guarantee
          </span>
          <span className="utility-item">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 8V4h4" />
              <path d="M20 16v4h-4" />
              <path d="M20 8a7 7 0 0 0-12-3L4 8" />
              <path d="M4 16a7 7 0 0 0 12 3l4-3" />
            </svg>
            Easy Returns
          </span>
        </div>
        <div className="utility-right">
          <a href="/">Home</a>
          <a href="/#about-us">About Us</a>
          <a href="/#support">Contact</a>
        </div>
      </div>

      <div className="header-main-row">
          <Link className="brand" to="/">
            <img src={brandLogo} alt="Craftzy Gifts logo" className="brand-logo-head" />
            <span className="brand-head-copy">
              <span className="brand-head-text">{brandLabel}</span>
              {brandSubtext && <span className="brand-head-sub">{brandSubtext}</span>}
            </span>
          </Link>

          <form className="header-search-form" onSubmit={handleCatalogSearch}>
            <input
              className="search-input header-search-input"
              type="search"
              placeholder="Search for handmade gifts, hampers, crafts..."
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <button className="header-search-btn" type="submit" aria-label="Search">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle
                  cx="11"
                  cy="11"
                  r="6.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path d="M16 16l4.2 4.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            </button>
          </form>

          <div className="header-actions-row">
            {showGuestAuthButtons ? (
              <div className="header-guest-auth">
                <Link className="header-auth-link" to="/register?seller=1">
                  Become a Seller
                </Link>
                <Link className="header-auth-link" to="/login">
                  Login
                </Link>
              </div>
            ) : (
              <div className="account-menu" ref={accountRef}>
                <button
                  className={`header-auth-link ${user ? "account-trigger" : ""}`}
                  type="button"
                  aria-expanded={accountOpen}
                  onClick={() => {
                    if (!user) {
                      navigate("/login");
                      return;
                    }
                    setAccountOpen((prev) => !prev);
                  }}
                >
                  {user ? (
                    <>
                      {accountAvatarSrc ? (
                        <img
                          className="header-account-avatar"
                          src={accountAvatarSrc}
                          alt={user.name || "Profile"}
                        />
                      ) : (
                        <span className="header-account-avatar-fallback">
                          {accountAvatarInitial}
                        </span>
                      )}
                      <span>{authLabel}</span>
                    </>
                  ) : (
                    authLabel
                  )}
                </button>
                {accountOpen && (
                  <div className="account-dropdown" role="menu">
                    {user ? (
                      <>
                        <button
                          className="dropdown-item"
                          type="button"
                          onClick={() => handleProtectedNav("/")}
                        >
                          Home
                        </button>
                        <button
                          className="dropdown-item"
                          type="button"
                          onClick={() => handleProtectedNav("/profile")}
                        >
                          My Profile
                        </button>
                        <button className="dropdown-item" type="button" onClick={handleLogout}>
                          Logout
                        </button>
                      </>
                    ) : (
                      <button
                        className="dropdown-item"
                        type="button"
                        onClick={() => handleProtectedNav("/login")}
                      >
                        Login
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            <Link className="icon-btn" to={toAuthPath("/wishlist")} aria-label="Wishlist">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 20s-7-4.3-7-9a4.5 4.5 0 0 1 8-2.6A4.5 4.5 0 0 1 19 11c0 4.7-7 9-7 9z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
              {wishlistCount > 0 && <span className="icon-badge">{wishlistCount}</span>}
            </Link>

            <Link className="icon-btn" to={toAuthPath("/cart")} aria-label="Cart">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M6 6h15l-1.5 8.5H8.5L6 6z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <circle cx="9" cy="19" r="1.5" />
                <circle cx="18" cy="19" r="1.5" />
              </svg>
              {cartCount > 0 && <span className="icon-badge">{cartCount}</span>}
            </Link>
          </div>
      </div>

      {!isCartRoute && (
        <nav className="header-category-row" aria-label="Product categories">
          {showAllCategoriesMenu && (
            <div
              className={`header-categories-menu ${allCategoriesOpen ? "open" : ""}`}
              ref={categoriesMenuRef}
            >
              <button
                type="button"
                className={`header-category-link header-category-toggle ${
                  allCategoriesOpen ? "active" : ""
                }`}
                aria-haspopup="dialog"
                aria-expanded={allCategoriesOpen}
                aria-controls="all-categories-panel"
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={toggleAllCategories}
              >
                <span>All Categories</span>
                <span className="header-category-caret" aria-hidden="true">
                  ▾
                </span>
              </button>

              {allCategoriesOpen && (
                <div
                  id="all-categories-panel"
                  className="header-categories-panel"
                  role="dialog"
                  aria-label="All product categories"
                >
                  <div className="header-categories-main" role="listbox">
                    {CUSTOMER_CATEGORY_TREE.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        className={`header-main-category ${
                          activeCategoryGroup.label === item.label ? "active" : ""
                        }`}
                        onMouseEnter={() => setActiveMenuCategory(item.label)}
                        onFocus={() => setActiveMenuCategory(item.label)}
                        onClick={() => setActiveMenuCategory(item.label)}
                      >
                        <span>{item.label}</span>
                        <span className="header-main-category-arrow" aria-hidden="true">
                          ›
                        </span>
                      </button>
                    ))}
                    {showCategoryToggle && (
                      <button
                        type="button"
                        className={`header-main-category header-main-category-filter ${
                          isFilterActive ? "active" : ""
                        }`}
                        aria-pressed={isFilterActive}
                        onClick={() => {
                          onFilterClick();
                          setAllCategoriesOpen(false);
                        }}
                      >
                        <span>Filters</span>
                        <span className="header-main-category-arrow" aria-hidden="true">
                          ›
                        </span>
                      </button>
                    )}
                  </div>
                  <div className="header-categories-sub">
                    <div className="header-sub-head">
                      <p>{activeCategoryGroup.label}</p>
                      <Link
                        className="header-sub-view-all"
                        to={buildCategoryPath({ category: activeCategoryGroup.category })}
                        onClick={() => setAllCategoriesOpen(false)}
                      >
                        View all
                      </Link>
                    </div>
                    <div className="header-sub-list">
                      {activeCategoryGroup.subcategories.length > 0 ? (
                        activeCategoryGroup.subcategories.map((item) => (
                          <Link
                            key={`${activeCategoryGroup.label}-${item}`}
                            className="header-sub-link"
                            to={buildCategoryPath({
                              category: activeCategoryGroup.category,
                              query: item,
                            })}
                            onClick={() => setAllCategoriesOpen(false)}
                          >
                            {item}
                          </Link>
                        ))
                      ) : (
                        <Link
                          className="header-sub-link"
                          to={buildCategoryPath({ category: activeCategoryGroup.category })}
                          onClick={() => setAllCategoriesOpen(false)}
                        >
                          Shop {activeCategoryGroup.label}
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="header-category-links-shell">
            <div className="header-category-links" ref={categoryLinksRef}>
              {customerNavItems.map((item) => (
                <Link
                  key={item.label}
                  className={`header-category-link ${isCustomerItemActive(item.path) ? "active" : ""}`}
                  to={item.path}
                >
                  {item.label}
                </Link>
              ))}
            </div>
            <button
              type="button"
              className={`header-category-more-indicator ${
                canScrollCategoryRight ? "visible" : "hidden"
              }`}
              aria-label="Scroll categories right"
              onClick={() => scrollCategoryLinks(1)}
              disabled={!canScrollCategoryRight}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M8 4l6 6-6 6" />
              </svg>
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}

