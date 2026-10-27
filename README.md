# PashminaQash

A responsive Pashmina shawl storefront built with HTML, CSS, JavaScript, Express, and SQLite.

## Run it

Requires Node.js 22.5+ (this app uses the built-in `node:sqlite` module) and Express.

```bash
npm install
npm start
```

Then open [http://localhost:3000](http://localhost:3000). The SQLite database is stored at `data/store.sqlite`; it keeps the product catalogue, customer accounts, orders, order items, stock levels, and notification attempts between restarts. The first run adds eight sample shawls. Older sample products are hidden from the storefront without deleting their order history.

## Features

- Browse, search, and filter Pashmina shawls; open a dedicated product detail page.
- Add items to a persistent browser cart and update quantities.
- Register and sign in with salted scrypt password hashes and a signed, HTTP-only session cookie.
- Place an online Razorpay or cash-on-delivery order. Prices and stock are verified by the server, and orders plus item snapshots are saved transactionally.
- View recent orders in the account panel.
- Send order alerts by email and optional WhatsApp/SMS; every channel's status is logged in SQLite.

## Purchase notifications

The private `.env` file is already set up with the store's email address and WhatsApp number. Add a Gmail app password (not your regular Google password) to `SMTP_PASS` to enable email alerts. On a fresh checkout, copy `.env.example` to `.env` first. Never paste passwords or provider tokens into source code or chat.

WhatsApp/SMS alerts use Twilio and require a Twilio account, account SID, auth token, and an approved WhatsApp sender or SMS number. Enter the sender and your destination number in `.env`. The shop owner email and WhatsApp number are configured privately in the local `.env`; notification attempts are logged in the `order_notifications` table, and failed deliveries are written to the server log. Restart the server after changing `.env`.

## Payments, shipping, and order desk

- Visit `/admin.html` to sign in to the private order desk. `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` protect customer addresses, payment statuses, and fulfillment controls. Change the generated admin password before using the desk.
- Add Razorpay **test-mode** key ID and key secret to `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` to enable the secure hosted checkout. Set `RAZORPAY_WEBHOOK_SECRET` and configure `https://your-domain/api/payments/webhook` in Razorpay for payment-captured, order-paid, and payment-failed events. The server creates INR orders and verifies signed payment callbacks before marking them paid.
- Add Shiprocket account email/password, the Shiprocket pickup-location name, and your actual pickup PIN code to `.env`. Provide the real packed shawl parcel dimensions and weight as well. Eligible COD orders and paid orders are submitted to Shiprocket. In the order desk, review courier rates, assign the chosen courier/AWB, and request collection. Tracking numbers/statuses are stored with each order; the buyer can see them in their account.
- To use COD, enable it in Shiprocket's account settings. Shipping rates, tax/invoices, return/refund rules, and the pickup address still need your business decisions and provider account setup.
- No payment or courier credentials are committed. Start with Razorpay test keys, complete a test payment, and verify a real Shiprocket test order before accepting live orders.

The `.env` and `data/` folder are excluded from Git. Back up `data/store.sqlite` regularly. This database is on the machine running the server, not hosted online; a public storefront needs a hosting provider, HTTPS, and persistent database. Set `PORT` and a long random `SESSION_SECRET` before deployment.

Confirm shawl stock, prices, images, fibre composition, parcel weights, pickup postcode, and any artisan/origin claims with your supplier before taking live orders. Configure Razorpay/Shiprocket credentials on the computer that runs the public server; credentials in your local `.env` will not travel with a Git commit.
