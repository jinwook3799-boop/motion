import { useCallback, useEffect, useRef, useState } from 'react';
import Stage from './components/Stage.jsx';
import { CameraOffIcon, PlayIcon, RetryIcon, SadCloudIcon } from './components/Icons.jsx';
import { startCamera } from './engine/camera.js';
import { createHandTracker } from './engine/handTracker.js';
import { sfx, unlockAudio } from './engine/audio.js';
import { speak } from './engine/voice.js';

const DENIED_ERRORS = new Set(['NotAllowedError', 'SecurityError', 'NotFoundError', 'OverconstrainedError']);

export default function App() {
  const videoRef = useRef(null);
  const trackerRef = useRef(null);
  const trackerPromiseRef = useRef(null);
  // start → loading → ready | denied | error
  const [phase, setPhase] = useState('start');

  const handleStart = useCallback(async () => {
    // 첫 터치에서 소리·음성을 깨워야 이후 자동 재생이 된다.
    unlockAudio();
    sfx.select();
    speak('안녕! 같이 놀자!');
    setPhase('loading');

    trackerPromiseRef.current ??= createHandTracker().catch((err) => {
      trackerPromiseRef.current = null;
      throw err;
    });

    try {
      const [, tracker] = await Promise.all([startCamera(videoRef.current), trackerPromiseRef.current]);
      trackerRef.current = tracker;
      setPhase('ready');
    } catch (err) {
      console.error(err);
      const denied = DENIED_ERRORS.has(err?.name);
      setPhase(denied ? 'denied' : 'error');
      speak(denied ? '카메라를 켜 주세요!' : '앗, 다시 해 볼까요?');
    }
  }, []);

  useWakeLock(phase === 'ready');

  return (
    <>
      <video ref={videoRef} className="camera-feed" playsInline muted />
      {phase === 'ready' ? (
        <Stage video={videoRef.current} tracker={trackerRef.current} />
      ) : (
        <Splash phase={phase} onStart={handleStart} />
      )}
    </>
  );
}

function Splash({ phase, onStart }) {
  return (
    <div className="splash">
      <div className="floating">
        <span className="dot red" />
        <span className="dot yellow" />
        <span className="dot blue" />
        <span className="dot green" />
      </div>

      {phase === 'start' && (
        <button className="big-btn" aria-label="시작" onClick={onStart}>
          <PlayIcon />
        </button>
      )}

      {phase === 'loading' && (
        <div className="loading" aria-label="준비 중">
          <span />
          <span />
          <span />
        </div>
      )}

      {(phase === 'denied' || phase === 'error') && (
        <div className="problem">
          <div className="problem-icon">{phase === 'denied' ? <CameraOffIcon /> : <SadCloudIcon />}</div>
          <button className="retry-btn" aria-label="다시 시도" onClick={onStart}>
            <RetryIcon />
          </button>
        </div>
      )}
    </div>
  );
}

// 놀이 중 태블릿 화면이 꺼지지 않게 한다.
function useWakeLock(active) {
  useEffect(() => {
    if (!active || !navigator.wakeLock) return;
    let lock = null;
    const request = () => {
      navigator.wakeLock.request('screen').then((l) => (lock = l)).catch(() => {});
    };
    const onVisible = () => document.visibilityState === 'visible' && request();
    request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release();
    };
  }, [active]);
}
