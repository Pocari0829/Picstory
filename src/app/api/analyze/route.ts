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

type PlaceItem = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  googleMapsUri?: string;
};

type PlacesResponse = { places?: PlaceItem[] };

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

type VisionHint = {
  name: string;
  score: number;
  source: "WEB" | "LANDMARK";
  latLng?: LatLng;
};

type GeneratedGuide = {
  is_place_photo?: boolean;
  confidence?: number;
  reason?: string;
  place_query?: string;
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

// ───────── 설정값 (debug 로그를 보며 조정하세요) ─────────
// .env.local 에 GEMINI_MODELS=모델A,모델B 처럼 쉼표로 적으면 앞에서부터 시도하고,
// 한도 초과(429)·과부하(503)일 때 다음 모델로 넘어갑니다. (모델 코드는 ListModels로 확인)
const GEMINI_MODELS = (
  process.env.GEMINI_MODELS ??
  process.env.GEMINI_MODEL ??
  "gemini-3-flash-preview"
)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

const MAX_IMAGE_LENGTH = 20_000_000; // base64 길이 기준 (약 15MB)
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_HINTS = 3; // Gemini에게 넘길 Vision 힌트 개수
const MIN_LANDMARK_SCORE = 0.3;
const MIN_WEB_SCORE = 0.4;
const MIN_IDENTIFY_CONFIDENCE = 0.6; // Vision 힌트가 있을 때 Gemini 식별 신뢰도 기준
const MIN_IDENTIFY_CONFIDENCE_NO_HINT = 0.8; // Vision 힌트가 전혀 없을 때는 더 엄격하게
const MAX_HINT_DISTANCE_KM = 5; // Vision 랜드마크 좌표 ↔ 최종 Places 결과 허용 거리
const MAX_NEARBY_DISTANCE_KM = 3; // 메인 장소 ↔ 주변 추천 허용 거리
const RETRY_AFTER_SECONDS = 60; // 한도 초과 시 클라이언트에 알려줄 대기 시간(초)

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

const IS_DEV = process.env.NODE_ENV !== "production";
const jsonHeaders = { "Content-Type": "application/json" };

const NOT_IDENTIFIED = {
  notPlacePhoto:
    "장소 사진이 아니거나 어떤 곳인지 확신하기 어려워요. 명소나 건축물이 잘 보이는 사진을 올려주세요.",
  noPlace: "정확한 장소 정보를 찾지 못했어요.",
  mismatch:
    "사진 속 장소를 확실히 알아보지 못했어요. 다른 각도의 사진을 올려주세요.",
} as const;

const RATE_LIMITED_MESSAGE =
  "오늘은 사용량이 많아 분석할 수 없어요. 잠시 후 다시 시도해 주세요.";

// 외부 API가 HTTP 에러를 돌려줬을 때 상태 코드를 보존하기 위한 에러
class HttpError extends Error {
  constructor(
    public status: number,
    public service: string,
    message: string,
  ) {
    super(message);
  }
}

// 한도 초과(429) 또는 일시적 과부하(503)면 "나중에 다시 시도" 대상
function isRetryLater(error: unknown): error is HttpError {
  return (
    error instanceof HttpError && (error.status === 429 || error.status === 503)
  );
}

// 개발 환경에서만 debug 정보를 로그와 응답에 포함
function notIdentified(message: string, debug?: Record<string, unknown>) {
  if (IS_DEV && debug)
    console.log("[analyze reject]", message, JSON.stringify(debug, null, 2));
  return NextResponse.json({
    identified: false,
    message,
    ...(IS_DEV && debug ? { debug } : {}),
  });
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
    const service = new URL(url).hostname;
    throw new HttpError(
      response.status,
      service,
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

// Vision 결과는 "힌트"일 뿐 — 랜드마크 우선, 최소 점수, 일반어 제외
function selectVisionHints(result: VisionResponse): VisionHint[] {
  const response = result.responses?.[0];

  const landmarks: VisionHint[] = (response?.landmarkAnnotations ?? [])
    .filter(
      (item) => item.description && (item.score ?? 0) >= MIN_LANDMARK_SCORE,
    )
    .map((item) => ({
      name: item.description!,
      score: item.score ?? 0,
      source: "LANDMARK" as const,
      latLng: toLatLng(item.locations?.[0]?.latLng),
    }))
    .sort((a, b) => b.score - a.score);

  const web: VisionHint[] = (response?.webDetection?.webEntities ?? [])
    .filter(
      (item) =>
        item.description &&
        (item.score ?? 0) >= MIN_WEB_SCORE &&
        !GENERIC_ENTITIES.has(item.description.trim().toLowerCase()),
    )
    .map((item) => ({
      name: item.description!,
      score: item.score ?? 0,
      source: "WEB" as const,
    }))
    .sort((a, b) => b.score - a.score);

  return [...landmarks, ...web].slice(0, MAX_HINTS);
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
    // ── 1단계: Vision은 "힌트"만 제공 (여기서는 거절하지 않음) ──
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
    const hints = selectVisionHints(vision);
    const hintLoc = hints.find((h) => h.latLng)?.latLng;

    // ── 2단계: Gemini가 사진을 직접 보고 장소를 식별 + 안내문 작성 ──
    const hintText = hints.length
      ? hints
          .map((h) => `- ${h.name} (${h.source}, 점수 ${h.score.toFixed(2)})`)
          .join("\n")
      : "없음";

    const geminiPrompt = `
당신은 먼저 사진을 직접 보고 어떤 장소인지 식별해야 합니다.

[참고용 후보 - 틀릴 수 있으며, 특히 사진 근처의 식당·상점 이름이 섞여 있을 수 있음]
${hintText}

규칙:
1. is_place_photo: 사진이 실제 장소·건축물·명소를 담고 있으면 true. 음식, 인물 셀피, 스크린샷, 문서, 동물, 물건, 일상적인 실내 사진 등은 false.
2. place_query: 사진에 실제로 찍힌 대상을 Google 지도에서 찾을 수 있는 검색어로 작성하세요. (예: "Kaminarimon Gate Asakusa Tokyo"). 참고 후보가 사진과 다르면 후보를 무시하고 사진에서 직접 식별한 대상을 쓰세요. 주변 상점·식당이 아니라 사진의 주인공이 되는 장소여야 합니다.
3. confidence: 식별한 장소가 맞다는 확신도(0~1). 건축 양식, 현판·간판 글자, 상징적 구조물, 주변 풍경 등 시각적 근거가 뚜렷하면 높게, 어떤 장소인지 불분명하면 낮게 매기세요.
4. is_place_photo가 false이거나 장소를 식별할 수 없으면 나머지 필드는 비워 두세요. 절대 추측해서 채우지 마세요.

반드시 JSON 객체만 반환하세요. 마크다운 코드 블록은 사용하지 마세요.
형식: {"is_place_photo":true,"confidence":0.0~1.0,"reason":"판단 근거 한 문장","place_query":"Kaminarimon Gate Asakusa Tokyo","name_en":"YASAKA PAGODA","name_ko":"야사카 탑","subtitle":"Hōkan-ji Temple · 法観寺","area":"교토 히가시야마구","history":["한국어 역사 설명 3~4개"],"culture":["한국어 문화적 의미 2~3개"],"nearby":[{"name_ko":"한국어명","name_en":"영문명","subtitle":"현지명","category":"명소|맛집|상점|시장|카페","walk":"도보 거리","why":"추천 이유","website":null,"phone":null}]}
제목은 반드시 "영문명 | 한글명"으로 표시할 수 있도록 name_en과 name_ko를 분리하세요. area는 전체 주소가 아니라 도시·구역처럼 짧은 지역명으로 작성하세요.
역사 설명은 각 항목을 2~3개의 한국어 문장으로 작성하세요. 건립 시기와 유래, 주요 인물·사건, 재건·보존 과정, 현재까지 이어진 역사적 의미를 포함하되 확인되지 않은 전설은 사실처럼 단정하지 마세요.
nearby는 실제로 방문할 수 있는 장소 4곳을 추천하고, 명소뿐 아니라 가능한 경우 현지 맛집 또는 대표 음식점 1곳 이상과 상점·시장·공예점 1곳 이상을 포함하세요. 각 장소의 category는 명소, 맛집, 상점, 시장, 카페 중 하나를 사용하세요. 모르는 웹사이트와 전화번호는 null로 두세요.
`.trim();

    // 모델을 앞에서부터 시도하고, 한도 초과(429)/과부하(503)면 다음 모델로 전환
    let gemini: GeminiResponse | undefined;
    let usedModel = "";
    let lastError: unknown;
    for (const model of GEMINI_MODELS) {
      try {
        gemini = await requestJson<GeminiResponse>(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`,
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
        usedModel = model;
        break;
      } catch (e) {
        lastError = e;
        if (isRetryLater(e)) {
          console.warn(
            `Gemini model "${model}" unavailable (${e.status}), trying next`,
          );
          continue;
        }
        throw e;
      }
    }
    if (!gemini) throw lastError ?? new Error("gemini_no_model");

    const text = gemini.candidates?.[0]?.content?.parts?.find(
      (part) => part.text,
    )?.text;
    if (!text) throw new Error("gemini_empty_response");
    const generated = parseGeminiJson(text);

    const confidence =
      typeof generated.confidence === "number" ? generated.confidence : 0;
    const requiredConfidence =
      hints.length > 0
        ? MIN_IDENTIFY_CONFIDENCE
        : MIN_IDENTIFY_CONFIDENCE_NO_HINT;
    const history = toStringArray(generated.history);
    const placeQuery = generated.place_query?.trim();

    if (
      generated.is_place_photo !== true ||
      !placeQuery ||
      confidence < requiredConfidence ||
      history.length === 0
    ) {
      return notIdentified(NOT_IDENTIFIED.notPlacePhoto, {
        gate: "gemini",
        model: usedModel,
        requiredConfidence,
        hints,
        is_place_photo: generated.is_place_photo,
        place_query: placeQuery,
        confidence,
        reason: generated.reason,
        historyCount: history.length,
      });
    }

    // ── 3단계: Gemini가 식별한 이름으로 Places 확인 + Vision 좌표와 교차검증 ──
    const placesRes = await requestJson<PlacesResponse>(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          ...jsonHeaders,
          "X-Goog-Api-Key": placesKey,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri",
        },
        body: JSON.stringify({
          textQuery: placeQuery,
          languageCode: "ko",
          ...(hintLoc
            ? { locationBias: { circle: { center: hintLoc, radius: 5000 } } }
            : {}),
        }),
      },
    );
    const place = placesRes.places?.[0];
    const placeLoc = toLatLng(place?.location);
    if (!place?.displayName?.text || !placeLoc) {
      return notIdentified(NOT_IDENTIFIED.noPlace, {
        gate: "places",
        model: usedModel,
        place_query: placeQuery,
        confidence,
        reason: generated.reason,
      });
    }
    if (hintLoc) {
      const km = distanceKm(hintLoc, placeLoc);
      if (km > MAX_HINT_DISTANCE_KM) {
        return notIdentified(NOT_IDENTIFIED.mismatch, {
          gate: "places-distance",
          model: usedModel,
          place_query: placeQuery,
          place: place.displayName.text,
          hintLoc,
          km,
          MAX_HINT_DISTANCE_KM,
        });
      }
    }

    // ── 4단계: 주변 추천은 Places에서 실재 확인된 것만 ────────
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

    if (IS_DEV) {
      console.log(
        "[analyze ok]",
        JSON.stringify(
          {
            model: usedModel,
            hints: hints.map((h) => h.name),
            place_query: placeQuery,
            place: place.displayName.text,
            confidence,
            reason: generated.reason,
            nearbyKept: nearby.length,
          },
          null,
          2,
        ),
      );
    }

    return NextResponse.json({
      identified: true,
      confidence: confidence >= 0.85 ? "high" : "medium",
      name_en: generated.name_en ?? place.displayName.text,
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
    // 사용량 한도 초과(429) / 일시적 과부하(503): 나중에 다시 시도 안내
    if (isRetryLater(error)) {
      console.warn(`Rate limited by ${error.service} (${error.status})`);
      return NextResponse.json(
        {
          error: "rate_limited",
          message: RATE_LIMITED_MESSAGE,
          retryAfterSeconds: RETRY_AFTER_SECONDS,
        },
        {
          status: 429,
          headers: { "Retry-After": String(RETRY_AFTER_SECONDS) },
        },
      );
    }
    console.error("Photo analysis failed:", errorMessage(error));
    return NextResponse.json({ error: "analysis_failed" }, { status: 502 });
  }
}
