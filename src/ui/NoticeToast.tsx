import { useTranslation } from 'react-i18next';
import { dismissNotice, useApp } from '../state/store';

// Всплывающее уведомление внизу экрана («Сохранено», ошибки).
export function NoticeToast() {
  const { t } = useTranslation();
  const notice = useApp((s) => s.notice);
  if (!notice) return null;
  return (
    <div
      key={notice.id}
      className={notice.kind === 'error' ? 'toast toast-error' : 'toast'}
      role={notice.kind === 'error' ? 'alert' : 'status'}
    >
      <span>{t(notice.key, notice.params)}</span>
      <button type="button" className="icon-btn icon-btn-small" onClick={dismissNotice} aria-label={t('common.close')}>
        ×
      </button>
    </div>
  );
}
