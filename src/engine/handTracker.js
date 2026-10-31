import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

const BASE = import.meta.env.BASE_URL;

// 유아는 손이 작고 동작이 불분명하므로 인식 기준을 기본값(0.5)보다 낮춰 관대하게 잡는다.
const options = (delegate) => ({
  baseOptions: {
    modelAssetPath: `${BASE}mediapipe/hand_landmarker.task`,
    delegate,
  },
  runningMode: 'VIDEO',
  numHands: 2,
  minHandDetectionConfidence: 0.4,
  minHandPresenceConfidence: 0.4,
  minTrackingConfidence: 0.4,
});

export async function createHandTracker() {
  const fileset = await FilesetResolver.forVisionTasks(`${BASE}mediapipe/wasm`);
  try {
    return await HandLandmarker.createFromOptions(fileset, options('GPU'));
  } catch (err) {
    console.warn('GPU 가속을 쓸 수 없어 CPU로 전환합니다.', err);
    return HandLandmarker.createFromOptions(fileset, options('CPU'));
  }
}
