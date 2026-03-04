# crew — Agent Driven Development (ADD) Framework

**Humans run the commands. AI agents do the work.**

crew is an orchestration framework for AI agents (Codex, Claude, etc.). It provides the structure; agents provide the labor. You don't write code—you run `plan` and `execute`, and agents handle everything: planning, coding, testing, fixing.

---

## What is Agent Driven Development?

Traditional development: You write code, run it, debug it.

Agent Driven Development: You describe the goal, and AI agents:
- Plan the approach
- Write the code
- Run the tests
- Fix the errors
- Verify the results

**Your job:** Run two commands.  
**Their job:** Everything else.

---

## The Framework's Role

Think of crew as a **workflow engine for agents**. It doesn't do the work—it directs who does what, when, and in what order.

```
┌─────────────────────────────────────────────────────────────┐
│                      YOU (Human)                            │
│                         │                                   │
│                    run: crew plan                        │
│                    run: crew execute                     │
│                         │                                   │
└─────────────────────────┼───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    crew (Framework)                      │
│                         │                                   │
│    ┌────────────────────┼────────────────────┐              │
│    ▼                    ▼                    ▼              │
│ ┌─────────┐      ┌──────────┐      ┌──────────────┐         │
│ │  Plan   │─────▶│ Schedule │─────▶│   Delegate   │         │
│ │  Agent  │      │  Tasks   │      │   to Agents  │         │
│ └─────────┘      └──────────┘      └──────────────┘         │
│                                           │                 │
└───────────────────────────────────────────┼─────────────────┘
                                            ▼
┌─────────────────────────────────────────────────────────────┐
│              AI AGENTS (Codex, Claude, etc.)                │
│                                                             │
│   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │
│   │  Plan   │  │  Code   │  │  Test   │  │   Fix   │       │
│   │  Agent  │  │  Agent  │  │  Agent  │  │  Agent  │       │
│   └─────────┘  └─────────┘  └─────────┘  └─────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

The framework provides:
- **Structure** — milestones, tasks, dependencies
- **Lifecycle hooks** — when to start, what to do, when to finish
- **Quality gates** — automatic verification
- **Persistence** — resume after interruption

The agents provide:
- **All the actual work** — every line of code, every test, every fix

---

## How It Works

### Step 1: Plan

You run: `crew plan`

What happens:
1. A **Planning Agent** reads your project
2. It decides what milestones are needed
3. It breaks milestones into tasks
4. It writes a plan to COMPOUND.md

You can review the plan, but you didn't write it—the agent did.

### Step 2: Execute

You run: `crew execute`

What happens:
1. For each milestone, the framework identifies ready tasks
2. **Coding Agents** write code
3. **Testing Agents** run verification
4. If something fails, **Fix Agents** repair it
5. The loop continues until everything passes

You watch the progress. Agents do the work.

---

## Project Lifecycle

The framework structures work into nested levels, each with its own hooks for customization:

```
PROJECT
│
├── CREW INIT
│   └── Hook: onInitCrew
│       (Setup crew context, validate environment)
│
├── PLAN
│   └── Hook: onInitPlan
│       (Planning agent creates milestones and tasks)
│
└── MILESTONE LOOP (for each milestone)
    │
    ├── Milestone Hook: onStart
    │   (Prepare milestone context)
    │
    ├── TASK LOOP (for each task)
    │   │
    │   ├── Task Hook: shouldStart
    │   │   (Check conditions before running)
    │   │
    │   ├── Task Hook: onStart
    │   │   (Prepare task context)
    │   │
    │   ├── AGENT EXECUTION
    │   │   (Agent does the actual work)
    │   │
    │   ├── QUALITY GATES
    │   │   (Automatic verification)
    │   │
    │   ├── Task Hook: onComplete (or onFail)
    │   │   (Handle success or error)
    │   │
    │   └── Task Hook: onFail → Fix Agent
    │       (Auto-retry with fix agent if needed)
    │
    ├── Milestone Hook: onComplete
    │   (Milestone verification)
    │
    └── Milestone Hook: onFail → Fix Tasks
        (Create fix tasks if milestone fails)
