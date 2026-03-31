const withHash = (path, hash = "") => {
  if (!hash) return path;
  return `${path}${hash.startsWith("#") ? hash : `#${hash}`}`;
};

const startsWithAny = (value, prefixes = []) =>
  prefixes.some((prefix) => String(prefix || "").trim() && value.startsWith(prefix));

export const isWorkspacePathActive = (location, item = {}) => {
  const pathname = String(location?.pathname || "").trim();
  const hash = String(location?.hash || "").trim();

  if (typeof item.isActive === "function") {
    return Boolean(item.isActive(location));
  }

  if (item.matchPrefixes && startsWithAny(pathname, item.matchPrefixes)) {
    if (!item.matchHash) return true;
    return hash === item.matchHash;
  }

  const target = String(item.path || "").trim();
  if (!target) return false;

  const [targetPathWithQuery, targetHash = ""] = target.split("#");
  const [targetPathname] = targetPathWithQuery.split("?");
  if (pathname !== targetPathname) return false;
  if (!targetHash) return true;
  return hash === `#${targetHash}`;
};

export const buildSellerWorkspaceSections = ({ sellerStorePath = "/seller/dashboard" } = {}) => [
  {
    id: "dashboard",
    title: "Seller Dashboard",
    navLabel: "Dashboard",
    description:
      "Overview, sales summary, revenue analytics, recent orders, and notifications.",
    path: withHash("/seller/dashboard", "dashboard-overview"),
    showInHeader: true,
    showInSidebar: true,
    isActive: (location) =>
      String(location?.pathname || "").trim() === "/seller/dashboard" &&
      String(location?.hash || "").trim() !== "#customer-messages",
    items: [
      { label: "Dashboard / Overview", path: withHash("/seller/dashboard", "dashboard-overview") },
      { label: "Sales summary", path: withHash("/seller/dashboard", "seller-dashboard-metrics") },
      { label: "Orders summary", path: withHash("/seller/dashboard", "seller-dashboard-orders") },
      { label: "Revenue analytics", path: withHash("/seller/dashboard", "seller-dashboard-metrics") },
      { label: "Recent orders", path: withHash("/seller/dashboard", "seller-dashboard-orders") },
      { label: "Notifications", path: withHash("/seller/dashboard", "seller-dashboard-notifications") },
    ],
  },
  {
    id: "product-management",
    title: "Product Management",
    navLabel: "Product Management",
    description:
      "Add listings, manage inventory, pricing, categories, product media, and hamper items.",
    path: "/seller/products",
    showInHeader: true,
    showInSidebar: true,
    matchPrefixes: ["/seller/products", "/seller/listed-items", "/store/", "/seller/store/"],
    items: [
      { label: "Add Product", path: "/seller/products?new=1" },
      { label: "Edit Product", path: "/seller/products" },
      { label: "Product List", path: "/seller/products" },
      { label: "Product Variants (size/color/etc)", path: "/seller/products" },
      { label: "Inventory / Stock Management", path: "/seller/products" },
      { label: "Bulk Upload Products", path: "/seller/products" },
      { label: "Product Images Manager", path: "/seller/products" },
      { label: "Categories Selection", path: "/seller/products" },
      { label: "Pricing & Discount Setup", path: "/seller/products" },
      { label: "Custom Hamper Items", path: "/seller/listed-items" },
      { label: "Storefront / My Store", path: sellerStorePath },
    ],
  },
  {
    id: "order-management",
    title: "Order Management",
    navLabel: "Order Management",
    description:
      "Track every seller order stage, review order details, invoices, and shipping labels.",
    path: "/seller/orders",
    showInHeader: true,
    showInSidebar: true,
    matchPrefixes: ["/seller/orders"],
    items: [
      { label: "All Orders", path: "/seller/orders" },
      { label: "Pending Orders", path: "/seller/orders?status=placed" },
      { label: "Confirmed Orders", path: "/seller/orders?status=placed" },
      { label: "Processing Orders", path: "/seller/orders?status=processing" },
      { label: "Shipped Orders", path: "/seller/orders?status=shipped" },
      { label: "Delivered Orders", path: "/seller/orders?status=delivered" },
      { label: "Cancelled Orders", path: "/seller/orders?status=cancelled" },
      { label: "Returned Orders", path: "/seller/orders?status=return_requested" },
      { label: "Order Details Page", path: "/seller/orders" },
      { label: "Generate Invoice", path: "/seller/orders" },
      { label: "Download Invoice", path: "/seller/orders" },
      { label: "Print Shipping Label", path: "/seller/orders" },
    ],
  },
  {
    id: "shipping-delivery",
    title: "Shipping & Delivery",
    navLabel: "Shipping & Delivery",
    description:
      "Control pickup address, delivery charges, courier defaults, tracking, and shipment flow.",
    path: withHash("/seller/shipping", "shipping-settings"),
    showInHeader: true,
    showInSidebar: true,
    matchPrefixes: ["/seller/shipping"],
    items: [
      { label: "Shipping Settings", path: withHash("/seller/shipping", "shipping-settings") },
      { label: "Pickup Address Management", path: withHash("/seller/shipping", "shipping-pickup") },
      { label: "Delivery Charges Setup", path: withHash("/seller/shipping", "shipping-rates") },
      { label: "Courier Partner Selection", path: withHash("/seller/shipping", "shipping-rates") },
      { label: "Tracking Details Update", path: withHash("/seller/shipping", "shipment-queue") },
      { label: "Shipment Status Update", path: "/seller/orders" },
    ],
  },
  {
    id: "payments-finance",
    title: "Payments & Finance",
    navLabel: "Payments & Finance",
    description:
      "See earnings, settlements, pending collections, transactions, refunds, and finance status.",
    path: withHash("/seller/payments", "payments-summary"),
    showInHeader: true,
    showInSidebar: true,
    matchPrefixes: ["/seller/payments"],
    items: [
      { label: "Earnings Dashboard", path: withHash("/seller/payments", "payments-summary") },
      { label: "Payment History", path: withHash("/seller/payments", "payments-transactions") },
      { label: "Settlements / Payouts", path: withHash("/seller/payments", "payments-settlements") },
      { label: "Pending Payments", path: withHash("/seller/payments", "payments-pending") },
      { label: "Transaction List", path: withHash("/seller/payments", "payments-transactions") },
      { label: "Commission Details", path: withHash("/seller/payments", "payments-finance") },
      { label: "Refund Management", path: withHash("/seller/payments", "payments-finance") },
    ],
  },
  {
    id: "reports-analytics",
    title: "Reports & Analytics",
    navLabel: "Reports & Analytics",
    description:
      "Review sales, product performance, order trends, customer insights, and tax snapshots.",
    path: withHash("/seller/reports", "reports-revenue"),
    showInHeader: true,
    showInSidebar: true,
    matchPrefixes: ["/seller/reports"],
    items: [
      { label: "Sales Reports", path: withHash("/seller/reports", "reports-revenue") },
      { label: "Product Performance", path: withHash("/seller/reports", "reports-products") },
      { label: "Revenue Reports", path: withHash("/seller/reports", "reports-revenue") },
      { label: "Order Reports", path: withHash("/seller/reports", "reports-orders") },
      { label: "Customer Insights", path: withHash("/seller/reports", "reports-operations") },
      { label: "Tax / GST Reports", path: withHash("/seller/reports", "reports-operations") },
    ],
  },
  {
    id: "customer-management",
    title: "Customer Management",
    navLabel: "Customer Management",
    description:
      "Keep customer queries, order-linked communication, and review workflows easy to follow.",
    path: withHash("/seller/customers", "customers-overview"),
    showInHeader: true,
    showInSidebar: true,
    matchPrefixes: ["/seller/customers"],
    items: [
      { label: "Customer List", path: withHash("/seller/customers", "customers-directory") },
      { label: "Customer Details", path: withHash("/seller/customers", "customers-detail") },
      { label: "Customer Messages / Queries", path: withHash("/seller/customers", "customers-detail") },
      { label: "Reviews & Ratings Management", path: "/seller/reviews" },
      { label: "Reply to Reviews", path: "/seller/reviews" },
    ],
  },
  {
    id: "offers-marketing",
    title: "Offers & Marketing",
    navLabel: "Offers & Marketing",
    description:
      "Manage campaign copy, coupons, banners, promotions, and featured product placement.",
    path: withHash("/seller/marketing", "marketing-campaigns"),
    showInHeader: true,
    showInSidebar: true,
    matchPrefixes: ["/seller/marketing"],
    items: [
      { label: "Coupons Creation", path: withHash("/seller/marketing", "marketing-campaigns") },
      { label: "Discounts Management", path: withHash("/seller/marketing", "marketing-campaigns") },
      { label: "Promotional Campaigns", path: withHash("/seller/marketing", "marketing-campaigns") },
      { label: "Featured Products", path: withHash("/seller/marketing", "marketing-featured") },
      { label: "Banner / Promotion Setup", path: withHash("/seller/marketing", "marketing-campaigns") },
    ],
  },
  {
    id: "reviews-ratings",
    title: "Reviews & Ratings",
    navLabel: "Reviews & Ratings",
    description:
      "Moderate storefront visibility, respond to reviews, and flag issues for admin follow-up.",
    path: "/seller/reviews",
    showInHeader: true,
    showInSidebar: true,
    matchPrefixes: ["/seller/reviews"],
    items: [
      { label: "Product Reviews List", path: "/seller/reviews" },
      { label: "Approve / Hide Reviews", path: "/seller/reviews" },
      { label: "Reported Reviews", path: "/seller/reviews" },
    ],
  },
  {
    id: "seller-account-settings",
    title: "Seller Account Settings",
    navLabel: "Seller Settings",
    description:
      "Manage seller profile, store information, GST, bank details, pickup preferences, and alerts.",
    path: withHash("/seller/settings", "settings-storefront"),
    showInHeader: true,
    showInSidebar: true,
    isActive: (location) =>
      String(location?.pathname || "").trim() === "/seller/settings" &&
      String(location?.hash || "").trim() !== "#settings-documents",
    items: [
      { label: "Seller Profile", path: withHash("/seller/settings", "settings-storefront") },
      { label: "Store Information", path: sellerStorePath },
      { label: "Bank Account Details", path: withHash("/seller/settings", "settings-bank") },
      { label: "GST Details", path: withHash("/seller/settings", "settings-storefront") },
      { label: "Pickup Address", path: withHash("/seller/shipping", "shipping-pickup") },
      { label: "Notification Settings", path: withHash("/seller/settings", "settings-bank") },
      { label: "Password & Security", path: "/profile-info?edit=1" },
    ],
  },
  {
    id: "documents-compliance",
    title: "Documents & Compliance",
    navLabel: "Documents",
    description:
      "Keep KYC, PAN, GST certificate, agreements, and invoice template preferences together.",
    path: withHash("/seller/settings", "settings-documents"),
    showInHeader: true,
    showInSidebar: true,
    isActive: (location) =>
      String(location?.pathname || "").trim() === "/seller/settings" &&
      String(location?.hash || "").trim() === "#settings-documents",
    items: [
      { label: "Upload KYC Documents", path: withHash("/seller/settings", "settings-documents") },
      { label: "GST Certificate", path: withHash("/seller/settings", "settings-documents") },
      { label: "PAN Details", path: withHash("/seller/settings", "settings-documents") },
      { label: "Agreement / Policies", path: withHash("/seller/settings", "settings-documents") },
      { label: "Invoice Templates", path: withHash("/seller/settings", "settings-documents") },
    ],
  },
  {
    id: "support-help",
    title: "Support & Help",
    navLabel: "Support",
    description:
      "Reach admin support, continue seller-side conversations, and keep help links close at hand.",
    path: "/seller/messages",
    showInHeader: true,
    showInSidebar: true,
    matchPrefixes: ["/seller/messages"],
    items: [
      { label: "Support Tickets", path: "/seller/messages" },
      { label: "Contact Admin", path: "/seller/messages" },
      { label: "FAQ / Help Center", path: "/#support" },
      { label: "Messages", path: "/seller/messages" },
    ],
  },
  {
    id: "authentication",
    title: "Authentication",
    navLabel: "Authentication",
    description:
      "Keep login, seller registration, and recovery routes easy to find for account operations.",
    path: "/login",
    showInHeader: false,
    showInSidebar: false,
    items: [
      { label: "Seller Login", path: "/login" },
      { label: "Seller Register", path: "/register?seller=1" },
      { label: "Email Verification", path: "/register?seller=1" },
      { label: "Forgot Password", path: "/forgot-password" },
      { label: "Reset Password", path: "/reset-password" },
    ],
  },
];

