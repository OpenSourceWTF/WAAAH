# Theme Restoration Requirements (Green Orky)

## 1. Overview
The "Corporate/Clean" redesign is CANCELLED. We are restoring and enhancing the **"Green Orky" Aesthetic**. The dashboard should feel energetic, aggressive, and distinctly "WAAAH".

## 2. Visual Requirements

### 2.1 Color Palette
**Reference**: `public/index.css`.

**Changes**:
1.  **Backgrounds**: Dark, high contrast.
    -   `--bg-dark`: `#000000` (Pure Black) or `#050505`.
    -   `--bg-card`: `#111111`.
2.  **Primary Accent**: **Neon Green**.
    -   `--primary`: `#39FF14` (Neon Green) or `#4ADE80` (Green-400).
    -   `--primary-hover`: `#22c55e` (Green-500).
    -   **Glow Effects**: Add `box-shadow: 0 0 10px var(--primary)` to key elements.
3.  **Text Colors**:
    -   `--text-main`: `#FFFFFF`.
    -   `--text-muted`: `#888888`.
4.  **Borders**:
    -   `--border-color`: `var(--primary)` (Use distinct green borders).

### 2.2 Typography
**Font Family**: A font with personality.
-   Headers: **'Press Start 2P'** or **'Chakra Petch'** (if available), or a bold Monospace.
-   Body: **'JetBrains Mono'** or **'Fira Code'**.

### 2.3 UI Elements
1.  **Chunky Buttons**:
    -   Thick borders (`2px solid var(--primary)`).
    -   Uppercase text.
    -   Hover: Background becomes Green, Text becomes Black (Invert).
    -   Sharp corners (`border-radius: 0px` or `2px`).
2.  **Terminology (WAAAH)**:
    -   "System Status" -> **"WAAAH SIGNAL"**.
    -   "Agent Fleet" -> **"DA BOYZ"** (or just "AGENTS" if that's too much, but keep it stylized).
    -   "Tasks" -> **"MISSIONS"**.
3.  **Status Indicators**:
    -   COMPLETED: Green LED Glow.
    -   FAILED: Red LED Glow.
    -   RUNNING: pulsing Yellow/Orange.

## 3. Acceptance Criteria
- [ ] Primary color is Neon Green (#39FF14).
- [ ] Borders are visible and green.
- [ ] Fonts are Monospace or "Tech/Gamer".
- [ ] Buttons are "Chunky" (Thick borders, sharp edges).
- [ ] No "Corporate Blue/Gray" aesthetics.
