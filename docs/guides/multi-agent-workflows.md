# Multi-Agent Workflows

**Orchestrate multiple AI agents, personas, and specialized skills in coordinated workflows.**

[[docs](../README.md) > [guides](./README.md) > multi-agent-workflows]

---

## Overview

Crew supports multi-agent orchestration through:

1. **Agent selection** - Route tasks to specific agents/personas
2. **Skill assignment** - Provide domain expertise to agents
3. **Agent personas** - Load pre-defined agent profiles from files
4. **Coordination** - Tasks can hand off to different agents
5. **Verification** - Cross-agent quality gates

---

## Basic Agent Assignment

### Using `.skill()` for Agent Routing

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Multi-Agent Project');

  plan.addEpic(
    ctx.createEpic('setup', 'Setup')
      // Route to backend specialist
      .addTask(
        ctx.createTask('api', 'Build API')
          .skill('backend/rest-api')  // Use backend agent
          .prompt('Create REST API with authentication')
          .check({ cmd: 'npm test' })
      )
      // Route to frontend specialist
      .addTask(
        ctx.createTask('ui', 'Build UI')
          .skill('frontend/react')  // Use frontend agent
          .prompt('Create responsive React components')
          .check({ cmd: 'npm test' })
      )
      // Route to data specialist
      .addTask(
        ctx.createTask('db', 'Setup Database')
          .skill('data/postgres')  // Use data agent
          .prompt('Design and create PostgreSQL schema')
          .check({ cmd: 'psql -c "\\dt"' })
      )
  );

  return plan.build();
}
```

### Using Agent Personas

Crew can load agent profiles from `.claude/agents/`:

```bash
# Create agent persona files
mkdir -p .claude/agents

# Backend agent
cat > .claude/agents/backend.md << 'EOF'
# Backend Engineer

You are an expert backend engineer specializing in:
- Node.js and TypeScript
- REST APIs and authentication
- Database design
- DevOps and deployment

Always prioritize:
1. Security (validation, auth, rate limiting)
2. Performance (caching, indexing)
3. Scalability (stateless design)
4. Error handling (meaningful messages)
EOF

# Frontend agent
cat > .claude/agents/frontend.md << 'EOF'
# Frontend Engineer

You are an expert frontend engineer specializing in:
- React and TypeScript
- Responsive design
- Accessibility (a11y)
- Performance optimization

Always prioritize:
1. User experience
2. Accessibility compliance
3. Mobile responsiveness
4. Performance (bundle size, render time)
EOF
```

Then reference in plan:

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Team Project');

  plan.addEpic(
    ctx.createEpic('project', 'Project')
      .addTask(
        ctx.createTask('api', 'Build API')
          .skill('backend')  // Loads .claude/agents/backend.md
          .prompt('Create authentication endpoints')
          .check({ cmd: 'npm test' })
      )
      .addTask(
        ctx.createTask('ui', 'Build UI')
          .skill('frontend')  // Loads .claude/agents/frontend.md
          .prompt('Create login form')
          .check({ cmd: 'npm test' })
      )
  );

  return plan.build();
}
```

---

## Specialized Skill Stacks

### Technology-Specific Agents

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Full Stack with Specialists');

  plan.addEpic(
    ctx.createEpic('backend', 'Backend Development')
      .addTask(
        ctx.createTask('auth', 'Build Auth Module')
          .skill('backend/security')
          .prompt('Implement OAuth2 with refresh tokens')
          .check({ cmd: 'npm test -- auth' })
      )
      .addTask(
        ctx.createTask('api', 'Build API')
          .skill('backend/rest')
          .prompt('Create REST endpoints')
          .check({ cmd: 'npm test -- api' })
      )
  );

  plan.addEpic(
    ctx.createEpic('frontend', 'Frontend Development')
      .addTask(
        ctx.createTask('components', 'Build Components')
          .skill('frontend/react')
          .prompt('Create reusable components')
          .check({ cmd: 'npm test -- components' })
      )
      .addTask(
        ctx.createTask('styling', 'Add Styling')
          .skill('frontend/css')
          .prompt('Add responsive CSS')
          .check({ cmd: 'npm run build' })
      )
  );

  plan.addEpic(
    ctx.createEpic('devops', 'DevOps & Infrastructure')
      .addTask(
        ctx.createTask('docker', 'Containerize')
          .skill('devops/docker')
          .prompt('Create Docker configuration')
          .check({ cmd: 'docker build .' })
      )
      .addTask(
        ctx.createTask('ci-cd', 'Setup CI/CD')
          .skill('devops/github-actions')
          .prompt('Create GitHub Actions workflow')
          .check({ cmd: 'test -f .github/workflows/ci.yml' })
      )
  );

  return plan.build();
}
```

---

## Agent Handoff Patterns

### Sequential Handoff

One agent completes work, then hands off to another:

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Sequential Handoff');

  plan.addEpic(
    ctx.createEpic('workflow', 'Workflow')
      // Step 1: Backend builds API
      .addTask(
        ctx.createTask('api', 'Build API')
          .skill('backend')
          .prompt('Create REST API')
          .check({ cmd: 'npm test' })
      )
      // Step 2: Frontend builds client to consume API
      .addTask(
        ctx.createTask('client', 'Build Client')
          .skill('frontend')
          .deps(['api'])  // Wait for API
          .prompt('Create client that consumes the API')
          .check({ cmd: 'npm test' })
      )
      // Step 3: QA tests the integration
      .addTask(
        ctx.createTask('qa', 'Integration Testing')
          .skill('qa/testing')
          .deps(['client'])
          .prompt('Test API and client together')
          .check({ cmd: 'npm run test:e2e' })
      )
  );

  return plan.build();
}
```

