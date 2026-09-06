# کافه فرمان — Farman's Cafe Digital Menu

A premium Persian (RTL) digital café platform. Guests scan a QR code on their table, browse a beautiful menu, filter by allergens, and order straight to the kitchen — while staff manage everything from a live admin dashboard.

Built with **Next.js 14 (App Router)**, **Prisma + SQLite**, **NextAuth**, **Tailwind CSS**, and **Vitest**.

![Stack](https://img.shields.io/badge/Next.js-14-blue) ![DB](https://img.shields.io/badge/DB-SQLite%20%2F%20Prisma-4a5568) ![Auth](https://img.shields.io/badge/Auth-NextAuth-brightgreen) ![Tests](https://img.shields.io/badge/tests-24%20passing-brightgreen)

---

## Features

**Customer side**
- QR code restaurant/lounge ordering — scan a table QR and order from your seat
- **Allergy & dietary filter** — pick allergens (شیر، گلوتن، آجیل، …) and only safe items are shown, with warnings marked on each dish
- Personalized recommendations based on the customer's saved preferences
- Shopping cart with table context preserved through checkout
- Guest checkout (name/phone/notes optional) or logged-in ordering
- Order tracking page per order; full order history under your account
- Customer club signup pitch with discount/perk messaging (باشگاه مشتریان)
- Login / signup entry points in the top navigation

**Admin side**
- Live dashboard with counts, revenue, and recent orders
- Orders board with **auto-refresh every 5 seconds** — new orders appear while you watch, status transitions (در انتظار/تایید/آمادهسازی/آماده/تحویل)
- Full CRUD for products, categories, ingredients, allergens, dietary tags
- Manage users (incl. role assignment), ratings, café tables
- QR code generator — create and print table QR codes instantly

**Engineering**
- Strict TypeScript, ESLint, and 24 Vitest unit tests
- RTL-first Persian UI, warm "editorial café" design system
- Prisma schema for 18 models; seeded demo data

---

## Tech Stack

| Area | Choice |
|---|---|
| Framework | Next.js 14.2 (App Router, RSC) |
| Database | SQLite via Prisma 5 |
| Auth | NextAuth 4 (credentials, JWT sessions) |
| Styling | Tailwind CSS 3, Vazirmatn font |
| Validation | Zod |
| QR codes | `qrcode` package (server-generated data-URLs) |
| Tests | Vitest 2 |
| Tooling | TypeScript, ESLint, bcryptjs, tsx |

---

## How to Run

### Prerequisites

- Node.js **18+**
- npm

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Create `.env` (a `.env.example` is committed as a template):

```
DATABASE_URL="file:./dev.db"
NEXTAUTH_SECRET="replace-with-a-random-secret"
NEXTAUTH_URL="http://localhost:3000"
```

- `NEXTAUTH_SECRET` — generate one with `openssl rand -base64 32`
- For production, set `NEXTAUTH_URL` to your deployed origin

### 3. Create & seed the database

```bash
npm run db:push   # applies schema.prisma to the SQLite file
npm run db:seed   # seeds demo data (menu, users, tables, QR codes)
```

> `npm run db:reset` re-creates the DB from scratch and re-seeds.

### 4. Run the dev server

```bash
npm run dev
```

Open **http://localhost:3000**

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Admin | `admin@farmans.cafe` | `admin1234` |
| Customer | `user@farmans.cafe` | `user1234` |

### Other scripts

```bash
npm run build       # prisma generate + production build
npm start           # run the production build
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm test            # Vitest (24 tests)
npm run test:watch  # Vitest watch mode
npm run db:push     # sync Prisma schema
npm run db:seed     # seed demo data
npm run db:reset    # wipe + re-seed
```

> ⚠️ Don't run `npm run build` while `npm run dev` is active — both write to `.next` and the dev server can break. Stop dev first.

---

## Pages

### Customer pages

| Route | Description |
|---|---|
| `/` | Home — hero, customer club banner (guests), allergen selector, categories, featured & popular items. Honors `?table=` / `?qr=` for QR entry |
| `/menu` | All menu categories |
| `/menu/[slug]` | Products within a category (`/menu/coffee`, `/menu/dessert`, …) |
| `/product/[slug]` | Product detail — price, ingredients, allergens, dietary tags, ratings, add to cart |
| `/cart` | Shopping cart (stored in `localStorage`) |
| `/checkout` | Final order confirmation — table context shown, guest info optional |
| `/order/[id]` | Live order tracking for a placed order |
| `/orders` | Order history for the signed-in user |
| `/search` | Search across the menu |
| `/profile` | Customer account home; signup/personalization links; admin entry point for staff |
| `/profile/allergies` | Manage saved allergies |
| `/profile/preferences` | Manage dietary preferences (drives PERSONAL recommendations) |
| `/login` | Sign in (admins are routed to `/admin` after login) |
| `/register` | Sign up (customer club) |

### Admin pages (require the `ADMIN` role)

| Route | Description |
|---|---|
| `/admin` | Dashboard — product/order/user counts, pending orders, revenue, recent orders |
| `/admin/orders` | Orders board with status filters and **live auto-refresh (5s)**; change order status inline |
| `/admin/products` | Product list with edit/delete |
| `/admin/products/new` | Create a product |
| `/admin/products/[id]` | Edit a product (pricing, availability, ingredients, allergens, tags) |
| `/admin/categories` | Manage categories |
| `/admin/ingredients` | Manage ingredients (incl. allergen flags) |
| `/admin/allergens` | Manage allergens |
| `/admin/tables` | Manage tables |
| `/admin/qr` | Generate & manage table QR codes (rendered as printable images) |
| `/admin/users` | Manage users and roles (self-demotion blocked) |
| `/admin/ratings` | Review and remove customer ratings |

---

## How QR Ordering Works

1. Each table has a QR code whose URL is `NEXTAUTH_URL/?table=<code>` (e.g. `?table=main-table-2`).
2. Scanning it resolves the table server-side and lands the guest on `/`.
3. A `QrContextTracker` records the QR/table in the cart context (`localStorage`) so the context survives browsing deeper links.
4. Checkout submits `qrCodeId`; `createOrder` resolves the QR (by id *or* code) to its table and binds the order to that table.
5. The order appears in the admin board within 5 seconds.

Seeded QR codes: `main-table-1` … `main-table-8` plus a menu-wide `main-menu`.

---

## Data Model (Prisma)

`User · Category · Product · Ingredient · Allergen · DietaryTag · ProductIngredient · ProductAllergen · ProductDietaryTag · IngredientAllergen · UserAllergy · UserPreference · UserDietaryTag · Cafe · Branch · CafeTable · QRCode · Order · OrderItem · Rating`

Order statuses: `PENDING → CONFIRMED → PREPARING → READY → COMPLETED` (or `CANCELLED` at any active stage). Transitions are enforced in code.

---

## Testing

Unit tests live next to the lib code under `src/lib/*.test.ts`:

```bash
npm test
```

Covered logic: allergen-safe filtering, cart pricing, recommendation strategies, and order creation/status transitions.

---

## Project Structure

```
prisma/            schema.prisma + seed.ts
src/app/           Next.js routes (pages + API)
  ├── admin/       admin pages (role-guarded)
  ├── api/         REST API routes (orders, auth, admin CRUD, profile)
  └── ...
src/components/    nav, menu, cart, admin, ui primitives
src/lib/           db, auth, queries, cart, orders, allergies, recommendations, qr
src/lib/*.test.ts  Vitest unit tests
```

---

## License

Private project — all rights reserved.