# BlinkTalk React UI Redesign: Design Spec

**Date:** 2026-09-26
**Status:** Approved in brainstorming, awaiting spec review

## Goal

Replace the vanilla-JS frontend with a React + Vite app that has a polished,
Gen-Z-oriented design and a theme picker. Make every visible control work,
and add the "core polish" chat features. BlinkTalk is a portfolio / MCA
project, so success means a stranger can use every feature without hitting
a placeholder, the UI looks deliberate in all themes on desktop and mobile,
and the code stays easy to explain in an interview.

## Scope

**In scope ("core polish"):**
- unread badges
- read receipts (sent / delivered / read)
- online dots and "last seen"
- emoji picker
- reply to a message
- copy a message
- delete a message (for me / for everyone)
- profile and settings panel
- five-theme picker
- mobile layout
- toasts, skeleton loaders, reconnect banner
- stranger "Next" button

**Out of scope:**
- image/file sharing
- room management UI (member list, invites, leave/delete from UI)
- interest-based stranger matching
- premium features
- push notifications

## 1. Architecture

```
BlinkTalk/
├── backend/            existing Express + Socket.IO + Mongoose server
├── client/             new React 19 + Vite app (replaces frontend/)
│   ├── index.html
│   ├── vite.config.js  dev proxy: /api and /socket.io → http://localhost:5000
│   └── src/
│       ├── main.jsx, App.jsx
│       ├── api/        axios instance + auth.js, users.js, messages.js, rooms.js
│       ├── context/    AuthContext, SocketContext, ThemeContext, ChatContext, ToastContext
│       ├── components/ Avatar, MessageBubble, EmojiPicker wrapper, Modal, Toast, Skeleton, …
│       ├── features/   auth/, sidebar/, chat/, stranger/, settings/, rooms/
│       ├── lib/        pure helpers (message grouping, time formatting, password rules)
│       └── styles/     themes.css (CSS variables per theme), global.css
├── tests/              backend integration tests (node:test)
└── package.json        root scripts
```

- **Styling:**
  - Plain CSS with CSS variables.
  - CSS Modules (`*.module.css`) per component.
  - No Tailwind and no UI kit.
- **State:** React Context + `useReducer`. No Redux.
- **Client dependencies:**
  - `react`, `react-dom`
  - `socket.io-client`, `axios`
  - `emoji-picker-react`, `lucide-react`
- **Client dev dependencies:**
  - `vite`, `@vitejs/plugin-react`
  - `vitest`, `jsdom`
- **Root scripts:**
  - `npm run dev`: backend (nodemon) + Vite via `concurrently`; the app is at `http://localhost:5173`.
  - `npm run build`: installs client dependencies and builds `client/dist`.
  - `npm start`: Express serves `client/dist` plus the API on port 5000.
  - `npm test`: backend integration tests + client unit tests.
- **Deploy:** one Node app, as today. On Render, the build command is `npm install && npm run build`.
- **Old frontend:** the `frontend/` folder is deleted.
- **SPA routing:** the Express catch-all serves `client/dist/index.html`.

## 2. Screens and UX

### 2.1 Landing / auth
- Split layout:
  - **Left:** hero with an animated gradient blob, the tagline "Talk to friends. Or a total stranger.", and floating chat-bubble illustrations.
  - **Right:** card with Log in / Sign up tabs.
- **Sign up:** shows the server's password rules live (≥6 chars, a lowercase letter, an uppercase letter, a digit), each ticked ✓ as it is met. Confirm-password mismatch is shown inline.
- **Anonymous entry:** a prominent "Chat with a stranger — no account" button enters stranger mode with no account.
- **Mobile:** the hero collapses to a compact header.

### 2.2 Main app (desktop, ≥768px)
- **Nav rail:**
  - user avatar (opens settings)
  - Chats, with a total unread badge
  - Rooms
  - Stranger
  - Settings
- **List panel:**
  - Search input.
    - With a query, it shows people and public rooms in one list.
    - Clicking a room you are not in joins it.
  - Chats list rows show:
    - avatar with an online dot
    - display name
    - last-message preview
    - relative time
    - unread count pill
  - Rooms list rows show:
    - room avatar and name
    - last message as "sender: text"
    - member count
  - A "+ New room" button opens a modal (name, description, public/private).
