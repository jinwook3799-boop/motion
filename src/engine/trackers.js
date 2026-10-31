import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';

const BASE = import.meta.env.BASE_URL;

// 유아는 손이 작고 동작이 불분명하므로 인식 기준을 기본값(0.5)보다 낮춰 관대하게 잡는다.
const MIN_CONFIDENCE = 0.4;

const factories = {
  hands: (fileset, delegate) =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${BASE}mediapipe/hand_landmarker.task`, delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: MIN_CONFIDENCE,
      minHandPresenceConfidence: MIN_CONFIDENCE,
      minTrackingConfidence: MIN_CONFIDENCE,
    }),
  pose: (fileset, delegate) =>
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${BASE}mediapipe/pose_landmarker_lite.task`, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: MIN_CONFIDENCE,
      minPosePresenceConfidence: MIN_CONFIDENCE,
      minTrackingConfidence: MIN_CONFIDENCE,
    }),
};

let filesetPromise = null;
const cache = {};

async function create(kind) {
  filesetPromise ??= FilesetResolver.forVisionTasks(`${BASE}mediapipe/wasm`).catch((err) => {
    filesetPromise = null;
    throw err;
  });
  const fileset = await filesetPromise;
  try {
    return await factories[kind](fileset, 'GPU');
  } catch (err) {
    console.warn(`${kind}: GPU 가속을 쓸 수 없어 CPU로 전환합니다.`, err);
    return factories[kind](fileset, 'CPU');
  }
}

// kind: 'hands' | 'pose'. 한 번 만든 인식기는 재사용한다.
export function loadTracker(kind) {
  cache[kind] ??= create(kind).catch((err) => {
    delete cache[kind];
    throw err;
  });
  return cache[kind];
}
