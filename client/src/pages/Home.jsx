import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Header from "../components/Header";
import ProductHoverImage from "../components/ProductHoverImage";
import {
  DEFAULT_CATEGORY_TREE,
  buildCategoryPath,
  loadCategoryTree,
} from "../utils/categoryMaster";
import { prefetchProductDetail } from "../utils/productDetailCache";
import { fetchJsonCached } from "../utils/jsonCache";
import { getCategoryImage } from "../utils/productMedia";

import { API_URL } from "../apiBase";

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false);
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [featuredError, setFeaturedError] = useState("");
  const [categoryTree, setCategoryTree] = useState(DEFAULT_CATEGORY_TREE);
  const location = useLocation();

  useEffect(() => {
    const checkAuth = () => setIsLoggedIn(Boolean(localStorage.getItem("token")));
    checkAuth();
    window.addEventListener("user:updated", checkAuth);
    return () => window.removeEventListener("user:updated", checkAuth);
  }, []);

  useEffect(() => {
    if (!location.hash) return;
    const targetId = location.hash.replace("#", "");
    const section = document.getElementById(targetId);
    if (!section) return;
    requestAnimationFrame(() => {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [location.hash]);

  const shopLink = isLoggedIn ? "/products" : "/login";

  useEffect(() => {
    const loadFeatured = async () => {
      try {
        setFeaturedLoading(true);
        setFeaturedError("");
        const params = new URLSearchParams({
          page: "1",
          limit: "4",
          sort: "newest",
        });
        const data = await fetchJsonCached(`${API_URL}/api/products?${params.toString()}`, {
          ttlMs: 60_000,
        });
        const items = Array.isArray(data) ? data : data?.items;
        setFeaturedProducts(Array.isArray(items) ? items : []);
      } catch {
        setFeaturedProducts([]);
        setFeaturedError("Our featured collection is taking a moment to load.");
      } finally {
        setFeaturedLoading(false);
      }
    };
    loadFeatured();
  }, []);

  useEffect(() => {
    let ignore = false;

    const hydrateCategoryTree = async () => {
      const nextTree = await loadCategoryTree();
      if (!ignore && Array.isArray(nextTree) && nextTree.length > 0) {
        setCategoryTree(nextTree);
      }
    };

    hydrateCategoryTree();
    return () => {
      ignore = true;
    };
  }, []);

  const features = [
    {
      title: "Curated Gift Collections",
      text: "Handpicked pieces for birthdays, weddings, festivals, and thoughtful everyday gifting.",
      image: "/images/about/handcraft.png",
      path: "/products",
    },
    {
      title: "Bespoke Hampers",
      text: "Design a custom hamper with handpicked treats, keepsakes, and a personal note.",
      image: "/images/about/customhamper.png",
      path: "/products?custom=1",
    },
    {
      title: "Seamless Checkout",
      text: "Trusted payments, clear order updates, and dependable support from start to doorstep.",
      image: "/images/about/secure.png",
      path: "/cart",
    },
  ];

  const occasionCards =
    (Array.isArray(categoryTree) && categoryTree.length > 0
      ? categoryTree
      : DEFAULT_CATEGORY_TREE
    ).map((group) => ({
      name: group.category,
      image: getCategoryImage(group.category),
      category: group.category,
    }));

  const formatPrice = (value) => {
    if (typeof value === "number") return value.toLocaleString("en-IN");
    if (typeof value === "string") return value.replace(/[₹\s]/g, "");
    return value;
  };

  const heroImages = [
    "/images/hero-birthday.png",
    "/images/hero-anniversary.jpg",
    "/images/hero-wedding.jpg",
  ];

  const carouselSlides = [
    {
      kicker: "SEASONAL PICKS",
      title: "Celebrate love\nwith curated\nhampers",
      text: "Limited-edition hampers, handwritten notes, and artisan keepsakes made for unforgettable moments.",
      image: "/images/slide1.png",
      alt: "Romantic gift hamper collection",
    },
    {
      kicker: "PERSONALIZED GIFTS",
      title: "Design a gift box\nmade just for them",
      text: "Choose meaningful details, add a heartfelt message, and create a gifting experience made just for them.",
      image: "/images/slide%202.png",
      alt: "Customized gift hamper",
    },
    {
      kicker: "CORPORATE ORDERS",
      title: "Premium gifting\nfor teams and clients",
      text: "Refined bulk gifting with artisan products, polished presentation, and reliable delivery timelines.",
      image: "/images/slide3.png",
      alt: "Corporate gift hamper set",
    },
  ];

  useEffect(() => {
    if (carouselPaused) return undefined;
    const timer = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % carouselSlides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [carouselPaused, carouselSlides.length]);

  const goPrevSlide = () =>
    setActiveSlide(
      (prev) => (prev - 1 + carouselSlides.length) % carouselSlides.length
    );

  const goNextSlide = () =>
    setActiveSlide((prev) => (prev + 1) % carouselSlides.length);

  return (
    <div className="page home">
      <Header />

      <section
        className="home-carousel"
        aria-label="Featured collections"
        onMouseEnter={() => setCarouselPaused(true)}
        onMouseLeave={() => setCarouselPaused(false)}
        onFocus={() => setCarouselPaused(true)}
        onBlur={() => setCarouselPaused(false)}
      >
        <div
          className="carousel-track"
          style={{ transform: `translateX(-${activeSlide * 100}%)` }}
        >
          {carouselSlides.map((slide, index) => (
            <article
              key={slide.title}
              className="carousel-slide"
              aria-hidden={activeSlide !== index}
            >
              <div className="carousel-copy">
                <p className="carousel-kicker">{slide.kicker}</p>
                <h2 className="carousel-title">{slide.title}</h2>
                <p className="carousel-text">{slide.text}</p>
              </div>
              <div className="carousel-media">
                <img src={slide.image} alt={slide.alt} />
              </div>
            </article>
          ))}
        </div>
        <button
          className="carousel-arrow prev"
          type="button"
          onClick={goPrevSlide}
          aria-label="Previous slide"
        >
          ‹
        </button>
        <button
          className="carousel-arrow next"
          type="button"
          onClick={goNextSlide}
          aria-label="Next slide"
        >
          ›
        </button>
        <div
          className="carousel-indicators"
          role="tablist"
          aria-label="Carousel slides"
        >
          {carouselSlides.map((slide, index) => (
            <button
              key={slide.title}
              type="button"
              className={`carousel-dot ${
                activeSlide === index ? "active" : ""
              }`}
              onClick={() => setActiveSlide(index)}
              aria-label={`Show slide ${index + 1}`}
              aria-pressed={activeSlide === index}
            />
          ))}
        </div>
      </section>

      <section className="hero-section">
        <div className="hero-content">
          <p className="hero-kicker">Discover Unique</p>
          <h1>
            Handmade Crafts &amp;
            <span> Gifts</span>
          </h1>
          <p className="hero-subtitle">
            Discover a curated destination for handmade gifts, bespoke hampers,
            and elegant keepsakes crafted for life&apos;s most meaningful
            celebrations.
          </p>
          <div className="hero-actions">
            <Link className="btn primary" to={shopLink}>
              Explore Collections
            </Link>
            <Link className="btn ghost" to="/register">
              Create Your Account
            </Link>
          </div>
        </div>
        <div className="hero-media">
          <img
            className="hero-image primary"
            src={heroImages[0]}
            alt="Featured hamper"
          />
          <div className="hero-stack">
            <img
              className="hero-image"
              src={heroImages[1]}
              alt="Anniversary gifts"
            />
            <img
              className="hero-image"
              src={heroImages[2]}
              alt="Wedding gifts"
            />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <h2>Thoughtful gifts for every occasion</h2>
            <p>Browse beautifully curated collections for life&apos;s most memorable moments.</p>
          </div>
        </div>
        <div className="occasion-grid">
          {occasionCards.map((item) => (
            <Link
              key={item.category}
              className="occasion-card"
              to={buildCategoryPath({ category: item.category })}
              aria-label={`Shop ${item.name} gifts`}
            >
              <img
                className="occasion-image"
                src={item.image}
                alt={`${item.name} gifts`}
                loading="lazy"
              />
              <span>{item.name}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="section" id="featured">
        <div className="section-head">
          <div>
            <h2>Featured collections</h2>
            <p>A refined edit of artisan-made gifts chosen for today&apos;s celebrations.</p>
          </div>
          <Link className="link" to="/products">
            View the full collection
          </Link>
        </div>
        {featuredLoading ? (
          <p className="field-hint">Loading featured products...</p>
        ) : featuredError ? (
          <p className="field-hint">{featuredError}</p>
        ) : featuredProducts.length > 0 ? (
          <div className="product-grid featured-crafts-grid">
            {featuredProducts.map((item) => {
              const isCustomizable = Boolean(item.isCustomizable);
              const detailLink = item._id ? `/products/${item._id}` : "/products";
              const prefetchCurrentProduct = () => {
                if (!item?._id) return;
                prefetchProductDetail(String(item._id), {
                  token: localStorage.getItem("token"),
                });
              };
              return (
                <article key={item._id || item.name} className="product-card">
                  <div className="featured-crafts-media">
                    <Link
                      to={detailLink}
                      onMouseEnter={prefetchCurrentProduct}
                      onFocus={prefetchCurrentProduct}
                      onTouchStart={prefetchCurrentProduct}
                    >
                      <ProductHoverImage
                        className="product-image large"
                        product={item}
                        alt={item.name}
                      />
                    </Link>
                    <span className="chip featured-crafts-badge">
                      {isCustomizable ? "Customizable" : "Ready-made"}
                    </span>
                  </div>
                  <div className="product-body">
                    <div className="product-top">
                      <h3>
                        <Link
                          to={detailLink}
                          onMouseEnter={prefetchCurrentProduct}
                          onFocus={prefetchCurrentProduct}
                          onTouchStart={prefetchCurrentProduct}
                        >
                          {item.name}
                        </Link>
                      </h3>
                    </div>
                    <div className="product-meta">
                      <span>{item.category || "Hamper"}</span>
                    </div>
                    <div className="product-price">
                      <strong>₹{formatPrice(item.price)}</strong>
                      <Link
                        className="btn ghost"
                        to={detailLink}
                        onMouseEnter={prefetchCurrentProduct}
                        onFocus={prefetchCurrentProduct}
                        onTouchStart={prefetchCurrentProduct}
                      >
                        View Details
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="field-hint">Fresh featured pieces will appear here shortly.</p>
        )}
      </section>

      <div id="support" />

      <section className="section highlights" id="about-us">
        <div className="section-head">
          <div>
            <h2>About Us</h2>
            <p>
              CraftzyGifts brings together verified artisans and thoughtful
              hamper creators to offer gifts that feel personal, polished, and
              memorable for every occasion.
            </p>
          </div>
        </div>
        <div className="feature-grid">
          {features.map((item) => (
            <Link key={item.title} to={item.path} className="feature-card">
              <img
                className="feature-image"
                src={item.image}
                alt={item.title}
                loading="lazy"
              />
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </Link>
          ))}
        </div>
      </section>

    </div>
  );
}
