/**
 * 클라이언트 이미지 리사이즈 — 200x200 center-cropped JPEG 썸네일.
 *
 * 용도: AI 분석용 사진을 Supabase Storage에 저장하기 전 압축.
 * 사용자 디바이스에서 처리 → 업로드 트래픽 ↓ + Storage 용량 ↓
 *
 * 알고리즘:
 *  1. img를 OffscreenCanvas/Canvas에 그리되, 원본 정사각형 부분만 center crop
 *  2. 200x200으로 스케일
 *  3. JPEG quality 0.8로 인코딩
 *
 * 의존성: 브라우저 Canvas API only (외부 lib 없음)
 */

export interface ResizedImage {
  /** Blob (JPEG) */
  blob: Blob;
  /** base64 data URL (preview 용) */
  dataUrl: string;
  /** 최종 크기 (px) */
  size: number;
}

const TARGET_SIZE = 200;
const JPEG_QUALITY = 0.8;

// AI 분석 전송용 cap. 1024 이상에서 Gemini 정확도 향상 거의 없음(영양표 OCR 안전 마진).
// 원본이 더 작으면 upscale 안 함 — 토큰 낭비 방지 + 정보 손실 없음.
const AI_MAX_DIMENSION = 1024;
// 텍스트 디테일 보존 위해 thumbnail(0.8)보다 살짝 높임.
const AI_JPEG_QUALITY = 0.9;

/**
 * AI 분석용 리사이즈.
 *  - 비율 유지 (crop X) — 영양표·메뉴 텍스트 잘림 방지
 *  - max(width, height)를 AI_MAX_DIMENSION으로 cap, 원본이 더 작으면 그대로
 *  - 결과는 메모리에서만 사용하고 Gemini 호출 후 폐기 (Storage 무관)
 */
export async function resizeForAi(file: File): Promise<ResizedImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);

    // 더 긴 변을 cap. 원본이 더 작으면 안 키움.
    const longerSide = Math.max(img.naturalWidth, img.naturalHeight);
    const scale = longerSide > AI_MAX_DIMENSION ? AI_MAX_DIMENSION / longerSide : 1;
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2d context 못 얻음");
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", AI_JPEG_QUALITY),
    );
    if (!blob) throw new Error("Canvas → Blob 변환 실패");

    const dataUrl = await blobToDataUrl(blob);
    return { blob, dataUrl, size: Math.max(w, h) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function resizeToThumbnail(
  file: File,
  size: number = TARGET_SIZE,
): Promise<ResizedImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2d context 못 얻음");

    // Center crop: 원본의 짧은 변 길이로 정사각형 추출
    const srcSize = Math.min(img.naturalWidth, img.naturalHeight);
    const srcX = (img.naturalWidth - srcSize) / 2;
    const srcY = (img.naturalHeight - srcSize) / 2;

    ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, size, size);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) throw new Error("Canvas → Blob 변환 실패");

    const dataUrl = await blobToDataUrl(blob);
    return { blob, dataUrl, size };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지 로드 실패"));
    img.src = src;
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
