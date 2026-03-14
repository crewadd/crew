# E-Commerce Platform

Reference template for building online stores with product catalogs, shopping carts, checkout flows, payment processing, and order management.

## Typical Tech Stack

| Layer | Common Choices |
|-------|---------------|
| Framework | Next.js (App Router), Remix, Nuxt |
| Commerce Engine | Custom, Shopify Storefront API, Medusa, Saleor |
| Database | PostgreSQL, PlanetScale |
| ORM | Prisma, Drizzle |
| Payments | Stripe, PayPal, Square |
| Search | Algolia, Meilisearch, Typesense |
| Media | Cloudinary, Uploadthing, S3 |
| Email | Resend, SendGrid |
| UI | shadcn/ui, Tailwind CSS |
| State | Zustand (cart), React Query / SWR |

## Standard Epic Progression

```
1. Setup & Config         — Project init, database, ORM, seed data
2. Product Catalog        — Product model, categories, variants, images
3. Product Display        — Product listing, detail pages, search, filters
4. Shopping Cart          — Cart state, add/remove/update, persistence
5. Auth & Accounts        — Customer registration, login, order history
6. Checkout Flow          — Address, shipping, payment, order confirmation
7. Payment Processing     — Stripe integration, webhooks, refunds
8. Order Management       — Order status, tracking, admin dashboard
9. Extras                 — Wishlist, reviews, recommendations, coupons
10. Quality & Launch      — SEO, performance, accessibility, E2E tests
```

## Epic Patterns

### Product Catalog

```typescript
const catalog = ctx.createEpic('catalog', 'Product Catalog');

catalog.addTask(ctx.createTask('catalog:schema', 'Product Data Model')
  .type('coding')
  .outputs(['prisma/schema.prisma', 'src/lib/db.ts'])
  .promptFrom('./prompts/catalog-schema.md')
  .check('tsc'));

catalog.addTask(ctx.createTask('catalog:seed', 'Seed Data')
  .type('coding')
  .deps(['catalog:schema'])
  .outputs(['prisma/seed.ts'])
  .promptFrom('./prompts/catalog-seed.md')
  .check('tsc'));

catalog.addTask(ctx.createTask('catalog:api', 'Product API')
  .type('coding')
  .deps(['catalog:schema'])
  .outputs(['src/app/api/products/', 'src/lib/products.ts'])
  .promptFrom('./prompts/catalog-api.md')
  .check('build'));
```

### Shopping Cart

```typescript
const cart = ctx.createEpic('cart', 'Shopping Cart');

cart.addTask(ctx.createTask('cart:store', 'Cart State Management')
  .type('coding')
  .outputs(['src/lib/cart.ts', 'src/hooks/use-cart.ts'])
  .promptFrom('./prompts/cart-store.md')
  .check('tsc'));

cart.addTask(ctx.createTask('cart:ui', 'Cart UI Components')
  .type('coding')
  .deps(['cart:store', 'catalog:api'])
  .outputs(['src/components/cart/', 'src/app/(shop)/cart/page.tsx'])
  .promptFrom('./prompts/cart-ui.md')
  .check('build'));

cart.addTask(ctx.createTask('cart:persist', 'Cart Persistence')
  .type('coding')
  .deps(['cart:store'])
  .outputs(['src/lib/cart-storage.ts'])
  .promptFrom('./prompts/cart-persist.md')
  .check('tsc'));
```

### Checkout Flow

