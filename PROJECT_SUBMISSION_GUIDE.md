# CraftzyGifts Project Submission Guide

## Project
- Name: `CraftzyGifts`
- Type: Multi-vendor gifting marketplace
- Stack: `React + Vite`, `Node.js + Express`, `MongoDB`

## Main Modules
- Customer: register, login, products, cart, wishlist, checkout, orders, profile
- Seller: dashboard, products, listed items, orders, shipping, payments, reports, settings, messages
- Admin: dashboard, sellers, products, categories, orders, inventory, analytics, reports, settings, account
- Shared: notifications, messaging, invoice download, shipping label download

## Payment Flow
- Online payment: Razorpay checkout
- COD: supported
- Seller payout: manual admin settlement
- Commission: controlled from admin settings
- Settlement delay: controlled from admin settings

## Current Payout Model
- Customer online payment goes through Razorpay
- COD payment is collected on delivery
- Platform commission is calculated automatically
- Seller payout batches are created inside the app
- Admin transfers seller amount manually to seller bank account or UPI
- After transfer, admin marks the payout batch as `paid`

## Admin Settings That Now Have Real Effect
- `platformName`: used in public platform settings, major frontend brand surfaces, emails, invoice, shipping label, Razorpay checkout title
- `currencyCode`: used in payment config, checkout payload, invoice, shipping label, order emails
- `lowStockThreshold`: used in admin inventory and low-stock tracking
- `sellerCommissionPercent`: used in seller payout calculations
- `settlementDelayDays`: used in seller settlement eligibility
- `payoutSchedule`: shown in seller finance flow with next payout cycle
- `autoApproveSellers`: used in seller registration approval
- `enableOrderEmailAlerts`: controls transactional order emails
- `maintenanceMode`: blocks public/customer/seller access and keeps admin access available

## Email Delivery Modes
- `outbox`: writes email payloads to `server/var/email-outbox`
- `webhook`: sends email payloads to a configured delivery webhook

## Local Setup
### 1. Install dependencies
```bash
cd client
npm install

cd ../server
npm install
```

### 2. Configure environment
Create server `.env` from `server/.env.example`.

Important server variables:
```env
PORT=5000
MONGO_URL=mongodb://127.0.0.1:27017/craftzygifts
JWT_SECRET=replace_this
APP_BASE_URL=http://localhost:5173
EMAIL_DELIVERY_MODE=outbox
EMAIL_WEBHOOK_URL=
EMAIL_WEBHOOK_TOKEN=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
```

If frontend uses a custom backend URL, set client env:
```env
VITE_API_URL=http://localhost:5000
```

### 3. Start the app
```bash
cd server
npm start

cd ../client
npm run dev
```

## Verification Commands
### Client
```bash
cd client
npm run lint
npm run build
```

### Server
```bash
cd server
npm test
```

## Current Verified State
- `client` lint passes
- `client` production build passes
- `server` test suite passes

## Before Deployment
### Razorpay
- Add live/test Razorpay keys in server env
- Set webhook URL to:
```text
/api/orders/payment/webhook
```
- Verify:
  - online payment success
  - payment failure
  - retry payment
  - COD order flow

### Email
- Keep `EMAIL_DELIVERY_MODE=outbox` for local/demo
- Use `webhook` mode for real delivery setup

### Maintenance
- Admin can enable maintenance mode from admin settings
- Public/customer/seller routes are blocked during maintenance
- Admin routes remain accessible

## Suggested Demo Flow
1. Register or login as customer
2. Add product to cart
3. Place one COD order
4. Place one online payment order
5. Login as seller and check order/shipping updates
6. Login as admin and review seller, product, order, reports, settings
7. Open seller payments and admin payout queue
8. Mark a payout batch as `paid` after manual transfer

## What To Tell During Submission
- This is a multi-role marketplace system with customer, seller, and admin flows
- Online payments are integrated through Razorpay
- COD is supported
- Platform commission and seller settlements are configurable
- Seller payouts are tracked in-app and completed manually by admin
- Admin maintenance mode and security/session controls are implemented
- Core frontend and backend verification is completed through build, lint, and tests

## Final Notes
- Automatic seller payout API integration is not enabled; manual payout workflow is the current business flow
- Email delivery can run locally in outbox mode or through a webhook-based provider setup