- **Chat panel:**
  - **Header:** avatar, name, and a status line.
    - Private chats show "online", "last seen …" or "typing…".
    - Rooms show "N members" or "X is typing…".
  - **Message list:**
    - Grouped by day with date dividers ("Today", "Yesterday", a date).
    - Consecutive messages from the same sender within 5 minutes form a group; only the last bubble has a tail.
    - In rooms, the sender's name shows above the first bubble of each received group.
    - My bubbles use the theme's gradient; theirs use a surface color.
    - My private messages show ✓ (sent), ✓✓ (delivered), or ✓✓ in the accent color (read).
    - System messages show as centered pills.
  - **Message actions** (on hover, or long-press on touch):
    - Reply
    - Copy
    - Delete for me
    - Delete for everyone (own messages only)
    - Deleted-for-everyone messages render as an italic "This message was deleted".
  - **Reply:** a quoted preview bar sits above the composer with an ✕ to cancel. Sent replies show the quoted snippet inside the bubble.
  - **Composer:**
    - emoji button (popover picker)
    - auto-growing textarea, max 5 lines; Enter sends, Shift+Enter adds a newline
    - gradient send button, disabled when the textarea is empty
- **Empty states:** illustration + copy for no chats, no rooms, no search results, and no chat selected.

### 2.3 Stranger mode
- **Searching:** full-panel radar/pulse animation, with a Cancel button.
- **Connected:** chat UI with the header "Stranger", and Next ⏭ and Leave buttons.
  - Next = disconnect + search again.
  - Typing indicator works.
- **Partner left:** "Stranger dipped 👋" system pill + "Find another" button.
- **Availability:** works for both anonymous visitors and logged-in users. Anonymous visitors see only this mode, plus a "Sign up" call to action.

### 2.4 Settings panel
- **Profile:**
  - display name (≤50) and bio (≤200)
  - avatar picker offering 8 generated avatars (DiceBear URLs seeded from the username + style)
- **Theme:** 5 swatch cards with a mini chat preview; clicking applies the theme instantly.
- **Sounds:** a notification sound on/off toggle, stored in `preferences.sounds`. A short sound is synthesized with the Web Audio API, so there is no audio asset.
- **Change password:** current, new, confirm.
- **Log out.**

### 2.5 Mobile (<768px)
- One pane at a time (list → chat), with a back arrow in the chat header.
- A bottom tab bar replaces the nav rail.
- Message actions open as a bottom sheet.

### 2.6 Feedback
- Toasts (success / error / info) replace all `alert()` calls.
- Skeleton rows while lists load.
- A "Reconnecting…" banner while the socket is disconnected.
- New messages pop in with a subtle scale/fade; all motion is disabled under `prefers-reduced-motion`.
- A message sent by me shows a faint "sending" state until the server confirms it.
  - If there is no confirmation within 10s, or the socket errors, it shows "Failed — tap to retry".
  - Confirmation is matched by a client-generated `tempId` echoed back by the server.

## 3. Theme system

Each theme is a `[data-theme="<id>"]` block on `<html>` defining these variables:
- `--bg`, `--surface`, `--surface-2`, `--border`
- `--text`, `--text-muted`
- `--accent`, `--accent-gradient`
- `--bubble-me`, `--bubble-me-text`, `--bubble-them`, `--bubble-them-text`
- `--glow`, `--online`, `--danger`
- `--radius-bubble`

Components use only these variables.

| id | Name | Base | Accent |
|---|---|---|---|
| `midnight` | Midnight Neon (default) | near-black `#0b0b12` | violet → cyan, glow on focus/send |
| `sunset` | Sunset Gradient | deep plum | orange → pink → purple |
| `light` | Clean Light | white / slate | indigo, no glow |
| `matcha` | Matcha | off-white sage | green → teal |
| `y2k` | Y2K Pink | pale lavender | hot pink → baby blue, larger radius |

- **Shared signature:**
  - **Fonts:** Plus Jakarta Sans (UI) and Space Grotesk (headings), from Google Fonts.
  - **Shape:** 18px bubble radius (22px in `y2k`).
  - **Motion:** gradient send button, spring-style transitions.
- **Initial theme:** `localStorage.theme` if set. Otherwise `light` when the OS prefers light, else `midnight`.
- **Applying the theme:** an inline script in `index.html` sets `data-theme` before React loads, so there is no flash.
- **Saving:** changing the theme writes to `localStorage` and, when logged in, to `PUT /api/users/profile` `{ preferences: { theme } }`. On login, the profile's theme wins.
- **Contrast:** message and body text meet WCAG AA (4.5:1) against their backgrounds in every theme.

