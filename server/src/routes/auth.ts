import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken, generateToken, requireUser } from '../middleware/auth.js';
import {
  createUser,
  findByEmail,
  findById,
  isUniqueViolation,
  resetUserData,
  updatePriorityGermanicTargetLanguage,
  updatePriorityRomanceTargetLanguage,
  verifyPassword,
  type PublicUser,
} from '../models/user.model.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { listTargetLanguages } from '../models/content.model.js';

const credentials = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const loginCredentials = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const mePatch = z
  .object({
    priority_germanic_target_language_id: z.number().int().positive().nullable().optional(),
    priority_romance_target_language_id: z.number().int().positive().nullable().optional(),
  })
  .refine(
    (body) =>
      body.priority_germanic_target_language_id !== undefined ||
      body.priority_romance_target_language_id !== undefined,
    { message: 'No supported fields to update' },
  );

function publicUserPayload(user: PublicUser) {
  return {
    id: user.id,
    email: user.email,
    priority_germanic_target_language_id: user.priority_germanic_target_language_id,
    priority_romance_target_language_id: user.priority_romance_target_language_id,
  };
}

export const authRouter = Router();

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
      return;
    }

    const { email, password } = parsed.data;

    try {
      const user = await createUser(email, password);
      res.status(201).json({
        message: 'Account created',
        token: generateToken(user.id, user.email),
        user: publicUserPayload(user),
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        res.status(409).json({ error: 'An account with that email already exists' });
        return;
      }
      throw error;
    }
  }),
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const parsed = loginCredentials.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const { email, password } = parsed.data;
    const user = await findByEmail(email);

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    res.json({
      message: 'Signed in',
      token: generateToken(user.id, user.email),
      user: publicUserPayload(user),
    });
  }),
);

authRouter.get(
  '/me',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const user = await findById(requireUser(req).id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(user);
  }),
);

authRouter.patch(
  '/me',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const parsed = mePatch.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error:
          parsed.error.issues[0]?.message ??
          'Provide a supported preference field to update',
      });
      return;
    }

    const userId = requireUser(req).id;
    let user = await findById(userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const all =
      parsed.data.priority_germanic_target_language_id !== undefined ||
      parsed.data.priority_romance_target_language_id !== undefined
        ? await listTargetLanguages()
        : [];

    if (parsed.data.priority_germanic_target_language_id !== undefined) {
      const priorityId = parsed.data.priority_germanic_target_language_id;
      if (priorityId !== null) {
        const target = all.find((row) => row.id === priorityId);
        if (!target || target.family !== 'Germanic') {
          res.status(400).json({ error: 'priority_germanic_target_language_id must be Germanic' });
          return;
        }
      }
      user = await updatePriorityGermanicTargetLanguage(userId, priorityId);
    }
    if (parsed.data.priority_romance_target_language_id !== undefined) {
      const priorityId = parsed.data.priority_romance_target_language_id;
      if (priorityId !== null) {
        const target = all.find((row) => row.id === priorityId);
        if (!target || target.family !== 'Romance') {
          res.status(400).json({ error: 'priority_romance_target_language_id must be Romance' });
          return;
        }
      }
      user = await updatePriorityRomanceTargetLanguage(userId, priorityId);
    }
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(user);
  }),
);

authRouter.delete(
  '/me/data',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const user = await resetUserData(requireUser(req).id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({
      message: 'All learning data reset',
      user: publicUserPayload(user),
    });
  }),
);
