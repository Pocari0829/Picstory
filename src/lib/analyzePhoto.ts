import type { AnalyzeRequest, AnalyzeResult } from "@/lib/types";
import { resizeToJpeg } from "@/lib/image";

/** 화면에 그대로 보여줄 문구를 담는 에러 */
export class AnalyzeError extends Error {
  retryable: boolean;
  /** 사용량 한도 초과 시 서버가 알려준 대기 시간(초). 없으면 undefined */
  retryAfterSeconds?: number;
  constructor(
    message: string,
    {
      retryable = true,
      retryAfterSeconds,
    }: { retryable?: boolean; retryAfterSeconds?: number } = {},
  ) {
    super(message);
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * 사진을 서버(/api/analyze)로 보내 장소 정보를 받아온다. 화면은 이 함수만 호출한다.
 * 서버 라우트는 src/app/api/analyze/route.ts 에 있다.
 */
export async function analyzePhoto(
  file: File,
  { signal }: { signal?: AbortSignal } = {},
): Promise<AnalyzeResult> {
  const image = await resizeToJpeg(file);
  const body: AnalyzeRequest = {
    image: image.base64,
    mimeType: image.mimeType,
  };

  let res: Response;
  try {
    res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new AnalyzeError(
      "서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
    );
  }

  // 사용량 한도 초과: 서버가 내려준 안내 문구와 대기 시간을 그대로 전달
  if (res.status === 429) {
    const data = (await res.json().catch(() => ({}))) as {
      message?: string;
      retryAfterSeconds?: number;
    };
    const headerSec = Number(res.headers.get("Retry-After"));
    throw new AnalyzeError(
      data.message ?? "요청이 많아요. 잠시 뒤에 다시 시도해 주세요.",
      {
        retryAfterSeconds:
          data.retryAfterSeconds ??
          (Number.isFinite(headerSec) && headerSec > 0 ? headerSec : 60),
      },
    );
  }
  if (res.status === 413)
    throw new AnalyzeError("사진 용량이 너무 커요. 다른 사진을 올려주세요.", {
      retryable: false,
    });
  if (res.status === 415)
    throw new AnalyzeError(
      "지원하지 않는 사진 형식이에요. JPG, PNG, WEBP 사진을 올려주세요.",
      { retryable: false },
    );
  if (!res.ok)
    throw new AnalyzeError("분석 중 문제가 생겼어요. 다시 시도해 주세요.");
  return (await res.json()) as AnalyzeResult;
}
