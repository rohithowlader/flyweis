const { createClient } = require("redis");
const { env } = require("./env");

let client;

/**
 * Data client (commands) + duplicates for Pub/Sub (socket.io adapter).
 */
async function connectRedis() {
  client = createClient({
    url: env.redisUrl,
    socket: {
      // For rediss:// this will use TLS. Keep explicit for clarity.
      tls: true,
      // Render typically presents valid certs; if your environment blocks, set to false.
      // rejectUnauthorized: false
    },
  });

  client.on("error", (err) => {
    console.error("[redis] error:", err);
  });

  await client.connect();
  console.log("[redis] connected");

  const pubClient = client.duplicate();
  const subClient = client.duplicate();
  await pubClient.connect();
  await subClient.connect();

  return { client, pubClient, subClient };
}

function getRedis() {
  if (!client) throw new Error("Redis not connected yet.");
  return client;
}

module.exports = { connectRedis, getRedis };
