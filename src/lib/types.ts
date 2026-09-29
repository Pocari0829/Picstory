/** 주변 추천 장소 한 곳 */
export interface NearbyPlace {
  name_ko: string; // 기요미즈데라
  name_en: string; // Kiyomizu-dera
  subtitle?: string; // Kiyomizu Temple · 清水寺
  category?: string; // 불교 사찰
  walk?: string; // 도보 약 15분
  why?: string; // 추천 이유 한 문장
  website?: string | null; // 공식 웹사이트, 모르면 null
  phone?: string | null; // 전화번호, 모르면 null
}

/** POST /api/analyze 응답 — 백엔드(Gemini)도 이 모양으로 돌려주면 됩니다. */
export interface AnalyzeResult {
  identified: boolean;
  confidence?: 'high' | 'medium' | 'low';
  name_en?: string; // YASAKA PAGODA
  name_ko?: string; // 야사카 탑
  subtitle?: string; // Hōkan-ji Temple · 法観寺
  area?: string; // 교토 히가시야마구
  history?: string[];
  culture?: string[];
  nearby?: NearbyPlace[];
  message?: string | null; // identified=false 일 때 이유
}

/** POST /api/analyze 요청 */
export interface AnalyzeRequest {
  image: string; // base64 (data: 접두어 없음)
  mimeType: 'image/jpeg';
}
