import React, { useEffect, useRef, useState } from 'react';
import { 
  ShieldAlert, 
  Camera, 
  AlertCircle, 
  Activity,
  PlayCircle,
  Volume2,
  VolumeX
} from 'lucide-react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

/**
 * DRIVER SAFETY SENTINEL - PROFESSIONAL DROWSINESS DETECTION
 * * To use this in VS Code:
 * 1. Open your project folder.
 * 2. If 'App.js' does not exist in the 'src' folder, create it.
 * 3. Delete everything in 'App.js' and paste this entire code.
 * 4. Ensure 'index.js' has a line like: import App from './App';
 */

// Professional Safety Thresholds
const EAR_THRESHOLD = 0.22; // Eye Aspect Ratio below this = closed
const CONSECUTIVE_FRAMES = 15; // Number of frames to confirm sleep (approx 0.5s)

const App = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const audioRef = useRef(null);
  
  const [status, setStatus] = useState('idle'); // idle, loading, active, error
  const [isDrowsy, setIsDrowsy] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  
  const frameCounter = useRef(0);
  const detector = useRef(null);
  const requestRef = useRef();

  // Initialize AI and Camera
  const initSystem = async () => {
    setStatus('loading');
    setErrorMessage('');

    try {
      // 1. Request Camera Access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480, facingMode: 'user' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // 2. Setup MediaPipe Face Landmarker
      const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
      
      detector.current = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
          delegate: "GPU"
        },
        outputFaceBlendshapes: true,
        runningMode: "VIDEO",
        numFaces: 1
      });

      setStatus('active');
      requestRef.current = requestAnimationFrame(predictWebcam);
    } catch (err) {
      console.error("Initialization Error:", err);
      setStatus('error');
      setErrorMessage(err.name === 'NotAllowedError' 
        ? "Camera permission denied. Check browser settings." 
        : "Failed to initialize AI. Check internet connection.");
    }
  };

  const getDistance = (p1, p2) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

  const predictWebcam = async () => {
    if (!detector.current || !videoRef.current || videoRef.current.paused) return;

    const startTimeMs = performance.now();
    const results = detector.current.detectForVideo(videoRef.current, startTimeMs);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Clear and draw video frame
    ctx.save();
    ctx.scale(-1, 1); // Mirror for natural feel
    ctx.translate(-canvas.width, 0);
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    if (results.faceLandmarks && results.faceLandmarks.length > 0) {
      const landmarks = results.faceLandmarks[0];
      
      // Points for EAR calculation (MediaPipe indices)
      const leftEye = [landmarks[33], landmarks[160], landmarks[158], landmarks[133], landmarks[153], landmarks[144]];
      const rightEye = [landmarks[362], landmarks[385], landmarks[387], landmarks[263], landmarks[373], landmarks[380]];
      
      const calculateEAR = (eye) => {
        const v1 = getDistance(eye[1], eye[5]);
        const v2 = getDistance(eye[2], eye[4]);
        const h = getDistance(eye[0], eye[3]);
        return (v1 + v2) / (2.0 * h);
      };

      const earAvg = (calculateEAR(leftEye) + calculateEAR(rightEye)) / 2;

      // Detection Logic
      if (earAvg < EAR_THRESHOLD) {
        frameCounter.current++;
        if (frameCounter.current > CONSECUTIVE_FRAMES) {
          setIsDrowsy(true);
        }
      } else {
        frameCounter.current = 0;
        setIsDrowsy(false);
      }

      // Draw Landmarks feedback
      ctx.fillStyle = earAvg < EAR_THRESHOLD ? "#ff4444" : "#44ff44";
      [...leftEye, ...rightEye].forEach(p => {
        ctx.beginPath();
        // Adjust for mirror
        const x = (1 - p.x) * canvas.width;
        const y = p.y * canvas.height;
        ctx.arc(x, y, 2, 0, 2 * Math.PI);
        ctx.fill();
      });
    }

    requestRef.current = requestAnimationFrame(predictWebcam);
  };

  // Sound Management
  useEffect(() => {
    if (isDrowsy && !isMuted && status === 'active') {
      audioRef.current?.play().catch(() => {});
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    }
  }, [isDrowsy, isMuted, status]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (detector.current) detector.current.close();
    };
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-10 font-sans">
      <header className="flex justify-between items-center max-w-5xl mx-auto mb-10">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-2 rounded-lg shadow-[0_0_20px_rgba(37,99,235,0.4)]">
            <ShieldAlert size={28} />
          </div>
          <h1 className="text-xl font-black uppercase tracking-tighter">Driver Sentinel <span className="text-blue-500 text-xs ml-1 font-mono">v1.0.0</span></h1>
        </div>
        <button 
          onClick={() => setIsMuted(!isMuted)}
          className={`p-3 rounded-xl border transition-all ${isMuted ? 'bg-red-500/10 border-red-500/50 text-red-500' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}
        >
          {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>
      </header>

      <main className="max-w-5xl mx-auto grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="relative rounded-[2rem] overflow-hidden border-4 border-zinc-900 bg-zinc-900 aspect-video shadow-2xl">
            <video ref={videoRef} className="hidden" muted playsInline />
            <canvas ref={canvasRef} width={640} height={480} className="w-full h-full object-cover" />
            <audio ref={audioRef} loop src="https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg" />

            {status === 'idle' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 text-center">
                <div className="w-20 h-20 bg-zinc-800 rounded-full flex items-center justify-center mb-6">
                  <Camera size={40} className="text-zinc-600" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Ready to Secure</h2>
                <p className="text-zinc-500 mb-8 max-w-xs px-4">AI-powered facial tracking to prevent road accidents due to fatigue.</p>
                <button 
                  onClick={initSystem}
                  className="bg-blue-600 hover:bg-blue-500 px-10 py-4 rounded-full font-bold flex items-center gap-3 transition-all transform hover:scale-105 active:scale-95 shadow-xl shadow-blue-900/40"
                >
                  <PlayCircle size={22} /> START MONITORING
                </button>
              </div>
            )}

            {status === 'loading' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-md">
                <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6" />
                <p className="font-mono text-blue-400 animate-pulse text-sm">CALIBRATING NEURAL MODELS...</p>
              </div>
            )}

            {status === 'error' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-950/95 text-center p-8">
                <AlertCircle size={56} className="text-red-500 mb-6" />
                <h2 className="text-2xl font-bold mb-2 text-white">Initialization Failed</h2>
                <p className="text-red-300/80 mb-8 text-sm italic">{errorMessage}</p>
                <button onClick={initSystem} className="bg-white/10 hover:bg-white/20 px-6 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-colors">Re-attempt Sync</button>
              </div>
            )}

            {isDrowsy && (
              <div className="absolute inset-0 border-[16px] border-red-600 animate-pulse pointer-events-none flex items-center justify-center bg-red-600/30">
                <div className="bg-red-600 text-white text-7xl font-black px-12 py-8 rounded-3xl shadow-[0_0_100px_rgba(220,38,38,1)] transform scale-110">
                  WAKE UP!
                </div>
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-4">
             <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl">
                <p className="text-zinc-500 text-xs font-bold uppercase mb-2">System Sensitivity</p>
                <p className="text-xl font-bold text-blue-400">High Resolution</p>
             </div>
             <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl">
                <p className="text-zinc-500 text-xs font-bold uppercase mb-2">Network Latency</p>
                <p className="text-xl font-bold text-green-400">On-Device AI</p>
             </div>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-[2.5rem] shadow-xl">
            <h3 className="flex items-center gap-2 text-zinc-400 text-xs font-black uppercase mb-8 tracking-widest">
              <Activity size={16} className="text-blue-500" /> Live Diagnostics
            </h3>
            
            <div className="space-y-10">
              <div className="relative pt-2">
                <div className={`text-5xl font-black tracking-tighter ${isDrowsy ? 'text-red-500' : status === 'active' ? 'text-green-500' : 'text-zinc-700'}`}>
                  {isDrowsy ? "DANGER" : status === 'active' ? "SECURE" : "OFFLINE"}
                </div>
                <p className="text-zinc-500 text-xs mt-2 uppercase font-mono tracking-tighter">Real-time driver status</p>
              </div>

              <div className="space-y-6 border-t border-zinc-800 pt-8">
                <div className="flex items-center gap-4 group">
                  <div className={`w-3 h-3 rounded-full transition-all duration-500 ${status === 'active' ? 'bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.6)]' : 'bg-zinc-700'}`} />
                  <span className="text-sm font-medium text-zinc-300">Neural Network Active</span>
                </div>
                <div className="flex items-center gap-4 group">
                  <div className={`w-3 h-3 rounded-full transition-all duration-500 ${!isMuted ? 'bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.6)]' : 'bg-zinc-700'}`} />
                  <span className="text-sm font-medium text-zinc-300">Auditory Alert System</span>
                </div>
                <div className="flex items-center gap-4 group">
                  <div className={`w-3 h-3 rounded-full transition-all duration-500 ${status === 'active' ? 'bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.6)]' : 'bg-zinc-700'}`} />
                  <span className="text-sm font-medium text-zinc-300">Landmark Telemetry</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-blue-600 p-8 rounded-[2.5rem] text-white">
            <h4 className="font-bold mb-2">Professional Safety Note</h4>
            <p className="text-sm text-blue-100 leading-relaxed">
              Always ensure proper lighting. This system is designed as an assistive tool and does not replace human responsibility.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
};

export default App;