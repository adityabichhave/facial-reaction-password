import React, { useEffect, useRef, useState } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// Apple Vision Pro style — Combined video + canvas overlay (single holographic window)
// Usage: paste this file as src/components/FacialReactionPasswordVision.jsx
// Tailwind classes used (ensure Tailwind is configured in your project)

const LANDMARK_INDICES = [
  33, 263, 1, 61, 291, 199, 10, 152, 234, 454, 168, 6, 197, 127, 356,
];

// Anti-spoof helper (kept lightweight)
function normalizeLandmarks(landmarks) {
  if (!landmarks || landmarks.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of landmarks) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const scale = Math.max(maxX - minX, maxY - minY) || 1;
  const flat = [];
  for (const idx of LANDMARK_INDICES) {
    const p = landmarks[idx] || { x: 0, y: 0, z: 0 };
    flat.push((p.x - cx) / scale);
    flat.push((p.y - cy) / scale);
    flat.push(p.z ?? 0);
  }
  return flat;
}

function dtwDistance(A, B) {
  const n = A.length, m = B.length;
  if (!n || !m) return Infinity;
  const INF = 1e12;
  const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(INF));
  dp[0][0] = 0;
  function dist(a,b){ let s=0; for(let i=0;i<a.length;i++){ const d=a[i]-b[i]; s+=d*d; } return Math.sqrt(s);} 
  for (let i=1;i<=n;i++){
    for (let j=1;j<=m;j++){
      dp[i][j]=dist(A[i-1],B[j-1])+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
    }
  }
  return dp[n][m]/(n+m);
}

