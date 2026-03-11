# AI Configuration — Feature Spec

## Feature 1: AI Global Configuration Panel

A button labeled **"AI Configuration"** is placed next to "New Spec +" in the Kanban header. It opens a modal/panel with the following settings:

- **AI Provider** dropdown: `Claude` | `Copilot` (default: Claude)
- **Permission Mode** dropdown (options change per provider):
  - Claude: `Default (ask)`, `Full permissions (--dangerously-skip-permissions)`, `Plan mode (--plan)`
  - Copilot: `Default (ask)`, `Full permissions (--yolo)`
- **Model** dropdown (populated per provider):
  - Claude: `opus`, `sonnet`, `haiku`
  - Copilot: `claude-sonnet-4.6`, `gpt-4o`, etc.
- **Tag → Skill Mapping** section:
  - Reads tags from `.specs/*.sdd.md` files (e.g. `backend`, `frontend`, `infra`)
  - Reads skills from `.claude/skills/` folder (e.g. `sdd-planner`, `typescript-advanced-types`)
  - UI: table/grid where user maps each tag to a skill (e.g. `backend → typescript-advanced-types`)
  - When a spec is executed, its tags determine which skills are loaded
- **Custom Pre-prompt** textarea: default task prompt template, user can customize

Config persisted to `.sdd/ai-config.json`.

## Feature 2: Config-aware Execution

The existing "Execute" button on Ready kanban cards reads the global AI config:

- Selects the configured provider (Claude CLI or Copilot CLI) with the configured permission flags
- Applies the tag → skill mapping based on the spec's tags
- Uses the custom pre-prompt if configured

## Feature 3: Custom Pre-prompt Template

Default template (inspired by `run-sdd.sh`):

```
Implement {spec_file}. Update open tasks in the spec after completion. Add unit tests if necessary. Commit with the SDD spec_id as message.
```

Overridable per-execution or globally in AI Configuration.

## Feature 4: Bulk Sequential Execution

- On Ready cards: **"Add to Bulk"** button next to "Execute"
- Selected cards appear in a grouped frame/container with a visible border in the Ready column
- Frame has an **"Execute All"** button to run specs sequentially in order
- During execution:
  - Cards move to "In Progress" column inside the same grouped frame
  - Currently executing card shows a loading spinner
  - Completed cards show a green checkmark
- On completion: all cards move to "Review" column as a group
- When the last card in the group is reviewed and moved to Done, the frame dissolves
