import { OctagonExclamationPoint, TriangleExclamationPoint } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { computeIssues, issuesOf, type Issue } from '../model/checks';
import { updatePerson } from '../model/ops';
import type { TreeData } from '../model/types';
import { apply, select, setFocus, useApp } from '../state/store';
import { useNameOf } from './format';
import { Modal } from './Modal';

// Замечания проверки данных: блок в карточке человека и общий список по древу.

function useIssueText() {
  const { t } = useTranslation();
  const nameOf = useNameOf();
  return (tree: TreeData, issue: Issue) =>
    t(`checks.${issue.code}`, {
      a: nameOf(tree.people[issue.personIds[0]!]),
      b: nameOf(tree.people[issue.personIds[1] ?? '']),
      ...issue.params,
    });
}

/** «Это не ошибка»: отметка у первого участника замечания (можно отменить Ctrl+Z) */
function ignore(issue: Issue): void {
  apply((tr) =>
    updatePerson(tr, issue.personIds[0]!, (p) => ({ ...p, ignoredChecks: [...(p.ignoredChecks ?? []), issue.key] })),
  );
}

/** Замечания по одному человеку — показываются вверху его карточки */
export function PersonIssues({ personId }: { personId: string }) {
  const { t } = useTranslation();
  const tree = useApp((s) => s.session!.history.present);
  const text = useIssueText();
  const issues = issuesOf(tree, personId);
  if (!issues.length) return null;
  return (
    <div className="issues-box" role="note">
      <ul>
        {issues.map((iss) => (
          <li key={iss.key} className={`issue issue-${iss.severity}`}>
            <span className="issue-text">{iss.severity === 'error' ? <OctagonExclamationPoint size={15} /> : <TriangleExclamationPoint size={15} />} {text(tree, iss)}</span>
            <button type="button" className="link-btn small" onClick={() => ignore(iss)}>
              {t('checks.ignore')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Кнопка с количеством замечаний (в панели вида) */
export function IssuesButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  const tree = useApp((s) => s.session!.history.present);
  const issues = computeIssues(tree);
  if (!issues.length) return null;
  const hasErrors = issues.some((i) => i.severity === 'error');
  return (
    <button type="button" className={hasErrors ? 'btn btn-small issues-btn has-errors' : 'btn btn-small issues-btn'} onClick={onClick}>
      <TriangleExclamationPoint size={15} strokeWidth={1.75} /> <span className="seg-label">{t('checks.count', { count: issues.length })}</span><span className="count-badge">{issues.length}</span>
    </button>
  );
}

export function IssuesDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const tree = useApp((s) => s.session!.history.present);
  const text = useIssueText();
  const issues = computeIssues(tree);
  const groups = [
    { title: t('checks.errors'), items: issues.filter((i) => i.severity === 'error') },
    { title: t('checks.warnings'), items: issues.filter((i) => i.severity === 'warning') },
  ].filter((g) => g.items.length);

  return (
    <Modal title={t('checks.title')} onClose={onClose} wide>
      <p className="muted small">{t('checks.hint')}</p>
      {!issues.length && <p>{t('checks.none')}</p>}
      {groups.map((g) => (
        <section key={g.title}>
          <h3 className="form-subtitle">{g.title}</h3>
          <ul className="issues-list">
            {g.items.map((iss) => (
              <li key={iss.key} className={`issue issue-${iss.severity}`}>
                <button
                  type="button"
                  className="link-btn grow"
                  onClick={() => {
                    setFocus(iss.personIds[0]!);
                    select(iss.personIds[0]!);
                    onClose();
                  }}
                >
                  {text(tree, iss)}
                </button>
                <button type="button" className="btn btn-small btn-ghost" onClick={() => ignore(iss)}>
                  {t('checks.ignore')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Modal>
  );
}
