# 쑥쑥 모션놀이터

웹캠만으로 즐기는 미취학 아동용 모션 인식 놀이 (PRD: [prd_document.md](prd_document.md)).
현재 2단계: PRD의 6개 놀이 + 두더지 잡기 + 신체 놀이 4종 + 학습 놀이 4종(총 15개), 글자 없는 음성 메뉴 흐름.
(학습 놀이는 글자·숫자를 배우는 것이 목적이라 화면에 글자를 보여 준다.)

| 놀이 | 인식 방식 |
| --- | --- |
| 풍선 터뜨리기 & 괴물 물리치기 | 손 (HandLandmarker) |
| 두더지 잡기 | 손 |
| 동물 흉내 내기 릴레이 (개구리·아기 새·펭귄·토끼) | 몸 (PoseLandmarker) |
| 멈춰! 출발! 신호등 놀이 | 프레임 차이 + 몸 |
| 점프 달리기 (통나무는 점프, 새는 앉기) | 몸 |
| 칙칙폭폭 기차 (제자리 달리기) | 몸(무릎, 안 보이면 어깨 들썩임) + 프레임 차이 |
| 포즈 따라 하기 | 몸 |
| 하늘 별 따기 | 몸 |
| 동물 소리 듣고 찾기 | 손 |
| 매직 악기 | 손 |
| 무지개 그리기 | 손 |
| 숨은그림찾기 (손으로 동그라미 그리기) | 손 |
| 숫자 놀이 (덧셈·뺄셈, 두 자리까지) | 손 |
| 한글 놀이 (그림 보고 낱말 고르기) | 손 |
| 알파벳 놀이 (듣고 대문자 고르기) | 손 |

메뉴에서 그림 위에 손을 올리면 놀이 이름을 말해 주고, 1.5초 올려 두면 시작합니다.
놀이 중에는 왼쪽 위 집 아이콘에 손을 1.5초 올려 두면 메뉴로 돌아갑니다.

## 실행

```bash
npm install
npm run dev       # https://localhost:5173 (HTTPS 개발 서버)
npm run build     # dist/ 에 배포용 빌드
npm run preview   # 빌드 결과를 HTTPS로 미리 보기
```

`npm run dev`/`build` 전에 MediaPipe 런타임과 손 인식 모델이 `public/mediapipe/`에 자동으로 준비됩니다.

## 학습 놀이 음성 만들기 (Gemini TTS)

알파벳·한글 놀이는 기기 음성 대신 미리 만든 자연스러운 음성 파일(`public/voices/`)을 재생합니다.
파일이 없으면 기기 음성으로 읽습니다.

1. [Google AI Studio](https://aistudio.google.com/apikey)에서 Gemini API 키를 발급받습니다.
2. 프로젝트 폴더에 `.env.local` 파일을 만들고 한 줄을 적습니다(이 파일은 git에 올라가지 않습니다).
   ```
   GEMINI_API_KEY=발급받은키
   ```
3. `npm run voices` 를 실행합니다. 알파벳 26개, 낱말 18개, 안내 문장 7개가 만들어집니다.
4. `public/voices/` 의 파일을 들어 보고, 마음에 들지 않는 파일은 지운 뒤 다시 실행하면 그 파일만 새로 만듭니다.
   - 목소리 바꾸기: `.env.local` 에 `GEMINI_TTS_VOICE=Kore` 처럼 추가(기본값 `Leda`)
   - 무료 사용 한도에 걸리면 만든 파일은 남아 있으니 다음 날 다시 실행하면 이어서 만듭니다.
5. 만든 파일을 커밋해 올리면 배포된 앱에도 적용됩니다.

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
| `src/engine/Game.js` | 게임 루프: 카메라 → 손/몸 인식 → 장면 업데이트 → 그리기, 프레임 차이, 이탈/조명 감지, 집 버튼 |
| `src/engine/trackers.js` | MediaPipe 손·몸 인식기 (GPU 실패 시 CPU, 필요할 때만 로드) |
| `src/engine/pose.js` | 몸 랜드마크 번호, 아바타 그리기 |
| `src/engine/audio.js` | Web Audio 합성 효과음·악기·배경 음악 |
| `src/engine/voice.js` | 한국어 TTS 음성 안내 |
| `src/engine/animals.js`, `icons.js`, `draw.js` | 캔버스 그림(동물, 아이콘) |
| `src/scenes/*` | 메뉴와 6개 놀이 장면 |

동물 울음소리는 Wikimedia Commons 의 공개 라이선스 녹음입니다. 출처와 라이선스는 [public/sounds/animals/CREDITS.md](public/sounds/animals/CREDITS.md)에 있습니다.

동작 판정 기준값(점프 높이, 움직임 임계값 등)은 각 장면 파일 위쪽 상수로 모여 있어 실제 아이들에 맞춰 조정할 수 있습니다.
| `src/App.jsx` | 시작·로딩·카메라 거부 화면 |

손 대신 마우스/터치로도 조작할 수 있어 웹캠 없이 PC에서 동작을 확인할 수 있습니다.
