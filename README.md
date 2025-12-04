🧠 Facial Reaction Password (FRP)
A next-generation biometric authentication system based on facial micro-reactions, blinking, and movement patterns.

FRP uses AI-powered facial landmark tracking, DTW sequence matching, and anti-spoofing checks to authenticate users based on subtle, unique micro-expressions.
It works using a standard webcam — no specialized hardware required.

🚀 Features
🔹 Real-Time Facial Landmark Tracking

Powered by MediaPipe Face Landmarker, detecting 468+ facial points with high precision.

🔹 Reaction-Based Password (Instead of text passwords)

User performs a natural facial reaction sequence (blink, smile, movement).
This sequence becomes the "password".

🔹 AI Matching Using DTW Algorithm

Dynamic Time Warping compares reaction sequences to stored templates.

🔹 Anti-Spoofing Detection

Prevents fake login attempts using:

Motion variance

Blink detection

Micro-movement consistency

🔹 Secure Local Template Storage

Each user gets a locally encrypted facial reaction feature template.

🔹 Backend Ready (Optional)

Includes Express.js API endpoints for saving/loading templates remotely.

🔹 Fully Responsive VisionOS-Inspired UI

A premium UI with holographic visuals and realtime metrics.

🛠️ Tech Stack
Frontend

React (Vite)

TailwindCSS

MediaPipe Tasks Vision

Canvas API

Backend

Node.js + Express

Local JSON storage (can be replaced with a database)

Other Tools

Dynamic Time Warping (DTW)

LocalStorage for template caching

📸 Demo Preview

![FRP Screenshot](./screenshot.png)

📦 Folder Structure
facial-reaction-password/
│
├── backend/
│   ├── server.js
│   ├── package.json
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── FacialReactionPassword.jsx
│   │   │   ├── FacialReactionPasswordVision.jsx
│   │   ├── App.jsx
│   │   ├── main.jsx
│   ├── package.json
│
├── README.md
└── .gitignore

⚙️ Installation & Setup
1️⃣ Clone Repository
git clone https://github.com/YOUR_USERNAME/facial-reaction-password.git
cd facial-reaction-password

🎨 Frontend Setup (React + Vite)
cd frontend
npm install
npm run dev


Frontend will start at:
👉 http://localhost:5173

🧩 Backend Setup (Node.js + Express)
cd backend
npm install
npm run dev


Backend will start at:
👉 http://localhost:5001

🔐 How Authentication Works

FRP records:

468+ facial points for several frames

Normalizes vectors

Runs Dynamic Time Warping to match sequences

Checks blink + movement for anti-spoof

Computes similarity score

Compares score to threshold

Grants access if below threshold

🧪 API Endpoints (Optional)
POST /api/enroll

Stores user template.

GET /api/template/:username

Retrieves stored template.

🔒 Security Notes

✔ No raw video or images are stored.
✔ Only numerical landmark templates are saved.
✔ All templates stay local unless backend upload is enabled.
✔ Works offline.

🌍 Real-World Applications

Password-less login systems

Secure workstation access

High-security labs

Personal computer unlocking

University research projects

Gesture-based UI authentication

Advanced biometric systems

🤝 Contributing

Pull requests are welcome!
Feel free to open issues for UI/UX, performance, or algorithm improvements.

📜 License

MIT License — free to use and modify.

👨‍💻 Developed By

Aditya Kumar Bichhave
B.Tech CSE | Cyber Security Enthusiast | Full-Stack Developer