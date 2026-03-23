CraftzyGifts - Project Documentation

**Overview**
CraftzyGifts is a web-based multi-vendor marketplace for handmade gifts and custom hampers. Customers can purchase ready-made products or build personalized hampers, while sellers manage listings and orders. Admins oversee approvals, categories, and platform health.

**Academic Documents (BCSP-064)**
- `PROJECT_SYNOPSIS.md` for the project proposal synopsis.
- `PROJECT_REPORT.md` for the full project report structure.

**Objectives**
- Enable customers to buy ready-made gifts or build fully customized hampers.
- Provide home-based crafters with an easy platform to sell handmade products.
- Support making and decoration charges for custom hampers.
- Allow reference image uploads for customization guidance.
- Provide admin controls for sellers, products, and orders.
- Deliver a responsive, user-friendly web experience.

**User Roles And Capabilities**
- Customer: Browse products, customize hampers, add to cart, checkout, and view orders.
- Seller: Manage products, mark items for customization, and update order status.
- Admin: Approve sellers, manage categories, monitor products and orders, and review analytics.

**Key Features**
- Multi-vendor marketplace with seller storefronts.
- Custom hamper builder with add-ons and making charges.
- Image uploads for customization references.
- Order tracking for customers and sellers.
- Admin dashboards for sellers, products, orders, and analytics.
- Wishlist, profile management, and address book.

**Tech Stack**
- Frontend: React, Vite, Tailwind CSS, React Router
- Backend: Node.js, Express
- Database: MongoDB with Mongoose
- Auth: JWT

**Architecture**
- `client/` hosts the React single-page app.
- `server/` hosts the Express API and MongoDB models.
- REST APIs are served from `http://localhost:5000/api` by default.

**Core Collections**
- `User`: Customers, sellers, and admins with role-based access.
- `Product`: Listings, customization options, and pricing.
- `Order`: Purchases, status updates, and delivery details.
- `CategoryMaster`, `CustomizationMaster`, `PlatformSettings`, `Notification`, `ContactRequest`.

**Project Structure**
- `client/src/pages/` page-level views for customer, seller, and admin flows.
- `client/src/components/` shared UI components and layout.
- `client/src/services/api.js` API client configuration.
- `server/models/` Mongoose schemas.
- `server/controllers/` request handlers and business logic.
- `server/routes/` Express route definitions.
- `server/utils/` platform settings and helper logic.
- `server/seed.js` and `server/scripts/runSeed.js` sample data seeding.

**Environment Variables**
- `MONGO_URL` default is `mongodb://127.0.0.1:27017/craftzygifts`
- `JWT_SECRET` is required
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` enable online payments
- `REQUEST_BODY_LIMIT` default is `100mb`
- `SEED_SELLER_PASSWORD` default is `seller123`

**Setup And Run (Local)**
1. Install server dependencies: `cd server` then `npm install`
2. Install client dependencies: `cd client` then `npm install`
3. Ensure MongoDB is running or set `MONGO_URL`
4. Add payment keys to `server/.env` if you want Razorpay/UPI/Card checkout
5. Start the API server: `cd server` then `node server.js`
6. Start the web app: `cd client` then `npm run dev`

**Seeding**
- The server seeds sample sellers and products on startup.
- To seed manually: `cd server` then `npm run seed`

**Scripts**
- Server: `npm run seed`, `npm run test`
- Client: `npm run dev`, `npm run build`, `npm run preview`, `npm run lint`, `npm run test`

**Testing**
- Client tests are available with `cd client` then `npm run test`.
- For Razorpay checkout, use test mode keys and webhook secrets during development.

**Future Enhancements**
- Mobile apps, international shipping, and multi-language support.
- AI-based recommendations and AR previews for customized hampers.
- Subscription services and advanced seller analytics.
- Social integrations and authenticity tracking.
