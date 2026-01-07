# Theme Redesign Requirements (De-Orkify)

## 1. Overview
Replace the current "Aggressive Green" / "Orky" aesthetic with a **Professional, Modern Dark UI**. The goal is to make the dashboard look like a production-grade DevOps tool (e.g., Vercel, Linear).

## 2. Visual Requirements

### 2.1 Color Palette
**Reference**: `public/index.css` (or wherever CSS vars are defined).

**Changes**:
1.  **Backgrounds**: Switch to **Slate/Zinc** dark mode.
    -   `--bg-dark`: `#09090b` (Zinc-950)
    -   `--bg-card`: `#18181b` (Zinc-900)
    -   `--bg-hover`: `#27272a` (Zinc-800)
2.  **Primary Accent**: Switch from Neon Green to **Subtle Blue/Indigo**.
    -   `--primary`: `#6366f1` (Indigo-500) or `#3b82f6` (Blue-500).
    -   `--primary-hover`: `#4f46e5` (Indigo-600) / `#2563eb` (Blue-600).
3.  **Text Colors**:
    -   `--text-main`: `#f4f4f5` (Zinc-100)
    -   `--text-muted`: `#a1a1aa` (Zinc-400)
4.  **Borders**:
    -   `--border-color`: `#27272a` (Zinc-800)

### 2.2 Typography
**Font Family**: Use **Inter** (Google Fonts).
-   `font-family: 'Inter', sans-serif;`
-   Weights: 400 (Regular), 500 (Medium), 600 (Semi-Bold).
-   **Remove** any display/handwritten fonts if present.

### 2.3 UI Elements
1.  **Cards**:
    -   Remove thick green borders. Use subtle 1px gray borders (`1px solid var(--border-color)`).
    -   Add subtle shadow (`box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1)`).
    -   Rounded corners: `border-radius: 0.5rem;` (8px).
2.  **Buttons**:
    -   Solid background (Indigo/Blue).
    -   White text (`font-weight: 500`).
    -   Hover state: slightly darker background.
    -   Transition: `all 0.2s ease`.
3.  **Status Badges**:
    -   COMPLETED: Green text/bg (subtle, not neon). E.g., `bg-green-900/50 text-green-400`.
    -   FAILED: Red text/bg. E.g., `bg-red-900/50 text-red-400`.
    -   RUNNING: Blue text/bg.
    -   WAITING: Gray/Zinc text/bg.

### 2.4 Cleanup
-   **Terminology**: Rename any labels like "WAAAH Status" to "System Status".
-   **Logo**: If text logo says "WAAAH", keep it but style it neutrally (e.g., White text, maybe bold).

## 3. Acceptance Criteria
- [ ] No "Neon Green" visible in the UI.
- [ ] Background is professional Dark Gray/Zinc.
- [ ] Primary buttons are Indigo/Blue.
- [ ] Font is Inter.
- [ ] Task Cards look sleek (subtle border, good padding).
