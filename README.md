# Duka Manager v3.0 — Wholesale & Retail Management System

## Quick Start

```bash
npm install
# Edit .env.local with your PostgreSQL connection string
node scripts/migrate-v3.js    # Creates tables + super admin
npm run dev
```

**Login**: abdihakimomar2017@gmail.com / Abdihaki7221-@

## Features

- **Authentication**: Super Admin (sees everything) & Staff Admin (no profit visibility)
- **Inventory**: Products with denominations (1/4kg, 1/2L, 1L, 5L etc.), wholesale packs, edit prices in-place
- **POS**: Denomination/wholesale selling, item & sale discounts, split payments (Cash/M-Pesa/KCB/Credit)
- **Credit Management**: Track debts, record partial/full payments as Cash/M-Pesa/KCB journal entries
- **Cash Safe**: Track safe balance, owner withdrawals, carry-forward, deposits
- **Reports**: Daily/Weekly/Monthly with filters, P&L, credit report, top products, charts
- **Dashboard**: Live sales feed, Cash/M-Pesa/KCB totals, safe balance, date filter

## Database Setup

```bash
node scripts/migrate-v3.js   # Full idempotent migration (v1+v2+v3) + admin seed
```

## Tech Stack

Next.js 14 · PostgreSQL · Tailwind CSS · Recharts
