import { ParticleSystem } from './particles.js';
import { childSilhouette, lightBulb, star, COLORS } from './draw.js';
import { homeIcon } from './icons.js';
import { HoverButton } from './HoverButton.js';
import { bodyCenter, drawAvatar, visible, P } from './pose.js';
import { loadTracker, trackerDelegate } from './trackers.js';
import { drawGuide, GUIDES } from './guides.js';
import { delay } from './util.js';
import { music, sfx, song } from './audio.js';
import { speak, stopSpeaking } from './voice.js';
import { MenuScene } from '../scenes/MenuScene.js';
import { BalloonScene } from '../scenes/BalloonScene.js';
import { MimicScene } from '../scenes/MimicScene.js';
import { TrafficScene } from '../scenes/TrafficScene.js';
import { SoundScene } from '../scenes/SoundScene.js';
import { InstrumentScene } from '../scenes/InstrumentScene.js';
import { DrawingScene } from '../scenes/DrawingScene.js';
import { WhackScene } from '../scenes/WhackScene.js';
import { HiddenScene } from '../scenes/HiddenScene.js';
import { MathScene } from '../scenes/MathScene.js';
import { HangulScene } from '../scenes/HangulScene.js';
import { AlphabetScene } from '../scenes/AlphabetScene.js';
import { RunnerScene } from '../scenes/RunnerScene.js';
import { TrainScene } from '../scenes/TrainScene.js';
import { PoseScene } from '../scenes/PoseScene.js';
import { StarsScene } from '../scenes/StarsScene.js';
import { HighFiveScene } from '../scenes/HighFiveScene.js';
import { RallyScene } from '../scenes/RallyScene.js';
import { MirrorScene } from '../scenes/MirrorScene.js';
import { TeamBalloonScene } from '../scenes/TeamBalloonScene.js';
import { WaterScene } from '../scenes/WaterScene.js';
import { CarScene } from '../scenes/CarScene.js';
import { SoccerScene } from '../scenes/SoccerScene.js';
import { KeeperScene } from '../scenes/KeeperScene.js';
import { BaseballScene } from '../scenes/BaseballScene.js';
import { PitcherScene } from '../scenes/PitcherScene.js';
import { GolfScene } from '../scenes/GolfScene.js';
import { SliceScene } from '../scenes/SliceScene.js';
import { SkewerScene } from '../scenes/SkewerScene.js';
import { BodyLetterScene } from '../scenes/BodyLetterScene.js';
import { BubbleScene } from '../scenes/BubbleScene.js';
import { FishScene } from '../scenes/FishScene.js';
import { RhythmScene } from '../scenes/RhythmScene.js';
import { BalanceScene } from '../scenes/BalanceScene.js';
import { SequenceScene } from '../scenes/SequenceScene.js';
import { CrossScene } from '../scenes/CrossScene.js';
import { CountJumpScene } from '../scenes/CountJumpScene.js';
import { ShapeScene } from '../scenes/ShapeScene.js';
import { FaceScene } from '../scenes/FaceScene.js';

