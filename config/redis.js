const { createClient } = require("redis");

function createRedisClient() {
    const redis = createClient({
        username: process.env.REDIS_USERNAME || "default",
        password: process.env.REDIS_PASSWORD || "af0gO9r23iS9w7sYd8T0XtQktQR0ZXnl",
        socket: {
            host: process.env.REDIS_HOST || "redis-17419.c328.europe-west3-1.gce.cloud.redislabs.com",
            port: Number(process.env.REDIS_PORT || 17419)
        }
    });

    redis.on("error", (err) => console.error("Rewards Redis error:", err));
    return redis;
}

module.exports = { createRedisClient };