### Parallel Independent Work

Multiple agents work simultaneously:

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Parallel Teams');

  plan.addEpic(
    ctx.createEpic('init', 'Project Init')
      .addTask(
        ctx.createTask('setup', 'Setup Project')
          .skill('devops')
          .prompt('Create project structure')
          .check({ cmd: 'test -d src' })
      )
  );

  // Backend team: independent
  plan.addEpic(
    ctx.createEpic('backend', 'Backend')
      .addTask(
        ctx.createTask('db', 'Database Schema')
          .skill('backend/database')
          .prompt('Design database')
          .check({ cmd: 'test -f schema.sql' })
      )
      .addTask(
        ctx.createTask('api', 'API Layer')
          .skill('backend/rest')
          .deps(['db'])
          .prompt('Build API')
          .check({ cmd: 'npm test' })
      )
  );

  // Frontend team: independent
  plan.addEpic(
    ctx.createEpic('frontend', 'Frontend')
      .addTask(
        ctx.createTask('ui', 'UI Components')
          .skill('frontend/react')
          .prompt('Build components')
          .check({ cmd: 'npm test' })
      )
      .addTask(
        ctx.createTask('styling', 'Styling')
          .skill('frontend/css')
          .deps(['ui'])
          .prompt('Add styles')
          .check({ cmd: 'npm run build' })
      )
  );

  // Integration: only after both teams finish
  plan.addEpic(
    ctx.createEpic('integration', 'Integration')
      .addTask(
        ctx.createTask('connect', 'Connect Frontend to Backend')
          .skill('frontend')
          .deps(['api', 'styling'])
          .prompt('Connect UI to API')
          .check({ cmd: 'npm run test:e2e' })
      )
  );

  return plan.build();
}
```

---

## Specialized Reviewers

### Code Review Agents

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Review Pipeline');

  plan.addEpic(
    ctx.createEpic('code', 'Implementation')
      .addTask(
        ctx.createTask('implement', 'Write Feature')
          .skill('backend')
          .prompt('Implement authentication')
          .check({ cmd: 'npm test' })
      )
  );

  plan.addEpic(
    ctx.createEpic('review', 'Code Review')
      .addTask(
        ctx.createTask('security-review', 'Security Review')
          .skill('security')  // Security specialist
          .deps(['implement'])
          .prompt('Review for security vulnerabilities')
          .check({ prompt: 'Security review passed?' })
      )
      .addTask(
        ctx.createTask('perf-review', 'Performance Review')
          .skill('performance')  // Performance specialist
          .deps(['implement'])
          .prompt('Review for performance issues')
          .check({ prompt: 'Performance is acceptable?' })
      )
      .addTask(
        ctx.createTask('style-review', 'Code Style Review')
          .skill('code-quality')  // Style specialist
          .deps(['implement'])
          .prompt('Review code style and patterns')
          .check({ cmd: 'npm run lint' })
      )
  );

  return plan.build();
}
```

---

## Context Sharing Between Agents

