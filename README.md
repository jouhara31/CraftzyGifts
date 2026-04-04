# CraftzyGifts

CraftzyGifts is a multi-vendor gift marketplace built with React, Vite, Node.js, Express, and MongoDB. Customers can browse products, place COD or online orders, and track purchases. Sellers can manage stores, products, shipping, and payouts. Admins can manage platform settings, sellers, products, orders, analytics, and account security.

## Highlights

- Customer storefront with search, filters, wishlist, cart, checkout, and order tracking
- Seller workspace for products, orders, shipping, store setup, payouts, and reports
- Admin console for seller approvals, products, categories, customers, inventory, analytics, and settings
- COD and Razorpay-based online payment flow
- Role-based authentication with session handling
- Platform branding and maintenance mode support
- Invoice and shipping label generation

## Tech Stack

- Frontend: React 19, Vite, React Router
- Backend: Node.js, Express 5
- Database: MongoDB with Mongoose
- Charts: Recharts
- Testing: Jest, Supertest, Vitest support

## Project Structure

```text
client/   React frontend
server/   Express API, models, controllers, tests
```

## Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/jouhara31/CraftzyGifts.git
cd CraftzyGifts
```

### 2. Install dependencies

```bash
cd server
npm install

cd ../client
npm install
```

### 3. Configure environment variables

Create `server/.env` from `server/.env.example`.

Required minimum:

```env
MONGO_URL=mongodb://127.0.0.1:27017/craftzygifts
PORT=5000
JWT_SECRET=replace-with-a-long-random-string
CORS_ORIGIN=http://localhost:5173
APP_BASE_URL=http://localhost:5173
```

Optional payment setup:

```env
RAZORPAY_KEY_ID=your-test-key
RAZORPAY_KEY_SECRET=your-test-secret
RAZORPAY_WEBHOOK_SECRET=your-webhook-secret
```

Optional email setup:

```env
EMAIL_DELIVERY_MODE=outbox
EMAIL_WEBHOOK_URL=
EMAIL_WEBHOOK_TOKEN=
```

## Run The Project

### Start backend

```bash
cd server
node server.js
```

### Start frontend

```bash
cd client
npm run dev
```

Frontend runs on `http://localhost:5173` by default.  
Backend runs on `http://localhost:5000` by default.

## Available Scripts

### Client

```bash
npm run dev
npm run build
npm run preview
npm run lint
npm run test
```

### Server

```bash
npm run test
npm run seed
```

## Testing

Verified project checks:

```bash
cd client && npm run lint
cd client && npm run build
cd server && npm test
```

## Payment Notes

- COD flow is supported
- Razorpay test mode can be used for online payments before deployment
- Seller payout tracking is available in the app
- Real automatic seller payout transfer is not enabled; payout marking is handled manually from the admin workflow

## Email Notes

- Current default email mode is `outbox`
- Forgot password, verification, and OTP flows are functional in development
- Real production email delivery can be connected later through webhook mode

## User Roles

### Customer

- Register and login
- Browse products and stores
- Add to cart and wishlist
- Checkout and track orders
- Manage profile and addresses

### Seller

- Manage store details
- Create and update products
- Process orders and shipping
- View settlements and payout data
- Manage account security

### Admin

- Approve sellers
- Manage products, categories, customers, and inventory
- Handle orders and platform settings
- Review analytics, reports, payouts, and security activity

## Submission Notes

- `.env` files should not be committed
- Use `server/.env.example` as the reference configuration
- Push source code only, not generated build files or runtime temp files

## Repository

GitHub: [https://github.com/jouhara31/CraftzyGifts](https://github.com/jouhara31/CraftzyGifts)
