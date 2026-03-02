import { Router } from "express";
import { prisma } from "../lib/prisma";

export const rafflesRoutes = Router();

// listar rifas ativas
rafflesRoutes.get("/", async (_req, res) => {
  const raffles = await prisma.raffle.findMany({
    where: {
      status: {
        in: ["active", "finished"], // ✅ mostra finalizadas também
      },
    },
    select: {
      id: true,
      title: true,
      description: true,
      maxNumber: true,
      pricePerNumber: true,
      status: true,
      createdAt: true,
      imageUrl: true,
      videoUrl: true,
      images: true,
    },
  });

  res.json(raffles);
});
