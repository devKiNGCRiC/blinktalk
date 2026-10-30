# Stranger-First BlinkTalk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn BlinkTalk into a text-only random stranger chat with no login wall, where signing up unlocks unlimited chats, filters and friends.

**Architecture:** Stranger chat logic moves out of the 817-line `backend/socket/socketHandler.js` into `backend/stranger/` — small pure modules (matcher, moderation, rate limiter, icebreakers) unit-tested with `node:test`, plus one socket handler that wires them to Mongo models. Private messaging becomes friends-only. The React client drops the login wall: everyone lands on the stranger screen; auth becomes an overlay; rooms leave the nav.

**Tech Stack:** Node ≥20.19, Express 4, Socket.IO 4, Mongoose 8, React 19 + Vite, CSS Modules, `node:test` + mongodb-memory-server, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-31-stranger-first-design.md`

## Global Constraints

- Anonymous: 15 chats per UTC day, counted per match, against device id AND IP (hit when either reaches the limit).
- Tag wait 5 s before matching anyone; filter wait 15 s before `stranger:no-match`.
- 3 reports from distinct reporters in 24 h → 24 h ban on that user id / device id / IP.
- Skip/report memory: no re-match for 5 minutes.
- Rate limits: 5 messages per 3 s per socket; ≥1.5 s between searches; auth routes limited per IP.
- Anonymous message text TTL 7 days.
- Anonymous interests: 1 tag; signed-up: up to 5. Tags trimmed, lowercased, max 24 chars.
- Gender enum `male | female | nonbinary`; country = ISO 3166-1 alpha-2 uppercase; language = ISO 639-1 lowercase.
- Reaction emoji set: `❤️ 😂 😮 😢 👍 🔥`; one reaction per person per message (new one replaces old; same one toggles off).
- Timings and limits read from env with these defaults so tests can shrink them: `ANON_DAILY_LIMIT=15`, `STRANGER_TAG_WAIT_MS=5000`, `STRANGER_FILTER_WAIT_MS=15000`, `REPORT_BAN_THRESHOLD=3`, `AUTH_RATE_LIMIT=20` (per 10 min).
- Commits have no Claude co-author/contributor lines. Each task ends with commit + `git push origin main`.
- Group rooms: backend untouched, removed from client navigation only.

## Review Focus

- Same person in two tabs (same user id or device id) searching at once must never be matched with themselves → matcher test in Task 2.
- Partner closes the tab while a friend request is pending → requester gets `stranger:disconnected`, no crash, no friendship created → test in Task 5.
- Garbage payloads (`interests` not an array, 500 tags, numbers, missing data) → sanitized, server keeps running → test in Task 4.
- Two anonymous users matched → each one's daily count goes up by exactly one, and a user already at the limit is refused before entering the queue → test in Task 4.
- A friend request involving an anonymous user → rejected with an error event, never stored → test in Task 5.

---

### Task 1: Pure helpers — moderation, rate limiter, icebreakers

**Files:**
- Create: `backend/stranger/moderation.js`, `backend/stranger/rateLimiter.js`, `backend/stranger/icebreakers.js`
- Test: `tests/unit/moderation.test.js`, `tests/unit/rateLimiter.test.js`
- Modify: `package.json` test script → `node --test "tests/**/*.test.js"` already globs `tests/unit`; verify it does.

**Interfaces:**
- Produces:
  - `maskBadWords(text: string) => string` — whole-word, case-insensitive; each letter replaced by `*`.
  - `removeLinks(text: string) => string` — replaces `http(s)://…`, `www.…` and bare `name.tld/...` domains (common TLDs: com net org io in co me app dev gg xyz ru) with `[link removed]`.
  - `cleanStrangerText(text: string, { allowLinks: boolean }) => string` — `maskBadWords`, then `removeLinks` unless allowed.
  - `createRateLimiter({ max: number, windowMs: number }) => { hit(key: string, now?: number) => boolean, reset(key) }` — sliding window; `hit` returns `true` if allowed.
  - `randomIcebreaker() => string` from a list of ≥30 friendly questions.

