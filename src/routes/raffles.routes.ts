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

function serializePublicRaffle(
  raffle: {
  winner?: { number: number } | null;
    maxNumber: number;
    [key: string]: unknown;
  },
  soldNumbersCount = 0
) {
  const { winner, ...rest } = raffle;
  const soldPercentage =
    raffle.maxNumber > 0
      ? Math.min(1, Math.max(0, soldNumbersCount / raffle.maxNumber))
      : 0;

  return {
    ...rest,
    hasWinner: Boolean(winner),
    winnerNumber: winner?.number ?? null,
    soldNumbersCount,
    soldPercentage,
  };
}

async function loadSoldCounts(raffleIds: string[]) {
  if (raffleIds.length === 0) {
    return new Map<string, number>();
  }

  const grouped = await prisma.orderNumber.groupBy({
    by: ["raffleId"],
    where: {
      raffleId: { in: raffleIds },
      status: "confirmed",
    },
    _count: {
      _all: true,
    },
  });

  return new Map(grouped.map((entry) => [entry.raffleId, entry._count._all]));
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

  const soldCounts = await loadSoldCounts(raffles.map((raffle) => raffle.id));

  res.json(
    raffles.map((raffle) =>
      serializePublicRaffle(raffle, soldCounts.get(raffle.id) ?? 0)
    )
  );
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

  const soldCount = await prisma.orderNumber.count({
    where: {
      raffleId: raffle.id,
      status: "confirmed",
    },
  });

  return res.json(serializePublicRaffle(raffle, soldCount));
});