const PALM_IDS = [0, 5, 9, 13, 17];
const POSE_POINTERS = { lw: P.lWrist, rw: P.rWrist, li: P.lIndex, ri: P.rIndex };
const TRAIL_LENGTH = 14;
const ABSENT_AFTER = 4; // 초
const MOUSE_IDLE = 2; // 초
const GUIDE_MIN_TIME = 4000; // 놀이 설명을 최소한 보여 주는 시간(ms) — 음성이 짧거나 안 나와도 동작은 볼 수 있게
const MOTION_W = 64;
const MOTION_H = 48;
const MOTION_PIXEL_DIFF = 32; // 이 이상 밝기가 바뀐 픽셀을 '움직임'으로 본다
// 빠른 동작 보완: 움직임이 흐려져 인식을 잠깐 놓쳐도 바로 사라지지 않게 이어 간다.
const HAND_COAST = 0.25; // 놓친 손을 움직이던 방향으로 이어 가는 시간(초)
const HAND_COAST_MOVE = 0.12; // 이어 갈 때 앞으로 밀어 주는 최대 시간(초) — 너무 멀리 날아가지 않게
const PERSON_COAST = 0.6; // 놓친 아이를 마지막 자세로 기억하는 시간(초) — 점프 기준 높이 등이 초기화되지 않게
const HAND_MATCH = 0.4; // 이 거리(화면 짧은 변 배) 안이면 같은 손으로 본다
const PERSON_MATCH = 0.45;
const SWEEP_KEEP = 0.25; // 지난 위치를 이 시간 안에 본 손만 '지나간 길' 판정에 쓴다
const LIGHT_CHECK_EVERY = 3; // 방 밝기 확인 간격(초)
// 손 별(커서) 보이기: 빠르게 움직여 화면이 흐려지면 인식을 잠깐 놓치는데, 그때 별이 바로 사라지지 않게 한다.
const CURSOR_HOLD = 0.6; // 놓친 손의 별을 남겨 두는 시간(초) — 이 동안 서서히 흐려진다
const CURSOR_GLIDE = 0.15; // 놓친 뒤 움직이던 방향으로 별을 밀어 주는 최대 시간(초)
const CURSOR_TAKEOVER = 0.3; // 다시 잡힌 손이 이 거리(화면 짧은 변 배) 안이면 흐려지던 별을 이어받는다
// 주소 끝에 ?debug 를 붙이면 화면 위에 성능 숫자(초당 화면 수, 인식 시간)를 보여 준다(렉 원인 확인용).
const DEBUG = typeof location !== 'undefined' && /[?&#]debug/.test(location.href);

// 카메라 → 인식(손 또는 몸) → 장면 업데이트 → 그리기를 매 프레임 반복하는 게임 루프.
// 장면은 tracker('hands' | 'pose'), needsMotion, showAvatar, hideTrail, hideCursor 속성으로 필요한 것을 알린다.
export class Game {
  constructor({ canvas, video, trackers }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.video = video;
    this.trackers = { ...trackers };
    this.loadingTrackers = {};
    this.particles = new ParticleSystem();

    this.time = 0;
    this.hands = [];
    this.people = []; // 몸 인식된 아이들 [{ id, pose, center }]
    this.faces = []; // 얼굴 인식(표정 놀이) [{ points, box, center, size, shapes }]
    this.nextPersonId = 0;
    this.nextHandId = 0;
    this.lastPointers = new Map(); // 포인터 key → 지난 위치(빠른 손짓 판정용)
    this.cursors = new Map(); // 화면에 그리는 손 별 key → { x, y, vx, vy, seen }
    this.mouse = null;
    this.lastVideoTime = -1;
    this.lastDetectTs = 0;
    this.view = { dx: 0, dy: 0, dw: 1, dh: 1 };

    this.motion = 0;
    this.motionPrev = null;
    this.motionCanvas = document.createElement('canvas');
    this.motionCanvas.width = MOTION_W;
    this.motionCanvas.height = MOTION_H;
    this.motionCtx = this.motionCanvas.getContext('2d', { willReadFrequently: true });

    this.absentTime = 0;
    this.lastAbsentVoice = -Infinity;
    this.dark = false;
    this.lightCheckT = 0;
    this.lastDarkVoice = -Infinity;
    this.lightCanvas = document.createElement('canvas');
    this.lightCanvas.width = 16;
    this.lightCanvas.height = 12;
    this.lightCtx = this.lightCanvas.getContext('2d', { willReadFrequently: true });
    this.sampling = new Set(); // 비동기로 카메라 화면을 읽는 중인 캔버스
    this.perf = { frames: 0, fps: 0, frameMs: 0, detectMs: 0, detectMax: 0, slow: 0, acc: 0 };

    // 손만으로 메뉴에 돌아갈 수 있는 집 버튼(오래 올려 둬야 눌리게 해서 실수 방지)
    this.homeButton = new HoverButton({
      drawIcon: homeIcon,
      onActivate: () => {
        sfx.select();
        this.goTo('menu');
      },
      onHoverStart: () => speak('처음으로 갈까요?'),
      ringColor: COLORS.orange,
      dwell: 1.5,
    });

    this.scenes = {
      menu: new MenuScene(this),
      balloon: new BalloonScene(this),
      whack: new WhackScene(this),
      mimic: new MimicScene(this),
      traffic: new TrafficScene(this),
      runner: new RunnerScene(this),
      train: new TrainScene(this),
      pose: new PoseScene(this),
      stars: new StarsScene(this),
      car: new CarScene(this),
      soccer: new SoccerScene(this),
      keeper: new KeeperScene(this),
      baseball: new BaseballScene(this),
      pitcher: new PitcherScene(this),
      golf: new GolfScene(this),
      slice: new SliceScene(this),
      skewer: new SkewerScene(this),
      bodyConsonant: new BodyLetterScene(this, 'consonant'),
      bodyVowel: new BodyLetterScene(this, 'vowel'),
      bubble: new BubbleScene(this),
      fish: new FishScene(this),
      rhythm: new RhythmScene(this),
      balance: new BalanceScene(this),
      sequence: new SequenceScene(this),
      cross: new CrossScene(this),
      countjump: new CountJumpScene(this),
      shape: new ShapeScene(this),
      face: new FaceScene(this),
      highfive: new HighFiveScene(this),
      rally: new RallyScene(this),
      mirror: new MirrorScene(this),
      team: new TeamBalloonScene(this),
      water: new WaterScene(this),
      sound: new SoundScene(this),
      instrument: new InstrumentScene(this),
      drawing: new DrawingScene(this),
      hidden: new HiddenScene(this),
      math: new MathScene(this),
      hangul: new HangulScene(this),
      alphabet: new AlphabetScene(this),
    };

    window.addEventListener('resize', this.resize);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    this.resize();
  }

  start(sceneName = 'menu') {
    this.goTo(sceneName);
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.scene?.exit?.();
    music.stop();
    song.stop();
    stopSpeaking();
  }

  goTo(name) {
    this.scene?.exit?.();
    this.sceneName = name;
    this.scene = this.scenes[name];
    this.particles.clear();
    this.hands = [];
    this.people = [];
    this.faces = [];
    this.lastPointers.clear();
    this.cursors.clear();
    this.motion = 0;
    this.motionPrev = null;
    this.absentTime = 0;
    this.homeButton.progress = 0;
    this.ensureTracker(this.trackerKind);

    // 놀이를 시작하기 전에 하는 방법을 동작과 음성으로 보여 준다(화면을 터치하면 건너뜀).
    // 설명이 끝나야 놀이가 시작되므로, 그동안 몸 인식 모델도 미리 준비된다.
    const guide = GUIDES[name];
    this.guide = null;
    if (!guide) {
      this.scene.enter?.();
      return;
    }
    const current = (this.guide = { ...guide, t: 0 });
    Promise.all([speak(guide.text), delay(GUIDE_MIN_TIME)])
      .then(() => delay(500))
      .then(() => this.guide === current && this.endGuide());
  }

  endGuide() {
    this.guide = null;
    this.scene.enter?.();
  }

  get trackerKind() {
    return this.scene.tracker ?? 'hands';
  }

  ensureTracker(kind) {
    if (this.trackers[kind] || this.loadingTrackers[kind]) return;
    this.loadingTrackers[kind] = true;
    loadTracker(kind)
      .then((t) => (this.trackers[kind] = t))
      .catch((err) => console.error(err))
      .finally(() => (this.loadingTrackers[kind] = false));
  }

  resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5); // 태블릿 성능을 위해 해상도 상한
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.dpr = dpr;
    this.w = w;
    this.h = h;
    this.unit = Math.min(w, h);
    // 안전을 위해 화면 중앙 80% 영역에서만 동작을 인식한다(PRD 6).
    this.zone = { x: w * 0.1, y: h * 0.1, w: w * 0.8, h: h * 0.8 };
    // 집 버튼은 왼쪽 위(인식 영역 안쪽 모서리)에 둔다.
    const hr = this.unit * 0.065;
    this.homeButton.place(this.zone.x + hr * 1.1, this.zone.y + hr * 1.1, hr);
    for (const s of Object.values(this.scenes)) s.onResize?.();
  };

  inZone(p) {
    const z = this.zone;
    return p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h;
  }

  get showHome() {
    return this.sceneName !== 'menu';
  }

  // 터치·마우스는 손 대신 쓸 수 있는 보조 입력(보호자 조작, PC 테스트용).
  onPointerDown = (e) => {
    this.mouse = { x: e.clientX, y: e.clientY, t: this.time, touch: e.pointerType !== 'mouse' };
    if (this.showHome && this.homeButton.tap(e.clientX, e.clientY)) return;
    if (this.guide) return this.endGuide(); // 보호자가 설명을 건너뛸 수 있다
    this.scene.onTap?.(e.clientX, e.clientY);
  };

  onPointerMove = (e) => {
    if (e.pointerType !== 'mouse' && !this.mouse) return;
    this.mouse = { x: e.clientX, y: e.clientY, t: this.time, touch: e.pointerType !== 'mouse' };
  };

  onPointerUp = (e) => {
    if (e.pointerType !== 'mouse') this.mouse = null;
  };

  loop = (now) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.time += dt;

    this.updateView();
    this.detect(now);
    const input = this.buildInput();
    this.monitor(dt, input);
    const scene = this.scene;
    if (this.guide) this.guide.t += dt;
    else scene.update(dt, input);
    if (this.showHome && this.scene === scene) this.homeButton.update(dt, input.pointers);
    this.particles.update(dt);
    this.render();
    this.notePerf('frame', performance.now() - now, dt);
    if (DEBUG) this.drawPerf();
  };

  // 성능 기록: 1초마다 평균을 내고, 33ms(30fps) 넘게 걸린 프레임 수를 센다.
  notePerf(kind, ms, dt = 0) {
    const p = this.perf;
    if (kind === 'detect') {
      p.dSum = (p.dSum ?? 0) + ms;
      p.dN = (p.dN ?? 0) + 1;
      p.dMax = Math.max(p.dMax ?? 0, ms);
      return;
    }
    p.frames++;
    p.fSum = (p.fSum ?? 0) + ms;
    if (ms > 33) p.slowNow = (p.slowNow ?? 0) + 1;
    p.acc += dt;
    if (p.acc < 1) return;
    Object.assign(p, {
      fps: Math.round(p.frames / p.acc),
      frameMs: p.fSum / p.frames,
      detectMs: p.dN ? p.dSum / p.dN : 0,
      detectMax: p.dMax ?? 0,
      slow: p.slowNow ?? 0,
      frames: 0,
      acc: 0,
      fSum: 0,
      dSum: 0,
      dN: 0,
      dMax: 0,
      slowNow: 0,
    });
  }

  drawPerf() {
    const { ctx } = this;
    const p = this.perf;
    const v = this.video;
    const lines = [
      `화면 ${p.fps}fps · 한 프레임 ${p.frameMs.toFixed(1)}ms · 느린 프레임 ${p.slow}/초`,
      `인식(${this.trackerKind}) 평균 ${p.detectMs.toFixed(1)}ms · 최대 ${p.detectMax.toFixed(1)}ms · ${trackerDelegate(this.trackerKind) ?? '-'}`,
      `카메라 ${v.videoWidth}x${v.videoHeight} · 캔버스 ${this.canvas.width}x${this.canvas.height} · 반짝이 ${this.particles.list.length}`,
    ];
    ctx.save();
    ctx.font = '14px monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, 520, lines.length * 18 + 8);
    ctx.fillStyle = '#fff';
    lines.forEach((l, i) => ctx.fillText(l, 6, 18 + i * 18));
    ctx.restore();
  }

  // 비디오를 자르지 않고 화면 안에 전부 보이게(contain) 배치하는 좌표 변환 정보.
  // 카메라에 찍힌 범위를 모두 보여 주어 두 아이가 함께 들어오기 쉽다.
  updateView() {
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    if (!vw || !vh) return;
    const s = Math.min(this.w / vw, this.h / vh);
    const dw = vw * s;
    const dh = vh * s;
    this.view = { dx: (this.w - dw) / 2, dy: (this.h - dh) / 2, dw, dh };
  }

  // 정규화 좌표(0~1) → 거울처럼 좌우 반전된 화면 좌표
  toScreen(l) {
    const c = this.view;
    return { x: c.dx + (1 - l.x) * c.dw, y: c.dy + l.y * c.dh };
  }

  detect(now) {
    const v = this.video;
    if (v.readyState < 2 || v.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = v.currentTime;
    if (this.scene.needsMotion) this.measureMotion();

    const kind = this.trackerKind;
    const tracker = this.trackers[kind];
    if (!tracker) return;
    const ts = Math.max(now, this.lastDetectTs + 1);
    this.lastDetectTs = ts;
    let result;
    try {
      const t0 = performance.now();
      result = tracker.detectForVideo(v, ts);
      this.notePerf('detect', performance.now() - t0);
    } catch (err) {
      console.warn(err);
      return;
    }

    if (kind === 'face') {
      // 얼굴: 화면 좌표 점들 + 표정 점수 { smile 등 이름: 0~1 }. 화면 왼쪽 얼굴부터.
      const blend = result.faceBlendshapes ?? [];
      this.faces = (result.faceLandmarks ?? [])
        .map((lms, i) => {
          const points = lms.map((l) => this.toScreen(l));
          const xs = points.map((p) => p.x);
          const ys = points.map((p) => p.y);
          const box = { x: Math.min(...xs), y: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
          const shapes = Object.fromEntries((blend[i]?.categories ?? []).map((c) => [c.categoryName, c.score]));
          return { points, box, center: { x: (box.x + box.x2) / 2, y: (box.y + box.y2) / 2 }, size: box.x2 - box.x, shapes };
        })
        .sort((a, b) => a.center.x - b.center.x);
      return;
    }

    if (kind === 'pose') {
      const poses = (result.landmarks ?? []).map((lms) => lms.map((l) => ({ ...this.toScreen(l), v: l.visibility ?? 1 })));
      this.trackPeople(poses);
      return;
    }

    const raw = (result.landmarks ?? []).map((lms) => {
      const points = lms.map((l) => this.toScreen(l));
      const palm = { x: 0, y: 0 };
      for (const i of PALM_IDS) {
        palm.x += points[i].x / PALM_IDS.length;
        palm.y += points[i].y / PALM_IDS.length;
      }
      return { points, tip: points[8], palm };
    });
    this.trackHands(raw);
  }

  // 인식 결과의 순서는 프레임마다 바뀌므로, 직전 프레임에서 가장 가까웠던 손과 같은 id 를 붙인다.
  // (두 아이의 손 네 개가 섞여도 그리던 선·악기 소리가 다른 손으로 넘어가지 않게)
  // 빠르게 움직여 잠깐 놓친 손은 움직이던 방향으로 조금 이어 가서 끊기지 않게 한다.
  trackHands(raw) {
    const t = this.time;
    const prev = this.hands;
    const match = matchNearest(raw, prev, (h, p) => dist(h.palm, p.palm), this.unit * HAND_MATCH);
    const hands = raw.map((h, i) => {
      const p = prev[match.get(i)];
      const gap = p ? Math.max(1 / 60, t - p.seen) : 1;
      const vel = p ? { x: (h.palm.x - p.real.palm.x) / gap, y: (h.palm.y - p.real.palm.y) / gap } : { x: 0, y: 0 };
      const trail = p?.trail ?? [];
      trail.push(h.tip);
      if (trail.length > TRAIL_LENGTH) trail.shift();
      return { ...h, id: p ? p.id : this.nextHandId++, real: h, vel, seen: t, trail, lost: false };
    });
    const matched = new Set(match.values());
    prev.forEach((p, j) => {
      if (matched.has(j) || t - p.seen > HAND_COAST) return;
      const k = Math.min(t - p.seen, HAND_COAST_MOVE);
      let ox = p.vel.x * k;
      let oy = p.vel.y * k;
      const len = Math.hypot(ox, oy);
      const max = this.unit * 0.15;
      if (len > max) {
        ox *= max / len;
        oy *= max / len;
      }
      const move = (q) => ({ x: q.x + ox, y: q.y + oy });
      const points = p.real.points.map(move);
      hands.push({ ...p, points, tip: points[8], palm: move(p.real.palm), lost: true });
    });
    this.hands = dropExtraLost(hands, 4);
  }

  // 아이마다 직전 프레임에서 가장 가까웠던 아이와 같은 id 를 붙인다.
  // 장면은 이 id 로 아이마다 따로 동작 상태(점프 기준 높이 등)를 기억한다.
  // 점프·달리기처럼 빠르게 움직이다 잠깐 놓친 아이는 마지막 자세로 기억해 두어 상태가 초기화되지 않게 한다.
  trackPeople(poses) {
    const t = this.time;
    const prev = this.people;
    const centers = poses.map((pose) => bodyCenter(pose));
    const match = matchNearest(centers, prev, (c, p) => dist(c, p.center), this.unit * PERSON_MATCH);
    const people = poses.map((pose, i) => {
      const p = prev[match.get(i)];
      return { id: p ? p.id : this.nextPersonId++, pose, center: centers[i], seen: t, lost: false };
    });
    const matched = new Set(match.values());
    prev.forEach((p, j) => {
      if (!matched.has(j) && t - p.seen <= PERSON_COAST) people.push({ ...p, lost: true });
    });
    // 놓쳤던 아이가 멀리서 새로 잡히면 기억해 둔 모습은 버린다(아이는 최대 두 명).
    this.people = dropExtraLost(people, 2).sort((a, b) => a.id - b.id);
  }

  // 카메라 화면을 작게 줄여 픽셀을 읽는다(움직임·밝기 확인용).
  // 비디오를 캔버스에 그려 바로 getImageData 하면 GPU 작업이 끝날 때까지 화면이 멈춰(태블릿에서 큰 렉 원인)
  // createImageBitmap 으로 줄이는 일을 비동기로 맡기고, 결과가 오면 작은 그림만 읽는다.
  sampleVideo(ctx, w, h, onData) {
    if (this.sampling.has(ctx)) return; // 지난 요청이 아직 안 끝났으면 건너뛴다
    const read = (src) => {
      ctx.drawImage(src, 0, 0, w, h);
      onData(ctx.getImageData(0, 0, w, h).data);
    };
    if (typeof createImageBitmap !== 'function') return read(this.video);
    this.sampling.add(ctx);
    createImageBitmap(this.video, { resizeWidth: w, resizeHeight: h, resizeQuality: 'low' })
      .then((bitmap) => {
        read(bitmap);
        bitmap.close();
      })
      .catch(() => {})
      .finally(() => this.sampling.delete(ctx));
  }

  // 프레임 차이(Frame Difference): 직전 프레임과 비교해 밝기가 바뀐 픽셀 비율(0~1)
  measureMotion() {
    this.sampleVideo(this.motionCtx, MOTION_W, MOTION_H, (data) => this.updateMotion(data));
  }

  updateMotion(data) {
    if (!this.scene.needsMotion) return;
    const cur = new Uint8Array(MOTION_W * MOTION_H);
    const prev = this.motionPrev;
    const x0 = Math.floor(MOTION_W * 0.1);
    const x1 = Math.ceil(MOTION_W * 0.9);
    const y0 = Math.floor(MOTION_H * 0.1);
    const y1 = Math.ceil(MOTION_H * 0.9);
    let changed = 0;
    let total = 0;
    for (let y = 0; y < MOTION_H; y++) {
      for (let x = 0; x < MOTION_W; x++) {
        const i = y * MOTION_W + x;
        const l = (data[i * 4] * 77 + data[i * 4 + 1] * 150 + data[i * 4 + 2] * 29) >> 8;
        cur[i] = l;
        if (!prev || x < x0 || x >= x1 || y < y0 || y >= y1) continue;
        total++;
        if (Math.abs(l - prev[i]) > MOTION_PIXEL_DIFF) changed++;
      }
    }
    this.motionPrev = cur;
    if (total) this.motion = this.motion * 0.6 + (changed / total) * 0.4;
  }

  buildInput() {
    const pointers = [];
    for (const hand of this.hands) {
      const parts = { tip: hand.tip, palm: hand.palm, thumb: hand.points[4], middle: hand.points[12] };
      for (const [name, p] of Object.entries(parts)) {
        if (this.inZone(p)) pointers.push({ x: p.x, y: p.y, key: `h${hand.id}-${name}`, part: name });
      }
    }
    for (const person of this.people) {
      if (person.lost) continue; // 놓친 아이의 멈춘 손으로 잘못 닿지 않게
      for (const [name, idx] of Object.entries(POSE_POINTERS)) {
        const p = person.pose[idx];
        // 빠르게 움직이면 흐려져서 확신도가 떨어지므로 손 위치는 기준을 조금 낮춰 받는다.
        if (visible(p, 0.35) && this.inZone(p)) pointers.push({ x: p.x, y: p.y, key: `p${person.id}-${name}`, part: 'tip' });
      }
    }
    const mouseActive = this.mouse && (this.mouse.touch || this.time - this.mouse.t < MOUSE_IDLE);
    if (mouseActive) pointers.push({ x: this.mouse.x, y: this.mouse.y, key: 'mouse', part: 'tip' });
    // 지난 위치를 붙여 두면 장면이 '지나간 길'로 닿았는지 판정할 수 있다(hit.js).
    const seen = new Map();
    for (const p of pointers) {
      const last = this.lastPointers.get(p.key);
      if (last && this.time - last.t < SWEEP_KEEP && Math.hypot(p.x - last.x, p.y - last.y) < this.unit * 0.6) {
        p.px = last.x;
        p.py = last.y;
      }
      seen.set(p.key, { x: p.x, y: p.y, t: this.time });
    }
    for (const [key, last] of this.lastPointers) if (!seen.has(key) && this.time - last.t < SWEEP_KEEP) seen.set(key, last);
    this.lastPointers = seen;
    return {
      hands: this.hands,
      people: this.people, // [{ id, pose }] 최대 2명
      faces: this.faces, // 얼굴 놀이에서만 채워진다
      pointers,
      motion: this.motion,
      present: this.hands.length > 0 || this.people.length > 0 || this.faces.length > 0 || !!mouseActive,
    };
  }

  get trackerReady() {
    return !!this.trackers[this.trackerKind];
  }

  // 아이가 화면에서 사라지거나 방이 어두우면 음성으로 안내한다(PRD 6).
  monitor(dt, input) {
    this.absentTime = input.present || !this.trackerReady || this.guide ? 0 : this.absentTime + dt;
    if (this.absentTime > ABSENT_AFTER && this.time - this.lastAbsentVoice > 12) {
      this.lastAbsentVoice = this.time;
      speak('카메라 앞에 서 주세요!');
    }

    this.lightCheckT -= dt;
    if (this.lightCheckT <= 0 && this.video.readyState >= 2) {
      this.lightCheckT = LIGHT_CHECK_EVERY;
      this.sampleVideo(this.lightCtx, 16, 12, (data) => this.updateLight(data));
    }
  }

  updateLight(data) {
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    this.dark = sum / (data.length / 4) < 45;
    if (this.dark && this.time - this.lastDarkVoice > 20) {
      this.lastDarkVoice = this.time;
      speak('방이 조금 어두워요. 불을 켜 주세요!');
    }
  }

  render() {
    const { ctx, w, h, view: c } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#FFF7E0';
    ctx.fillRect(0, 0, w, h);

    if (this.video.readyState >= 2) {
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(this.video, c.dx, c.dy, c.dw, c.dh);
      ctx.restore();
    }
    // 파스텔 막을 씌워 게임 그림이 배경과 또렷하게 구분되게 한다.
    ctx.fillStyle = 'rgba(255,247,224,0.45)';
    ctx.fillRect(0, 0, w, h);
    this.drawZoneFrame();

    if (this.guide) {
      // 설명 중에는 놀이가 아직 시작되지 않았으므로 설명 카드만 그린다.
      drawGuide(ctx, this, this.guide);
    } else {
      if (this.scene.showAvatar) {
        // 두 번째 아이는 다른 색으로 그려 서로 구분되게 한다.
        const first = this.scene.avatarColor ?? COLORS.blue;
        const colors = [first, first === COLORS.pink ? COLORS.green : COLORS.pink];
        this.people.forEach((p, i) => drawAvatar(ctx, p.pose, this.scene.avatarColorOf?.(p) ?? colors[i % 2]));
      }
      this.scene.draw(ctx);
    }
    this.particles.draw(ctx);
    if (this.showHome) this.homeButton.draw(ctx);
    this.drawCursors();

    if (this.guide) {
      // 설명 카드 위에는 안내 표시를 겹치지 않는다.
    } else if (!this.trackerReady) this.drawLoading();
    else if (this.absentTime > ABSENT_AFTER) this.drawAbsentHint();
    if (this.dark) lightBulb(ctx, w / 2, h * 0.86, this.unit * 0.07 * (1 + Math.sin(this.time * 4) * 0.08));
  }

  // 인식 영역 바깥은 살짝 흐리게 덮는다.
  drawZoneFrame() {
    const { ctx, w, h, zone: z } = this;
    ctx.save();
    ctx.fillStyle = 'rgba(255,247,224,0.45)';
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.roundRect(z.x, z.y, z.w, z.h, this.unit * 0.04);
    ctx.fill('evenodd');
    ctx.restore();
  }

  drawCursors() {
    const { ctx, unit } = this;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (!this.scene.hideTrail) {
      for (const { trail } of this.hands) {
        for (let i = 1; i < trail.length; i++) {
          const k = i / trail.length;
          ctx.strokeStyle = `hsla(${(this.time * 240 + i * 25) % 360}, 95%, 62%, ${k * 0.9})`;
          ctx.lineWidth = unit * 0.022 * k;
          ctx.beginPath();
          ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
          ctx.lineTo(trail[i].x, trail[i].y);
          ctx.stroke();
        }
      }
    }
    if (this.scene.hideCursor) {
      ctx.restore();
      return;
    }
    for (const c of this.updateCursors()) {
      ctx.globalAlpha = c.alpha;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.arc(c.x, c.y, unit * 0.045, 0, Math.PI * 2);
      ctx.fill();
      star(ctx, c.x, c.y, unit * 0.035, '#FFD23F', '#fff');
    }
    ctx.restore();
  }

  // 지금 보이는 손끝들로 별 위치를 갱신한다. 잠깐 놓친 손의 별은 움직이던 방향으로 조금 미끄러지며 흐려지고,
  // 손이 다시 잡히면(새 id 여도 가까우면) 그 별을 이어받아 별이 깜빡이거나 둘로 보이지 않는다.
  updateCursors() {
    const t = this.time;
    const tips = [];
    for (const h of this.hands) if (!h.lost) tips.push({ key: `h${h.id}`, x: h.tip.x, y: h.tip.y });
    for (const { id, pose, lost } of this.people) {
      if (lost) continue;
      // 빠르게 휘두르면 손목 확신도가 떨어지므로 기준을 낮춰 받는다(별이 덜 끊기게).
      for (const i of [P.lWrist, P.rWrist]) if (visible(pose[i], 0.3)) tips.push({ key: `p${id}-${i}`, x: pose[i].x, y: pose[i].y });
    }
    if (this.mouse && !this.mouse.touch && t - this.mouse.t < MOUSE_IDLE) tips.push({ key: 'mouse', x: this.mouse.x, y: this.mouse.y });

    const cursors = this.cursors;
    for (const p of tips) {
      let c = cursors.get(p.key);
      if (!c) {
        // 흐려지던 별 중 가장 가까운 것을 이어받는다.
        let best = null;
        let bestD = this.unit * CURSOR_TAKEOVER;
        for (const [k, o] of cursors) {
          if (o.seen === t || k === 'mouse') continue;
          const d = Math.hypot(o.x - p.x, o.y - p.y);
          if (d < bestD) [best, bestD] = [k, d];
        }
        if (best) {
          c = cursors.get(best);
          cursors.delete(best);
        } else c = { x: p.x, y: p.y, vx: 0, vy: 0 };
        cursors.set(p.key, c);
      }
      const gap = Math.max(1 / 60, t - (c.seen ?? t));
      if (c.seen !== undefined && gap < 0.3) {
        c.vx = (p.x - c.x) / gap;
        c.vy = (p.y - c.y) / gap;
      }
      Object.assign(c, { x: p.x, y: p.y, seen: t, gx: p.x, gy: p.y });
    }
    const out = [];
    for (const [k, c] of cursors) {
      const age = t - c.seen;
      if (age > CURSOR_HOLD) {
        cursors.delete(k);
        continue;
      }
      if (age > 0) {
        // 놓친 동안: 움직이던 방향으로 잠깐 미끄러진다(너무 멀리 가지 않게 상한)
        const k2 = Math.min(age, CURSOR_GLIDE);
        let ox = c.vx * k2;
        let oy = c.vy * k2;
        const len = Math.hypot(ox, oy);
        const max = this.unit * 0.15;
        if (len > max) [ox, oy] = [(ox * max) / len, (oy * max) / len];
        c.x = c.gx + ox;
        c.y = c.gy + oy;
      }
      out.push({ x: c.x, y: c.y, alpha: age > 0 ? Math.max(0, 1 - age / CURSOR_HOLD) * 0.9 : 1 });
    }
    return out;
  }

  drawLoading() {
    const { ctx, w, h, unit } = this;
    const colors = [COLORS.red, COLORS.yellow, COLORS.blue];
    colors.forEach((color, i) => {
      const hop = Math.max(0, Math.sin(this.time * 7 - i * 0.8)) * unit * 0.04;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(w / 2 + (i - 1) * unit * 0.1, h / 2 - hop, unit * 0.035, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  drawAbsentHint() {
    const { ctx, w, h, unit } = this;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(0, 0, w, h);
    const s = unit * 0.22 * (1 + Math.sin(this.time * 3) * 0.06);
    childSilhouette(ctx, w / 2, h / 2, s, 'rgba(58,134,255,0.85)');
  }
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// 새로 인식된 것(items)과 직전 것(prev)을 가까운 쌍부터 짝짓는다. 반환: items 번호 → prev 번호
function matchNearest(items, prev, distance, maxDist) {
  const pairs = [];
  items.forEach((a, i) =>
    prev.forEach((b, j) => {
      const d = distance(a, b);
      if (d < maxDist) pairs.push({ i, j, d });
    }),
  );
  pairs.sort((a, b) => a.d - b.d);
  const match = new Map();
  const used = new Set();
  for (const { i, j } of pairs) {
    if (match.has(i) || used.has(j)) continue;
    match.set(i, j);
    used.add(j);
  }
  return match;
}

// 실제로 보이는 것을 우선하고, 넘치는 만큼 '놓쳐서 기억만 하는' 것을 버린다.
function dropExtraLost(list, max) {
  const out = [...list];
  for (let i = out.length - 1; i >= 0 && out.length > max; i--) if (out[i].lost) out.splice(i, 1);
  return out;
}
