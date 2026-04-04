# Module QA Checklist

Use this before final submission. Mark each item `Pass`, `Fail`, or `N/A`.

## How To Test Every Module

For each module, always check all six:

1. UI loads correctly.
2. Validation errors show correctly.
3. Backend/API response is correct.
4. Data persists after refresh.
5. Role/permission is correct.
6. Mobile and desktop layout both look correct.

## 1. Authentication

- Customer register works.
- Seller register works.
- Admin login works.
- Wrong password shows proper error.
- Email verification flow works.
- Forgot password request works.
- Reset password link/token works.
- Logout clears session and redirects correctly.
- Page refresh keeps valid session.
- Expired session redirects correctly.
- Customer cannot open seller/admin routes.
- Seller cannot open admin routes.
- Admin can access admin-only routes.
- Maintenance mode blocks non-admin login/register and allows admin login.

## 2. Customer Marketplace

- Home page loads without broken sections.
- Product list loads.
- Search works.
- Category filter works.
- Sort works.
- Product detail page loads.
- Product images work.
- Customization fields work if product supports customization.
- Add to cart works.
- Quantity update works.
- Remove from cart works.
- Wishlist add/remove works.
- Store page opens correctly.
- Seller store products load correctly.

## 3. Checkout And Payment

- Checkout page loads with cart data.
- Address selection works.
- Address add/edit during checkout works.
- COD option works.
- Online payment option appears only when enabled/configured.
- Razorpay test checkout opens correctly.
- Online payment success flow works.
- Online payment cancel flow works.
- Online payment failure flow works.
- Retry payment flow works.
- Payment status page updates correctly.
- Duplicate payment/order creation does not happen on refresh/back.
- Stock reduces correctly after successful order.
- Failed payment does not mark order as paid.
- Order email respects admin email-alert setting.

## 4. Customer Orders

- Orders list loads.
- Order details open correctly.
- Progress states display correctly: Placed, Processing, Shipped, Out for delivery, Delivered.
- Payment badge/status is correct.
- Invoice download works.
- Shipping label behavior is correct if customer can access it.
- Order refresh keeps latest status.
- Cancel action works if available.
- Return/refund flow works if available.
- Delivered COD order shows payment as paid only at the correct stage.

## 5. Customer Profile

- Profile page loads.
- Edit profile works.
- Profile image upload works.
- Address add works.
- Address edit works.
- Address delete works.
- Password change works.
- Login history/session list works if shown.
- Revoke session works if shown.

## 6. Seller Onboarding

- Seller registration works.
- Pending seller sees correct pending screen.
- Auto-approve setting works.
- Manual approval flow works.
- Rejected seller sees correct state/message.
- Approved seller can enter seller routes.

## 7. Seller Dashboard

- Dashboard metrics load.
- Dashboard cards match actual orders/products.
- Recent activity/orders load.
- No broken charts or empty-state issues.

## 8. Seller Products

- Create product works.
- Edit product works.
- Delete product works.
- Product image upload works.
- Category assignment works.
- Price validation works.
- Stock validation works.
- Customization toggle/fields work.
- Published/listed state is correct.
- Saved product appears in marketplace when it should.

## 9. Seller Listed Items

- Listed items page loads.
- Search/filter works.
- Item status matches source product data.
- Inventory count matches actual product stock.

## 10. Seller Orders

- Seller orders list loads.
- Order detail opens.
- Status update works.
- Invalid status update is blocked.
- Tracking ID save works.
- Delivery owner shows correctly.
- COD collection status updates correctly.
- Invoice access works.
- Shipping label access works.

## 11. Seller Shipping

- Shipping queue loads.
- Order status change works.
- Out-for-delivery update works.
- Delivered update works.
- Seller-handled delivery mode works.
- Courier-handled delivery mode works.
- Tracking/reference fields save correctly.

## 12. Seller Payments

- Seller bank details save correctly.
- UPI ID validation works.
- Bank account validation works.
- Commission amount is correct.
- Gross amount is correct.
- Net payout amount is correct.
- Settlement delay is applied correctly.
- Payout schedule label/date is correct.
- Payout request works only when payout target is valid.
- Payout request appears in admin payout queue.

## 13. Seller Settings

- Store details save correctly.
- Store logo/banner upload works.
- Contact details save correctly.
- Bank details save correctly.
- Security settings work.
- Two-step login flow works.
- Active sessions list works.
- Session revoke works.

