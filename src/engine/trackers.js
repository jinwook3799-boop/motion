import { FaceLandmarker, FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';

const BASE = import.meta.env.BASE_URL;

// 유아는 손이 작고 동작이 불분명하므로 인식 기준을 기본값(0.5)보다 낮춰 관대하게 잡는다.
const MIN_CONFIDENCE = 0.4;
// 이미 찾은 손·몸을 계속 따라가는 기준은 더 낮춘다. 빠르게 움직여 흐릿해진 프레임에서도 놓치지 않게.
const MIN_TRACKING = 0.3;

const factories = {
  hands: (fileset, delegate) =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${BASE}mediapipe/hand_landmarker.task`, delegate },
      runningMode: 'VIDEO',
      numHands: 4, // 아이 두 명의 양손
      minHandDetectionConfidence: MIN_CONFIDENCE,
      minHandPresenceConfidence: MIN_TRACKING,
      minTrackingConfidence: MIN_TRACKING,
    }),
  pose: (fileset, delegate) =>
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${BASE}mediapipe/pose_landmarker_lite.task`, delegate },
      runningMode: 'VIDEO',
      numPoses: 2, // 아이 두 명
      minPoseDetectionConfidence: MIN_CONFIDENCE,
      minPosePresenceConfidence: MIN_TRACKING,
      minTrackingConfidence: MIN_TRACKING,
    }),
  // 표정 놀이용: 얼굴 점과 표정 점수(blendshapes: 웃음, 입 벌림, 눈썹 올림 등)
  face: (fileset, delegate) =>
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${BASE}mediapipe/face_landmarker.task`, delegate },
      runningMode: 'VIDEO',
      numFaces: 2, // 아이 두 명
      outputFaceBlendshapes: true,
      minFaceDetectionConfidence: MIN_CONFIDENCE,
      minFacePresenceConfidence: MIN_TRACKING,
      minTrackingConfidence: MIN_TRACKING,
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
    const t = await factories[kind](fileset, 'GPU');
    delegates[kind] = 'GPU';
    return t;
  } catch (err) {
    console.warn(`${kind}: GPU 가속을 쓸 수 없어 CPU로 전환합니다.`, err);
    delegates[kind] = 'CPU';
    return factories[kind](fileset, 'CPU');
  }
}

// 인식기가 GPU 로 도는지 CPU 로 도는지(CPU 면 태블릿에서 매우 느리다). 성능 표시용
const delegates = {};
export const trackerDelegate = (kind) => delegates[kind];

// kind: 'hands' | 'pose' | 'face'. 한 번 만든 인식기는 재사용한다.
export function loadTracker(kind) {
  cache[kind] ??= create(kind).catch((err) => {
    delete cache[kind];
    throw err;
  });
  return cache[kind];
}
