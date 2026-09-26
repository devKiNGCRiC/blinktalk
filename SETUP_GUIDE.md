# 🚀 BlinkTalk - Complete Setup & Deployment Guide

This guide will help you set up, run, and deploy BlinkTalk from scratch.

---

## 📋 Table of Contents
1. [Prerequisites](#prerequisites)
2. [Local Setup](#local-setup)
3. [MongoDB Setup](#mongodb-setup)
4. [Running Locally](#running-locally)
5. [Deployment Guide](#deployment-guide)
6. [Monetization Setup](#monetization-setup)
7. [Troubleshooting](#troubleshooting)

---

## ✅ Prerequisites

Before starting, make sure you have:

- **Node.js** (v14 or higher) - [Download here](https://nodejs.org/)
- **MongoDB** - Either local or MongoDB Atlas account
- **Git** - For version control
- **Text Editor** - VS Code recommended

Check if you have Node.js:
```bash
node --version
npm --version
```

---

## 🔧 Local Setup

### Step 1: Verify Project Structure

Your project should have this structure:
```
BlinkTalk/
├── backend/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── socket/
│   └── server.js
├── frontend/
│   ├── css/
│   ├── js/
│   └── index.html
├── .env
├── .gitignore
├── package.json
└── README.md
```

### Step 2: Dependencies Already Installed ✅

The dependencies are already installed. If you need to reinstall:
```bash
npm install
```

---

## 🗄️ MongoDB Setup

### Option 1: MongoDB Atlas (Cloud - FREE & Recommended)

1. **Create Account**
   - Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
   - Sign up for free account

2. **Create Cluster**
   - Click "Build a Database"
   - Choose FREE tier (M0)
   - Select region (closest to India - Mumbai recommended)
   - Name your cluster: `blinktalk-cluster`

3. **Create Database User**
   - Go to "Database Access"
   - Click "Add New Database User"
   - Username: `blinktalk_user`
   - Password: Generate strong password (save it!)
   - User Privileges: Read and write to any database

4. **Allow IP Access**
   - Go to "Network Access"
   - Click "Add IP Address"
   - Select "Allow Access from Anywhere" (0.0.0.0/0)
   - Confirm

5. **Get Connection String**
   - Click "Connect" on your cluster
   - Choose "Connect your application"
   - Copy the connection string
   - Replace `<password>` with your password
   - Replace `<dbname>` with `blinktalk`

Example:
```
mongodb+srv://blinktalk_user:YOUR_PASSWORD@blinktalk-cluster.xxxxx.mongodb.net/blinktalk
```

6. **Update .env File**
   Open `.env` and update:
   ```
   MONGODB_URI=mongodb+srv://blinktalk_user:YOUR_PASSWORD@blinktalk-cluster.xxxxx.mongodb.net/blinktalk
   ```

### Option 2: Local MongoDB

1. **Install MongoDB**
   - Download from [MongoDB Community Server](https://www.mongodb.com/try/download/community)
   - Install with default settings

2. **Start MongoDB**
   ```bash
   # Windows
   net start MongoDB

   # Mac/Linux
   sudo systemctl start mongod
   ```

3. **Connection String**
   Your `.env` already has:
   ```
   MONGODB_URI=mongodb://localhost:27017/blinktalk
   ```

---

## ▶️ Running Locally

### Method 1: Development Mode (Auto-restart on changes)

```bash
npm run dev
```

### Method 2: Production Mode

```bash
npm start
```

### Access the Application

Once server starts, you'll see:
```
🚀 BlinkTalk Server Started Successfully!
📡 Server running on: http://localhost:5000
```

Open your browser and go to:
```
http://localhost:5000
```

---

## 🌐 Deployment Guide

### Deploy Backend - Render.com (FREE)

1. **Create Account**
   - Go to [Render.com](https://render.com/)
   - Sign up with GitHub

2. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin YOUR_GITHUB_REPO_URL
   git push -u origin main
   ```

3. **Create Web Service**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Select `BlinkTalk` repository

4. **Configure Service**
   ```
   Name: blinktalk-api
   Environment: Node
   Build Command: npm install
   Start Command: npm start
   Instance Type: Free
   ```

5. **Add Environment Variables**
   Click "Advanced" and add:
   ```
   PORT=5000
   NODE_ENV=production
   MONGODB_URI=your_mongodb_atlas_connection_string
   JWT_SECRET=generate_random_secret_key_here
   JWT_EXPIRE=7d
   FRONTEND_URL=https://your-frontend-url.netlify.app
   ADMIN_EMAIL=your_email@gmail.com
   ```

   To generate JWT_SECRET:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

6. **Deploy**
   - Click "Create Web Service"
   - Wait for deployment (5-10 minutes)
   - Copy your backend URL: `https://blinktalk-api.onrender.com`

### Deploy Frontend - Netlify (FREE)

1. **Update Frontend Files**

   Create `frontend/js/config.js`:
   ```javascript
   const API_URL = 'https://blinktalk-api.onrender.com/api';
   const SOCKET_URL = 'https://blinktalk-api.onrender.com';
   ```

2. **Deploy to Netlify**
   - Go to [Netlify](https://www.netlify.com/)
   - Sign up with GitHub
   - Click "Add new site" → "Import an existing project"
   - Connect GitHub repository
   - Configure:
     ```
     Base directory: frontend
     Build command: (leave empty)
     Publish directory: .
     ```

3. **Custom Domain (Optional)**
   - Go to "Domain settings"
   - Add custom domain or use provided: `blinktalk.netlify.app`

---

## 💰 Monetization Setup

### 1. Google AdSense (FREE users see ads)

1. **Apply for AdSense**
   - Go to [Google AdSense](https://www.google.com/adsense/)
   - Create account
   - Add website URL

2. **Add Ad Code**
   In `frontend/index.html`, add in `<head>`:
   ```html
   <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXX"
        crossorigin="anonymous"></script>
   ```

3. **Ad Placements**
   Add ads in sidebar and between chats (for free users only)

### 2. Stripe for Premium Subscriptions

1. **Create Stripe Account**
   - Go to [Stripe](https://stripe.com/)
   - Sign up

2. **Create Product**
   - Premium Plan: $2.99/month
   - Features: Video calls, themes, file sharing, ad-free

3. **Get API Keys**
   - Copy publishable key and secret key
   - Add to `.env`:
   ```
   STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx
   STRIPE_SECRET_KEY=sk_test_xxxxx
   ```

4. **Implement Checkout**
   - Use Stripe Checkout for subscriptions
   - Documentation: [Stripe Docs](https://stripe.com/docs/billing/subscriptions)

### 3. Pricing Strategy

**Free Tier:**
- Unlimited messaging
- Group chats
- Anonymous chat
- Ads displayed

**Premium ($2.99/month):**
- Everything in Free
- Video calling
- Custom themes
- File/image sharing (50MB)
- Ad-free experience
- Priority support

---

## 🐛 Troubleshooting

### Server won't start

**Error: MongoDB connection failed**
- Check if MongoDB is running
- Verify MONGODB_URI in .env
- Check internet connection (for Atlas)

**Error: Port already in use**
```bash
# Windows
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# Mac/Linux
lsof -i :5000
kill -9 <PID>
```

### Cannot register/login

- Check browser console for errors
- Verify backend is running
- Check MongoDB connection
- Look at server logs

### Socket.io not connecting

- Check if backend URL is correct in frontend
- Verify CORS settings
- Check firewall settings

### Deployment Issues

**Render.com:**
- Check build logs for errors
- Verify all environment variables are set
- Make sure package.json has correct start command

**Netlify:**
- Check deploy logs
- Verify API_URL in config.js
- Check CORS settings on backend

---

## 📞 Support

If you encounter issues:

1. Check server logs: `npm start` output
2. Check browser console: F12 → Console tab
3. Review error messages carefully
4. Search error on Google/Stack Overflow

---

## 🎉 You're Done!

Your BlinkTalk app is now:
- ✅ Running locally
- ✅ Connected to database
- ✅ Ready for deployment
- ✅ Set up for monetization

**Next Steps:**
1. Test all features locally
2. Deploy to production
3. Add more features
4. Market your app
5. Start earning! 💰

---

## 📚 Learning Resources

- [Node.js Documentation](https://nodejs.org/docs/)
- [Socket.io Guide](https://socket.io/docs/)
- [MongoDB University](https://university.mongodb.com/)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)

---

**Made with ❤️ for MCA Students**

Good luck with your project! 🚀
