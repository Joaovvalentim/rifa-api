import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { auth } from "../middlewares/auth";

export const ordersRoutes = Router();

/**
 * POST /orders
 * Body: { raffleId: string, quantity: number }
 * Auth: Bearer JWT
 *
 * Cria um pedido PENDING e reserva N números aleatórios.
 * Otimização: gera candidatos em lote e insere via createMany(skipDuplicates).
 */
ordersRoutes.post("/", auth, async (req, res) => {
  const schema = z.object({
    raffleId: z.string().min(1),
    quantity: z.number().int().min(1).max(200),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { raffleId, quantity } = parsed.data;
  const userId = (req as any).userId as string;

  try {
    const raffle = await prisma.raffle.findUnique({ where: { id: raffleId } });
    if (!raffle || raffle.status !== "active") {
      return res.status(404).json({ error: "Rifa não encontrada" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const totalAmount = quantity * raffle.pricePerNumber;

      // 1) cria o pedido
      const order = await tx.order.create({
        data: {
          userId,
          raffleId,
          quantity,
          totalAmount,
          status: "pending",
        },
        select: { id: true },
      });

      // 2) reserva números em lote
      // Ajustes recomendados:
      // - batchSize: candidatos por rodada (maior => menos rodadas, mais insert)
      // - maxRounds: quantas rodadas tentamos antes de desistir (rifa muito cheia)
      const maxRounds = 30;
      const batchSize = Math.max(quantity * 3, 200);

      let allocated: number[] = [];

      for (
        let round = 0;
        round < maxRounds && allocated.length < quantity;
        round++
      ) {
        // 2.1) gera candidatos aleatórios sem repetição local
        const candidates = new Set<number>();
        while (candidates.size < batchSize) {
          const n =
            raffle.minNumber +
            Math.floor(
              Math.random() * (raffle.maxNumber - raffle.minNumber + 1)
            );
          candidates.add(n);
        }

        // 2.2) tenta inserir todos de uma vez (conflitos ignorados pelo UNIQUE)
        await tx.orderNumber.createMany({
          data: Array.from(candidates).map((n) => ({
            orderId: order.id,
            raffleId,
            number: n,
            status: "reserved",
          })),
          skipDuplicates: true,
        });

        // 2.3) lê quantos já foram reservados para esse pedido
        const rows = await tx.orderNumber.findMany({
          where: { orderId: order.id },
          select: { number: true },
        });

        allocated = rows.map((r) => r.number);

        // 2.4) se passou do necessário, remove extras (mantemos os menores por estabilidade)
        if (allocated.length > quantity) {
          allocated.sort((a, b) => a - b);
          const extras = allocated.slice(quantity);

          await tx.orderNumber.deleteMany({
            where: {
              orderId: order.id,
              number: { in: extras },
            },
          });

          allocated = allocated.slice(0, quantity);
        }
      }

      if (allocated.length < quantity) {
        // se falhou, opcional: expira o pedido e limpa reservas (a transação vai rollback de qualquer forma)
        throw new Error(
          "Rifa muito cheia: não foi possível reservar números suficientes."
        );
      }

      allocated.sort((a, b) => a - b);

      return {
        orderId: order.id,
        numbers: allocated,
        totalAmount,
      };
    });

    return res.status(201).json(result);
  } catch (err: any) {
    console.error("ORDER ERROR:", err);
    return res
      .status(409)
      .json({ error: err?.message ?? "Erro ao criar pedido" });
  }
});
