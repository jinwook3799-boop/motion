import { ParticleSystem } from './particles.js';
import { childSilhouette, lightBulb, star, COLORS } from './draw.js';
import { homeIcon } from './icons.js';
import { HoverButton } from './HoverButton.js';
import { drawAvatar, visible, P } from './pose.js';
import { loadTracker } from './trackers.js';
import { music, sfx } from './audio.js';
import { speak, stopSpeaking } from './voice.js';
import { MenuScene } from '../scenes/MenuScene.js';
import { BalloonScene } from '../scenes/BalloonScene.js';
import { MimicScene } from '../scenes/MimicScene.js';
import { TrafficScene } from '../scenes/TrafficScene.js';
import { SoundScene } from '../scenes/SoundScene.js';
import { InstrumentScene } from '../scenes/InstrumentScene.js';
import { DrawingScene } from '../scenes/DrawingScene.js';

const PALM_IDS = [0, 5, 9, 13, 17];
const POSE_POINTERS = { lw: P.lWrist, rw: P.rWrist, li: P.lIndex, ri: P.rIndex };
const TRAIL_LENGTH = 14;
const ABSENT_AFTER = 4; // 초
const MOUSE_IDLE = 2; // 초
const MOTION_W = 64;
const MOTION_H = 48;
const MOTION_PIXEL_DIFF = 32; // 이 이상 밝기가 바뀐 픽셀을 '움직임'으로 본다

