import type { ReactNode } from 'react';

/** 콜라주 아래 한 줄 상태 표시 (분석 중 / 오류 / 완료 후 버튼) */
export default function StatusBar({
  tone = 'normal',
  busy = false,
  children,
}: {
  tone?: 'normal' | 'error';
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`status status--${tone}`} role="status" aria-live="polite">
      {busy && <span className="status__dot" aria-hidden="true" />}
      {children}
    </div>
  );
}
