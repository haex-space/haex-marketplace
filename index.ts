import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import extensionsRoutes from "./src/routes/extensions.ts";
import reviewsRoutes from "./src/routes/reviews.ts";
import publishersRoutes from "./src/routes/publishers.ts";
import categoriesRoutes from "./src/routes/categories.ts";
import publishRoutes from "./src/routes/publish.ts";
import { initStorageAsync } from "./src/utils/storage.ts";

const app = new Hono();

// Initialize storage bucket on startup
initStorageAsync().catch(console.error);

// Middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: "*", // Configure this in production
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Platform", "X-App-Version"],
  })
);

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

// Public routes
app.route("/extensions", extensionsRoutes);
app.route("/extensions", reviewsRoutes); // Reviews are nested under /extensions/:slug/reviews
app.route("/publishers", publishersRoutes);
app.route("/categories", categoriesRoutes);

// Publisher routes (authenticated)
app.route("/publish", publishRoutes);

// 404 handler
app.notFound((c) => c.json({ error: "Not found" }, 404));

// Error handler
app.onError((err, c) => {
  console.error("Server error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

const port = Number(process.env.PORT) || 3000;

console.log(`Starting haex-marketplace on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