- [ ] **Step 1: Write failing tests**
  - `maskBadWords('you are an IDIOT')` → `'you are an *****'`; `maskBadWords('scunthorpe')` unchanged (whole word only).
  - `removeLinks('see https://x.com/a ok')` → `'see [link removed] ok'`; `removeLinks('go to google.com now')` → `'go to [link removed] now'`; `removeLinks('3.5 is fine')` unchanged.
  - `cleanStrangerText('idiot www.a.io', { allowLinks: true })` → `'***** www.a.io'`.
  - Rate limiter `{max:2, windowMs:1000}`: hits at t=0,10 → true,true; t=20 → false; t=1001 → true. Different keys independent.
  - `typeof randomIcebreaker() === 'string'` and non-empty.
- [ ] **Step 2:** `node --test tests/unit/` → FAIL (modules missing).
- [ ] **Step 3:** Implement the three modules (CommonJS, comment style matching the backend). Bad-word list: ~40 common English + Hindi/Hinglish slurs/profanity, kept in the module.
- [ ] **Step 4:** `node --test tests/unit/` → PASS.
- [ ] **Step 5:** Commit `feat(stranger): moderation, rate limiter and icebreaker helpers` and push.

### Task 2: Matcher

**Files:**
- Create: `backend/stranger/matcher.js`
- Test: `tests/unit/matcher.test.js`

**Interfaces:**
- Produces:
  - Entry shape: `{ sessionId, socketId, keys: { userId|null, deviceId|null, ip }, registered: bool, interests: string[], language|null, gender|null, country|null, filters: { gender|null, country|null }, joinedAt: number }`
  - `createMatcher({ tagWaitMs, filterWaitMs, skipMemoryMs = 300000 })` returning:
    - `add(entry) => partnerEntry|null` — tries an immediate match (removing both from the queue on success), else queues.
    - `remove(sessionId)`
    - `sweep(now) => { pairs: [a,b][], noMatch: entry[] }` — matches waiting entries whose tag wait has passed; returns entries with filters that have waited ≥ `filterWaitMs` (each reported once).
    - `widen(sessionId)` — clears that entry's filters and sets it as already past the tag wait.
    - `rememberSkip(keysA, keysB, now)` — blocks re-matching for `skipMemoryMs`.
    - `size() => number`
- Matching rules (`canMatch(a, b, now)`):
  - Never if they share any non-null key (`userId`, `deviceId`). (IP alone does not block — households share IPs.)
  - Never if a skip memory links any of their keys.
  - Filters are mutual: `a.filters.gender` requires `b.gender === a.filters.gender`; same for country; and vice versa.
  - If they share an interest or both have the same non-null language → match.
  - Otherwise match only if both have waited ≥ `tagWaitMs`, or either has no interests and the other has waited ≥ `tagWaitMs`, or neither has interests.
- Candidate order: registered first, then oldest `joinedAt`.

- [ ] **Step 1: Write failing tests** (all with explicit `now`):
  - two entries with no interests match immediately on `add`.
  - `cricket` vs `anime` don't match at t=0; `sweep(5000)` pairs them.
  - shared `music` matches immediately even when other queue members are older.
  - same `deviceId` never matches, even after `sweep(60000)`.
  - same `userId` (two tabs) never matches.
  - `filters.gender='female'` vs anonymous entry: no match after `sweep(60000)`; `sweep(15000)` returns it in `noMatch` once, and not again at `sweep(16000)`.
  - mutual filter: A wants `IN` and is `US`; B is `IN` and wants `IN` → no match.
  - after `widen(A)`, A matches B on next sweep.
  - registered waiting entry is picked before an older anonymous one.
  - `rememberSkip` blocks for 5 min, allows after.
