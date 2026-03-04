import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { getProductImage } from "../utils/productMedia";
import { getWishlist, toggleWishlist } from "../utils/wishlist";

export default function Wishlist() {
  const [items, setItems] = useState(() => getWishlist());
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
    }
  }, [navigate]);

  if (items.length === 0) {
    return (
      <div className="page">
        <Header />
        <div className="section-head">
          <div>
            <h2>Your wishlist is empty</h2>
            <p>Save your favorite hampers and gifts here.</p>
          </div>
          <Link className="link" to="/products">
            Browse products
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <Header />
      <div className="section-head">
        <div>
          <h2>Your wishlist</h2>
          <p>Keep track of your favorite products.</p>
        </div>
        <Link className="link" to="/products">
          Continue shopping
        </Link>
      </div>

      <div className="product-grid">
        {items.map((item) => {
          const productId = String(item?.id || item?._id || "").trim();

          return (
          <article key={productId || item.name} className="product-card">
            <Link to={productId ? `/products/${productId}` : "/products"}>
              <img
                className="product-image"
                src={getProductImage(item)}
                alt={item.name}
              />
            </Link>
            <div className="product-body">
              <div className="product-top">
                <h3>{item.name}</h3>
                <span className="chip">{item.tag || "Favorite"}</span>
              </div>
              <div className="product-price">
                <strong>₹{item.price}</strong>
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() =>
                    setItems(
                      toggleWishlist({
                        id: productId,
                        name: item.name,
                        price: item.price,
                      })
                    )
                  }
                >
                  Remove
                </button>
              </div>
            </div>
          </article>
          );
        })}
      </div>
    </div>
  );
}
