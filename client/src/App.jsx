import { Suspense, lazy, useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Footer from "./components/footer";
import PlatformMaintenancePage from "./components/PlatformMaintenancePage";
import SellerRoute from "./components/SellerRoute";
import AdminRoute from "./components/AdminRoute";
import SellerAccountRoute from "./components/SellerAccountRoute";
import SellerSidebarLayout from "./components/SellerSidebarLayout";
import { usePlatform } from "./hooks/usePlatform";
import { readStoredSessionClaims } from "./utils/authRoute";

const lazyPage = (loader) => {
  const Component = lazy(loader);
  Component.preload = loader;
  return Component;
};

const Home = lazyPage(() => import("./pages/Home"));
const Register = lazyPage(() => import("./pages/Register"));
const Login = lazyPage(() => import("./pages/Login"));
const ForgotPassword = lazyPage(() => import("./pages/ForgotPassword"));
const ResetPassword = lazyPage(() => import("./pages/ResetPassword"));
const VerifyEmail = lazyPage(() => import("./pages/VerifyEmail"));
const Products = lazyPage(() => import("./pages/products"));
const ProductDetail = lazyPage(() => import("./pages/productDetail"));
const SellerStore = lazyPage(() => import("./pages/sellerStore"));
const Customization = lazyPage(() => import("./pages/customization"));
const Checkout = lazyPage(() => import("./pages/Checkout"));
const PaymentStatus = lazyPage(() => import("./pages/PaymentStatus"));
const Cart = lazyPage(() => import("./pages/cart"));
const Orders = lazyPage(() => import("./pages/orders"));
const Profile = lazyPage(() => import("./pages/profile"));
const Wishlist = lazyPage(() => import("./pages/wishlist"));
const PrivacyPolicy = lazyPage(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazyPage(() => import("./pages/TermsOfService"));
const ReturnPolicy = lazyPage(() => import("./pages/ReturnPolicy"));
const ShippingPolicy = lazyPage(() => import("./pages/ShippingPolicy"));
const Settings = lazyPage(() => import("./pages/settings"));
const EditProfile = lazyPage(() => import("./pages/editProfile"));
const ProfileInfo = lazyPage(() => import("./pages/profileInfo"));
const ManageAddresses = lazyPage(() => import("./pages/manageAddresses"));
const SellerDashboard = lazyPage(() => import("./pages/sellerDashboard"));
const SellerPending = lazyPage(() => import("./pages/SellerPending"));
const SellerProducts = lazyPage(() => import("./pages/sellerProducts"));
const SellerListedItems = lazyPage(() => import("./pages/sellerListedItems"));
const SellerOrders = lazyPage(() => import("./pages/sellerOrders"));
const SellerShipping = lazyPage(() => import("./pages/sellerShipping"));
const SellerPayments = lazyPage(() => import("./pages/sellerPayments"));
const SellerCustomers = lazyPage(() => import("./pages/sellerCustomers"));
const SellerReports = lazyPage(() => import("./pages/sellerReports"));
const SellerReviews = lazyPage(() => import("./pages/sellerReviews"));
const SellerMarketing = lazyPage(() => import("./pages/sellerMarketing"));
const SellerSettings = lazyPage(() => import("./pages/sellerSettings"));
const SellerMessages = lazyPage(() => import("./pages/sellerMessages"));
const AdminDashboard = lazyPage(() => import("./pages/adminDashboard"));
const AdminSellers = lazyPage(() => import("./pages/adminSellers"));
const AdminProducts = lazyPage(() => import("./pages/adminProducts"));
const AdminCategories = lazyPage(() => import("./pages/adminCategories"));
const AdminOrders = lazyPage(() => import("./pages/adminOrders"));
const AdminReports = lazyPage(() => import("./pages/adminReports"));
const AdminCustomers = lazyPage(() => import("./pages/adminCustomers"));
const AdminInventory = lazyPage(() => import("./pages/adminInventory"));
const AdminAnalytics = lazyPage(() => import("./pages/adminAnalytics"));
const AdminSettings = lazyPage(() => import("./pages/adminSettings"));
const AdminAccount = lazyPage(() => import("./pages/adminAccount"));
const AdminMessages = lazyPage(() => import("./pages/adminMessages"));
const AdminNotifications = lazyPage(() => import("./pages/adminNotifications"));
const NotFound = lazyPage(() => import("./pages/NotFound"));

const uniquePreloadTargets = (targets = []) =>
  Array.from(new Set((Array.isArray(targets) ? targets : []).filter(Boolean)));

const getPreloadTargets = (pathname, role) => {
  const normalizedPath = String(pathname || "").trim();
  const baseTargets = [Products];
  const roleTargets =
    role === "seller"
      ? [SellerDashboard, SellerOrders]
      : role === "admin"
        ? [AdminDashboard, AdminOrders, AdminNotifications]
        : [Orders, Wishlist];

  if (normalizedPath === "/") {
    return uniquePreloadTargets([...baseTargets, ProductDetail, Login, Register]);
  }
  if (normalizedPath.startsWith("/products")) {
    return uniquePreloadTargets([...baseTargets, ProductDetail, Wishlist, Cart]);
  }
  if (normalizedPath.startsWith("/store/")) {
    return uniquePreloadTargets([SellerStore, Products, ProductDetail, Customization]);
  }
  if (normalizedPath.startsWith("/customize")) {
    return uniquePreloadTargets([Customization, Checkout, Cart, Orders]);
  }
  if (normalizedPath === "/cart" || normalizedPath === "/checkout") {
    return uniquePreloadTargets([Cart, Checkout, PaymentStatus, Orders]);
  }
  if (normalizedPath === "/orders" || normalizedPath.startsWith("/payment-status")) {
    return uniquePreloadTargets([Orders, PaymentStatus, Products, Profile]);
  }
  if (normalizedPath.startsWith("/seller/")) {
    return uniquePreloadTargets([SellerDashboard, SellerOrders, SellerProducts]);
  }
  if (normalizedPath.startsWith("/admin/")) {
    return uniquePreloadTargets([AdminDashboard, AdminOrders, AdminProducts, AdminNotifications]);
  }
  if (
    normalizedPath === "/login" ||
    normalizedPath === "/register" ||
    normalizedPath === "/forgot-password"
  ) {
    return uniquePreloadTargets([Home, Register, Login, ForgotPassword]);
  }

  return uniquePreloadTargets([...baseTargets, ...roleTargets]);
};

function App() {
  const { pathname } = useLocation();
  const { loading: platformLoading, maintenanceMode, platformName } = usePlatform();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    const sessionClaims = readStoredSessionClaims();
    const pagesToPreload = getPreloadTargets(pathname, sessionClaims.role);

    const schedule =
      typeof window !== "undefined" && "requestIdleCallback" in window
        ? window.requestIdleCallback.bind(window)
        : (callback) => window.setTimeout(callback, 300);

    const cancel =
      typeof window !== "undefined" && "cancelIdleCallback" in window
        ? window.cancelIdleCallback.bind(window)
        : window.clearTimeout.bind(window);

    const handle = schedule(() => {
      pagesToPreload.forEach((PageComponent) => {
        PageComponent.preload?.().catch(() => null);
      });
    });

    return () => cancel(handle);
  }, [pathname]);

  const hideFooter =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/verify-email" ||
    pathname === "/checkout" ||
    pathname === "/payment-status" ||
    pathname === "/profile" ||
    pathname === "/profile-info" ||
    pathname === "/edit-profile" ||
    pathname === "/manage-addresses" ||
    pathname === "/settings" ||
    pathname.startsWith("/seller/") ||
    pathname.startsWith("/admin/");

  const sessionClaims = readStoredSessionClaims();
  const role = String(sessionClaims.role || "").trim().toLowerCase();
  const maintenanceExemptRoute =
    pathname === "/login" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/verify-email" ||
    pathname.startsWith("/admin/");
  const shouldShowMaintenance =
    !platformLoading && maintenanceMode && role !== "admin" && !maintenanceExemptRoute;

  if (shouldShowMaintenance) {
    return <PlatformMaintenancePage platformName={platformName} />;
  }

  return (
    <>
      <Suspense fallback={<div className="page"><p className="field-hint">Loading page...</p></div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/products" element={<Products />} />
          <Route path="/products/:id" element={<ProductDetail />} />
          <Route path="/store/:sellerId" element={<SellerStore />} />
          <Route path="/customize/seller/:sellerId" element={<Customization />} />
          <Route path="/customize/:id" element={<Customization />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/payment-status" element={<PaymentStatus />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/wishlist" element={<Wishlist />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile-info" element={<ProfileInfo />} />
          <Route path="/edit-profile" element={<EditProfile />} />
          <Route path="/manage-addresses" element={<ManageAddresses />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />
          <Route path="/return-policy" element={<ReturnPolicy />} />
          <Route path="/shipping-policy" element={<ShippingPolicy />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/seller/pending" element={<SellerPending />} />
          <Route
            path="/seller"
            element={
              <SellerAccountRoute>
                <SellerSidebarLayout />
              </SellerAccountRoute>
            }
          >
            <Route path="messages" element={<SellerMessages />} />
          </Route>
          <Route
            path="/seller"
            element={
              <SellerRoute>
                <SellerSidebarLayout />
              </SellerRoute>
            }
          >
            <Route index element={<Navigate to="/seller/dashboard" replace />} />
            <Route path="dashboard" element={<SellerDashboard />} />
            <Route path="store/:sellerId" element={<SellerStore sellerWorkspaceMode />} />
            <Route path="products" element={<SellerProducts />} />
            <Route path="listed-items" element={<SellerListedItems />} />
            <Route path="orders" element={<SellerOrders />} />
            <Route path="shipping" element={<SellerShipping />} />
            <Route path="payments" element={<SellerPayments />} />
            <Route path="customers" element={<SellerCustomers />} />
            <Route path="reports" element={<SellerReports />} />
            <Route path="reviews" element={<SellerReviews />} />
            <Route path="marketing" element={<SellerMarketing />} />
            <Route path="settings" element={<SellerSettings />} />
          </Route>
          <Route
            path="/admin/messages"
            element={
              <AdminRoute>
                <AdminMessages />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/notifications"
            element={
              <AdminRoute>
                <AdminNotifications />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/dashboard"
            element={
              <AdminRoute>
                <AdminDashboard />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/sellers"
            element={
              <AdminRoute>
                <AdminSellers />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/products"
            element={
              <AdminRoute>
                <AdminProducts />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/categories"
            element={
              <AdminRoute>
                <AdminCategories />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/orders"
            element={
              <AdminRoute>
                <AdminOrders />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/reports"
            element={
              <AdminRoute>
                <AdminReports />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/customers"
            element={
              <AdminRoute>
                <AdminCustomers />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/inventory"
            element={
              <AdminRoute>
                <AdminInventory />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/analytics"
            element={
              <AdminRoute>
                <AdminAnalytics />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <AdminRoute>
                <AdminSettings />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/account"
            element={
              <AdminRoute>
                <AdminAccount />
              </AdminRoute>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      {!hideFooter && <Footer />}
    </>
  );
}

export default App;
