import { NextResponse } from 'next/server';
import type { AnalyzeRequest } from '@/lib/types';

type VisionResponse = {
  responses?: Array<{
    webDetection?: { webEntities?: Array<{ description?: string; score?: number }> };
    landmarkAnnotations?: Array<{
      description?: string;
      score?: number;
      locations?: Array<{ latLng?: { latitude?: number; longitude?: number } }>;
    }>;
  }>;
};

type PlacesResponse = {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    googleMapsUri?: string;
  }>;
};

const jsonHeaders = { 'Content-Type': 'application/json' };

function apiKey(...names: string[]) {
  return names.map((name) => process.env[name]).find(Boolean);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'external_api_error';
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`${response.status}:${(await response.text()).slice(0, 300)}`);
  }
  return response.json() as Promise<T>;
}

function selectVisionCandidate(result: VisionResponse) {
  const response = result.responses?.[0];
  const web = (response?.webDetection?.webEntities ?? [])
    .filter((item) => item.description)
    .map((item) => ({ name: item.description!, score: item.score ?? 0, source: 'WEB' as const }));
  const landmarks = (response?.landmarkAnnotations ?? [])
    .filter((item) => item.description)
    .map((item) => ({ name: item.description!, score: item.score ?? 0, source: 'LANDMARK' as const }));

  return [...web, ...landmarks].sort((a, b) => {
    if (a.source !== b.source) return a.source === 'WEB' ? -1 : 1;
    return b.score - a.score;
  })[0];
}

function parseGeminiJson(text: string) {
  const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(cleaned) as {
    name_en?: string;
    name_ko?: string;
    subtitle?: string;
    area?: string;
    history?: string[];
    culture?: string[];
    nearby?: Array<{
      name_ko?: string;
      name_en?: string;
      subtitle?: string;
      category?: string;
      walk?: string;
      why?: string;
      website?: string | null;
      phone?: string | null;
    }>;
  };
}

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

  const visionKey = apiKey('GOOGLE_VISION_API_KEY', 'VISION_API_KEY');
  const placesKey = apiKey('GOOGLE_PLACES_API_KEY', 'PLACES_API_KEY');
  const geminiKey = apiKey('GEMINI_API_KEY', 'GOOGLE_GEMINI_API_KEY');
  if (!visionKey || !placesKey || !geminiKey) {
    return NextResponse.json({ error: 'server_api_keys_missing' }, { status: 500 });
  }

  try {
    const vision = await requestJson<VisionResponse>(
      `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(visionKey)}`,
      {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          requests: [{
            image: { content: body.image },
            features: [
              { type: 'WEB_DETECTION', maxResults: 10 },
              { type: 'LANDMARK_DETECTION', maxResults: 5 },
            ],
          }],
        }),
      },
    );
    const candidate = selectVisionCandidate(vision);
    if (!candidate) {
      return NextResponse.json({ identified: false, message: '사진 속 장소를 알아보지 못했어요.' });
    }

    const places = await requestJson<PlacesResponse>('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        ...jsonHeaders,
        'X-Goog-Api-Key': placesKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri',
      },
      body: JSON.stringify({ textQuery: candidate.name, languageCode: 'ko' }),
    });
    const place = places.places?.[0];
    if (!place?.displayName?.text) {
      return NextResponse.json({ identified: false, message: '정확한 장소 정보를 찾지 못했어요.' });
    }

    const geminiPrompt = `
사진 인식 결과와 Google Places로 확인된 장소를 바탕으로 여행 안내 데이터를 작성하세요.
장소명: ${place.displayName.text}
주소: ${place.formattedAddress ?? '없음'}
좌표: ${place.location?.latitude ?? '없음'}, ${place.location?.longitude ?? '없음'}

반드시 JSON 객체만 반환하세요. 마크다운 코드 블록은 사용하지 마세요.
  형식: {"name_en":"YASAKA PAGODA","name_ko":"야사카 탑","subtitle":"Hōkan-ji Temple · 法観寺","area":"교토 히가시야마구","history":["한국어 역사 설명 3~4개"],"culture":["한국어 문화적 의미 2~3개"],"nearby":[{"name_ko":"한국어명","name_en":"영문명","subtitle":"현지명","category":"명소|맛집|상점|시장|카페","walk":"도보 거리","why":"추천 이유","website":null,"phone":null}]}
  제목은 반드시 "영문명 | 한글명"으로 표시할 수 있도록 name_en과 name_ko를 분리하세요. area는 전체 주소가 아니라 도시·구역처럼 짧은 지역명으로 작성하세요.
역사 설명은 각 항목을 2~3개의 한국어 문장으로 작성하세요. 건립 시기와 유래, 주요 인물·사건, 재건·보존 과정, 현재까지 이어진 역사적 의미를 포함하되 확인되지 않은 전설은 사실처럼 단정하지 마세요.
nearby는 실제로 방문할 수 있는 장소 4곳을 추천하고, 명소뿐 아니라 가능한 경우 현지 맛집 또는 대표 음식점 1곳 이상과 상점·시장·공예점 1곳 이상을 포함하세요. 각 장소의 category는 명소, 맛집, 상점, 시장, 카페 중 하나를 사용하세요. 모르는 웹사이트와 전화번호는 null로 두세요.
`.trim();
    const gemini = await requestJson<{
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    }>(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${encodeURIComponent(geminiKey)}`,
      {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType: body.mimeType ?? 'image/jpeg', data: body.image } },
              { text: geminiPrompt },
            ],
          }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
        }),
      },
    );
    const text = gemini.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;
    if (!text) throw new Error('gemini_empty_response');
    const generated = parseGeminiJson(text);

    const nearby = await Promise.all((generated.nearby ?? []).slice(0, 4).map(async (recommendation) => {
      if (!recommendation.name_en && !recommendation.name_ko) return null;
      const nearbyPlaces = await requestJson<PlacesResponse>('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          ...jsonHeaders,
          'X-Goog-Api-Key': placesKey,
          'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.googleMapsUri',
        },
        body: JSON.stringify({
          textQuery: `${recommendation.name_en ?? recommendation.name_ko}, ${place.formattedAddress ?? ''}`,
          languageCode: 'ko',
        }),
      });
      const nearbyPlace = nearbyPlaces.places?.[0];
      return {
        ...recommendation,
        name_ko: recommendation.name_ko ?? nearbyPlace?.displayName?.text ?? recommendation.name_en,
        name_en: recommendation.name_en ?? nearbyPlace?.displayName?.text ?? recommendation.name_ko,
        mapsUrl: nearbyPlace?.googleMapsUri,
        location: nearbyPlace?.location,
      };
    }));

    return NextResponse.json({
      identified: true,
      confidence: candidate.score >= 0.8 ? 'high' : candidate.score >= 0.5 ? 'medium' : 'low',
      name_en: generated.name_en ?? candidate.name,
      name_ko: generated.name_ko ?? place.displayName.text,
      subtitle: generated.subtitle ?? place.formattedAddress,
      area: generated.area ?? place.formattedAddress,
      location: place.location,
      placeId: place.id,
      mapsUrl: place.googleMapsUri,
      history: generated.history ?? [],
      culture: generated.culture ?? [],
      nearby: nearby.filter((item): item is NonNullable<typeof item> => item !== null),
    });
  } catch (error) {
    console.error('Photo analysis failed:', errorMessage(error));
    return NextResponse.json({ error: 'analysis_failed' }, { status: 502 });
  }
}
