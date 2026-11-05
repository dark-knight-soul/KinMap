import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

// Модальное окно на встроенном элементе <dialog>: браузер сам держит фокус внутри
// и закрывает по Esc (мы перехватываем Esc, чтобы закрытие шло через onClose).

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export function Modal({ title, onClose, children, footer, wide }: Props) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
      // Браузер ставит фокус на первую кнопку (крестик) — переносим на нужный элемент
      // или в первое поле ввода, чтобы можно было сразу печатать
      dialog.querySelector<HTMLElement>('[data-autofocus], input:not([type=checkbox]), select, textarea')?.focus();
    }
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className={wide ? 'modal modal-wide' : 'modal'}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-header">
        <h2>{title}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t('common.close')}>
          ×
        </button>
      </div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-footer">{footer}</div>}
    </dialog>
  );
}

interface ConfirmProps {
  title: string;
  text: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  extra?: ReactNode;
}

export function ConfirmDialog({ title, text, confirmLabel, danger, onConfirm, onClose, extra }: ConfirmProps) {
  const { t } = useTranslation();
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          {extra}
          <button type="button" className={danger ? 'btn btn-danger' : 'btn btn-primary'} onClick={onConfirm} data-autofocus>
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="confirm-text">{text}</div>
    </Modal>
  );
}
