import type { Request, Response } from 'express';

export async function handleRequest(req: Request, res: Response) {
  // GP-003 violation: No input validation for external API boundary
  const { name, count } = req.body;

  // Directly using untrusted input
  res.json({ message: `Hello ${name}`, count });
}
