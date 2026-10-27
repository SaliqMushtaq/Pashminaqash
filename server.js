const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const express = require('express');
const nodemailer = require('nodemailer');
require('dotenv').config();
const { DatabaseSync } = require('node:sqlite');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const SECRET = process.env.SESSION_SECRET || 'form-field-demo-secret-change-before-deploying';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const SHIPROCKET_EMAIL = process.env.SHIPROCKET_EMAIL || '';
const SHIPROCKET_PASSWORD = process.env.SHIPROCKET_PASSWORD || '';

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'store.sqlite'));
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price INTEGER NOT NULL,
    compare_at INTEGER,
    description TEXT NOT NULL,
    details TEXT NOT NULL,
    image TEXT NOT NULL,
    badge TEXT,
    stock INTEGER NOT NULL DEFAULT 25,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY,
    order_number TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id),
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT '',
    postal_code TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    subtotal INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'Confirmed',
    payment_method TEXT NOT NULL DEFAULT 'cod',
    payment_status TEXT NOT NULL DEFAULT 'cod_pending',
    razorpay_order_id TEXT,
    razorpay_payment_id TEXT,
    shipment_status TEXT NOT NULL DEFAULT 'unfulfilled',
    shiprocket_order_id INTEGER,
    shiprocket_shipment_id INTEGER,
    awb_code TEXT NOT NULL DEFAULT '',
    courier_name TEXT NOT NULL DEFAULT '',
    tracking_url TEXT NOT NULL DEFAULT '',
    shipment_error TEXT NOT NULL DEFAULT '',
    shipment_synced_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    product_name TEXT NOT NULL,
    unit_price INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    image TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS order_notifications (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp', 'sms')),
    status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'not_configured')),
    error TEXT NOT NULL DEFAULT '',
    attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const productColumns = db.prepare('PRAGMA table_info(products)').all();
if (!productColumns.some((column) => column.name === 'is_active')) {
  db.exec('ALTER TABLE products ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))');
}
const orderColumns = db.prepare('PRAGMA table_info(orders)').all();
const orderMigrations = [
  ['state', "ALTER TABLE orders ADD COLUMN state TEXT NOT NULL DEFAULT ''"],
  ['payment_method', "ALTER TABLE orders ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cod'"],
  ['payment_status', "ALTER TABLE orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'cod_pending'"],
  ['razorpay_order_id', 'ALTER TABLE orders ADD COLUMN razorpay_order_id TEXT'],
  ['razorpay_payment_id', 'ALTER TABLE orders ADD COLUMN razorpay_payment_id TEXT'],
  ['shipment_status', "ALTER TABLE orders ADD COLUMN shipment_status TEXT NOT NULL DEFAULT 'unfulfilled'"],
  ['shiprocket_order_id', 'ALTER TABLE orders ADD COLUMN shiprocket_order_id INTEGER'],
  ['shiprocket_shipment_id', 'ALTER TABLE orders ADD COLUMN shiprocket_shipment_id INTEGER'],
  ['awb_code', "ALTER TABLE orders ADD COLUMN awb_code TEXT NOT NULL DEFAULT ''"],
  ['courier_name', "ALTER TABLE orders ADD COLUMN courier_name TEXT NOT NULL DEFAULT ''"],
  ['tracking_url', "ALTER TABLE orders ADD COLUMN tracking_url TEXT NOT NULL DEFAULT ''"],
  ['shipment_error', "ALTER TABLE orders ADD COLUMN shipment_error TEXT NOT NULL DEFAULT ''"],
  ['shipment_synced_at', 'ALTER TABLE orders ADD COLUMN shipment_synced_at TEXT']
];
for (const [column, migration] of orderMigrations) {
  if (!orderColumns.some((existing) => existing.name === column)) db.exec(migration);
}

const seedProducts = [
  { slug: 'sozni-rose-pashmina', name: 'Sozni Rose Pashmina', category: 'Sozni Embroidery', price: 8990, compareAt: 10990, description: 'A soft rose-toned wrap with delicate, Sozni-inspired floral embroidery.', details: 'Pashmina shawl · Hand-finished embroidery · 70 × 200 cm', image: '/images/shawls/embroidered-pashmina.jpg', badge: 'Bestseller' },
  { slug: 'kashmir-dusk-wrap', name: 'Kashmir Dusk Wrap', category: 'Pashmina', price: 7490, compareAt: null, description: 'A light, graceful layer in a deep dusk blue, finished with a softly fringed edge.', details: 'Pashmina shawl · Fringed edge · 70 × 200 cm', image: '/images/shawls/cashmere-paisley-shawl.jpg', badge: null },
  { slug: 'kani-garden-shawl', name: 'Kani Garden Shawl', category: 'Kani Weave', price: 11990, compareAt: 13990, description: 'A garden of fine, woven colour inspired by the traditional Kani style.', details: 'Pashmina shawl · Kani-inspired woven pattern · 100 × 200 cm', image: '/images/shawls/boteh-pashmina.jpg', badge: 'Small batch' },
  { slug: 'almond-bloom-pashmina', name: 'Almond Bloom Pashmina', category: 'Sozni Embroidery', price: 9990, compareAt: null, description: 'An almond-toned wrap with a considered border and subtle floral detail.', details: 'Pashmina shawl · Embroidered border · 70 × 200 cm', image: '/images/shawls/handwoven-pashmina.jpg', badge: 'New' },
  { slug: 'midnight-kani-shawl', name: 'Midnight Kani Shawl', category: 'Kani Weave', price: 12990, compareAt: null, description: 'An expressive Kani-inspired pattern brings a little colour to cooler evenings.', details: 'Pashmina shawl · Kani-inspired woven pattern · 100 × 200 cm', image: '/images/shawls/woven-elephant-shawl.jpg', badge: 'Artisan edit' },
  { slug: 'saffron-soft-wrap', name: 'Saffron Soft Wrap', category: 'Pashmina', price: 6990, compareAt: null, description: 'A versatile saffron-coloured layer made for everyday draping and gifting.', details: 'Pashmina shawl · Lightweight weave · 70 × 200 cm', image: '/images/shawls/pashmina-scarves.jpg', badge: null },
  { slug: 'chinar-reversible-shawl', name: 'Chinar Reversible Shawl', category: 'Reversible', price: 10990, compareAt: 12990, description: 'Two complementary shades make this beautifully considered layer easy to style.', details: 'Pashmina shawl · Reversible weave · 70 × 200 cm', image: '/images/shawls/cashmere-embroidery.jpg', badge: 'Two ways to wear' },
  { slug: 'snowfall-classic-pashmina', name: 'Snowfall Classic Pashmina', category: 'Pashmina', price: 7990, compareAt: null, description: 'A timeless ivory wrap with a soft drape and delicate fringed finish.', details: 'Pashmina shawl · Fringed edge · 70 × 200 cm', image: '/images/shawls/pashmina-scarves.jpg', badge: null }
];

