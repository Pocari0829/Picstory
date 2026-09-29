'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Header from '@/components/Header';
import PhotoCollage from '@/components/PhotoCollage';
import StatusBar from '@/components/StatusBar';
import PlaceStory from '@/components/PlaceStory';
import NearbyPlaces from '@/components/NearbyPlaces';
import { analyzePhoto, AnalyzeError } from '@/lib/analyzePhoto';
import { validateImage } from '@/lib/image';
import type { AnalyzeResult } from '@/lib/types';

type Status = 'idle' | 'loading' | 'done' | 'notfound' | 'error';

/**
 * 화면 상태
 *  idle     : 업로드 카드만 (아래는 비어 있음)
 *  loading  : 올린 사진 스캔 중 + 스켈레톤
 *  done     : 분석 결과
 *  notfound : 장소를 알아내지 못함
 *  error    : 네트워크·서버 오류 또는 잘못된 파일
 */
export default function PicstoryApp() {
  const [status, setStatus] = useState<Status>('idle');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [message, setMessage] = useState('');
  const [canRetry, setCanRetry] = useState(false);

  const fileRef = useRef<File | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const setPhoto = (file: File | null) => {
    setPhotoUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return file ? URL.createObjectURL(file) : null;
    });
  };

  const run = useCallback(async (file: File) => {
    const invalid = validateImage(file);
    if (invalid) {
      setStatus('error');
      setMessage(invalid);
      setCanRetry(false);
      return;
    }

    fileRef.current = file;
    setPhoto(file);
    setStatus('loading');
    setResult(null);

    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;

    try {
      const data = await analyzePhoto(file, { signal: ctl.signal });
      if (!data?.identified || !data.name_ko) {
        setStatus('notfound');
        setMessage(data?.message || '사진 속 장소를 알아보지 못했어요. 건물이나 풍경이 잘 보이는 사진으로 다시 시도해 주세요.');
        return;
      }
      setResult(data);
      setStatus('done');
      requestAnimationFrame(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        resultsRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      });
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      setStatus('error');
      setMessage(e instanceof AnalyzeError ? e.message : '분석 중 문제가 생겼어요. 다시 시도해 주세요.');
      setCanRetry(e instanceof AnalyzeError ? e.retryable : true);
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    fileRef.current = null;
    setPhoto(null);
    setResult(null);
    setMessage('');
    setStatus('idle');
    window.scrollTo({ top: 0 });
  }, []);

  // 클립보드에 복사한 사진 붙여넣기(Ctrl/Cmd+V) 지원
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (status === 'loading') return;
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (file) run(file);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [run, status]);

  // 기본 화면(idle)에서는 콜라주 아래에 아무것도 보여주지 않는다
  const shown = status === 'done' ? result : null;

  return (
    <>
      <Header onHome={reset} />
      <main className="page">
        <h1 className="page__lead">사진 한 장으로 일본의 이야기를 발견해 보세요!</h1>

        <PhotoCollage photoUrl={photoUrl} scanning={status === 'loading'} onFile={run} />

        {status === 'loading' && (
          <StatusBar busy>
            사진 속 장소를 찾고 이야기를 정리하고 있어요.
            <button type="button" className="btn" onClick={reset}>취소</button>
          </StatusBar>
        )}
        {(status === 'error' || status === 'notfound') && (
          <StatusBar tone="error">
            {message}
            {status === 'error' && canRetry && fileRef.current && (
              <button type="button" className="btn btn--primary" onClick={() => fileRef.current && run(fileRef.current)}>다시 시도</button>
            )}
            {photoUrl && <button type="button" className="btn" onClick={reset}>다른 사진 올리기</button>}
          </StatusBar>
        )}
        {status === 'done' && (
          <StatusBar>
            <button type="button" className="btn" onClick={reset}>다른 사진 올리기</button>
          </StatusBar>
        )}

        <div className="results" ref={resultsRef}>
          {status === 'loading' && (
            <section className="section" aria-label="분석 중">
              {[60, 90, 82, 95, 70, 88].map((w, i) => <div key={i} className="skeleton" style={{ width: `${w}%` }} />)}
            </section>
          )}

          {shown && (
            <>
              <PlaceStory place={shown} />
              <NearbyPlaces places={shown.nearby ?? []} area={shown.area} />
              <p className="footnote">
                AI가 사진을 보고 작성한 정보예요. 운영 시간이나 연락처는 방문 전에 공식 페이지에서 확인하세요.
              </p>
            </>
          )}
        </div>
      </main>
    </>
  );
}
