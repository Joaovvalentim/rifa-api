import "dotenv/config";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { performance } from "node:perf_hooks";
import { AUTH_COOKIE_NAME, JWT_SECRET } from "../src/lib/env";
import { prisma } from "../src/lib/prisma";

type LoadResult = {
  ok: boolean;
  status: number;
  ms: number;
  orderId?: string;
  error?: string;
};

const apiUrl = process.env.LOAD_API_URL || "http://localhost:3001";
const totalNumbers = readInt("LOAD_TOTAL_NUMBERS", 150_000);
const quantityPerOrder = readInt("LOAD_QUANTITY_PER_ORDER", 200);
const clientCount = readInt(
  "LOAD_CLIENTS",
  Math.ceil(totalNumbers / quantityPerOrder)
);
const concurrency = readInt("LOAD_CONCURRENCY", 25);
const pricePerNumber = readInt("LOAD_PRICE_PER_NUMBER", 1);
const confirmPaid = readBoolean("LOAD_CONFIRM_PAID", false);

function readInt(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

function readBoolean(name: string, fallback: boolean) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "true" || raw === "1" || raw === "yes";
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function buildCookie(userId: string) {
  const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: "2h" });
  return `${AUTH_COOKIE_NAME}=${token}`;
}

async function ensureLoadData() {
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const passwordHash = await bcrypt.hash("load-test-123", 4);

  const raffle = await prisma.raffle.create({
    data: {
      title: `LOAD TEST ${totalNumbers} ${runId}`,
      description: "Rifa criada automaticamente para teste de carga.",
      minNumber: 1,
      maxNumber: totalNumbers,
      pricePerNumber,
      status: "active",
    },
    select: { id: true, title: true },
  });

  const users: Array<{ id: string; email: string }> = [];
  const indexes = Array.from({ length: clientCount }, (_, index) => index);

  for (let start = 0; start < indexes.length; start += 50) {
    const chunk = indexes.slice(start, start + 50);
    const created = await Promise.all(
      chunk.map((index) =>
      prisma.user.upsert({
        where: { email: `load-client-${index + 1}@testuser.com` },
        update: {},
        create: {
          name: `Load Client ${index + 1}`,
          email: `load-client-${index + 1}@testuser.com`,
          passwordHash,
        },
        select: { id: true, email: true },
      })
      )
    );
    users.push(...created);
  }

  return { raffle, users };
}

async function createOrder(params: {
  raffleId: string;
  userId: string;
  quantity: number;
}): Promise<LoadResult> {
  const startedAt = performance.now();

  try {
    const response = await fetch(`${apiUrl}/orders`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: buildCookie(params.userId),
      },
      body: JSON.stringify({
        raffleId: params.raffleId,
        quantity: params.quantity,
      }),
    });

    const text = await response.text();
    const body = text ? JSON.parse(text) : {};
    const ms = performance.now() - startedAt;

    return {
      ok: response.ok,
      status: response.status,
      ms,
      orderId: body.orderId,
      error: response.ok ? undefined : body.error || text,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      ms: performance.now() - startedAt,
      error: err instanceof Error ? err.message : "Erro desconhecido",
    };
  }
}

async function runPool<T>(items: T[], worker: (item: T, index: number) => Promise<LoadResult>) {
  const results: LoadResult[] = [];
  let cursor = 0;

  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);

      if ((index + 1) % 50 === 0 || index + 1 === items.length) {
        const ok = results.filter((result) => result?.ok).length;
        const failed = results.filter((result) => result && !result.ok).length;
        console.log(`progresso=${index + 1}/${items.length} ok=${ok} failed=${failed}`);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker())
  );

  return results;
}

async function validateRaffle(raffleId: string) {
  const [orderStats, numberCount, duplicates, buckets] = await Promise.all([
    prisma.order.groupBy({
      by: ["status"],
      where: { raffleId },
      _count: { _all: true },
    }),
    prisma.orderNumber.count({ where: { raffleId } }),
    prisma.$queryRaw<Array<{ number: number; count: bigint }>>`
      SELECT number, COUNT(*) AS count
      FROM "OrderNumber"
      WHERE "raffleId" = ${raffleId}
      GROUP BY number
      HAVING COUNT(*) > 1
      LIMIT 10
    `,
    prisma.$queryRaw<Array<{ bucket: number; count: bigint }>>`
      SELECT width_bucket(number, 1, ${totalNumbers}, 10) AS bucket, COUNT(*) AS count
      FROM "OrderNumber"
      WHERE "raffleId" = ${raffleId}
      GROUP BY bucket
      ORDER BY bucket
    `,
  ]);

  return { orderStats, numberCount, duplicates, buckets };
}

async function main() {
  if (quantityPerOrder > 200) {
    throw new Error("LOAD_QUANTITY_PER_ORDER nao pode passar de 200 porque a rota /orders limita a 200.");
  }

  const orderCount = Math.ceil(totalNumbers / quantityPerOrder);
  const plannedOrders = Array.from({ length: orderCount }, (_, index) => ({
    quantity:
      index === orderCount - 1
        ? totalNumbers - quantityPerOrder * (orderCount - 1)
        : quantityPerOrder,
  }));

  console.log("Configuracao do teste:", {
    apiUrl,
    totalNumbers,
    quantityPerOrder,
    orderCount,
    clientCount,
    concurrency,
    confirmPaid,
  });

  const { raffle, users } = await ensureLoadData();
  console.log(`Rifa de carga criada: ${raffle.title} (${raffle.id})`);

  const startedAt = performance.now();
  const results = await runPool(plannedOrders, (order, index) =>
    createOrder({
      raffleId: raffle.id,
      userId: users[index % users.length].id,
      quantity: order.quantity,
    })
  );

  const elapsedSeconds = (performance.now() - startedAt) / 1000;
  const okResults = results.filter((result) => result.ok);
  const failedResults = results.filter((result) => !result.ok);
  const latencies = results.map((result) => result.ms);

  if (confirmPaid && okResults.length > 0) {
    const ids = okResults.map((result) => result.orderId).filter(Boolean) as string[];
    await prisma.$transaction([
      prisma.orderNumber.updateMany({
        where: { orderId: { in: ids } },
        data: { status: "confirmed" },
      }),
      prisma.order.updateMany({
        where: { id: { in: ids } },
        data: {
          status: "paid",
          paymentStatus: "processed",
          paymentStatusDetail: "load_test_confirmed",
          paidAt: new Date(),
        },
      }),
    ]);
  }

  const validation = await validateRaffle(raffle.id);

  console.log("Resultado:", {
    elapsedSeconds: Number(elapsedSeconds.toFixed(2)),
    ordersPerSecond: Number((results.length / elapsedSeconds).toFixed(2)),
    ok: okResults.length,
    failed: failedResults.length,
    p50Ms: Math.round(percentile(latencies, 50)),
    p95Ms: Math.round(percentile(latencies, 95)),
    p99Ms: Math.round(percentile(latencies, 99)),
    numbersCreated: validation.numberCount,
    duplicateSamples: validation.duplicates.map((item) => ({
      number: item.number,
      count: Number(item.count),
    })),
    orderStats: validation.orderStats.map((item) => ({
      status: item.status,
      count: item._count._all,
    })),
    buckets: validation.buckets.map((item) => ({
      bucket: item.bucket,
      count: Number(item.count),
    })),
    firstErrors: failedResults.slice(0, 5).map((result) => ({
      status: result.status,
      error: result.error,
    })),
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