```

### Level by Level

| Level | What Runs | Hook Purpose |
|-------|-----------|--------------|
| **Project** | Once per execution | Overall setup and teardown |
| **Crew Init** | After project start | Initialize crew context, load configs |
| **Plan** | After crew init | Create the full plan (milestones, tasks) |
| **Milestone** | Once per milestone | Milestone-level setup and verification |
| **Task** | Once per task | Task-level lifecycle and execution |

### Hook Execution Flow

At each level, hooks fire in order:

1. **shouldStart?** — Should this run? (skip if no)
2. **onStart** — Prepare and log
3. **Execute** — Do the work (agents here)
4. **Quality Gates** — Verify results
5. **onComplete** — Success handling
6. **onFail** — Error handling (triggers fix agents)

The framework handles the orchestration. Agents handle the execution. You control the behavior through hooks at any level.

---

## The Programmable Interface

Even though agents do the work, you control HOW they work through a programmable interface.

### Task Definition

When defining what agents should do, you specify:
- **What** — inputs to read, outputs to produce
- **Who** — which agent specialty to use
- **When** — conditions for the task to run
- **Quality gates** — how to verify the work

The agent figures out the HOW.

### Lifecycle Hooks

Control agent behavior at key moments:

| Hook | Purpose | Controlled By |
|------|---------|---------------|
| **Should Start?** | Decide if conditions are right | Framework checks, agent decides |
| **On Start** | Prepare context | Framework sets up, agent receives |
| **Execute** | Do the actual work | **Agent does everything** |
| **Quality Gates** | Verify the output | Framework runs checks |
| **On Complete** | Handle success | Framework logs, agent notified |
| **On Fail** | Handle errors | Framework retries, agent fixes |

The framework handles orchestration; the agent handles execution.

### Task Types — Agent Specialties

Different work requires different agent behaviors. Use built-in types or create your own:

| Type | Agent Behavior | Auto-Verification |
|------|----------------|-------------------|
| **Planning** | Research, analyze, document | None (produces knowledge) |
| **Coding** | Write/modify code | TypeScript check |
| **Testing** | Generate and run tests | Test pass required |
| **Verify** | Run quality checks | Build must succeed |
| **Deploy** | Ship to production | Pre-deploy checks |
| **Custom** | You define the agent behavior | You define the checks |

**Custom types** let you create specialized agent workflows:
- Security audit agents that run specific vulnerability checks
- Documentation agents with custom validation rules
- Migration agents with pre/post condition checks

When you mark a task as "coding", the framework:
1. Invokes a coding-specialized agent
2. After completion, automatically runs TypeScript check
3. If errors found, triggers a fix agent
4. Repeats until clean

You just said "this is coding work." The agents handled the rest.

---

## The Hook Chain — Agent Behaviors Stack

When a task runs, behaviors are resolved in order:

```
Specific Task Definition
        ↓ (fallback to)
    Task Type Default
        ↓ (fallback to)
    Milestone Hook
        ↓ (fallback to)
    Project Default
```

For example, "what happens when coding completes?"
- Did you specify custom completion logic? Use that.
- No? Use the "coding" type default (log file changes).
- No type default? Use milestone hook.
- Nothing there? Do nothing.

The framework provides sensible defaults. You override where specific agents need specific behaviors.

---

## What Agents Receive

Each task gives the agent a **context** containing:

- **The Task** — what to do, inputs to read, outputs to write
- **The Agent Function** — how to call for help or delegate sub-tasks
- **Tools** — file system, shell, git, verification (agents use these)
- **State** — memory that persists during this task
- **Shared Variables** — data from the whole plan

Agents don't just get a prompt—they get an environment with tools they can use to complete the work.

---

## Commands You Run

That's it. Just these:

| Command | What You Do | What Agents Do |
|---------|-------------|----------------|
| `crew init` | Run it | Scaffold a new project with crew.config.js template |
| `crew plan` | Run it | Analyze project, create milestones, write tasks to COMPOUND.md |
| `crew execute` | Run it | Execute all tasks: code, test, fix, repeat until done |
| `crew verify` | Run it | Run quality checks, report issues |
| `crew status` | Run it | Report current progress |

### Initialize a New Project

```bash
crew init ./my-new-project
```

Creates:
- Project directory structure
- `crew.config.js` — configuration template
- `.claude/agents/` — agent persona templates
- `COMPOUND.md` — initial plan (empty, ready for `plan`)

### Resume Interrupted Work

```bash
crew execute ./my-project --from=m3.2
```

Agents pick up where they left off.

---

## The Reactive Loop

After each agent completes work, the framework verifies it:

```
Agent Completes Task
        ↓
