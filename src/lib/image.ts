export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_FILE_MB = 20;

/** 업로드 가능한 파일인지 검사하고, 문제가 있으면 사용자에게 보여줄 문구를 돌려준다. */
export function validateImage(file: File | null | undefined): string | null {
  if (!file) return '사진 파일을 찾지 못했어요.';
  const name = file.name?.toLowerCase() ?? '';
  if (name.endsWith('.heic') || name.endsWith('.heif') || file.type === 'image/heic') {
    return '아이폰 HEIC 사진은 아직 올릴 수 없어요. JPG로 바꿔서 올려주세요.';
  }
  if (!ACCEPTED_TYPES.includes(file.type)) return 'JPG, PNG, WEBP 사진만 올릴 수 있어요.';
  if (file.size > MAX_FILE_MB * 1024 * 1024) return `${MAX_FILE_MB}MB 이하의 사진만 올릴 수 있어요.`;
  return null;
}

/**
 * 사진을 긴 변 기준 maxSize(px)로 줄이고 JPEG base64로 바꾼다.
 * 서버로 보내는 용량을 줄이는 용도 (Gemini 인라인 이미지는 요청당 약 20MB 제한).
 */
export async function resizeToJpeg(file: File, maxSize = 1600, quality = 0.85) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return { base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' as const, width, height };
}
