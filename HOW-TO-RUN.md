# Zaiqa — Restaurant Management Platform

A full restaurant ordering + management system with a real database, admin
console, KPI analytics, reservations, reviews, and real-time notifications.

## ▶️ Run it (Windows)

**Double-click `start-server.bat`** — it installs dependencies the first time,
opens your browser, and starts the server. Keep the black window open while using
the site. To stop, close the window.

Or, in a terminal:
```bash
npm install      # first time only
node server.js
```

| Page            | URL                              |
|-----------------|----------------------------------|
| Customer site   | http://localhost:5000            |
| **Admin panel** | http://localhost:5000/admin.html |

## 🔑 Logins

| Role     | Email                  | Password                         |
|----------|------------------------|----------------------------------|
| **Owner admin** | admin@zaiqa.com | `ADMIN_PASSWORD` env (local default `admin123`) |
| **Demo admin (read-only)** | demo.admin@zaiqa.com | demo123 |
| Customer | demo@example.com       | password123                      |
| Customer | test@example.com       | test123                          |

Customers can also sign up. When logged in as the admin, an **Admin** link appears
in the customer site's navbar.

## ✨ Features

### Customer site
- Browse menu (loaded live from the database), search, sort, filter, favourites
- **Premium reviews**: per-dish rating breakdown, verified-diner badges, photo
  reviews, filters (5★/4★/with photos/verified), and "helpful" votes
- Cart, checkout, live **order tracking** (Placed → Preparing → On the way → Delivered)
- **Reserve a table** with date/time/party size
- **Real-time notifications** (bell) — get pinged the moment your order status changes
- Light/Dark theme

### Admin console (`/admin.html`)
- **KPI dashboard**: revenue, orders, customers, avg order value, peak hour,
  pending orders/reservations, total reviews
- **Charts**: revenue trend, peak business hours, most-ordered dishes,
  revenue by category, customer growth, orders by weekday, order-status mix,
  best-sellers by revenue
- **Orders**: filter by status, change status (customer is notified live)
- **Products**: add / edit / delete, upload images, toggle availability
- **Categories**: add / delete
- **Reservations**: confirm / seat / cancel
- **Customers**: list with order count & total spent
- **Reviews**: browse all feedback with verified badges
- **Real-time bell** notifications for new orders, reservations & signups
- Role-based access control (only `admin` accounts can enter)

## 💾 Data

Everything is stored in **`database.db`** (SQLite). It survives restarts.
Delete `database.db*` to reset to the rich demo dataset — it rebuilds on next start.

## 🛠️ Tech
- **Backend:** Node.js + Express, SQLite (`node:sqlite`), JWT auth, bcrypt
- **Real-time:** Server-Sent Events (SSE)
- **Charts:** Chart.js
- **Frontend:** vanilla JS, glassmorphism UI

> Want to rename the brand from "Zaiqa"? Change `BRAND` in `server.js` and the
> "Zaiqa" text in `index.html` / `admin.html`.
