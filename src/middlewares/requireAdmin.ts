import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const userId = (req as any).userId as string;

  if (!userId) {
    return res.status(401).json({ error: "Não autenticado" });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });

  if (!user?.isAdmin) {
    return res.status(403).json({ error: "Acesso negado (admin)" });
  }

  next();
}
