# 💬 BlinkTalk - Real-Time Chat Application

A modern, real-time chat application with anonymous stranger chat feature (like Omegle).

## ✨ Features

### Free Features
- ✅ User Registration & Authentication
- ✅ One-on-one Private Messaging
- ✅ Group Chats (unlimited)
- ✅ Anonymous Stranger Chat (No login required!)
- ✅ Real-time Message Delivery
- ✅ Online/Offline Status
- ✅ Typing Indicators
- ✅ Message History

### Planned Premium Features ($2.99/month) — not built yet
- 🎥 Video Calling
- 🎨 Custom Themes
- 📁 File & Image Sharing
- 🚫 Ad-Free Experience
- ⚡ Priority Support

## 🛠️ Tech Stack

- **Backend:** Node.js, Express.js, Socket.io
- **Database:** MongoDB with Mongoose
- **Authentication:** JWT (JSON Web Tokens)
- **Frontend:** HTML5, CSS3, Vanilla JavaScript
- **Real-time:** Socket.io

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- MongoDB (local or Atlas account)
- Git

### Installation

1. Clone the repository
```bash
git clone https://github.com/devKiNGCRiC/blinktalk.git
cd blinktalk
```

2. Install dependencies
```bash
npm install
```

3. Create .env file
```bash
cp .env.example .env
```

4. Update .env with your credentials
- MongoDB URI
- JWT Secret
- Cloudinary credentials (optional)

5. Start the development server
```bash
npm run dev
```

6. Open your browser
```
http://localhost:5000
```

## 📁 Project Structure

```
BlinkTalk/
├── backend/
│   ├── config/          # Configuration files
│   ├── models/          # MongoDB schemas
│   ├── routes/          # API endpoints
│   ├── controllers/     # Business logic
│   ├── middleware/      # Custom middleware
│   ├── socket/          # Socket.io handlers
│   └── server.js        # Entry point
├── frontend/
│   ├── css/            # Stylesheets
│   ├── js/             # Client-side JavaScript
│   └── index.html      # Single-page app
└── package.json
```

## 🌐 Deployment

### Backend Deployment (Render/Railway)
1. Create account on Render.com or Railway.app
2. Connect your GitHub repository
3. Set environment variables
4. Deploy!

### Database (MongoDB Atlas)
1. Create free cluster at mongodb.com/cloud/atlas
2. Get connection string
3. Add to .env file

### Frontend
The Express server also serves the `frontend/` folder, so deploying the backend
deploys the whole app — no separate frontend hosting is needed.

## 💰 Monetization Strategy

- **Free Tier:** All basic features + anonymous chat
- **Premium:** $2.99/month (video calls, themes, file sharing)
- **Ads:** Google AdSense for free users
- **Business Plan:** $9.99/month (team features)

## 📝 License

MIT License - feel free to use for learning!

## 👨‍💻 Author

Created by [devKiNGCRiC](https://github.com/devKiNGCRiC) - MCA Student, India

## 🤝 Contributing

Pull requests are welcome! This is a learning project.
