import { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import Home from "./pages/Home";
import Register from "./pages/Register";
import Login from "./pages/Login";
import Products from "./pages/products";
import ProductDetail from "./pages/productDetail";
import SellerStore from "./pages/sellerStore";
import Customization from "./pages/customization";
import Checkout from "./pages/Checkout";
import Cart from "./pages/cart";
import Orders from "./pages/orders";
import Profile from "./pages/profile";
import Wishlist from "./pages/wishlist";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import ReturnPolicy from "./pages/ReturnPolicy";
import ShippingPolicy from "./pages/ShippingPolicy";
import SellerDashboard from "./pages/sellerDashboard";
import SellerProducts from "./pages/sellerProducts";
import SellerListedItems from "./pages/sellerListedItems";
import SellerOrders from "./pages/sellerOrders";
import SellerPayments from "./pages/sellerPayments";
import SellerSettings from "./pages/sellerSettings";
import AdminDashboard from "./pages/adminDashboard";
import AdminSellers from "./pages/adminSellers";
import AdminProducts from "./pages/adminProducts";
import AdminCategories from "./pages/adminCategories";
import AdminOrders from "./pages/adminOrders";
import AdminReports from "./pages/adminReports";
import AdminCustomers from "./pages/adminCustomers";
import AdminInventory from "./pages/adminInventory";
import AdminAnalytics from "./pages/adminAnalytics";
import AdminSettings from "./pages/adminSettings";
import AdminAccount from "./pages/adminAccount";
import Footer from "./components/footer";
import SellerRoute from "./components/SellerRoute";
import AdminRoute from "./components/AdminRoute";

function App() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  const hideFooter =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/checkout" ||
    pathname.startsWith("/seller/") ||
    pathname.startsWith("/admin/");

  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/products" element={<Products />} />
        <Route path="/products/:id" element={<ProductDetail />} />
        <Route path="/store/:sellerId" element={<SellerStore />} />
        <Route path="/customize/:id" element={<Customization />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/wishlist" element={<Wishlist />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/return-policy" element={<ReturnPolicy />} />
        <Route path="/shipping-policy" element={<ShippingPolicy />} />
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
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
      {!hideFooter && <Footer />}
    </>
  );
}

export default App;