db.prepare(`UPDATE products SET is_active = 0
  WHERE category NOT IN ('Pashmina', 'Kani Weave', 'Sozni Embroidery', 'Reversible')`).run();
const insertProduct = db.prepare(`INSERT INTO products
  (slug, name, category, price, compare_at, description, details, image, badge, stock, is_active)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 20, 1)
  ON CONFLICT(slug) DO NOTHING`);
for (const product of seedProducts) {
  insertProduct.run(product.slug, product.name, product.category, product.price, product.compareAt,
    product.description, product.details, product.image, product.badge);
}
const updateSeedImage = db.prepare(`UPDATE products SET image = ?
  WHERE slug = ? AND image LIKE 'https://images.unsplash.com/%'`);
for (const product of seedProducts) updateSeedImage.run(product.image, product.slug);

const notificationTransport = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
  ? nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE !== 'false',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  })
  : null;

const storeOwnerEmail = process.env.STORE_OWNER_EMAIL || '';
const storeOwnerWhatsApp = process.env.STORE_OWNER_WHATSAPP || '';
const storeOwnerPhone = process.env.STORE_OWNER_PHONE || '';
const twilioConfigured = Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
let shiprocketToken = '';
let shiprocketTokenExpiresAt = 0;

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY'
  });
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.get('origin');
    if (origin) {
      try {
        if (new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'This request was not allowed.' });
      } catch { return res.status(403).json({ error: 'This request was not allowed.' }); }
    }
  }
  next();
});
app.post('/api/payments/webhook', express.raw({ type: 'application/json', limit: '64kb' }), (req, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) return res.status(503).json({ error: 'Payment webhooks are not configured.' });
  const signature = req.get('x-razorpay-signature') || '';
  const expected = crypto.createHmac('sha256', webhookSecret).update(req.body).digest('hex');
  const got = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) {
    return res.status(401).json({ error: 'Payment webhook signature is invalid.' });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Payment webhook payload is invalid.' });
  }

  const payment = event.payload?.payment?.entity;
  const gatewayOrderId = payment?.order_id || event.payload?.order?.entity?.id;
  if (event.event === 'payment.captured' || event.event === 'order.paid') {
    const row = db.prepare('SELECT order_number, razorpay_payment_id FROM orders WHERE razorpay_order_id = ?')
      .get(gatewayOrderId);
    if (row) {
      void confirmOrderPayment(gatewayOrderId, payment?.id || row.razorpay_payment_id)
        .catch((error) => console.error(`Could not confirm Razorpay payment ${gatewayOrderId}:`, error.message));
    }
  } else if (event.event === 'payment.failed' && gatewayOrderId) {
    db.prepare(`UPDATE orders SET payment_status = 'failed'
      WHERE razorpay_order_id = ? AND payment_status = 'pending'`).run(gatewayOrderId);
  }
  res.json({ ok: true });
});
app.use(express.json({ limit: '64kb' }));

function publicProduct(row) {
  if (!row) return null;
  return {
    id: row.id, slug: row.slug, name: row.name, category: row.category,
    price: row.price, compareAt: row.compare_at, description: row.description,
    details: row.details, image: row.image, badge: row.badge, stock: row.stock
  };
}

function getUserFromRequest(req) {
  const token = (req.headers.cookie || '').split(';').map((part) => part.trim())
    .find((part) => part.startsWith('ff_session='))?.slice('ff_session='.length);
  if (!token) return null;
  const [idText, expiresText, signature] = token.split('.');
  const id = Number(idText);
  const expires = Number(expiresText);
  if (!Number.isSafeInteger(id) || !Number.isSafeInteger(expires) || expires < Date.now() || !signature) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(`${id}.${expires}`).digest('hex');
  const got = Buffer.from(signature, 'hex');
  const want = Buffer.from(expected, 'hex');
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  return db.prepare('SELECT id, full_name AS fullName, email FROM users WHERE id = ?').get(id) || null;
}

function requireUser(req, res, next) {
  const user = getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Please sign in to continue.' });
  req.user = user;
  next();
}

