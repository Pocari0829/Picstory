import { StarIcon, GlobeIcon, RouteIcon, PhoneIcon } from '@/components/Icons';
import type { NearbyPlace } from '@/lib/types';

const safeUrl = (u?: string | null) => {
  if (!u) return null;
  try {
    const x = new URL(u);
    return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null;
  } catch {
    return null;
  }
};

function PlaceCard({ place, area }: { place: NearbyPlace; area?: string }) {
  const where = area || 'Japan';
  const website = safeUrl(place.website);
  const webHref = website ?? `https://www.google.com/search?q=${encodeURIComponent(`${place.name_en} ${place.name_ko} ${where}`)}`;
  const destination = place.location?.latitude !== undefined && place.location.longitude !== undefined
    ? `${place.location.latitude},${place.location.longitude}`
    : `${place.name_en || place.name_ko}, ${where}`;
  const routeHref = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;

  return (
    <li className="place-card">
      <h4 className="place-card__name">{place.name_ko} | {place.name_en}</h4>
      {place.subtitle && <p className="place-card__sub jp">{place.subtitle}</p>}

      <div className="place-card__meta">
        {place.category && (<><StarIcon className="place-card__star" /><span>{place.category}</span></>)}
        {place.category && place.walk && <span aria-hidden="true">·</span>}
        {place.walk && <span>{place.walk}</span>}
      </div>
      {place.why && <p className="place-card__why">{place.why}</p>}

      <div className="place-card__actions">
        <a href={webHref} target="_blank" rel="noopener noreferrer"><GlobeIcon />{website ? '웹페이지' : '검색'}</a>
        <a href={routeHref} target="_blank" rel="noopener noreferrer"><RouteIcon />경로</a>
        {place.phone && (
          <a href={`tel:${place.phone.replace(/[^\d+]/g, '')}`} className="place-card__tel"><PhoneIcon />{place.phone}</a>
        )}
      </div>
    </li>
  );
}

/** 시안 2의 NEARBY PLACES (2×2 카드) */
export default function NearbyPlaces({ places = [], area }: { places?: NearbyPlace[]; area?: string }) {
  if (!places.length) return null;
  return (
    <section className="section" aria-labelledby="nearby-title">
      <h2 className="section__title" id="nearby-title">NEARBY PLACES</h2>
      <p className="section__sub">주변 관광지 추천</p>
      <ul className="nearby-grid">
        {places.slice(0, 4).map((p) => <PlaceCard key={`${p.name_en}-${p.name_ko}`} place={p} area={area} />)}
      </ul>
    </section>
  );
}
