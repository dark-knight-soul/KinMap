import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { progenitorOf } from '../../model/reports';
import type { PersonId } from '../../model/types';
import { useApp } from '../../state/store';
import { PersonSelect } from '../KinshipDialog';
import { Modal } from '../Modal';
import { PrintRoot } from '../print/PrintDialog';
import { FamilyBook, type BookOptions } from './FamilyBook';

// Окно «Книга семьи»: что включить в книгу; затем — окно печати браузера
// (там можно выбрать «Сохранить как PDF»).

const GENS = Array.from({ length: 12 }, (_, i) => i + 1);

export function BookDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const tree = useApp((s) => s.session!.history.present);
  const media = useApp((s) => s.session!.media);
  const focusId = useApp((s) => s.session!.focusId);
  const start = (focusId && tree.people[focusId] ? focusId : tree.rootPersonId) ?? Object.keys(tree.people)[0]!;
  const [mainId, setMainId] = useState<PersonId>(start);
  const [progenitorId, setProgenitorId] = useState<PersonId>(() => progenitorOf(tree, start));
  const [descendants, setDescendants] = useState(true);
  const [ancestors, setAncestors] = useState(true);
  const [biographies, setBiographies] = useState(true);
  const [index, setIndex] = useState(true);
  const [descGen, setDescGen] = useState(12);
  const [ancGen, setAncGen] = useState(6);
  const [hideLiving, setHideLiving] = useState(false);
  const [photos, setPhotos] = useState(true);
  const [printing, setPrinting] = useState(false);

  const opts = useMemo<BookOptions>(
    () => ({ mainId, progenitorId, descendants, ancestors, biographies, index, descGen, ancGen, hideLiving, photos }),
    [mainId, progenitorId, descendants, ancestors, biographies, index, descGen, ancGen, hideLiving, photos],
  );
  const nothing = !descendants && !ancestors && !biographies && !index;

  const check = (label: string, value: boolean, set: (v: boolean) => void, extra?: React.ReactNode) => (
    <label className="checkbox">
      <input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)} />
      <span>
        {label}
        {extra}
      </span>
    </label>
  );
  const gens = (value: number, set: (v: number) => void, label: string) => (
    <select className="inline-select" value={value} aria-label={label} onChange={(e) => set(Number(e.target.value))}>
      {GENS.map((g) => (
        <option key={g} value={g}>
          {g}
        </option>
      ))}
    </select>
  );

  return (
    <Modal
      title={t('book.title')}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setPrinting(true)} disabled={nothing || printing} data-autofocus>
            {t('book.print')}
          </button>
        </>
      }
    >
      <p className="muted small">{t('book.hint')}</p>
      <div className="kin-pickers book-pickers">
        <PersonSelect
          tree={tree}
          label={t('book.main')}
          value={mainId}
          onChange={(id) => {
            setMainId(id);
            setProgenitorId(progenitorOf(tree, id));
          }}
        />
        <span />
        <PersonSelect tree={tree} label={t('book.progenitor')} value={progenitorId} onChange={setProgenitorId} />
      </div>

      <fieldset className="radio-group">
        <legend>{t('book.sections')}</legend>
        {check(t('book.descSection'), descendants, setDescendants, <> · {t('book.gens')} {gens(descGen, setDescGen, t('book.gens'))}</>)}
        {check(t('book.ancSection'), ancestors, setAncestors, <> · {t('book.gens')} {gens(ancGen, setAncGen, t('book.gens'))}</>)}
        {check(t('book.bioSection'), biographies, setBiographies)}
        {check(t('book.indexSection'), index, setIndex)}
      </fieldset>
      <fieldset className="radio-group">
        <legend>{t('book.options')}</legend>
        {check(t('book.photos'), photos, setPhotos)}
        {check(t('book.hideLiving'), hideLiving, setHideLiving, <span className="muted small"> — {t('book.hideLivingHint')}</span>)}
      </fieldset>
      <p className="muted small">{t('book.pdfHint')}</p>

      {printing && (
        <PrintRoot pageW={210} pageH={297} margin={16} pageCss={`@page { @bottom-center { content: counter(page); font: 9pt Georgia, serif; color: #777; } }`} onDone={() => setPrinting(false)}>
          <FamilyBook tree={tree} media={media} opts={opts} />
        </PrintRoot>
      )}
    </Modal>
  );
}
