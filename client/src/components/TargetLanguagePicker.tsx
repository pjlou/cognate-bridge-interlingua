import { Check, Loader2, Star } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { useI18n } from '../i18n/I18nContext';
import { errorMessage } from '../lib/errorMessage';
import {
  getMyTargets,
  getTargetLanguages,
  setMyTargets,
  type LanguageFamily,
  type TargetLanguage,
} from '../services/api';
import './TargetLanguagePicker.css';

/**
 * Target-language selection.
 *
 * Choosing none is a real choice: the correspondence panel then stays empty.
 * One Germanic and one Romance selected language may each be marked priority so
 * they sort first in the target list.
 * When `family` is set, only that family's languages are shown (priority first).
 */
export default function TargetLanguagePicker({
  compact = false,
  family,
  embedded = false,
  onTargetsSaved,
}: {
  compact?: boolean;
  family?: LanguageFamily;
  /** Tighter chrome for embedding under a track card. */
  embedded?: boolean;
  /** Fired after a successful save of the selection. */
  onTargetsSaved?: () => void;
}) {
  const { user, setPriorityTargetLanguage } = useAuth();
  const { t } = useI18n();

  const all = useAsync(getTargetLanguages, [], 'Could not load the language list.');
  const mine = useAsync(getMyTargets, [], 'Could not load your current selection.');

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const germanicPriorityId = user?.priority_germanic_target_language_id ?? null;
  const romancePriorityId = user?.priority_romance_target_language_id ?? null;

  const visibleTargets = useMemo(() => all.data ?? [], [all.data]);

  useEffect(() => {
    if (mine.data) {
      setSelected(new Set(mine.data.map((target) => target.id)));
    }
  }, [mine.data]);

  async function persist(next: Set<number>): Promise<void> {
    setSaving(true);
    setSaveError(null);
    try {
      await setMyTargets([...next]);
      if (germanicPriorityId !== null && !next.has(germanicPriorityId)) {
        await setPriorityTargetLanguage('Germanic', null);
      }
      if (romancePriorityId !== null && !next.has(romancePriorityId)) {
        await setPriorityTargetLanguage('Romance', null);
      }
      setSavedAt(Date.now());
      onTargetsSaved?.();
    } catch (error) {
      setSaveError(errorMessage(error, 'Could not save your selection.'));
    } finally {
      setSaving(false);
    }
  }

  function toggle(id: number): void {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    setSavedAt(null);
    void persist(next);
  }

  async function setPriority(
    targetFamily: Extract<LanguageFamily, 'Germanic' | 'Romance'>,
    id: number,
  ): Promise<void> {
    if (!selected.has(id)) return;
    setSaving(true);
    setSaveError(null);
    try {
      const current = targetFamily === 'Germanic' ? germanicPriorityId : romancePriorityId;
      await setPriorityTargetLanguage(targetFamily, current === id ? null : id);
      setSavedAt(Date.now());
    } catch (error) {
      setSaveError(errorMessage(error, 'Could not update priority language.'));
    } finally {
      setSaving(false);
    }
  }

  function priorityIdFor(targetFamily: LanguageFamily): number | null {
    if (targetFamily === 'Germanic') return germanicPriorityId;
    if (targetFamily === 'Romance') return romancePriorityId;
    return null;
  }

  function familyLabel(targetFamily: LanguageFamily): string {
    if (targetFamily === 'Germanic') return t('nav.germanic');
    if (targetFamily === 'Romance') return t('nav.romance');
    return t('nav.uralic');
  }

  function nameFor(id: number | null, list: TargetLanguage[]): string | null {
    if (id === null) return null;
    return list.find((target) => target.id === id)?.name ?? null;
  }

  function sortWithPriorityFirst(
    targets: TargetLanguage[],
    targetFamily: LanguageFamily,
  ): TargetLanguage[] {
    const priorityId = priorityIdFor(targetFamily);
    if (priorityId === null) return targets;
    return [...targets].sort((a, b) => {
      if (a.id === priorityId) return -1;
      if (b.id === priorityId) return 1;
      return 0;
    });
  }

  const isLoading = all.isLoading || mine.isLoading;
  const loadError = all.error ?? mine.error;
  const families = (family ? [family] : (['Germanic', 'Romance', 'Uralic'] as const)).filter(
    (f): f is LanguageFamily => f === 'Germanic' || f === 'Romance' || f === 'Uralic',
  );

  if (isLoading) {
    return (
      <div className="loading-block loading-block--inline">
        <Loader2 className="spinner-icon" size={18} /> {t('targets.loading')}
      </div>
    );
  }

  if (loadError) return <p className="notice notice--error">{loadError}</p>;

  const germanicName = nameFor(germanicPriorityId, visibleTargets);
  const romanceName = nameFor(romancePriorityId, visibleTargets);
  const showStatus = !embedded;

  return (
    <div
      className={`targets ${compact || embedded ? 'targets--compact' : ''} ${
        embedded ? 'targets--embedded' : ''
      }`}
    >
      {families.map((groupFamily) => {
        const targets = sortWithPriorityFirst(
          visibleTargets.filter((target) => target.family === groupFamily),
          groupFamily,
        );
        if (targets.length === 0) return null;
        const canPrioritize = groupFamily === 'Germanic' || groupFamily === 'Romance';

        return (
          <section key={groupFamily} className="targets__group">
            <h2 className="section-heading">
              {embedded || family ? t('targets.title') : familyLabel(groupFamily)}
            </h2>
            <div className="targets__options">
              {targets.map((target) => {
                const isOn = selected.has(target.id);
                const isPriority = priorityIdFor(groupFamily) === target.id;
                const familyName = familyLabel(groupFamily);
                return (
                  <div key={target.id} className="targets__row">
                    <button
                      type="button"
                      className={`targets__option ${isOn ? 'is-selected' : ''}`}
                      aria-pressed={isOn}
                      onClick={() => toggle(target.id)}
                    >
                      <span className="targets__code">{target.code}</span>
                      {target.name}
                      {isOn && <Check size={14} aria-hidden="true" />}
                    </button>
                    {isOn && canPrioritize && (
                      <button
                        type="button"
                        className={`targets__priority ${isPriority ? 'is-priority' : ''}`}
                        aria-pressed={isPriority}
                        aria-label={
                          isPriority
                            ? t('targets.priorityClear', { name: target.name, family: familyName })
                            : t('targets.priorityMark', { name: target.name, family: familyName })
                        }
                        title={
                          isPriority
                            ? t('targets.priorityTitleOn', { family: familyName })
                            : t('targets.priorityTitle', { family: familyName })
                        }
                        disabled={saving || !user}
                        onClick={() =>
                          void setPriority(groupFamily as 'Germanic' | 'Romance', target.id)
                        }
                      >
                        <Star
                          size={14}
                          aria-hidden="true"
                          fill={isPriority ? 'currentColor' : 'none'}
                        />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {saveError && <p className="notice notice--error">{saveError}</p>}

      {showStatus && (
        <p className="targets__status">
          {saving ? (
            <span>
              <Loader2 size={14} className="spinner-icon" /> {t('targets.saving')}
            </span>
          ) : selected.size === 0 ? (
            t('targets.noneSelected')
          ) : (
            <>
              {(germanicName || romanceName) && (
                <span className="targets__priority-hint">
                  {t('targets.prioritySummary')}
                  {germanicName ? `: ${t('targets.germanic')} ${germanicName}` : ''}
                  {germanicName && romanceName ? ' ·' : ''}
                  {romanceName ? ` ${t('targets.romance')} ${romanceName}` : ''}
                </span>
              )}
              {savedAt !== null && <span className="targets__saved">{t('targets.saved')}</span>}
              {!germanicName && !romanceName && savedAt === null && (
                <span>{t('targets.priorityHint')}</span>
              )}
            </>
          )}
        </p>
      )}
    </div>
  );
}
