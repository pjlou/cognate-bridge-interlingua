import 'dotenv/config';

// Integration tests point the whole app at a throwaway database. Doing this in a setup
// file means `src/db.ts` reads the test connection string the first time it is imported,
// so no test has to remember to swap it.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'cognate-bridge-test-secret';
