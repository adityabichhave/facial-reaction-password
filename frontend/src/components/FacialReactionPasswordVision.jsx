import React, { useEffect, useRef, useState } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// VisionOS Floating Card (Option 1) — single holographic video window with a right-side control panel
// File: src/components/FacialReactionPasswordVision.jsx

const LANDMARK_INDICES = [33, 263, 1, 61, 291, 199, 10, 152, 234, 454, 168, 6, 197, 127, 356];

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

        setStatus('requesting-camera');
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
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
          setTimeout(() => { if (vid.videoWidth > 0) resolve(); else resolve(); }, 4000);
        });

        try { await vid.play(); } catch (e) { /* ignore autoplay issues */ }
        setStatus('ready');
        setMessage('Ready — position your face in the holographic frame');

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        // drawing loop
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

            // draw background (slightly desaturated video)
            ctx.clearRect(0,0,canvas.width,canvas.height);
            ctx.save();
            ctx.filter = 'brightness(0.98) saturate(0.92)';
            ctx.drawImage(vidEl, 0, 0, canvas.width, canvas.height);
            ctx.restore();

            if (res?.faceLandmarks?.[0]) {
              const lm = res.faceLandmarks[0];
              latestRef.current = lm;

              // compute bbox + center
              const xs = lm.map(p => p.x); const ys = lm.map(p => p.y);
              const bboxX = Math.min(...xs)*canvas.width;
              const bboxY = Math.min(...ys)*canvas.height;
              const bboxW = (Math.max(...xs) - Math.min(...xs))*canvas.width;
              const bboxH = (Math.max(...ys) - Math.min(...ys))*canvas.height;
              const cx = bboxX + bboxW/2, cy = bboxY + bboxH/2;
              const r = Math.max(bboxW, bboxH) * 0.9;

              // draw holographic rounded frame (subtle)
              ctx.save();
              ctx.lineWidth = Math.max(2, Math.min(6, r * 0.02));
              ctx.strokeStyle = 'rgba(255,255,255,0.14)';
              ctx.shadowColor = 'rgba(60,160,255,0.12)';
              ctx.shadowBlur = 18;
              const fw = r * 1.15, fh = r * 1.15;
              const fx = cx - fw/2, fy = cy - fh/2, fr = Math.max(18, r*0.12);
              roundedRect(ctx, fx, fy, fw, fh, fr);
              ctx.stroke();
              ctx.restore();

              // holo landmark dots
              ctx.fillStyle = 'rgba(255,255,255,0.95)';
              ctx.strokeStyle = 'rgba(0,0,0,0.15)';
              for (const idx of LANDMARK_INDICES) {
                const p = lm[idx]; if (!p) continue;
                const x = p.x * canvas.width; const y = p.y * canvas.height;
                ctx.beginPath(); ctx.arc(x, y, 3, 0, 2*Math.PI); ctx.fill();
                ctx.stroke();
              }

              // nose spotlight (soft ring)
              const nose = lm[1]; if (nose) {
                ctx.save(); ctx.strokeStyle='rgba(96,196,255,0.22)'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(nose.x*canvas.width, nose.y*canvas.height, Math.max(20,r*0.08), 0, Math.PI*2); ctx.stroke(); ctx.restore();
              }
            } else {
              latestRef.current = null;
            }
          } catch (err) {
            // ignore frame errors
            console.warn('frame loop error', err);
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

  // helper: rounded rect
  function roundedRect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }

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
    const blink = frames.some(f=>{ const left = Math.abs((f[159]?.y||0)-(f[145]?.y||0)); const right = Math.abs((f[386]?.y||0)-(f[374]?.y||0)); return (left+right)/2 < 0.012; });
    const details = { motionVar: Number(motionVar.toFixed(6)), blinkDetected: !!blink };
    const ok = details.motionVar > 0.0025 && details.blinkDetected;
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
      try { const r = await fetch('http://localhost:5001/api/enroll', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username, template }) }); if (!r.ok) { console.error('backend enroll error', await r.text()); } } catch(e){ console.error('upload err', e); }
      setMessage('Enrollment saved ✅'); setStatus('ready');
    } catch (err){ console.error('enroll err', err); setMessage('Enroll failed: '+ (err.message||err.name)); setStatus('ready'); }
  }

  async function handleLogin(){
    if (!username) { setMessage('Enter username'); return; }
    const raw = localStorage.getItem('frp_template_'+username);
    let template = raw ? JSON.parse(raw) : null;
    if (!template) {
      try { const r = await fetch(`http://localhost:5001/api/template/${encodeURIComponent(username)}`); if (r.ok) { const j = await r.json(); template = j.template; } } catch(e) { console.error('fetch template err', e); }
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

  async function handleShare() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Facial Reaction Password", text: "Check this out!", url });
        setMessage("Shared successfully ✅");
        return;
      }
      await navigator.clipboard.writeText(url);
      setMessage("Link copied to clipboard 📋");
    } catch (e) {
      console.error("Share failed", e);
      alert("Copy this link manually: " + url);
    }
  }

  function handleClear() {
    if (!username) {
      setMessage("Enter username to clear");
      return;
    }
    localStorage.removeItem('frp_template_' + username);
    setLastAnti(null);
    setLastScore(null);
    setMessage('Template cleared ✓');

  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#07101a,#051119)] flex items-center justify-center p-6">
      <style>{`
        :root{ --glass: rgba(255,255,255,0.06); --glass-2: rgba(255,255,255,0.04); }
        .floating-card{ background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02)); border:1px solid rgba(255,255,255,0.06); backdrop-filter: blur(10px) saturate(1.05); }
        .control-chip{ background: rgba(10,12,14,0.45); border:1px solid rgba(255,255,255,0.03); }
        .btn-prim{ background: linear-gradient(90deg,#4aa8ff,#2dd4bf); color:#022; }
        .btn-prim:hover{ filter:brightness(1.03); transform:translateY(-2px); }
        .vision-input{ color: #ffffff; caret-color: #ffffff; outline:none; }
        .vision-input::placeholder{ color: rgba(255,255,255,0.6); }
      `}</style>

      {/* layout: left = hologram, right = control card (outside hologram) */}
      <div className="relative w-full max-w-6xl" style={{display:'flex',gap:24,alignItems:'flex-start'}}>

        {/* Hologram container (left) */}
        <div style={{flex:'1 1 65%', position:'relative'}}>
          <div className="relative rounded-3xl overflow-hidden shadow-2xl" style={{height:'60vh', background:'#051018'}}>
            <canvas ref={canvasRef} className="w-full h-full block" style={{display:'block'}} />

            {/* subtle centered holo guide (non-obstructive) */}
            <div style={{position:'absolute', left:'50%', top:'50%', transform:'translate(-50%,-50%)', pointerEvents:'none', zIndex:20}}>
              <div className="w-72 h-72 rounded-2xl" style={{border:'2px solid rgba(255,255,255,0.06)', boxShadow:'0 10px 50px rgba(8,12,16,0.6)', background:'linear-gradient(180deg, rgba(255,255,255,0.01), rgba(255,255,255,0.00))'}} />
            </div>

          </div>

          {/* black status strip below the hologram (always outside the video) */}
          <div style={{marginTop:12, display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 16px', background:'#000', borderRadius:10, color:'#e2e8f0'}}>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <div style={{width:12,height:12,borderRadius:12,background: status==='ready'?'#34d399': status==='enrolling'?'#fbbf24':'#6b7280'}} />
              <div style={{fontWeight:600}}>{status}</div>
              <div style={{opacity:0.85}}>|</div>
              <div style={{opacity:0.9}}>{message}</div>
            </div>

            <div style={{display:'flex',gap:12}}>
              <div style={{background:'transparent',padding:'6px 10px',borderRadius:8,color:'#cbd5e1',border:'1px solid rgba(255,255,255,0.03)'}}>
                Motion<br/><strong style={{fontSize:12}}>{lastAnti?.motionVar ? lastAnti.motionVar.toFixed(6) : '-'}</strong>
              </div>
              <div style={{background:'transparent',padding:'6px 10px',borderRadius:8,color:'#cbd5e1',border:'1px solid rgba(255,255,255,0.03)'}}>
                Blink<br/><strong style={{fontSize:12}}>{lastAnti?.blinkDetected? 'Yes':'No'}</strong>
              </div></div></div>

      {/* Footer line */}
      <div style={{textAlign:'center', marginTop:20, color:'#94a3b8', fontSize:12}}>
        Developed by Aditya Kumar Bichhave
      </div>

    </div>

        {/* Control card (right) — fully outside video area, not overlapping */}
        <aside className="floating-card rounded-2xl p-6 shadow-xl" style={{width:'340px', zIndex:40}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <h3 style={{margin:0,fontSize:18,fontWeight:700,color:'#f8fafc'}}>Facial Reaction Password</h3>
              <div style={{fontSize:12,color:'#9ca3af'}}>VisionOS Split Panel</div>
            </div>
            <div style={{fontSize:12,color:'#94a3b8'}}>v2025.12</div>
          </div>

          <div style={{marginTop:14}}>
            <label style={{fontSize:13,color:'#cbd5e1'}}>Username</label>
            <input value={username} onChange={(e)=>setUsername(e.target.value)} placeholder="username" className="vision-input" style={{width:'100%',marginTop:8,padding:12,borderRadius:10,border:'1px solid rgba(255,255,255,0.04)',background:'rgba(255,255,255,0.02)'}} />
          </div>

          <div style={{display:'flex',gap:10,marginTop:12}}>
            <button onClick={handleEnroll} className="btn-prim" style={{flex:1,padding:12,borderRadius:10,border:'none',fontWeight:700}}>Enroll</button>
            <button onClick={handleLogin} style={{flex:1,padding:12,borderRadius:10,border:'none',background:'#0ea5a5',color:'#012'}}>Login</button>
          </div>

          <div style={{display:'flex',gap:10,marginTop:10}}>
            <button onClick={handleClear} style={{flex:1,padding:10,borderRadius:10,border:'1px solid rgba(255,255,255,0.04)',background:'transparent',color:'#e6eef8'}}>Clear</button>
            <button onClick={handleShare} style={{flex:1,padding:10,borderRadius:10,border:'1px solid rgba(255,255,255,0.04)',background:'transparent',color:'#e6eef8'}}>Share</button>
          </div>

          <div style={{marginTop:14}}>
            <label style={{fontSize:13,color:'#cbd5e1'}}>Record Duration (ms)</label>
            <input type="range" min={800} max={5000} step={100} value={recordDuration}
              onChange={(e)=>setRecordDuration(Number(e.target.value))} style={{width:'100%'}} />
            <div style={{fontSize:12,color:'#9ca3af'}}>{recordDuration} ms</div>
          </div>

          <div style={{marginTop:10}}>
            <label style={{fontSize:13,color:'#cbd5e1'}}>Matching Threshold</label>
            <input type="range" min={0.02} max={0.6} step={0.01} value={threshold}
              onChange={(e)=>setThreshold(Number(e.target.value))} style={{width:'100%'}} />
            <div style={{fontSize:12,color:'#9ca3af'}}>{threshold}</div>
          </div>

          <div style={{marginTop:12,fontSize:12,color:'#cbd5e1'}}>
            <div style={{marginBottom:6}}>Anti-spoof</div>
            <pre style={{background:'rgba(0,0,0,0.35)',padding:10,borderRadius:8,color:'#d1e8ff',maxHeight:140,overflow:'auto'}}>{lastAnti ? JSON.stringify(lastAnti,null,2) : 'No data yet'}</pre>
            <div style={{marginTop:8,fontSize:12,color:'#9ca3af'}}>Last score: {lastScore ? lastScore.toFixed(4) : '-'}</div>
          </div>
        </aside>

        {/* hidden video element (drawn to canvas) */}
        <video ref={videoRef} style={{display:'none'}} playsInline muted />
      </div>
    </div>
  );
}
