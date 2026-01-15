import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma";

export const raffleWinnerRoutes = Router();

/**
 * GET /raffles/:id/winner (público)
 * Retorna:
 * - raffle
 * - hasWinner
 * - winner (com seed, createdAt, user...)
 * - totalCandidates
 * - computedIndex
 * - verified (se bate com o candidato do índice)
 */
raffleWinnerRoutes.get("/raffles/:id/winner", async (req, res) => {
  const raffleId = req.params.id;

  const raffle = await prisma.raffle.findUnique({
    where: { id: raffleId },
    select: { id: true, title: true, status: true },
  });

  if (!raffle) return res.status(404).json({ error: "Rifa não encontrada" });

  const winner = await prisma.winner.findUnique({
    where: { raffleId },
    select: {
      number: true,
      seed: true,
      createdAt: true,
      orderId: true,
      order: {
        select: {
          user: { select: { name: true, email: true } },
        },
      },
    },
  });

  if (!winner) {
    return res.json({
      raffle,
      hasWinner: false,
      winner: null,
    });
  }

  // candidatos determinísticos: confirmed ordenados
  const candidates = await prisma.orderNumber.findMany({
    where: { raffleId, status: "confirmed" },
    select: { orderId: true, number: true },
    orderBy: [{ number: "asc" }, { orderId: "asc" }],
  });

  const totalCandidates = candidates.length;

  // se por algum motivo não há candidatos, não quebra
  if (totalCandidates === 0) {
    return res.json({
      raffle,
      hasWinner: true,
      winner: {
        number: winner.number,
        seed: winner.seed,
        createdAt: winner.createdAt,
        orderId: winner.orderId,
        user: winner.order?.user,
        algorithm: "idx = (sha256(seed) como uint64) % totalCandidates",
      },
      totalCandidates: 0,
      computedIndex: null,
      verified: false,
    });
  }

  // recomputa idx a partir da seed do winner
  const hash = crypto.createHash("sha256").update(winner.seed).digest();

  const big =
    (BigInt(hash[0]) << 56n) |
    (BigInt(hash[1]) << 48n) |
    (BigInt(hash[2]) << 40n) |
    (BigInt(hash[3]) << 32n) |
    (BigInt(hash[4]) << 24n) |
    (BigInt(hash[5]) << 16n) |
    (BigInt(hash[6]) << 8n) |
    BigInt(hash[7]);

  const computedIndex = Number(big % BigInt(totalCandidates));
  const computedPick = candidates[computedIndex];

  const verified = computedPick?.number === winner.number;

  return res.json({
    raffle,
    hasWinner: true,
    winner: {
      number: winner.number,
      seed: winner.seed,
      createdAt: winner.createdAt,
      orderId: winner.orderId,
      user: winner.order?.user,
      algorithm: "idx = (sha256(seed) como uint64) % totalCandidates",
    },
    totalCandidates,
    computedIndex,
    verified,
  });
});
