import { Router } from "express";
import { prisma } from "../lib/prisma";

export const rafflesRoutes = Router();

const publicRaffleSelect = {
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
  winner: {
    select: {
      number: true,
    },
  },
} as const;

function serializePublicRaffle(raffle: {
  winner?: { number: number } | null;
  [key: string]: unknown;
}) {
  const { winner, ...rest } = raffle;

  return {
    ...rest,
    hasWinner: Boolean(winner),
    winnerNumber: winner?.number ?? null,
  };
}

rafflesRoutes.get("/", async (_req, res) => {
  const raffles = await prisma.raffle.findMany({
    where: {
      status: {
        in: ["active", "finished"],
      },
    },
    select: publicRaffleSelect,
    orderBy: { createdAt: "desc" },
  });

  res.json(raffles.map(serializePublicRaffle));
});

rafflesRoutes.get("/:id", async (req, res) => {
  const raffle = await prisma.raffle.findFirst({
    where: {
      id: req.params.id,
      status: {
        in: ["active", "finished"],
      },
    },
    select: publicRaffleSelect,
  });

  if (!raffle) {
    return res.status(404).json({ error: "Rifa nao encontrada" });
  }

  return res.json(serializePublicRaffle(raffle));
});
