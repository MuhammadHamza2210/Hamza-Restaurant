// ============================================================
//  ZAIQA — Restaurant Management Platform — Backend
//  Node.js + Express + built-in SQLite (node:sqlite)
//  Data is stored in ./database.db  (no external DB needed)
// ============================================================

const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { DatabaseSync } = require("node:sqlite");

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "zaiqa-dev-secret-change-me";
// Real owner-admin password. On the public demo, set this in the environment so the
// live admin account is private; locally it falls back to "admin123".
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const BRAND = "Zaiqa";

// ============================================================
//  DATABASE
// ============================================================
const db = new DatabaseSync(path.join(__dirname, "database.db"));
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT NOT NULL,
    email      TEXT NOT NULL UNIQUE,
    password   TEXT NOT NULL,
    phone      TEXT,
    role       TEXT NOT NULL DEFAULT 'user',
    is_demo    INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    slug       TEXT NOT NULL UNIQUE,
    label      TEXT NOT NULL,
    icon       TEXT DEFAULT 'fa-utensils',
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS products (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    description   TEXT,
    price         REAL NOT NULL,
    category      TEXT NOT NULL,
    image         TEXT,
    is_vegetarian INTEGER DEFAULT 0,
    is_spicy      INTEGER DEFAULT 0,
    recommended   INTEGER DEFAULT 0,
    available     INTEGER DEFAULT 1,
    base_rating   REAL DEFAULT 4.5,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number     TEXT NOT NULL UNIQUE,
    user_id          INTEGER,
    customer_name    TEXT,
    customer_phone   TEXT,
    delivery_address TEXT,
    special_notes    TEXT,
    items            TEXT NOT NULL,
    total            REAL NOT NULL,
    status           TEXT NOT NULL DEFAULT 'pending',
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id    TEXT NOT NULL,
    user_id       INTEGER,
    username      TEXT NOT NULL,
    rating        INTEGER NOT NULL,
    comment       TEXT,
    photo         TEXT,
    verified      INTEGER DEFAULT 0,
    helpful_count INTEGER DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS favorites (
    user_id    INTEGER NOT NULL,
    product_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, product_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS reservations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER,
    name        TEXT NOT NULL,
    phone       TEXT NOT NULL,
    email       TEXT,
    date        TEXT NOT NULL,
    time        TEXT NOT NULL,
    party_size  INTEGER NOT NULL,
    notes       TEXT,
    status      TEXT NOT NULL DEFAULT 'pending',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    audience   TEXT NOT NULL DEFAULT 'admin',
    user_id    INTEGER,
    type       TEXT NOT NULL,
    title      TEXT NOT NULL,
    message    TEXT,
    is_read    INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ============================================================
//  SEED DATA
// ============================================================
const CATEGORIES = [
  { slug: "main-course", label: "Main Course", icon: "fa-bowl-rice", sort_order: 1 },
  { slug: "bbq-grill",   label: "BBQ & Grill", icon: "fa-fire",      sort_order: 2 },
  { slug: "fast-food",   label: "Fast Food",   icon: "fa-burger",    sort_order: 3 },
  { slug: "sweets",      label: "Sweets",      icon: "fa-ice-cream", sort_order: 4 },
  { slug: "drinks",      label: "Drinks",      icon: "fa-mug-hot",   sort_order: 5 },
];

const PRODUCTS = [
  { id: 1,  name: "Chicken Biryani", description: "Aromatic basmati rice cooked with tender chicken pieces, traditional spices, saffron, and served with raita.", price: 850, category: "main-course", image: "images/chicken-biryani.webp", is_vegetarian: 0, is_spicy: 1, recommended: 1, base_rating: 4.8 },
  { id: 2,  name: "Mutton Biryani", description: "Premium mutton pieces slow-cooked with fragrant basmati rice, caramelized onions, and exotic spices.", price: 1200, category: "main-course", image: "images/mutton-biryani.jpg", is_vegetarian: 0, is_spicy: 1, recommended: 1, base_rating: 4.7 },
  { id: 3,  name: "Beef White Biryani", description: "A unique preparation of biryani with tender beef chunks, white rice, and mild spices.", price: 950, category: "main-course", image: "images/beef-white-biryani.jpg", is_vegetarian: 0, is_spicy: 0, recommended: 0, base_rating: 4.5 },
  { id: 4,  name: "Chana Biryani", description: "Vegetarian delight with chickpeas cooked in aromatic rice and traditional spices.", price: 550, category: "main-course", image: "images/chana-biryani.webp", is_vegetarian: 1, is_spicy: 1, recommended: 0, base_rating: 4.3 },
  { id: 5,  name: "Beef Karahi", description: "Traditional beef karahi cooked in wok with fresh tomatoes, ginger, garlic, and green chilies.", price: 1100, category: "main-course", image: "images/beef-karahi.jpg", is_vegetarian: 0, is_spicy: 1, recommended: 1, base_rating: 4.6 },
  { id: 6,  name: "Chicken Karahi", description: "Classic chicken karahi prepared with fresh ingredients, cooked to perfection in a traditional wok.", price: 900, category: "main-course", image: "images/chicken-karahi.webp", is_vegetarian: 0, is_spicy: 1, recommended: 0, base_rating: 4.7 },
  { id: 7,  name: "Nihari", description: "Slow-cooked beef shank in rich and aromatic gravy, served with naan and fresh garnish.", price: 800, category: "main-course", image: "images/nihari.jpg", is_vegetarian: 0, is_spicy: 1, recommended: 1, base_rating: 4.9 },
  { id: 8,  name: "Chicken Tikka", description: "Boneless chicken marinated in yogurt and spices, grilled to perfection in the tandoor.", price: 750, category: "bbq-grill", image: "images/chicken-tikka.jpg", is_vegetarian: 0, is_spicy: 1, recommended: 0, base_rating: 4.6 },
  { id: 9,  name: "Zinger Burger", description: "Crispy fried chicken fillet with special sauce, fresh lettuce, and cheese in a soft bun.", price: 450, category: "fast-food", image: "images/zinger-burger.jpg", is_vegetarian: 0, is_spicy: 1, recommended: 1, base_rating: 4.5 },
  { id: 10, name: "Zinger Paratha Roll", description: "Crispy zinger strips wrapped in soft paratha with vegetables and special sauces.", price: 350, category: "fast-food", image: "images/zinger-paratha-roll.jpg", is_vegetarian: 0, is_spicy: 1, recommended: 0, base_rating: 4.4 },
  { id: 11, name: "Chicken Roll", description: "Soft paratha filled with grilled chicken, fresh vegetables, and signature sauces.", price: 300, category: "fast-food", image: "images/chicken-roll.jpg", is_vegetarian: 0, is_spicy: 1, recommended: 0, base_rating: 4.3 },
  { id: 12, name: "Chicken Shawarma", description: "Middle-eastern delight with marinated chicken, garlic sauce, pickles, and fries in pita bread.", price: 320, category: "fast-food", image: "images/chicken-shawarma.avif", is_vegetarian: 0, is_spicy: 1, recommended: 0, base_rating: 4.6 },
  { id: 13, name: "Chicken Sandwich", description: "Grilled chicken breast with fresh lettuce, tomato, mayo, and cheese between toasted bread.", price: 280, category: "fast-food", image: "images/chicken-sandwich.webp", is_vegetarian: 0, is_spicy: 0, recommended: 0, base_rating: 4.2 },
  { id: 14, name: "Cheese Pizza", description: "Classic pizza with mozzarella cheese, tomato sauce, and oregano on a thin crust.", price: 900, category: "fast-food", image: "images/cheese-pizza.jpg", is_vegetarian: 1, is_spicy: 0, recommended: 0, base_rating: 4.4 },
  { id: 15, name: "Italian Pizza", description: "Authentic Italian pizza with premium toppings, fresh basil, and olive oil on hand-tossed crust.", price: 1200, category: "fast-food", image: "images/italian-pizza.avif", is_vegetarian: 0, is_spicy: 1, recommended: 1, base_rating: 4.7 },
  { id: 16, name: "French Fries", description: "Crispy golden fries seasoned with special spices. The perfect side for any meal.", price: 200, category: "fast-food", image: "images/french-fries.webp", is_vegetarian: 1, is_spicy: 0, recommended: 0, base_rating: 4.1 },
  { id: 17, name: "Pizza Fries", description: "Crispy fries topped with pizza sauce, cheese, and herbs. The perfect fusion snack.", price: 350, category: "fast-food", image: "images/pizza-fries.jpg", is_vegetarian: 1, is_spicy: 0, recommended: 0, base_rating: 4.3 },
  { id: 18, name: "Rabri Falooda", description: "Traditional dessert with rabri, falooda sev, basil seeds, nuts, and rose syrup.", price: 350, category: "sweets", image: "images/rabri-falooda.webp", is_vegetarian: 1, is_spicy: 0, recommended: 1, base_rating: 4.8 },
  { id: 19, name: "Malai Rabri Kulfi", description: "Creamy kulfi made with reduced milk, saffron, cardamom, and nuts, served with rabri.", price: 300, category: "sweets", image: "images/malai-rabri-kulfi.avif", is_vegetarian: 1, is_spicy: 0, recommended: 0, base_rating: 4.7 },
  { id: 20, name: "Oreo Ice Cream", description: "Creamy ice cream loaded with Oreo cookie chunks. A treat for cookie lovers.", price: 250, category: "sweets", image: "images/oreo-ice-cream.jpg", is_vegetarian: 1, is_spicy: 0, recommended: 0, base_rating: 4.5 },
  { id: 21, name: "Classic Ice Cream", description: "Rich and creamy vanilla ice cream made with real vanilla beans. Simple and delicious.", price: 200, category: "sweets", image: "images/ice-cream.jpg", is_vegetarian: 1, is_spicy: 0, recommended: 0, base_rating: 4.3 },
  { id: 22, name: "Mango Lassi", description: "Refreshing yogurt-based drink with sweet mango pulp, cardamom, and rose water.", price: 220, category: "drinks", image: "images/mango-lassi.jpg", is_vegetarian: 1, is_spicy: 0, recommended: 1, base_rating: 4.6 },
  { id: 23, name: "Traditional Chai", description: "Authentic Pakistani tea brewed with milk, cardamom, and special tea leaves.", price: 100, category: "drinks", image: "images/chai.jpg", is_vegetarian: 1, is_spicy: 0, recommended: 0, base_rating: 4.4 },
  { id: 24, name: "Fresh Lemonade", description: "Freshly squeezed lemons with mint, sugar, and a hint of salt. Refreshing and revitalizing.", price: 150, category: "drinks", image: "images/lemonade.webp", is_vegetarian: 1, is_spicy: 0, recommended: 0, base_rating: 4.2 },
];

// Deterministic-ish RNG so seeds are stable enough but varied
let _seed = 1337;
function rng() { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; }
function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }
function randInt(a, b) { return a + Math.floor(rng() * (b - a + 1)); }

const REVIEW_NAMES = ["Ali Khan", "Sara Ahmed", "Ahmed Raza", "Fatima Noor", "Bilal Hassan", "Ayesha Malik", "Usman Tariq", "Hina Shah", "Zain Abbas", "Mariam Iqbal", "Hamza Sheikh", "Nida Riaz", "Omar Farooq", "Sana Javed", "Imran Ali", "Rabia Aslam"];
const POSITIVE = ["Absolutely delicious, will order again!", "Best in town, perfectly cooked and full of flavour.", "Loved the aroma and taste. Highly recommended!", "Fresh, hot, and packed with flavour.", "Authentic taste, just like homemade.", "Generous portion and great value.", "My family's new favourite!", "Arrived hot and fresh. Five stars!", "The spices were perfectly balanced.", "Top quality, you can taste the freshness."];
const MIXED = ["Good, but could be a little spicier.", "Tasty overall, delivery was a bit slow.", "Nice flavour, portion was decent.", "Pretty good, would try again.", "Solid choice, nothing to complain about."];

// Build a list of star values for n reviews that average close to target t (3..5)
function starsForTarget(t, n) {
  let total = Math.round(t * n);
  const stars = new Array(n).fill(5);
  let sum = 5 * n;
  let i = 0;
  while (sum > total && i < n) {
    const reduceTo = sum - total >= 2 ? (rng() < 0.5 ? 3 : 4) : 4;
    stars[i] = reduceTo;
    sum = stars.reduce((a, b) => a + b, 0);
    i++;
  }
  return stars;
}

function seed() {
  const userCount = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
  if (userCount > 0) return;

  console.log("Seeding fresh database...");

  // --- Categories ---
  const insCat = db.prepare("INSERT INTO categories (slug, label, icon, sort_order) VALUES (?, ?, ?, ?)");
  CATEGORIES.forEach(c => insCat.run(c.slug, c.label, c.icon, c.sort_order));

  // --- Products ---
  const insProd = db.prepare(`INSERT INTO products (id, name, description, price, category, image, is_vegetarian, is_spicy, recommended, available, base_rating)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`);
  PRODUCTS.forEach(p => insProd.run(p.id, p.name, p.description, p.price, p.category, p.image, p.is_vegetarian, p.is_spicy, p.recommended, p.base_rating));

  // --- Users ---
  const insUser = db.prepare("INSERT INTO users (username, email, password, phone, role, is_demo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  // Real owner admin — full access. Password comes from ADMIN_PASSWORD so the live
  // GitHub demo never exposes the real one (defaults to admin123 for local dev).
  insUser.run("Restaurant Admin", "admin@zaiqa.com", bcrypt.hashSync(ADMIN_PASSWORD, 10), "0300-0000001", "admin", 0, isoDaysAgo(60));
  // Read-only demo admin — browse the whole console but cannot change anything.
  insUser.run("Demo Admin (read-only)", "demo.admin@zaiqa.com", bcrypt.hashSync("demo123", 10), "0300-0000002", "admin", 1, isoDaysAgo(60));
  // Demo customers
  const demoId = Number(insUser.run("Demo User", "demo@example.com", bcrypt.hashSync("password123", 10), "0300-1234567", "user", 0, isoDaysAgo(45)).lastInsertRowid);
  insUser.run("Test Customer", "test@example.com", bcrypt.hashSync("test123", 10), "0312-3456789", "user", 0, isoDaysAgo(30));
  // Extra customers spread over time (for customer-growth analytics)
  const extraIds = [];
  for (let i = 0; i < 22; i++) {
    const nm = REVIEW_NAMES[i % REVIEW_NAMES.length];
    const r = insUser.run(nm, `customer${i}@zaiqa.com`, bcrypt.hashSync("customer123", 10), "0300-00000" + (10 + i), "user", 0, isoDaysAgo(randInt(0, 29)));
    extraIds.push(Number(r.lastInsertRowid));
  }
  const allCustomerIds = [demoId, ...extraIds];

  // --- Reviews (consistent with ratings) ---
  const insReview = db.prepare("INSERT INTO reviews (product_id, user_id, username, rating, comment, photo, verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  PRODUCTS.forEach(p => {
    const n = randInt(5, 14);
    const stars = starsForTarget(p.base_rating, n);
    for (let i = 0; i < n; i++) {
      const star = stars[i];
      const comment = star >= 5 ? pick(POSITIVE) : star === 4 ? pick(MIXED.concat(POSITIVE)) : pick(MIXED);
      const verified = rng() < 0.75 ? 1 : 0;
      // a few reviews include a photo of the dish
      const photo = rng() < 0.18 ? p.image : null;
      insReview.run(String(p.id), null, pick(REVIEW_NAMES), star, comment, photo, verified, isoDaysAgo(randInt(0, 40)));
    }
  });

  // --- Orders (spread across last 30 days, realistic peak hours) ---
  const insOrder = db.prepare(`INSERT INTO orders (order_number, user_id, customer_name, customer_phone, delivery_address, items, total, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const addresses = ["123 Main Street, Karachi", "45 Clifton Block 5, Karachi", "78 DHA Phase 6, Lahore", "12 Gulberg, Lahore", "9 Blue Area, Islamabad"];
  const peakHours = [12, 13, 13, 14, 19, 20, 20, 21, 21, 22]; // lunch + dinner peaks
  let orderSeq = 100000;
  for (let d = 0; d < 64; d++) {
    const dayOffset = randInt(0, 29);
    const hour = rng() < 0.7 ? pick(peakHours) : randInt(10, 23);
    const minute = randInt(0, 59);
    const when = isoDaysAgo(dayOffset, hour, minute);
    const uid = pick(allCustomerIds);
    const u = db.prepare("SELECT username, phone FROM users WHERE id = ?").get(uid);
    const itemCount = randInt(1, 4);
    const items = [];
    for (let k = 0; k < itemCount; k++) {
      const p = pick(PRODUCTS);
      const qty = randInt(1, 3);
      items.push({ _id: String(p.id), name: p.name, price: p.price, quantity: qty, image: p.image, category: p.category });
    }
    const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
    const total = Math.round(subtotal * 1.05 + 100);
    // older orders are delivered; very recent ones may be in progress
    let status = "delivered";
    if (dayOffset === 0) status = pick(["pending", "preparing", "ready", "delivered"]);
    else if (dayOffset === 1) status = pick(["ready", "delivered", "delivered"]);
    if (rng() < 0.05) status = "cancelled";
    insOrder.run("SO" + (++orderSeq), uid, u.username, u.phone, pick(addresses), JSON.stringify(items), total, status, when);
  }

  // --- Reservations ---
  const insRes = db.prepare("INSERT INTO reservations (user_id, name, phone, email, date, time, party_size, notes, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const times = ["13:00", "14:00", "19:00", "20:00", "20:30", "21:00"];
  for (let i = 0; i < 8; i++) {
    const uid = pick(allCustomerIds);
    const u = db.prepare("SELECT username, phone, email FROM users WHERE id = ?").get(uid);
    const daysAhead = randInt(0, 10);
    // A guest can only be "seated" on the actual day they booked — future bookings
    // stay pending/confirmed (mirrors the rule the API now enforces).
    const status = daysAhead === 0
      ? pick(["confirmed", "seated", "completed"])
      : pick(["pending", "confirmed", "confirmed"]);
    insRes.run(uid, u.username, u.phone || "0300-1112222", u.email || "guest@zaiqa.com",
      isoDaysAhead(daysAhead), pick(times), randInt(2, 8),
      rng() < 0.4 ? "Window seat please" : null,
      status, isoDaysAgo(randInt(0, 5)));
  }

  console.log("Seed complete: 24 products, demo + admin users, orders, reviews, reservations.");
}

function pad(n) { return String(n).padStart(2, "0"); }
// Returns "YYYY-MM-DD HH:MM:SS" for `days` ago (UTC-based, fine for analytics)
function isoDaysAgo(days, hour = null, minute = null) {
  const d = new Date(Date.now() - days * 86400000);
  if (hour !== null) d.setUTCHours(hour, minute || 0, 0, 0);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}
function isoDaysAhead(days) {
  const d = new Date(Date.now() + days * 86400000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
// Local calendar date "YYYY-MM-DD" — used for "can't seat before the booking day" checks
// so it lines up with the date the guest picked in their own timezone.
function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Bring an already-seeded database up to date without wiping it.
function migrate() {
  const cols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!cols.includes("is_demo")) {
    db.exec("ALTER TABLE users ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0");
    console.log("Migration: added users.is_demo column.");
  }
}

// Make sure both staff accounts exist and the real admin uses the configured password.
// Runs every boot so existing databases gain the read-only demo admin too.
function ensureStaffAccounts() {
  const real = db.prepare("SELECT id FROM users WHERE email = 'admin@zaiqa.com'").get();
  if (real) {
    db.prepare("UPDATE users SET password = ?, is_demo = 0, role = 'admin' WHERE id = ?")
      .run(bcrypt.hashSync(ADMIN_PASSWORD, 10), real.id);
  } else {
    db.prepare("INSERT INTO users (username, email, password, phone, role, is_demo) VALUES (?, ?, ?, ?, 'admin', 0)")
      .run("Restaurant Admin", "admin@zaiqa.com", bcrypt.hashSync(ADMIN_PASSWORD, 10), "0300-0000001");
  }
  const demo = db.prepare("SELECT id FROM users WHERE email = 'demo.admin@zaiqa.com'").get();
  if (!demo) {
    db.prepare("INSERT INTO users (username, email, password, phone, role, is_demo) VALUES (?, ?, ?, ?, 'admin', 1)")
      .run("Demo Admin (read-only)", "demo.admin@zaiqa.com", bcrypt.hashSync("demo123", 10), "0300-0000002");
    console.log("Created read-only demo admin: demo.admin@zaiqa.com / demo123");
  }
}

migrate();
seed();
ensureStaffAccounts();

// ============================================================
//  MIDDLEWARE
// ============================================================
app.use(cors());
app.use(express.json({ limit: "8mb" })); // allow base64 image uploads
app.use(express.static(__dirname));

function authenticate(req, res, next) {
  const header = req.headers["authorization"] || "";
  const token = (header.startsWith("Bearer ") ? header.slice(7) : header) || req.query.token;
  if (!token) return res.status(401).json({ msg: "No token provided" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    req.role = decoded.role;
    req.isDemo = !!decoded.demo;
    next();
  } catch (e) {
    return res.status(401).json({ msg: "Session expired, please log in again" });
  }
}
function requireAdmin(req, res, next) {
  if (req.role !== "admin") return res.status(403).json({ msg: "Admin access required" });
  next();
}
// Gate for everything that *changes* data. The read-only demo admin can browse the
// whole console but is stopped here, so the public showcase can't be edited.
function blockDemo(req, res, next) {
  if (req.isDemo) return res.status(403).json({ msg: "This is the read-only demo admin — changes are disabled. Sign in with the owner account to make changes." });
  next();
}
function publicUser(row) {
  return { id: row.id, username: row.username, email: row.email, phone: row.phone, role: row.role, isDemo: !!row.is_demo };
}
function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role, demo: !!user.is_demo }, JWT_SECRET, { expiresIn: "7d" });
}

// ============================================================
//  REAL-TIME (Server-Sent Events)
// ============================================================
let sseClients = [];
function sseSend(client, payload) {
  try { client.res.write(`data: ${JSON.stringify(payload)}\n\n`); } catch (e) {}
}
function broadcast(payload, filter = () => true) {
  sseClients.filter(filter).forEach(c => sseSend(c, payload));
}
function notifyAdmins(type, title, message) {
  db.prepare("INSERT INTO notifications (audience, type, title, message) VALUES ('admin', ?, ?, ?)").run(type, title, message);
  broadcast({ type, title, message, at: new Date().toISOString() }, c => c.role === "admin");
}
function notifyUser(userId, type, title, message) {
  db.prepare("INSERT INTO notifications (audience, user_id, type, title, message) VALUES ('user', ?, ?, ?, ?)").run(userId, type, title, message);
  broadcast({ type, title, message, at: new Date().toISOString() }, c => c.userId === userId);
}

app.get("/api/events", authenticate, (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(`data: ${JSON.stringify({ type: "connected", at: new Date().toISOString() })}\n\n`);
  const client = { id: Date.now() + Math.random(), userId: req.userId, role: req.role, res };
  sseClients.push(client);
  const ping = setInterval(() => res.write(": ping\n\n"), 25000);
  req.on("close", () => { clearInterval(ping); sseClients = sseClients.filter(c => c.id !== client.id); });
});

// ============================================================
//  AUTH
// ============================================================
app.post("/api/signup", (req, res) => {
  try {
    const { username, email, phone, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ msg: "Please fill in all fields" });
    if (db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase()))
      return res.status(400).json({ msg: "User already exists with this email" });
    const info = db.prepare("INSERT INTO users (username, email, password, phone) VALUES (?, ?, ?, ?)")
      .run(username, email.toLowerCase(), bcrypt.hashSync(password, 10), phone || null);
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(info.lastInsertRowid));
    notifyAdmins("customer", "New customer registered", `${username} just created an account.`);
    res.json({ msg: "Account created", token: signToken(user), user: publicUser(user) });
  } catch (e) { console.error(e); res.status(500).json({ msg: "Server error during registration" }); }
});

app.post("/api/login", (req, res) => {
  try {
    const { email, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get((email || "").toLowerCase());
    if (!user || !bcrypt.compareSync(password || "", user.password))
      return res.status(400).json({ msg: "Invalid email or password" });
    res.json({ msg: "Login successful", token: signToken(user), user: publicUser(user) });
  } catch (e) { console.error(e); res.status(500).json({ msg: "Server error during login" }); }
});

// ============================================================
//  CATEGORIES
// ============================================================
app.get("/api/categories", (req, res) => {
  res.json(db.prepare("SELECT * FROM categories ORDER BY sort_order, label").all());
});
app.post("/api/categories", authenticate, requireAdmin, blockDemo, (req, res) => {
  const { slug, label, icon, sort_order } = req.body;
  if (!slug || !label) return res.status(400).json({ msg: "slug and label required" });
  try {
    db.prepare("INSERT INTO categories (slug, label, icon, sort_order) VALUES (?, ?, ?, ?)")
      .run(slug, label, icon || "fa-utensils", sort_order || 0);
    res.json({ msg: "Category added" });
  } catch (e) { res.status(400).json({ msg: "Category slug must be unique" }); }
});
app.put("/api/categories/:id", authenticate, requireAdmin, blockDemo, (req, res) => {
  const { label, icon, sort_order } = req.body;
  db.prepare("UPDATE categories SET label = COALESCE(?, label), icon = COALESCE(?, icon), sort_order = COALESCE(?, sort_order) WHERE id = ?")
    .run(label ?? null, icon ?? null, sort_order ?? null, req.params.id);
  res.json({ msg: "Category updated" });
});
app.delete("/api/categories/:id", authenticate, requireAdmin, blockDemo, (req, res) => {
  db.prepare("DELETE FROM categories WHERE id = ?").run(req.params.id);
  res.json({ msg: "Category deleted" });
});

// ============================================================
//  PRODUCTS / MENU
// ============================================================
function ratingStats(productId) {
  const rows = db.prepare("SELECT rating FROM reviews WHERE product_id = ?").all(String(productId));
  const count = rows.length;
  const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  rows.forEach(r => { breakdown[r.rating] = (breakdown[r.rating] || 0) + 1; });
  const avg = count ? rows.reduce((s, r) => s + r.rating, 0) / count : 0;
  return { count, breakdown, rating: Math.round(avg * 10) / 10 };
}
function productToMenuItem(p) {
  const stats = ratingStats(p.id);
  const top = db.prepare("SELECT username, rating, comment, verified FROM reviews WHERE product_id = ? AND comment != '' ORDER BY helpful_count DESC, datetime(created_at) DESC LIMIT 1").get(String(p.id));
  return {
    _id: String(p.id),
    name: p.name,
    description: p.description,
    price: p.price,
    category: p.category,
    image: p.image,
    isVegetarian: !!p.is_vegetarian,
    isSpicy: !!p.is_spicy,
    recommended: !!p.recommended,
    available: !!p.available,
    rating: stats.count ? stats.rating : p.base_rating,
    reviewCount: stats.count,
    ratingBreakdown: stats.breakdown,
    topReview: top ? { user: top.username, rating: top.rating, comment: top.comment, verified: !!top.verified } : null,
  };
}

// Public menu (available items only)
app.get("/api/menu", (req, res) => {
  const rows = db.prepare("SELECT * FROM products WHERE available = 1 ORDER BY id").all();
  res.json(rows.map(productToMenuItem));
});
// Admin: all products
app.get("/api/admin/products", authenticate, requireAdmin, (req, res) => {
  const rows = db.prepare("SELECT * FROM products ORDER BY id").all();
  res.json(rows.map(p => ({ ...productToMenuItem(p), available: !!p.available })));
});
app.post("/api/admin/products", authenticate, requireAdmin, blockDemo, (req, res) => {
  const b = req.body;
  if (!b.name || !b.price || !b.category) return res.status(400).json({ msg: "name, price, category required" });
  const info = db.prepare(`INSERT INTO products (name, description, price, category, image, is_vegetarian, is_spicy, recommended, available, base_rating)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    b.name, b.description || "", Number(b.price), b.category, b.image || "images/placeholder-food.svg",
    b.isVegetarian ? 1 : 0, b.isSpicy ? 1 : 0, b.recommended ? 1 : 0, b.available === false ? 0 : 1, Number(b.rating) || 4.5);
  res.json({ msg: "Product added", id: Number(info.lastInsertRowid) });
});
app.put("/api/admin/products/:id", authenticate, requireAdmin, blockDemo, (req, res) => {
  const b = req.body;
  const p = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!p) return res.status(404).json({ msg: "Product not found" });
  db.prepare(`UPDATE products SET name=?, description=?, price=?, category=?, image=?, is_vegetarian=?, is_spicy=?, recommended=?, available=?, base_rating=? WHERE id=?`).run(
    b.name ?? p.name, b.description ?? p.description, b.price != null ? Number(b.price) : p.price,
    b.category ?? p.category, b.image ?? p.image,
    b.isVegetarian != null ? (b.isVegetarian ? 1 : 0) : p.is_vegetarian,
    b.isSpicy != null ? (b.isSpicy ? 1 : 0) : p.is_spicy,
    b.recommended != null ? (b.recommended ? 1 : 0) : p.recommended,
    b.available != null ? (b.available ? 1 : 0) : p.available,
    b.rating != null ? Number(b.rating) : p.base_rating, req.params.id);
  res.json({ msg: "Product updated" });
});
app.delete("/api/admin/products/:id", authenticate, requireAdmin, blockDemo, (req, res) => {
  db.prepare("DELETE FROM products WHERE id = ?").run(req.params.id);
  res.json({ msg: "Product deleted" });
});

