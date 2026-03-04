const bcrypt = require("bcryptjs");
const User = require("./models/User");
const Product = require("./models/Product");

const defaultCustomization = {
  giftBoxes: ["Velvet Peach", "Ivory Linen", "Matte Black", "Royal Gold"],
  chocolates: ["Dark Cocoa", "Milk Hazelnut", "Caramel Almond", "Orange Zest"],
  frames: ["Gold Edge", "Walnut Wood", "Acrylic Clear", "Minimal Matte"],
  perfumes: ["Rose Oud", "Jasmine Musk", "Vanilla Amber", "Citrus Bloom"],
  cards: ["Classic", "Floral", "Minimal", "Foil Lettering"],
};

const sampleSellers = [
  {
    name: "Anaya Kurup",
    email: "anaya@craftzygifts.com",
    storeName: "Anaya Handcrafted Hampers",
    phone: "9000000011",
  },
  {
    name: "Firoz Rahman",
    email: "firoz@craftzygifts.com",
    storeName: "Malabar Gift Atelier",
    phone: "9000000022",
  },
  {
    name: "Devika Pillai",
    email: "devika@craftzygifts.com",
    storeName: "Lotus & Lace Studio",
    phone: "9000000033",
  },
  {
    name: "Neeraj Thomas",
    email: "neeraj@craftzygifts.com",
    storeName: "Northstar Corporate Gifting",
    phone: "9000000044",
  },
  {
    name: "Sana Ibrahim",
    email: "sana@craftzygifts.com",
    storeName: "Sana Fragrance House",
    phone: "9000000055",
  },
  {
    name: "Aditya Menon",
    email: "aditya@craftzygifts.com",
    storeName: "PaperTrail Memories",
    phone: "9000000066",
  },
  {
    name: "Ritu Sharma",
    email: "ritu@craftzygifts.com",
    storeName: "Rustic Return Gifts",
    phone: "9000000077",
  },
  {
    name: "Hiba Nizar",
    email: "hiba@craftzygifts.com",
    storeName: "Eden Bloom Crafts",
    phone: "9000000088",
  },
  {
    name: "Krishnan Iyer",
    email: "krishnan@craftzygifts.com",
    storeName: "Heritage Brass & Wood",
    phone: "9000000099",
  },
  {
    name: "Megha Varghese",
    email: "megha@craftzygifts.com",
    storeName: "CocoaNest Treats",
    phone: "9000000101",
  },
];

