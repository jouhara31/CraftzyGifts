import { Link } from "react-router-dom";
import logoPng from "../assets/logo.png";

export default function Footer() {
  return (
    <section className="market-footer-shell">
      <div className="market-footer-benefits">
        <article className="market-benefit-item">
          <span className="market-benefit-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M4 8.5 12 4l8 4.5-8 4.5-8-4.5Z" />
              <path d="M4 8.5V16l8 4 8-4V8.5" />
              <path d="M12 13v7" />
              <path d="M8.5 6l7 4" />
            </svg>
          </span>
          <div>
            <h4>Curated Gifts</h4>
            <p>Thoughtful picks for every occasion</p>
          </div>
        </article>

        <article className="market-benefit-item">
          <span className="market-benefit-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 3l7 3v5c0 4.4-2.8 8.4-7 10-4.2-1.6-7-5.6-7-10V6l7-3z" />
            </svg>
          </span>
          <div>
            <h4>Secure Checkout</h4>
            <p>UPI, cards, and net banking support</p>
          </div>
        </article>

        <article className="market-benefit-item">
          <span className="market-benefit-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 4.5 13.9 8l3.9.6-2.8 2.8.7 4-3.7-1.8-3.7 1.8.7-4L6.2 8.6l3.9-.6L12 4.5Z" />
            </svg>
          </span>
          <div>
            <h4>Personalised Orders</h4>
            <p>Custom notes and hamper options on select gifts</p>
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
            <h4>Order Support</h4>
            <p>Help with tracking, delivery, and updates</p>
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
