import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import logoPng from "../assets/logo.png";
import logoCartPng from "../assets/logo-cart.png";
import { getCart } from "../utils/cart";
import { getWishlist } from "../utils/wishlist";
import { logoutSession } from "../utils/authSession";
import { readStoredSessionClaims } from "../utils/authRoute";
import { openNotificationStream } from "../utils/notificationStream";
import {
  buildSellerHeaderNavItems,
  isWorkspacePathActive,
} from "../utils/sellerWorkspace";
import {
  DEFAULT_CATEGORY_TREE,
  buildCategoryPath,
  loadCategoryTree,
} from "../utils/categoryMaster";

import { API_URL } from "../apiBase";
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

const formatNotificationDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
  }).format(date);
};

const HeaderMenuIcon = ({ kind }) => {
  if (kind === "back") {
    return (
      <svg className="header-inline-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m10 6-6 6 6 6" />
        <path d="M5 12h15" />
      </svg>
    );
  }
  if (kind === "login") {
    return (
      <svg className="header-inline-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M13 4h6v16h-6" />
        <path d="M3 12h11" />
        <path d="m10 9 3 3-3 3" />
      </svg>
    );
  }
  if (kind === "logout") {
    return (
      <svg className="header-inline-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M11 4H5v16h6" />
        <path d="M21 12H10" />
        <path d="m13 9-3 3 3 3" />
      </svg>
    );
  }
  if (kind === "home") {
    return (
      <svg className="header-inline-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m4 11 8-7 8 7" />
        <path d="M6.5 10.5V20h11v-9.5" />
      </svg>
    );
  }
  if (kind === "profile") {
    return (
      <svg className="header-inline-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
      </svg>
    );
  }
  if (kind === "seller") {
    return (
      <svg className="header-inline-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 10h16" />
        <path d="M6 10v8h12v-8" />
        <path d="m6 10 1.8-4h8.4l1.8 4" />
      </svg>
    );
  }
  if (kind === "register") {
    return (
      <svg className="header-inline-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 18a5.5 5.5 0 0 1 11 0" />
        <path d="M18 8v6" />
        <path d="M15 11h6" />
      </svg>
    );
  }
  return null;
};

const HeaderUtilityIcon = ({ kind }) => {
  if (kind === "bell") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 3.8c-2.9 0-5.2 2.3-5.2 5.2v2.6c0 1.3-.5 2.5-1.4 3.4l-.6.6h14.4l-.6-.6c-.9-.9-1.4-2.1-1.4-3.4V9c0-2.9-2.3-5.2-5.2-5.2Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="17.5" r="1.15" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }
  if (kind === "menu") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h16" />
        <path d="M4 12h16" />
        <path d="M4 17h16" />
      </svg>
    );
  }
  if (kind === "close") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 6l12 12" />
        <path d="M18 6 6 18" />
      </svg>
    );
  }
  if (kind === "search") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4 4" />
      </svg>
    );
  }
  return null;
};

const HeaderBottomNavIcon = ({ kind }) => {
  if (kind === "home") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m4 11 8-7 8 7" />
        <path d="M6.5 10.5V20h11v-9.5" />
      </svg>
    );
  }
  if (kind === "products") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="4" width="6" height="6" rx="1.2" />
        <rect x="14" y="4" width="6" height="6" rx="1.2" />
        <rect x="4" y="14" width="6" height="6" rx="1.2" />
        <rect x="14" y="14" width="6" height="6" rx="1.2" />
      </svg>
    );
  }
  if (kind === "wishlist") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 20s-7-4.3-7-9a4.5 4.5 0 0 1 8-2.6A4.5 4.5 0 0 1 19 11c0 4.7-7 9-7 9z" />
      </svg>
    );
  }
  if (kind === "profile") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
      </svg>
    );
  }
  return null;
};

