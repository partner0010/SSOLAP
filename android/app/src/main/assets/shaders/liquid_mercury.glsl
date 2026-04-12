/*
 * liquid_mercury.glsl
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 2: Android OpenGL ES 3.0 Fragment Shader
 * Metal 셰이더와 동일한 시각적 결과, GLSL 문법으로 변환
 *
 * 실행 환경: Adreno (Qualcomm) / Mali (ARM) / PowerVR GPU
 * ES 3.0 사용 이유: ES 2.0 대비 텍스처 배열, 루프 제어 등 지원
 * ─────────────────────────────────────────────────────────────────────────────
 */

#version 300 es
precision highp float;  // 고정밀 부동소수점 (셰이더 품질 핵심)

// ─── 입력 유니폼 ─────────────────────────────────────────────────────────────
uniform sampler2D u_cameraTex;      // 텍스처 유닛 0: 카메라 프레임
uniform sampler2D u_maskTex;        // 텍스처 유닛 1: 세그멘테이션 마스크
uniform sampler2D u_skinTex;        // 텍스처 유닛 2: 피부 마스크
uniform samplerCube u_cubemap;      // 텍스처 유닛 3: 환경 큐브맵

uniform float  u_time;              // 경과 시간 (초)
uniform vec2   u_gravity;           // 가속도 센서 중력 방향 (-1~1)
uniform vec2   u_touchPoint;        // 터치 위치 (정규화 0~1)
uniform float  u_touchTime;         // 터치 후 경과 시간
uniform float  u_touchActive;       // 터치 파동 활성 여부
uniform float  u_qualityLevel;      // 0=low ~ 3=ultra
uniform float  u_filterIntensity;   // 필터 강도 (0~1)

// ─── 입출력 ──────────────────────────────────────────────────────────────────
in  vec2 v_texCoord;    // 버텍스 셰이더에서 넘어온 UV
out vec4 fragColor;     // 최종 픽셀 컬러 출력

// ─── 상수 ────────────────────────────────────────────────────────────────────
const vec3  MERCURY_BASE  = vec3(0.78, 0.84, 0.88);
const vec3  MERCURY_DARK  = vec3(0.15, 0.18, 0.22);
const vec3  MERCURY_LIGHT = vec3(0.95, 0.97, 1.00);
const float ROUGHNESS     = 0.04;
const float METALLIC      = 0.98;
const float REFLECTANCE   = 0.92;
const float PI            = 3.14159265359;

// ─── Perlin Noise ─────────────────────────────────────────────────────────────

float hash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float perlinNoise(vec2 uv) {
  vec2 i = floor(uv);
  vec2 f = fract(uv);
  vec2 u = f * f * (3.0 - 2.0 * f);

  float a = hash(i + vec2(0.0, 0.0));
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 2.0 - 1.0;
}

float fbmNoise(vec2 uv, int octaves) {
  float value     = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;

  for (int i = 0; i < 4; i++) {
    if (i >= octaves) break;  // ES 3.0: 반복 횟수가 상수가 아니면 이렇게 처리
    value     += perlinNoise(uv * frequency) * amplitude;
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

// ─── PBR 함수 ────────────────────────────────────────────────────────────────

float distributionGGX(float NdotH, float roughness) {
  float a  = roughness * roughness;
  float a2 = a * a;
  float d  = (NdotH * NdotH) * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d);
}

vec3 fresnelSchlick(float cosTheta, vec3 F0) {
  return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 4.0);
}

// ─── 터치 파동 ────────────────────────────────────────────────────────────────
float touchRipple(vec2 uv, vec2 touchPos, float t) {
  float dist    = length(uv - touchPos);
  float radius  = t * 0.3;
  float width   = 0.03;
  float wave    = exp(-pow(dist - radius, 2.0) / (width * width));
  float damping = exp(-t * 2.5);
  return sin(dist * 80.0 - t * 15.0) * wave * damping * 0.025;
}