// Image upload (base64 -> file in images/uploads)
app.post("/api/admin/upload", authenticate, requireAdmin, blockDemo, (req, res) => {
  try {
    const { dataUrl, filename } = req.body;
    const m = /^data:(image\/(\w+));base64,(.+)$/.exec(dataUrl || "");
    if (!m) return res.status(400).json({ msg: "Invalid image data" });
    const ext = m[2] === "jpeg" ? "jpg" : m[2];
    const safe = (filename || "upload").replace(/[^a-z0-9-_]/gi, "-").slice(0, 40);
    const name = `${safe}-${Date.now()}.${ext}`;
    const dir = path.join(__dirname, "images", "uploads");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), Buffer.from(m[3], "base64"));
    res.json({ msg: "Uploaded", path: `images/uploads/${name}` });
  } catch (e) { console.error(e); res.status(500).json({ msg: "Upload failed" }); }
});

// ============================================================
//  ORDERS
// ============================================================
function rowToOrder(row) {
  return {
    _id: row.order_number, items: JSON.parse(row.items), total: row.total, status: row.status,
    createdAt: row.created_at, customerName: row.customer_name, customerPhone: row.customer_phone,
    deliveryAddress: row.delivery_address, specialInstructions: row.special_notes,
  };
}
app.get("/api/orders", authenticate, (req, res) => {
  const rows = db.prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY datetime(created_at) DESC").all(req.userId);
  res.json(rows.map(rowToOrder));
});
app.post("/api/orders", authenticate, (req, res) => {
  try {
    const { items, total, customerName, customerPhone, deliveryAddress, specialInstructions } = req.body;
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ msg: "Cart is empty" });
    const orderNumber = "SO" + Date.now().toString().slice(-6);
    db.prepare(`INSERT INTO orders (order_number, user_id, customer_name, customer_phone, delivery_address, special_notes, items, total, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`).run(orderNumber, req.userId, customerName, customerPhone, deliveryAddress, specialInstructions || null, JSON.stringify(items), total);
    notifyAdmins("order", "New order received", `Order #${orderNumber} • Rs. ${total} • ${customerName}`);
    res.json({ msg: "Order placed", order: rowToOrder(db.prepare("SELECT * FROM orders WHERE order_number = ?").get(orderNumber)) });
  } catch (e) { console.error(e); res.status(500).json({ msg: "Server error placing order" }); }
});
// Customer cancels their OWN order — only while it's still pending (kitchen hasn't
// started). Once it's preparing/ready/delivered they must call the restaurant.
app.put("/api/orders/:orderNumber/cancel", authenticate, (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE order_number = ?").get(req.params.orderNumber);
  if (!order || order.user_id !== req.userId) return res.status(404).json({ msg: "Order not found" });
  if (order.status !== "pending")
    return res.status(409).json({ msg: `This order is already ${order.status} and can no longer be cancelled. Please call us for help.` });
  db.prepare("UPDATE orders SET status = 'cancelled' WHERE order_number = ?").run(req.params.orderNumber);
  notifyAdmins("order", "Order cancelled by customer", `Order #${order.order_number} was cancelled by ${order.customer_name || "the customer"}.`);
  res.json({ msg: "Order cancelled" });
});
// Admin: all orders
app.get("/api/admin/orders", authenticate, requireAdmin, (req, res) => {
  const { status } = req.query;
  const rows = status && status !== "all"
    ? db.prepare("SELECT * FROM orders WHERE status = ? ORDER BY datetime(created_at) DESC").all(status)
    : db.prepare("SELECT * FROM orders ORDER BY datetime(created_at) DESC").all();
  res.json(rows.map(rowToOrder));
});
// Order lifecycle. You can only move forward through the kitchen flow, or cancel an
// order that hasn't been delivered yet. "delivered" and "cancelled" are final — a
// delivered order can't be re-opened or cancelled, which matches real life.
const ORDER_FLOW = ["pending", "preparing", "ready", "delivered", "cancelled"];
const ORDER_TRANSITIONS = {
  pending:   ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready:     ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};
