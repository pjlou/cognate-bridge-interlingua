import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nProvider, useI18n } from './I18nContext';

describe('I18nProvider', () => {
  it('interpolates variables', () => {
    function Vars() {
      const { t } = useI18n();
      return <span>{t('targets.priorityMark', { name: 'German', family: 'Germanic' })}</span>;
    }
    render(
      <I18nProvider locale="en">
        <Vars />
      </I18nProvider>,
    );
    expect(screen.getByText('Mark German as Germanic priority')).toBeInTheDocument();
  });

  it('falls back to the raw key when a message is missing', () => {
    function Missing() {
      const { t } = useI18n();
      // @ts-expect-error deliberately testing an unknown key
      return <span>{t('does.not.exist')}</span>;
    }
    render(
      <I18nProvider locale="en">
        <Missing />
      </I18nProvider>,
    );
    expect(screen.getByText('does.not.exist')).toBeInTheDocument();
  });
});
