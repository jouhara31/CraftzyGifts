import { Link } from "react-router-dom";
import logoPng from "../assets/logo.png";

export default function Footer() {
  return (
    <section className="market-footer-shell">
      <div className="market-footer-benefits">
        <article className="market-benefit-item">
          <span className="market-benefit-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M3 7h11v8H3z" />
              <path d="M14 10h3l2 2v3h-5z" />
              <circle cx="7" cy="17" r="1.6" />
              <circle cx="17" cy="17" r="1.6" />
            </svg>
          </span>
          <div>
            <h4>Free Delivery</h4>
            <p>On orders over ₹499</p>
          </div>
        </article>

        <article className="market-benefit-item">
          <span className="market-benefit-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 3l7 3v5c0 4.4-2.8 8.4-7 10-4.2-1.6-7-5.6-7-10V6l7-3z" />
            </svg>
          </span>
          <div>
            <h4>Secure Payments</h4>
            <p>100% secure checkout</p>
          </div>
        </article>

        <article className="market-benefit-item">
          <span className="market-benefit-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M4 8V4h4" />
              <path d="M20 16v4h-4" />
              <path d="M20 8a7 7 0 0 0-12-3L4 8" />
              <path d="M4 16a7 7 0 0 0 12 3l4-3" />
            </svg>
          </span>
          <div>
            <h4>Easy Returns</h4>
            <p>7-day return policy</p>
          </div>
        </article>

        <article className="market-benefit-item">
          <span className="market-benefit-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M4 13v-2a8 8 0 0 1 16 0v2" />
              <rect x="3" y="13" width="4" height="6" rx="1.2" />
              <rect x="17" y="13" width="4" height="6" rx="1.2" />
            </svg>
          </span>
          <div>
            <h4>24/7 Support</h4>
            <p>Dedicated help center</p>
          </div>
        </article>
      </div>

      <footer className="market-footer">
        <div className="market-footer-newsletter">
          <div>
            <h3>Stay Updated</h3>
            <p>Get the latest craft trends and exclusive deals</p>
          </div>
          <form
            className="market-newsletter-form"
            onSubmit={(event) => event.preventDefault()}
          >
            <input type="email" placeholder="Enter your email" />
            <button type="submit">Subscribe</button>
          </form>
        </div>

        <div className="market-footer-links-grid">
          <div className="market-footer-brand">
            <img className="market-footer-logo" src={logoPng} alt="Craftzy Gifts logo" />
          </div>

          <div className="market-footer-links">
            <h4>Shop</h4>
            <Link to="/products">All Products</Link>
            <Link to="/products">Gift Hampers</Link>
            <Link to="/products">Custom Orders</Link>
            <Link to="/products?sort=newest">New Arrivals</Link>
            <Link to="/products?sort=price_desc">Top Picks</Link>
          </div>

          <div className="market-footer-links">
            <h4>Explore</h4>
            <Link to="/register">Create Account</Link>
            <Link to="/wishlist">Wishlist</Link>
            <Link to="/orders">My Orders</Link>
            <a href="/#featured">Featured Gifts</a>
          </div>

          <div className="market-footer-links">
            <h4>Help</h4>
            <a href="/#support">Contact Us</a>
            <Link to="/shipping-policy">Shipping Info</Link>
            <Link to="/return-policy">Returns &amp; Refunds</Link>
            <a href="/#support">Track Order</a>
            <a href="/#support">FAQ</a>
          </div>

          <div className="market-footer-links">
            <h4>Company</h4>
            <Link to="/#about-us">About Us</Link>
            <a href="/#support">Blog</a>
            <a href="/#support">Careers</a>
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms of Service</Link>
          </div>
        </div>

        <div className="market-footer-bottom">
          <p>© 2026 CraftzyGifts. All rights reserved.</p>
          <div className="market-payment-list">
            <span>Visa</span>
            <span>Mastercard</span>
            <span>UPI</span>
            <span>Net Banking</span>
          </div>
        </div>
      </footer>
    </section>
  );
}
