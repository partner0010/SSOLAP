/**
 * MercuryPhysics.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 3: 물리 반응 및 상호작용 시스템
 *
 * 담당 기능:
 *   1. 가속도 센서 → 중력 방향 벡터 계산 → 수은 흐름 방향 결정
 *   2. 터치 이벤트 → 파동(Ripple) 물리 계산 → 셰이더 파라미터 전달
 *   3. 움직임 감지 → 노이즈 강도 자동 조절 (정지 시 조용, 움직일 때 역동적)
 *
 * 셰이더와의 연동:
 *   이 클래스가 계산한 값들을 MercuryUniforms 구조체로 묶어
 *   매 프레임 GPU에 업로드한다.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Accelerometer } from 'expo-sensors';
import { Subscription } from 'expo-sensors/build/DeviceSensor';

// ─── 타입 정의 ───────────────────────────────────────────────────────────────

/** GPU 셰이더로 전달될 물리 파라미터 패킷 */
export interface MercuryPhysicsData {
  gravity: [number, number];      // 중력 방향 벡터 (정규화 -1~1)
  touchPoint: [number, number];   // 터치 위치 UV (0~1)
  touchTime: number;              // 터치 발생 후 경과 시간 (초)
  touchActive: number;            // 파동 활성 여부 (0 또는 1)
  motionIntensity: number;        // 움직임 강도 (0~1) → 노이즈 진폭 조절
  displacementScale: number;      // 변위 스케일 (정지=0.008, 운동=0.025)
}

/** 가속도 센서 원시 데이터 */
interface AccelData {
  x: number; // 좌우 기울기 (-1~1 범위에서 약 ±9.8m/s²)
  y: number; // 상하 기울기
  z: number; // 앞뒤 기울기 (보통 -1 근처 = 화면이 위를 향함)
}

// ─── 물리 시뮬레이션 설정 ────────────────────────────────────────────────────
const PHYSICS_CONFIG = {
  // 가속도 센서 샘플링 간격 (ms) — 60fps 카메라와 맞춤
  SENSOR_INTERVAL_MS: 16,

  // 중력 벡터 스무딩 — 급격한 기울기 변화를 완화
  // 낮을수록 반응이 빠르지만 떨림이 생김
  GRAVITY_SMOOTHING: 0.85,  // 85% 이전 값 유지

  // 최대 중력 오프셋 (UV 단위) — 너무 크면 피부가 화면 밖으로 이동
  MAX_GRAVITY_OFFSET: 0.04,

  // 수은 흐름 감도 — 기기 기울기 → UV 오프셋 변환 계수
  TILT_SENSITIVITY: 0.3,

  // 파동 최대 지속 시간 (초)
  RIPPLE_DURATION: 2.0,

  // 움직임 감지 임계값 (이 이상 흔들려야 '움직임'으로 인식)
  MOTION_THRESHOLD: 0.05,

  // 움직임 강도 변화 속도 (0~1)
  MOTION_SMOOTHING: 0.92,
};

// ─── 메인 클래스 ──────────────────────────────────────────────────────────────

export class MercuryPhysics {
  // 현재 물리 상태
  private gravity: [number, number] = [0, 0];          // 스무딩된 중력 방향
  private rawGravity: [number, number] = [0, 0];        // 센서 원시값
  private motionIntensity: number = 0;                  // 현재 움직임 강도
  private prevAccel: AccelData = { x: 0, y: 0, z: -1 }; // 이전 프레임 가속도

  // 터치 파동 상태
  private touchActive: boolean = false;
  private touchPoint: [number, number] = [0.5, 0.5];
  private touchStartTime: number = 0;

  // 센서 구독
  private accelSubscription: Subscription | null = null;
  private isRunning: boolean = false;

  // 렌더 루프 콜백 (매 프레임 호출)
  private onDataUpdate: ((data: MercuryPhysicsData) => void) | null = null;

  /**
   * 물리 시스템 시작 — 가속도 센서 구독 시작
   * @param callback 매 프레임 물리 데이터를 받을 콜백
   */
  async start(callback: (data: MercuryPhysicsData) => void): Promise<void> {
    this.onDataUpdate = callback;

    // 가속도 센서 사용 권한 및 가용성 확인
    const isAvailable = await Accelerometer.isAvailableAsync();
    if (!isAvailable) {
      console.warn('[MercuryPhysics] Accelerometer not available — gravity disabled');
      this.isRunning = true;
      return; // 센서 없어도 터치 파동은 동작
    }

    // 샘플링 주기 설정 (60fps 목표)
    Accelerometer.setUpdateInterval(PHYSICS_CONFIG.SENSOR_INTERVAL_MS);

    // 센서 데이터 구독
    this.accelSubscription = Accelerometer.addListener((accelData) => {
      this._processAccelerometer(accelData);
    });

    this.isRunning = true;
    console.log('[MercuryPhysics] Physics engine started ✓');
  }

  /** 물리 시스템 정지 — 배터리 절약을 위해 카메라 비활성 시 호출 */
  stop(): void {
    this.accelSubscription?.remove();
    this.accelSubscription = null;
    this.isRunning = false;
    console.log('[MercuryPhysics] Physics engine stopped');
  }

