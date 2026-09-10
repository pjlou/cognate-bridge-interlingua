-- Up Migration

-- One priority target per family (Germanic + Romance) for matching-game peeks.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS priority_germanic_target_language_id INTEGER
    REFERENCES target_languages (id) ON DELETE SET NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS priority_romance_target_language_id INTEGER
    REFERENCES target_languages (id) ON DELETE SET NULL;

-- Move the previous single priority into the matching family column when possible.
UPDATE users u
   SET priority_germanic_target_language_id = u.priority_target_language_id
  FROM target_languages t
 WHERE u.priority_target_language_id = t.id
   AND t.family = 'Germanic'
   AND u.priority_germanic_target_language_id IS NULL;

UPDATE users u
   SET priority_romance_target_language_id = u.priority_target_language_id
  FROM target_languages t
 WHERE u.priority_target_language_id = t.id
   AND t.family = 'Romance'
   AND u.priority_romance_target_language_id IS NULL;

DROP INDEX IF EXISTS users_priority_target_language_idx;
ALTER TABLE users DROP COLUMN IF EXISTS priority_target_language_id;

CREATE INDEX IF NOT EXISTS users_priority_germanic_target_idx
  ON users (priority_germanic_target_language_id)
  WHERE priority_germanic_target_language_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS users_priority_romance_target_idx
  ON users (priority_romance_target_language_id)
  WHERE priority_romance_target_language_id IS NOT NULL;

-- Down Migration

DROP INDEX IF EXISTS users_priority_germanic_target_idx;
DROP INDEX IF EXISTS users_priority_romance_target_idx;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS priority_target_language_id INTEGER
    REFERENCES target_languages (id) ON DELETE SET NULL;

UPDATE users
   SET priority_target_language_id = COALESCE(
     priority_germanic_target_language_id,
     priority_romance_target_language_id
   );

ALTER TABLE users DROP COLUMN IF EXISTS priority_germanic_target_language_id;
ALTER TABLE users DROP COLUMN IF EXISTS priority_romance_target_language_id;

CREATE INDEX IF NOT EXISTS users_priority_target_language_idx
  ON users (priority_target_language_id)
  WHERE priority_target_language_id IS NOT NULL;
