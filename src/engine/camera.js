let currentStream = null;

export async function startCamera(video) {
  // HTTP(비보안) 주소에서는 mediaDevices 자체가 없다.
  if (!navigator.mediaDevices?.getUserMedia) {
    const err = new Error('카메라는 HTTPS 또는 localhost 에서만 사용할 수 있습니다.');
    err.name = 'SecurityError';
    throw err;
  }

  currentStream?.getTracks().forEach((t) => t.stop());
  currentStream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: 'user',
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 30 },
    },
  });

  video.srcObject = currentStream;
  await video.play();
  return currentStream;
}
