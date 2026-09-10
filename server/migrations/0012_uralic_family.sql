-- Up Migration

-- Finnish experimental module (and any later Finnic targets) sit outside Germanic/Romance.
ALTER TYPE language_family ADD VALUE IF NOT EXISTS 'Uralic';

-- Down Migration

-- Enum values cannot be removed safely in Postgres; leave 'Uralic' in place.
