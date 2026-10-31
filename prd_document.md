# [PRD] 미취학 아동용 웹캠 기반 모션 인식 교육·놀이 콘텐츠

## 1. 프로젝트 개요 (Project Overview)
* **프로젝트명:** Web-based Motion Interactive Learning Suite for Preschoolers (가칭: 쑥쑥 모션놀이터)
* **목적:** 별도의 고가 디바이스(Kinect, Leap Motion 등) 없이 일반 PC/노트북의 웹캠과 브라우저만으로 실행 가능한 미취학 아동(4~7세) 전용 모션 인식 인지·신체 발달 콘텐츠 개발
* **핵심 가치:** 
  * **No-Text Interface:** 글자를 읽지 못하는 아동을 위해 텍스트 배제 및 100% 음성(Voice-over)·시각 아이콘·사운드 피드백 제공
  * **Multi-Sensory Engagement:** 시각-청각-신체 감각을 동시에 자극하는 신체 놀이 기반 인지 학습
  * **Web-Accessible:** 웹 브라우저 기반으로 접근성과 확장성 극대화

---

## 2. 타겟 사용자 및 UX/UI 원칙 (Target & Design Rules)

### 2.1 타겟 사용자
* **주 사용자:** 4~7세 미취학 아동 (문자 미해독 연령층)
* **보조 사용자:** 보호자 및 유아교육 기관 교사 (시작/종료 및 세팅 조작)

### 2.2 UX/UI 및 에셋 디자인 원칙
* **텍스트 배제 (100% Voice & Icon UI):** 모든 버튼, 상태, 미션 안내는 큼직한 아이콘과 음성 나레이션으로 전달
* **인식 관대성 (Generous Gesture Tolerance):** 성인 대비 비율이 작고 움직임이 불명확한 유아 신체 특성을 고려하여 동작 인식 임계값(Threshold)을 유연하게 설정
* **즉각적 피드백 (Immediate Feedback):** 동작 감지 후 0.5초 이내에 명확한 애니메이션(파티클, 폭죽) 및 효과음 재생
* **에셋 디자인 규격:**
  * **스타일:** 2D 플랫 벡터(Flat Vector) 또는 둥근 3D 클레이(Clay) 스타일
  * **컬러:** 원색 및 고대비 파스텔톤 사용 (배경과 피사체의 명확한 시각적 분리)
  * **표정:** 큼직하고 친근하게 웃는 표정 적용 (공포감/복잡함 배제)

---

## 3. 핵심 기능 사양 (Core Functional Specifications)

콘텐츠는 총 6가지 핵심 모듈로 구성됩니다.

| 모듈명 | 주요 목적 | 주요 화면 구성 (UI) | 시스템 동작 및 모션 인식 로직 (Flow) |
| :--- | :--- | :--- | :--- |
| **1. 풍선 터뜨리기 & 괴물 물리치기** | 순발력, 시각-운동 협응력 | - 중앙 커다란 시작 아이콘<br>- 상단 별 게이지 바<br>- 화면 내 동적 타겟 생성<br>- 손 위치 따라다니는 마법 지팡이 커서 | 1. `MediaPipe Hands`로 손가락 끝 2D 좌표 추적<br>2. 화면 타겟과 손 좌표의 충돌(Collision Detection) 판정<br>3. 충돌 시 터짐 애니메이션 + 효과음 + 별 게이지 증가 |
| **2. 동물 친구 흉내 내기 릴레이** | 대근육 발달, 신체 표현력 | - 상단 다음 동물 아이콘<br>- 중앙 아동 실루엣/아바타<br>- 하단 발자국 게이지 | 1. 음성 안내("개구리처럼 펄쩍 뛰어봐요!") + 애니메이션 제시<br>2. `MediaPipe Pose`로 관절 Y축 변화(점프) 및 팔 흔듦 감지<br>3. 조건 충족 시 다음 동물로 자동 전환 |
| **3. "멈춰!"와 "출발!" (신호등 놀이)** | 청각 집중력, 자기 조절력 | - 초록색/빨간색 전체 배경 전환<br>- 중앙 댄스 캐릭터 | 1. 초록 배경 + 음악 재생 시 자유 이동 유도<br>2. 무작위 타이밍에 "얼음!" 음성 + 빨간 배경 전환<br>3. Optical Flow / Frame Difference 알고리즘으로 이동 변화량 측정, 정지 성공 여부 판정 |
| **4. 동물 소리 듣고 찾아가기** | 청각-시각 인지 연결 | - 사방 큼직한 동물 일러스트 카드<br>- 중앙 반짝이는 물음표 | 1. 울음소리 음성 재생("어흥~ 나는 누구일까요?")<br>2. 아동이 해당 동물 방향으로 신체 기울임/손 뻗기 감지<br>3. 올바른 동물 카드 확대 애니메이션 + 울음소리 재재생 |
| **5. 매직 악기 (신체 악기)** | 리듬감, 원인-결과 체득 | - 공간 분할 악기 영역 (좌: 북, 우: 실로폰, 상: 심벌즈)<br>- 손끝 잔상 효과 | 1. 웹캠 2D 좌표를 3개 영역(Trigger Zone)으로 매핑<br>2. 손/신체가 영역 진입 시 지연 없이 해당 악기 WAV sound 재생<br>3. 타격 지점에 음표 파티클 렌더링 |
| **6. 모션 드로잉 (무지개 선)** | 소근육 감각, 창의성 | - 도화지 Canvas<br>- 손 끝 무지개 궤적<br>- 구석 색상 물방울 아이콘 | 1. 검지 손가락 끝 좌표 실시간 Tracking & Line Drawing<br>2. 구석 물방울 영역 터치 시 붓 색상 즉시 변경<br>3. 일정 시간 후 선이 반짝이며 사라지는 연출 |

