import type { AnalyzeResult } from '@/lib/types';

const list = (v: unknown): string[] =>
  (Array.isArray(v) ? v : v ? [v] : []).filter((s): s is string => typeof s === 'string' && s.trim() !== '');

/** 시안 2의 "YASAKA PAGODA | 야사카 탑" + History + Cultural Meaning 영역 */
export default function PlaceStory({ place }: { place: AnalyzeResult }) {
  return (
    <section className="section story" aria-labelledby="place-name">
      {place.confidence === 'low' && <span className="chip">AI가 확신하지 못한 결과예요</span>}

      <h2 className="story__name" id="place-name">
        {place.name_en} | {place.name_ko}
      </h2>
      {place.subtitle && <p className="story__sub jp">{place.subtitle}</p>}
      {place.area && <p className="story__area">{place.area}</p>}

      <h3 className="story__label">History</h3>
      {list(place.history).map((p, i) => (
        <p key={i} className="story__text">{p}</p>
      ))}

      <h3 className="story__label">Cultural Meaning</h3>
      {list(place.culture).map((p, i) => (
        <p key={i} className="story__text">{p}</p>
      ))}
    </section>
  );
}
