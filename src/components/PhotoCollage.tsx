'use client';

import { useRef, useState } from 'react';
import { ImagePlusIcon } from '@/components/Icons';
import { ACCEPTED_TYPES } from '@/lib/image';

const TILES = [
  { cls: 'garden', src: '/images/garden.jpg' },
  { cls: 'fuji', src: '/images/fuji.jpg' },
  { cls: 'torii', src: '/images/torii.jpg' },
  { cls: 'street', src: '/images/street.jpg' },
];

interface Props {
  photoUrl: string | null;
  scanning: boolean;
  onFile: (file: File) => void;
}

/**
 * 시안 1·2의 사진 콜라주.
 * - photoUrl 없음: 가운데에 업로드 카드
 * - photoUrl 있음: 가운데에 올린 사진(핑크 글로우), 주변 사진은 어둡게
 */
export default function PhotoCollage({ photoUrl, scanning, onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const hasPhoto = Boolean(photoUrl);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onFile(file);
  };

  return (
    <div
      className={`collage${hasPhoto ? ' collage--photo' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!hasPhoto) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (!hasPhoto) handleFiles(e.dataTransfer.files);
      }}
    >
      {TILES.map((t) => (
        <figure key={t.cls} className={`collage__tile collage__tile--${t.cls}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={t.src} alt="" />
        </figure>
      ))}

      {hasPhoto ? (
        <figure className="collage__center collage__shot">
          {/* 사용자가 올린 로컬 사진(blob URL)이라 next/image 대신 img 사용 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl!} alt="올린 사진" />
          {scanning && <div className="collage__scan" aria-hidden="true" />}
        </figure>
      ) : (
        <button
          type="button"
          className={`collage__center collage__upload${dragOver ? ' is-over' : ''}`}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlusIcon className="collage__icon" />
          <span className="collage__cta">
            여기를 클릭하여 <b>사진을 추가</b>해보세요
          </span>
        </button>
      )}

      <input
        ref={inputRef}
        id="photo-input"
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        className="visually-hidden"
        tabIndex={-1}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
