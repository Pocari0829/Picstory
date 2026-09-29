import type { AnalyzeRequest, AnalyzeResult } from '@/lib/types';
import { resizeToJpeg } from '@/lib/image';

/** 화면에 그대로 보여줄 문구를 담는 에러 */
export class AnalyzeError extends Error {
  retryable: boolean;
  constructor(message: string, { retryable = true } = {}) {
    super(message);
    this.retryable = retryable;
  }
}

/**
 * 사진을 서버(/api/analyze)로 보내 장소 정보를 받아온다. 화면은 이 함수만 호출한다.
 * 지금 서버 라우트는 예시 결과를 돌려주는 mock 이고,
 * Gemini 연결은 src/app/api/analyze/route.ts 에서 하면 된다. (이 파일은 수정할 필요 없음)
 */
export async function analyzePhoto(file: File, { signal }: { signal?: AbortSignal } = {}): Promise<AnalyzeResult> {
  const image = await resizeToJpeg(file);
  const body: AnalyzeRequest = { image: image.base64, mimeType: image.mimeType };

  let res: Response;
  try {
    res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new AnalyzeError('서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  }

  if (res.status === 429) throw new AnalyzeError('요청이 많아요. 잠시 뒤에 다시 시도해 주세요.');
  if (res.status === 413) throw new AnalyzeError('사진 용량이 너무 커요. 다른 사진을 올려주세요.', { retryable: false });
  if (!res.ok) throw new AnalyzeError('분석 중 문제가 생겼어요. 다시 시도해 주세요.');
  return (await res.json()) as AnalyzeResult;
}
