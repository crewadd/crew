# CI/CD Integration

**Run Crew projects in CI pipelines and automate deployment workflows.**

[[docs](../README.md) > [guides](./README.md) > ci-cd-integration]

---

## Overview

Crew integrates seamlessly with CI/CD systems like GitHub Actions, GitLab CI, Jenkins, and others:

1. **Deterministic execution** - Same results locally and in CI
2. **Resumable pipelines** - Interrupted builds can resume
3. **Event streaming** - Monitor progress in real-time
4. **Status reporting** - Publish results to GitHub, Slack, etc.
5. **Artifact preservation** - Save all generated code

---

## GitHub Actions

### Basic Workflow

```yaml
# .github/workflows/crew.yml
name: Crew Build

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install Crew
        run: npm install crew

      - name: Initialize Plan
        run: npx crew plan init

      - name: Run Crew
        run: npx crew run --loop

      - name: Upload Results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: crew-artifacts
          path: .crew/
```

### With Status Checks

```yaml
name: Crew with Status

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install
        run: npm install

      - name: Run Crew
        run: npx crew run --loop --json > crew-output.json
        continue-on-error: true

      - name: Check Results
        run: |
          FAILED=$(jq '.failed | length' crew-output.json)
          if [ $FAILED -gt 0 ]; then
            echo "Crew build failed"
            exit 1
          fi

      - name: Publish Results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: crew-results
          path: |
            crew-output.json
            .crew/state.json
```

### with Slack Notifications

```yaml
name: Crew with Notifications

on: [push]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install and Run
        run: |
          npm install
          npx crew run --loop --json > crew-output.json
        continue-on-error: true

      - name: Send Slack Notification
        uses: slackapi/slack-github-action@v1
        with:
          webhook-url: ${{ secrets.SLACK_WEBHOOK }}
          payload: |
            text: "Crew build completed"
            blocks:
              - type: section
                text:
                  type: mrkdwn
                  text: |
                    *Crew Build Results*
                    Status: ${{ job.status }}
                    Ref: ${{ github.ref }}
```

---

## GitLab CI

### Basic Pipeline

```yaml
# .gitlab-ci.yml
image: node:18

stages:
  - build
  - test
  - deploy

crew:build:
  stage: build
  script:
    - npm install
    - npx crew plan init
    - npx crew run --loop
  artifacts:
    paths:
      - .crew/
      - dist/
    expire_in: 1 week
  cache:
    paths:
      - node_modules/

crew:verify:
  stage: test
  script:
    - npm install
    - npx crew verify
  dependencies:
    - crew:build
```

---

## Jenkins

### Jenkinsfile

```groovy
pipeline {
  agent any

  environment {
    NODE_ENV = 'production'
  }

  stages {
    stage('Install') {
      steps {
        sh 'npm install'
      }
    }

    stage('Plan') {
      steps {
        sh 'npx crew plan init'
      }
    }

    stage('Build') {
      steps {
        script {
          def exitCode = sh(script: 'npx crew run --loop', returnStatus: true)
          if (exitCode != 0) {
            unstable('Crew failed')
          }
        }
      }
    }

    stage('Verify') {
      steps {
        sh 'npx crew verify'
      }
    }

    stage('Deploy') {
      when {
        branch 'main'
      }
      steps {
        sh 'npm run deploy'
      }
    }
  }

  post {
    always {
      archiveArtifacts artifacts: '.crew/**', allowEmptyArchive: true
      junit 'test-results.xml'
    }
    failure {
      emailext(
        subject: 'Crew build failed',
        body: 'Check build logs'
      )
    }
  }
}
```

---

## Environment-Specific Builds

### Development

```bash
#!/bin/bash
NODE_ENV=development npx crew run
```

### Staging

```bash
#!/bin/bash
NODE_ENV=staging \
DEPLOY_TO=staging \
npx crew run
```

### Production

```bash
#!/bin/bash
NODE_ENV=production \
DEPLOY_TO=production \
npx crew run
```

### In Plan

```typescript
export async function createPlan(ctx) {
  const env = process.env.NODE_ENV || 'development';

  plan.addEpic(
    ctx.createEpic('build', 'Build')
      .addTask(
        ctx.createTask('build', 'Build')
          .prompt('Build application')
          .check({ cmd: 'npm run build' })
      )
  );

  if (env === 'production') {
    plan.addEpic(
      ctx.createEpic('deploy', 'Deploy')
        .addTask(
          ctx.createTask('deploy', 'Deploy to Production')
            .prompt('Deploy to production')
            .check({ cmd: 'npm run deploy:prod' })
        )
    );
  }

  return plan.build();
}
```

---

## Artifact Management

### Save Generated Code

```yaml
# GitHub Actions
- name: Upload Generated Code
  uses: actions/upload-artifact@v3
  with:
    name: generated-code
    path: |
      dist/
      build/
      src/
```

### Publish to Registry

```typescript
export async function createPlan(ctx) {
  plan.addEpic(
    ctx.createEpic('publish', 'Publish')
      .addTask(
        ctx.createTask('npm-publish', 'Publish to npm')
          .when(process.env.CI === 'true' && process.env.BRANCH === 'main')
          .prompt('Publish package to npm registry')
          .check({ cmd: 'npm publish --dry-run' })
      )
  );
}
```

---

## Caching Strategies

### Node Modules Cache

