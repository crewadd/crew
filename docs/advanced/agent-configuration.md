# Agent Configuration

**Configure AI agent providers, backends, and models for task execution.**

[[docs](../README.md) > [advanced](./README.md) > agent-configuration]

---

## Overview

Configure which AI provider and model execute tasks.

---

## Provider Configuration

### OpenAI

```json
{
  "agent": {
    "provider": "openai",
    "config": {
      "apiKey": "${OPENAI_API_KEY}",
      "model": "gpt-4"
    }
  }
}
```

### Anthropic

```json
{
  "agent": {
    "provider": "anthropic",
    "config": {
      "apiKey": "${ANTHROPIC_API_KEY}",
      "model": "claude-opus-4"
    }
  }
}
```

---

## See Also

- [Multi-Agent Workflows](../guides/multi-agent-workflows.md) - Agent coordination

---

[← Back to Advanced Topics](./README.md) | [Documentation Home](../README.md)
