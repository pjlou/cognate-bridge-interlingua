import bcrypt from 'bcrypt';
import { query, queryOne } from '../db.js';

const BCRYPT_ROUNDS = 10;

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  created_at: Date;
  priority_germanic_target_language_id: number | null;
  priority_romance_target_language_id: number | null;
}

export type PublicUser = Pick<
  UserRow,
  | 'id'
  | 'email'
  | 'created_at'
  | 'priority_germanic_target_language_id'
  | 'priority_romance_target_language_id'
>;

const PUBLIC_USER_COLS =
  'id, email, created_at, priority_germanic_target_language_id, priority_romance_target_language_id';

export async function createUser(email: string, password: string): Promise<PublicUser> {
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const rows = await query<PublicUser>(
    `INSERT INTO users (email, password_hash)
     VALUES ($1, $2)
     RETURNING ${PUBLIC_USER_COLS}`,
    [email, passwordHash],
  );
  return rows[0]!;
}

export async function findByEmail(email: string): Promise<UserRow | null> {
  return queryOne<UserRow>('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
}

export async function findById(id: number): Promise<PublicUser | null> {
  return queryOne<PublicUser>(`SELECT ${PUBLIC_USER_COLS} FROM users WHERE id = $1`, [id]);
}

export async function updatePriorityGermanicTargetLanguage(
  id: number,
  targetLanguageId: number | null,
): Promise<PublicUser | null> {
  return queryOne<PublicUser>(
    `UPDATE users
        SET priority_germanic_target_language_id = $2
      WHERE id = $1
      RETURNING ${PUBLIC_USER_COLS}`,
    [id, targetLanguageId],
  );
}

export async function updatePriorityRomanceTargetLanguage(
  id: number,
  targetLanguageId: number | null,
): Promise<PublicUser | null> {
  return queryOne<PublicUser>(
    `UPDATE users
        SET priority_romance_target_language_id = $2
      WHERE id = $1
      RETURNING ${PUBLIC_USER_COLS}`,
    [id, targetLanguageId],
  );
}

/**
 * Wipe learning progress and preference fields for one account (keeps the login).
 * Clears vocabulary / grammar / rule-card progress, target-language picks, and
 * resets the priority targets.
 */
export async function resetUserData(id: number): Promise<PublicUser | null> {
  await query(`DELETE FROM vocabulary_progress WHERE user_id = $1`, [id]);
  await query(`DELETE FROM grammar_progress WHERE user_id = $1`, [id]);
  await query(`DELETE FROM rule_card_progress WHERE user_id = $1`, [id]);
  await query(`DELETE FROM user_target_languages WHERE user_id = $1`, [id]);
  return queryOne<PublicUser>(
    `UPDATE users
        SET priority_germanic_target_language_id = NULL,
            priority_romance_target_language_id = NULL
      WHERE id = $1
      RETURNING ${PUBLIC_USER_COLS}`,
    [id],
  );
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}
