import { useId } from 'react';
import { avatarGeometry } from '../file/images';
import type { Person, PersonPhoto } from '../model/types';
import { useApp } from '../state/store';

// Показ фотографий: байты → адрес для <img>/<image> (blob:-ссылка) и круглый аватар.
// Ссылка создаётся один раз на каждый массив байтов (кэш), так что повторные
// перерисовки ничего не стоят.

const urlCache = new WeakMap<Uint8Array, string>();

export function urlFor(bytes: Uint8Array, mime: string): string {
  let url = urlCache.get(bytes);
  if (!url) {
    url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
    urlCache.set(bytes, url);
  }
  return url;
}

/** Адрес фото или undefined, если байтов нет */
export function usePhotoUrl(photo: PersonPhoto | undefined): string | undefined {
  const bytes = useApp((s) => (photo ? s.session?.media[photo.id] : undefined));
  return bytes && photo ? urlFor(bytes, photo.mime) : undefined;
}

/** Инициалы для аватара без фото */
export function initials(person: Person): string {
  const n = person.names;
  return ((n.given?.[0] ?? '') + (n.surname?.[0] ?? '')).toUpperCase() || '?';
}

/** Круглый аватар для HTML-интерфейса (список людей, карточка) */
export function Avatar({ person, size }: { person: Person; size: number }) {
  const clipId = useId();
  const photo = person.photos?.[0];
  const url = usePhotoUrl(photo);
  const r = size / 2;
  return (
    <svg className={`avatar avatar-${person.sex}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <clipPath id={clipId}>
        <circle cx={r} cy={r} r={r} />
      </clipPath>
      {url && photo ? (
        <image href={url} {...avatarGeometry(photo, size)} clipPath={`url(#${clipId})`} preserveAspectRatio="none" />
      ) : (
        <>
          <circle cx={r} cy={r} r={r} className="avatar-bg" />
          <text x={r} y={r} dy="0.35em" textAnchor="middle" fontSize={size * 0.38} className="avatar-text">
            {initials(person)}
          </text>
        </>
      )}
    </svg>
  );
}
