import { NextResponse } from "next/server";
import type { AnalyzeRequest } from "@/lib/types";

type LatLng = { latitude: number; longitude: number };

type VisionResponse = {
  responses?: Array<{
    webDetection?: {
      webEntities?: Array<{ description?: string; score?: number }>;
    };
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

type VisionCandidate = {
  name: string;
  score: number;
  source: "WEB" | "LANDMARK";
  latLng?: LatLng;
};

type GeneratedGuide = {
  is_match?: boolean;
  match_confidence?: number;
  reason?: string;
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

// ───────── 설정값 (실제 로그를 보며 조정하세요) ─────────
const MAX_IMAGE_LENGTH = 20_000_000; // base64 길이 기준 (약 15MB)
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MIN_LANDMARK_SCORE = 0.5;
const MIN_WEB_SCORE = 0.6;
const MAX_PLACE_DISTANCE_KM = 3; // 랜드마크 좌표 ↔ Places 결과 허용 거리
const MAX_NEARBY_DISTANCE_KM = 3; // 메인 장소 ↔ 주변 추천 허용 거리
const MIN_MATCH_CONFIDENCE = 0.7; // Gemini 검증 통과 기준

// Vision 웹 엔티티에서 자주 나오는 일반 단어 (장소 식별에 쓸모없음)
const GENERIC_ENTITIES = new Set([
  "photography",
  "photograph",
  "tree",
  "sky",
  "building",
  "architecture",
  "food",
  "person",
  "people",
  "plant",
  "water",
  "road",
  "street",
  "city",
  "travel",
  "tourism",
  "landscape",
  "nature",
  "selfie",
  "room",
  "furniture",
  "text",
  "screenshot",
  "image",
  "picture",
  "art",
  "design",
  "animal",
  "dog",
  "cat",
  "car",
  "vehicle",
  "flower",
  "cuisine",
  "dish",
  "meal",
]);

const jsonHeaders = { "Content-Type": "application/json" };

const NOT_IDENTIFIED = {
  noCandidate:
    "사진 속 장소를 알아보지 못했어요. 명소나 건축물이 잘 보이는 사진을 올려주세요.",
  noPlace: "정확한 장소 정보를 찾지 못했어요.",
  mismatch:
    "사진 속 장소를 확실히 알아보지 못했어요. 다른 각도의 사진을 올려주세요.",
  notPlacePhoto: "장소 사진이 아니거나 어떤 곳인지 확신하기 어려워요.",
} as const;

function notIdentified(message: string) {
  return NextResponse.json({ identified: false, message });
}

function apiKey(...names: string[]) {
  return names.map((name) => process.env[name]).find(Boolean);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "external_api_error";
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      `${response.status}:${(await response.text()).slice(0, 300)}`,
    );
  }
  return response.json() as Promise<T>;
}

function toLatLng(loc?: {
  latitude?: number;
  longitude?: number;
}): LatLng | undefined {
  return typeof loc?.latitude === "number" && typeof loc?.longitude === "number"
    ? { latitude: loc.latitude, longitude: loc.longitude }
    : undefined;
}

function distanceKm(a: LatLng, b: LatLng) {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// 랜드마크 우선 → 최소 점수 → 일반어 제외
function selectVisionCandidate(
  result: VisionResponse,
): VisionCandidate | undefined {
  const response = result.responses?.[0];

  const landmark = (response?.landmarkAnnotations ?? [])
    .filter(
      (item) => item.description && (item.score ?? 0) >= MIN_LANDMARK_SCORE,
    )
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  if (landmark) {
    return {
      name: landmark.description!,
      score: landmark.score ?? 0,
      source: "LANDMARK",
      latLng: toLatLng(landmark.locations?.[0]?.latLng),
    };
  }

  const web = (response?.webDetection?.webEntities ?? [])
    .filter(
      (item) =>
        item.description &&
        (item.score ?? 0) >= MIN_WEB_SCORE &&
        !GENERIC_ENTITIES.has(item.description.trim().toLowerCase()),
    )
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  if (web) {
    return { name: web.description!, score: web.score ?? 0, source: "WEB" };
  }
  return undefined;
}

function parseGeminiJson(text: string): GeneratedGuide {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(cleaned) as GeneratedGuide;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (v): v is string => typeof v === "string" && v.trim().length > 0,
      )
    : [];
}

export async function POST(req: Request) {
  let body: Partial<AnalyzeRequest>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.image || typeof body.image !== "string") {
    return NextResponse.json({ error: "image_required" }, { status: 400 });
  }
  if (body.image.length > MAX_IMAGE_LENGTH) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }
  const mimeType = body.mimeType ?? "image/jpeg";
  if (!ALLOWED_MIME.has(mimeType)) {
    return NextResponse.json(
      { error: "unsupported_image_type" },
      { status: 415 },
    );
  }

  const visionKey = apiKey("GOOGLE_VISION_API_KEY", "VISION_API_KEY");
  const placesKey = apiKey("GOOGLE_PLACES_API_KEY", "PLACES_API_KEY");
  const geminiKey = apiKey("GEMINI_API_KEY", "GOOGLE_GEMINI_API_KEY");
  if (!visionKey || !placesKey || !geminiKey) {
    return NextResponse.json(
      { error: "server_api_keys_missing" },
      { status: 500 },
    );
  }

  try {
    // ── 게이트 1: Vision 후보 ──────────────────────────────
    const vision = await requestJson<VisionResponse>(
      `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(visionKey)}`,
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          requests: [
            {
              image: { content: body.image },
              features: [
                { type: "WEB_DETECTION", maxResults: 10 },
                { type: "LANDMARK_DETECTION", maxResults: 5 },
              ],
            },
          ],
        }),
      },
    );
    const candidate = selectVisionCandidate(vision);
    if (!candidate) return notIdentified(NOT_IDENTIFIED.noCandidate);

    // ── 게이트 2: Places 결과 + 거리 검증 ───────────────────
    const places = await requestJson<PlacesResponse>(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          ...jsonHeaders,
          "X-Goog-Api-Key": placesKey,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri",
        },
        body: JSON.stringify({ textQuery: candidate.name, languageCode: "ko" }),
      },
    );
    const place = places.places?.[0];
    const placeLoc = toLatLng(place?.location);
    if (!place?.displayName?.text || !placeLoc)
      return notIdentified(NOT_IDENTIFIED.noPlace);

    if (
      candidate.latLng &&
      distanceKm(candidate.latLng, placeLoc) > MAX_PLACE_DISTANCE_KM
    ) {
      return notIdentified(NOT_IDENTIFIED.mismatch);
    }

    // ── 게이트 3: Gemini가 사진과 장소의 일치 여부를 먼저 판정 ──
    const geminiPrompt = `
당신은 먼저 사진을 검증해야 합니다.
1. 사진이 실제 장소·건축물·명소를 담고 있는지 확인하세요. 음식, 인물 셀피, 스크린샷, 문서, 동물, 물건, 일상적인 실내 사진 등은 해당하지 않습니다.
2. 사진이 아래 장소와 일치하는지 판단하세요. 확실하지 않으면 is_match를 false로 하세요.
3. is_match가 false이면 나머지 필드는 비워 두세요. 절대 추측해서 채우지 마세요.

장소명: ${place.displayName.text}
주소: ${place.formattedAddress ?? "없음"}
좌표: ${placeLoc.latitude}, ${placeLoc.longitude}

is_match가 true일 때만 아래 내용을 바탕으로 여행 안내 데이터를 작성하세요.
반드시 JSON 객체만 반환하세요. 마크다운 코드 블록은 사용하지 마세요.
형식: {"is_match":true,"match_confidence":0.0~1.0,"reason":"판단 근거 한 문장","name_en":"YASAKA PAGODA","name_ko":"야사카 탑","subtitle":"Hōkan-ji Temple · 法観寺","area":"교토 히가시야마구","history":["한국어 역사 설명 3~4개"],"culture":["한국어 문화적 의미 2~3개"],"nearby":[{"name_ko":"한국어명","name_en":"영문명","subtitle":"현지명","category":"명소|맛집|상점|시장|카페","walk":"도보 거리","why":"추천 이유","website":null,"phone":null}]}
제목은 반드시 "영문명 | 한글명"으로 표시할 수 있도록 name_en과 name_ko를 분리하세요. area는 전체 주소가 아니라 도시·구역처럼 짧은 지역명으로 작성하세요.
역사 설명은 각 항목을 2~3개의 한국어 문장으로 작성하세요. 건립 시기와 유래, 주요 인물·사건, 재건·보존 과정, 현재까지 이어진 역사적 의미를 포함하되 확인되지 않은 전설은 사실처럼 단정하지 마세요.
nearby는 실제로 방문할 수 있는 장소 4곳을 추천하고, 명소뿐 아니라 가능한 경우 현지 맛집 또는 대표 음식점 1곳 이상과 상점·시장·공예점 1곳 이상을 포함하세요. 각 장소의 category는 명소, 맛집, 상점, 시장, 카페 중 하나를 사용하세요. 모르는 웹사이트와 전화번호는 null로 두세요.
`.trim();

    const gemini = await requestJson<{
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    }>(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${encodeURIComponent(geminiKey)}`,
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inlineData: { mimeType, data: body.image } },
                { text: geminiPrompt },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        }),
      },
    );
    const text = gemini.candidates?.[0]?.content?.parts?.find(
      (part) => part.text,
    )?.text;
    if (!text) throw new Error("gemini_empty_response");
    const generated = parseGeminiJson(text);

    const matchConfidence =
      typeof generated.match_confidence === "number"
        ? generated.match_confidence
        : 0;
    if (generated.is_match !== true || matchConfidence < MIN_MATCH_CONFIDENCE) {
      return notIdentified(NOT_IDENTIFIED.notPlacePhoto);
    }

    const history = toStringArray(generated.history);
    if (history.length === 0)
      return notIdentified(NOT_IDENTIFIED.notPlacePhoto);

    // ── 게이트 4: 주변 추천은 Places에서 실재 확인된 것만 ────────
    const settled = await Promise.allSettled(
      (generated.nearby ?? []).slice(0, 4).map(async (recommendation) => {
        if (!recommendation.name_en && !recommendation.name_ko) return null;
        const nearbyPlaces = await requestJson<PlacesResponse>(
          "https://places.googleapis.com/v1/places:searchText",
          {
            method: "POST",
            headers: {
              ...jsonHeaders,
              "X-Goog-Api-Key": placesKey,
              "X-Goog-FieldMask":
                "places.displayName,places.formattedAddress,places.location,places.googleMapsUri",
            },
            body: JSON.stringify({
              textQuery: `${recommendation.name_en ?? recommendation.name_ko}, ${place.formattedAddress ?? ""}`,
              languageCode: "ko",
            }),
          },
        );
        const nearbyPlace = nearbyPlaces.places?.[0];
        const nearbyLoc = toLatLng(nearbyPlace?.location);
        if (!nearbyPlace || !nearbyLoc) return null; // Places에 없으면 제외 (환각 방지)
        if (distanceKm(placeLoc, nearbyLoc) > MAX_NEARBY_DISTANCE_KM)
          return null; // 너무 멀면 제외
        return {
          ...recommendation,
          name_ko:
            recommendation.name_ko ??
            nearbyPlace.displayName?.text ??
            recommendation.name_en,
          name_en:
            recommendation.name_en ??
            nearbyPlace.displayName?.text ??
            recommendation.name_ko,
          mapsUrl: nearbyPlace.googleMapsUri,
          location: nearbyPlace.location,
        };
      }),
    );
    const nearby = settled.flatMap((result) =>
      result.status === "fulfilled" && result.value ? [result.value] : [],
    );

    return NextResponse.json({
      identified: true,
      confidence: matchConfidence >= 0.85 ? "high" : "medium",
      name_en: generated.name_en ?? candidate.name,
      name_ko: generated.name_ko ?? place.displayName.text,
      subtitle: generated.subtitle ?? place.formattedAddress,
      area: generated.area ?? place.formattedAddress,
      location: place.location,
      placeId: place.id,
      mapsUrl: place.googleMapsUri,
      history,
      culture: toStringArray(generated.culture),
      nearby,
    });
  } catch (error) {
    console.error("Photo analysis failed:", errorMessage(error));
    return NextResponse.json({ error: "analysis_failed" }, { status: 502 });
  }
}