- [ ] **Step 2:** `node --test tests/unit/matcher.test.js` → FAIL.
- [ ] **Step 3:** Implement `backend/stranger/matcher.js` (in-memory array queue).
- [ ] **Step 4:** Tests PASS.
- [ ] **Step 5:** Commit `feat(stranger): interest and filter matcher` and push.

### Task 3: Models and test harness

**Files:**
- Modify: `backend/models/User.js` (add `gender`, `country`, `language`, `acceptedTermsAt`, `friends: [ObjectId ref User]`)
- Modify: `backend/models/Message.js` (TTL index `{ createdAt: 1 }`, `expireAfterSeconds: 604800`, `partialFilterExpression: { isAnonymous: true }`)
- Create: `backend/models/UsageCounter.js` — `{ key: String, day: String 'YYYY-MM-DD', count: Number, expiresAt: Date }`, unique `{key, day}`, TTL on `expiresAt` (2 days).
- Create: `backend/models/Report.js` — `{ reporterKey: String, reportedKeys: { userId, deviceId, ip }, reason: enum spam|harassment|sexual|underage|other, sessionId, createdAt }`, TTL 30 days.
- Create: `backend/models/Ban.js` — `{ key: String (unique), until: Date }`, TTL on `until`.
- Modify: `tests/helpers.js` — `startServer({ port = 5055, env = {} } = {})`; module-level `BASE_URL` becomes per-server so `api`/`connectSocket` accept the base URL from the started server (export a `client(baseUrl)` factory returning `{ api, connectSocket, createUser }`, keep current exports bound to 5055 for `api.test.js`). Default env for tests: `AUTH_RATE_LIMIT=1000`, `ANON_DAILY_LIMIT=1000`, `STRANGER_TAG_WAIT_MS=300`, `STRANGER_FILTER_WAIT_MS=600`.

**Interfaces:**
- Produces: `UsageCounter.hitDaily(keys: string[], limit: number) => Promise<{ allowed: boolean }>` — if any key's count ≥ limit return `{allowed:false}` without incrementing; else `$inc` all keys (upsert). `Ban.activeFor(keys: string[]) => Promise<Date|null>` (latest `until`). `Report.distinctReportersAgainst(key, since) => Promise<number>`.

- [ ] **Step 1:** Run `npm test` → all 42 pass before changes (baseline).
- [ ] **Step 2:** Implement models and helper changes.
- [ ] **Step 3:** `npm test` → still 42 passing.
- [ ] **Step 4:** Commit `feat(models): friends, profile fields, usage counters, reports and bans` and push.

### Task 4: Stranger socket handler — identity, matching, moderation, limits

**Files:**
- Create: `backend/stranger/strangerHandler.js`
- Modify: `backend/socket/socketHandler.js` — delete all `stranger:*` code, `anonymousUsers`, `waitingQueue`, `findStrangerMatch`, `connectStrangers`, `endStrangerSession`; call `strangerHandler(io, socket)` per connection and `strangerHandler.start(io)` once; keep `io.use` auth and also read `handshake.auth.deviceId` (string ≤64 chars matching `/^[\w-]+$/`, else null) into `socket.deviceId`; `socket.ip` = first `x-forwarded-for` entry when `TRUST_PROXY=1`, else `handshake.address`.
- Test: `tests/stranger.test.js` (own server on port 5057), `tests/limits.test.js` (port 5058, env `ANON_DAILY_LIMIT=2`, `REPORT_BAN_THRESHOLD=3`). Remove the old `stranger chat` describe from `tests/api.test.js`.

**Interfaces:**
- Consumes: Task 1 helpers, Task 2 `createMatcher`, Task 3 models.
- Client → server events:
  - `stranger:search { interests?: string[], filters?: { gender?, country? } }` — filters/extra interests ignored for anonymous (1 tag kept). Language/gender/country of signed-up users come from their profile.
  - `stranger:widen`, `stranger:message { content }`, `stranger:typing`, `stranger:disconnect`, `stranger:report { reason }`, `stranger:react { messageId, emoji }`, `stats:get`.