function issueSession(res, userId) {
  const expires = Date.now() + 1000 * 60 * 60 * 24 * 14;
  const signature = crypto.createHmac('sha256', SECRET).update(`${userId}.${expires}`).digest('hex');
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `ff_session=${userId}.${expires}.${signature}; HttpOnly; SameSite=Lax; Path=/; Max-Age=1209600${secure}`);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function validString(value, max = 200) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function recordNotification(orderId, channel, status, error = '') {
  try {
    db.prepare(`INSERT INTO order_notifications (order_id, channel, status, error)
      VALUES (?, ?, ?, ?)`).run(orderId, channel, status, error.slice(0, 500));
  } catch (databaseError) {
    console.error(`Could not record ${channel} notification status for order ${orderId}:`, databaseError);
  }
}

async function attemptNotification(orderId, channel, send) {
  try {
    await send();
    recordNotification(orderId, channel, 'sent');
    console.log(`Order ${orderId}: ${channel} notification sent.`);
  } catch (error) {
    recordNotification(orderId, channel, 'failed', error.message);
    console.error(`Order ${orderId}: ${channel} notification failed:`, error.message);
  }
}

function skipNotification(orderId, channel, reason) {
  recordNotification(orderId, channel, 'not_configured');
  console.warn(`Order ${orderId}: ${channel} notification not sent. ${reason}`);
}

function safeCompare(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function adminToken(userId, expires) {
  const encodedEmail = Buffer.from(userId).toString('base64url');
  const payload = `${encodedEmail}.admin.${expires}`;
  const signature = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

function requireAdmin(req, res, next) {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'Set ADMIN_EMAIL and ADMIN_PASSWORD in the private .env file.' });
  }
  const cookie = (req.headers.cookie || '').split(';').map((part) => part.trim())
    .find((part) => part.startsWith('pq_admin='));
  const token = cookie?.slice('pq_admin='.length) || '';
  const [encodedEmail, role, expiresText, signature, ...extra] = token.split('.');
  const expires = Number(expiresText);
  let email = '';
  try { email = Buffer.from(encodedEmail || '', 'base64url').toString('utf8'); } catch {}
  if (extra.length || email !== ADMIN_EMAIL || role !== 'admin' ||
      !Number.isSafeInteger(expires) || expires < Date.now() ||
      !safeCompare(signature || '', crypto.createHmac('sha256', SECRET)
        .update(`${encodedEmail}.${role}.${expiresText}`).digest('hex'))) {
    return res.status(401).json({ error: 'Sign in to the PashminaQash order desk.' });
  }
  next();
}

async function razorpayRequest(endpoint, body) {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new Error('Online payment is not set up yet. Add Razorpay API keys in the private .env file.');
  }
  const response = await fetch(`https://api.razorpay.com/v1/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.description || `Razorpay returned HTTP ${response.status}.`);
  return data;
}

async function razorpayGet(endpoint) {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new Error('Online payment is not configured.');
  }
  const response = await fetch(`https://api.razorpay.com/v1/${endpoint}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')}`
    },
    signal: AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.description || `Razorpay returned HTTP ${response.status}.`);
  return data;
}

async function confirmOrderPayment(gatewayOrderId, paymentId) {
  const order = db.prepare(`SELECT * FROM orders
    WHERE razorpay_order_id = ? AND payment_method = 'razorpay'`).get(gatewayOrderId);
  if (!order) return false;
  if (order.payment_status === 'paid') return true;
  if (order.status === 'Cancelled') return false;
  db.prepare(`UPDATE orders SET payment_status = 'paid', status = 'Confirmed',
    razorpay_payment_id = ? WHERE id = ? AND payment_status IN ('pending', 'failed')`)
    .run(paymentId || '', order.id);
  const updated = db.prepare('SELECT payment_status FROM orders WHERE id = ?').get(order.id);
  if (updated.payment_status !== 'paid') return false;
  const complete = getOrderForNotification(order.id);
  void notifyStoreOwner(complete);
  void createShiprocketShipment(order.id).catch((error) => {
    db.prepare(`UPDATE orders SET shipment_error = ? WHERE id = ?`).run(error.message.slice(0, 500), order.id);
    console.error(`Could not create Shiprocket shipment for ${order.order_number}:`, error.message);
  });
  return true;
}

async function getShiprocketToken() {
  if (!SHIPROCKET_EMAIL || !SHIPROCKET_PASSWORD) {
    throw new Error('Shiprocket is not configured. Add Shiprocket credentials in the private .env file.');
  }
  if (shiprocketToken && shiprocketTokenExpiresAt > Date.now() + 60000) return shiprocketToken;
  const response = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: SHIPROCKET_EMAIL, password: SHIPROCKET_PASSWORD }),
    signal: AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.token) throw new Error('Shiprocket sign-in failed. Check your account credentials.');
  shiprocketToken = data.token;
  shiprocketTokenExpiresAt = Date.now() + 9 * 24 * 60 * 60 * 1000;
  return shiprocketToken;
}

