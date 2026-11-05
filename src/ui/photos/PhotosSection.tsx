import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { compressImage, ImageError } from '../../file/images';
import { updatePerson } from '../../model/ops';
import type { Person, PersonPhoto } from '../../model/types';
import { addMedia, apply, notify } from '../../state/store';
import { DateField } from '../DateField';
import { Modal } from '../Modal';
import { usePhotoUrl } from '../media';
import { CropDialog } from './CropDialog';

// Фотографии человека: галерея, добавление (кнопкой или перетаскиванием), просмотр,
// подпись и дата, «сделать главной», обрезка аватара, удаление (отменяется Ctrl+Z).
export function PhotosSection({ person }: { person: Person }) {
  const { t } = useTranslation();
  const photos = person.photos ?? [];
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = person.id;

  const setPhotos = (fn: (list: PersonPhoto[]) => PersonPhoto[], coalesce?: string) =>
    apply(
      (tr) =>
        updatePerson(tr, id, (p) => {
          const list = fn(p.photos ?? []);
          const next: Person = { ...p, photos: list };
          if (!list.length) delete next.photos;
          return next;
        }),
      coalesce,
    );

  const addFiles = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    const added: PersonPhoto[] = [];
    const media: Record<string, Uint8Array> = {};
    for (const f of files) {
      try {
        const r = await compressImage(f);
        media[r.photo.id] = r.bytes;
        added.push(r.photo);
      } catch (e) {
        notify(`photos.errors.${e instanceof ImageError ? e.code : 'unsupported'}`, { name: f.name }, 'error');
      }
    }
    if (added.length) {
      addMedia(media);
      setPhotos((list) => [...list, ...added]);
      notify('photos.added', { count: added.length });
    }
    setBusy(false);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    void addFiles([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/') || !f.type));
  };

  return (
    <section
      className={dragOver ? 'photos drop-target' : 'photos'}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <h3>{t('photos.title')}</h3>
      <div className="photo-grid">
        {photos.map((ph, i) => (
          <Thumb key={ph.id} photo={ph} main={i === 0} onClick={() => setViewing(i)} />
        ))}
        <button type="button" className="photo-add" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? t('photos.processing') : t('photos.add')}
        </button>
      </div>
      <p className="muted small">
        {t('photos.dropHint')} {t('photos.privacyNote')}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          void addFiles([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />

      {viewing !== null && photos[viewing] && (
        <PhotoViewer
          person={person}
          index={viewing}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
          setPhotos={setPhotos}
        />
      )}
    </section>
  );
}

function Thumb({ photo, main, onClick }: { photo: PersonPhoto; main: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  const url = usePhotoUrl(photo);
  return (
    <button type="button" className="photo-thumb" onClick={onClick} title={photo.caption}>
      {url ? <img src={url} alt={photo.caption ?? ''} /> : <span className="muted">?</span>}
      {main && <span className="photo-badge">{t('photos.main')}</span>}
    </button>
  );
}

function PhotoViewer({
  person,
  index,
  onIndex,
  onClose,
  setPhotos,
}: {
  person: Person;
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  setPhotos: (fn: (list: PersonPhoto[]) => PersonPhoto[], coalesce?: string) => void;
}) {
  const { t } = useTranslation();
  const photos = person.photos ?? [];
  const photo = photos[index]!;
  const url = usePhotoUrl(photo);
  const [cropping, setCropping] = useState(false);

  const patch = (fields: Partial<PersonPhoto>, coalesce?: string) =>
    setPhotos((list) => list.map((p) => (p.id === photo.id ? { ...p, ...fields } : p)), coalesce);

  return (
    <Modal title={`${t('photos.title')} · ${index + 1} / ${photos.length}`} onClose={onClose} wide>
      <div className="photo-view">
        {url && <img src={url} alt={photo.caption ?? ''} />}
        {photos.length > 1 && (
          <>
            <button
              type="button"
              className="icon-btn photo-nav photo-prev"
              onClick={() => onIndex((index - 1 + photos.length) % photos.length)}
              aria-label="←"
            >
              <ChevronLeft size={22} />
            </button>
            <button
              type="button"
              className="icon-btn photo-nav photo-next"
              onClick={() => onIndex((index + 1) % photos.length)}
              aria-label="→"
            >
              <ChevronRight size={22} />
            </button>
          </>
        )}
      </div>
      <div className="form-grid">
        <label className="field">
          <span>{t('photos.caption')}</span>
          <input
            value={photo.caption ?? ''}
            onChange={(e) => patch({ caption: e.target.value || undefined }, `${person.id}.photo.${photo.id}.caption`)}
          />
        </label>
        <DateField
          id={`photo-date-${photo.id}`}
          label={t('photos.date')}
          value={photo.date}
          onCommit={(date) => patch({ date })}
        />
      </div>
      <div className="rel-actions">
        {index > 0 ? (
          <button
            type="button"
            className="btn btn-small"
            onClick={() => {
              setPhotos((list) => [photo, ...list.filter((p) => p.id !== photo.id)]);
              onIndex(0);
            }}
          >
            <Star size={14} /> {t('photos.makeMain')}
          </button>
        ) : (
          <button type="button" className="btn btn-small" onClick={() => setCropping(true)} disabled={!url}>
            {t('photos.crop')}
          </button>
        )}
        <button
          type="button"
          className="btn btn-small btn-danger-ghost"
          onClick={() => {
            setPhotos((list) => list.filter((p) => p.id !== photo.id));
            notify('photos.deleted');
            if (photos.length <= 1) onClose();
            else onIndex(Math.max(0, index - 1));
          }}
        >
          {t('photos.delete')}
        </button>
      </div>
      {cropping && url && (
        <CropDialog
          photo={photo}
          url={url}
          onClose={() => setCropping(false)}
          onSave={(crop) => {
            patch({ crop });
            setCropping(false);
          }}
        />
      )}
    </Modal>
  );
}
