# 💬 BlinkTalk - Real-Time Chat Application

Chat with friends in real time, hang out in group rooms, or tap one button to talk to a random stranger, with no account needed.

## ✨ Features

- **Accounts:** sign up and log in with JWT authentication, with live password rules as you type
- **Private chats:** real-time messages with ✓ sent, ✓✓ delivered and ✓✓ read receipts
- **Group rooms:** public rooms anyone can find and join, plus private rooms
- **Anonymous stranger chat:** random matching, a *Next* button to skip, and no login required
- **Chat tools:**
  - reply to a message
  - copy text
  - delete for me or for everyone
  - emoji picker
  - typing indicators
- **Presence:** online dots, "last seen", and unread badges on chats, in the nav and in the tab title
- **5 themes:** Midnight Neon, Sunset, Clean Light, Matcha and Y2K Pink. Your pick is saved to your account.
- **Profile & settings:** display name, bio, generated avatars, message sound, and changing your password
- **Works on phones:** a one-pane layout with a bottom tab bar, bottom-sheet menus and long-press actions
- **Reliable:** reconnects automatically, retries failed messages, and shows toast messages instead of pop-up alerts

## 🛠️ Tech Stack

| Part | Tech |
|---|---|
| Frontend | React 19, Vite, CSS Modules + CSS variables for themes, Socket.IO client |
| Backend | Node.js, Express, Socket.IO |
| Database | MongoDB with Mongoose |
| Auth | JWT (also used to authenticate the socket connection) |
| Tests | `node:test` + in-memory MongoDB for the backend, Vitest for the frontend |

## 🚀 Getting Started

### Prerequisites
- Node.js **20.19 or newer**
- MongoDB, either installed locally or a free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster

### Setup

```bash
git clone https://github.com/devKiNGCRiC/blinktalk.git
cd blinktalk
npm install                 # backend dependencies
npm install --prefix client # frontend dependencies
cp .env.example .env        # then set MONGODB_URI and JWT_SECRET
```

### Run in development

```bash
npm run dev
```

This starts the API on http://localhost:5000 and the React app on **http://localhost:5173** (open this one). Both reload when you save a change.

### Run in production mode

```bash
npm run build   # builds the React app into client/dist
npm start       # serves the app + API on http://localhost:5000
```

## 🧪 Tests

```bash
npm test
```

This runs the backend integration tests against a throwaway in-memory MongoDB, so no database setup is needed. The first run downloads a MongoDB binary. It then runs the frontend unit tests.

## 📁 Project Structure

```
BlinkTalk/
├── backend/
│   ├── config/          # Database + JWT helpers
│   ├── controllers/     # REST API logic
│   ├── middleware/      # Auth + input validation
│   ├── models/          # Mongoose schemas (User, Message, Room)
│   ├── routes/          # REST endpoints
│   ├── socket/          # Real-time events (messages, receipts, typing, stranger chat)
│   └── server.js        # Entry point, also serves client/dist
├── client/              # React + Vite app
│   └── src/
│       ├── api/         # REST calls
│       ├── context/     # Auth, socket, theme, toast and chat state
│       ├── components/  # Avatar, Composer, Modal, …
│       ├── features/    # auth, sidebar, chat, rooms, stranger, settings
│       ├── lib/         # Pure helpers (formatting, grouping, themes)
│       └── styles/      # Theme variables + global styles
├── tests/               # Backend integration tests
└── docs/                # Design spec
```

## 🌐 Deployment (Render + MongoDB Atlas)

1. Create a free MongoDB Atlas cluster and copy its connection string.
2. On [Render](https://render.com), create a **Web Service** from this GitHub repository:
   - **Build command:** `npm install && npm run build`
   - **Start command:** `npm start`
   - **Environment variables:** `MONGODB_URI`, `JWT_SECRET` (a long random string), `NODE_ENV=production`
3. Deploy. The one service serves both the API and the React app.

To generate a JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 🗺️ Roadmap

See [ROADMAP.md](ROADMAP.md). Next up: image and file sharing, room management (members, invites), and interest-based stranger matching.

## 📝 License

[MIT](LICENSE)

## 👨‍💻 Author

Created by [devKiNGCRiC](https://github.com/devKiNGCRiC), MCA student, India.