export default function Header({ variant, onFilterClick, isFilterActive = false }) {
  const [user, setUser] = useState(readStoredUser);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountMenuStyle, setAccountMenuStyle] = useState(null);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationItems, setNotificationItems] = useState([]);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationMenuStyle, setNotificationMenuStyle] = useState(null);
  const [allCategoriesOpen, setAllCategoriesOpen] = useState(false);
  const [canScrollCategoryRight, setCanScrollCategoryRight] = useState(false);
  const [customerCategoryTree, setCustomerCategoryTree] = useState(DEFAULT_CATEGORY_TREE);
  const [activeMenuCategory, setActiveMenuCategory] = useState(
    DEFAULT_CATEGORY_TREE[0]?.label || ""
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileMenuPanelStyle, setMobileMenuPanelStyle] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const headerRef = useRef(null);
  const accountButtonRef = useRef(null);
  const accountDropdownRef = useRef(null);
  const notificationButtonRef = useRef(null);
  const notificationMobileButtonRef = useRef(null);
  const notificationDropdownRef = useRef(null);
  const categoriesMenuRef = useRef(null);
  const categoryLinksRef = useRef(null);
  const isAuthNav = variant === "auth";
  const isSellerNav = variant === "seller";
  const isCartRoute = location.pathname === "/cart";
  const brandLogo = isCartRoute ? logoCartPng : logoPng;
  const brandLabel = isCartRoute ? "Your Cart" : "Craftzy Gifts";
  const brandSubtext = isCartRoute ? "Review your items before checkout" : "";
  const categoryTree =
    Array.isArray(customerCategoryTree) && customerCategoryTree.length > 0
      ? customerCategoryTree
      : DEFAULT_CATEGORY_TREE;

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
  }, [user]);

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
    let ignore = false;

    const hydrateCategoryTree = async () => {
      const nextTree = await loadCategoryTree();
      if (!ignore && Array.isArray(nextTree) && nextTree.length > 0) {
        setCustomerCategoryTree(nextTree);
      }
    };

    hydrateCategoryTree();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (categoryTree.some((item) => item.label === activeMenuCategory)) return;
    setActiveMenuCategory(categoryTree[0]?.label || "");
  }, [categoryTree, activeMenuCategory]);

  useEffect(() => {
    if (!accountOpen) return undefined;
    const handleOutsideClick = (event) => {
      if (!(event.target instanceof Node)) return;
      const insideTrigger =
        accountButtonRef.current && accountButtonRef.current.contains(event.target);
      const insideDropdown =
        accountDropdownRef.current && accountDropdownRef.current.contains(event.target);
      if (!insideTrigger && !insideDropdown) {
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

  useEffect(() => {
    if (!notificationOpen) return undefined;
    const handleOutsideClick = (event) => {
      const insideTrigger = [notificationButtonRef.current, notificationMobileButtonRef.current]
        .filter(Boolean)
        .some((node) => node.contains(event.target));
      const insideDropdown =
        notificationDropdownRef.current &&
        notificationDropdownRef.current.contains(event.target);
      if (!insideTrigger && !insideDropdown) {
        setNotificationOpen(false);
      }
    };
    const handleEscape = (event) => {
      if (event.key === "Escape") setNotificationOpen(false);
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [notificationOpen]);

  const closeAccount = () => setAccountOpen(false);

  const getAccountAnchor = () => {
    const anchor = accountButtonRef.current;
    if (!anchor) return null;
    return anchor.offsetParent !== null ? anchor : accountButtonRef.current;
  };

  const updateAccountMenuPosition = useCallback(() => {
    if (typeof window === "undefined") return;
    const anchor = getAccountAnchor();
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const viewportWidth = Math.max(
      window.innerWidth || 0,
      document.documentElement?.clientWidth || 0
    );
    const minWidth = isSellerNav ? 180 : 240;
    const maxWidth = isSellerNav ? 220 : 320;
    const width = Math.max(minWidth, Math.min(maxWidth, viewportWidth - 24));
    const left = Math.max(12, Math.min(rect.right - width, viewportWidth - width - 12));

    setAccountMenuStyle({
      position: "fixed",
      top: `${Math.round(rect.bottom + 10)}px`,
      left: `${Math.round(left)}px`,
      right: "auto",
      width: `${Math.round(width)}px`,
    });
  }, [isSellerNav]);

  const getNotificationAnchor = () => {
    const candidates = [notificationButtonRef.current, notificationMobileButtonRef.current];
    const visibleNode = candidates.find((node) => node && node.offsetParent !== null);
    return visibleNode || candidates.find(Boolean);
  };

  const updateNotificationMenuPosition = useCallback(() => {
    if (typeof window === "undefined") return;
    const anchor = getNotificationAnchor();
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const viewportWidth = Math.max(
      window.innerWidth || 0,
      document.documentElement?.clientWidth || 0
    );
    const width = Math.max(280, Math.min(360, viewportWidth - 24));
    const left = Math.max(12, Math.min(rect.right - width, viewportWidth - width - 12));

    setNotificationMenuStyle({
      position: "fixed",
      top: `${Math.round(rect.bottom + 10)}px`,
      left: `${Math.round(left)}px`,
      right: "auto",
      width: `${Math.round(width)}px`,
    });
  }, []);

  const syncNotificationState = (items = [], unreadCount = 0) => {
    setNotificationItems(Array.isArray(items) ? items : []);
    setNotificationUnreadCount(Math.max(0, Number(unreadCount || 0)));
  };

  const handleLogout = async () => {
    await logoutSession();
    setUser(null);
    closeAccount();
    navigate("/");
  };

  const toggleAccountMenu = () => {
    if (!user) {
      navigate("/login");
      return;
    }
    setAccountOpen((prev) => {
      const next = !prev;
      if (next) {
        updateAccountMenuPosition();
      }
      return next;
    });
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
  const effectiveUserRole = String(user?.role || readStoredSessionClaims().role || "")
    .trim()
    .toLowerCase();
  const accountMenuUsesStore = isSellerNav || effectiveUserRole === "seller";
  const sellerNameLabel = (user?.storeName || user?.name || "Seller").trim() || "Seller";
  const sellerAvatarSrc =
    user?.profileImage || user?.avatar || user?.photo || user?.image || user?.imageUrl || "";
  const sellerAvatarInitial = sellerNameLabel.slice(0, 1).toUpperCase() || "S";
  const sellerId = String(user?.id || user?._id || readUserIdFromToken()).trim();
  const sellerStorePath = sellerId ? `/seller/store/${sellerId}` : "/seller/dashboard";
  const sellerHeaderNavItems = buildSellerHeaderNavItems({ sellerStorePath });
  const accountMenuPath = accountMenuUsesStore ? sellerStorePath : "/profile";
  const accountMenuLabel = accountMenuUsesStore ? "My Store" : "My Profile";
  const accountMenuIcon = accountMenuUsesStore ? "seller" : "profile";
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

  const customerNavItems = categoryTree.map((item) => ({
    label: item.label,
    path: buildCategoryPath({ category: item.category }),
  }));
  const activeCategoryGroup =
    categoryTree.find((item) => item.label === activeMenuCategory) ||
    categoryTree[0];
  const customerMobileLinks = [
    { label: "Home", href: "/" },
    { label: "Products", href: "/products" },
    { label: "About Us", href: "/#about-us" },
    { label: "Contact", href: "/#support" },
  ];
  const isCustomerUser = Boolean(user) && (!effectiveUserRole || effectiveUserRole === "customer");
  const showCustomerNotification = isCustomerUser && !isSellerNav && !isAuthNav;
  const showNotificationMenu = isSellerNav || showCustomerNotification;
  const customerBottomNavItems = [
    { label: "Home", to: "/", icon: "home", active: location.pathname === "/" },
    {
      label: "Products",
      to: "/products",
      icon: "products",
      active: location.pathname === "/products" || location.pathname.startsWith("/products/"),
    },
    {
      label: "Wishlist",
      to: toAuthPath("/wishlist"),
      icon: "wishlist",
      active: location.pathname === "/wishlist",
    },
    {
      label: user ? (accountMenuUsesStore ? "Store" : "Profile") : "Login",
      to: user ? accountMenuPath : "/login",
      icon: "profile",
      active: user
        ? accountMenuUsesStore
          ? location.pathname.startsWith("/seller/store/") ||
            location.pathname.startsWith("/store/") ||
            location.pathname.startsWith("/seller/")
          : location.pathname === "/profile"
        : location.pathname === "/login",
    },
  ];
  const showMobileCategoryTabs = location.pathname === "/products";

  const updateMobileMenuPanelPosition = () => {
    const headerNode = headerRef.current;
    if (!headerNode) {
      setMobileMenuPanelStyle(null);
      return;
    }

    const activeMenuButton = Array.from(
      headerNode.querySelectorAll(".customer-menu-toggle")
    ).find((node) => node instanceof HTMLElement && node.offsetParent !== null);

    if (!activeMenuButton) {
      setMobileMenuPanelStyle(null);
      return;
    }

    const headerRect = headerNode.getBoundingClientRect();
    const buttonRect = activeMenuButton.getBoundingClientRect();

    setMobileMenuPanelStyle({
      top: `${Math.max(buttonRect.bottom - headerRect.top + 8, 0)}px`,
      right: `${Math.max(headerRect.right - buttonRect.right, 0)}px`,
    });
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);
  const closeMobileOverlays = () => {
    setMobileMenuOpen(false);
    setMobileSearchOpen(false);
    setAllCategoriesOpen(false);
    setAccountOpen(false);
  };
  const toggleMobileMenu = () => {
    setMobileMenuOpen((prev) => {
      const next = !prev;
      if (next) {
        setMobileSearchOpen(false);
        setAccountOpen(false);
        setAllCategoriesOpen(false);
      }
      return next;
    });
  };
  const toggleMobileSearch = () => {
    setMobileSearchOpen((prev) => {
      const next = !prev;
      if (next) {
        setMobileMenuOpen(false);
        setAllCategoriesOpen(false);
      }
      return next;
    });
  };

  useEffect(() => {
    if (!showNotificationMenu || !user) {
      syncNotificationState([], 0);
      return undefined;
    }

    let active = true;
    let intervalId = null;
    let hasLoadedOnce = false;
    const eventName = isSellerNav ? "seller:notifications-updated" : "customer:notifications-updated";

    const fetchNotifications = async () => {
      const token = localStorage.getItem("token");
      if (!token) return;

      if (active && !hasLoadedOnce) {
        setNotificationLoading(true);
      }

      try {
        const res = await fetch(`${API_URL}/api/users/me/notifications?limit=6`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!active) return;

        if (res.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          localStorage.removeItem(USER_PROFILE_IMAGE_KEY);
          setUser(null);
          syncNotificationState([], 0);
          window.dispatchEvent(new Event("user:updated"));
          navigate("/login");
          return;
        }

        if (!res.ok) return;
        syncNotificationState(data?.items, data?.unreadCount);
      } catch {
        if (!active) return;
      } finally {
        hasLoadedOnce = true;
        if (active) setNotificationLoading(false);
      }
    };

    fetchNotifications();
    intervalId = window.setInterval(fetchNotifications, 60000);
    window.addEventListener(eventName, fetchNotifications);
    const closeStream = openNotificationStream({
      onUpdate: () => {
        window.dispatchEvent(new Event(eventName));
      },
    });

    return () => {
      active = false;
      if (intervalId) window.clearInterval(intervalId);
      window.removeEventListener(eventName, fetchNotifications);
      closeStream();
    };
  }, [isSellerNav, navigate, showNotificationMenu, user]);

  const markNotificationsRead = async ({ ids = [], all = false } = {}) => {
    const token = localStorage.getItem("token");
    if (!token) return null;

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
      if (!res.ok) return null;

      const normalizedIds = Array.isArray(ids)
        ? ids.map((value) => String(value || "").trim()).filter(Boolean)
        : [];
      setNotificationItems((prev) =>
        prev.map((item) =>
          all || normalizedIds.includes(String(item?.id || "").trim())
            ? { ...item, isRead: true }
            : item
        )
      );
      setNotificationUnreadCount(Math.max(0, Number(data?.unreadCount || 0)));
      window.dispatchEvent(
        new Event(isSellerNav ? "seller:notifications-updated" : "customer:notifications-updated")
      );
      return data;
    } catch {
      return null;
    }
  };

  const handleOpenNotification = async (item) => {
    const itemId = String(item?.id || "").trim();
    const nextLink = String(item?.link || "").trim();
    if (itemId && item?.isRead !== true) {
      await markNotificationsRead({ ids: [itemId] });
    }
    setNotificationOpen(false);
    navigate(nextLink || (isSellerNav ? "/seller/dashboard" : "/orders"));
  };

  useEffect(() => {
    if (!notificationOpen) return undefined;

    updateNotificationMenuPosition();
    const syncPosition = () => updateNotificationMenuPosition();

    window.addEventListener("resize", syncPosition);
    window.addEventListener("scroll", syncPosition, true);

    return () => {
      window.removeEventListener("resize", syncPosition);
      window.removeEventListener("scroll", syncPosition, true);
    };
  }, [notificationOpen, updateNotificationMenuPosition]);

  useEffect(() => {
    if (!accountOpen) return undefined;

    updateAccountMenuPosition();
    const syncPosition = () => updateAccountMenuPosition();

    window.addEventListener("resize", syncPosition);
    window.addEventListener("scroll", syncPosition, true);

    return () => {
      window.removeEventListener("resize", syncPosition);
      window.removeEventListener("scroll", syncPosition, true);
    };
  }, [accountOpen, isSellerNav, updateAccountMenuPosition]);

  const notificationDropdown =
    showNotificationMenu && notificationOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={notificationDropdownRef}
            className={`account-dropdown seller-notification-dropdown ${
              isSellerNav ? "" : "customer-notification-dropdown"
            }`}
            role="menu"
            style={
              notificationMenuStyle || {
                position: "fixed",
                top: "64px",
                right: "12px",
                left: "auto",
                width: "min(360px, calc(100vw - 24px))",
              }
            }
          >
            <div className="seller-notification-dropdown-head">
              <strong>Notifications</strong>
              <button
                className="seller-notification-mark-btn"
                type="button"
                onClick={() => markNotificationsRead({ all: true })}
                disabled={notificationUnreadCount <= 0}
              >
                Mark all read
              </button>
            </div>
            <div className="seller-notification-dropdown-list">
              {notificationItems.map((item) => (
                <button
                  key={item.id}
                  className={`seller-notification-item ${item.isRead ? "" : "is-unread"}`}
                  type="button"
                  onClick={() => handleOpenNotification(item)}
                >
                  <span className="seller-notification-item-copy">
                    <strong>{item.title || "Notification"}</strong>
                    <span>{item.message || "Update available."}</span>
                  </span>
                  <span className="seller-notification-item-meta">
                    {!item.isRead ? <em>New</em> : null}
                    <small>{formatNotificationDate(item.createdAt)}</small>
                  </span>
                </button>
              ))}
              {!notificationLoading && notificationItems.length === 0 && (
                <p className="seller-notification-empty">No notifications yet.</p>
              )}
              {notificationLoading && notificationItems.length === 0 && (
                <p className="seller-notification-empty">Loading notifications...</p>
              )}
            </div>
            <button
              className="seller-notification-view-all"
              type="button"
              onClick={() => {
                setNotificationOpen(false);
                navigate(isSellerNav ? "/seller/dashboard" : "/orders");
              }}
            >
              {isSellerNav ? "View all in dashboard" : "View all orders"}
            </button>
          </div>,
          document.body
        )
      : null;

  const accountDropdown =
    accountOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={accountDropdownRef}
            className={`account-dropdown ${isSellerNav ? "seller-account-dropdown" : ""}`}
            role="menu"
            style={
              accountMenuStyle || {
                position: "fixed",
                top: isSellerNav ? "64px" : "76px",
                right: "12px",
                left: "auto",
                width: isSellerNav
                  ? "min(220px, calc(100vw - 24px))"
                  : "min(240px, calc(100vw - 24px))",
              }
            }
          >
            {user ? (
              <>
                <button
                  className="dropdown-item with-icon"
                  type="button"
                  onClick={() => handleProtectedNav("/")}
                >
                  <HeaderMenuIcon kind="home" />
                  Home
                </button>
                <button
                  className="dropdown-item with-icon"
                  type="button"
                  onClick={() => handleProtectedNav(accountMenuPath)}
                >
                  <HeaderMenuIcon kind={accountMenuIcon} />
                  {accountMenuLabel}
                </button>
                <button
                  className={`dropdown-item with-icon ${isSellerNav ? "danger" : ""}`}
                  type="button"
                  onClick={handleLogout}
                >
                  <HeaderMenuIcon kind="logout" />
                  Logout
                </button>
              </>
            ) : (
              <button
                className="dropdown-item with-icon"
                type="button"
                onClick={() => handleProtectedNav("/login")}
              >
                <HeaderMenuIcon kind="login" />
                Login
              </button>
            )}
          </div>,
          document.body
        )
      : null;
  const customerBottomNavPortal =
    !isCartRoute && typeof document !== "undefined"
      ? createPortal(
          <nav
            className={`header-mobile-bottom-nav ${
              mobileMenuOpen || mobileSearchOpen ? "is-hidden" : ""
            }`}
            aria-label="Quick navigation"
          >
            {customerBottomNavItems.map((item) => (
              <Link
                key={item.label}
                className={`header-mobile-bottom-link ${item.active ? "active" : ""}`}
                to={item.to}
                onClick={closeMobileOverlays}
              >
                <span className="header-mobile-bottom-icon">
                  <HeaderBottomNavIcon kind={item.icon} />
                </span>
                <span className="header-mobile-bottom-label">{item.label}</span>
              </Link>
            ))}
          </nav>,
          document.body
        )
      : null;

  useEffect(() => {
    setAllCategoriesOpen(false);
    setAccountOpen(false);
    setNotificationOpen(false);
    setAccountMenuStyle(null);
    setNotificationMenuStyle(null);
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

  useEffect(() => {
    setMobileMenuOpen(false);
    setMobileSearchOpen(Boolean(new URLSearchParams(location.search).get("q") || ""));
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!mobileMenuOpen) {
      setMobileMenuPanelStyle(null);
      return undefined;
    }

    const syncPosition = () => updateMobileMenuPanelPosition();
    syncPosition();

    window.addEventListener("resize", syncPosition);
    window.addEventListener("scroll", syncPosition, true);

    return () => {
      window.removeEventListener("resize", syncPosition);
      window.removeEventListener("scroll", syncPosition, true);
    };
  }, [mobileMenuOpen, location.pathname, location.search]);

  useEffect(() => {
    if (!mobileMenuOpen && !mobileSearchOpen) return undefined;

    const handleEscape = (event) => {
      if (event.key !== "Escape") return;
      setMobileMenuOpen(false);
      setMobileSearchOpen(false);
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [mobileMenuOpen, mobileSearchOpen]);

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
          <Link className="auth-header-link with-icon" to="/">
            <HeaderMenuIcon kind="back" />
            <span className="auth-header-label">Back to Home</span>
          </Link>
          {isRegisterRoute ? (
            <>
              <Link className="auth-header-link with-icon" to="/login">
                <HeaderMenuIcon kind="login" />
                <span className="auth-header-label">Login</span>
              </Link>
              <Link
                className={`auth-header-link with-icon ${sellerIntent ? "active" : ""}`}
                to="/register?seller=1"
              >
                <HeaderMenuIcon kind="seller" />
                <span className="auth-header-label">Become a Seller</span>
              </Link>
            </>
          ) : (
            <Link className="auth-header-link with-icon" to="/register">
              <HeaderMenuIcon kind="register" />
              <span className="auth-header-label">Create Account</span>
            </Link>
          )}
        </nav>
      </header>
    );
  }

  if (isSellerNav) {
      return (
        <header
          className={`main-header seller-header seller-nav-header${mobileMenuOpen ? " mobile-menu-open" : ""}${
            mobileSearchOpen ? " mobile-search-open" : ""
          }`}
        >
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
            <div className="seller-mobile-actions">
              <button
                className={`icon-btn mobile-header-btn ${mobileSearchOpen ? "active" : ""}`}
                type="button"
                aria-label={mobileSearchOpen ? "Close search" : "Open search"}
                aria-expanded={mobileSearchOpen}
                onClick={toggleMobileSearch}
              >
                <HeaderUtilityIcon kind={mobileSearchOpen ? "close" : "search"} />
              </button>
              <button
                className={`icon-btn mobile-header-btn ${mobileMenuOpen ? "active" : ""}`}
                type="button"
                aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
                aria-expanded={mobileMenuOpen}
                onClick={toggleMobileMenu}
              >
                <HeaderUtilityIcon kind={mobileMenuOpen ? "close" : "menu"} />
              </button>
            </div>
            <div className="seller-notification-menu">
              <button
                ref={notificationButtonRef}
                className={`icon-btn seller-notification-btn ${notificationOpen ? "active" : ""}`}
                type="button"
                aria-label="Notifications"
                aria-haspopup="menu"
                aria-expanded={notificationOpen}
                onClick={() => {
                  if (!notificationOpen) {
                    updateNotificationMenuPosition();
                  }
                  setNotificationOpen((prev) => !prev);
                }}
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
                <span className="seller-notification-label">Alerts</span>
                {notificationUnreadCount > 0 && (
                  <span className="icon-badge">{notificationUnreadCount}</span>
                )}
              </button>
            </div>
            <Link className="seller-help-link" to="/seller/messages">
              Support
            </Link>
            <span className="seller-profile-name">{sellerNameLabel}</span>
            <div className="icon-group seller-icon-group">
              <div className="account-menu seller-account-menu">
                <button
                  ref={accountButtonRef}
                  className={`icon-btn profile-icon-btn ${sellerAvatarSrc ? "has-avatar" : ""} ${
                    accountOpen ? "active" : ""
                  }`}
                  type="button"
                  aria-label="Account menu"
                  aria-haspopup="menu"
                  aria-expanded={accountOpen}
                  onClick={toggleAccountMenu}
                >
                  {sellerAvatarSrc ? (
                    <img className="seller-avatar-thumb" src={sellerAvatarSrc} alt={sellerNameLabel} />
                  ) : (
                    <span className="seller-avatar-fallback">{sellerAvatarInitial}</span>
                  )}
                </button>
              </div>
            </div>
          </div>
          {notificationDropdown}
          {accountDropdown}

          <nav className="nav-links">
            {sellerHeaderNavItems.map((item) => (
              <Link
                key={item.id}
                className={`nav-link ${isWorkspacePathActive(location, item) ? "active" : ""}`}
                to={item.path}
                onClick={closeMobileMenu}
              >
                {item.label}
              </Link>
            ))}
          </nav>
      </header>
    );
  }

  return (
    <>
      <header
        ref={headerRef}
        className={`main-header modern-shop-header${mobileMenuOpen ? " mobile-menu-open" : ""}${
          mobileSearchOpen ? " mobile-search-open" : ""
        }${showMobileCategoryTabs ? " mobile-tabs-enabled" : ""}`}
      >
        <div className="header-utility-bar">
        <div className="utility-left">
          <span className="utility-item">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 7h11v8H3z" />
              <path d="M14 10h3l2 2v3h-5z" />
              <circle cx="7" cy="17" r="1.4" />
              <circle cx="17" cy="17" r="1.4" />
            </svg>
            Complimentary shipping on orders above ₹499
          </span>
          <span className="utility-item">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3l7 3v5c0 4.4-2.8 8.4-7 10-4.2-1.6-7-5.6-7-10V6l7-3z" />
            </svg>
            Artfully handcrafted quality
          </span>
          <span className="utility-item">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 8V4h4" />
              <path d="M20 16v4h-4" />
              <path d="M20 8a7 7 0 0 0-12-3L4 8" />
              <path d="M4 16a7 7 0 0 0 12 3l4-3" />
            </svg>
            Easy returns with thoughtful support
          </span>
        </div>
        <div className="utility-right">
          <a href="/">Home</a>
          <a href="/products">Products</a>
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
              placeholder="Search artisanal gifts, curated hampers, keepsakes..."
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
                <Link className="header-auth-link with-icon" to="/register?seller=1">
                  <HeaderMenuIcon kind="seller" />
                  Become a Seller
                </Link>
                <Link className="header-auth-link with-icon" to="/login">
                  <HeaderMenuIcon kind="login" />
                  Login
                </Link>
              </div>
            ) : (
              <div className="account-menu">
                <button
                  ref={accountButtonRef}
                  className={`header-auth-link ${user ? "account-trigger" : "with-icon"}`}
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={accountOpen}
                  onClick={toggleAccountMenu}
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
                    <>
                      <HeaderMenuIcon kind="login" />
                      {authLabel}
                    </>
                  )}
                </button>
              </div>
            )}

          <button
              className={`icon-btn mobile-header-btn ${mobileSearchOpen ? "active" : ""}`}
              type="button"
              aria-label={mobileSearchOpen ? "Close search" : "Open search"}
              aria-expanded={mobileSearchOpen}
              onClick={toggleMobileSearch}
            >
              <HeaderUtilityIcon kind={mobileSearchOpen ? "close" : "search"} />
            </button>

            {showCustomerNotification && (
              <button
                ref={notificationButtonRef}
                className={`icon-btn header-notification-btn ${notificationOpen ? "active" : ""}`}
                type="button"
                aria-label="Notifications"
                aria-haspopup="menu"
                aria-expanded={notificationOpen}
                onClick={() => {
                  if (!notificationOpen) {
                    updateNotificationMenuPosition();
                  }
                  setNotificationOpen((prev) => !prev);
                }}
              >
                <HeaderUtilityIcon kind="bell" />
                {notificationUnreadCount > 0 && (
                  <span className="icon-badge">{notificationUnreadCount}</span>
                )}
              </button>
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
            <button
              className={`icon-btn mobile-header-btn customer-menu-toggle ${
                mobileMenuOpen ? "active" : ""
              }`}
              type="button"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
              aria-controls="customerMobileMenu"
              onClick={toggleMobileMenu}
            >
              <HeaderUtilityIcon kind={mobileMenuOpen ? "close" : "menu"} />
            </button>
          </div>

          <div className="header-mobile-actions-row">
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
            <button
              className={`icon-btn mobile-header-btn ${mobileSearchOpen ? "active" : ""}`}
              type="button"
              aria-label={mobileSearchOpen ? "Close search" : "Open search"}
              aria-expanded={mobileSearchOpen}
              onClick={toggleMobileSearch}
            >
              <HeaderUtilityIcon kind={mobileSearchOpen ? "close" : "search"} />
            </button>
            {showCustomerNotification && (
              <button
                ref={notificationMobileButtonRef}
                className={`icon-btn header-notification-btn ${notificationOpen ? "active" : ""}`}
                type="button"
                aria-label="Notifications"
                aria-haspopup="menu"
                aria-expanded={notificationOpen}
                onClick={() => {
                  if (!notificationOpen) {
                    updateNotificationMenuPosition();
                  }
                  setNotificationOpen((prev) => !prev);
                }}
              >
                <HeaderUtilityIcon kind="bell" />
                {notificationUnreadCount > 0 && (
                  <span className="icon-badge">{notificationUnreadCount}</span>
                )}
              </button>
            )}
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
            <button
              className={`icon-btn mobile-header-btn customer-menu-toggle ${
                mobileMenuOpen ? "active" : ""
              }`}
              type="button"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
              aria-controls="customerMobileMenu"
              onClick={toggleMobileMenu}
            >
              <HeaderUtilityIcon kind={mobileMenuOpen ? "close" : "menu"} />
            </button>
          </div>
      </div>

      <div
        id="customerMobileMenu"
        className="header-mobile-panel"
        aria-hidden={!mobileMenuOpen}
        style={mobileMenuPanelStyle || undefined}
      >
        <div className="header-mobile-section">
          <p className="header-mobile-title">Navigation</p>
          <div className="header-mobile-links">
            {customerMobileLinks.map((item) => (
              <a key={item.label} className="header-mobile-link" href={item.href} onClick={closeMobileMenu}>
                {item.label}
              </a>
            ))}
            {showCategoryToggle ? (
              <button
                className="header-mobile-link header-mobile-link-button"
                type="button"
                onClick={() => {
                  onFilterClick?.();
                  closeMobileMenu();
                }}
              >
                Filters
              </button>
            ) : null}
          </div>
        </div>

        <div className="header-mobile-section">
          <p className="header-mobile-title">Account</p>
          <div className="header-mobile-links">
            {user ? (
              <>
                <Link className="header-mobile-link" to={accountMenuPath} onClick={closeMobileMenu}>
                  {accountMenuLabel}
                </Link>
                <button
                  className="header-mobile-link header-mobile-link-button"
                  type="button"
                  onClick={() => {
                    closeMobileMenu();
                    handleLogout();
                  }}
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link className="header-mobile-link" to="/login" onClick={closeMobileMenu}>
                  Login
                </Link>
                <Link className="header-mobile-link" to="/register?seller=1" onClick={closeMobileMenu}>
                  Become a Seller
                </Link>
              </>
            )}
            <Link className="header-mobile-link" to={toAuthPath("/wishlist")} onClick={closeMobileMenu}>
              Wishlist
            </Link>
            <Link className="header-mobile-link" to={toAuthPath("/cart")} onClick={closeMobileMenu}>
              Cart
            </Link>
          </div>
        </div>

        {!isCartRoute ? (
          <div className="header-mobile-section">
            <p className="header-mobile-title">Browse Categories</p>
            <div className="header-mobile-categories">
              {customerNavItems.map((item) => (
                <Link
                  key={item.label}
                  className={`header-mobile-link ${isCustomerItemActive(item.path) ? "active" : ""}`}
                  to={item.path}
                  onClick={closeMobileMenu}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
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
                    {categoryTree.map((item) => (
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
                              subcategory: item,
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
      {notificationDropdown}
      {accountDropdown}
      {customerBottomNavPortal}
    </>
  );
}