app.put("/api/admin/orders/:orderNumber/status", authenticate, requireAdmin, blockDemo, (req, res) => {
  const { status } = req.body;
  if (!ORDER_FLOW.includes(status)) return res.status(400).json({ msg: "Invalid status" });
  const order = db.prepare("SELECT * FROM orders WHERE order_number = ?").get(req.params.orderNumber);
  if (!order) return res.status(404).json({ msg: "Order not found" });
  if (status === order.status) return res.json({ msg: "No change" });
  const allowed = ORDER_TRANSITIONS[order.status] || [];
  if (!allowed.includes(status)) {
    const finalMsg = ["delivered", "cancelled"].includes(order.status)
      ? `This order is already ${order.status} and can no longer be changed.`
      : `Can't move an order from "${order.status}" to "${status}".`;
    return res.status(409).json({ msg: finalMsg });
  }
  db.prepare("UPDATE orders SET status = ? WHERE order_number = ?").run(status, req.params.orderNumber);
  if (order.user_id) notifyUser(order.user_id, "order-status", "Order update", `Your order #${order.order_number} is now ${status}.`);
  res.json({ msg: "Status updated" });
});

// ============================================================
//  REVIEWS
// ============================================================
app.get("/api/reviews", (req, res) => {
  const rows = db.prepare("SELECT product_id, username, rating, comment, photo, verified, helpful_count, created_at FROM reviews ORDER BY datetime(created_at) DESC").all();
  const byProduct = {};
  for (const r of rows) {
    (byProduct[r.product_id] ||= []).push({
      user: r.username, rating: r.rating, comment: r.comment, photo: r.photo,
      verified: !!r.verified, helpful: r.helpful_count, date: r.created_at,
    });
  }
  res.json(byProduct);
});
app.get("/api/reviews/:productId", (req, res) => {
  const rows = db.prepare("SELECT id, username, rating, comment, photo, verified, helpful_count, created_at FROM reviews WHERE product_id = ? ORDER BY datetime(created_at) DESC").all(req.params.productId);
  res.json({ stats: ratingStats(req.params.productId), reviews: rows.map(r => ({
    id: r.id, user: r.username, rating: r.rating, comment: r.comment, photo: r.photo,
    verified: !!r.verified, helpful: r.helpful_count, date: r.created_at })) });
});
app.post("/api/reviews", authenticate, (req, res) => {
  try {
    const { productId, rating, comment, photo } = req.body;
    if (!productId || !rating) return res.status(400).json({ msg: "Missing rating" });
    const user = db.prepare("SELECT username FROM users WHERE id = ?").get(req.userId);
    // Verified if this user has actually ordered this product
    const userOrders = db.prepare("SELECT items FROM orders WHERE user_id = ?").all(req.userId);
    const ordered = userOrders.some(o => { try { return JSON.parse(o.items).some(it => String(it._id) === String(productId)); } catch { return false; } });
    db.prepare("INSERT INTO reviews (product_id, user_id, username, rating, comment, photo, verified) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(String(productId), req.userId, user ? user.username : "Anonymous", rating, comment || "", photo || null, ordered ? 1 : 0);
    res.json({ msg: "Review submitted", verified: ordered });
  } catch (e) { console.error(e); res.status(500).json({ msg: "Server error submitting review" }); }
});
app.post("/api/reviews/:id/helpful", authenticate, (req, res) => {
  db.prepare("UPDATE reviews SET helpful_count = helpful_count + 1 WHERE id = ?").run(req.params.id);
  res.json({ msg: "Thanks for your feedback" });
});

// ============================================================
//  FAVORITES
// ============================================================
app.get("/api/favorites", authenticate, (req, res) => {
  res.json(db.prepare("SELECT product_id FROM favorites WHERE user_id = ?").all(req.userId).map(r => r.product_id));
});
app.post("/api/favorites/toggle", authenticate, (req, res) => {
  const pid = String(req.body.productId || "");
  if (!pid) return res.status(400).json({ msg: "Missing productId" });
  const existing = db.prepare("SELECT 1 FROM favorites WHERE user_id = ? AND product_id = ?").get(req.userId, pid);
  if (existing) db.prepare("DELETE FROM favorites WHERE user_id = ? AND product_id = ?").run(req.userId, pid);
  else db.prepare("INSERT INTO favorites (user_id, product_id) VALUES (?, ?)").run(req.userId, pid);
  res.json({ favorited: !existing, favorites: db.prepare("SELECT product_id FROM favorites WHERE user_id = ?").all(req.userId).map(r => r.product_id) });
});

// ============================================================
//  RESERVATIONS
// ============================================================
app.post("/api/reservations", (req, res) => {
  try {
    const { name, phone, email, date, time, partySize, notes } = req.body;
    if (!name || !phone || !date || !time || !partySize) return res.status(400).json({ msg: "Please fill in all required fields" });
    // Can't book a table for a day that's already gone.
    if (date < todayLocal()) return res.status(400).json({ msg: "Reservation date can't be in the past." });
    const size = Number(partySize);
    if (!Number.isInteger(size) || size < 1 || size > 20) return res.status(400).json({ msg: "Party size must be between 1 and 20 guests." });
    let userId = null;
    const header = req.headers["authorization"] || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : header;
    if (token) { try { userId = jwt.verify(token, JWT_SECRET).id; } catch {} }
    db.prepare("INSERT INTO reservations (user_id, name, phone, email, date, time, party_size, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(userId, name, phone, email || null, date, time, Number(partySize), notes || null);
    notifyAdmins("reservation", "New table reservation", `${name} • ${partySize} guests • ${date} ${time}`);
    res.json({ msg: "Reservation requested" });
  } catch (e) { console.error(e); res.status(500).json({ msg: "Server error" }); }
});
app.get("/api/reservations/my", authenticate, (req, res) => {
  res.json(db.prepare("SELECT * FROM reservations WHERE user_id = ? ORDER BY date DESC").all(req.userId));
});
app.get("/api/admin/reservations", authenticate, requireAdmin, (req, res) => {
  res.json(db.prepare("SELECT * FROM reservations ORDER BY datetime(created_at) DESC").all());
});
// Reservation lifecycle. A booking moves pending → confirmed → seated → completed,
// and can be cancelled only before the guest is seated. Once a party is seated (or the
// booking is cancelled/completed) it can't be cancelled — that already happened.
const RES_STATUSES = ["pending", "confirmed", "seated", "completed", "cancelled"];
const RES_TRANSITIONS = {
  pending:   ["confirmed", "seated", "cancelled"],
  confirmed: ["seated", "cancelled"],
  seated:    ["completed"],
  completed: [],
  cancelled: [],
};
app.put("/api/admin/reservations/:id/status", authenticate, requireAdmin, blockDemo, (req, res) => {
  const { status } = req.body;
  if (!RES_STATUSES.includes(status)) return res.status(400).json({ msg: "Invalid status" });
  const r = db.prepare("SELECT * FROM reservations WHERE id = ?").get(req.params.id);
  if (!r) return res.status(404).json({ msg: "Not found" });
  if (status === r.status) return res.json({ msg: "No change" });
  const allowed = RES_TRANSITIONS[r.status] || [];
  if (!allowed.includes(status)) {
    const msg = ["seated", "completed", "cancelled"].includes(r.status)
      ? `This reservation is already ${r.status} and can no longer be changed.`
      : `Can't move a reservation from "${r.status}" to "${status}".`;
    return res.status(409).json({ msg });
  }
  // You can't seat a party before the day they actually booked.
  if (status === "seated" && r.date > todayLocal())
    return res.status(409).json({ msg: `Can't seat this party before their reservation date (${r.date}).` });
  db.prepare("UPDATE reservations SET status = ? WHERE id = ?").run(status, req.params.id);
  if (r.user_id) notifyUser(r.user_id, "reservation", "Reservation update", `Your reservation on ${r.date} is now ${status}.`);
  res.json({ msg: "Reservation updated" });
});

// ============================================================
//  CUSTOMERS (admin)
// ============================================================
app.get("/api/admin/customers", authenticate, requireAdmin, (req, res) => {
  const rows = db.prepare("SELECT id, username, email, phone, role, created_at FROM users ORDER BY datetime(created_at) DESC").all();
  res.json(rows.map(u => {
    const stats = db.prepare("SELECT COUNT(*) c, COALESCE(SUM(total),0) spent FROM orders WHERE user_id = ? AND status != 'cancelled'").get(u.id);
    return { ...u, orderCount: stats.c, totalSpent: stats.spent };
  }));
});

// ============================================================
//  NOTIFICATIONS
// ============================================================
app.get("/api/notifications", authenticate, (req, res) => {
  const rows = req.role === "admin"
    ? db.prepare("SELECT * FROM notifications WHERE audience = 'admin' ORDER BY datetime(created_at) DESC LIMIT 50").all()
    : db.prepare("SELECT * FROM notifications WHERE audience = 'user' AND user_id = ? ORDER BY datetime(created_at) DESC LIMIT 50").all(req.userId);
  res.json(rows);
});
app.post("/api/notifications/read-all", authenticate, (req, res) => {
  if (req.role === "admin") db.prepare("UPDATE notifications SET is_read = 1 WHERE audience = 'admin'").run();
  else db.prepare("UPDATE notifications SET is_read = 1 WHERE audience = 'user' AND user_id = ?").run(req.userId);
  res.json({ msg: "Marked read" });
});

// ============================================================
//  ANALYTICS / KPIs (admin)
// ============================================================
app.get("/api/admin/analytics", authenticate, requireAdmin, (req, res) => {
  const orders = db.prepare("SELECT * FROM orders").all();
  const valid = orders.filter(o => o.status !== "cancelled");
  const revenue = valid.reduce((s, o) => s + o.total, 0);
  const customers = db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'user'").get().c;
  const avgOrder = valid.length ? Math.round(revenue / valid.length) : 0;

  // Revenue + order count per day (last 30 days)
  const dailyMap = {};
  for (let i = 29; i >= 0; i--) { const k = isoDaysAgo(i).slice(0, 10); dailyMap[k] = { date: k, revenue: 0, orders: 0 }; }
  valid.forEach(o => { const k = o.created_at.slice(0, 10); if (dailyMap[k]) { dailyMap[k].revenue += o.total; dailyMap[k].orders += 1; } });
  const daily = Object.values(dailyMap);

  // Orders by hour (peak business hours)
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: 0 }));
  valid.forEach(o => { const h = parseInt(o.created_at.slice(11, 13), 10); if (!isNaN(h)) hours[h].orders += 1; });

  // Orders by weekday
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => ({ day: d, orders: 0 }));
  valid.forEach(o => { const day = new Date(o.created_at.replace(" ", "T") + "Z").getUTCDay(); wd[day].orders += 1; });

  // Top dishes (by quantity) & best sellers (by revenue) from item JSON
  const dishMap = {};
  valid.forEach(o => { try { JSON.parse(o.items).forEach(it => {
    const m = (dishMap[it._id] ||= { _id: it._id, name: it.name, image: it.image, qty: 0, revenue: 0 });
    m.qty += it.quantity; m.revenue += it.price * it.quantity;
  }); } catch {} });
  const dishes = Object.values(dishMap);
  const topDishes = [...dishes].sort((a, b) => b.qty - a.qty).slice(0, 6);
  const bestSellers = [...dishes].sort((a, b) => b.revenue - a.revenue).slice(0, 6);

  // Revenue by category
  const catMap = {};
  valid.forEach(o => { try { JSON.parse(o.items).forEach(it => { catMap[it.category] = (catMap[it.category] || 0) + it.price * it.quantity; }); } catch {} });
  const categoryRevenue = Object.entries(catMap).map(([category, revenue]) => ({ category, revenue })).sort((a, b) => b.revenue - a.revenue);

  // Order status breakdown
  const statusMap = {};
  orders.forEach(o => { statusMap[o.status] = (statusMap[o.status] || 0) + 1; });
  const statusBreakdown = Object.entries(statusMap).map(([status, count]) => ({ status, count }));

  // Customer growth (cumulative new customers per day, last 30 days)
  const growthMap = {};
  for (let i = 29; i >= 0; i--) growthMap[isoDaysAgo(i).slice(0, 10)] = 0;
  db.prepare("SELECT created_at FROM users WHERE role = 'user'").all().forEach(u => { const k = u.created_at.slice(0, 10); if (growthMap[k] != null) growthMap[k]++; });
  let cum = customers - Object.values(growthMap).reduce((a, b) => a + b, 0);
  const customerGrowth = Object.entries(growthMap).map(([date, n]) => { cum += n; return { date, total: cum, added: n }; });

  // Today vs revenue snapshots
  const todayKey = isoDaysAgo(0).slice(0, 10);
  const todayRevenue = valid.filter(o => o.created_at.slice(0, 10) === todayKey).reduce((s, o) => s + o.total, 0);
  const todayOrders = valid.filter(o => o.created_at.slice(0, 10) === todayKey).length;
  const pendingCount = orders.filter(o => ["pending", "preparing", "ready"].includes(o.status)).length;
  const reservationsPending = db.prepare("SELECT COUNT(*) c FROM reservations WHERE status = 'pending'").get().c;
  const peakHour = [...hours].sort((a, b) => b.orders - a.orders)[0];

  res.json({
    kpi: { revenue, orders: valid.length, customers, avgOrder, todayRevenue, todayOrders, pendingCount, reservationsPending,
           peakHour: peakHour ? peakHour.hour : null, totalReviews: db.prepare("SELECT COUNT(*) c FROM reviews").get().c },
    daily, hours, weekday: wd, topDishes, bestSellers, categoryRevenue, statusBreakdown, customerGrowth,
  });
});

// ============================================================
//  HEALTH + ADMIN PAGE GUARD
// ============================================================
app.get("/api/health", (req, res) => res.json({ status: "ok", brand: BRAND, database: "connected", time: new Date().toISOString() }));

// ============================================================
app.listen(PORT, () => {
  console.log("================================================");
  console.log(`  ${BRAND} server is running!`);
  console.log(`  Customer site:  http://localhost:${PORT}`);
  console.log(`  Admin panel:    http://localhost:${PORT}/admin.html`);
  console.log(`  Owner admin:    admin@zaiqa.com / ${process.env.ADMIN_PASSWORD ? "(ADMIN_PASSWORD from env)" : "admin123"}`);
  console.log(`  Demo admin:     demo.admin@zaiqa.com / demo123  (read-only)`);
  console.log(`  Demo customer:  demo@example.com / password123`);
  console.log("================================================");
});
