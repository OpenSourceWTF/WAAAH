# THE SHOUT Tab Refactor (Green Orky)

## 1. User Story
As a BOSS (User), I want the "Recent Activity Feed" (aka **THE SHOUT**) to be in its own tab, not cluttering the sidebar. This gives me more screen space for the Tasks list ("MISSIONS") and keeps the layout clean.

## 2. UX/UI Specifications

### 2.1 Tab Navigation
-   **Location**: Top Navigation Bar (or Tab Row).
-   **Order**:
    1.  **MISSIONS** (Tasks)
    2.  **SCRIBBLINGS** (Logs/Console)
    3.  **THE SHOUT** (Activity Feed) - **[NEW]**
    4.  **DA BOYZ** (Agents - optional if it has a tab, or sidebar).

### 2.2 Tab Behavior
-   **Default**: "MISSIONS" is active on load.
-   **Click**: Clicking "THE SHOUT" hides other content containers and shows the Activity Feed container.
-   **State**: The active tab must be highlighted (Neon Green Background, Black Text, Glowing). Inactive tabs are Black Background, Green Text.

### 2.3 The Shout Container
-   **Layout**: Full width of the main content area (minus sidebar if sticky).
-   **Content**: The "System Log" style feed designed in previous tasks.
-   **Reflow**: Ensure the feed takes available height (`flex: 1`) and scrolls independently.

### 2.4 Mobile Responsiveness
-   On mobile, the Tabs should wrap or scroll horizontally.
-   "THE SHOUT" should be full screen on mobile when active.

## 3. Implementation Checklist (@FullStack)
- [ ] **HTML**: Add `<button id="tab-shout" ...>THE SHOUT</button>` to the tab bar.
- [ ] **HTML**: Wrap the Activity Feed in a `<div id="view-shout" class="tab-content hidden">...</div>`.
- [ ] **CSS**: Ensure `.tab-content` class handles visibility (`display: none` when hidden).
- [ ] **JS**: Update Tab Switching logic (likely in `app.js` or `tabs.js`) to handle the 'shout' ID.
- [ ] **Verify**: Click "THE SHOUT" -> Feed appears. Click "MISSIONS" -> Tasks appear.
