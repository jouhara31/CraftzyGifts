import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { addToCart } from "../utils/cart";
import { getProductImage } from "../utils/productMedia";
import { getWishlist, toggleWishlist } from "../utils/wishlist";

function ViewIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="19" r="1.7" />
      <circle cx="17" cy="19" r="1.7" />
      <path d="M3 5h2l2.2 9.2a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.8L20 8H7" />
    </svg>
  );
}

function RemoveIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
      <path d="M6 7l1 12h10l1-12" />
    </svg>
  );
}

export default function Wishlist() {
  const [items, setItems] = useState(() => getWishlist());
  const navigate = useNavigate();

  const removeFromWishlist = (item) => {
    const productId = String(item?.id || item?._id || "").trim();
    setItems(
      toggleWishlist({
        id: productId,
        name: item.name,
        price: item.price,
      })
    );
  };

  const addItemToCart = (item) => {
    addToCart({
      id: item?.id || item?._id,
      name: item?.name,
      price: item?.price,
      mrp: item?.mrp,
      image: getProductImage(item),
      category: item?.category || item?.tag,
      tag: item?.tag,
      deliveryMinDays: item?.deliveryMinDays,
      deliveryMaxDays: item?.deliveryMaxDays,
      seller: item?.seller,
    });
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
    }
  }, [navigate]);

  if (items.length === 0) {
    return (
      <div className="page wishlist-page">
        <Header />
        <section className="wishlist-empty-state">
          <div className="section-head wishlist-head wishlist-head-empty">
            <div>
              <p className="wishlist-kicker">Saved For Later</p>
              <h2>Your wishlist is empty</h2>
              <p>Save your favorite hampers and gifts here.</p>
            </div>
            <Link className="link wishlist-head-link" to="/products">
              Browse products
            </Link>
          </div>
          <div className="wishlist-empty-card">
            <div className="wishlist-empty-copy">
              <span className="wishlist-empty-icon" aria-hidden="true">
                ❤
              </span>
              <div>
                <h3>No saved items yet</h3>
                <p>
                  Tap the heart icon on any product and it will show up here for
                  quick access later.
                </p>
              </div>
            </div>
            <div className="wishlist-empty-actions">
              <Link className="btn primary" to="/products">
                Explore products
              </Link>
              <Link className="btn ghost" to="/">
                Back to home
              </Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page wishlist-page">
      <Header />
      <section className="wishlist-shell">
        <div className="section-head wishlist-head">
          <div>
            <p className="wishlist-kicker">Saved Collection</p>
            <h2>Your wishlist</h2>
            <p>Keep track of your favorite products.</p>
          </div>
          <div className="wishlist-head-actions">
            <span className="chip wishlist-count">{items.length} saved</span>
            <Link className="link wishlist-head-link" to="/products">
              Continue shopping
            </Link>
          </div>
        </div>

        <div className="product-grid wishlist-grid">
          {items.map((item) => {
            const productId = String(item?.id || item?._id || "").trim();
            const productPath = productId ? `/products/${productId}` : "/products";

            return (
              <article key={productId || item.name} className="product-card wishlist-card">
                <Link className="wishlist-card-media" to={productPath}>
                  <img
                    className="product-image wishlist-image"
                    src={getProductImage(item)}
                    alt={item.name}
                  />
                </Link>
                <div className="product-body wishlist-card-body">
                  <div className="product-top wishlist-card-top">
                    <div className="wishlist-title-block">
                      <h3>{item.name}</h3>
                      <p className="wishlist-card-note">
                        Ready when you want to revisit it.
                      </p>
                    </div>
                    <span className="chip wishlist-chip">{item.tag || "Favorite"}</span>
                  </div>
                  <div className="product-price wishlist-price-row">
                    <strong>₹{item.price}</strong>
                    <div className="wishlist-card-actions wishlist-card-actions-desktop">
                      <Link className="btn ghost" to={productPath}>
                        View item
                      </Link>
                      <button
                        className="btn ghost wishlist-remove-btn"
                        type="button"
                        onClick={() => removeFromWishlist(item)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="wishlist-mobile-actions">
                    <Link
                      className="wishlist-icon-action"
                      to={productPath}
                      aria-label={`View ${item.name}`}
                    >
                      <ViewIcon />
                    </Link>
                    <button
                      className="wishlist-icon-action wishlist-cart-action"
                      type="button"
                      onClick={() => addItemToCart(item)}
                      aria-label={`Add ${item.name} to cart`}
                    >
                      <CartIcon />
                    </button>
                    <button
                      className="wishlist-icon-action wishlist-remove-btn"
                      type="button"
                      onClick={() => removeFromWishlist(item)}
                      aria-label={`Remove ${item.name} from wishlist`}
                    >
                      <RemoveIcon />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