## 14. Seller Messages And Notifications

- Seller inbox loads.
- Conversation opens.
- Send message works.
- New message appears after refresh/realtime update.
- Notification bell count updates correctly.
- Mark as read works.

## 15. Admin Dashboard

- Dashboard loads without broken cards.
- Counts match real data.
- Revenue/order/customer/seller figures look correct.
- Payout queue loads.
- Manual payout targets display clearly.
- Mark paid works only for valid payout targets.

## 16. Admin Sellers

- Sellers list loads.
- Search works.
- Status filter works.
- Refresh works.
- Approve works.
- Reject works.
- Seller card opens store preview correctly.
- Approved/pending/rejected badges are correct.

## 17. Admin Products

- Products grid/list loads.
- Search works.
- Filters work.
- Sort works.
- Select all works.
- Bulk action works.
- Export CSV works.
- Product moderation state is correct.
- Seller/product details shown are correct.

## 18. Admin Categories

- Categories list loads.
- Add category works.
- Edit category works.
- Delete category works.
- Category image/icon behavior works if present.
- Category changes reflect in seller/customer product forms.

## 19. Admin Orders

- Orders table loads.
- Search works.
- Status filter works.
- Refresh works.
- Details modal opens fully.
- Modal scroll and close work.
- Status update works.
- Apply button works.
- Invoice download works.
- Shipping label download works.
- Payment status shown is correct.

## 20. Admin Customers

- Customers list loads.
- Search works.
- Customer details data is correct.
- Order counts/spend data matches actual records.

## 21. Admin Inventory

- Inventory list loads.
- Low stock threshold setting affects low-stock flag correctly.
- Stock values match products.
- Filters/search work.

## 22. Admin Analytics And Reports

- Analytics page loads.
- Charts load with real data.
- Date filters work.
- Reports page loads.
- Export/download works.
- Totals match actual orders/products/users.

## 23. Admin Settings

- Each card edit icon works.
- Cancel reverts only unsaved card changes.
- Save button saves only that section.
- Platform name save works.
- Platform name updates header/login/footer/invoice/shipping label/checkout branding.
- Currency code save works.
- Currency symbol/format updates where expected.
- Low stock threshold save works.
- Seller commission percent save works.
- Settlement delay save works.
- Payout schedule save works.
- Auto approve sellers save works.
- Order email alerts save works.
- Maintenance mode save works.
- Maintenance mode blocks non-admin pages and keeps admin access.
- Refresh pulls latest backend values.

## 24. Admin Account

- Profile details save works.
- Country dropdown works.
- Timezone dropdown works.
- Language dropdown works.
- Security preferences save works.
- Two-factor setting works.
- Login alerts setting works.
- Session timeout works.
- Login history loads.
- Revoke all sessions works.
- Export account data works.

## 25. Notifications

- Customer notifications load.
- Seller notifications load.
- Admin notifications load.
- Unread count is correct.
- Mark read works.
- Realtime update works if app uses stream/polling.

## 26. File Uploads And Media

- Product image upload works.
- Profile image upload works.
- Store banner/logo upload works.
- Unsupported file type is blocked.
- Large file failure shows proper message.
- Broken image fallback is acceptable.

## 27. Email Flows

- Verify email mail/link works.
- Forgot password mail/link works.
- OTP/login mail works if enabled.
- Order emails obey settings.
- Email content uses current platform name.

## 28. Security And Permissions

- Protected APIs reject unauthenticated access.
- Customer token/session cannot call seller/admin APIs.
- Seller token/session cannot call admin APIs.
- Admin-only actions are protected.
- Session revoke invalidates old session.
- Password change invalidates old auth where required.

## 29. Responsive And UI Polish

- Login/register pages look correct on mobile.
- Customer pages look correct on mobile.
- Seller pages look correct on mobile.
- Admin pages look correct on laptop width.
- Modals never clip without scroll.
- No placeholder/dummy text is visible.
- No broken alignment.
- No overlap, cutoff, or impossible-to-click controls.

## 30. Final Submission Checks

- `client` lint passes.
- `client` build passes.
- `server` tests pass.
- No obvious console errors in major pages.
- No dead buttons.
- No dead links.
- No dummy cards or fake metrics left.
- `.env.example` is updated.
- Project guide is updated.

## Sign-Off Format

For each module, record:

- Module name
- Date tested
- Tested by
- Result: Pass / Fail / N/A
- Bugs found
- Retest result