  /**
   * 터치 이벤트 처리
   * @param x 터치 X 좌표 (화면 픽셀)
   * @param y 터치 Y 좌표 (화면 픽셀)
   * @param screenWidth 화면 너비
   * @param screenHeight 화면 높이
   */
  onTouch(x: number, y: number, screenWidth: number, screenHeight: number): void {
    // 픽셀 좌표를 UV (0~1) 정규화
    this.touchPoint = [x / screenWidth, y / screenHeight];
    this.touchStartTime = Date.now();
    this.touchActive = true;

    console.log(`[MercuryPhysics] Touch ripple at UV (${this.touchPoint[0].toFixed(2)}, ${this.touchPoint[1].toFixed(2)})`);
  }

  /**
   * 매 프레임 호출 — 현재 물리 상태를 GPU 파라미터로 패킹
   * Frame Processor worklet에서 호출됨
   */
  getCurrentData(): MercuryPhysicsData {
    // 터치 경과 시간 계산
    const touchElapsed = this.touchActive
      ? (Date.now() - this.touchStartTime) / 1000  // ms → 초
      : 0;

    // 파동이 지속 시간 초과하면 비활성화
    if (touchElapsed > PHYSICS_CONFIG.RIPPLE_DURATION) {
      this.touchActive = false;
    }

    // 움직임 강도에 따른 변위 스케일
    // 정지: 최소 일렁임, 운동: 최대 일렁임
    const displacementScale = 0.008 + this.motionIntensity * 0.017;

    return {
      gravity:          this.gravity,
      touchPoint:       this.touchPoint,
      touchTime:        touchElapsed,
      touchActive:      this.touchActive ? 1 : 0,
      motionIntensity:  this.motionIntensity,
      displacementScale,
    };
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  /**
   * 가속도 센서 데이터 처리
   * 기기 좌표계 → UV 중력 벡터로 변환
   *
   * 기기 좌표계:
   *   x: 화면 기준 오른쪽이 +
   *   y: 화면 기준 위쪽이 +
   *   z: 화면 법선 방향 (화면이 위를 향하면 z ≈ -1)
   */
  private _processAccelerometer(accel: AccelData): void {
    // ── 중력 벡터 추출 ────────────────────────────────────────────────────
    // x, y 값이 기기 기울기를 나타냄 (-1~1 정규화)
    const rawX = Math.max(-1, Math.min(1, accel.x));
    const rawY = Math.max(-1, Math.min(1, accel.y));

    // 지수 스무딩 (Exponential Moving Average) — 급격한 흔들림 완화
    this.rawGravity[0] = rawX;
    this.rawGravity[1] = rawY;

    const smoothing = PHYSICS_CONFIG.GRAVITY_SMOOTHING;
    this.gravity[0] = this.gravity[0] * smoothing + rawX * (1 - smoothing);
    this.gravity[1] = this.gravity[1] * smoothing + rawY * (1 - smoothing);

    // ── 움직임 강도 계산 ─────────────────────────────────────────────────
    // 현재 프레임과 이전 프레임의 가속도 차이 = 순간 움직임
    const deltaX = Math.abs(accel.x - this.prevAccel.x);
    const deltaY = Math.abs(accel.y - this.prevAccel.y);
    const deltaZ = Math.abs(accel.z - this.prevAccel.z);
    const instantMotion = Math.min(1, (deltaX + deltaY + deltaZ) / 0.5);

    // 임계값 이하 움직임은 무시 (손 떨림 등 미세 진동 필터링)
    const filteredMotion = instantMotion > PHYSICS_CONFIG.MOTION_THRESHOLD
      ? instantMotion
      : 0;

    // 스무딩 — 움직임이 갑자기 0이 되지 않도록 천천히 감소
    const motionSmooth = PHYSICS_CONFIG.MOTION_SMOOTHING;
    this.motionIntensity = this.motionIntensity * motionSmooth + filteredMotion * (1 - motionSmooth);

    this.prevAccel = { ...accel };

    // ── 콜백 호출 ────────────────────────────────────────────────────────
    if (this.onDataUpdate) {
      this.onDataUpdate(this.getCurrentData());
    }
  }

  // ─── 디버그 유틸리티 ────────────────────────────────────────────────────────

  /** 현재 중력 방향을 텍스트로 반환 (디버그 UI용) */
  getGravityDescription(): string {
    const [gx, gy] = this.gravity;
    const absX = Math.abs(gx);
    const absY = Math.abs(gy);

    if (absX < 0.1 && absY < 0.1) return '수직 (정자세)';
    if (absY < 0.1) return gx > 0 ? '↗ 오른쪽 기울임' : '↖ 왼쪽 기울임';
    if (absX < 0.1) return gy > 0 ? '↑ 위쪽 기울임' : '↓ 아래쪽 기울임';
    return `↗ 복합 기울임 (${(gx * 100).toFixed(0)}%, ${(gy * 100).toFixed(0)}%)`;
  }
}

// ─── 사용 예시 (VantaLensScreen.tsx) ─────────────────────────────────────────
/**
 * const physics = new MercuryPhysics();
 *
 * useEffect(() => {
 *   physics.start((data) => {
 *     // GPU 유니폼 업데이트
 *     mercuryUniforms.gravity      = data.gravity;
 *     mercuryUniforms.touchPoint   = data.touchPoint;
 *     mercuryUniforms.touchTime    = data.touchTime;
 *     mercuryUniforms.touchActive  = data.touchActive;
 *   });
 *   return () => physics.stop();
 * }, []);
 *
 * // 터치 이벤트
 * const handleTouch = (e: GestureResponderEvent) => {
 *   physics.onTouch(
 *     e.nativeEvent.locationX, e.nativeEvent.locationY,
 *     Dimensions.get('window').width, Dimensions.get('window').height
 *   );
 * };
 */