```yaml
# GitHub Actions
- name: Cache Dependencies
  uses: actions/cache@v3
  with:
    path: node_modules
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-node-
```

### Crew State Cache

```yaml
- name: Cache Crew State
  uses: actions/cache@v3
  with:
    path: .crew/
    key: ${{ runner.os }}-crew-${{ github.run_number }}
    restore-keys: |
      ${{ runner.os }}-crew-
```

---

## Matrix Builds

### Test Multiple Configurations

```yaml
strategy:
  matrix:
    node-version: [16, 18, 20]
    os: [ubuntu-latest, macos-latest, windows-latest]

runs-on: ${{ matrix.os }}

steps:
  - uses: actions/setup-node@v3
    with:
      node-version: ${{ matrix.node-version }}
  - run: npx crew run --loop
```

---

## Monitoring and Alerts

### Parse Crew Output

```bash
#!/bin/bash
npx crew run --json > crew-results.json

# Check for failures
FAILURES=$(jq '.failed | length' crew-results.json)
if [ $FAILURES -gt 0 ]; then
  echo "FAILED: $FAILURES tasks failed"
  exit 1
fi

# Extract metrics
TASKS_COMPLETED=$(jq '.completed | length' crew-results.json)
DURATION=$(jq '.duration' crew-results.json)
echo "Completed $TASKS_COMPLETED tasks in ${DURATION}ms"
```

### Send to Monitoring Service

```bash
#!/bin/bash
npx crew run --json > crew-results.json

curl -X POST https://monitoring.company.com/crew \
  -H "Authorization: Bearer $MONITORING_TOKEN" \
  -H "Content-Type: application/json" \
  -d @crew-results.json
```

---

## Retry Logic

### Automatic Retries

```yaml
- name: Run Crew
  run: npx crew run --loop
  continue-on-error: true

- name: Retry
  if: failure()
  run: npx crew run --loop
```

### Smart Retries

```bash
#!/bin/bash
RETRY_COUNT=0
MAX_RETRIES=3

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  npx crew run --loop && exit 0
  RETRY_COUNT=$((RETRY_COUNT + 1))
  echo "Retry $RETRY_COUNT/$MAX_RETRIES"
  sleep 10
done

exit 1
```

---

## Secrets Management

### GitHub Secrets

```yaml
steps:
  - name: Run Build
    env:
      API_KEY: ${{ secrets.API_KEY }}
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
      DEPLOYMENT_KEY: ${{ secrets.DEPLOYMENT_KEY }}
    run: npx crew run --loop
```

### Vault Integration

```bash
#!/bin/bash
# Fetch secrets from HashiCorp Vault
vault kv get -format=json secret/crew-ci | jq '.data.data' > .env

npx crew run --loop
```

---

## Real-World Example: Full CI/CD Pipeline

```yaml
# .github/workflows/full-pipeline.yml
name: Full Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: '18'

jobs:
  build:
    name: Build with Crew
    runs-on: ubuntu-latest
    outputs:
      status: ${{ job.status }}
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install
        run: npm ci

      - name: Initialize Plan
        run: npx crew plan init

      - name: Run Crew
        run: npx crew run --loop --json > crew-output.json
        continue-on-error: true

      - name: Check Results
        run: |
          FAILED=$(jq '.failed // [] | length' crew-output.json)
          if [ $FAILED -gt 0 ]; then
            echo "Build failed with $FAILED failures"
            exit 1
          fi

      - name: Save Artifacts
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: build-artifacts
          path: |
            dist/
            build/
            .crew/

      - name: Save Test Results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: test-results
          path: crew-output.json

  deploy:
    name: Deploy
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    steps:
      - uses: actions/checkout@v3

      - name: Download Artifacts
        uses: actions/download-artifact@v3
        with:
          name: build-artifacts

      - name: Deploy to Production
        env:
          DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}
          DEPLOY_TARGET: production
        run: npm run deploy

      - name: Notify Success
        uses: slackapi/slack-github-action@v1
        with:
          webhook-url: ${{ secrets.SLACK_WEBHOOK }}
          payload: |
            text: "Deployment successful"
```

---

## Best Practices

### 1. Use Exit Codes

```bash
npx crew run && echo "Success" || echo "Failed"
```

### 2. Save State for Debugging

```yaml
- uses: actions/upload-artifact@v3
  if: always()
  with:
    name: debug-info
    path: |
      .crew/progress.jsonl
      .crew/state.json
```

### 3. Use Matrix for Coverage

```yaml
strategy:
  matrix:
    os: [ubuntu, macos, windows]
    node: [16, 18, 20]
```

### 4. Cache Aggressively

```yaml
- uses: actions/cache@v3
  with:
    path: |
      node_modules/
      .crew/
    key: ${{ hashFiles('package-lock.json') }}
```

---

## Troubleshooting

### Pipeline Timeout

Increase timeout:

```yaml
timeout-minutes: 60
```

### State File Corruption

Clear state and retry:

```bash
rm -rf .crew/state.json .crew/progress.jsonl
npx crew run --loop
```

---

## See Also

- [Debugging Tasks](./debugging-tasks.md) - Debug in CI
- [Parallel Execution](./parallel-execution.md) - Optimize pipeline speed
- [CLI Commands](../cli/commands.md) - All CLI options

---

[← Back to Guides](./README.md) | [Documentation Home](../README.md)