- Server → client events:
  - `stranger:searching { sessionId }`
  - `stranger:connected { sessionId, icebreaker: string, partner: { registered: bool, userId?: string, displayName?: string, avatar?: string, country?: string } }` — anonymous partner is `{ registered: false }` only.
  - `stranger:message { id, content, from: 'you'|'stranger', timestamp }` (content after `cleanStrangerText`; links allowed only if sender registered)
  - `stranger:typing`, `stranger:disconnected { message }`, `stranger:ended { message }`
  - `stranger:no-match`, `stranger:limit { limit, resetsAt }`, `stranger:banned { until }`, `stranger:rate-limited { message }`
  - `stranger:reaction { messageId, emoji|null, from: 'you'|'stranger' }`
  - `stats:online { count }` — to everyone, at most once per second, and to a socket on `stats:get`.
- Search flow order: rate limit (1.5 s) → ban check → (anonymous) `UsageCounter.hitDaily([dev:<deviceId>, ip:<ip>], limit)` is checked **at match time** for both anonymous sides; a user already at the limit gets `stranger:limit` on search and is not queued.
- Next/leave call `matcher.rememberSkip(myKeys, partnerKeys)`.
- Report: saves `Report`, ends the chat (like Next), remembers skip; then if `distinctReportersAgainst(key, now-24h) ≥ threshold` for any reported key, upsert `Ban` for userId/deviceId/ip keys for 24 h and emit `stranger:banned` to the reported socket if still connected.
- `start(io)`: `setInterval(1000)` running `matcher.sweep(Date.now())`, connecting pairs, emitting `stranger:no-match`. `unref()` the timer.

- [ ] **Step 1: Write failing integration tests** in `tests/stranger.test.js`:
  - port of the old "match, message, typing, next and leave" test (now asserting `icebreaker` is a string and `partner.registered === false`).
  - shared interest matches; different interests match after ~tag wait (300 ms in tests).
  - registered partner shows `displayName`; anonymous shows only `registered:false`.
  - anonymous link is replaced by `[link removed]`; registered link survives; bad word masked.
  - 6 messages in a burst → 6th gets `stranger:rate-limited`, partner receives only 5.
  - garbage `stranger:search` payloads (`{interests: 5}`, `{interests: Array(500).fill('x')}`, `null`) → still get `stranger:searching`; server answers `GET /api` afterwards.
  - two sockets with the same `deviceId` never match (staysQuiet 800 ms).
  - signed-up female-only filter vs anonymous → `stranger:no-match` within ~600 ms; `stranger:widen` → connected.
  - `stats:get` → `stats:online.count` ≥ number of open test sockets.
  - In `tests/limits.test.js`: two anonymous devices match twice (limit 2) → third search gets `stranger:limit`; a registered user is never limited; three distinct reporters against the same anonymous device → that device's next search gets `stranger:banned`. (Ban test last, since it bans the shared 127.0.0.1 IP.)
- [ ] **Step 2:** `npm test` → new tests FAIL.
- [ ] **Step 3:** Implement `strangerHandler.js` and slim `socketHandler.js`.
- [ ] **Step 4:** `npm test` → all PASS.
- [ ] **Step 5:** Commit `feat(stranger): matching, moderation, daily limit, reports and bans` and push.

### Task 5: Friends — add from stranger chat, friends-only messaging, reactions

**Files:**
- Modify: `backend/stranger/strangerHandler.js` (friend request events)
- Modify: `backend/socket/socketHandler.js` (`message:private` requires friendship; new `message:react`)
- Modify: `backend/controllers/userController.js` (`getContacts` lists `req.user.friends`, with last message + unread, sorted by last activity; new `unfriend`)
- Modify: `backend/routes/userRoutes.js` (`DELETE /api/users/friends/:userId` → `unfriend`)
- Modify: `tests/helpers.js` (`befriend(a, b)` — both search with a unique shared interest, `a` sends request, `b` accepts, await `stranger:friend:added` on both, then both `stranger:disconnect`)
- Modify: `tests/api.test.js` (private-messaging and contacts tests call `befriend` first; add new tests)

