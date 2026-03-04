# CREW — Agent Driven Development (ADD) Framework

**Humans run the commands. AI agents do the work.**

crew is an orchestration framework for AI agents (Codex, Claude, etc.). It provides the structure; agents provide the labor. You don't write code—you run `plan` and `run`, and agents handle everything: planning, coding, testing, fixing.

Now with **Conversational Mode** — talk to your project like it’s an intelligent teammate.

---

## What is Agent Driven Development?

Traditional development: You write code, run it, debug it.

Agent Driven Development: You describe the goal, and AI agents:

- Plan the approach  
- Write the code  
- Run the tests  
- Fix the errors  
- Verify the results  

**Your job:** Run commands.  
**Their job:** Everything else.

---

# 🗣 Conversational Mode — `crew chat`

Sometimes you don’t want to run a structured command.  
You want to **talk to your project**.

crew provides a conversational interface over the same orchestration engine.

```

crew chat --claude

```

This launches an interactive Claude Code session connected to your crew project.

### What This Enables

You can:

- Ask about project status  
- Inspect milestones  
- Review COMPOUND.md  
- Trigger planning  
- Run tasks  
- Debug failures  
- Request improvements  
- Refactor specific modules  
- Ask “why did M3 fail?”  
- Run targeted fixes  

But here’s the key:

> **Chat is just the interface. The orchestration engine still runs underneath.**

The same lifecycle hooks, task system, quality gates, and persistence apply.

---

# The Framework's Role

Think of crew as a **workflow engine for agents**.

It doesn't do the work—it directs who does what, when, and in what order.

```
┌─────────────────────────────────────────────────────────────┐
│                      YOU (Human)                            │
│                                                             │
│   crew plan           crew run         crew chat            │
│                                                             │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    crew (Framework)                         │
│                                                             │
│    ┌────────────┬─────────────┬──────────────┐             │
│    │ Plan Engine│ Run Engine  │ Chat Layer   │             │
│    └──────┬─────┴──────┬──────┴──────┬───────┘             │
│           ▼            ▼             ▼                      │
│      Task Graph    Milestone Loop  Intent Resolver         │
│           │            │             │                      │
└───────────┼────────────┼─────────────┼──────────────────────┘
            ▼            ▼             ▼
┌─────────────────────────────────────────────────────────────┐
│              AI AGENTS (Claude, Codex, etc.)                │
│                                                             │
│   Plan │ Code │ Test │ Fix │ Verify │ Custom Agents        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

The framework provides:

* **Structure** — milestones, tasks, dependencies
* **Lifecycle hooks** — when to start, what to do, when to finish
* **Quality gates** — automatic verification
* **Persistence** — resume after interruption
* **Chat interface** — interactive orchestration

The agents provide:

* **All the actual work**

---

# How It Works

## Step 1: Plan

```
crew plan
```

Planning Agent:

1. Reads your project
2. Creates milestones
3. Breaks them into tasks
4. Writes COMPOUND.md

---

## Step 2: Run

```
crew run
```

Framework:

1. Identifies ready tasks
2. Delegates to coding agents
3. Runs quality gates
4. Triggers fix agents if needed
5. Repeats until passing

---

## Step 3 (Optional): Converse

```
crew chat --claude
```

You:

* Ask questions
* Adjust plan
* Run partial tasks
* Debug failures
* Create new work
* Inspect state

Chat becomes a dynamic control layer over the same deterministic workflow engine.

---

# Commands You Run

| Command              | What You Do      | What Agents Do                  |
| -------------------- | ---------------- | ------------------------------- |
| `crew init`          | Scaffold project | Create config + agent templates |
| `crew plan`          | Run it           | Create milestones + tasks       |
| `crew run`           | Run it           | Execute all tasks               |
| `crew verify`        | Run it           | Run quality gates               |
| `crew status`        | Run it           | Show progress                   |
| `crew chat --claude` | Talk to project  | Orchestrate via conversation    |

---

# State & Persistence

**COMPOUND.md**

* Shared memory between you and agents
* Written by planning agent
* Updated by execution engine
* Readable and editable by you
* Interpreted by chat layer

If execution stops, resume with:

```
crew run --from=m3.2
```

Or:

```
crew chat --p "resume from m3.2"
```

---

# The Philosophy

1. **Human Sets Direction**
2. **Framework Provides Structure**
3. **Agents Do Everything**
4. **Quality is Automatic**
5. **Progress is Transparent**
6. **Conversation is Control**

---

# Quick Start

```bash
npm install -g crew

crew init ./my-project

crew plan ./my-project

crew run ./my-project

crew chat --claude
```

That’s it.

Run commands.
Or talk to your project.

The agents handle the rest.