```typescript
const checkout = ctx.createEpic('checkout', 'Checkout Flow');

checkout.addTask(ctx.createTask('checkout:address', 'Address Form')
  .type('coding')
  .deps(['cart:ui', 'auth:provider'])
  .outputs(['src/app/(shop)/checkout/address/page.tsx'])
  .promptFrom('./prompts/checkout-address.md')
  .check('build'));

checkout.addTask(ctx.createTask('checkout:shipping', 'Shipping Options')
  .type('coding')
  .deps(['checkout:address'])
  .outputs(['src/app/(shop)/checkout/shipping/page.tsx', 'src/lib/shipping.ts'])
  .promptFrom('./prompts/checkout-shipping.md')
  .check('build'));

checkout.addTask(ctx.createTask('checkout:payment', 'Payment Integration')
  .type('coding')
  .deps(['checkout:shipping'])
  .outputs(['src/app/(shop)/checkout/payment/page.tsx', 'src/lib/payments.ts'])
  .promptFrom('./prompts/checkout-payment.md')
  .check('build'));

checkout.addTask(ctx.createTask('checkout:confirm', 'Order Confirmation')
  .type('coding')
  .deps(['checkout:payment'])
  .outputs(['src/app/(shop)/checkout/confirmation/page.tsx'])
  .promptFrom('./prompts/checkout-confirm.md')
  .check('build'));

checkout.addTask(ctx.createTask('checkout:webhooks', 'Payment Webhooks')
  .type('coding')
  .deps(['checkout:payment'])
  .outputs(['src/app/api/webhooks/stripe/route.ts'])
  .promptFrom('./prompts/checkout-webhooks.md')
  .check('build')
  .review('agent', { prompt: 'Verify webhook signature validation and idempotency' }));
```

### Product Display

```typescript
const display = ctx.createEpic('display', 'Product Display');

display.addTask(ctx.createTask('display:listing', 'Product Listing Page')
  .type('coding')
  .deps(['catalog:api'])
  .outputs(['src/app/(shop)/products/page.tsx', 'src/components/product-card.tsx'])
  .promptFrom('./prompts/display-listing.md')
  .check('build'));

display.addTask(ctx.createTask('display:detail', 'Product Detail Page')
  .type('coding')
  .deps(['catalog:api'])
  .outputs(['src/app/(shop)/products/[slug]/page.tsx'])
  .promptFrom('./prompts/display-detail.md')
  .check('build'));

display.addTask(ctx.createTask('display:search', 'Search & Filters')
  .type('coding')
  .deps(['catalog:api'])
  .outputs(['src/components/search/', 'src/lib/search.ts'])
  .promptFrom('./prompts/display-search.md')
  .check('build'));
```

## Dependency Graph

```
catalog:schema ──→ catalog:api ──→ display:listing
       │                │          display:detail
       └→ catalog:seed  │          display:search
                        │
cart:store ──→ cart:ui ──┘
    │             │
    └→ cart:persist│
                  │
auth:provider ────┤
                  │
checkout:address ──→ checkout:shipping ──→ checkout:payment ──→ checkout:confirm
                                                │
                                                └→ checkout:webhooks
```

## Plan Variables

```typescript
plan.vars({
  framework: 'nextjs',
  commerceEngine: 'custom',     // 'custom' | 'shopify' | 'medusa'
  database: 'postgresql',
  orm: 'prisma',
  paymentProvider: 'stripe',
  searchProvider: 'none',       // 'none' | 'algolia' | 'meilisearch'
  features: ['catalog', 'cart', 'checkout', 'accounts', 'orders'],
  currency: 'USD',
  multiCurrency: false,
  taxProvider: 'none',          // 'none' | 'stripe-tax' | 'taxjar'
});
```

## PRD Mapping Hints

| PRD Section | Maps To |
|-------------|---------|
| Product management | `catalog` epic |
| Product pages / browsing | `display` epic |
| Cart / basket | `cart` epic |
| Checkout / purchase flow | `checkout` epic |
| Customer accounts | `auth` epic |
| Order tracking / history | `orders` epic |
| Search / filtering | `display:search` task |
| Promotions / coupons | `extras` epic |
| Reviews / ratings | `extras` epic |
| Admin / inventory | `admin` epic |

## Checks Strategy

- `tsc` on all schema, library, and state modules
- `build` on all pages and API routes
- `review('agent')` on payment and webhook handlers
- `review('human')` on checkout flow and cart calculations
- Custom checks for price calculation accuracy
- Lighthouse audit for product pages (Core Web Vitals)