**Interfaces:**
- Client → server: `stranger:friend:request`, `stranger:friend:accept`, `message:react { messageId, emoji }`.
- Server → client: `stranger:friend:requested` (to partner), `stranger:friend:added { user: { _id, username, displayName, avatar } }` (to both, each gets the other), `stranger:friend:error { message }`, `message:reaction { messageId, reactions: [{ user, emoji }] }` (to both users), `friend:removed { userId }` (to both on unfriend).
- Accept only valid if the partner sent a request in this session; adds each id to the other's `friends` with `$addToSet`.
- `message:private` to a non-friend → `message:error { tempId, message: 'You can only message friends' }`.

- [ ] **Step 1: Write failing tests:**
  - befriend flow → both get `stranger:friend:added`; `GET /api/users/contacts` lists the friend with no messages yet.
  - anonymous side requests → `stranger:friend:error`; no friendship.
  - accept without a request → `stranger:friend:error`.
  - requester's partner disconnects before accepting → requester gets `stranger:disconnected`; contacts empty.
  - non-friends `message:private` → `message:error` 'You can only message friends'.
  - `message:react` ❤️ then 😂 → one reaction with 😂; 😂 again → none; emoji outside the set ignored.
  - unfriend → both receive `friend:removed`; messaging then fails.
  - existing private-messaging tests pass after adding `befriend`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat(friends): add friends from stranger chat, friends-only DMs, reactions` and push.

### Task 6: Auth and profile — terms, profile fields, rate limit

**Files:**
- Create: `backend/middleware/rateLimit.js` — `authRateLimit` middleware using `createRateLimiter({ max: AUTH_RATE_LIMIT, windowMs: 600000 })` keyed by `req.ip`; 429 JSON `{ success:false, message:'Too many attempts. Try again in a few minutes.' }`.
- Modify: `backend/routes/authRoutes.js` (apply to `/register`, `/login`), `backend/middleware/validation.js` (registration requires `acceptedTerms === true`; profile update validates `gender` enum or `''`, `country` `/^[A-Z]{2}$/` or `''`, `language` `/^[a-z]{2}$/` or `''`), `backend/controllers/authController.js` (store `acceptedTermsAt`), `backend/controllers/userController.js` `updateProfile` (accept the three fields; `''` → null).
- Modify: `tests/helpers.js` register payload adds `acceptedTerms: true`.
- Test: `tests/api.test.js`.

- [ ] **Step 1: Failing tests:** register without `acceptedTerms` → 400; profile update `{gender:'female', country:'IN', language:'hi'}` saved and returned by `/api/auth/me`; `{country:'india'}` → 400; separate server in `tests/limits.test.js` with `AUTH_RATE_LIMIT=3`: 4th login attempt → 429.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(auth): terms acceptance, profile filters fields, auth rate limiting` and push.

### Task 7: Client shell — no login wall

