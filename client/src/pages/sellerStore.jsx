import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Header from "../components/Header";
import { getProductImage } from "../utils/productMedia";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const formatPrice = (value) => Number(value || 0).toLocaleString("en-IN");

const readPickupText = (pickupAddress = {}) =>
  [pickupAddress?.line1, pickupAddress?.city, pickupAddress?.state, pickupAddress?.pincode]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(", ");

export default function SellerStore() {
  const { sellerId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [storeData, setStoreData] = useState({
    seller: null,
    products: [],
    stats: null,
  });

  useEffect(() => {
    let ignore = false;

    const loadStore = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`${API_URL}/api/products/seller/${sellerId}/public?limit=48`);
        if (!res.ok) {
          throw new Error(
            res.status === 404 ? "Seller store not found." : "Unable to load seller store."
          );
        }
        const data = await res.json();
        if (ignore) return;
        setStoreData({
          seller: data?.seller || null,
          products: Array.isArray(data?.products) ? data.products : [],
          stats: data?.stats || null,
        });
      } catch (loadErr) {
        if (ignore) return;
        setStoreData({ seller: null, products: [], stats: null });
        setError(loadErr?.message || "Unable to load seller store.");
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    if (sellerId) {
      loadStore();
    } else {
      setLoading(false);
      setError("Seller id is missing.");
    }

    return () => {
      ignore = true;
    };
  }, [sellerId]);

  const seller = storeData?.seller || {};
  const products = useMemo(
    () => (Array.isArray(storeData?.products) ? storeData.products : []),
    [storeData?.products]
  );
  const sellerName = String(seller?.storeName || seller?.name || "Seller Store").trim();
  const sellerInitial = sellerName.charAt(0).toUpperCase() || "S";
  const pickupText = readPickupText(seller?.pickupAddress);
  const categoryCount = useMemo(
    () =>
      new Set(
        products
          .map((item) => String(item?.category || "").trim())
          .filter(Boolean)
      ).size,
    [products]
  );

  return (
    <div className="page seller-store-page">
      <Header />
      <div className="section-head">
        <div>
          <h2>{sellerName}</h2>
          <p>Public store profile with listed products and seller information.</p>
        </div>
        <Link className="link" to="/products">
          Back to products
        </Link>
      </div>

      {loading && (
        <section className="seller-store-status">
          <p>Loading store...</p>
        </section>
      )}

      {!loading && error && (
        <section className="seller-store-status">
          <p>{error}</p>
        </section>
      )}

      {!loading && !error && (
        <>
          <section className="seller-store-hero">
            <div className="seller-store-avatar" aria-hidden="true">
              {sellerInitial}
            </div>
            <div className="seller-store-copy">
              <p className="mini-title">Seller profile</p>
              <h3>{sellerName}</h3>
              <p>
                {String(seller?.about || "").trim() ||
                  "Curated gifting store with made-to-order and ready-made hampers."}
              </p>
            </div>
            <div className="seller-store-meta">
              <p>
                <span className="seller-store-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path
                      d="M4.5 9.25c0-1.8 1.45-3.25 3.25-3.25h8.5c1.8 0 3.25 1.45 3.25 3.25v8.5c0 1.8-1.45 3.25-3.25 3.25h-8.5c-1.8 0-3.25-1.45-3.25-3.25v-8.5Z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                    <path
                      d="M8 12h8M12 8v8"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                {storeData?.stats?.totalProducts || products.length} products listed
              </p>
              <p>
                <span className="seller-store-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path
                      d="M4 6.5h16v11H4z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                    <path
                      d="m4.5 7 7.5 6 7.5-6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                  </svg>
                </span>
                {String(seller?.supportEmail || seller?.phone || "Support contact available").trim()}
              </p>
              <p>
                <span className="seller-store-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path
                      d="M12 21s6-5.5 6-10a6 6 0 1 0-12 0c0 4.5 6 10 6 10Z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                    <circle cx="12" cy="11" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                </span>
                {pickupText || "Pickup location will be shared by seller"}
              </p>
              <p>
                <span className="seller-store-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path
                      d="M4 8h16v8H4zM8 5h8v3M8 16h8v3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                {categoryCount} categories
              </p>
            </div>
          </section>

          <section className="seller-store-products">
            <div className="card-head">
              <p className="card-title">Products from this seller</p>
              <span className="chip">{products.length} items</span>
            </div>
            {products.length > 0 ? (
              <div className="seller-store-grid">
                {products.map((item) => (
                  <article key={item._id} className="seller-store-product">
                    <img src={getProductImage(item)} alt={item.name} loading="lazy" />
                    <div className="seller-store-product-body">
                      <h4>{item.name}</h4>
                      <p>{item.category || "Hamper"}</p>
                      <div className="seller-store-product-row">
                        <strong>₹{formatPrice(item.price)}</strong>
                        <span className={`status-pill ${Number(item.stock || 0) > 0 ? "available" : "locked"}`}>
                          {Number(item.stock || 0) > 0 ? "In stock" : "Out of stock"}
                        </span>
                      </div>
                      <Link className="btn ghost seller-store-link" to={`/products/${item._id}`}>
                        View Product
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="field-hint">No products published yet.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
