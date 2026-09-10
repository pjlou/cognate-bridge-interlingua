-- Up Migration

-- Provenance of the IPA string on a vocabulary row. Dictionary transcriptions
-- (Parke's X-SAMPA, converted to Unicode IPA) are `direct_phonology`. The rest
-- are derived from the Pronunciation Guide, or flagged when a letter could not
-- be resolved from etymology.
ALTER TABLE bridge_vocabulary
  ADD COLUMN ipa_source TEXT
    CHECK (ipa_source IS NULL OR ipa_source IN (
      'direct_phonology',
      'derived_phonology',
      'uncertain_phonology'
    ));

-- Down Migration

ALTER TABLE bridge_vocabulary
  DROP COLUMN ipa_source;
