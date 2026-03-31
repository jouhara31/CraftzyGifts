import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../apiBase";
import { clearAuthSession } from "../utils/authSession";
import useHashScroll from "../utils/useHashScroll";

const asText = (value) => String(value ?? "").trim();

export default function SellerMarketing() {
  const navigate = useNavigate();
  useHashScroll();
  const [profile, setProfile] = useState(null);
  const [products, setProducts] = useState([]);
  const [marketing, setMarketing] = useState({
    promoHeadline: "",
    promoSubheadline: "",
    bannerImageUrl: "",
    featuredProductIds: [],
    couponCode: "",
    couponDiscountPercent: "0",
    couponActive: false,
    campaignNotes: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const clearAndRedirect = useCallback(() => {
    clearAuthSession();
    navigate("/login", { replace: true });
  }, [navigate]);

  const applyMarketingSnapshot = useCallback((profileData = {}) => {
    setProfile(profileData);
    setMarketing({
      promoHeadline: asText(profileData?.sellerMarketing?.promoHeadline),
      promoSubheadline: asText(profileData?.sellerMarketing?.promoSubheadline),
      bannerImageUrl: asText(profileData?.sellerMarketing?.bannerImageUrl),
      featuredProductIds: Array.isArray(profileData?.sellerMarketing?.featuredProductIds)
        ? profileData.sellerMarketing.featuredProductIds.map((entry) => asText(entry)).filter(Boolean)
        : [],
      couponCode: asText(profileData?.sellerMarketing?.couponCode),
      couponDiscountPercent: String(profileData?.sellerMarketing?.couponDiscountPercent ?? 0),
      couponActive: Boolean(profileData?.sellerMarketing?.couponActive),
      campaignNotes: asText(profileData?.sellerMarketing?.campaignNotes),
    });
  }, []);

  const loadPage = useCallback(async () => {
    const token = asText(localStorage.getItem("token"));
    if (!token) {
      clearAndRedirect();
      return;
    }

    setLoading(true);
    setError("");
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [profileRes, productsRes] = await Promise.all([
        fetch(`${API_URL}/api/users/me`, { headers }),
        fetch(`${API_URL}/api/products/seller/me`, { headers }),
      ]);
      if (profileRes.status === 401 || productsRes.status === 401) {
        clearAndRedirect();
        return;
      }
      const [profileData, productsData] = await Promise.all([
        profileRes.json().catch(() => ({})),
        productsRes.json().catch(() => []),
      ]);
      if (!profileRes.ok) {
        setError(profileData?.message || "Unable to load seller marketing settings.");
        return;
      }
      if (!productsRes.ok) {
        setError(productsData?.message || "Unable to load seller products.");
        return;
      }
      applyMarketingSnapshot(profileData);
      setProducts(Array.isArray(productsData) ? productsData : []);
    } catch {
      setError("Unable to load seller marketing settings.");
    } finally {
      setLoading(false);
    }
  }, [applyMarketingSnapshot, clearAndRedirect]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const featuredProducts = useMemo(() => {
    const featuredIds = new Set(marketing.featuredProductIds);
    return products.filter((product) => featuredIds.has(asText(product?._id)));
  }, [marketing.featuredProductIds, products]);

  const toggleFeaturedProduct = (productId) => {
    setMarketing((prev) => {
      const normalizedId = asText(productId);
      const nextIds = prev.featuredProductIds.includes(normalizedId)
        ? prev.featuredProductIds.filter((entry) => entry !== normalizedId)
        : [...prev.featuredProductIds, normalizedId].slice(0, 6);
      return { ...prev, featuredProductIds: nextIds };
    });
  };

  const handleSave = async (event) => {
    event.preventDefault();
    const token = asText(localStorage.getItem("token"));
    if (!token) {
      clearAndRedirect();
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/users/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sellerMarketing: {
            promoHeadline: asText(marketing.promoHeadline),
            promoSubheadline: asText(marketing.promoSubheadline),
            bannerImageUrl: asText(marketing.bannerImageUrl),
            featuredProductIds: marketing.featuredProductIds,
            couponCode: asText(marketing.couponCode).toUpperCase(),
            couponDiscountPercent: Number(marketing.couponDiscountPercent || 0),
            couponActive: marketing.couponActive,
            campaignNotes: asText(marketing.campaignNotes),
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        clearAndRedirect();
        return;
      }
      if (!response.ok) {
        setError(data?.message || "Unable to save seller marketing settings.");
        return;
      }
      applyMarketingSnapshot(data);
      setNotice("Marketing settings updated.");
    } catch {
      setError("Unable to save seller marketing settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="seller-shell-view seller-marketing-page">
      <div className="section-head">
        <div>
          <h2>Offers and marketing</h2>
          <p>Set banner copy, coupon details, campaign notes, and featured products for your store.</p>
        </div>
        <div className="seller-toolbar">
          <button className="btn ghost" type="button" onClick={loadPage}>
            Refresh
          </button>
        </div>
      </div>

      {loading ? <p className="field-hint">Loading marketing workspace...</p> : null}
      {error ? <p className="field-hint">{error}</p> : null}
      {notice ? <p className="field-hint">{notice}</p> : null}

      {!loading ? (
        <div className="seller-settings-grid">
          <section
            className="seller-panel seller-settings-card seller-anchor-section"
            id="marketing-campaigns"
          >
            <div className="seller-panel-head">
              <div>
                <h3>Campaign setup</h3>
                <p>Define headline copy, offer notes, and storefront-ready banner details.</p>
              </div>
            </div>

            <form className="auth-form seller-settings-form" onSubmit={handleSave}>
              <label className="field">
                <span>Promo headline</span>
                <input
                  type="text"
                  value={marketing.promoHeadline}
                  onChange={(event) =>
                    setMarketing((prev) => ({ ...prev, promoHeadline: event.target.value }))
                  }
                  placeholder="Handmade gift offers this week"
                />
              </label>
              <label className="field">
                <span>Promo subheadline</span>
                <input
                  type="text"
                  value={marketing.promoSubheadline}
                  onChange={(event) =>
                    setMarketing((prev) => ({ ...prev, promoSubheadline: event.target.value }))
                  }
                  placeholder="Free shipping, festive bundles, or custom hamper launch details"
                />
              </label>
              <label className="field">
                <span>Banner image URL</span>
                <input
                  type="text"
                  value={marketing.bannerImageUrl}
                  onChange={(event) =>
                    setMarketing((prev) => ({ ...prev, bannerImageUrl: event.target.value }))
                  }
                  placeholder="https://..."
                />
              </label>
              <div className="field-row">
                <label className="field">
                  <span>Coupon code</span>
                  <input
                    type="text"
                    value={marketing.couponCode}
                    onChange={(event) =>
                      setMarketing((prev) => ({ ...prev, couponCode: event.target.value.toUpperCase() }))
                    }
                    placeholder="CRAFT10"
                  />
                </label>
                <label className="field">
                  <span>Discount percent</span>
                  <input
                    type="number"
                    min="0"
                    max="90"
                    step="1"
                    value={marketing.couponDiscountPercent}
                    onChange={(event) =>
                      setMarketing((prev) => ({
                        ...prev,
                        couponDiscountPercent: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <label className="field">
                <span>Campaign notes</span>
                <textarea
                  rows="4"
                  value={marketing.campaignNotes}
                  onChange={(event) =>
                    setMarketing((prev) => ({ ...prev, campaignNotes: event.target.value }))
                  }
                  placeholder="Keep a note of your current promotion plan, budget, or product push."
                />
              </label>
              <label className="field">
                <span>Coupon status</span>
                <select
                  value={marketing.couponActive ? "active" : "inactive"}
                  onChange={(event) =>
                    setMarketing((prev) => ({
                      ...prev,
                      couponActive: event.target.value === "active",
                    }))
                  }
                >
                  <option value="inactive">Inactive</option>
                  <option value="active">Active</option>
                </select>
              </label>

              <div className="seller-settings-actions">
                <button className="btn primary" type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save marketing settings"}
                </button>
              </div>
            </form>
          </section>

          <section
            className="seller-panel seller-settings-card seller-anchor-section"
            id="marketing-featured"
          >
            <div className="seller-panel-head">
              <div>
                <h3>Featured products</h3>
                <p>Select up to 6 listings that deserve extra seller-side promotion.</p>
              </div>
              <span className="chip">{featuredProducts.length} featured</span>
            </div>

            <div className="payout-grid">
              {products.map((product) => {
                const productId = asText(product?._id);
                const isFeatured = marketing.featuredProductIds.includes(productId);
                return (
                  <div key={productId} className="payout-card">
                    <div className="payout-head">
                      <span>{asText(product?.name) || "Product"}</span>
                      <span className={`status-pill ${isFeatured ? "success" : "info"}`}>
                        {isFeatured ? "Featured" : "Available"}
                      </span>
                    </div>
                    <p className="payout-sub">
                      ₹{Number(product?.price || 0).toLocaleString("en-IN")} · Stock{" "}
                      {Number(product?.stock || 0)}
                    </p>
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() => toggleFeaturedProduct(productId)}
                    >
                      {isFeatured ? "Remove from featured" : "Mark as featured"}
                    </button>
                  </div>
                );
              })}
              {products.length === 0 ? (
                <p className="field-hint">Create products first to manage featured listings.</p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
