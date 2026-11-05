import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { download, fileNameFor } from '../file/io';
import { exportGedcom, type GedcomVersion } from '../gedcom/export';
import { isLiving } from '../model/queries';
import { getState, notify, showImportReport, useApp } from '../state/store';
import { Modal } from './Modal';

// Окна GEDCOM: отчёт после импорта и настройки экспорта.

export function ImportReportDialog() {
  const { t } = useTranslation();
  const report = useApp((s) => s.importReport);
  if (!report) return null;
  const close = () => showImportReport(null);
  const preserved = Object.entries(report.preserved).sort((a, b) => b[1] - a[1]);

  return (
    <Modal
      title={t('gedcom.reportTitle')}
      onClose={close}
      footer={
        <button type="button" className="btn btn-primary" onClick={close} data-autofocus>
          {t('common.ok')}
        </button>
      }
    >
      <ul className="report-list">
        <li>{t('gedcom.reportPeople', { count: report.people })}</li>
        <li>{t('gedcom.reportFamilies', { count: report.families })}</li>
        {report.photos > 0 && <li>{t('gedcom.reportPhotos', { count: report.photos })}</li>}
        <li className="muted small">
          {t('gedcom.reportFormat', { version: report.version, encoding: report.encoding.toUpperCase() })}
          {report.source && ` · ${report.source}`}
        </li>
      </ul>
      {(report.photosMissing > 0 || report.photosFailed > 0 || report.datesAsText > 0 || report.badLines > 0) && (
        <div className="issues-box">
          <ul>
            {report.photosMissing > 0 && <li>{t('gedcom.reportPhotosMissing', { count: report.photosMissing })}</li>}
            {report.photosFailed > 0 && <li>{t('gedcom.reportPhotosFailed', { count: report.photosFailed })}</li>}
            {report.datesAsText > 0 && <li>{t('gedcom.reportDatesText', { count: report.datesAsText })}</li>}
            {report.badLines > 0 && <li>{t('gedcom.reportBadLines', { count: report.badLines })}</li>}
          </ul>
        </div>
      )}
      {preserved.length > 0 && (
        <details>
          <summary className="small">{t('gedcom.reportPreserved', { count: preserved.length })}</summary>
          <p className="muted small">{t('gedcom.reportPreservedHint')}</p>
          <p className="small mono">{preserved.map(([tag, n]) => `${tag} (${n})`).join(', ')}</p>
        </details>
      )}
      <p className="muted small">{t('gedcom.reportSaveHint')}</p>
    </Modal>
  );
}

export function ExportGedcomDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const tree = useApp((s) => s.session!.history.present);
  const [version, setVersion] = useState<GedcomVersion>('5.5.1');
  const [hideLiving, setHideLiving] = useState(true);
  const [includePhotos, setIncludePhotos] = useState(false);
  const living = useMemo(() => Object.values(tree.people).filter((p) => isLiving(p)).length, [tree]);
  const photos = useMemo(() => Object.values(tree.people).reduce((n, p) => n + (p.photos?.length ?? 0), 0), [tree]);

  const run = () => {
    const s = getState().session;
    if (!s) return;
    const out = exportGedcom(s.history.present, s.media, {
      version,
      hideLiving,
      includePhotos: includePhotos && photos > 0,
      appVersion: __APP_VERSION__,
    });
    const name = fileNameFor(s.history.present.name).replace(/\.kinmap$/, `.${out.extension}`);
    download(out.bytes, name);
    notify('gedcom.exported', { name });
    onClose();
  };

  return (
    <Modal
      title={t('gedcom.exportTitle')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={run} data-autofocus>
            {t('gedcom.download')}
          </button>
        </>
      }
    >
      <p className="muted small">{t('gedcom.exportHint')}</p>
      <fieldset className="radio-group">
        <legend>{t('gedcom.version')}</legend>
        <label className="checkbox">
          <input type="radio" name="gedver" checked={version === '5.5.1'} onChange={() => setVersion('5.5.1')} />
          <span>
            <strong>GEDCOM 5.5.1</strong> — {t('gedcom.v551')}
          </span>
        </label>
        <label className="checkbox">
          <input type="radio" name="gedver" checked={version === '7.0'} onChange={() => setVersion('7.0')} />
          <span>
            <strong>GEDCOM 7.0</strong> — {t('gedcom.v70')}
          </span>
        </label>
      </fieldset>
      <label className="checkbox">
        <input type="checkbox" checked={hideLiving} onChange={(e) => setHideLiving(e.target.checked)} />
        <span>
          {t('gedcom.hideLiving', { count: living })}
          <br />
          <span className="muted small">{t('gedcom.hideLivingHint')}</span>
        </span>
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={includePhotos && photos > 0}
          disabled={photos === 0}
          onChange={(e) => setIncludePhotos(e.target.checked)}
        />
        <span>
          {t('gedcom.includePhotos', { count: photos })}
          <br />
          <span className="muted small">{version === '7.0' ? t('gedcom.photosGdz') : t('gedcom.photosZip')}</span>
        </span>
      </label>
    </Modal>
  );
}