async function shiprocketRequest(endpoint, options = {}) {
  const token = await getShiprocketToken();
  const response = await fetch(`https://apiv2.shiprocket.in/v1/external/${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    },
    signal: AbortSignal.timeout(20000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data.message === 'string' ? data.message : `Shiprocket returned HTTP ${response.status}.`;
    throw new Error(message.slice(0, 400));
  }
  return data;
}

function getOrderForNotification(orderId) {
  const order = db.prepare(`SELECT id, order_number AS orderNumber, full_name AS fullName, email,
    phone, address, city, state, postal_code AS postalCode, note, subtotal, status,
    payment_method AS paymentMethod FROM orders WHERE id = ?`).get(orderId);
  if (!order) throw new Error('Order was not found.');
  order.products = db.prepare(`SELECT product_name AS name, unit_price AS price, quantity
    FROM order_items WHERE order_id = ?`).all(orderId);
  return order;
}

async function createShiprocketShipment(orderId) {
  const order = getOrderForNotification(orderId);
  const stored = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (stored.shiprocket_order_id) return stored.shiprocket_order_id;
  if (!SHIPROCKET_EMAIL || !SHIPROCKET_PASSWORD) {
    db.prepare(`UPDATE orders SET shipment_status = 'configuration_required',
      shipment_error = 'Add Shiprocket credentials in the private .env file.' WHERE id = ?`).run(orderId);
    console.warn(`Order ${order.orderNumber}: Shiprocket is not configured; the order is saved for later fulfillment.`);
    return null;
  }
  const items = db.prepare(`SELECT oi.product_name AS name, oi.quantity, oi.unit_price AS price,
    p.slug FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`)
    .all(orderId);
  const nameParts = order.fullName.trim().split(/\s+/);
  const payload = {
    order_id: order.orderNumber,
    order_date: new Date().toISOString().slice(0, 19).replace('T', ' '),
    pickup_location: process.env.SHIPROCKET_PICKUP_LOCATION || 'Primary',
    billing_customer_name: nameParts[0],
    billing_last_name: nameParts.slice(1).join(' ') || nameParts[0],
    billing_address: order.address,
    billing_address_2: '',
    billing_city: order.city,
    billing_pincode: order.postalCode,
    billing_state: order.state,
    billing_country: 'India',
    billing_email: order.email,
    billing_phone: order.phone,
    shipping_is_billing: true,
    order_items: items.map((item) => ({
      name: item.name,
      sku: item.slug || `PQ-${orderId}`,
      units: item.quantity,
      selling_price: item.price
    })),
    payment_method: order.paymentMethod === 'cod' ? 'COD' : 'Prepaid',
    sub_total: order.subtotal,
    length: Number(process.env.PARCEL_LENGTH_CM) || 30,
    breadth: Number(process.env.PARCEL_BREADTH_CM) || 24,
    height: Number(process.env.PARCEL_HEIGHT_CM) || 4,
    weight: Number(process.env.PARCEL_WEIGHT_KG) || 0.5
  };
  const result = await shiprocketRequest('orders/create/adhoc', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  const shiprocketOrderId = Number(result.order_id);
  const shipmentId = Number(result.shipment_id);
  if (!Number.isSafeInteger(shiprocketOrderId) || !Number.isSafeInteger(shipmentId)) {
    throw new Error('Shiprocket did not return the order and shipment identifiers.');
  }
  db.prepare(`UPDATE orders SET shiprocket_order_id = ?, shiprocket_shipment_id = ?,
    shipment_status = 'shipment_created', shipment_error = '', shipment_synced_at = CURRENT_TIMESTAMP
    WHERE id = ?`).run(shiprocketOrderId, shipmentId, orderId);
  return shiprocketOrderId;
}

async function sendTwilioMessage(from, to, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const form = new URLSearchParams({ From: from, To: to, Body: message });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form,
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Twilio returned HTTP ${response.status}.`);
}

async function notifyStoreOwner(order) {
  const itemLines = order.products.map((item) => `${item.quantity} × ${item.name} — ₹${item.price * item.quantity}`).join('\n');
  const message = [
    `New PashminaQash order: ${order.orderNumber}`,
    `Customer: ${order.fullName}`,
    `Email: ${order.email}`,
    `Phone: ${order.phone}`,
    `Delivery address: ${order.address}, ${order.city}, ${order.postalCode}`,
    '',
    itemLines,
    '',
    `Total: ₹${order.subtotal}`,
    order.note ? `Customer note: ${order.note}` : ''
  ].filter(Boolean).join('\n');
  const jobs = [];

  if (storeOwnerEmail && notificationTransport) {
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    const htmlItems = order.products.map((item) => `<li>${item.quantity} × ${escapeHTML(item.name)} — ₹${item.price * item.quantity}</li>`).join('');
    const html = `<h1>New PashminaQash order: ${escapeHTML(order.orderNumber)}</h1>
      <p><strong>Customer:</strong> ${escapeHTML(order.fullName)}<br>
      <strong>Email:</strong> ${escapeHTML(order.email)}<br>
      <strong>Phone:</strong> ${escapeHTML(order.phone)}<br>
      <strong>Delivery address:</strong> ${escapeHTML(order.address)}, ${escapeHTML(order.city)}, ${escapeHTML(order.postalCode)}</p>
      <ul>${htmlItems}</ul><p><strong>Total: ₹${order.subtotal}</strong></p>
      ${order.note ? `<p><strong>Customer note:</strong> ${escapeHTML(order.note)}</p>` : ''}`;
    jobs.push(attemptNotification(order.id, 'email', () => notificationTransport.sendMail({
      from,
      to: storeOwnerEmail,
      subject: `New PashminaQash order ${order.orderNumber}`,
      text: message,
      html
    })));
  } else {
    skipNotification(order.id, 'email', 'Set STORE_OWNER_EMAIL and the SMTP settings in .env.');
  }

  if (storeOwnerWhatsApp && process.env.TWILIO_WHATSAPP_FROM && twilioConfigured) {
    const from = process.env.TWILIO_WHATSAPP_FROM.startsWith('whatsapp:')
      ? process.env.TWILIO_WHATSAPP_FROM
      : `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`;
    const to = storeOwnerWhatsApp.startsWith('whatsapp:')
      ? storeOwnerWhatsApp
      : `whatsapp:${storeOwnerWhatsApp}`;
    jobs.push(attemptNotification(order.id, 'whatsapp', () => sendTwilioMessage(from, to, message)));
  } else if (storeOwnerPhone && process.env.TWILIO_SMS_FROM && twilioConfigured) {
    jobs.push(attemptNotification(order.id, 'sms', () => sendTwilioMessage(
      process.env.TWILIO_SMS_FROM, storeOwnerPhone, message
    )));
  } else {
    skipNotification(order.id, storeOwnerWhatsApp ? 'whatsapp' : 'sms',
      'Set a recipient number and Twilio credentials and sender in .env.');
  }

  await Promise.all(jobs);
}

