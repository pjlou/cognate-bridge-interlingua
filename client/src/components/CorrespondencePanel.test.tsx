import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LANGUAGES, cognate } from '../test/factories';
import CorrespondencePanel from './CorrespondencePanel';

function renderPanel(cognates: Parameters<typeof CorrespondencePanel>[0]['cognates'], bare?: boolean) {
  return render(
    <MemoryRouter>
      <CorrespondencePanel cognates={cognates} bare={bare} />
    </MemoryRouter>,
  );
}

describe('CorrespondencePanel', () => {
  it('groups several attested forms under one language', () => {
    renderPanel([
      cognate({ target_language: LANGUAGES.en!, target_word: 'abundance' }),
      cognate({ target_language: LANGUAGES.en!, target_word: 'abundancy' }),
    ]);

    // One row, two forms: the learner is asking "what is this in English", not "list
    // every row in the table".
    expect(screen.getAllByText('English')).toHaveLength(1);
    expect(screen.getByText('abundance')).toBeInTheDocument();
    expect(screen.getByText('abundancy')).toBeInTheDocument();
  });

  it('distinguishes an attested form from a confirmed prediction and an unconfirmed one', () => {
    renderPanel([
      cognate({ target_language: LANGUAGES.de!, target_word: 'Apfel' }),
      cognate({
        target_language: LANGUAGES.es!,
        target_word: 'tierra',
        provenance: 'rule_generated',
        confidence: 0.8,
        validated_against: 'apertium-eng-spa',
      }),
      cognate({
        target_language: LANGUAGES.it!,
        target_word: 'cantare',
        provenance: 'rule_generated',
        confidence: 0.35,
        validated_against: null,
      }),
    ]);

    // The distinction is the honesty of the whole feature: a form the dictionary states,
    // a form this project predicted and then found in a lexicon, and a form it predicted
    // and could not find are three different claims.
    expect(screen.getByTitle('Attested in the source dictionary')).toBeInTheDocument();
    expect(
      screen.getByTitle('Predicted by rule, confirmed in apertium-eng-spa'),
    ).toBeInTheDocument();
    expect(
      screen.getByTitle('Predicted by rule, not confirmed against a lexicon'),
    ).toBeInTheDocument();
  });

  it('shows the rule and its citation for a generated form', () => {
    renderPanel([
      cognate({
        target_language: LANGUAGES.it!,
        target_word: 'cantare',
        provenance: 'rule_generated',
        rule: {
          id: 4,
          code: 'ia.inf-ar.ita',
          name: null,
          notation: null,
          description: 'Italian keeps the Latin final -e on infinitives.',
          source_note: 'IED Introduction, Termination of Infinitives',
          example_bridge: 'cantar',
          example_target: 'cantare',
        },
        rules: [
          {
            id: 4,
            code: 'ia.inf-ar.ita',
            name: null,
            notation: null,
            description: 'Italian keeps the Latin final -e on infinitives.',
            source_note: 'IED Introduction, Termination of Infinitives',
            example_bridge: 'cantar',
            example_target: 'cantare',
          },
        ],
      }),
    ]);

    expect(
      screen.getByText('Italian keeps the Latin final -e on infinitives.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('IED Introduction, Termination of Infinitives'),
    ).toBeInTheDocument();
  });

  it('shows a named sound law with its notation', () => {
    renderPanel([
      cognate({
        target_language: LANGUAGES.es!,
        target_word: 'agua',
        rule: {
          id: 8,
          code: 'ia.lenition.qu-gu',
          name: 'Spanish intervocalic lenition',
          notation: 'qu → gu',
          description: 'Spanish voices an intervocalic Latin qu to gu.',
          source_note: 'Standard Romance correspondence',
          example_bridge: 'aqua',
          example_target: 'agua',
        },
        rules: [
          {
            id: 8,
            code: 'ia.lenition.qu-gu',
            name: 'Spanish intervocalic lenition',
            notation: 'qu → gu',
            description: 'Spanish voices an intervocalic Latin qu to gu.',
            source_note: 'Standard Romance correspondence',
            example_bridge: 'aqua',
            example_target: 'agua',
          },
        ],
      }),
    ]);

    expect(screen.getByText('Spanish intervocalic lenition')).toBeInTheDocument();
    expect(screen.getByText('qu → gu')).toBeInTheDocument();
  });

  it('says so plainly when a word has no recorded cognate', () => {
    renderPanel([]);
    expect(screen.getByText(/No cognate is recorded/)).toBeInTheDocument();
  });

  it('stays out of the way when the panel is empty and bare', () => {
    const { container } = renderPanel([], true);
    expect(container).toBeEmptyDOMElement();
  });
});
