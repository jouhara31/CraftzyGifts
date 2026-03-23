import { Suspense, lazy, useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import Footer from "./components/footer";
import SellerRoute from "./components/SellerRoute";
import AdminRoute from "./components/AdminRoute";
import SellerAccountRoute from "./components/SellerAccountRoute";

const Home = lazy(() => import("./pages/Home"));
const Register = lazy(() => import("./pages/Register"));
const Login = lazy(() => import("./pages/Login"));
const Products = lazy(() => import("./pages/products"));
const ProductDetail = lazy(() => import("./pages/productDetail"));
const SellerStore = lazy(() => import("./pages/sellerStore"));
const Customization = lazy(() => import("./pages/customization"));
const Checkout = lazy(() => import("./pages/Checkout"));
const PaymentStatus = lazy(() => import("./pages/PaymentStatus"));
const Cart = lazy(() => import("./pages/cart"));
const Orders = lazy(() => import("./pages/orders"));
const Profile = lazy(() => import("./pages/profile"));
const Wishlist = lazy(() => import("./pages/wishlist"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const ReturnPolicy = lazy(() => import("./pages/ReturnPolicy"));
const ShippingPolicy = lazy(() => import("./pages/ShippingPolicy"));
const Settings = lazy(() => import("./pages/settings"));
const EditProfile = lazy(() => import("./pages/editProfile"));
const ProfileInfo = lazy(() => import("./pages/profileInfo"));
const ManageAddresses = lazy(() => import("./pages/manageAddresses"));
const SellerDashboard = lazy(() => import("./pages/sellerDashboard"));
const SellerPending = lazy(() => import("./pages/SellerPending"));
const SellerProducts = lazy(() => import("./pages/sellerProducts"));
const SellerListedItems = lazy(() => import("./pages/sellerListedItems"));
const SellerOrders = lazy(() => import("./pages/sellerOrders"));
const SellerPayments = lazy(() => import("./pages/sellerPayments"));
const SellerSettings = lazy(() => import("./pages/sellerSettings"));
const SellerMessages = lazy(() => import("./pages/sellerMessages"));
const AdminDashboard = lazy(() => import("./pages/adminDashboard"));
const AdminSellers = lazy(() => import("./pages/adminSellers"));
const AdminProducts = lazy(() => import("./pages/adminProducts"));
const AdminCategories = lazy(() => import("./pages/adminCategories"));
const AdminOrders = lazy(() => import("./pages/adminOrders"));
const AdminReports = lazy(() => import("./pages/adminReports"));
const AdminCustomers = lazy(() => import("./pages/adminCustomers"));
const AdminInventory = lazy(() => import("./pages/adminInventory"));
const AdminAnalytics = lazy(() => import("./pages/adminAnalytics"));
const AdminSettings = lazy(() => import("./pages/adminSettings"));
const AdminAccount = lazy(() => import("./pages/adminAccount"));
const AdminMessages = lazy(() => import("./pages/adminMessages"));

function App() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  const hideFooter =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/checkout" ||
    pathname === "/payment-status" ||
    pathname === "/profile" ||
    pathname === "/profile-info" ||
    pathname === "/edit-profile" ||
    pathname === "/manage-addresses" ||
    pathname === "/settings" ||
    pathname.startsWith("/seller/") ||
    pathname.startsWith("/admin/");

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
          <Route path="/seller/pending" element={<SellerPending />} />
          <Route
            path="/seller/messages"
            element={
              <SellerAccountRoute>
                <SellerMessages />
              </SellerAccountRoute>
            }
          />
          <Route
            path="/seller/dashboard"
            element={
              <SellerRoute>
                <SellerDashboard />
              </SellerRoute>
            }
          />
          <Route
            path="/seller/products"
            element={
              <SellerRoute>
                <SellerProducts />
              </SellerRoute>
            }
          />
          <Route
            path="/seller/listed-items"
            element={
              <SellerRoute>
                <SellerListedItems />
              </SellerRoute>
            }
          />
          <Route
            path="/seller/orders"
            element={
              <SellerRoute>
                <SellerOrders />
              </SellerRoute>
            }
          />
          <Route
            path="/seller/payments"
            element={
              <SellerRoute>
                <SellerPayments />
              </SellerRoute>
            }
          />
          <Route
            path="/seller/settings"
            element={
              <SellerRoute>
                <SellerSettings />
              </SellerRoute>
            }
          />
          <Route
            path="/admin/messages"
            element={
              <AdminRoute>
                <AdminMessages />
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
        </Routes>
      </Suspense>
      {!hideFooter && <Footer />}
    </>
  );
}

export default App;
