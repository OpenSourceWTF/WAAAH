# Theme Switcher Requirements

## Overview
Implement a 3-way theme switcher with "Text Modes".

## Modes

### 1. WAAAH (Default)
- **Visuals**: Neon Green / Black ("Green Orky").
- **Text Tone**: "Fun" (Orkish).
  - "DA BOYZ" (Agents)
  - "ACTIVE MISSIONS" / "SCRIBBLINGS" (Tasks/History)
  - "THE SHOUT" (Logs)
  - "KRUMPIN" (Disconnected)

### 2. LIGHT (Professional)
- **Visuals**: Standard Light Mode.
  - White background, Black text.
  - Neutral/Blue accents.
- **Text Tone**: "Professional".
  - "Agents"
  - "Active Tasks" / "History"
  - "Activity Log"
  - "Disconnected"

### 3. DARK (Professional)
- **Visuals**: Standard Dark Mode.
  - Gray/Black background, White text.
  - Neutral accents.
- **Text Tone**: "Professional".

## Implementation Details
- **State Management**: `useTheme` hook.
- **Persistence**: `localStorage`.
- **CSS Strategy**:
  - `WAAAH`: Default / `data-theme="waaah"`
  - `LIGHT`: `data-theme="light"` (or class `light`)
  - `DARK`: `data-theme="dark"` (or class `dark`)
- **Text Mapping**:
  - Create a dictionary/map for UI strings keyed by mode.

## Components to Update
- `Dashboard.tsx`: Header, Tabs, Card Titles, Status Badges.
- `index.css`: Define CSS variables for Light/Dark themes.
