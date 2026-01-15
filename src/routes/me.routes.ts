import { Router } from "express";
import { prisma } from "../lib/prisma";
import { auth } from "../middlewares/auth";

export const meRoutes = Router();

meRoutes.get("/", auth, async (req, res) => {
  const userId = (req as any).userId;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      isAdmin: true,
      createdAt: true,
    },
  });

  if (!user) {
    return res.status(404).json({ error: "Usuário não encontrado" });
  }

  res.json(user);
});
