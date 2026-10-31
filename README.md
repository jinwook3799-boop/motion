# 쑥쑥 모션놀이터

웹캠만으로 즐기는 미취학 아동용 모션 인식 놀이 (PRD: [prd_document.md](prd_document.md)).
현재 1단계 MVP: **풍선 터뜨리기 & 괴물 물리치기**, **매직 악기**.

## 실행

```bash
npm install
npm run dev       # https://localhost:5173 (HTTPS 개발 서버)
npm run build     # dist/ 에 배포용 빌드
npm run preview   # 빌드 결과를 HTTPS로 미리 보기
```

`npm run dev`/`build` 전에 MediaPipe 런타임과 손 인식 모델이 `public/mediapipe/`에 자동으로 준비됩니다.

## 태블릿에서 테스트

1. PC와 태블릿을 같은 와이파이에 연결합니다.
2. `npm run dev` 실행 후 터미널의 `Network:` 주소(예: `https://192.168.x.x:5173`)를 태블릿 크롬에서 엽니다.
3. "연결이 비공개로 설정되어 있지 않습니다" 경고가 나오면 **고급 → 계속**을 누릅니다(자체 서명 인증서라서 처음 한 번만).

## GitHub Pages 배포

1. GitHub에 저장소를 만들고 이 폴더를 `main` 브랜치로 push 합니다.
2. 저장소 **Settings → Pages → Source** 를 **GitHub Actions** 로 바꿉니다.
3. 이후 `main`에 push 할 때마다 [.github/workflows/deploy.yml](.github/workflows/deploy.yml)이 자동으로 빌드·배포합니다.
4. 태블릿 크롬에서 배포 주소를 열고 메뉴 → **홈 화면에 추가**하면 앱처럼 전체 화면으로 실행됩니다.

## 구조

| 경로 | 역할 |
| --- | --- |
| `src/engine/Game.js` | 게임 루프: 카메라 → 손 인식 → 장면 업데이트 → 그리기, 이탈/조명 감지 |
| `src/engine/handTracker.js` | MediaPipe HandLandmarker (GPU 실패 시 CPU) |
| `src/engine/audio.js` | Web Audio 합성 효과음·악기 |
| `src/engine/voice.js` | 한국어 TTS 음성 안내 |
| `src/scenes/*` | 메뉴, 풍선, 악기 장면 |
| `src/App.jsx` | 시작·로딩·카메라 거부 화면 |

손 대신 마우스/터치로도 조작할 수 있어 웹캠 없이 PC에서 동작을 확인할 수 있습니다.