**Files:**
- Create: `client/src/lib/device.js` — `getDeviceId() => string` (localStorage `blinktalk:device`, `crypto.randomUUID()`; falls back to an in-memory id when storage throws).
- Modify: `client/src/context/AuthContext.jsx` — no `'signedOut'` status: without a saved token status is `'guest'`; `logout` → `'guest'`. Add `authOpen`, `openAuth(mode: 'login'|'signup')`, `closeAuth()`. Remove `enterGuest`/`leaveGuest`.
- Modify: `client/src/context/SocketContext.jsx` — always connects once status isn't `'loading'`; `auth: { token?, deviceId }`; reconnects on token change.
- Modify: `client/src/App.jsx` — renders `AppShell` for guest and user; `AuthScreen` as a full-screen overlay when `authOpen`.
- Modify: `client/src/features/auth/AuthScreen.jsx` — `onClose` prop + close button, `initialMode`; signup has required "I'm 18+ and agree to the rules" checkbox sending `acceptedTerms: true`; drop the "continue as guest" path.
- Modify: `client/src/features/sidebar/AppShell.jsx` — tabs: user `Chat` (Ghost icon, stranger) / `Friends` (MessageCircle, with unread badge) / `Settings`; guest `Chat` / `Theme` plus a "Sign in" nav button calling `openAuth('login')`. Default tab `Chat`. Rooms removed.
- Modify: `client/src/features/sidebar/ListPanel.jsx` — Friends list only: no search box, no rooms; title "Friends"; empty state "No friends yet. Meet someone in Chat and tap Add friend."
- Test: `client/src/lib/lib.test.js` (`getDeviceId` stable across calls).

- [ ] **Step 1:** Failing Vitest for `getDeviceId` (stub `localStorage` with a Map-backed object). **Step 2:** FAIL.
- [ ] **Step 3:** Implement the changes above.
- [ ] **Step 4:** `npm test --prefix client` PASS and `npm run build --prefix client` succeeds with no errors.
- [ ] **Step 5:** Commit `feat(client): stranger chat first, auth as overlay, friends tab` and push.

### Task 8: Client stranger chat — state, intro and search states

**Files:**
- Create: `client/src/features/stranger/strangerReducer.js` — pure reducer.
- Create: `client/src/features/stranger/useStranger.js` — hook owning the socket listeners, returns `{ state, search(opts), widen(), leave(), next(), send(text), typing(), report(reason), react(id, emoji), requestFriend(), acceptFriend() }`.
- Create: `client/src/features/stranger/StrangerIntro.jsx` (+ `.module.css`) — interests chips input (1 for guests, 5 for users, Enter/comma adds, chips removable), filters for users (gender select, country select from `lib/countries.js`), terms checkbox (persisted `blinktalk:terms` for guests; users skip it), Start button, "N online", guest upsell "Sign up for unlimited chats, filters and friends" → `openAuth('signup')`. Remembers last interests in localStorage.
- Create: `client/src/lib/countries.js` — `COUNTRIES: [{ code, name, flag }]` (all ISO codes) and `LANGUAGES: [{ code, name }]` (~25 common).
- Modify: `client/src/features/stranger/StrangerPanel.jsx` — becomes the phase switch using `useStranger`; searching screen shows Cancel; `noMatch` shows "No match yet. Widen your search?" with Widen / Keep waiting; `limit` shows "You've used today's 15 free chats" + Sign up button + reset time; `banned` shows ban end time.
- Test: `client/src/features/stranger/strangerReducer.test.js`.

**Interfaces:**
- State: `{ phase: 'idle'|'searching'|'connected'|'ended', noMatch: bool, limit: {limit, resetsAt}|null, bannedUntil: string|null, partner, icebreaker, lines: [{ id, kind: 'me'|'them'|'system', text, at, reaction: {mine, theirs} }], typing: bool, friend: 'none'|'sent'|'received'|'added', online: number }`.
- Actions: `SEARCH`, `SEARCHING`, `CONNECTED {partner, icebreaker}`, `MESSAGE {id, content, from, timestamp}`, `TYPING {on}`, `PARTNER_LEFT`, `ENDED`, `NO_MATCH`, `WIDEN`, `LIMIT {limit, resetsAt}`, `BANNED {until}`, `REACTION {messageId, emoji, from}`, `FRIEND_SENT`, `FRIEND_RECEIVED`, `FRIEND_ADDED`, `ONLINE {count}`, `CONNECTION_LOST`.

