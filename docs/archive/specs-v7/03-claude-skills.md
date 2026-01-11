# S3: Claude Skills Compatibility

## Context
Symlink `.claude/skills` → `../.agent/workflows` for cross-system compatibility.

## Relationship to ARCHITECTURE.md
Agents in the **Execution Plane** use workflow definitions to understand their behavior. Claude Desktop agents look for skills in `.claude/skills/`, while the canonical location for WAAAH is `.agent/workflows/`. This spec ensures both tools find the same files.

## Requirements
- Add `name:` field to all `.agent/workflows/*.md` frontmatter
- Create symlink `.claude/skills` → `../.agent/workflows` (Windows: requires Developer Mode)
- Update `waaah init` CLI to scaffold these directories and symlink
- **Portability Note**: Symlink target should be relative to ensure portability across clones

## Status
DONE
