import giftBirthday from "../assets/products/gift-birthday.jpg";
import giftCustom from "../assets/products/gift-custom.jpg";
import giftFestivals from "../assets/products/gift-festivals.jpg";

const IMAGE_POOL = Array.from(
  { length: 22 },
  (_, idx) =>
    `/images/chocolate-hampers/choco-hamper-${String(idx + 1).padStart(2, "0")}.jpg`
);

const slugify = (value = "") =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const buildItems = (categoryId, names, startIndex, basePrice) =>
  names.map((name, index) => ({
    id: `${categoryId}-${index + 1}`,
    name,
    image: IMAGE_POOL[(startIndex + index) % IMAGE_POOL.length],
    price: basePrice + (index % 4) * 90,
  }));

export const HAMPER_BASE_OPTIONS = [
  {
    id: "tray",
    label: "Tray",
    image: giftBirthday,
    note: "Open tray style base",
  },
  {
    id: "box",
    label: "Box",
    image: giftCustom,
    note: "Classic gifting box",
  },
  {
    id: "basket",
    label: "Basket",
    image: giftFestivals,
    note: "Traditional wicker basket",
  },
];

export const HAMPER_PACKAGE_OPTIONS = [
  {
    id: "basic",
    label: "Basic",
    priceLabel: "Rs. 1,500 onwards",
    serviceCharge: 500,
    image: "/images/chocolate-hampers/choco-hamper-04.jpg",
  },
  {
    id: "premium",
    label: "Premium",
    priceLabel: "Rs. 5,000 onwards",
    serviceCharge: 900,
    image: "/images/chocolate-hampers/choco-hamper-10.jpg",
  },
  {
    id: "luxury",
    label: "Luxury",
    priceLabel: "Rs. 8,000 onwards",
    serviceCharge: 1400,
    image: "/images/chocolate-hampers/choco-hamper-15.jpg",
  },
];

const CATALOG_BLUEPRINT = [
  {
    label: "Kerala and Onam Gifts",
    startIndex: 0,
    basePrice: 140,
    names: [
      "Aranmula Kannadi mirror 1 inch",
      "Aranmula Kannadi mini stand",
      "Banana chips packet 200g",
      "Banana chips bottle",
      "Brass Dabara set",
      "Kerala mural bookmark",
      "Mini kathakali magnet",
      "Traditional kasavu pouch",
    ],
  },
  {
    label: "Christmas and Holiday",
    startIndex: 3,
    basePrice: 130,
    names: [
      "Chocolate cookie jar",
      "Mini Christmas tree",
      "Christmas cake topper",
      "Christmas cap",
      "Christmas decor branch",
      "Fancy Christmas eye glass",
      "Christmas plate",
      "Christmas red candle",
    ],
  },
  {
    label: "Chocolates",
    startIndex: 6,
    basePrice: 160,
    names: [
      "110g Loacker Quadratini Espresso",
      "110g Loacker Quadratini Napolitaner",
      "16 Pieces Ferrero Rocher",
      "200g Lindt Lindor milk chocolate",
      "3 Pieces Ferrero Rocher",
      "43g Kinder Bueno",
      "55% dark chocolate bar",
      "Assorted ball chocolate bottle",
    ],
  },
  {
    label: "Wines & Other Gourmets",
    startIndex: 9,
    basePrice: 390,
    names: [
      "Sparkling grape mocktail",
      "Artisan cold brew bottle",
      "Cheese cracker box",
      "Premium olive jar",
      "Roasted nut platter",
      "Fruit preserve duo",
      "Mediterranean dip set",
      "Herbal tea caddy",
    ],
  },
  {
    label: "Dry Fruits, Nuts & Spices",
    startIndex: 12,
    basePrice: 210,
    names: [
      "California almond pouch",
      "Roasted cashew jar",
      "Pistachio salted tin",
      "Premium dates box",
      "Kerala spice sachet set",
      "Saffron mini vial",
      "Trail mix crunchy pack",
      "Honey glazed walnut bottle",
    ],
  },
  {
    label: "Personalized Gifts",
    startIndex: 15,
    basePrice: 260,
    names: [
      "Collage photo frame 5x7",
      "Custom mug",
      "Customized stainless steel bottle",
      "Instagram memory photo frame 6x4",
      "Kids birthday photo frame",
      "Mother's day photo frame",
      "Personalized date photo frame",
      "Personalized ball pen",
    ],
  },
  {
    label: "Beauty & Selfcare",
    startIndex: 18,
    basePrice: 230,
    names: [
      "Charcoal peel off face mask",
      "Axe intense body spray",
      "Bath salt bottle",
      "Beauty hand mirror",
      "Body mist 100ml",
      "Cool water perfume men 100ml",
      "Cool water perfume women 100ml",
      "Engage eau de perfume",
    ],
  },
  {
    label: "Home Decor & Show Pieces",
    startIndex: 1,
    basePrice: 240,
    names: [
      "Wooden tealight holder",
      "Terracotta uruli bowl",
      "Mini Buddha statue",
      "Handmade dreamcatcher",
      "Decorative aroma candle",
      "Brass diya pair",
      "Wall hanging frame art",
      "Premium ceramic vase",
    ],
  },
  {
    label: "Mugs & Bottles",
    startIndex: 4,
    basePrice: 180,
    names: [
      "Amma mug",
      "Birthday mug",
      "Couple mug set",
      "Hubby wifey mug pair",
      "Customised men's mug",
      "Customised mom mug",
      "Letter print mug",
      "Hip flask",
    ],
  },
  {
    label: "Life Style",
    startIndex: 7,
    basePrice: 290,
    names: [
      "Men's tie set",
      "Premium wallet",
      "Belt for men",
      "Face towel",
      "Aviator sunglasses",
      "Hair clip gift set",
      "Tan leather wallet",
      "Formal shirt gift pack",
    ],
  },
  {
    label: "Gadgets",
    startIndex: 10,
    basePrice: 520,
    names: [
      "Electronic heating pad",
      "Fujifilm Instax Mini 11",
      "Fujifilm Instax Mini 12",
      "Instax mini film pack",
      "Hot water bag",
      "Instax mini delight box",
      "Instax mini evo bundle",
      "Instax mini link printer",
    ],
  },
  {
    label: "Stationary",
    startIndex: 13,
    basePrice: 120,
    names: [
      "Becoming by Michelle Obama",
      "Book: Secrets of successful doctors",
      "Daily planner floral",
      "Daily planner pocket",
      "Diary vintage",
      "Diary unicorn",
      "Kids diary squishy",
      "Parker matte black ball pen",
    ],
  },
  {
    label: "Angroos Minis, Soft Toys & Newborn",
    startIndex: 16,
    basePrice: 150,
    names: [
      "Mini teddy bear",
      "Soft bunny toy",
      "Newborn bib set",
      "Baby comfort blanket",
      "Infant rattles combo",
      "Mini plush cloud",
      "Kids socks gift pack",
      "First year memory tag",
    ],
  },
  {
    label: "Greetings",
    startIndex: 19,
    basePrice: 90,
    names: [
      "Anniversary greeting card 4x6",
      "Best wishes greeting card 4x6",
      "Birthday greeting card 4x6",
      "Bride to be greeting card 4x6",
      "Bridesmaid card",
      "Christmas greeting card 4x6",
      "Congrats greeting card 4x6",
      "Customised men's card",
    ],
  },
];

export const HAMPER_CONTENT_CATEGORIES = CATALOG_BLUEPRINT.map((group) => {
  const id = slugify(group.label);
  return {
    id,
    label: group.label,
    items: buildItems(id, group.names, group.startIndex, group.basePrice),
  };
});
