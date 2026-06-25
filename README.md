---
title: Hamza Restaurant
emoji: 🍽️
colorFrom: red
colorTo: yellow
sdk: docker
app_port: 7860
pinned: false
---

# Hamza Restaurant — Smart Ordering 🍽️

> 🔴 **Live demo:** **https://muhammadhamza221003-hamza-restaurant.hf.space**
> (admin panel at `/admin.html` — `admin@zaiqa.com` / `admin123`)

A full-stack restaurant ordering app: a customer storefront and an admin panel,
backed by a **Node.js + Express** API with **JWT authentication** and a
**SQLite** database for menus and orders.

By **Muhammad Hamza**.

## Run locally

```bash
npm install
npm start        # http://localhost:5000  (admin panel at /admin.html)
```

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `JWT_SECRET` | Signs login tokens — set a strong random value in production | dev fallback |
| `PORT` | Port to listen on (set automatically by the host) | `5000` |

The JWT secret is **never hardcoded** — it is read from `process.env.JWT_SECRET`.
Set it in your host's environment variables (e.g. Render → Environment).

## Deploy

Deployed on [Render](https://render.com) as a Node web service:
- **Build command:** `npm install`
- **Start command:** `npm start`
- Add `JWT_SECRET` under Environment.

> Note: the SQLite database lives on the server's disk, which resets on free-tier
> redeploys — fine for a demo. For persistence, attach a Render disk or use a
> hosted database.
