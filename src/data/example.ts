import type { AnalyzeResult } from "@/lib/types";

/**
 * 백엔드 연결 전 mock 응답 — 야사카 탑 사진을 올렸을 때 나와야 하는 결과(시안 2).
 * 백엔드(Gemini)도 이 모양 그대로 JSON을 돌려주면 화면이 그대로 동작합니다.
 * 필드 설명은 src/lib/types.ts 참고.
 */

export const EXAMPLE_RESULT: AnalyzeResult = {
  identified: true,
  confidence: 'high',
  name_en: 'YASAKA PAGODA',
  name_ko: '야사카 탑',
  subtitle: 'Hōkan-ji Temple · 法観寺',
  area: '교토 히가시야마구',
  history: [
    '야사카 탑은 교토 히가시야마 지역에 있는 호칸지(法観寺)의 오층탑으로, 높이는 약 46m이다. 교토의 오래된 거리 사이에 자리하고 있어 기요미즈데라와 기온 지역을 잇는 대표적인 풍경으로 알려져 있다.',
    '전해지는 이야기에 따르면 이곳은 589년 쇼토쿠 태자가 꿈에서 계시를 받아 처음 세웠다고 한다. 탑은 여러 차례 화재와 재건을 거쳤으며, 지금의 탑은 1440년 무로마치 막부의 쇼군 아시카가 요시노리가 다시 세운 것이다.',
  ],
  culture: [
    '야사카 탑은 교토 사람들에게 히가시야마의 이정표와 같은 존재다. 돌길 끝에 솟은 탑의 실루엣은 옛 수도의 정취를 상징하는 장면으로 엽서와 영화, 사진에 수없이 등장해 왔다.',
    '오층탑은 부처의 사리를 모시는 불탑에서 비롯된 건축으로, 다섯 층은 땅·물·불·바람·하늘의 다섯 요소를 뜻한다고 풀이된다.',
  ],
  nearby: [
    {
      name_ko: '기요미즈데라',
      name_en: 'Kiyomizu-dera',
      subtitle: 'Kiyomizu Temple · 清水寺',
      category: '불교 사찰',
      walk: '도보 약 15분',
      why: '절벽 위 목조 무대에서 교토 시내를 내려다볼 수 있는 세계유산 사찰이다.',
      website: 'https://www.kiyomizudera.or.jp/',
      phone: '075-551-1234',
    },
    {
      name_ko: '산넨자카·니넨자카',
      name_en: 'Sannenzaka & Ninenzaka',
      subtitle: 'Historic Lanes · 三年坂・二年坂',
      category: '옛 거리',
      walk: '도보 약 3분',
      why: '찻집과 공예품 가게가 늘어선 돌계단 길로, 야사카 탑과 기요미즈데라를 잇는다.',
      website: null,
      phone: null,
    },
    {
      name_ko: '고다이지',
      name_en: 'Kōdai-ji',
      subtitle: 'Kōdai-ji Temple · 高台寺',
      category: '선종 사찰',
      walk: '도보 약 5분',
      why: '도요토미 히데요시의 부인 네네가 세운 절로, 정원과 대나무 숲이 아름답다.',
      website: 'https://www.kodaiji.com/',
      phone: '075-561-9966',
    },
    {
      name_ko: '야사카 신사',
      name_en: 'Yasaka Shrine',
      subtitle: 'Yasaka-jinja · 八坂神社',
      category: '신사',
      walk: '도보 약 10분',
      why: '기온 마쓰리를 주관하는 신사로, 저녁에 등롱이 켜지면 분위기가 특히 좋다.',
      website: 'https://www.yasaka-jinja.or.jp/',
      phone: '075-561-6155',
    },
  ],
};
