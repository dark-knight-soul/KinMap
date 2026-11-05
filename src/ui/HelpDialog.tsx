import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';

// Справка: клавиши и жесты.
const KEYS: [string, string][] = [
  ['Ctrl + S', 'save'],
  ['Ctrl + Shift + S', 'saveAs'],
  ['Ctrl + Z', 'undo'],
  ['Ctrl + Y', 'redo'],
  ['Ctrl + P', 'print'],
  ['?', 'help'],
];

const CHART: [string, string][] = [
  ['click', 'select'],
  ['dblclick', 'center'],
  ['rightclick', 'menu'],
  ['drag', 'pan'],
  ['wheel', 'zoom'],
  ['keys', 'keys'],
];

export function HelpDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const key = (k: string) => (isMac ? k.replace('Ctrl', '⌘') : k);
  return (
    <Modal title={t('help.title')} onClose={onClose}>
      <h3 className="form-subtitle">{t('help.keyboard')}</h3>
      <table className="help-table">
        <tbody>
          {KEYS.map(([k, what]) => (
            <tr key={k}>
              <td>
                {key(k)
                  .split(' + ')
                  .map((part, i) => (
                    <span key={part}>
                      {i > 0 && ' + '}
                      <kbd>{part}</kbd>
                    </span>
                  ))}
              </td>
              <td>{t(`help.keys.${what}`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 className="form-subtitle">{t('help.chart')}</h3>
      <table className="help-table">
        <tbody>
          {CHART.map(([gesture, what]) => (
            <tr key={gesture}>
              <td className="muted">{t(`help.gestures.${gesture}`)}</td>
              <td>{t(`help.actions.${what}`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
