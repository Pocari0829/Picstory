// 시안에 쓰인 라인 아이콘 (stroke = currentColor)
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base: P = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };

export const ImagePlusIcon = (p: P) => (
  <svg viewBox="0 0 48 48" strokeWidth="2.4" {...base} {...p}>
    <path d="M26 10H9a3 3 0 0 0-3 3v24a3 3 0 0 0 3 3h28a3 3 0 0 0 3-3V22" />
    <path d="M6 33l10-10 9 9 5-5 10 10" />
    <circle cx="31" cy="19" r="2.6" />
    <path d="M39 3v12M33 9h12" />
  </svg>
);
export const StarIcon = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z" />
  </svg>
);
export const GlobeIcon = (p: P) => (
  <svg viewBox="0 0 24 24" strokeWidth="1.6" {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" />
  </svg>
);
export const RouteIcon = (p: P) => (
  <svg viewBox="0 0 24 24" strokeWidth="1.6" {...base} {...p}>
    <path d="M21 3L3 10.5l7.5 3 3 7.5z" />
  </svg>
);
export const PhoneIcon = (p: P) => (
  <svg viewBox="0 0 24 24" strokeWidth="1.6" {...base} {...p}>
    <path d="M5 3.5h3.2l1.6 4.2-2.2 1.5a11 11 0 0 0 7.2 7.2l1.5-2.2 4.2 1.6V19a2 2 0 0 1-2.2 2A17.5 17.5 0 0 1 3 5.7 2 2 0 0 1 5 3.5z" />
  </svg>
);
