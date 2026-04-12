/*
 * LiquidMercury.metal
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 2: iOS Metal GPU Fragment Shader — 액체 수은 질감
 *
 * 렌더링 파이프라인:
 *   카메라 프레임 텍스처
 *   + 세그멘테이션 마스크 텍스처 (skin/clothing/background)
 *   + 큐브맵 반사 텍스처 (배경으로 만든 환경맵)
 *   → PBR 크롬 질감 + Perlin Noise 유동 변위
 *   → 최종 픽셀 컬러
 *
 * 색온도: Cool Tone 실버 (#C8D8E8 기준, 약간 파란빛 도는 차가운 수은색)
 * ─────────────────────────────────────────────────────────────────────────────
 */

#include <metal_stdlib>
using namespace metal;

// ─── 상수 정의 ───────────────────────────────────────────────────────────────

// Cool Tone 수은 색상 (실버에 파랑 미세 가미)
constant float3 MERCURY_BASE_COLOR  = float3(0.78, 0.84, 0.88);  // 차가운 실버
constant float3 MERCURY_DARK_COLOR  = float3(0.15, 0.18, 0.22);  // 그림자 부분 어두운 청회색
constant float3 MERCURY_LIGHT_COLOR = float3(0.95, 0.97, 1.00);  // 하이라이트 (거의 흰색+청)

// PBR 파라미터 — 수은 재질 특성
constant float MERCURY_METALLIC   = 0.98;  // 거의 완전 금속 (1.0에 가까울수록 메탈릭)
constant float MERCURY_ROUGHNESS  = 0.04;  // 극도로 매끈함 (0=완전 거울, 1=완전 산란)
constant float MERCURY_REFLECTANCE = 0.92; // 반사율 (수은은 약 92% 반사)

// 환경 반사 강도
constant float ENV_REFLECTION_STRENGTH = 0.75;  // 배경이 금속 표면에 비치는 강도
constant float FRESNEL_POWER = 4.0;             // 프레넬 효과 강도 (시선 각도에 따른 반사 변화)

// Perlin Noise 유동 파라미터
constant float NOISE_SCALE      = 3.5;   // 노이즈 패턴 크기 (클수록 큰 물결)
constant float NOISE_SPEED      = 0.8;   // 유동 속도
constant float DISPLACEMENT_AMT = 0.015; // 변위 강도 (작을수록 미세한 일렁임)

// ─── 유니폼 버퍼 (CPU → GPU 전달 데이터) ─────────────────────────────────────
struct MercuryUniforms {
  float  time;              // 애니메이션 시간 (초)
  float2 gravity;           // 가속도 센서 → 중력 방향 벡터 (x, y)
  float2 touchPoint;        // 터치 위치 (정규화 0~1)
  float  touchTime;         // 터치 발생 후 경과 시간 (초)
  float  touchActive;       // 터치 파동 활성화 여부 (0 또는 1)
  float  qualityLevel;      // 0=low, 1=medium, 2=high, 3=ultra
  float  filterIntensity;   // 필터 강도 (0~1, 슬라이더로 사용자 조절)
};

// ─── 버텍스/프래그먼트 입출력 구조체 ─────────────────────────────────────────
struct VertexOut {
  float4 position [[position]];
  float2 texCoord;  // UV 좌표 (0~1)
};

// ─── Perlin Noise 구현 ────────────────────────────────────────────────────────
/*
 * 왜 Perlin Noise인가:
 *   - 랜덤과 달리 인접 픽셀 간 값이 부드럽게 연결됨
 *   - 수은 표면의 '살아있는 유동감'을 표현하기에 적합
 *   - 시간(time)을 입력에 포함시켜 애니메이션
 */