- [ ] **Step 1: Failing reducer tests:** CONNECTED clears lines and stores partner/icebreaker; MESSAGE from 'you' → kind 'me'; REACTION from 'stranger' sets `theirs` on matching line, `null` clears; PARTNER_LEFT → phase 'ended' + system line, friend 'sent' → 'none'; LIMIT → phase 'idle' with limit set; CONNECTION_LOST while searching → 'idle', while connected → 'ended'.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** client tests PASS, build succeeds.
- [ ] **Step 5:** Commit `feat(client): stranger intro with interests, filters, terms and limits` and push.

### Task 9: Client stranger chat — in-chat features

**Files:**
- Create: `client/src/lib/contactInfo.js` — `looksLikeContactInfo(text) => boolean` (email, or ≥8 digits after removing spaces/dashes/brackets/+).
- Create: `client/src/lib/transcript.js` — `buildTranscript(lines, { startedAt }) => string` (`[HH:MM] You: …` / `Stranger:` / `— system —`), `downloadText(filename, text)`.
- Create: `client/src/features/stranger/StrangerChat.jsx` (+ `.module.css`, moved styles from `StrangerPanel.module.css`) — header with partner (name/avatar/flag or "Stranger"), "typing…", Next, Report (menu of reasons → `report`), Add friend (only when both registered; states Sent / Accept / Friends ✓), Save chat, Leave; dismissible icebreaker card; bubbles with reaction picker (long-press/hover, 6 emoji); composer with contact-info confirm ("This looks like contact info. Send anyway?"); Esc: first press shows "Press Esc again to skip" toast-hint, second within 2 s → `next()`; sound on match via `lib/sound.js` when sound setting is on; ended state with "New chat" button.
- Test: `client/src/lib/lib.test.js`.

- [ ] **Step 1: Failing tests:** `looksLikeContactInfo('call me 98765 43210')` true; `('a@b.co')` true; `('i have 3 cats')` false; `('+1 (555) 123-4567')` true; `buildTranscript` produces the three line formats.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** client tests PASS, build succeeds.
- [ ] **Step 5:** Commit `feat(client): partner card, reactions, report, add friend, save chat, Esc to skip` and push.

### Task 10: Client friends chat and profile

**Files:**
- Modify: `client/src/context/ChatContext.jsx` + `chatReducer.js` — handle `message:reaction` (`REACTION_UPDATED`), `friend:removed` (drop contact, close if active), `stranger:friend:added` (reload contacts); `react(message, emoji)`; `unfriend(userId)` via `usersApi.unfriend`. Remove room loading from the provider's initial load.
- Modify: `client/src/api/users.js` — `unfriend(userId)`; remove `searchUsers`.
- Modify: `client/src/features/chat/MessageBubble.jsx`, `MessageActions.jsx` — reaction picker + reaction chips.
- Modify: `client/src/features/chat/ChatPanel.jsx` — header menu "Unfriend" with confirm modal.
- Modify: `client/src/features/settings/SettingsPanel.jsx` — profile: gender, country, language selects ("Prefer not to say" = `''`), saved via `updateProfile`.
- Test: `client/src/context/chatReducer.test.js` (REACTION_UPDATED replaces reactions on the right message; CONTACT_REMOVED drops contact and clears active chat).

- [ ] **Step 1:** Failing reducer tests. **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** `npm test` (root: backend + client) PASS; build succeeds.
- [ ] **Step 5:** Commit `feat(client): friend reactions, unfriend and profile filter fields` and push.

### Task 11: Docs and final verification

**Files:**
- Modify: `README.md` (features, perks table, env vars incl. new ones, run commands), `.env.example` (new env vars with defaults, `FRONTEND_URL=http://localhost:5173`).

- [ ] **Step 1:** Update docs.
- [ ] **Step 2:** `npm test` all PASS; `npm run build` succeeds; start server with in-memory Mongo isn't possible without Mongo → note MongoDB setup is the user's final step.
- [ ] **Step 3:** Commit `docs: stranger-first README and env` and push.
