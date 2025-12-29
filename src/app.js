const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");

const { env } = require("./config/env");
const routes = require("./routes");
const { notFound } = require("./middleware/notFound");
const { errorHandler } = require("./middleware/errorHandler");

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));

  app.use(
    cors({
      origin: env.corsOrigin === "*" ? true : env.corsOrigin,
      credentials: true,
    })
  );

  app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

  app.use("/api/v1", routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