// 카메라 → 인식(손 또는 몸) → 장면 업데이트 → 그리기를 매 프레임 반복하는 게임 루프.
// 장면은 tracker('hands' | 'pose'), needsMotion, showAvatar, hideTrail 속성으로 필요한 것을 알린다.
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
    this.pose = null;
    this.trails = [];
    this.mouse = null;
    this.lastVideoTime = -1;
    this.lastDetectTs = 0;
    this.cover = { dx: 0, dy: 0, dw: 1, dh: 1 };

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
      mimic: new MimicScene(this),
      traffic: new TrafficScene(this),
      sound: new SoundScene(this),
      instrument: new InstrumentScene(this),
      drawing: new DrawingScene(this),
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
    stopSpeaking();
  }

  goTo(name) {
    this.scene?.exit?.();
    this.sceneName = name;
    this.scene = this.scenes[name];
    this.particles.clear();
    this.hands = [];
    this.trails = [];
    this.pose = null;
    this.motion = 0;
    this.motionPrev = null;
    this.absentTime = 0;
    this.homeButton.progress = 0;
    this.ensureTracker(this.trackerKind);
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

    this.updateCover();
    this.detect(now);
    const input = this.buildInput();
    this.monitor(dt, input);
    const scene = this.scene;
    scene.update(dt, input);
    if (this.showHome && this.scene === scene) this.homeButton.update(dt, input.pointers);
    this.particles.update(dt);
    this.render();
  };

  // 비디오를 화면에 꽉 차게(cover) 배치하는 좌표 변환 정보
  updateCover() {
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    if (!vw || !vh) return;
    const s = Math.max(this.w / vw, this.h / vh);
    const dw = vw * s;
    const dh = vh * s;
    this.cover = { dx: (this.w - dw) / 2, dy: (this.h - dh) / 2, dw, dh };
  }

  // 정규화 좌표(0~1) → 거울처럼 좌우 반전된 화면 좌표
  toScreen(l) {
    const c = this.cover;
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
      result = tracker.detectForVideo(v, ts);
    } catch (err) {
      console.warn(err);
      return;
    }

    if (kind === 'pose') {
      const lms = result.landmarks?.[0];
      this.pose = lms ? lms.map((l) => ({ ...this.toScreen(l), v: l.visibility ?? 1 })) : null;
      return;
    }

    this.hands = (result.landmarks ?? []).map((lms) => {
      const points = lms.map((l) => this.toScreen(l));
      const palm = { x: 0, y: 0 };
      for (const i of PALM_IDS) {
        palm.x += points[i].x / PALM_IDS.length;
        palm.y += points[i].y / PALM_IDS.length;
      }
      return { points, tip: points[8], palm };
    });
    this.trails.length = this.hands.length;
    this.hands.forEach((hand, i) => {
      const trail = (this.trails[i] ??= []);
      trail.push(hand.tip);
      if (trail.length > TRAIL_LENGTH) trail.shift();
    });
  }

  // 프레임 차이(Frame Difference): 직전 프레임과 비교해 밝기가 바뀐 픽셀 비율(0~1)
  measureMotion() {
    const ctx = this.motionCtx;
    ctx.drawImage(this.video, 0, 0, MOTION_W, MOTION_H);
    const data = ctx.getImageData(0, 0, MOTION_W, MOTION_H).data;
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
    this.hands.forEach((hand, i) => {
      const parts = { tip: hand.tip, palm: hand.palm, thumb: hand.points[4], middle: hand.points[12] };
      for (const [name, p] of Object.entries(parts)) {
        if (this.inZone(p)) pointers.push({ x: p.x, y: p.y, key: `h${i}-${name}`, part: name });
      }
    });
    if (this.pose) {
      for (const [name, idx] of Object.entries(POSE_POINTERS)) {
        const p = this.pose[idx];
        if (visible(p) && this.inZone(p)) pointers.push({ x: p.x, y: p.y, key: `p-${name}`, part: 'tip' });
      }
    }
    const mouseActive = this.mouse && (this.mouse.touch || this.time - this.mouse.t < MOUSE_IDLE);
    if (mouseActive) pointers.push({ x: this.mouse.x, y: this.mouse.y, key: 'mouse', part: 'tip' });
    return {
      hands: this.hands,
      pose: this.pose,
      pointers,
      motion: this.motion,
      present: this.hands.length > 0 || !!this.pose || !!mouseActive,
    };
  }

  get trackerReady() {
    return !!this.trackers[this.trackerKind];
  }

  // 아이가 화면에서 사라지거나 방이 어두우면 음성으로 안내한다(PRD 6).
  monitor(dt, input) {
    this.absentTime = input.present || !this.trackerReady ? 0 : this.absentTime + dt;
    if (this.absentTime > ABSENT_AFTER && this.time - this.lastAbsentVoice > 12) {
      this.lastAbsentVoice = this.time;
      speak('카메라 앞에 서 주세요!');
    }

    this.lightCheckT -= dt;
    if (this.lightCheckT <= 0 && this.video.readyState >= 2) {
      this.lightCheckT = 1.5;
      this.lightCtx.drawImage(this.video, 0, 0, 16, 12);
      const data = this.lightCtx.getImageData(0, 0, 16, 12).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      this.dark = sum / (data.length / 4) < 45;
      if (this.dark && this.time - this.lastDarkVoice > 20) {
        this.lastDarkVoice = this.time;
        speak('방이 조금 어두워요. 불을 켜 주세요!');
      }
    }
  }

  render() {
    const { ctx, w, h, cover: c } = this;
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

    if (this.scene.showAvatar && this.pose) drawAvatar(ctx, this.pose, this.scene.avatarColor ?? COLORS.blue);
    this.scene.draw(ctx);
    this.particles.draw(ctx);
    if (this.showHome) this.homeButton.draw(ctx);
    this.drawCursors();

    if (!this.trackerReady) this.drawLoading();
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
      for (const trail of this.trails) {
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
    const tips = this.hands.map((h) => h.tip);
    if (this.pose) for (const i of [P.lWrist, P.rWrist]) if (visible(this.pose[i])) tips.push(this.pose[i]);
    if (this.mouse && !this.mouse.touch && this.time - this.mouse.t < MOUSE_IDLE) tips.push(this.mouse);
    for (const p of tips) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, unit * 0.045, 0, Math.PI * 2);
      ctx.fill();
      star(ctx, p.x, p.y, unit * 0.035, '#FFD23F', '#fff');
    }
    ctx.restore();
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
