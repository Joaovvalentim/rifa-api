import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { auth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/requireAdmin";

export const adminDrawRoutes = Router();

/**
 * POST /admin/raffles/:id/draw
 * Requer: JWT + admin
 *
 * Regras:
 * - Só sorteia se ainda não existir Winner para a rifa
 * - Sorteia apenas entre números CONFIRMED
 * - Gera uma seed e escolhe vencedor de forma auditável:
 *   idx = sha256(seed) % totalCandidatos
 * - Salva em Winner
 * - AO SORTEAR: altera automaticamente status da rifa para FINISHED
 */
adminDrawRoutes.post(
  "/raffles/:id/draw",
  auth,
  requireAdmin,
  async (req, res) => {
    const raffleId = req.params.id;

    try {
      const result = await prisma.$transaction(async (tx) => {
        // 1) rifa existe?
        const raffle = await tx.raffle.findUnique({
          where: { id: raffleId },
          select: { id: true, title: true, status: true },
        });
        if (!raffle) throw new Error("Rifa não encontrada");

        // bloquear sorteio em draft
        if (raffle.status === "draft") {
          throw new Error("Rifa em rascunho não pode ser sorteada");
        }

        // 2) já tem vencedor?
        const existing = await tx.winner.findUnique({ where: { raffleId } });
        if (existing) throw new Error("Esta rifa já possui vencedor");

        // 3) candidatos: numeros confirmados em ordem deterministica.
        // A verificacao publica usa exatamente a mesma ordenacao.
        const candidates = await tx.orderNumber.findMany({
          where: { raffleId, status: "confirmed" },
          select: { orderId: true, number: true },
          orderBy: [{ number: "asc" }, { orderId: "asc" }],
        });

        if (candidates.length === 0) {
          throw new Error("Não há números confirmados para sortear");
        }

        // 4) seed auditável
        const seed = `${raffleId}:${new Date().toISOString()}:${crypto
          .randomBytes(16)
          .toString("hex")}`;

        // 5) idx determinístico = sha256(seed) % N
        const hash = crypto.createHash("sha256").update(seed).digest();

        // converte 8 bytes em BigInt (0..2^64-1)
        const big =
          (BigInt(hash[0]) << 56n) |
          (BigInt(hash[1]) << 48n) |
          (BigInt(hash[2]) << 40n) |
          (BigInt(hash[3]) << 32n) |
          (BigInt(hash[4]) << 24n) |
          (BigInt(hash[5]) << 16n) |
          (BigInt(hash[6]) << 8n) |
          BigInt(hash[7]);

        const idx = Number(big % BigInt(candidates.length));
        const pick = candidates[idx];

        // 6) salvar Winner
        const winner = await tx.winner.create({
          data: {
            raffleId,
            orderId: pick.orderId,
            number: pick.number,
            seed,
          },
          select: {
            id: true,
            raffleId: true,
            orderId: true,
            number: true,
            seed: true,
            createdAt: true,
          },
        });

        // 7) AO SORTEAR: finalizar automaticamente a rifa
        const updatedRaffle = await tx.raffle.update({
          where: { id: raffleId },
          data: { status: "finished" },
          select: { id: true, title: true, status: true },
        });

        return {
          raffle: updatedRaffle,
          totalCandidates: candidates.length,
          algorithm: "idx = (sha256(seed) como uint64) % totalCandidates",
          winner,
        };
      });

      return res.json(result);
    } catch (err: any) {
      console.error("DRAW ERROR:", err);
      return res.status(400).json({ error: err?.message ?? "Erro ao sortear" });
    }
  }
);
