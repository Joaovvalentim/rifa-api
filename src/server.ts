import "dotenv/config";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { startExpirePendingOrdersJob } from "./jobs/expirePendingOrders";
import { CORS_ORIGINS, IS_PRODUCTION } from "./lib/env";
import { adminDrawRoutes } from "./routes/adminDraw.routes";
import { adminOrdersRoutes } from "./routes/adminOrders.routes";
import { adminRaffleStatsRoutes } from "./routes/adminRaffleStats.routes";
import { adminRafflesRoutes } from "./routes/adminRaffles.routes";
import { authRoutes } from "./routes/auth.routes";
import { meRoutes } from "./routes/me.routes";
import { myOrdersRoutes } from "./routes/myOrders.routes";
import { ordersRoutes } from "./routes/orders.routes";
import { paymentsRoutes } from "./routes/payments.routes";
import { rafflesRoutes } from "./routes/raffles.routes";
import { raffleWinnerRoutes } from "./routes/raffleWinner.routes";

const app = express();
const allowedOrigins = new Set(CORS_ORIGINS);

function isAllowedDevOrigin(origin: string) {
  if (IS_PRODUCTION) return false;

  try {
    const url = new URL(origin);
    return (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
      Boolean(url.port)
    );
  } catch {
    return false;
  }
}

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin) || isAllowedDevOrigin(origin)) {
        return callback(null, true);
      }
      console.warn(`CORS bloqueado para origin: ${origin}`);
      return callback(new Error("Origin nao permitida por CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
  })
);
app.use(helmet());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/auth", authRoutes);
app.use("/raffles", rafflesRoutes);
app.use("/orders", ordersRoutes);
app.use("/payments", paymentsRoutes);
app.use("/me", meRoutes);
app.use("/my-orders", myOrdersRoutes);
app.use("/admin/raffles", adminRafflesRoutes);
app.use("/admin/orders", adminOrdersRoutes);
app.use("/admin", adminDrawRoutes);
app.use("/", raffleWinnerRoutes);
app.use("/admin", adminRaffleStatsRoutes);

app.listen(3001, () => {
  console.log("Servidor rodando em http://localhost:3001");
});

startExpirePendingOrdersJob();
