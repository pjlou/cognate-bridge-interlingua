-- Up Migration

CREATE TYPE grammar_drill_kind AS ENUM ('multiple_choice', 'word_order');

ALTER TABLE grammar_patterns
  ADD COLUMN drill_kind grammar_drill_kind NOT NULL DEFAULT 'multiple_choice';

-- Down Migration

ALTER TABLE grammar_patterns DROP COLUMN drill_kind;
DROP TYPE grammar_drill_kind;