export const buildSellerHeaderNavItems = (options = {}) =>
  buildSellerWorkspaceSections(options)
    .filter((section) => section.showInHeader !== false)
    .map((section) => ({
      id: section.id,
      label: section.navLabel,
      path: section.path,
      matchPrefixes: section.matchPrefixes,
      isActive: section.isActive,
    }));

export const buildSellerSidebarSections = ({ sellerStorePath = "/seller/dashboard" } = {}) => {
  const workspaceItems = buildSellerWorkspaceSections({ sellerStorePath })
    .filter((section) => section.showInSidebar !== false)
    .map((section) => ({
      key: section.id,
      label: section.title,
      path: section.path,
      matchPrefixes: section.matchPrefixes,
      isActive: section.isActive,
    }));

  return [
    {
      title: "Seller Workspace",
      items: workspaceItems,
    },
    {
      title: "Quick Access",
      items: [
        {
          label: "My Store",
          path: sellerStorePath,
          isActive: (location) =>
            String(location?.pathname || "").trim().startsWith("/seller/store/") ||
            String(location?.pathname || "").trim().startsWith("/store/"),
        },
        {
          label: "Custom Hamper Items",
          path: "/seller/listed-items",
          matchPrefixes: ["/seller/listed-items"],
        },
        {
          label: "Messages",
          path: "/seller/messages",
          matchPrefixes: ["/seller/messages"],
        },
      ],
    },
    {
      title: "Account",
      items: [{ label: "Profile Information", active: true }],
    },
  ];
};
