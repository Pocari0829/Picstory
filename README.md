<<<<<<< HEAD
# PICSTORY

일본 여행 중 찍은 사진을 올리면 AI가 장소를 알아보고 **역사(History)**, **문화적 의미(Cultural Meaning)**, **주변 가볼 만한 곳(Nearby Places)** 을 보여주는 미니 웹서비스입니다.
Next.js(App Router) + TypeScript. 지금은 `/api/analyze` 가 **mock**(1.5초 뒤 야사카 탑 예시 결과)으로 동작합니다.

## 실행

```bash
npm install
npm run dev                  # http://localhost:3000
npm run build && npm start   # 배포용 실행
```

Node.js 18.18 이상이 필요합니다.

## 폴더 구조

```
src/
├─ app/
│  ├─ layout.tsx              html/head, Pretendard 폰트, 메타데이터
│  ├─ page.tsx                메인 페이지 → <PicstoryApp />
│  ├─ globals.css             색상 토큰(#FF62A6, #FFF5F9)과 전체 스타일
│  ├─ icon.svg                파비콘
│  └─ api/analyze/route.ts    ★ 분석 API (지금은 mock, 나중에 Gemini 연결)
├─ components/
│  ├─ PicstoryApp.tsx         화면 상태(idle / loading / done / notfound / error) 관리
│  ├─ Header.tsx, Logo.tsx    PICSTORY 로고 헤더
│  ├─ PhotoCollage.tsx        사진 콜라주 + 업로드 카드 / 올린 사진 강조
│  ├─ StatusBar.tsx           분석 중·오류 안내
│  ├─ PlaceStory.tsx          장소 이름, History, Cultural Meaning
│  ├─ NearbyPlaces.tsx        주변 관광지 카드(2×2)
│  └─ Icons.tsx               라인 아이콘
├─ lib/
│  ├─ types.ts                API 요청/응답 타입 (AnalyzeResult)
│  ├─ analyzePhoto.ts         브라우저 → /api/analyze 호출
│  └─ image.ts                파일 검사, 업로드 전 축소(긴 변 1600px JPEG)
└─ data/example.ts            예시 결과(= mock 응답)
public/images/                시안에서 추출한 콜라주 사진 (yasaka-sample.jpg는 테스트용 업로드 사진)
```

`@/` 는 `src/` 를 가리킵니다 (tsconfig.json `paths`).

## 백엔드(Gemini) 연결할 때

`src/app/api/analyze/route.ts` 의 `TODO(Gemini)` 자리만 바꾸면 됩니다. 화면 코드는 수정할 필요 없습니다.

1. `npm i @google/genai`
2. `.env.example` 을 `.env.local` 로 복사하고 `GEMINI_API_KEY` 입력
3. 이미지(base64)와 프롬프트를 Gemini에 보내고, `src/lib/types.ts` 의 `AnalyzeResult` 모양 JSON을 받아 그대로 반환
   (장소를 못 찾으면 `{ "identified": false, "message": "이유" }`)

API 키는 서버 라우트에서만 쓰이고 브라우저로는 전달되지 않습니다.
=======
# Picstory
일본 방문 외국인이 겪는 불편 하나를 해결하는 한 화면짜리 서비스
>>>>>>> 274f4f8110375db1b6587d25304d0ce90cc58d91
