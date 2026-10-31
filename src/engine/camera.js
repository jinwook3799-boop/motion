let currentStream = null;

export async function startCamera(video) {
  // HTTP(비보안) 주소에서는 mediaDevices 자체가 없다.
  if (!navigator.mediaDevices?.getUserMedia) {
    const err = new Error('카메라는 HTTPS 또는 localhost 에서만 사용할 수 있습니다.');
    err.name = 'SecurityError';
    throw err;
  }

  currentStream?.getTracks().forEach((t) => t.stop());
  // 태블릿 전면 카메라 센서는 대부분 4:3 이라 16:9 로 받으면 위아래가 잘린다.
  // 4:3 으로 받아야 두 아이가 함께 들어올 만큼 넓게 보인다.
  currentStream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: 'user',
      width: { ideal: 1280 },
      height: { ideal: 960 },
      aspectRatio: { ideal: 4 / 3 },
      frameRate: { ideal: 30, max: 30 },
    },
  });

  // 줌을 지원하는 카메라는 가장 넓게(최소 줌) 맞춘다.
  const track = currentStream.getVideoTracks()[0];
  const zoom = track?.getCapabilities?.().zoom;
  if (zoom) await track.applyConstraints({ advanced: [{ zoom: zoom.min }] }).catch(() => {});

  video.srcObject = currentStream;
  await video.play();
  return currentStream;
}
