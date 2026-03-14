# Expected Output Reference

This directory contains reference implementations showing what the generated task management app should look like after Crew completes the orchestration.

## Purpose

This serves as:
1. **Validation:** Verify that generated code matches expected structure
2. **Reference:** Show users what they should expect
3. **Testing:** Automated comparison for CI/CD

## Structure

```
expected-output/
├── packages/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── index.ts              # Express server entry
│   │   │   ├── auth/                 # Authentication module
│   │   │   │   ├── auth.controller.ts
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── auth.middleware.ts
│   │   │   │   └── auth.types.ts
│   │   │   ├── api/                  # REST API
│   │   │   │   ├── tasks.controller.ts
│   │   │   │   ├── tasks.service.ts
│   │   │   │   ├── tasks.types.ts
│   │   │   │   └── validation.ts
│   │   │   └── db/                   # Database layer
│   │   │       ├── schema.ts
│   │   │       ├── client.ts
│   │   │       ├── users.repository.ts
│   │   │       └── tasks.repository.ts
│   │   ├── drizzle/
│   │   │   └── migrations/
│   │   │       └── 0000_initial.sql
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── drizzle.config.ts
│   │   ├── .env.example
│   │   └── Dockerfile
│   └── frontend/
│       ├── src/
│       │   ├── main.tsx              # React entry
│       │   ├── App.tsx               # Root component
│       │   ├── components/
│       │   │   ├── auth/
│       │   │   │   ├── LoginForm.tsx
│       │   │   │   ├── RegisterForm.tsx
│       │   │   │   └── AuthPage.tsx
│       │   │   └── tasks/
│       │   │       ├── TaskList.tsx
│       │   │       ├── TaskItem.tsx
│       │   │       ├── TaskForm.tsx
│       │   │       ├── TaskFilters.tsx
│       │   │       └── TaskDetail.tsx
│       │   ├── api/
│       │   │   ├── client.ts
│       │   │   ├── auth.api.ts
│       │   │   └── tasks.api.ts
│       │   ├── hooks/
│       │   │   ├── useAuth.ts
│       │   │   └── useTasks.ts
│       │   └── contexts/
│       │       └── AuthContext.tsx
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       ├── tailwind.config.js
│       ├── postcss.config.js
│       └── Dockerfile
├── tests/
│   ├── auth.spec.ts
│   ├── tasks.spec.ts
│   └── filters.spec.ts
├── docker-compose.yml
├── playwright.config.ts
└── package.json (root)
```

## Key Files

### Backend

**`packages/backend/src/index.ts`**
- Express server initialization
- Middleware setup (CORS, helmet, morgan)
- Route mounting
- Error handling
- Health endpoint

**`packages/backend/src/auth/`**
- JWT generation and validation
- Password hashing with bcrypt
- Authentication middleware
- Register/login endpoints

**`packages/backend/src/api/`**
- Task CRUD endpoints
- Request validation
- Filtering and search
- Business logic

**`packages/backend/src/db/`**
- Drizzle ORM schema
- Database client with connection pooling
- Repository pattern implementations

### Frontend

**`packages/frontend/src/App.tsx`**
- Root component
- Routing (if applicable)
- Auth provider
- Global layout

**`packages/frontend/src/components/auth/`**
- Login and registration forms
- Client-side validation
- Auth state management

**`packages/frontend/src/components/tasks/`**
- Task list and item components
- Task creation/editing forms
- Filtering and search UI
- Task detail view

**`packages/frontend/src/api/`**
- Fetch wrapper with auth headers
- API client for auth endpoints
- API client for task endpoints
- TypeScript types

**`packages/frontend/src/hooks/`**
- useAuth: Authentication state and actions
- useTasks: Task CRUD operations
- Custom form hooks

### Testing

**`tests/*.spec.ts`**
- Playwright E2E tests
- Auth flow tests
- Task CRUD tests
- Filtering tests

### Deployment

**`docker-compose.yml`**
- PostgreSQL service
- Backend service
- Frontend service
- Network and volume configuration

**`Dockerfile` (backend)**
- Multi-stage build
- TypeScript compilation
- Production dependencies only

**`Dockerfile` (frontend)**
- Multi-stage build
- Vite build
- Nginx for static serving

## Validation

To validate generated output against reference:

```bash
# Compare structure
diff -r packages/ expected-output/packages/

# Check key files exist
test -f packages/backend/src/index.ts
test -f packages/backend/src/auth/auth.service.ts
test -f packages/frontend/src/App.tsx
test -f docker-compose.yml

# Verify TypeScript compiles
cd packages/backend && npx tsc --noEmit
cd ../frontend && npx tsc --noEmit

# Run tests
npx playwright test
```

## Notes

- Exact code will vary based on AI agent decisions
- Structure should match, implementation may differ
- Key functionality must be present
- All quality gates must pass

## Using as a Template

You can copy files from here to bootstrap your own project:

```bash
# Copy backend structure
cp -r expected-output/packages/backend packages/

# Copy frontend structure
cp -r expected-output/packages/frontend packages/

# Install and run
npm install
cd packages/backend && npm install
cd ../frontend && npm install
```

However, it's better to let Crew generate it—that's the point! 🚀
