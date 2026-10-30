# BlinkTalk: Stranger-First Redesign

Date: 2026-10-31
Status: approved in chat ("all's good, start building")

## Intent

BlinkTalk becomes a text-only random stranger chat. You open the site, get matched with a
random person, talk, and press Next. No login wall. Signing up is optional and unlocks extras
(unlimited chats, filters, friends). The existing private chat, receipts and replies are reused
for friends you made through stranger chat.

## Goals

- Stranger chat is the first screen for everyone, usable without an account.
- Signed-up users get clear, worthwhile perks so there is a reason to sign up.
- Safety is built in from day one (Omegle closed mostly because of abuse).

## Non-goals (this version)

- Video, voice, images or file sharing.
- Payments / premium plans. Gender and country filters are signed-up perks, built so they
  could move behind a paid plan later.
- Group rooms in the UI (backend code stays so they can return).

## Anti-goals

- A login wall before the first chat.
- Anonymous users being able to spam links or get around limits by just refreshing.
- Leaking who someone is: anonymous users always appear as "Stranger".

## Who gets what

| | Anonymous | Signed up |
|---|---|---|
| Stranger chats per day | 15 | Unlimited |
| Interest tags | 1 | Up to 5 |
| Language preference | No | Yes |
| Gender / country filter | No | Yes |
| Queue priority when busy | Normal | First |
| Send links | No | Yes |
| Shown to partner as | "Stranger" | Display name, avatar, country flag (if set) |
| Add friend after a chat | No | Yes (both must be signed up and both must accept) |
| Friends list with history, receipts, replies, reactions | No | Yes |
| Themes, profile | Theme only (saved locally) | Yes (saved to account) |

## Behaviour

### First visit

- Stranger chat screen loads immediately. Before the first chat, a one-time 18+ and rules
  checkbox (stored in localStorage for anonymous users; stored on the account at signup).
- Header shows a live "N online" count and a Sign in / Sign up button for anonymous users.

### Matching

- Interest tags are normalized (trimmed, lowercased, max 24 chars).
- A searcher is paired with a waiting person who shares a tag. After 5 seconds without a tag
  match, either side can be matched with anyone.
- Filters (signed-up only): gender (`male`, `female`, `nonbinary`) and country (ISO code).
  Filters are mutual: A and B match only if each passes the other's filters. Anonymous users
  have no gender or country, so they never pass a filter.
- With a filter set and no match after 15 seconds, the server emits `stranger:no-match` and
  the client asks "No match yet. Widen your search?" (clears filters and keeps searching).
- Language (signed-up): treated like an extra shared tag that ranks matches higher; never a
  hard filter.
- Queue order: signed-up users first, then by how long they have waited.
- Never re-match two people where one skipped or reported the other in the last 5 minutes.

### Daily limit (anonymous)

- A chat counts when a match is made. Limit 15 per UTC day.
- Counted against both a device id (random UUID in localStorage, sent in the socket
  handshake) and the client IP; the limit is hit when either key reaches 15.
- Stored in MongoDB with a TTL so it survives restarts.
- At the limit, `stranger:limit` is emitted and the client shows "Sign up for unlimited chats".

### In the chat

- Typing indicator, Enter to send, Esc to Next (first press shows "Press Esc again to skip",
  second press within 2s skips).
- A random icebreaker question arrives with `stranger:connected` and shows as a dismissible card.
- Sound when matched (respects the existing sound setting).
- Reactions on messages (a small fixed emoji set; one reaction per person per message).
- "Save chat" downloads a .txt transcript.
- When the partner leaves: "Stranger has disconnected" with a one-click New chat.
- Add friend (both signed up): the request shows inline for the other person. If accepted, both
  become friends and the chat can continue in Friends.

### Safety

- Report button (reason: spam, harassment, sexual content, underage, other) also skips.
- 3 reports from distinct reporters within 24 hours → 24-hour ban for that user id / device id / IP.
  Banned users see when the ban ends.
- Bad-word filter masks words from a built-in list with asterisks.
- Links from anonymous users are replaced with `[link removed]`.
- Client warns before sending something that looks like a phone number or email
  ("Send anyway?").
- Rate limits: max 5 messages per 3 seconds per socket; at least 1.5 seconds between Next
  presses; REST login/signup limited per IP.
- Anonymous message text is kept for 7 days (for report review), then removed by a TTL index.

### Friends

- Private messaging is only allowed between friends.
- Friends list replaces the old Chats list, keeping unread counts, presence, receipts, replies,
  delete and reactions.
- Unfriend is available from the chat header.
- The old "search any user and message them" entry point is removed.

### Hidden

- Rooms are removed from navigation; backend routes and models stay untouched.

## Constraints

- Builds on the existing stack: Express, Socket.IO, Mongoose, React 19 + Vite, CSS Modules.
- Existing tests keep passing or are updated where behaviour intentionally changed.
- Commits carry no Claude attribution; each completed update is pushed to GitHub.
- MongoDB setup for local running is handled last.

## Calls made by the builder (not discussed explicitly)

- 15 chats/day, 5s tag wait, 15s filter wait, 3 reports → 24h ban, 7-day anonymous retention.
- Signed-up users are shown by name/avatar to their partner; anonymous as "Stranger".
- Language is a soft preference, not a hard filter.
- Esc needs a double press to skip.
- Reactions are persisted on friend messages and ephemeral-but-relayed in stranger chat.