const sampleProducts = [
  {
    name: "Handpainted Birthday Memory Box",
    category: "Birthday",
    price: 2899,
    isCustomizable: true,
    makingCharge: 260,
    sellerEmail: "anaya@craftzygifts.com",
    description: "Premium birthday box with handmade decor, candles, and notes.",
  },
  {
    name: "Pastel Balloon Celebration Hamper",
    category: "Birthday",
    price: 2490,
    isCustomizable: true,
    makingCharge: 220,
    sellerEmail: "anaya@craftzygifts.com",
    description: "Color-themed birthday hamper with chocolates and mini keepsakes.",
  },
  {
    name: "Chocolate Confetti Party Crate",
    category: "Birthday",
    price: 1999,
    isCustomizable: false,
    sellerEmail: "megha@craftzygifts.com",
    description: "Birthday crate packed with artisan chocolates and cake toppers.",
  },
  {
    name: "Kids Starry Birthday Kit",
    category: "Birthday",
    price: 1690,
    isCustomizable: false,
    sellerEmail: "hiba@craftzygifts.com",
    description: "Fun birthday gifting kit with stationery and mini toys.",
  },
  {
    name: "Rose Gold Anniversary Chest",
    category: "Anniversary",
    price: 3590,
    isCustomizable: true,
    makingCharge: 320,
    sellerEmail: "devika@craftzygifts.com",
    description: "Curated anniversary chest with fragrances and couple mementos.",
  },
  {
    name: "Couple Date Night Basket",
    category: "Anniversary",
    price: 3190,
    isCustomizable: true,
    makingCharge: 280,
    sellerEmail: "sana@craftzygifts.com",
    description: "Date night essentials basket with candles, treats, and cards.",
  },
  {
    name: "Personalized Vow Journal Set",
    category: "Anniversary",
    price: 2250,
    isCustomizable: true,
    makingCharge: 190,
    sellerEmail: "aditya@craftzygifts.com",
    description: "Handbound journal set with custom names and message inserts.",
  },
  {
    name: "Midnight Scented Anniversary Box",
    category: "Anniversary",
    price: 2790,
    isCustomizable: false,
    sellerEmail: "sana@craftzygifts.com",
    description: "Luxury fragrance hamper for anniversary surprise gifting.",
  },
  {
    name: "Bridal Mehendi Essentials Hamper",
    category: "Wedding",
    price: 4390,
    isCustomizable: true,
    makingCharge: 330,
    sellerEmail: "devika@craftzygifts.com",
    description: "Bridal care hamper with floral accessories and self-care picks.",
  },
  {
    name: "Groom Celebration Grooming Kit",
    category: "Wedding",
    price: 3690,
    isCustomizable: false,
    sellerEmail: "krishnan@craftzygifts.com",
    description: "Premium groom gift kit featuring grooming and fragrance items.",
  },
  {
    name: "Wedding Return Trunk Premium",
    category: "Wedding",
    price: 6290,
    isCustomizable: true,
    makingCharge: 380,
    sellerEmail: "ritu@craftzygifts.com",
    description: "Large return trunk set suitable for curated wedding giveaways.",
  },
  {
    name: "Couple Blessings Temple Gift Set",
    category: "Wedding",
    price: 2890,
    isCustomizable: false,
    sellerEmail: "krishnan@craftzygifts.com",
    description: "Traditional handcrafted puja gift set for new couples.",
  },
  {
    name: "Terracotta Diyas Return Gift Pack",
    category: "Return gifts",
    price: 1490,
    isCustomizable: false,
    sellerEmail: "firoz@craftzygifts.com",
    description: "Set of handcrafted terracotta diyas ideal for guest return gifts.",
  },
  {
    name: "Mini Brass Uruli Return Gift",
    category: "Return gifts",
    price: 1990,
    isCustomizable: false,
    sellerEmail: "krishnan@craftzygifts.com",
    description: "Elegant brass uruli set for wedding and housewarming guests.",
  },
  {
    name: "Coconut Shell Candle Duo",
    category: "Return gifts",
    price: 1290,
    isCustomizable: false,
    sellerEmail: "firoz@craftzygifts.com",
    description: "Natural soy candle duo in polished coconut shells.",
  },
  {
    name: "Kerala Banana Chips Favor Box",
    category: "Return gifts",
    price: 990,
    isCustomizable: false,
    sellerEmail: "megha@craftzygifts.com",
    description: "Snack favor box with premium banana chips and sweet mix.",
  },
  {
    name: "Onam Sadya Delight Basket",
    category: "Festivals",
    price: 2590,
    isCustomizable: true,
    makingCharge: 230,
    sellerEmail: "firoz@craftzygifts.com",
    description: "Onam themed basket with traditional treats and decor accents.",
  },
  {
    name: "Diwali Lights and Sweets Hamper",
    category: "Festivals",
    price: 3190,
    isCustomizable: true,
    makingCharge: 270,
    sellerEmail: "megha@craftzygifts.com",
    description: "Diwali hamper with mithai, candles, and festive decor.",
  },
  {
    name: "Eid Festive Dates and Attar Box",
    category: "Festivals",
    price: 2790,
    isCustomizable: false,
    sellerEmail: "sana@craftzygifts.com",
    description: "Curated eid gifting box with dates, attar, and prayer essentials.",
  },
  {
    name: "Christmas Cocoa and Cookies Crate",
    category: "Festivals",
    price: 2390,
    isCustomizable: false,
    sellerEmail: "megha@craftzygifts.com",
    description: "Holiday crate with handmade cookies, cocoa mix, and ornaments.",
  },
  {
    name: "Employee Welcome Desk Kit",
    category: "Corporate",
    price: 1890,
    isCustomizable: true,
    makingCharge: 170,
    sellerEmail: "neeraj@craftzygifts.com",
    description: "Onboarding kit with custom branding and desk essentials.",
  },
  {
    name: "Client Appreciation Premium Box",
    category: "Corporate",
    price: 3490,
    isCustomizable: true,
    makingCharge: 260,
    sellerEmail: "neeraj@craftzygifts.com",
    description: "Premium corporate gift box for key clients and partners.",
  },
  {
    name: "Quarterly Team Wellness Pack",
    category: "Corporate",
    price: 2690,
    isCustomizable: false,
    sellerEmail: "neeraj@craftzygifts.com",
    description: "Wellness essentials package for internal team gifting.",
  },
  {
    name: "Executive Tea and Journal Set",
    category: "Corporate",
    price: 2190,
    isCustomizable: false,
    sellerEmail: "krishnan@craftzygifts.com",
    description: "Refined executive gifting combo with tea caddy and journal.",
  },
  {
    name: "Customized Photo Frame Set",
    category: "Gift Items",
    price: 1790,
    isCustomizable: true,
    makingCharge: 180,
    sellerEmail: "aditya@craftzygifts.com",
    description: "Set of personalized photo frames with custom engraving.",
  },
  {
    name: "Handwritten Letter Keepsake Kit",
    category: "Gift Items",
    price: 1390,
    isCustomizable: true,
    makingCharge: 150,
    sellerEmail: "aditya@craftzygifts.com",
    description: "Classic keepsake kit for letter gifting and memory notes.",
  },
  {
    name: "Name Engraved Wooden Pen Box",
    category: "Gift Items",
    price: 1590,
    isCustomizable: true,
    makingCharge: 140,
    sellerEmail: "krishnan@craftzygifts.com",
    description: "Wooden pen case with laser engraved names and messages.",
  },
  {
    name: "Aromatherapy Perfume Trio",
    category: "Gift Items",
    price: 1890,
    isCustomizable: false,
    sellerEmail: "sana@craftzygifts.com",
    description: "Three-blend fragrance set for daily and festive gifting.",
  },
  {
    name: "Premium Coffee Sampler Canister",
    category: "Gift Items",
    price: 1690,
    isCustomizable: false,
    sellerEmail: "megha@craftzygifts.com",
    description: "Artisan coffee sampler with reusable gift canister.",
  },
  {
    name: "Travel Memory Scrapbook Deluxe",
    category: "Gift Items",
    price: 2090,
    isCustomizable: true,
    makingCharge: 200,
    sellerEmail: "aditya@craftzygifts.com",
    description: "Deluxe scrapbook kit for preserving travel memories.",
  },
  {
    name: "Baby Announcement Keepsake Hamper",
    category: "Gift Items",
    price: 2990,
    isCustomizable: true,
    makingCharge: 240,
    sellerEmail: "hiba@craftzygifts.com",
    description: "Soft pastel hamper for new baby announcement gifting.",
  },
  {
    name: "Valentine Luxe Rose and Chocolate Box",
    category: "Anniversary",
    price: 3390,
    isCustomizable: true,
    makingCharge: 280,
    sellerEmail: "megha@craftzygifts.com",
    description: "Luxury valentine box with curated chocolates and rose styling.",
    images: ["/images/chocolate-hampers/choco-hamper-01.jpg"],
  },
  {
    name: "Floral Raffaello Love Gift Box",
    category: "Anniversary",
    price: 2890,
    isCustomizable: false,
    sellerEmail: "megha@craftzygifts.com",
    description: "Romantic floral arrangement with Raffaello and premium treats.",
    images: ["/images/chocolate-hampers/choco-hamper-02.jpg"],
  },
  {
    name: "Custom Ferrero Bloom Hamper",
    category: "Anniversary",
    price: 3190,
    isCustomizable: true,
    makingCharge: 260,
    sellerEmail: "megha@craftzygifts.com",
    description: "Customizable hamper with Ferrero accents and bloom decor.",
    images: ["/images/chocolate-hampers/choco-hamper-03.jpg"],
  },
  {
    name: "Silk and Ferrero Classic Duo Box",
    category: "Gift Items",
    price: 2490,
    isCustomizable: false,
    sellerEmail: "megha@craftzygifts.com",
    description: "Classic duo featuring Cadbury Silk and Ferrero favorites.",
    images: ["/images/chocolate-hampers/choco-hamper-04.jpg"],
  },
  {
    name: "Snickers and KitKat Bloom Box",
    category: "Gift Items",
    price: 2590,
    isCustomizable: false,
    sellerEmail: "megha@craftzygifts.com",
    description: "Bright gift box packed with Snickers, KitKat, and floral touch.",
    images: ["/images/chocolate-hampers/choco-hamper-05.jpg"],
  },
  {
    name: "Raffaello Rose Ribbon Hamper",
    category: "Anniversary",
    price: 2790,
    isCustomizable: false,
    sellerEmail: "megha@craftzygifts.com",
    description: "Ribbon wrapped rose hamper with Raffaello and Ferrero selection.",
    images: ["/images/chocolate-hampers/choco-hamper-06.jpg"],
  },
  {
    name: "Mixed Chocolate Celebration Crate",
    category: "Gift Items",
    price: 2690,
    isCustomizable: true,
    makingCharge: 220,
    sellerEmail: "megha@craftzygifts.com",
    description: "Celebration crate with mixed chocolate bars and festive styling.",
    images: ["/images/chocolate-hampers/choco-hamper-07.jpg"],
  },
  {
    name: "Everyday Chocolate Surprise Box",
    category: "Gift Items",
    price: 1990,
    isCustomizable: false,
    sellerEmail: "megha@craftzygifts.com",
    description: "Simple chocolate surprise box for casual gifting moments.",
    images: ["/images/chocolate-hampers/choco-hamper-08.jpg"],
  },
  {
    name: "KitKat and Ferrero Heart Tray",
    category: "Anniversary",
    price: 2290,
    isCustomizable: false,
    sellerEmail: "megha@craftzygifts.com",
    description: "Heart-themed tray with KitKat bars and Ferrero chocolates.",
    images: ["/images/chocolate-hampers/choco-hamper-09.jpg"],
  },
  {
    name: "Assorted Choco Party Basket",
    category: "Birthday",
    price: 2890,
    isCustomizable: true,
    makingCharge: 230,
    sellerEmail: "megha@craftzygifts.com",
    description: "Party basket loaded with assorted chocolate bars and minis.",
    images: ["/images/chocolate-hampers/choco-hamper-10.jpg"],
  },
  {
    name: "Festive Chocolate Tower Bouquet",
    category: "Gift Items",
    price: 3490,
    isCustomizable: false,
    sellerEmail: "megha@craftzygifts.com",
    description: "Tower-style bouquet with premium chocolate assortment.",
    images: ["/images/chocolate-hampers/choco-hamper-11.jpg"],
  },
  {
    name: "Rose Chocolate Basket Deluxe",
    category: "Anniversary",
    price: 3290,
    isCustomizable: false,
    sellerEmail: "megha@craftzygifts.com",
    description: "Deluxe basket with chocolate picks, roses, and Ferrero accents.",
    images: ["/images/chocolate-hampers/choco-hamper-12.jpg"],
  },
  {
    name: "Floral Chocolate Gift Assortment",
    category: "Gift Items",
    price: 2390,
    isCustomizable: false,
    sellerEmail: "megha@craftzygifts.com",
    description: "Compact floral assortment with curated chocolate selection.",
    images: ["/images/chocolate-hampers/choco-hamper-13.jpg"],
  },
  {
    name: "Luxury Rose Choco Signature Box",
    category: "Anniversary",
    price: 3590,
    isCustomizable: true,
    makingCharge: 300,
    sellerEmail: "megha@craftzygifts.com",
    description: "Signature luxury rose box with handpicked chocolate lineup.",
    images: ["/images/chocolate-hampers/choco-hamper-14.jpg"],
  },
  {
    name: "Grand Floral Chocolate Platter",
    category: "Birthday",
    price: 4190,
    isCustomizable: true,
    makingCharge: 320,
    sellerEmail: "megha@craftzygifts.com",
    description: "Large floral platter crafted for premium celebration gifting.",
    images: ["/images/chocolate-hampers/choco-hamper-15.jpg"],
  },
  {
    name: "Heart Shape Ferrero Chocolate Tower",
    category: "Anniversary",
    price: 3090,
    isCustomizable: false,
    sellerEmail: "megha@craftzygifts.com",
    description: "Heart shape Ferrero tower for elegant romantic gifting.",
    images: ["/images/chocolate-hampers/choco-hamper-16.jpg"],
  },
  {
    name: "Luxe Leaf Floral Chocolate Hamper",
    category: "Anniversary",
    price: 4390,
    isCustomizable: true,
    makingCharge: 340,
    sellerEmail: "megha@craftzygifts.com",
    description: "Premium floral hamper with luxe chocolate and leaf styling.",
    images: ["/images/chocolate-hampers/choco-hamper-17.jpg"],
  },
  {
    name: "Velvet Valentine Rose Hamper",
    category: "Anniversary",
    price: 2990,
    isCustomizable: false,
    sellerEmail: "megha@craftzygifts.com",
    description: "Velvet valentine hamper with rose details and sweet assortments.",
    images: ["/images/chocolate-hampers/choco-hamper-18.jpg"],
  },
  {
    name: "Premium Valentine Chocolate Box",
    category: "Anniversary",
    price: 3190,
    isCustomizable: true,
    makingCharge: 260,
    sellerEmail: "megha@craftzygifts.com",
    description: "Premium valentine chocolate box with enhanced gift presentation.",
    images: ["/images/chocolate-hampers/choco-hamper-19.jpg"],
  },
  {
    name: "DIY Valentine Chocolate Craft Box",
    category: "Gift Items",
    price: 1890,
    isCustomizable: false,
    sellerEmail: "megha@craftzygifts.com",
    description: "DIY-ready valentine craft box with accessible chocolate picks.",
    images: ["/images/chocolate-hampers/choco-hamper-20.jpg"],
  },
  {
    name: "Rose Chocolate Gift Trunk",
    category: "Birthday",
    price: 2790,
    isCustomizable: true,
    makingCharge: 210,
    sellerEmail: "megha@craftzygifts.com",
    description: "Gift trunk with rose accents and balanced chocolate assortment.",
    images: ["/images/chocolate-hampers/choco-hamper-21.jpg"],
  },
  {
    name: "Classic Gift Chocolate Tray",
    category: "Gift Items",
    price: 2190,
    isCustomizable: false,
    sellerEmail: "megha@craftzygifts.com",
    description: "Classic tray presentation for chocolate gifting occasions.",
    images: ["/images/chocolate-hampers/choco-hamper-22.jpg"],
  },
];

