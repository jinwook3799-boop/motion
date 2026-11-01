// MediaPipe WASM 런타임과 손 인식 모델을 public/mediapipe 에 준비한다.
// 외부 CDN 없이 앱이 직접 서빙해야 PWA 오프라인 실행과 느린 와이파이에서도 안정적이다.
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'mediapipe');
const wasmSrc = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const wasmOut = join(outDir, 'wasm');

// SIMD 지원 브라우저용(기본)과 미지원 브라우저용(예비)만 복사한다.
const WASM_FILES = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
];

const MODELS = {
  'hand_landmarker.task':
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  'pose_landmarker_lite.task':
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  'face_landmarker.task':
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
};

mkdirSync(wasmOut, { recursive: true });
for (const file of WASM_FILES) {
  copyFileSync(join(wasmSrc, file), join(wasmOut, file));
}

for (const [file, url] of Object.entries(MODELS)) {
  const dest = join(outDir, file);
  if (existsSync(dest)) continue;
  console.log(`모델 다운로드: ${file}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} 다운로드 실패 (${res.status})`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

console.log('MediaPipe 준비 완료');
