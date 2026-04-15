import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import { startExpirePendingOrdersJob } from "./jobs/expirePendingOrders";
import { CORS_ORIGINS } from "./lib/env";
import { adminDrawRoutes } from "./routes/adminDraw.routes";
import { adminOrdersRoutes } from "./routes/adminOrders.routes";
import { adminRaffleStatsRoutes } from "./routes/adminRaffleStats.routes";
import { adminRafflesRoutes } from "./routes/adminRaffles.routes";
import { authRoutes } from "./routes/auth.routes";
import { meRoutes } from "./routes/me.routes";
import { myOrdersRoutes } from "./routes/myOrders.routes";
import { ordersRoutes } from "./routes/orders.routes";
import { rafflesRoutes } from "./routes/raffles.routes";
import { raffleWinnerRoutes } from "./routes/raffleWinner.routes";

dotenv.config();

const app = express();
const allowedOrigins = new Set(CORS_ORIGINS);

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }
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
