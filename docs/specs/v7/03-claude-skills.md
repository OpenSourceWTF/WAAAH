# S3: Claude Skills Compatibility

## Context
Symlink `.claude/skills` → `../.agent/workflows` for cross-system compatibility.

## Requirements
- Add `name:` field to all `.agent/workflows/*.md` frontmatter
- Create symlink `.claude/skills` (Windows Caveat: Requires Developer Mode)
- Update `waaah init` CLI to scaffold these directories and symlink
- **Verification Note**: Symlink target should be relative (`../.agent/workflows`) to ensure portability across clones

## Status
DONE