// ─── 중력 흐름 ────────────────────────────────────────────────────────────────
vec2 gravityFlow(vec2 uv, vec2 gravity, float time) {
  float pulse = sin(time * 2.0 + uv.y * 5.0) * 0.5 + 0.5;
  return gravity * 0.02 * pulse;
}

// ─── 메인 ────────────────────────────────────────────────────────────────────
void main() {
  vec2 uv = v_texCoord;

  // [1] 마스크
  float personMask  = texture(u_maskTex, uv).r;
  float skinMask    = texture(u_skinTex, uv).r;

  if (personMask < 0.05) {
    fragColor = texture(u_cameraTex, uv);
    return;
  }

  // [2] 디스플레이스먼트
  vec2 gravOffset = gravityFlow(uv, u_gravity, u_time);
  int  octaves    = (u_qualityLevel >= 2.0) ? 4 : 2;
  vec2 noiseUV    = uv * 3.5 + vec2(u_time * 0.8);
  float noiseX    = fbmNoise(noiseUV,             octaves);
  float noiseY    = fbmNoise(noiseUV + vec2(5.2, 1.3), octaves);

  vec2 displacedUV = clamp(
    uv + vec2(noiseX, noiseY) * 0.015 + gravOffset,
    0.001, 0.999
  );

  // [3] 터치 파동
  if (u_touchActive > 0.5 && u_touchTime < 2.0) {
    float ripple = touchRipple(uv, u_touchPoint, u_touchTime);
    displacedUV += vec2(ripple, ripple * 0.7);
    displacedUV  = clamp(displacedUV, 0.001, 0.999);
  }

  // [4] 환경 샘플
  vec4 cameraColor = texture(u_cameraTex, displacedUV);
  vec3 normal      = normalize(vec3(noiseX, noiseY, 1.0 - ROUGHNESS));
  vec3 viewDir     = vec3(0.0, 0.0, 1.0);
  vec3 reflectDir  = reflect(-viewDir, normal);
  vec4 envColor    = texture(u_cubemap, reflectDir);

  // [5] PBR
  float NdotV  = clamp(dot(normal, viewDir), 0.0, 1.0);
  vec3  F0     = MERCURY_BASE * REFLECTANCE;
  vec3  fresnel = fresnelSchlick(NdotV, F0);

  vec3  halfVec = normalize(viewDir + vec3(noiseX * 0.3, noiseY * 0.3, 1.0));
  float NdotH   = clamp(dot(normal, halfVec), 0.0, 1.0);
  float specD   = distributionGGX(NdotH, ROUGHNESS);
  vec3  specular = fresnel * specD * 0.25;

  // [6] 환경 반사 혼합
  vec3 envReflection = mix(cameraColor.rgb, envColor.rgb, 0.4) * 0.75;

  // [7] 수은 색상 합성
  vec3 diffuse      = MERCURY_BASE * (1.0 - METALLIC) * 0.05;
  vec3 mercuryColor = diffuse + envReflection + specular;
  float brightness  = dot(mercuryColor, vec3(0.299, 0.587, 0.114));
  mercuryColor = mix(mercuryColor, MERCURY_LIGHT, clamp((brightness - 0.7) * 2.0, 0.0, 1.0));
  mercuryColor = mix(MERCURY_DARK, mercuryColor, clamp(brightness + 0.3, 0.0, 1.0));

  // [8] 피부/의상 영역 분리
  float clothingMask = clamp(personMask - skinMask, 0.0, 1.0);
  vec3  skinMercury  = mercuryColor * 0.9;
  vec3  clothMercury = mercuryColor * 1.1;
  vec3  finalMercury = mix(clothMercury, skinMercury, skinMask / max(personMask, 0.001));

  // [9] 마스크 블렌딩
  float maskAlpha = smoothstep(0.1, 0.5, personMask);
  vec3  finalColor = mix(
    texture(u_cameraTex, uv).rgb,
    finalMercury,
    maskAlpha * u_filterIntensity
  );

  // [10] Cool Tone 색온도
  finalColor.r *= 0.96;
  finalColor.b *= 1.04;

  fragColor = vec4(finalColor, 1.0);
}
