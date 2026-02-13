import type { Request, Response } from 'express';
import { z } from 'zod';

const RequestSchema = z.object({
  name: z.string().min(1),
  count: z.number().int().positive(),
});

export async function handleRequest(req: Request, res: Response) {
  // GP-003 compliant: Input validated with Zod schema
  const result = RequestSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({ error: 'Invalid input', details: result.error.errors });
    return;
  }

  const { name, count } = result.data;

  res.json({ message: `Hello ${name}`, count });
}