/** 해시 함수 — 정수 좌표를 유사 난수 float으로 변환 */
float hash(float2 p) {
  p = fract(p * float2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

/** 2D Perlin Noise — 부드럽게 보간된 노이즈 값 반환 (-1~1) */
float perlinNoise(float2 uv) {
  float2 i = floor(uv);    // 격자 정수 좌표
  float2 f = fract(uv);    // 격자 내 소수 좌표 (0~1)

  // Hermite 3차 보간 — 격자 경계에서 C1 연속성 보장 (Sharp 경계 제거)
  float2 u = f * f * (3.0 - 2.0 * f);

  // 4개 격자 꼭짓점의 해시값
  float a = hash(i + float2(0.0, 0.0));
  float b = hash(i + float2(1.0, 0.0));
  float c = hash(i + float2(0.0, 1.0));
  float d = hash(i + float2(1.0, 1.0));

  // 쌍선형 보간
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 2.0 - 1.0;
}

/** fBm (Fractional Brownian Motion) — 노이즈를 여러 옥타브로 중첩
 *  작은 파문 + 큰 물결을 동시에 표현 */
float fbmNoise(float2 uv, int octaves) {
  float value    = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;

  for (int i = 0; i < octaves; i++) {
    value     += perlinNoise(uv * frequency) * amplitude;
    frequency *= 2.0;     // 다음 옥타브는 2배 고주파
    amplitude *= 0.5;     // 다음 옥타브는 절반 진폭
  }
  return value;
}

// ─── PBR 조명 함수 ────────────────────────────────────────────────────────────

/**
 * GGX/Trowbridge-Reitz 분포함수 (D)
 * 표면의 미세 거칠기에 따른 하이라이트 모양 결정
 * roughness=0.04(수은)이면 매우 날카로운 하이라이트
 */
float distributionGGX(float NdotH, float roughness) {
  float a  = roughness * roughness;
  float a2 = a * a;
  float d  = (NdotH * NdotH) * (a2 - 1.0) + 1.0;
  return a2 / (M_PI_F * d * d);
}

/**
 * Schlick 프레넬 근사 (F)
 * 바라보는 각도에 따라 반사율이 달라지는 현상
 * 금속은 정면보다 비스듬히 볼 때 더 많이 반사됨
 */
float3 fresnelSchlick(float cosTheta, float3 F0) {
  // F0 = 수직 시선일 때 반사율 (수은: ~0.92)
  return F0 + (1.0 - F0) * pow(saturate(1.0 - cosTheta), FRESNEL_POWER);
}

/**
 * 터치 파동 효과
 * 물리 공식: 감쇠 원형 파동 (Damped Circular Wave)
 * 터치 후 시간이 지날수록 파동이 퍼지면서 약해짐
 */
float touchRipple(float2 uv, float2 touchPos, float timeSinceTouch) {
  // 터치 포인트까지의 거리
  float dist = length(uv - touchPos);

  // 파동 속도: 0.3 UV 단위/초
  float waveSpeed   = 0.3;
  float waveRadius  = timeSinceTouch * waveSpeed;  // 파동 전파 반경
  float waveWidth   = 0.03;                         // 파동 띠 두께

  // 파동 형태: 반경 근처에서만 값이 있고 멀어질수록 0
  float wave = exp(-pow(dist - waveRadius, 2.0) / (waveWidth * waveWidth));

  // 감쇠: 시간이 지날수록 파동 세기 약해짐 (1.5초 후 거의 사라짐)
  float damping = exp(-timeSinceTouch * 2.5);

  // 파동 진동: sin으로 물결 표현
  float ripple = sin(dist * 80.0 - timeSinceTouch * 15.0) * wave * damping;

  return ripple * 0.025; // 변위 스케일
}

/**
 * 중력 기반 수은 흐름
 * 기기를 기울이면 수은이 중력 방향으로 쏠리는 효과
 */
float2 gravityFlow(float2 uv, float2 gravity, float time) {
  // 중력 방향으로 UV를 약간 이동 → 마스크가 기울어지는 효과
  float2 flow = gravity * 0.02; // 최대 2% UV 이동

  // 시간에 따른 맥동 (수은이 흐르다 잠시 정체되는 느낌)
  float pulse = sin(time * 2.0 + uv.y * 5.0) * 0.5 + 0.5;
  return flow * pulse;
}

// ─── 메인 프래그먼트 셰이더 ───────────────────────────────────────────────────

fragment float4 liquidMercuryFragment(
  VertexOut            in        [[stage_in]],
  texture2d<float>     cameraTex [[texture(0)]],  // 카메라 원본 프레임
  texture2d<float>     maskTex   [[texture(1)]],  // 세그멘테이션 마스크
  texture2d<float>     skinTex   [[texture(2)]],  // 피부 마스크
  texturecube<float>   cubemap   [[texture(3)]],  // 환경 반사 큐브맵
  constant MercuryUniforms& uni  [[buffer(0)]]    // CPU에서 전달되는 파라미터
) {
  constexpr sampler linearSampler(
    filter::linear,             // 쌍선형 필터링 (부드러운 보간)
    address::clamp_to_edge      // 경계 밖은 엣지 픽셀로 채움
  );
  constexpr sampler cubeSampler(filter::linear, mip_filter::linear);

  float2 uv = in.texCoord;

  // ── [1] 마스크 값 읽기 ────────────────────────────────────────────────────
  float personMask  = maskTex.sample(linearSampler, uv).r;  // 전체 인물 (0~1)
  float skinMask    = skinTex.sample(linearSampler, uv).r;  // 피부 (0~1)
  float clothingMask = saturate(personMask - skinMask);      // 의상 = 인물 - 피부

  // 인물 바깥이면 원본 카메라 색상 그대로 반환
  if (personMask < 0.05) {
    return cameraTex.sample(linearSampler, uv);
  }

  // ── [2] Perlin Noise 디스플레이스먼트 ────────────────────────────────────
  // 중력 흐름 → UV 오프셋
  float2 gravOffset = gravityFlow(uv, uni.gravity, uni.time);

  // fBm 노이즈로 UV를 살짝 왜곡 → 액체가 일렁이는 느낌
  // octaves=4 (고품질), 저사양에선 2로 줄임
  int octaves = (uni.qualityLevel >= 2.0) ? 4 : 2;
  float2 noiseUV = uv * NOISE_SCALE + float2(uni.time * NOISE_SPEED);
  float  noiseX  = fbmNoise(noiseUV,               octaves);
  float  noiseY  = fbmNoise(noiseUV + float2(5.2, 1.3), octaves); // 다른 오프셋으로 독립적 Y 노이즈

  // 최종 UV 변위: 중력 흐름 + Perlin 유동 + 중력 오프셋
  float2 displacedUV = uv
    + float2(noiseX, noiseY) * DISPLACEMENT_AMT
    + gravOffset;

  // 경계 클램핑 (UV가 0~1 밖으로 나가지 않도록)
  displacedUV = clamp(displacedUV, 0.001, 0.999);

  // ── [3] 터치 파동 추가 변위 ──────────────────────────────────────────────
  float rippleDisp = 0.0;
  if (uni.touchActive > 0.5 && uni.touchTime < 2.0) {
    rippleDisp = touchRipple(uv, uni.touchPoint, uni.touchTime);
    displacedUV += float2(rippleDisp, rippleDisp * 0.7); // X보다 Y 약하게
  }

  // ── [4] 카메라 배경을 환경 반사에 활용 ───────────────────────────────────
  // 변위된 UV로 카메라 프레임을 샘플 → 금속 표면에 환경이 비치는 효과
  float4 cameraColor = cameraTex.sample(linearSampler, displacedUV);

  // 큐브맵 반사 방향 계산
  // 화면 공간 노멀 추정: 노이즈 그래디언트를 노멀로 활용
  float3 normal = normalize(float3(noiseX, noiseY, 1.0 - MERCURY_ROUGHNESS));
  float3 viewDir = float3(0.0, 0.0, 1.0); // 카메라 방향 (화면 법선)
  float3 reflectDir = reflect(-viewDir, normal);

  // 큐브맵에서 반사 색상 샘플
  float4 envColor = cubemap.sample(cubeSampler, reflectDir);

  // ── [5] PBR 크롬 재질 계산 ───────────────────────────────────────────────
  float NdotV = saturate(dot(normal, viewDir));

  // F0: 수직 시선 기준 반사율 (금속은 색조가 있는 F0)
  float3 F0 = MERCURY_BASE_COLOR * MERCURY_REFLECTANCE;

  // Schlick 프레넬: 비스듬히 볼수록 반사율 증가
  float3 fresnel = fresnelSchlick(NdotV, F0);

  // GGX 정반사 하이라이트 (roughness=0.04 → 극도로 좁고 밝은 하이라이트)
  float3 halfVec = normalize(viewDir + float3(noiseX * 0.3, noiseY * 0.3, 1.0));
  float NdotH    = saturate(dot(normal, halfVec));
  float specD    = distributionGGX(NdotH, MERCURY_ROUGHNESS);

  // 최종 스펙큘러 = 프레넬 × GGX 분포
  float3 specular = fresnel * specD * 0.25; // 0.25 = 에너지 보존 근사

  // ── [6] 환경 반사 혼합 ───────────────────────────────────────────────────
  // 배경 색상(카메라)과 큐브맵을 반사율에 따라 섞음
  float3 envReflection = mix(
    cameraColor.rgb,  // 실시간 배경 반사 (더 정확하지만 비용 높음)
    envColor.rgb,     // 큐브맵 반사 (근사치, 저비용)
    0.4               // 40% 큐브맵, 60% 실시간 배경 반사
  ) * ENV_REFLECTION_STRENGTH;

  // ── [7] 수은 재질 색상 합성 ──────────────────────────────────────────────
  // 디퓨즈: 금속은 거의 없음 (metallic=0.98이면 diffuse ≈ 0)
  float3 diffuse = MERCURY_BASE_COLOR * (1.0 - MERCURY_METALLIC) * 0.05;

  // 기본 수은 색상 = 디퓨즈 + 환경 반사 + 스펙큘러
  float3 mercuryColor = diffuse + envReflection + specular;

  // 하이라이트 강화: 가장 밝은 부분을 더 차갑게(파랗게) 강조
  float brightness = dot(mercuryColor, float3(0.299, 0.587, 0.114)); // 밝기 계산
  mercuryColor = mix(mercuryColor, MERCURY_LIGHT_COLOR, saturate(brightness - 0.7) * 2.0);

  // 어두운 영역: 청회색으로 (수은의 그림자는 파란 기운)
  mercuryColor = mix(MERCURY_DARK_COLOR, mercuryColor, saturate(brightness + 0.3));

  // ── [8] 피부 vs 의상 영역 다른 질감 적용 ────────────────────────────────
  // 피부: 반사율 약간 낮춤 (피부가 옷보다 조금 더 무광 수은)
  float3 skinMercury     = mercuryColor * 0.9;
  // 의상: 반사율 최대 (크롬 도금 의상 효과)
  float3 clothingMercury = mercuryColor * 1.1;

  // 피부/의상 비율에 따라 혼합
  float3 finalMercury = mix(clothingMercury, skinMercury, skinMask / max(personMask, 0.001));

  // ── [9] 필터 강도 적용 + 마스크 블렌딩 ──────────────────────────────────
  // 인물 영역에만 수은 효과 적용, 경계는 부드럽게 페이드
  float maskAlpha  = smoothstep(0.1, 0.5, personMask); // 부드러운 경계
  float3 finalColor = mix(
    cameraColor.rgb,  // 배경 (원본)
    finalMercury,     // 수은 필터 결과
    maskAlpha * uni.filterIntensity  // 마스크 × 필터 강도
  );

  // ── [10] Cool Tone 색온도 보정 ────────────────────────────────────────────
  // 전체적으로 약간 차갑게: 빨강 살짝 낮추고 파랑 살짝 높임
  finalColor.r *= 0.96;  // -4% 레드
  finalColor.b *= 1.04;  // +4% 블루 → 시원한 수은 색감

  return float4(finalColor, 1.0);
}

// ─── 버텍스 셰이더 (풀스크린 쿼드용) ─────────────────────────────────────────
vertex VertexOut liquidMercuryVertex(
  uint vertexID [[vertex_id]]
) {
  // 풀스크린 삼각형 2개로 화면 전체를 덮는 쿼드
  float2 positions[4] = {
    float2(-1.0, -1.0),  // 좌하
    float2( 1.0, -1.0),  // 우하
    float2(-1.0,  1.0),  // 좌상
    float2( 1.0,  1.0),  // 우상
  };
  float2 texCoords[4] = {
    float2(0.0, 1.0),    // 텍스처 좌하 (Y 반전: Metal은 Y축 아래가 0)
    float2(1.0, 1.0),
    float2(0.0, 0.0),
    float2(1.0, 0.0),
  };

  VertexOut out;
  out.position = float4(positions[vertexID], 0.0, 1.0);
  out.texCoord = texCoords[vertexID];
  return out;
}