## 4. Backend changes

All changes are additive; existing endpoints keep their shapes.

1. **User model:**
   - `preferences.theme` enum becomes `['midnight','sunset','light','matcha','y2k']`, default `midnight`.
   - `updateProfile` merges `preferences` correctly (the current object spread over a Mongoose subdocument is replaced by per-key assignment).
2. **Contacts:**
   - `GET /api/users/contacts` adds `unreadCount` per contact (messages from that contact to me with `isRead: false`), computed with one aggregation.
   - Contacts also skip messages deleted-for-me.
3. **History:**
   - `GET /api/messages/:userId` and `GET /api/messages/room/:roomId` exclude messages whose `deletedFor` contains the current user.
   - They *include* `isDeleted` messages, with `content` replaced by an empty string, so the client can render "This message was deleted".
   - `replyTo` is populated with `content`, `sender` (username, displayName) and `isDeleted`.
4. **Socket authentication** (`user:authenticate`):
   - Joins `room:<id>` for every active room the user belongs to.
   - Marks undelivered private messages to this user as delivered, and emits `message:delivered { messageIds, to }` to each affected sender.
5. **Sending** (`message:private` and `message:room`):
   - Accept `replyTo` and `tempId`.
   - Validate that content is a non-empty string ≤5000 chars.
   - `message:private` rejects the message if either user has blocked the other.
   - The emitted message carries `tempId` back to the sender and has `replyTo` populated.
   - Errors are emitted as `message:error { tempId, message }`.
6. **New socket event `messages:read { userId }`:**
   - Marks all unread messages from `userId` to me as read.
   - Emits `messages:read { by: me, at }` to `user:<userId>`.
7. **New socket event `message:delete { messageId, scope: 'me'|'everyone' }`:**
   - Uses the same rules as the REST delete: only the sender may delete for everyone.
   - `everyone` sets `isDeleted` and broadcasts `message:deleted { messageId }` to both users (private) or the room.
   - `me` adds the user to `deletedFor` and acknowledges to the caller only.
8. **Rooms:** `Room.getUserRooms` populates `lastMessage.sender` (username, displayName).
9. **Server:**
   - `server.js` serves `client/dist` statically.
   - The catch-all returns `client/dist/index.html`.
   - If `client/dist` is missing, the catch-all replies with a hint to run `npm run build`.

## 5. Error handling

- **One axios instance** adds `Authorization` from AuthContext.
  - On a 401 it clears the session, returns to auth, and shows the toast "Session expired, please log in again".
  - Other errors show `response.data.message` (or the first validation error) as a toast.
- **Socket:**
  - `disconnect` shows the reconnect banner.
  - On reconnect the client re-emits `user:authenticate`; the server re-joins rooms.
  - After a reconnect, the open chat's history is refetched to fill any gap.
- **Stranger errors** ("No stranger connected") show as system pills, not toasts.

## 6. Testing

- **Backend** (`tests/*.test.js`, `node:test`):
  - Runs the real server against `mongodb-memory-server`, with socket clients from `socket.io-client`.
  - Covers everything the existing scratch e2e covered:
    - auth
    - search
    - private and room messaging
    - typing
    - stranger chat
  - Plus the new features:
    - `unreadCount` in contacts
    - delivered-on-login
    - `messages:read` receipts
    - reply population
    - delete for me and for everyone, and history filtering
    - rooms auto-joined on authenticate
    - theme preference update
- **Client** (Vitest):
  - message grouping (day dividers, sender groups, 5-minute window)
  - chat reducer (receive, confirm by `tempId`, fail, delete, read receipts)
  - theme resolution (stored → OS preference → default)
  - password rule checks
- **Build:** `npm run build` must succeed with no errors.
- **Visual check:**
  - Run the built app against an in-memory DB with seeded users, chats and rooms.
  - Capture screenshots with Playwright of: auth, chat list + chat, room chat, stranger searching and connected, and settings.
  - Capture them in all 5 themes at 1280×800 and 390×844.
  - Review them, and fix layout or contrast problems before calling the work done.
- **README:** updated for the new scripts, the `client/` folder, the feature list and the Render build command.
