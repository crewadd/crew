# SaaS Application

Reference template for building multi-tenant SaaS applications with authentication, billing, dashboards, and team management.

## Typical Tech Stack

| Layer | Common Choices |
|-------|---------------|
| Framework | Next.js (App Router), Remix, Nuxt |
| Auth | NextAuth / Auth.js, Clerk, Supabase Auth |
| Database | PostgreSQL, PlanetScale (MySQL), Supabase |
| ORM | Prisma, Drizzle |
| Payments | Stripe, Lemon Squeezy |
| Email | Resend, SendGrid, Postmark |
| UI | shadcn/ui, Tailwind CSS, Radix |
| Hosting | Vercel, AWS, Fly.io |

## Standard Epic Progression

```
1. Setup & Config        — Project init, auth provider, database, ORM setup
2. Auth & Users          — Sign up, sign in, password reset, email verification, OAuth
3. Billing & Plans       — Stripe integration, plan tiers, checkout, webhooks, portal
4. Core Domain           — Primary feature set (app-specific)
5. Team & Multi-tenancy  — Organizations, invites, roles, permissions
6. Dashboard & Settings  — User dashboard, account settings, billing management
7. Admin Panel           — Internal admin tools, user management, metrics
8. Notifications         — Email templates, in-app notifications, webhook events
9. Quality & Polish      — Error handling, loading states, responsive design
10. Verification         — E2E tests, build checks, security audit
```

Adapt based on PRD scope — not every SaaS needs all ten epics. Collapse or skip as needed.

## Epic Patterns

### Auth & Users

```typescript
const auth = ctx.createEpic('auth', 'Authentication & Users');

auth.addTask(ctx.createTask('auth:schema', 'User & Account Schema')
  .type('coding')
  .outputs(['prisma/schema.prisma', 'src/lib/db.ts'])
  .promptFrom('./prompts/auth-schema.md')
  .check('tsc'));

auth.addTask(ctx.createTask('auth:provider', 'Auth Provider Setup')
  .type('coding')
  .deps(['auth:schema'])
  .outputs(['src/lib/auth.ts', 'src/app/api/auth/[...nextauth]/route.ts'])
  .promptFrom('./prompts/auth-provider.md')
  .check('build'));

auth.addTask(ctx.createTask('auth:pages', 'Auth Pages')
  .type('coding')
  .deps(['auth:provider'])
  .outputs(['src/app/(auth)/login/page.tsx', 'src/app/(auth)/register/page.tsx'])
  .promptFrom('./prompts/auth-pages.md')
  .check('build'));

auth.addTask(ctx.createTask('auth:middleware', 'Route Protection')
  .type('coding')
  .deps(['auth:provider'])
  .outputs(['src/middleware.ts'])
  .promptFrom('./prompts/auth-middleware.md')
  .check('tsc'));
```

### Billing & Plans

```typescript
const billing = ctx.createEpic('billing', 'Billing & Subscriptions');

billing.addTask(ctx.createTask('billing:stripe', 'Stripe Integration')
  .type('coding')
  .deps(['auth:schema'])
  .outputs(['src/lib/stripe.ts', 'src/lib/plans.ts'])
  .promptFrom('./prompts/stripe-setup.md')
  .check('tsc'));

billing.addTask(ctx.createTask('billing:webhooks', 'Stripe Webhooks')
  .type('coding')
  .deps(['billing:stripe'])
  .outputs(['src/app/api/webhooks/stripe/route.ts'])
  .promptFrom('./prompts/stripe-webhooks.md')
  .check('build'));

billing.addTask(ctx.createTask('billing:checkout', 'Checkout & Portal')
  .type('coding')
  .deps(['billing:stripe', 'auth:pages'])
  .outputs(['src/app/(app)/billing/page.tsx'])
  .promptFrom('./prompts/billing-checkout.md')
  .check('build'));

billing.addTask(ctx.createTask('billing:guards', 'Plan-Based Access Guards')
  .type('coding')
  .deps(['billing:stripe', 'auth:middleware'])
  .outputs(['src/lib/guards.ts'])
  .promptFrom('./prompts/billing-guards.md')
  .check('tsc'));
```

### Multi-Tenancy

```typescript
const teams = ctx.createEpic('teams', 'Teams & Organizations');

teams.addTask(ctx.createTask('teams:schema', 'Organization Schema')
  .type('coding')
  .deps(['auth:schema'])
  .outputs(['prisma/schema.prisma'])
  .promptFrom('./prompts/teams-schema.md')
  .check('tsc'));

teams.addTask(ctx.createTask('teams:rbac', 'Role-Based Access Control')
  .type('coding')
  .deps(['teams:schema'])
  .outputs(['src/lib/permissions.ts', 'src/lib/roles.ts'])
  .promptFrom('./prompts/teams-rbac.md')
  .check('tsc'));

teams.addTask(ctx.createTask('teams:invites', 'Team Invitations')
  .type('coding')
  .deps(['teams:schema', 'auth:provider'])
  .outputs(['src/app/api/invites/', 'src/app/(app)/team/invite/'])
  .promptFrom('./prompts/teams-invites.md')
  .check('build'));
```

## Dependency Graph

```
auth:schema ──→ auth:provider ──→ auth:pages
     │               │                │
     │               └→ auth:middleware
     │                       │
     ├→ billing:stripe ──→ billing:webhooks
     │       │               │
     │       ├→ billing:checkout ←──┘
     │       └→ billing:guards ←── auth:middleware
     │
     └→ teams:schema ──→ teams:rbac
              │              │
              └→ teams:invites
```

## Plan Variables

```typescript
plan.vars({
  framework: 'nextjs',
  authProvider: 'next-auth',     // 'next-auth' | 'clerk' | 'supabase'
  database: 'postgresql',
  orm: 'prisma',
  paymentProvider: 'stripe',
  multiTenant: true,
  features: ['auth', 'billing', 'teams', 'dashboard'],
});
```

## PRD Mapping Hints

| PRD Section | Maps To |
|-------------|---------|
| User management / authentication | `auth` epic |
| Pricing / plans / subscriptions | `billing` epic |
| Teams / organizations / workspaces | `teams` epic |
| Core product features | `core-domain` epic (app-specific) |
| Admin / back-office | `admin` epic |
| Notifications / emails | `notifications` epic |
| Settings / preferences | `dashboard` epic |

## Checks Strategy

- `tsc` on all schema and library tasks
- `build` on all page and API route tasks
- `review('agent')` on auth and billing tasks (security-sensitive)
- `review('human')` on RBAC and permissions logic
- Custom check for Stripe webhook signature verification