Quality Gate Check (tsc, build, tests)
        ↓
    ┌───┴───┐
   Pass   Fail
    ↓       ↓
  Done   Fix Agent Called
            ↓
         Retry
```

Agents don't just work—they work until the work is correct.

---

## State & Persistence

**COMPOUND.md** — The shared memory between you and agents:
- Agents write the plan there
- Agents update progress there
- You can read it to see what's happening
- You can edit it to adjust the plan

If execution stops, this file remembers everything. Resume anytime.

---

## Where crew Fits

### Universal Agent Orchestration

crew is a **general-purpose Agent Driven Development framework**. While it originated in the UIRip reverse-engineering pipeline, it works with any project that needs structured agent workflows:

- **Greenfield development** — Agents plan and build from scratch
- **Legacy modernization** — Agents migrate and refactor existing code
- **Enhancement workflows** — Agents improve generated or boilerplate code
- **Maintenance & upkeep** — Agents handle updates, fixes, and tech debt
- **Quality assurance** — Agents verify and fix issues automatically

### Standalone Usage

Use crew with any project that has:
- Clear milestones and deliverables
- Verifiable quality gates (build, test, type check)
- Tasks that can be delegated to AI agents

The framework is agnostic to the source of your code—generated, handwritten, or mixed. If you can describe the work and verify the results, crew can orchestrate agents to do it.

---

## Sample Plan: Web Development Project

Here's what a typical Next.js enhancement plan looks like in COMPOUND.md:

```
M0 — Foundation (0/0)
└── (empty - ready marker)

M1 — Foundation (0/1)
└── Init COMPOUND

M2 — Bootstrap & Verify (0/8)
├── Install dependencies
├── TypeScript check
├── Wire shared component state
├── TypeScript check
├── Extract repeated patterns
├── TypeScript check
├── Run tsc --noEmit and fix type errors
└── TypeScript check

M3 — Page / (0/9)
├── Analyze / page
├── Decompose /
├── TypeScript check
├── Add interactivity to /
├── TypeScript check
├── Wire GSAP for /
├── TypeScript check
├── CSS animations for /
└── TypeScript check

M4 — Verify & Fix (0/1)
└── Type-check and build verification
```

### The Milestones

| Milestone | Purpose | What Agents Do |
|-----------|---------|----------------|
| **M0** | Ready marker | Indicates planning phase complete |
| **M1** | Foundation | Planning agent initializes project tracking |
| **M2** | Bootstrap & Verify | Coding agents set up dependencies, fix errors, extract patterns; each followed by type checking |
| **M3** | Page Enhancement | Per-page agents analyze, decompose, add interactivity and animations; quality gates after each step |
| **M4** | Verify & Fix | Verify agents run final tsc + build checks |

### How It Scales

- **Small site**: 3-4 milestones (Foundation, Bootstrap, Verify)
- **Medium site**: 5-7 milestones (add 1-2 page-specific milestones)
- **Large app**: 10+ milestones (one per page/route, plus shared component milestones)

Each milestone is independent but sequential. Agents finish one milestone before starting the next.

---

## Who Is This For?

**You want this if:**
- You want AI agents to handle implementation details
- You're willing to review agent output, not write it
- Your project has clear phases and verifiable quality gates
- You want to scale AI assistance across large projects

**You don't need this if:**
- You prefer writing every line yourself
- Your work can't be broken into discrete, verifiable tasks
- You need human judgment at every micro-decision

---

## The Philosophy

1. **Human Sets Direction** — You define what success looks like
2. **Framework Provides Structure** — How work is organized and verified
3. **Agents Do Everything** — All implementation, testing, fixing
4. **Quality is Automatic** — Verify after every task, fix until passing
5. **Progress is Transparent** — COMPOUND.md shows what's happening

---

## Quick Start

```bash
# Install globally
npm install -g crew

# Or install locally in your project
npm install --save-dev crew

# Initialize a new project (creates config and structure)
crew init ./my-project

# Let agents plan the work
crew plan ./my-project

# Let agents do the work
crew execute ./my-project

# Check what agents accomplished
crew status ./my-project
```

That's it. The agents handle the rest.
