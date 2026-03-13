import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Header from "../components/Header";
import {
  DEFAULT_CATEGORY_TREE,
  buildCategoryPath,
  loadCategoryTree,
} from "../utils/categoryMaster";
import { getCategoryImage, getProductImage } from "../utils/productMedia";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false);
  const [featuredProducts, setFeaturedProducts] = useState([]);
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
        const res = await fetch(`${API_URL}/api/products`);
        if (!res.ok) return;
        const data = await res.json();
        const items = Array.isArray(data) ? data : data?.items;
        if (!Array.isArray(items) || items.length === 0) return;
        setFeaturedProducts(items.slice(0, 4));
      } catch {
        // No local fallback. Keep live data only.
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
      title: "Curated Craft Collections",
      text: "Handpicked gifts for birthdays, weddings, festivals, and more.",
      image: "/images/about/handcraft.png",
      path: "/products",
    },
    {
      title: "Custom Hampers",
      text: "Build a hamper with selected items, notes, and add‑ons.",
      image: "/images/about/customhamper.png",
      path: "/products?custom=1",
    },
    {
      title: "Secure Checkout",
      text: "Safe payments, clear tracking, and dependable support.",
      image: "/images/about/secure.png",
      path: "/checkout",
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
      text: "Limited-edition bundles, handwritten notes, and handcrafted keepsakes.",
      image: "/images/slide1.png",
      alt: "Romantic gift hamper collection",
    },
    {
      kicker: "PERSONALIZED GIFTS",
      title: "Design a gift box\nmade just for them",
      text: "Pick custom items, add a heartfelt message, and create a memorable reveal.",
      image: "/images/slide%202.png",
      alt: "Customized gift hamper",
    },
    {
      kicker: "CORPORATE ORDERS",
      title: "Premium gifting\nfor teams and clients",
      text: "Elegant bulk gifting with artisan products and reliable delivery timelines.",
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
            Your online marketplace for handmade crafts, personalized gifts, and
            specially curated gift hampers for birthdays, weddings, festivals,
            and every special moment.
          </p>
          <div className="hero-actions">
            <Link className="btn primary" to={shopLink}>
              Shop Now
            </Link>
            <Link className="btn ghost" to="/register">
              Create Account
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
            <h2>Perfect gifts for every occasion</h2>
            <p>Browse curated collections for life&apos;s special moments.</p>
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
            <h2>Featured crafts</h2>
            <p>Handpicked collection of our artisans&apos; finest work.</p>
          </div>
          <Link className="link" to="/products">
            View all products
          </Link>
        </div>
        <div className="product-grid featured-crafts-grid">
          {featuredProducts.map((item) => {
            const isCustomizable = Boolean(item.isCustomizable);
            const detailLink = item._id ? `/products/${item._id}` : "/products";
            return (
              <article key={item._id || item.name} className="product-card">
                <div className="featured-crafts-media">
                  <img
                    className="product-image large"
                    src={getProductImage(item)}
                    alt={item.name}
                  />
                  <span className="chip featured-crafts-badge">
                    {isCustomizable ? "Customizable" : "Ready-made"}
                  </span>
                </div>
                <div className="product-body">
                  <div className="product-top">
                    <h3>{item.name}</h3>
                  </div>
                  <div className="product-meta">
                    <span>{item.category || "Hamper"}</span>
                  </div>
                  <div className="product-price">
                    <strong>₹{formatPrice(item.price)}</strong>
                    <Link className="btn ghost" to={detailLink}>
                      View Details
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        {featuredProducts.length === 0 && (
          <p className="field-hint">No featured products available right now.</p>
        )}
      </section>

      <div id="support" />

      <section className="section highlights" id="about-us">
        <div className="section-head">
          <div>
            <h2>About Us</h2>
            <p>
              CraftzyGifts is a curated gifting marketplace that brings together
              verified artisans and thoughtful hamper creators. We help you find
              personalized, handcrafted gifts that feel memorable for every
              occasion.
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