### Using Task Outputs

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Context Sharing');

  plan.addEpic(
    ctx.createEpic('workflow', 'Workflow')
      // Agent 1 produces output
      .addTask(
        ctx.createTask('design', 'Design API')
          .skill('architect')
          .outputs(['api-schema.json'])
          .prompt('Create API schema')
          .check({ cmd: 'test -f api-schema.json' })
      )
      // Agent 2 consumes output from Agent 1
      .addTask(
        ctx.createTask('implement', 'Implement API')
          .skill('backend')
          .inputs(['api-schema.json'])  // Reads output from previous task
          .deps(['design'])
          .prompt('Implement the API defined in api-schema.json')
          .check({ cmd: 'npm test' })
      )
      // Agent 3 consumes from Agent 2
      .addTask(
        ctx.createTask('test', 'Test API')
          .skill('qa')
          .inputs(['api-schema.json'])
          .deps(['implement'])
          .prompt('Test the implemented API against the schema')
          .check({ cmd: 'npm run test:api' })
      )
  );

  return plan.build();
}
```

### Using Task State

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Shared State');

  plan.addEpic(
    ctx.createEpic('pipeline', 'Pipeline')
      .addTask(
        ctx.createTask('analyze', 'Analyze Requirements')
          .skill('architect')
          .prompt('Analyze requirements and store decisions')
          .onComplete(async (taskCtx, result) => {
            // Store analysis for downstream agents
            taskCtx.state.set('architecture-decisions', {
              tech: ['Node.js', 'React', 'PostgreSQL'],
              patterns: ['MVC', 'REST'],
              requirements: ['authentication', 'real-time-updates']
            });
          })
          .check({ prompt: 'Analysis complete?' })
      )
      .addTask(
        ctx.createTask('implement', 'Implement')
          .skill('backend')
          .prompt('Implement based on architecture analysis')
          .shouldStart(async (taskCtx) => {
            // Access shared state
            const decisions = taskCtx.state.get('architecture-decisions');
            console.log('Using architecture:', decisions);
            return true;
          })
          .check({ cmd: 'npm test' })
      )
  );

  return plan.build();
}
```

---

## Domain-Specific Agents

### By Technology

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Tech-Specific Agents');

  plan.addEpic(
    ctx.createEpic('backend', 'Backend')
      .addTask(
        ctx.createTask('nodejs', 'Node.js API')
          .skill('backend/nodejs')
          .prompt('Build Node.js server')
      )
  );

  plan.addEpic(
    ctx.createEpic('frontend', 'Frontend')
      .addTask(
        ctx.createTask('react', 'React App')
          .skill('frontend/react')
          .prompt('Build React application')
      )
  );

  plan.addEpic(
    ctx.createEpic('data', 'Data')
      .addTask(
        ctx.createTask('db', 'Database')
          .skill('data/sql')
          .prompt('Design SQL database')
      )
  );

  return plan.build();
}
```

### By Domain

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Domain-Specific Teams');

  plan.addEpic(
    ctx.createEpic('auth', 'Authentication')
      .addTask(
        ctx.createTask('oauth', 'OAuth Setup')
          .skill('domain/auth')
          .prompt('Implement OAuth2')
      )
  );

  plan.addEpic(
    ctx.createEpic('payments', 'Payments')
      .addTask(
        ctx.createTask('stripe', 'Stripe Integration')
          .skill('domain/payments')
          .prompt('Integrate Stripe')
      )
  );

  plan.addEpic(
    ctx.createEpic('notifications', 'Notifications')
      .addTask(
        ctx.createTask('email', 'Email Service')
          .skill('domain/notifications/email')
          .prompt('Setup email notifications')
      )
  );

  return plan.build();
}
```

---

## Coordination Patterns

### Producer-Consumer

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Producer-Consumer');

  // Producer: generates data/code
  plan.addEpic(
    ctx.createEpic('producer', 'Producer')
      .addTask(
        ctx.createTask('generate', 'Generate Data')
          .skill('data-generation')
          .outputs(['data.json'])
          .prompt('Generate test data')
      )
  );

  // Consumer 1: uses produced data
  plan.addEpic(
    ctx.createEpic('consumer1', 'Consumer 1')
      .addTask(
        ctx.createTask('process', 'Process Data')
          .skill('backend/processing')
          .inputs(['data.json'])
          .deps(['generate'])
          .prompt('Process the generated data')
      )
  );

  // Consumer 2: also uses produced data
  plan.addEpic(
    ctx.createEpic('consumer2', 'Consumer 2')
      .addTask(
        ctx.createTask('visualize', 'Visualize Data')
          .skill('frontend/visualization')
          .inputs(['data.json'])
          .deps(['generate'])
          .prompt('Create visualizations')
      )
  );

  return plan.build();
}
```

### Pipeline with Specialization

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Specialized Pipeline');

  plan.addEpic(
    ctx.createEpic('stage1', 'Stage 1: Extraction')
      .addTask(
        ctx.createTask('extract', 'Extract Data')
          .skill('data/extraction')
          .outputs(['raw-data.json'])
          .prompt('Extract data from source')
      )
  );

  plan.addEpic(
    ctx.createEpic('stage2', 'Stage 2: Transformation')
      .addTask(
        ctx.createTask('transform', 'Transform Data')
          .skill('data/transformation')
          .inputs(['raw-data.json'])
          .outputs(['transformed-data.json'])
          .deps(['extract'])
          .prompt('Clean and transform data')
      )
  );

  plan.addEpic(
    ctx.createEpic('stage3', 'Stage 3: Loading')
      .addTask(
        ctx.createTask('load', 'Load Data')
          .skill('data/loading')
          .inputs(['transformed-data.json'])
          .deps(['transform'])
          .prompt('Load data into database')
      )
  );

  return plan.build();
}
```

