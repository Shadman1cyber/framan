# FARMAN feature × role × platform audit (2026-09-23)

Source of truth: admin routes and API guards in `src/app/admin/(panel)`,
`src/lib/admin-page-access.ts`, `src/lib/constants.ts`,
`ios/App/App/FarmanNativeApp.swift`, and `electron/main.cjs`.
Desktop is an Electron shell around the responsive Next.js web app, so it uses
the same forms and server permissions as mobile and desktop browsers.
Cashier web tabs may be further restricted by owner settings.
The iOS management screen also opens the complete responsive admin inside an
authenticated, ephemeral WebKit view while online. The table below describes
native iOS coverage; missing native operations use that full web surface.

| Feature | Authorized role | Web / Electron | Native iOS | Remaining gap |
| --- | --- | --- | --- | --- |
| Orders and status | OWNER, CASHIER | Full operational flow | List, detail, status | Native manual order entry is absent |
| Products | OWNER | Full form, delete | Create, edit, delete, availability | Native image upload, coffee-line editing and ingredient quantity editing are absent; existing values survive edits |
| Categories | OWNER | Create, edit, delete, active | Create, edit, delete, active | Native form does not expose sort order |
| Ingredients | OWNER | Create, edit, delete, stock | Create, edit, delete, stock | Verify full native form against web on device |
| Allergens | OWNER | Manage | Read only | Native create, edit, delete absent |
| Discounts | OWNER | Create, edit, archive, active | Create, edit, archive, active | Device workflow not yet exercised |
| Staff and attendance | OWNER; CASHIER own operations | Manage | Staff CRUD; attendance limited | Native attendance management absent |
| Staff pay | OWNER | Rates, history, estimates | Rates, history, estimates | Device workflow not yet exercised |
| Customers | OWNER, CASHIER as permitted | Customer pages | Read only | Native customer actions/history absent |
| Tables | OWNER; CASHIER operational | Manage and occupancy | Owner CRUD; cashier occupancy | Device workflow not yet exercised |
| Reservations | OWNER, CASHIER as permitted | Create and status | Create and status | Native edit/delete absent |
| Ratings | OWNER; CASHIER view | View, moderate | View; owner delete | Native full moderation absent |
| Leaves | OWNER approval; CASHIER own request | Submit, review, approve | Owner approval; cashier view | Native cashier submission absent |
| Finance, inventory, operations | OWNER | Full reports and operations | Summary and partial views | Native detailed reports/actions absent |
| Users, cashier access, QR, settings | OWNER; CASHIER QR as permitted | Full web modules | Mostly read/toggle | Native creation and full edit forms absent |
| AI and workspace | OWNER as permitted | Full web modules | Chat only | Native workspace controls absent |

`/api/admin/mobile/overview` is a display feed, not a complete mutation API.
Native writes use module APIs where implemented. The server remains the
authorization boundary; this matrix records actual UI coverage, not a release
claim. Android native parity and authenticated end-to-end device workflows
remain unaudited.
