/**
 * Task Management App - Comprehensive Crew Example
 *
 * This plan demonstrates ALL major Crew features:
 * 1. Three-level hierarchy (Project → Epics → Tasks)
 * 2. Quality gates with automatic retry
 * 3. Constraint-based parallel execution
 * 4. Multi-agent workflows with skills
 * 5. Incremental planning with yields
 * 6. AutoHarness validation
 * 7. Crash-safe resumability
 * 8. Filesystem transparency
 *
 * EXECUTION OVERVIEW:
 * - Epic 1: Foundation (sequential setup)
 * - Epic 2 + 3: Backend and Frontend (parallel!)
 * - Epic 4: Integration (waits for 2+3)
 * - Epic 5: Deployment (advanced yields)
 */

export async function createPlan(ctx: any) {
  const plan = ctx.createPlan('task-management-app', 'Task Management App');

  // ═══════════════════════════════════════════════════════════════════════════
  // EPIC 1: PROJECT FOUNDATION
  // ═══════════════════════════════════════════════════════════════════════════

  const epic1 = ctx.createEpic('foundation', 'Project Foundation', {
    description: 'Bootstrap the monorepo structure and shared configuration'
  });

  // Task 1.1: Initialize monorepo structure
  epic1.addTask(
    ctx.createTask('init-monorepo', 'Initialize Monorepo')
      .prompt(`
Create a monorepo workspace structure for a task management application with:

1. Root package.json with workspaces: ["packages/*"]
2. Two packages:
   - packages/backend (Express + TypeScript + PostgreSQL)
   - packages/frontend (React + Vite + TypeScript)

3. Each package needs:
   - package.json with appropriate dependencies
   - tsconfig.json
   - src/ directory with basic entry point

4. Root-level files:
   - .gitignore (node_modules, dist, .env, etc.)
   - tsconfig.base.json (shared TypeScript config)

Requirements:
- Use npm workspaces
- TypeScript strict mode enabled
- Modern ES modules (type: "module")
- Backend uses Node 18+ features
- Frontend uses Vite 5+

Do not install dependencies yet - just create the file structure.
      `)
      .check({
        cmd: 'test -f packages/backend/package.json && test -f packages/frontend/package.json'
      })
      .check({
        prompt: 'Verify workspace structure has correct package.json files with workspace references'
      })
  );

  // Task 1.2: Setup TypeScript configuration
  epic1.addTask(
    ctx.createTask('setup-typescript', 'Setup TypeScript')
      .deps(['init-monorepo'])
      .prompt(`
Configure TypeScript for the monorepo:

1. Root tsconfig.base.json with:
   - strict: true
   - esModuleInterop: true
   - skipLibCheck: true
   - target: ES2022
   - module: ESNext
   - moduleResolution: bundler

2. Backend tsconfig.json extending base with:
   - outDir: ./dist
   - rootDir: ./src
   - include: ["src/**/*"]
   - lib: ["ES2022"]

3. Frontend tsconfig.json extending base with:
   - jsx: react-jsx
   - lib: ["ES2022", "DOM", "DOM.Iterable"]
   - include: ["src/**/*"]

Ensure all configs use path mapping for workspace packages.
      `)
      .check('tsc')
      .check({
        prompt: 'Verify TypeScript compiles without errors in both packages'
      })
  );

  // Task 1.3: Setup database schema
  epic1.addTask(
    ctx.createTask('setup-database', 'Setup Database Schema')
      .deps(['setup-typescript'])
      .skill('database-schema-design')
      .prompt(`
Create PostgreSQL database schema with Drizzle ORM:

1. Install Drizzle ORM dependencies in backend package:
   - drizzle-orm
   - drizzle-kit
   - postgres (or pg)

2. Create schema in packages/backend/src/db/schema.ts:
   - users table: id, email, password_hash, created_at
   - tasks table: id, user_id, title, description, status, priority, due_date, created_at, updated_at

3. Create Drizzle config: drizzle.config.ts

4. Create migration scripts in package.json:
   - db:generate (generate migrations)
   - db:migrate (run migrations)
   - db:push (push schema)

5. Generate initial migration

Requirements:
- Use PostgreSQL types
- Add indexes on foreign keys and commonly queried fields
- Status enum: 'todo' | 'in_progress' | 'done'
- Priority enum: 'low' | 'medium' | 'high'
      `)
      .check('tsc')
      .check({
        cmd: 'test -f packages/backend/src/db/schema.ts'
      })
      .check({
        prompt: 'Verify schema includes users and tasks tables with proper relations and indexes'
      })
  );

  plan.addEpic(epic1);

  // ═══════════════════════════════════════════════════════════════════════════
  // EPIC 2: BACKEND DEVELOPMENT
  // ═══════════════════════════════════════════════════════════════════════════

  const epic2 = ctx.createEpic('backend', 'Backend Development', {
    description: 'Build the Express REST API server with authentication and database',
    deps: ['foundation']
  });

  // Task 2.1: Express server setup
  epic2.addTask(
    ctx.createTask('express-setup', 'Express Server Setup')
      .skill('rest-api-design')
      .prompt(`
Initialize Express server with essential middleware:

1. Install dependencies in packages/backend:
   - express, @types/express
   - cors, @types/cors
   - helmet, morgan, dotenv

2. Create packages/backend/src/index.ts:
   - Express app initialization
   - Middleware: cors, helmet, morgan, express.json()
   - Health endpoint: GET /health
   - Error handling middleware
   - Server listening on PORT from env (default 3000)

3. Create packages/backend/.env.example:
   - PORT=3000
   - DATABASE_URL=postgresql://...
   - JWT_SECRET=change-me-in-production

4. Add scripts to package.json:
   - dev: tsx watch src/index.ts
   - build: tsc
   - start: node dist/index.js

Requirements:
- TypeScript strict mode compliance
- Proper error handling
- Request logging
- CORS configured for development
      `)
      .check('tsc')
      .check({
        cmd: 'grep -q "express" packages/backend/package.json'
      })
      .check({
        prompt: 'Verify Express server has health endpoint, error handling, and essential middleware'
      })
  );

  // Task 2.2: Authentication module (runs in parallel with 2.3)
  epic2.addTask(
    ctx.createTask('auth-module', 'Authentication Module')
      .deps(['express-setup'])
      .skill('auth-jwt')
      .prompt(`
Implement JWT authentication system:

1. Install dependencies:
   - jsonwebtoken, @types/jsonwebtoken
   - bcrypt, @types/bcrypt

2. Create packages/backend/src/auth/:
   - auth.controller.ts (register, login, refresh endpoints)
   - auth.service.ts (JWT generation, password hashing)
   - auth.middleware.ts (JWT verification middleware)
   - auth.types.ts (TypeScript types)

3. Implement features:
   - POST /api/auth/register (email, password)
   - POST /api/auth/login (email, password)
   - POST /api/auth/refresh (refresh token)
   - Middleware: requireAuth (verify JWT)

4. Security requirements:
   - bcrypt for password hashing (10+ rounds)
   - JWT with expiration (15min access, 7d refresh)
   - Validate email format
   - Password minimum 8 characters
   - Return proper HTTP status codes

5. Mount routes in src/index.ts

Do NOT implement database integration yet - use in-memory Map for now.
      `)
      .check('tsc')
      .check({
        prompt: 'Verify authentication uses bcrypt for passwords, JWT tokens have expiration, and endpoints handle validation errors'
      })
      .check({
        prompt: 'Verify auth middleware properly validates JWT tokens and returns 401 on invalid/expired tokens'
      })
  );

  // Task 2.3: CRUD API (runs in parallel with 2.2)
  epic2.addTask(
    ctx.createTask('crud-api', 'Task CRUD API')
      .deps(['express-setup'])
      .skill('rest-api-design')
      .prompt(`
Create RESTful API endpoints for task management:

1. Create packages/backend/src/api/:
   - tasks.controller.ts (route handlers)
   - tasks.service.ts (business logic)
   - tasks.types.ts (TypeScript types)
   - validation.ts (request validation)

2. Implement endpoints:
   - GET    /api/tasks         (list all tasks, with filters)
   - GET    /api/tasks/:id     (get single task)
   - POST   /api/tasks         (create task)
   - PUT    /api/tasks/:id     (update task)
   - DELETE /api/tasks/:id     (delete task)

3. Request validation:
   - Title: required, 1-200 chars
   - Description: optional, max 2000 chars
   - Status: enum validation
   - Priority: enum validation
   - Due date: valid ISO date

4. Query filters for GET /api/tasks:
   - ?status=todo
   - ?priority=high
   - ?search=keyword

5. Mount routes in src/index.ts under /api

Do NOT implement database integration yet - use in-memory array for now.
Use requireAuth middleware (from auth module) on all endpoints.
      `)
      .check('tsc')
      .check({
        prompt: 'Verify CRUD endpoints validate input, return proper status codes (200, 201, 400, 404), and handle errors'
      })
      .check({
        prompt: 'Verify task filtering works for status, priority, and search parameters'
      })
  );

  // Task 2.4: Database integration (FAN-IN: waits for both 2.2 and 2.3)
  epic2.addTask(
    ctx.createTask('db-integration', 'Database Integration')
      .deps(['auth-module', 'crud-api'])
      .skill('database-schema-design')
      .prompt(`
Integrate PostgreSQL database with Drizzle ORM:

1. Create packages/backend/src/db/:
   - client.ts (database connection pool)
   - users.repository.ts (user CRUD operations)
   - tasks.repository.ts (task CRUD operations)

2. Update auth service to use users repository:
   - Replace in-memory Map with database queries
   - findByEmail, create, update methods

3. Update tasks service to use tasks repository:
   - Replace in-memory array with database queries
   - Include user ownership (tasks belong to users)
   - Filter tasks by user_id

4. Add migration for initial data:
   - Create seed script: db:seed
   - Add sample user and tasks

5. Update .env.example with DATABASE_URL

Requirements:
- Connection pooling
- Proper error handling for DB errors
- SQL injection prevention (use parameterized queries)
- Transactions where needed (e.g., user creation)
- Close connections gracefully on shutdown

Environment:
- Use DATABASE_URL from .env
- Graceful fallback if DB unavailable
      `)
      .check('tsc')
      .check({
        prompt: 'Verify database connection uses pooling, queries are parameterized (no SQL injection), and errors are handled'
      })
      .check({
        prompt: 'Verify auth and tasks services now use database repositories instead of in-memory storage'
      })
  );

  plan.addEpic(epic2);

  // ═══════════════════════════════════════════════════════════════════════════
  // EPIC 3: FRONTEND DEVELOPMENT (Parallel with Epic 2)
  // ═══════════════════════════════════════════════════════════════════════════

  const epic3 = ctx.createEpic('frontend', 'Frontend Development', {
    description: 'Build the React user interface with Vite',
    deps: ['foundation']
  });

  // Task 3.1: Vite + React setup
  epic3.addTask(
    ctx.createTask('vite-setup', 'Vite + React Setup')
      .skill('react-components')
      .prompt(`
Initialize React application with Vite:

1. Install dependencies in packages/frontend:
   - react, react-dom
   - @types/react, @types/react-dom
   - vite, @vitejs/plugin-react
   - typescript

2. Create configuration files:
   - vite.config.ts (React plugin, port 5173)
   - index.html (entry point)
   - tsconfig.json (already exists, verify React settings)

3. Create src structure:
   - src/main.tsx (React app entry)
   - src/App.tsx (root component)
   - src/vite-env.d.ts (Vite types)

4. Add scripts to package.json:
   - dev: vite
   - build: tsc && vite build
   - preview: vite preview

5. Basic App.tsx should render:
   - "Task Management App" heading
   - Placeholder for auth and task components

Requirements:
- TypeScript strict mode
- React 18+ with new JSX transform
- Hot module replacement working
      `)
      .check('tsc')
      .check({
        cmd: 'test -f packages/frontend/vite.config.ts'
      })
      .check({
        prompt: 'Verify Vite dev server starts successfully and App.tsx renders'
      })
  );

  // Tasks 3.2.x: UI Components (parallel set)
  epic3.addTask(
    ctx.createTask('auth-ui', 'Authentication UI')
      .deps(['vite-setup'])
      .skill('react-components')
      .prompt(`
Create authentication UI components:

1. Create src/components/auth/:
   - LoginForm.tsx (email, password, submit)
   - RegisterForm.tsx (email, password, confirm password, submit)
   - AuthPage.tsx (toggle between login/register)

2. Features:
   - Form validation (client-side)
   - Loading states during submission
   - Error display
   - Success feedback

3. State management:
   - Use React hooks (useState, useEffect)
   - Form state (email, password, errors, loading)

4. Styling:
   - Clean, minimal form layout
   - Inline CSS or CSS modules
   - Responsive design

Do NOT implement API integration yet - use placeholder handlers.
Focus on UI/UX and validation.
      `)
      .check('tsc')
      .check({
        prompt: 'Verify LoginForm and RegisterForm have proper validation, loading states, and error handling UI'
      })
  );

  epic3.addTask(
    ctx.createTask('task-list-ui', 'Task List UI')
      .deps(['vite-setup'])
      .skill('react-components')
      .prompt(`
Create task list UI components:

1. Create src/components/tasks/:
   - TaskList.tsx (display list of tasks)
   - TaskItem.tsx (individual task card)
   - TaskForm.tsx (create/edit task form)
   - TaskFilters.tsx (filter by status, priority, search)

2. Features:
   - Display tasks in cards/list
   - Filter and search functionality
   - Create new task button
   - Edit/delete buttons per task
   - Status and priority badges
   - Due date display

3. State:
   - Task list state
   - Filter state
   - Form state (create/edit)

4. UI patterns:
   - Empty state ("No tasks yet")
   - Loading state
   - Task actions (edit, delete, toggle status)

Do NOT implement API integration yet - use mock data.
      `)
      .check('tsc')
      .check({
        prompt: 'Verify TaskList shows tasks, TaskFilters work with mock data, and TaskForm handles create/edit modes'
      })
  );

  epic3.addTask(
    ctx.createTask('task-detail-ui', 'Task Detail UI')
      .deps(['vite-setup'])
      .skill('react-components')
      .prompt(`
Create task detail view component:

1. Create src/components/tasks/:
   - TaskDetail.tsx (full task view)

2. Features:
   - Display all task fields (title, description, status, priority, due date)
   - Edit mode toggle
   - Delete confirmation
   - Back to list navigation

3. State:
   - Task data
   - Edit mode boolean
   - Delete confirmation modal

4. UI:
   - Clean detail layout
   - Action buttons (edit, delete, back)
   - Confirmation modal for destructive actions

Do NOT implement API integration yet - use mock data.
      `)
      .check('tsc')
      .check({
        prompt: 'Verify TaskDetail displays all fields, has edit mode, and shows delete confirmation'
      })
  );

  // Task 3.3: API Integration (FAN-IN: waits for all UI components)
  epic3.addTask(
    ctx.createTask('api-integration', 'API Integration')
      .deps(['auth-ui', 'task-list-ui', 'task-detail-ui'])
      .skill('react-components')
      .prompt(`
Integrate frontend with backend API:

1. Create src/api/:
   - client.ts (fetch wrapper with auth headers)
   - auth.api.ts (login, register, refresh)
   - tasks.api.ts (CRUD operations)
   - types.ts (TypeScript types matching backend)

2. API client features:
   - Base URL from env variable
   - JWT token storage (localStorage)
   - Automatic token refresh on 401
   - Error handling and parsing

3. Create src/hooks/:
   - useAuth.ts (login, logout, register, current user)
   - useTasks.ts (fetch, create, update, delete tasks)

4. Update components to use hooks:
   - AuthPage: call useAuth for login/register
   - TaskList: call useTasks for CRUD operations
   - Replace all mock data with API calls

5. Global state:
   - Auth context (current user, token)
   - Loading and error states

Environment:
- VITE_API_URL (default: http://localhost:3000)

Requirements:
- Handle loading states
- Display API errors to user
- Persist auth token across refreshes
- Logout on 401 errors
      `)
      .check('tsc')
      .check({
        prompt: 'Verify API client handles authentication, token refresh, and errors properly'
      })
      .check({
        prompt: 'Verify components use hooks and display loading/error states'
      })
  );

  // Task 3.4: Styling (runs in parallel with API integration)
  epic3.addTask(
    ctx.createTask('styling', 'Styling')
      .deps(['auth-ui', 'task-list-ui', 'task-detail-ui'])
      .skill('tailwind-styling')
      .prompt(`
Add comprehensive styling to the application:

1. Install Tailwind CSS:
   - tailwindcss, postcss, autoprefixer

2. Configure Tailwind:
   - tailwind.config.js
   - postcss.config.js
   - Import in src/index.css

3. Apply styling to all components:
   - Consistent color scheme (primary, secondary, success, warning, danger)
   - Typography hierarchy (headings, body, labels)
   - Spacing and layout
   - Buttons and form inputs
   - Cards and containers

4. Responsive design:
   - Mobile-first approach
   - Breakpoints for tablet and desktop
   - Responsive navigation

5. UX enhancements:
   - Hover states
   - Focus states for accessibility
   - Transitions and animations (subtle)
   - Loading spinners
   - Toast notifications for feedback

Requirements:
- Follow Tailwind best practices
- Ensure accessibility (ARIA labels, keyboard navigation)
- Consistent spacing scale
- Dark/light mode support (optional bonus)
      `)
      .check('tsc')
      .check({
        cmd: 'grep -q "tailwindcss" packages/frontend/package.json'
      })
      .check({
        prompt: 'Verify Tailwind is configured and components have consistent, responsive styling'
      })
  );

  plan.addEpic(epic3);

  // ═══════════════════════════════════════════════════════════════════════════
  // EPIC 4: INTEGRATION & TESTING
  // ═══════════════════════════════════════════════════════════════════════════

  const epic4 = ctx.createEpic('integration', 'Integration & Testing', {
    description: 'End-to-end testing, documentation, and error handling',
    deps: ['backend', 'frontend']
  });

  // Task 4.1: E2E Tests with AutoHarness
  epic4.addTask(
    ctx.createTask('e2e-tests', 'End-to-End Tests')
      .skill('playwright-testing')
      .prompt(`
Create Playwright E2E tests for critical user flows:

1. Install Playwright in root:
   - @playwright/test
   - Initialize with: npx playwright install

2. Create tests/ directory:
   - auth.spec.ts (registration, login, logout)
   - tasks.spec.ts (create, read, update, delete tasks)
   - filters.spec.ts (task filtering and search)

3. Test scenarios:
   - User registration with validation errors
   - User login with invalid credentials
   - Successful login and logout
   - Create task and verify in list
   - Edit task and verify changes
   - Delete task and verify removal
   - Filter tasks by status
   - Search tasks by keyword

4. Test setup:
   - Start backend and frontend servers
   - Reset database before tests
   - Create test user fixtures

5. Configuration:
   - playwright.config.ts
   - Base URL from environment
   - Screenshot on failure
   - Video on first retry

Requirements:
- Tests should be independent and idempotent
- Use page object pattern
- Clear assertions with meaningful error messages
      `)
      .check({
        cmd: 'test -f playwright.config.ts'
      })
      .check({
        prompt: 'Verify E2E tests cover user registration, login, task CRUD operations, and filtering'
      })
  );

  // Task 4.2: API Documentation (runs in parallel with E2E tests)
  epic4.addTask(
    ctx.createTask('api-docs', 'API Documentation')
      .skill('rest-api-design')
      .prompt(`
Generate OpenAPI specification for the REST API:

1. Install dependencies in backend:
   - swagger-jsdoc
   - swagger-ui-express
   - @types/swagger-ui-express

2. Create packages/backend/src/docs/:
   - swagger.config.ts (OpenAPI config)
   - schemas.ts (shared schemas)

3. Add JSDoc comments to all routes:
   - @swagger annotations
   - Request/response schemas
   - Status codes
   - Example requests/responses

4. Generate OpenAPI spec:
   - openapi.yaml or openapi.json
   - Serve at /api-docs endpoint

5. Document all endpoints:
   - Auth: /api/auth/* (register, login, refresh)
   - Tasks: /api/tasks/* (CRUD operations)
   - Health: /health

6. Include in spec:
   - Authentication (JWT bearer)
   - Request validation rules
   - Error response formats
   - Example values

Requirements:
- Valid OpenAPI 3.0+ spec
- Interactive Swagger UI
- Clear descriptions
- Complete schema definitions
      `)
      .check('tsc')
      .check({
        cmd: 'test -f packages/backend/openapi.yaml || test -f packages/backend/openapi.json'
      })
      .check({
        prompt: 'Verify OpenAPI spec includes all endpoints with proper schemas and authentication'
      })
  );

  // Task 4.3: Error Handling (runs in parallel with E2E tests and API docs)
  epic4.addTask(
    ctx.createTask('error-handling', 'Error Handling & Logging')
      .skill('rest-api-design')
      .prompt(`
Implement centralized error handling and structured logging:

1. Install dependencies:
   - winston (logging)
   - express-async-errors (async error handling)

2. Create packages/backend/src/utils/:
   - logger.ts (Winston logger configuration)
   - errors.ts (custom error classes)
   - error-handler.ts (Express error middleware)

3. Custom error classes:
   - ValidationError (400)
   - UnauthorizedError (401)
   - ForbiddenError (403)
   - NotFoundError (404)
   - ConflictError (409)
   - InternalError (500)

4. Error handling middleware:
   - Catch all errors
   - Log with Winston
   - Return consistent JSON format
   - Hide stack traces in production
   - Include request ID for tracing

5. Logging strategy:
   - HTTP requests (morgan + winston)
   - Application events (info, warn, error)
   - Database queries (debug level)
   - Error stack traces

6. Update all routes to use custom errors

Requirements:
- Structured JSON logs
- Log levels (debug, info, warn, error)
- Correlation IDs for request tracing
- No sensitive data in logs (passwords, tokens)
      `)
      .check('tsc')
      .check({
        prompt: 'Verify error handling middleware catches all errors and returns consistent JSON responses'
      })
      .check({
        prompt: 'Verify logging is structured and includes request correlation IDs'
      })
  );

  plan.addEpic(epic4);

  // ═══════════════════════════════════════════════════════════════════════════
  // EPIC 5: DEPLOYMENT
  // ═══════════════════════════════════════════════════════════════════════════

  const epic5 = ctx.createEpic('deployment', 'Deployment', {
    description: 'Production-ready deployment configuration',
    deps: ['integration']
  });

  // Task 5.1: Docker Configuration with Yields
  epic5.addTask(
    ctx.createTask('docker-config', 'Docker Configuration')
      .skill('docker-deployment')
      .prompt(`
Create Docker configuration for all services:

1. Create Dockerfiles:
   - packages/backend/Dockerfile (multi-stage: build + production)
   - packages/frontend/Dockerfile (multi-stage: build + nginx)

2. Backend Dockerfile:
   - Stage 1: Build (install deps, compile TypeScript)
   - Stage 2: Production (copy dist, install prod deps only)
   - Use Node 18 Alpine
   - Non-root user

3. Frontend Dockerfile:
   - Stage 1: Build (install deps, run vite build)
   - Stage 2: Production (nginx with build output)
   - Use nginx:alpine
   - Custom nginx.conf for SPA routing

4. Create docker-compose.yml:
   - Service: database (postgres:15-alpine)
   - Service: backend (build: ./packages/backend)
   - Service: frontend (build: ./packages/frontend)
   - Network configuration
   - Volume for database persistence
   - Environment variables

5. Create .dockerignore files

Requirements:
- Multi-stage builds for minimal image size
- Health checks for all services
- Restart policies
- Proper environment variable handling
      `)
      .check({
        cmd: 'docker compose config'
      })
      .check({
        prompt: 'Verify Dockerfiles use multi-stage builds and docker-compose.yml defines all services'
      })
  );

  // Task 5.2: Environment Configuration
  epic5.addTask(
    ctx.createTask('env-config', 'Environment Configuration')
      .deps(['docker-config'])
      .prompt(`
Setup production environment configuration:

1. Create .env.example files:
   - Root .env.example
   - packages/backend/.env.example
   - packages/frontend/.env.example

2. Backend environment variables:
   - NODE_ENV=production
   - PORT=3000
   - DATABASE_URL=postgresql://...
   - JWT_SECRET=<generate-secure-secret>
   - JWT_EXPIRY=15m
   - REFRESH_TOKEN_EXPIRY=7d
   - CORS_ORIGIN=https://yourdomain.com

3. Frontend environment variables:
   - VITE_API_URL=https://api.yourdomain.com

4. Create env.validation.ts:
   - Validate required env vars on startup
   - Type-safe env access
   - Clear error messages for missing vars

5. Security checklist in ENV_SECURITY.md:
   - Never commit .env files
   - Use secrets management in production
   - Rotate JWT secrets regularly
   - Use strong DATABASE_URL passwords

Requirements:
- All required vars documented
- Validation on app startup
- Type-safe environment access
      `)
      .check({
        cmd: 'test -f packages/backend/.env.example && test -f packages/frontend/.env.example'
      })
      .check({
        prompt: 'Verify environment validation checks for required variables on startup'
      })
  );

  // Task 5.3: Deployment Scripts
  epic5.addTask(
    ctx.createTask('deployment-scripts', 'Deployment Scripts')
      .deps(['env-config'])
      .skill('docker-deployment')
      .prompt(`
Create deployment automation and CI/CD configuration:

1. Create scripts/ directory:
   - deploy.sh (deployment script)
   - health-check.sh (verify deployment)
   - rollback.sh (rollback on failure)

2. Create .github/workflows/:
   - ci.yml (run tests on PRs)
   - deploy.yml (deploy on main branch)

3. CI workflow:
   - Install dependencies
   - Run TypeScript checks
   - Run unit tests (if any)
   - Run E2E tests
   - Build frontend and backend

4. Deploy workflow:
   - Build Docker images
   - Push to registry
   - Deploy to server
   - Run health checks
   - Rollback on failure

5. Create DEPLOYMENT.md:
   - Prerequisites (Docker, Node.js)
   - Local deployment (docker-compose up)
   - Production deployment steps
   - Environment variables setup
   - Troubleshooting guide

Requirements:
- Scripts are idempotent
- Proper error handling
- Rollback capability
- Clear documentation
      `)
      .check({
        cmd: 'test -f scripts/deploy.sh && test -f DEPLOYMENT.md'
      })
      .check({
        prompt: 'Verify deployment scripts include health checks and rollback capability'
      })
  );

  plan.addEpic(epic5);

  return plan.build();
}