---

## 4. 기술 아키텍처 및 개발 스택 (Technical Architecture)

### 4.1 기술 스택 (Technology Stack)
* **Frontend Framework:** React / Next.js
* **Motion Tracking Engine:** Google MediaPipe (`@mediapipe/hands`, `@mediapipe/pose`)
* **Graphics & Rendering:** HTML5 Canvas / Phaser.js (2D 물리 및 파티클 처리)
* **Audio Engine:** Web Audio API (효과음 저지연 재생) + TTS / Audio Asset (음성 나레이션)

### 4.2 시스템 데이터 흐름 (System Data Flow)
1. **Camera Input:** `navigator.mediaDevices.getUserMedia()`를 통해 720p 30fps 비디오 스트림 수집
2. **AI Inference:** MediaPipe 모델을 브라우저(Client-side) 내에서 인퍼런스하여 실시간 좌표(Landmarks) 추출
3. **Game Loop (Phaser/Canvas):**
   * 좌표 정규화 (Normalized Landmarking $\rightarrow$ Screen Coordinates)
   * 경계 상자/원 충돌 판정 (Bounding Box / Distance Collision)
   * 렌더링 피드백 (파티클, 애니메이션 연출)
4. **Audio Trigger:** 이벤트 발생 시 저지연 Web Audio API 버퍼 재생

---

## 5. 에셋 생성 및 구성 파이프라인 (Asset Pipeline)

### 5.1 AI 이미지 에셋 자동 생성 파이프라인
* **자동 생성 방식:** 이미지 생성 API(GenAI / Imagen 등)를 활용하여 빌드 시점 또는 동적으로 유아용 에셋 생성
* **Prompt Template 규격:**
  > `"Cute 2D flat vector cartoon style [TARGET_OBJECT], friendly smiling face, bright primary colors, rounded edges, isolated on transparent background, no text, no typography, suitable for 4-year-old kids"`

### 5.2 동적 그래픽 및 오디오 처리
* **SVG/Canvas Dynamic Generation:** 단순 오브젝트(풍선, 도형, 빛 잔상)는 코드 기반으로 동적 색상/크기 변경 렌더링
* **Audio Management:** 모든 가이드는 사전 녹음된 성우 Voice-over 파일 또는 맑은 음성의 TTS API 활용

---

## 6. 비기능적 요구사항 및 안전성 (Non-Functional Requirements)

* **성능 (Performance):** 일반 사양 노트북(내장 그래픽) 기준 **30 FPS 이상** 유지, 동작 인식 지연 시간(Latency) **100ms 이내**
* **안전성 (Safety):** 아동이 화면 밖으로 과도하게 벗어나거나 충돌하지 않도록, 인식 유효 범위를 화면 중앙 80% 영역 내부로 제한
* **예외 처리 (Exception Handling):**
  * 웹캠 권한 거부 시 시각적 안내 아이콘 표시
  * 조명 어두움/사용자 이탈 시 "카메라 앞에 서주세요" 음성 안내 자동 출력

---

## 7. 향후 확장 계획 (Roadmap)

1. **Phase 1 (MVP):** '풍선 터뜨리기' 및 '매직 악기' 2개 모듈 웹 기반 단일 프로토타입 구축
2. **Phase 2:** 6개 전체 모듈 완성 및 100% 음성 유저 플로우(글자 없는 전체 메뉴 이동) 적용
3. **Phase 3:** 아동 발달 데이터(반응 속도, 신체 좌우 균형도 등)를 시각화하여 보호자용 리포트로 제공하는 Dashboard 추가