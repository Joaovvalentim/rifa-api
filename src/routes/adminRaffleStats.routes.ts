import { Router } from "express";
import { prisma } from "../lib/prisma";
import { auth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/requireAdmin";

export const adminRaffleStatsRoutes = Router();

/**
 * GET /admin/raffles/:id/stats
 * Requer: JWT + admin
 *
 * Retorna:
 * - raffle: { id, status, hasWinner }
 * - participants: usuários únicos com pedidos paid
 * - confirmedNumbers: total de números confirmed
 * - paidOrders: total de pedidos paid
 * - revenue: soma de totalAmount dos pedidos paid
 */
adminRaffleStatsRoutes.get(
  "/raffles/:id/stats",
  auth,
  requireAdmin,
  async (req, res) => {
    const raffleId = req.params.id;

    const raffle = await prisma.raffle.findUnique({
      where: { id: raffleId },
      select: { id: true, status: true, winner: { select: { id: true } } },
    });

    if (!raffle) return res.status(404).json({ error: "Rifa não encontrada" });

    const [confirmedNumbers, paidOrders, groupedUsers, revenueAgg] =
      await Promise.all([
        prisma.orderNumber.count({
          where: { raffleId, status: "confirmed" },
        }),

        prisma.order.count({
          where: { raffleId, status: "paid" },
        }),

        prisma.order.groupBy({
          by: ["userId"],
          where: { raffleId, status: "paid" },
        }),

        prisma.order.aggregate({
          where: { raffleId, status: "paid" },
          _sum: { totalAmount: true },
        }),
      ]);

    const participants = groupedUsers.length;
    const revenue = revenueAgg?._sum?.totalAmount ?? 0;

    return res.json({
      raffle: {
        id: raffle.id,
        status: raffle.status,
        hasWinner: !!raffle.winner,
      },
      participants,
      confirmedNumbers,
      paidOrders,
      revenue,
    });
  }
);