app.get('/api/products', (req, res) => {
  const search = String(req.query.search || '').trim().slice(0, 80);
  const category = String(req.query.category || '').trim().slice(0, 40);
  const rows = db.prepare(`SELECT * FROM products
    WHERE is_active = 1
      AND (? = '' OR category = ?)
      AND (? = '' OR name LIKE ? OR category LIKE ? OR description LIKE ?)
    ORDER BY id`).all(category, category, search, `%${search}%`, `%${search}%`, `%${search}%`);
  res.json(rows.map(publicProduct));
});

app.get('/api/products/:slug', (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE slug = ? AND is_active = 1').get(req.params.slug);
  if (!row) return res.status(404).json({ error: 'We could not find that product.' });
  res.json(publicProduct(row));
});

app.get('/api/payments/config', (req, res) => {
  res.json({ razorpayEnabled: Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET), keyId: RAZORPAY_KEY_ID || '' });
});

app.post('/api/register', (req, res) => {
  const { fullName, email, password } = req.body || {};
  const cleanEmail = validString(email, 254) ? email.trim().toLowerCase() : '';
  if (!validString(fullName, 100) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'Add your name, a valid email, and a password with at least 8 characters.' });
  }
  try {
    const result = db.prepare('INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)')
      .run(fullName.trim(), cleanEmail, hashPassword(password));
    issueSession(res, Number(result.lastInsertRowid));
    return res.status(201).json({ user: db.prepare('SELECT id, full_name AS fullName, email FROM users WHERE id = ?').get(result.lastInsertRowid) });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'An account with that email already exists.' });
    throw error;
  }
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!validString(email, 254) || typeof password !== 'string') return res.status(400).json({ error: 'Enter your email and password.' });
  const user = db.prepare('SELECT id, full_name AS fullName, email, password_hash FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (!user || !verifyPassword(password, user.password_hash)) return res.status(401).json({ error: 'That email and password do not match.' });
  issueSession(res, user.id);
  res.json({ user: { id: user.id, fullName: user.fullName, email: user.email } });
});

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'ff_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/me', requireUser, (req, res) => {
  const orders = db.prepare(`SELECT order_number AS orderNumber, status, subtotal,
      payment_method AS paymentMethod, payment_status AS paymentStatus,
      shipment_status AS shipmentStatus, awb_code AS awbCode,
      tracking_url AS trackingUrl, courier_name AS courierName,
      created_at AS createdAt FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 10`).all(req.user.id);
  res.json({ user: req.user, orders });
});

app.post('/api/orders', requireUser, async (req, res) => {
  const { items, fullName, email, phone, address, city, state, postalCode, paymentMethod = 'cod', note = '' } = req.body || {};
  if (!Array.isArray(items) || items.length < 1 || items.length > 30) return res.status(400).json({ error: 'Your cart is empty or has too many items.' });
  if (![fullName, email, phone, address, city, state, postalCode].every((value) => validString(value, 200)) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || (note && !validString(note, 500))) {
    return res.status(400).json({ error: 'Please complete all delivery details.' });
  }
  if (!['cod', 'razorpay'].includes(paymentMethod)) return res.status(400).json({ error: 'Choose a supported payment method.' });
  if (paymentMethod === 'razorpay' && (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET)) {
    return res.status(503).json({ error: 'Online payment is not configured yet. Add the Razorpay API keys in .env, or choose cash on delivery.' });
  }
  const normalized = new Map();
  for (const item of items) {
    const id = Number(item?.id);
    const quantity = Number(item?.quantity);
    if (!Number.isSafeInteger(id) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 20) return res.status(400).json({ error: 'One of the cart quantities is not valid.' });
    normalized.set(id, (normalized.get(id) || 0) + quantity);
    if (normalized.get(id) > 20) return res.status(400).json({ error: 'You can order up to 20 of each item.' });
  }

  const products = [];
  let subtotal = 0;
  for (const [id, quantity] of normalized) {
    const product = db.prepare('SELECT id, name, price, image, stock FROM products WHERE id = ? AND is_active = 1').get(id);
    if (!product) return res.status(400).json({ error: 'A product in your cart is no longer available.' });
    if (quantity > product.stock) return res.status(409).json({ error: `${product.name} has only ${product.stock} left.` });
    subtotal += product.price * quantity;
    products.push({ ...product, quantity });
  }

  const orderNumber = `PQ-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  let orderId;
  try {
    db.exec('BEGIN IMMEDIATE');
    const order = db.prepare(`INSERT INTO orders
      (order_number, user_id, full_name, email, phone, address, city, state, postal_code, note,
       subtotal, status, payment_method, payment_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(orderNumber, req.user.id, fullName.trim(), email.trim().toLowerCase(), phone.trim(),
        address.trim(), city.trim(), state.trim(), postalCode.trim(), String(note).trim(), subtotal,
        paymentMethod === 'cod' ? 'Confirmed' : 'Awaiting payment',
        paymentMethod, paymentMethod === 'cod' ? 'cod_pending' : 'pending');
    orderId = Number(order.lastInsertRowid);
    const addItem = db.prepare(`INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, image)
      VALUES (?, ?, ?, ?, ?, ?)`);
    const reduceStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND is_active = 1 AND stock >= ?');
    for (const product of products) {
      const reservation = reduceStock.run(product.quantity, product.id, product.quantity);
      if (Number(reservation.changes) !== 1) {
        const error = new Error(`${product.name} is no longer available in that quantity.`);
        error.statusCode = 409;
        throw error;
      }
      addItem.run(order.lastInsertRowid, product.id, product.name, product.price, product.quantity, product.image);
    }
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    if (error.statusCode === 409) return res.status(409).json({ error: error.message });
    throw error;
  }

  if (paymentMethod === 'cod') {
    void notifyStoreOwner(getOrderForNotification(orderId));
    void createShiprocketShipment(orderId).catch((error) => {
      db.prepare('UPDATE orders SET shipment_error = ? WHERE id = ?').run(error.message.slice(0, 500), orderId);
      console.error(`Could not create Shiprocket shipment for ${orderNumber}:`, error.message);
    });
    return res.status(201).json({ orderNumber, subtotal, status: 'Confirmed', paymentStatus: 'cod_pending' });
  }

  try {
    const gatewayOrder = await razorpayRequest('orders', {
      amount: subtotal * 100,
      currency: 'INR',
      receipt: orderNumber,
      notes: { order_number: orderNumber }
    });
    db.prepare('UPDATE orders SET razorpay_order_id = ? WHERE id = ?').run(gatewayOrder.id, orderId);
    res.status(201).json({
      orderNumber,
      subtotal,
      status: 'Awaiting payment',
      paymentStatus: 'pending',
      razorpay: { keyId: RAZORPAY_KEY_ID, orderId: gatewayOrder.id, amount: gatewayOrder.amount, currency: gatewayOrder.currency }
    });
  } catch (error) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`UPDATE products SET stock = stock + (
        SELECT quantity FROM order_items WHERE order_id = ? AND product_id = products.id
      ) WHERE id IN (SELECT product_id FROM order_items WHERE order_id = ?)`).run(orderId, orderId);
      db.prepare(`UPDATE orders SET status = 'Cancelled', payment_status = 'failed',
        shipment_status = 'not_started' WHERE id = ?`).run(orderId);
      db.exec('COMMIT');
    } catch (rollbackError) {
      db.exec('ROLLBACK');
      throw rollbackError;
    }
    console.error(`Razorpay order creation failed for ${orderNumber}:`, error.message);
    return res.status(502).json({ error: error.message || 'The payment provider is unavailable. Your stock has been released.' });
  }
});

