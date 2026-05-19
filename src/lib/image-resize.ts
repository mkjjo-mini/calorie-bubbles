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