const ensureSeller = async (seller, password) => {
  const existing = await User.findOne({ email: seller.email });
  if (existing) {
    existing.name = seller.name;
    existing.storeName = seller.storeName;
    existing.phone = seller.phone;
    existing.role = "seller";
    existing.sellerStatus = "approved";
    await existing.save();
    return { record: existing, created: false };
  }

  const record = await User.create({
    ...seller,
    password,
    role: "seller",
    sellerStatus: "approved",
  });
  return { record, created: true };
};

const seedSampleData = async () => {
  const password = await bcrypt.hash(process.env.SEED_SELLER_PASSWORD || "seller123", 10);
  const sellerMap = {};
  let createdSellerCount = 0;
  let updatedSellerCount = 0;

  for (const seller of sampleSellers) {
    const result = await ensureSeller(seller, password);
    if (result.created) createdSellerCount += 1;
    else updatedSellerCount += 1;
    sellerMap[seller.email] = result.record;
  }

  let createdCount = 0;
  let updatedCount = 0;

  for (const product of sampleProducts) {
    const seller = sellerMap[product.sellerEmail];
    if (!seller) continue;
    const exists = await Product.findOne({
      name: product.name,
      seller: seller._id,
    });
    const payload = {
      name: product.name,
      description: product.description,
      price: product.price,
      stock: Math.max(5, (product.price % 27) + 8),
      category: product.category,
      images: Array.isArray(product.images) ? product.images : [],
      seller: seller._id,
      isCustomizable: product.isCustomizable,
      customizationOptions: product.isCustomizable
        ? defaultCustomization
        : undefined,
      makingCharge: product.isCustomizable ? product.makingCharge || 200 : 0,
      status: "active",
    };

    if (!exists) {
      await Product.create(payload);
      createdCount += 1;
      continue;
    }

    Object.assign(exists, payload);
    await exists.save();
    updatedCount += 1;
  }

  console.log(
    `Seed complete: sellers created ${createdSellerCount}, sellers updated ${updatedSellerCount}, products created ${createdCount}, products updated ${updatedCount}`
  );
};

module.exports = { seedSampleData };
