import { NextResponse } from 'next/server';
import { EXAMPLE_RESULT } from '@/data/example';
import type { AnalyzeRequest } from '@/lib/types';

/**
 * POST /api/analyze
 * 요청: { image: base64 JPEG, mimeType: 'image/jpeg' }
 * 응답: AnalyzeResult (src/lib/types.ts)
 *
 * ── 지금은 MOCK ──
 * 1.5초 뒤 예시(야사카 탑) 결과를 돌려준다.
 *
 * ── Gemini 연결 시 (나중에) ──
 * 1) npm i @google/genai
 * 2) .env.local 에 GEMINI_API_KEY 설정
 * 3) 아래 TODO 자리에서 이미지(inlineData)와 프롬프트를 Gemini에 보내고,
 *    AnalyzeResult 모양의 JSON(구조화된 출력)을 받아 그대로 반환
 * API 키는 이 서버 코드에서만 쓰이고 브라우저로는 가지 않는다.
 */
export async function POST(req: Request) {
  let body: Partial<AnalyzeRequest>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!body.image || typeof body.image !== 'string') {
    return NextResponse.json({ error: 'image_required' }, { status: 400 });
  }
  // base64 길이로 대략적인 용량 확인 (약 15MB 초과 시 거절)
  if (body.image.length > 20_000_000) {
    return NextResponse.json({ error: 'too_large' }, { status: 413 });
  }

  // TODO(Gemini): 여기서 Gemini API 호출 후 결과 반환
  await new Promise((r) => setTimeout(r, 1500));
  return NextResponse.json(EXAMPLE_RESULT);
}
