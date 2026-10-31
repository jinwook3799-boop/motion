import { useEffect, useRef, useState } from 'react';
import { Game } from '../engine/Game.js';
import { FullscreenIcon, HomeIcon } from './Icons.jsx';

export default function Stage({ video, tracker }) {
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const [scene, setScene] = useState('menu');

  useEffect(() => {
    const game = new Game({ canvas: canvasRef.current, video, tracker, onSceneChange: setScene });
    gameRef.current = game;
    game.start('menu');
    return () => game.destroy();
  }, [video, tracker]);

  return (
    <div className="stage">
      <canvas ref={canvasRef} />
      {scene !== 'menu' && (
        <button className="corner-btn left" aria-label="처음으로" onClick={() => gameRef.current?.goTo('menu')}>
          <HomeIcon />
        </button>
      )}
      <FullscreenButton />
    </div>
  );
}

// 보호자용: 태블릿에서 주소창 없이 전체 화면으로 전환
function FullscreenButton() {
  const [isFull, setIsFull] = useState(!!document.fullscreenElement);

  useEffect(() => {
    const onChange = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  if (!document.fullscreenEnabled) return null;

  const toggle = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  return (
    <button className="corner-btn right" aria-label="전체 화면" onClick={toggle}>
      <FullscreenIcon exit={isFull} />
    </button>
  );
}