app.post('/api/payments/verify', requireUser, async (req, res) => {
  const { orderNumber, razorpay_order_id: gatewayOrderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body || {};
  if (![orderNumber, gatewayOrderId, paymentId, signature].every((value) => validString(value, 200))) {
    return res.status(400).json({ error: 'The payment confirmation is incomplete.' });
  }
  const order = db.prepare(`SELECT * FROM orders
    WHERE order_number = ? AND user_id = ? AND payment_method = 'razorpay'`)
    .get(orderNumber, req.user.id);
  if (!order || order.razorpay_order_id !== gatewayOrderId) {
    return res.status(404).json({ error: 'We could not match this payment to your order.' });
  }
  const expected = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${gatewayOrderId}|${paymentId}`).digest('hex');
  if (!safeCompare(signature, expected)) return res.status(400).json({ error: 'Payment verification failed.' });
  const confirmed = await confirmOrderPayment(gatewayOrderId, paymentId);
  if (!confirmed) return res.status(409).json({ error: 'This order has been cancelled or could not be confirmed.' });
  res.json({ orderNumber, subtotal: order.subtotal, status: 'Confirmed', paymentStatus: 'paid' });
});

app.post('/api/orders/:orderNumber/cancel-payment', requireUser, async (req, res) => {
  const pending = db.prepare(`SELECT id, razorpay_order_id AS gatewayOrderId
    FROM orders WHERE order_number = ? AND user_id = ? AND payment_method = 'razorpay'
      AND payment_status IN ('pending', 'failed') AND status != 'Cancelled'`)
    .get(req.params.orderNumber, req.user.id);
  if (!pending) return res.status(404).json({ error: 'This payment can no longer be cancelled.' });
  if (pending.gatewayOrderId) {
    try {
      const paymentData = await razorpayGet(`orders/${encodeURIComponent(pending.gatewayOrderId)}/payments`);
      const payments = Array.isArray(paymentData.items) ? paymentData.items : [];
      const captured = payments.find((payment) => payment.status === 'captured');
      if (captured) {
        await confirmOrderPayment(pending.gatewayOrderId, captured.id);
        return res.status(409).json({ error: 'Payment was received and the order is being confirmed.' });
      }
      if (payments.some((payment) => payment.status === 'authorized')) {
        return res.status(409).json({ error: 'Payment authorization is still processing. Please wait before cancelling.' });
      }
    } catch (error) {
      console.error(`Could not confirm payment status for ${req.params.orderNumber}:`, error.message);
      return res.status(502).json({ error: 'We could not confirm the payment status. Your order is still reserved; please contact the store.' });
    }
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    const order = db.prepare(`SELECT id, status, payment_status AS paymentStatus, payment_method AS paymentMethod
      FROM orders WHERE order_number = ? AND user_id = ?`).get(req.params.orderNumber, req.user.id);
    if (!order) {
      db.exec('ROLLBACK');
      return res.status(404).json({ error: 'Order was not found.' });
    }
    if (order.paymentMethod !== 'razorpay' || !['pending', 'failed'].includes(order.paymentStatus) || order.status === 'Cancelled') {
      db.exec('ROLLBACK');
      return res.status(409).json({ error: 'This payment can no longer be cancelled.' });
    }
    db.prepare(`UPDATE products SET stock = stock + (
      SELECT quantity FROM order_items WHERE order_id = ? AND product_id = products.id
    ) WHERE id IN (SELECT product_id FROM order_items WHERE order_id = ?)`).run(order.id, order.id);
    db.prepare(`UPDATE orders SET status = 'Cancelled', payment_status = 'cancelled',
      shipment_status = 'not_started' WHERE id = ?`).run(order.id);
    db.exec('COMMIT');
    res.json({ ok: true });
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
});

app.get('/api/admin/session', requireAdmin, (req, res) => {
  res.json({ email: ADMIN_EMAIL });
});

app.post('/api/admin/login', (req, res) => {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'Set ADMIN_EMAIL and ADMIN_PASSWORD in the private .env file.' });
  }
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!safeCompare(email, ADMIN_EMAIL) || !safeCompare(password, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'That email and password do not match.' });
  }
  const expires = Date.now() + 1000 * 60 * 60 * 12;
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `pq_admin=${adminToken(email, expires)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure}`);
  res.json({ email });
});

app.post('/api/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'pq_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const orders = db.prepare(`SELECT o.id, o.order_number AS orderNumber, o.full_name AS fullName,
      o.email, o.phone, o.address, o.city, o.state, o.postal_code AS postalCode, o.note,
      o.subtotal, o.status, o.payment_method AS paymentMethod, o.payment_status AS paymentStatus,
      o.shipment_status AS shipmentStatus, o.shiprocket_order_id AS shiprocketOrderId,
      o.shiprocket_shipment_id AS shiprocketShipmentId, o.awb_code AS awbCode,
      o.courier_name AS courierName, o.tracking_url AS trackingUrl, o.shipment_error AS shipmentError,
      o.created_at AS createdAt
    FROM orders o ORDER BY o.id DESC LIMIT 200`).all();
  for (const order of orders) {
    order.items = db.prepare(`SELECT product_name AS name, unit_price AS price, quantity
      FROM order_items WHERE order_id = ? ORDER BY id`).all(order.id);
    order.notifications = db.prepare(`SELECT channel, status, attempted_at AS attemptedAt, error
      FROM order_notifications WHERE order_id = ? ORDER BY id DESC`).all(order.id);
  }
  res.json({ orders, paymentsConfigured: Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET), shippingConfigured: Boolean(SHIPROCKET_EMAIL && SHIPROCKET_PASSWORD) });
});

app.post('/api/admin/orders/:id/shiprocket', requireAdmin, async (req, res) => {
  const orderId = Number(req.params.id);
  if (!Number.isSafeInteger(orderId)) return res.status(400).json({ error: 'Order id is not valid.' });
  const order = db.prepare('SELECT status, payment_method, payment_status FROM orders WHERE id = ?').get(orderId);
  if (!order) return res.status(404).json({ error: 'Order was not found.' });
  if (order.status === 'Cancelled' || (order.payment_method === 'razorpay' && order.payment_status !== 'paid')) {
    return res.status(409).json({ error: 'The order must be paid or eligible for cash on delivery before creating a shipment.' });
  }
  try {
    const shipmentOrderId = await createShiprocketShipment(orderId);
    if (!shipmentOrderId) return res.status(503).json({ error: 'Add Shiprocket credentials in .env before creating shipments.' });
    res.json({ shipmentOrderId, shipmentId: db.prepare('SELECT shiprocket_shipment_id FROM orders WHERE id = ?').get(orderId).shiprocket_shipment_id });
  } catch (error) {
    db.prepare('UPDATE orders SET shipment_error = ? WHERE id = ?').run(error.message.slice(0, 500), orderId);
    res.status(502).json({ error: error.message || 'Shiprocket could not create this shipment.' });
  }
});

app.get('/api/admin/orders/:id/couriers', requireAdmin, async (req, res) => {
  const orderId = Number(req.params.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return res.status(404).json({ error: 'Order was not found.' });
  if (!order.shiprocket_shipment_id) return res.status(409).json({ error: 'Create a Shiprocket order before checking available couriers.' });
  try {
    const query = new URLSearchParams({
      pickup_postcode: process.env.SHIPROCKET_PICKUP_POSTCODE || '',
      delivery_postcode: order.postal_code,
      weight: process.env.PARCEL_WEIGHT_KG || '0.5',
      cod: order.payment_method === 'cod' ? '1' : '0',
      shipment_id: String(order.shiprocket_shipment_id)
    });
    const result = await shiprocketRequest(`courier/serviceability/?${query}`);
    const couriers = (result.data?.available_courier_companies || []).map((courier) => ({
      id: courier.courier_company_id,
      name: courier.courier_name,
      rate: courier.rate,
      estimatedDays: courier.estimated_delivery_days,
      rating: courier.rating
    }));
    res.json({ couriers });
  } catch (error) {
    db.prepare('UPDATE orders SET shipment_error = ? WHERE id = ?').run(error.message.slice(0, 500), orderId);
    res.status(502).json({ error: error.message || 'Shiprocket could not check courier availability.' });
  }
});

app.post('/api/admin/orders/:id/shiprocket/assign', requireAdmin, async (req, res) => {
  const orderId = Number(req.params.id);
  const courierId = Number(req.body?.courierId);
  if (!Number.isSafeInteger(orderId) || !Number.isSafeInteger(courierId) || courierId < 1) {
    return res.status(400).json({ error: 'Choose a valid courier.' });
  }
  const order = db.prepare('SELECT shiprocket_shipment_id FROM orders WHERE id = ?').get(orderId);
  if (!order) return res.status(404).json({ error: 'Order was not found.' });
  if (!order.shiprocket_shipment_id) return res.status(409).json({ error: 'Create a Shiprocket shipment first.' });
  try {
    const result = await shiprocketRequest('courier/assign/awb', {
      method: 'POST',
      body: JSON.stringify({ shipment_id: order.shiprocket_shipment_id, courier_id: courierId })
    });
    const details = result.response?.data || result.data || {};
    const awbCode = String(details.awb_code || result.awb_code || '');
    if (!awbCode) throw new Error('Shiprocket did not return an AWB tracking number.');
    db.prepare(`UPDATE orders SET awb_code = ?, courier_name = ?, tracking_url = ?,
      shipment_status = 'awb_assigned', shipment_error = '', shipment_synced_at = CURRENT_TIMESTAMP
      WHERE id = ?`).run(awbCode, String(details.courier_name || ''), `https://shiprocket.co/tracking/${encodeURIComponent(awbCode)}`, orderId);
    res.json({ awbCode, courierName: String(details.courier_name || '') });
  } catch (error) {
    db.prepare('UPDATE orders SET shipment_error = ? WHERE id = ?').run(error.message.slice(0, 500), orderId);
    res.status(502).json({ error: error.message || 'Shiprocket could not assign this courier.' });
  }
});