---

## Real-World Example: Startup MVP

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Startup MVP');

  // Phase 1: Architecture & Planning
  plan.addEpic(
    ctx.createEpic('planning', 'Planning')
      .addTask(
        ctx.createTask('spec', 'Write Specification')
          .skill('product')
          .prompt('Write PRD for MVP')
      )
      .addTask(
        ctx.createTask('arch', 'Architecture Design')
          .skill('architect')
          .deps(['spec'])
          .prompt('Design system architecture')
      )
  );

  // Phase 2: Backend Development
  plan.addEpic(
    ctx.createEpic('backend', 'Backend Development')
      .addTask(
        ctx.createTask('db-schema', 'Design Database')
          .skill('backend/database')
          .deps(['arch'])
          .outputs(['schema.sql'])
          .prompt('Design database schema')
      )
      .addTask(
        ctx.createTask('auth', 'Authentication')
          .skill('backend/security')
          .deps(['db-schema'])
          .prompt('Implement user authentication')
      )
      .addTask(
        ctx.createTask('api', 'REST API')
          .skill('backend/rest')
          .deps(['auth'])
          .prompt('Build REST API endpoints')
      )
  );

  // Phase 3: Frontend Development (parallel with backend)
  plan.addEpic(
    ctx.createEpic('frontend', 'Frontend Development')
      .addTask(
        ctx.createTask('components', 'Core Components')
          .skill('frontend/react')
          .deps(['arch'])
          .prompt('Build reusable components')
      )
      .addTask(
        ctx.createTask('pages', 'Pages & Views')
          .skill('frontend/react')
          .deps(['components'])
          .prompt('Build page components')
      )
  );

  // Phase 4: Integration
  plan.addEpic(
    ctx.createEpic('integration', 'Integration & Deployment')
      .addTask(
        ctx.createTask('connect', 'Connect Frontend to Backend')
          .skill('frontend')
          .deps(['api', 'pages'])
          .prompt('Connect UI to API')
      )
      .addTask(
        ctx.createTask('testing', 'E2E Testing')
          .skill('qa')
          .deps(['connect'])
          .prompt('Test user workflows end-to-end')
      )
      .addTask(
        ctx.createTask('deploy', 'Deploy MVP')
          .skill('devops')
          .deps(['testing'])
          .prompt('Deploy to production')
      )
  );

  return plan.build();
}
```

---

## Best Practices

### 1. Clear Skill Naming

```typescript
// Good: Specific, searchable
.skill('backend/rest-api')
.skill('frontend/react-components')
.skill('qa/e2e-testing')

// Bad: Too vague
.skill('coding')
.skill('testing')
.skill('implementation')
```

### 2. Document Agent Capabilities

Each agent file should clearly state capabilities:

```markdown
# Backend Engineer

## Specialties
- REST API design
- Database optimization
- Authentication & security
- Performance tuning

## Tech Stack
- Node.js / TypeScript
- PostgreSQL / Redis
- Docker / Kubernetes

## Constraints
- Don't make UI decisions
- Don't handle complex ML
```

### 3. Use Dependencies for Handoffs

```typescript
// Good: Clear handoff
.addTask(ctx.createTask('design', 'Design').skill('designer'))
.addTask(ctx.createTask('implement', 'Implement')
  .skill('developer')
  .deps(['design'])
)

// Bad: No clear dependency
.addTask(ctx.createTask('design', 'Design').skill('designer'))
.addTask(ctx.createTask('implement', 'Implement').skill('developer'))
```

### 4. Leverage Parallel Independent Work

```typescript
// Good: Teams work in parallel
plan.addEpic(ctx.createEpic('backend', 'Backend')
  .addTask(...).skill('backend')
);
plan.addEpic(ctx.createEpic('frontend', 'Frontend')
  .addTask(...).skill('frontend')
);

// Bad: Sequential despite independent work
.addTask(ctx.createTask('backend', 'Backend').skill('backend'))
.addTask(ctx.createTask('frontend', 'Frontend')
  .deps(['backend'])  // Unnecessary dependency
  .skill('frontend')
)
```

---

## See Also

- [Parallel Execution](./parallel-execution.md) - Scheduling independent agents
- [Conditional Tasks](./conditional-tasks.md) - Route to agents based on conditions
- [Agent Configuration](../advanced/agent-configuration.md) - Agent setup and provisioning

---

[← Back to Guides](./README.md) | [Documentation Home](../README.md)