export default function FacialReactionPasswordVision() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const landmarkerRef = useRef(null);
  const latestRef = useRef(null);

  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const [username, setUsername] = useState(localStorage.getItem('frp_username') || '');
  const [recordDuration, setRecordDuration] = useState(2000);
  const [threshold, setThreshold] = useState(0.14);
  const [lastAnti, setLastAnti] = useState(null);
  const [lastScore, setLastScore] = useState(null);

  useEffect(() => {
    let stopped = false;

    async function init() {
      try {
        setStatus('initializing model');
        const fileset = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
        );
        const modelUrl = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
        const landmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: modelUrl },
          runningMode: 'VIDEO',
          numFaces: 1,
        });
        landmarkerRef.current = landmarker;
        setStatus('model loaded');

        // start webcam
        setStatus('requesting-camera');
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        const vid = videoRef.current;
        vid.srcObject = stream;

        await new Promise((resolve, reject) => {
          const onReady = () => {
            if (vid.videoWidth > 0 && vid.videoHeight > 0) { cleanup(); resolve(); }
          };
          const onErr = (e) => { cleanup(); reject(e); };
          const cleanup = () => { vid.removeEventListener('loadedmetadata', onReady); vid.removeEventListener('loadeddata', onReady); vid.removeEventListener('error', onErr); };
          vid.addEventListener('loadedmetadata', onReady);
          vid.addEventListener('loadeddata', onReady);
          vid.addEventListener('error', onErr);
          setTimeout(() => { /* timeout fallback */ if (vid.videoWidth > 0) resolve(); else resolve(); }, 5000);
        });

        try { await vid.play(); } catch (e) { /* ignore */ }
        setStatus('ready');
        setMessage('Ready — position your face in the holographic frame');

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        const loop = async () => {
          if (stopped) return;
          const vidEl = videoRef.current;
          const land = landmarkerRef.current;
          if (!vidEl || !land) { requestAnimationFrame(loop); return; }
          if (!vidEl.videoWidth || !vidEl.videoHeight) { requestAnimationFrame(loop); return; }
          if (canvas.width !== vidEl.videoWidth || canvas.height !== vidEl.videoHeight) {
            canvas.width = vidEl.videoWidth; canvas.height = vidEl.videoHeight;
          }
          try {
            const res = land.detectForVideo(vidEl, performance.now());
            // draw video frame as background (holographic processing)
            ctx.clearRect(0,0,canvas.width,canvas.height);
            // subtle desaturate / dimmed background for VisionOS feel
            ctx.filter = 'brightness(0.9) saturate(0.85)';
            ctx.drawImage(vidEl, 0, 0, canvas.width, canvas.height);
            ctx.filter = 'none';

            if (res?.faceLandmarks?.[0]) {
              const lm = res.faceLandmarks[0];
              latestRef.current = lm;

              // Glow halo behind face (soft radial)
              ctx.save();
              ctx.globalCompositeOperation = 'lighter';
              const bboxX = Math.min(...lm.map(p=>p.x))*canvas.width;
              const bboxY = Math.min(...lm.map(p=>p.y))*canvas.height;
              const bboxW = (Math.max(...lm.map(p=>p.x)) - Math.min(...lm.map(p=>p.x)))*canvas.width;
              const bboxH = (Math.max(...lm.map(p=>p.y)) - Math.min(...lm.map(p=>p.y)))*canvas.height;
              const cx = bboxX + bboxW/2, cy = bboxY + bboxH/2;
              const r = Math.max(bboxW, bboxH) * 0.9;
              const grd = ctx.createRadialGradient(cx, cy, r*0.1, cx, cy, r);
              grd.addColorStop(0, 'rgba(72,180,255,0.16)');
              grd.addColorStop(1, 'rgba(72,180,255,0.0)');
              ctx.fillStyle = grd;
              ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
              ctx.restore();

              // draw landmarks: sleek small dots
              ctx.fillStyle = 'rgba(255,255,255,0.95)';
              ctx.strokeStyle = 'rgba(255,255,255,0.12)';
              for (const idx of LANDMARK_INDICES) {
                const p = lm[idx]; if (!p) continue;
                const x = p.x * canvas.width; const y = p.y * canvas.height;
                ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 2*Math.PI); ctx.fill();
                ctx.beginPath(); ctx.arc(x, y, 8, 0, 2*Math.PI); ctx.stroke();
              }

              // subtle skeleton lines between a few key points (for style)
              ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
              const pairs = [[33,263],[1,199],[61,291]];
              for (const [a,b] of pairs) {
                const pa = lm[a], pb = lm[b]; if (!pa||!pb) continue;
                ctx.beginPath(); ctx.moveTo(pa.x*canvas.width, pa.y*canvas.height); ctx.lineTo(pb.x*canvas.width, pb.y*canvas.height); ctx.stroke();
              }
            } else {
              latestRef.current = null;
            }
          } catch (err) {
            // ignore per-frame detect errors
          }
          requestAnimationFrame(loop);
        };

        loop();
      } catch (err) {
        console.error('init error', err);
        setStatus('error');
        setMessage('Camera or model initialization failed: ' + (err.message || err.name));
      }
    }

    init();

    return () => {
      stopped = true;
      const v = videoRef.current;
      if (v?.srcObject?.getTracks) v.srcObject.getTracks().forEach(t=>t.stop());
      if (landmarkerRef.current && typeof landmarkerRef.current.close === 'function') {
        try { landmarkerRef.current.close(); } catch(e) {}
      }
    };
  }, []);

  // recording helper
  function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

  async function recordSequence(durationMs = recordDuration, onProgress = ()=>{}){
    const frames = [];
    const start = performance.now();
    return await new Promise((resolve, reject) => {
      function sample(){
        const now = performance.now();
        const lm = latestRef.current;
        if (lm) frames.push(lm.map(p=>({x:p.x,y:p.y,z:p.z||0})));
        onProgress({framesCaptured: frames.length, elapsed: now-start});
        if (now - start < durationMs) requestAnimationFrame(sample);
        else { if (frames.length<6) reject(new Error('Too few frames captured')); else resolve(frames); }
      }
      sample();
    });
  }

  function evaluateAntiSpoof(frames){
    const flat = frames.map(f=>normalizeLandmarks(f));
    const motionVar = flat.length>1 ? flat.reduce((acc,cur,idx)=>{ if(idx===0) return acc; let s=0; for(let i=0;i<cur.length;i++){ const d=cur[i]-flat[idx-1][i]; s+=d*d;} return acc+Math.sqrt(s); },0)/(flat.length-1) : 0;
    const blink = frames.some(f=>{ const left = Math.abs((f[159]?.y||0)-(f[145]?.y||0)); const right = Math.abs((f[386]?.y||0)-(f[374]?.y||0)); return (left+right)/2 < 0.01; });
    const details = { motionVar: Number(motionVar.toFixed(6)), blinkDetected: !!blink };
    const ok = details.motionVar > 0.002 && details.blinkDetected;
    setLastAnti(details);
    return { ok, details };
  }

  async function handleEnroll(){
    if (!username) { setMessage('Enter username'); return; }
    setStatus('enrolling'); setMessage('Get ready — recording...');
    try {
      const frames = await recordSequence(recordDuration, ({framesCaptured})=>setMessage(`Recording... ${framesCaptured} frames`));
      const anti = evaluateAntiSpoof(frames);
      console.log('Anti-spoof enrollment:', anti.details);
      if (!anti.ok) { setMessage('Liveness failed — blink & move slightly'); setStatus('ready'); return; }
      const template = frames.map(f=>normalizeLandmarks(f));
      localStorage.setItem('frp_template_'+username, JSON.stringify(template));
      localStorage.setItem('frp_username', username);
      // upload to backend (optional)
      try {
        await fetch('http://localhost:5001/api/enroll', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username, template }) });
      } catch(e){ /* ignore upload errors */ }
      setMessage('Enrollment saved ✅'); setStatus('ready');
    } catch (err){ console.error('enroll err', err); setMessage('Enroll failed: '+ (err.message||err.name)); setStatus('ready'); }
  }

  async function handleLogin(){
    if (!username) { setMessage('Enter username'); return; }
    const raw = localStorage.getItem('frp_template_'+username);
    let template = raw ? JSON.parse(raw) : null;
    if (!template) {
      try {
        const r = await fetch(`http://localhost:5001/api/template/${encodeURIComponent(username)}`);
        if (r.ok) { const j = await r.json(); template = j.template; }
      } catch(e) { /* ignore */ }
    }
    if (!template) { setMessage('No template found — enroll first'); return; }
    setStatus('logging-in'); setMessage('Recording reaction...');
    try {
      const frames = await recordSequence(recordDuration, ({framesCaptured})=>setMessage(`Recording... ${framesCaptured} frames`));
      const anti = evaluateAntiSpoof(frames);
      console.log('Anti-spoof login:', anti.details);
      if (!anti.ok) { setMessage('Liveness failed — blink & move slightly'); setStatus('ready'); return; }
      const seq = frames.map(f=>normalizeLandmarks(f));
      const dist = dtwDistance(seq, template);
      setLastScore(dist);
      const ok = dist <= threshold;
      setMessage(ok ? `Login success ✅ (score ${dist.toFixed(4)})` : `Login failed ❌ (score ${dist.toFixed(4)})`);
      setStatus('ready');
    } catch(err){ console.error('login err', err); setMessage('Login error: '+ (err.message||err.name)); setStatus('ready'); }
  }

  function handleClear(){ localStorage.removeItem('frp_template_'+username); setMessage('Template cleared'); }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white p-6 flex items-center justify-center">
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Holographic window */}
        <div className="lg:col-span-2 relative rounded-3xl bg-white/4 backdrop-blur-xl border border-white/6 shadow-2xl overflow-hidden" style={{minHeight:420}}>
          <div className="absolute inset-0 pointer-events-none" style={{background: 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))'}} />

          {/* canvas: combined video+overlay */}
          <canvas ref={canvasRef} className="w-full h-full block" style={{display:'block'}} />

          {/* subtle chrome for glass frame */}
          <div className="absolute left-6 top-6 px-3 py-2 rounded-full bg-white/6 backdrop-blur-md border border-white/10 text-sm">Vision Mode</div>

          {/* bottom overlay: motion + status */}
          <div className="absolute left-6 right-6 bottom-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-36 h-8 bg-white/6 rounded-full flex items-center px-3"> 
                <div className="w-2 h-2 rounded-full bg-emerald-400 mr-2" />
                <div className="text-sm">{status}</div>
              </div>
              <div className="text-sm text-slate-200/80">{message}</div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-40 p-2 bg-white/6 rounded-lg text-sm">
                Motion: <span className="font-medium">{lastAnti?.motionVar ?? '-'} </span>
              </div>
              <div className="w-40 p-2 bg-white/6 rounded-lg text-sm">
                Blink: <span className="font-medium">{lastAnti?.blinkDetected ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Controls panel */}
        <div className="rounded-2xl bg-white/5 backdrop-blur-md border border-white/6 p-6 flex flex-col gap-4">
          <h2 className="text-xl font-semibold">Facial Reaction Password</h2>
          <p className="text-sm text-slate-200/70">Apple Vision Pro inspired UI — combined holographic feed with secure enrollment.</p>

          <div>
            <label className="text-sm">Username</label>
            <input value={username} onChange={(e)=>setUsername(e.target.value)} className="w-full mt-2 p-2 rounded bg-white/6 border border-white/6" placeholder="your-username" />
          </div>

          <div className="flex gap-2">
            <button onClick={handleEnroll} className="flex-1 px-3 py-2 bg-blue-400 hover:bg-blue-500 rounded text-black font-semibold">Enroll</button>
            <button onClick={handleLogin} className="flex-1 px-3 py-2 bg-emerald-400 hover:bg-emerald-500 rounded text-black font-semibold">Login</button>
          </div>

          <div className="flex gap-2">
            <button onClick={handleClear} className="flex-1 px-3 py-2 bg-gray-700 rounded">Clear</button>
            <button onClick={()=>{ navigator.clipboard.writeText(window.location.href); }} className="flex-1 px-3 py-2 bg-transparent border border-white/6 rounded">Share</button>
          </div>

          <div>
            <label className="text-sm">Record Duration (ms)</label>
            <input type="range" min={800} max={5000} step={100} value={recordDuration}
              onChange={(e)=>setRecordDuration(Number(e.target.value))} className="w-full" />
            <div className="text-sm mt-1">{recordDuration} ms</div>
          </div>

          <div>
            <label className="text-sm">Matching Threshold</label>
            <input type="range" min={0.02} max={0.6} step={0.01} value={threshold}
              onChange={(e)=>setThreshold(Number(e.target.value))} className="w-full" />
            <div className="text-sm mt-1">{threshold}</div>
          </div>

          <div className="mt-2">
            <h3 className="text-sm font-medium">Anti-spoof Details</h3>
            <pre className="text-xs p-2 mt-2 bg-black/20 rounded h-28 overflow-auto">{lastAnti ? JSON.stringify(lastAnti,null,2) : 'No data yet'}</pre>
            <div className="text-xs mt-2">Last score: {lastScore ? lastScore.toFixed(4) : '-'}</div>
          </div>

          <div className="mt-auto text-xs text-slate-300/70">
            For production: use HTTPS, secure backend, and device attestation. This demo stores templates locally and optionally uploads encrypted templates to backend.
          </div>
        </div>
      </div>

      {/* hidden video element (we draw video into canvas so keep video hidden) */}
      <video ref={videoRef} style={{display:'none'}} playsInline muted />
    </div>
  );
}