app.post('/api/admin/orders/:id/shiprocket/pickup', requireAdmin, async (req, res) => {
  const orderId = Number(req.params.id);
  const order = db.prepare('SELECT shiprocket_shipment_id FROM orders WHERE id = ?').get(orderId);
  if (!order) return res.status(404).json({ error: 'Order was not found.' });
  if (!order.shiprocket_shipment_id) return res.status(409).json({ error: 'Create a Shiprocket shipment first.' });
  try {
    const result = await shiprocketRequest('courier/generate/pickup', {
      method: 'POST',
      body: JSON.stringify({ shipment_id: [order.shiprocket_shipment_id] })
    });
    db.prepare(`UPDATE orders SET shipment_status = 'pickup_requested',
      shipment_error = '', shipment_synced_at = CURRENT_TIMESTAMP WHERE id = ?`).run(orderId);
    res.json({ result });
  } catch (error) {
    db.prepare('UPDATE orders SET shipment_error = ? WHERE id = ?').run(error.message.slice(0, 500), orderId);
    res.status(502).json({ error: error.message || 'Shiprocket could not schedule pickup.' });
  }
});

app.post('/api/admin/orders/:id/status', requireAdmin, (req, res) => {
  const orderId = Number(req.params.id);
  const shipmentStatus = req.body?.shipmentStatus;
  const allowedStatuses = new Set(['shipment_created', 'packed', 'shipped', 'in_transit', 'delivered']);
  if (!Number.isSafeInteger(orderId) || !allowedStatuses.has(shipmentStatus)) {
    return res.status(400).json({ error: 'Choose a valid fulfillment status.' });
  }
  const order = db.prepare('SELECT id, status, payment_method, payment_status FROM orders WHERE id = ?').get(orderId);
  if (!order) return res.status(404).json({ error: 'Order was not found.' });
  if (order.status === 'Cancelled') return res.status(409).json({ error: 'A cancelled order cannot be fulfilled.' });
  if (order.payment_method === 'razorpay' && order.payment_status !== 'paid') {
    return res.status(409).json({ error: 'This order cannot be shipped until its online payment has been confirmed.' });
  }
  const awbCode = typeof req.body.awbCode === 'string' ? req.body.awbCode.trim().slice(0, 100) : '';
  const courierName = typeof req.body.courierName === 'string' ? req.body.courierName.trim().slice(0, 100) : '';
  const trackingUrl = typeof req.body.trackingUrl === 'string' ? req.body.trackingUrl.trim().slice(0, 500) : '';
  if (trackingUrl && !/^https:\/\//i.test(trackingUrl)) {
    return res.status(400).json({ error: 'Tracking links must use HTTPS.' });
  }
  if (['shipped', 'in_transit', 'delivered'].includes(shipmentStatus) && !awbCode && !trackingUrl) {
    return res.status(400).json({ error: 'Add a courier tracking number or HTTPS tracking link before shipping.' });
  }
  db.prepare(`UPDATE orders SET shipment_status = ?, awb_code = ?, courier_name = ?,
    tracking_url = ?, shipment_error = '', shipment_synced_at = CURRENT_TIMESTAMP,
    status = CASE WHEN ? = 'delivered' THEN 'Delivered' ELSE status END
    WHERE id = ?`).run(shipmentStatus, awbCode, courierName, trackingUrl, shipmentStatus, orderId);
  res.json({ ok: true });
});

app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'] }));
app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

let readyMessageShown = false;
function listenOnLoopback(host, displayHost, ipv6Only = false) {
  const listener = http.createServer(app);
  listener.on('error', (error) => {
    console.error(`Could not listen on ${displayHost}:${PORT}: ${error.message}`);
  });
  listener.listen({ port: PORT, host, ipv6Only }, () => {
    if (!readyMessageShown) {
      readyMessageShown = true;
      console.log(`PashminaQash is ready at http://localhost:${PORT}`);
      console.log(`SQLite database: ${path.join(DATA_DIR, 'store.sqlite')}`);
    }
    console.log(`Listening on ${displayHost}:${PORT}`);
  });
  return listener;
}

// VS Code's preview may resolve localhost to either address family. Listen on
// both loopback interfaces so localhost works without exposing the dev server
// to other devices on the network.
const localListeners = [
  listenOnLoopback('127.0.0.1', '127.0.0.1'),
  listenOnLoopback('::1', '[::1]', true)
];
