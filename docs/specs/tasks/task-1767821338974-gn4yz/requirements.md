# Theme Restoration Requirements (Green Orky) - CONFIRMED

## 1. Overview
The User explicitly hates the "Charcoal" look. We MUST restore the **Green Orky** aesthetic. High contrast, Neon Green, Energetic.

## 2. Visual Requirements

### 2.1 Color Palette
**Reference**: `public/index.css`.

**Changes**:
1.  **Backgrounds**: **Deep Black/Dark Green**.
    -   `--bg-dark`: `#050505`.
    -   `--bg-card`: `#0a0a0a` (Or very dark green `#020602`).
2.  **Primary Accent**: **Neon WAAAH Green**.
    -   `--primary`: `#39FF14` (Neon).
    -   `--primary-hover`: `#32CD32`.
    -   **Glow**: Essential. `text-shadow: 0 0 5px var(--primary)` for headers.
3.  **UI Elements**:
    -   **Borders**: Visible Green `1px solid var(--primary)`.
    -   **Shadows**: Green Glows.

### 2.2 Terminology (Orky Flavour)
Rename UI labels to match the vibe:
-   "Admin" -> **"BOSS"**.
-   "Agents" -> **"DA BOYZ"**.
-   "Tasks" -> **"MISSIONS"**.
-   "Status" -> **"CURRENT MOOD"**.
-   "Logs" -> **"SCRIBBLINGS"**.

### 2.3 Typography
-   Headers: **'Press Start 2P'** (if available) or **Blocky Monospace**.
-   Body: **Monospace** (Courier, Fira Code).

## 3. Acceptance Criteria
- [ ] Dashboard looks "Hacker/Gamer" or "Orky".
- [ ] No "Charcoal" or "Slate" gray.
- [ ] Terminology changed to Boss/DaBoyz/Missions.
- [ ] Neon Green is dominant.
