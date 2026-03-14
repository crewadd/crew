---
name: crewman
version: 1.0.0
description: Default project assistant — agents and skills copied by crew init
---

# crewman

Default project assistant plugin. Bundles agents and skills that are copied
into `.crew/agents/` and `.crew/skills/` during `crew init`.

## How it works

The plugin itself is a no-op. The `crew init` command handles copying:

1. `crew init` calls `syncCrewmanAssets()` which copies this plugin's
   bundled `agents/` and `skills/` into the project's `.crew/` folder.
2. If `--force` is used with an existing `.claude/` directory, user
   agents/skills from `.claude/` are merged on top of the defaults.

## Usage

Included by default — no configuration needed.
