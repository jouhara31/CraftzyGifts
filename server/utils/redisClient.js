const { createClient } = require("redis");

let redisClientPromise = null;

const getRedisUrl = () => String(process.env.REDIS_URL || "").trim();

const getRedisClient = async () => {
  const redisUrl = getRedisUrl();
  if (!redisUrl) return null;
  if (redisClientPromise) return redisClientPromise;

  const client = createClient({ url: redisUrl });
  client.on("error", (error) => {
    console.error("Redis client error", error);
  });

  redisClientPromise = client
    .connect()
    .then(() => client)
    .catch((error) => {
      console.error("Redis connection failed", error);
      redisClientPromise = null;
      return null;
    });

  return redisClientPromise;
};

module.exports = {
  getRedisClient,
};
