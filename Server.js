const express = require("express");
const { createRedisClient } = require("./config/redis");
const { ProfileRepository } = require("./repositories/ProfileRepository");
const { RewardRepository } = require("./repositories/RewardRepository");
const { CharacterProgressionService } = require("./services/CharacterProgressionService");
const { RewardService } = require("./services/RewardService");
const { createProfileRouter } = require("./routes/profileRoutes");
const { createRewardRouter } = require("./routes/rewardRoutes");
const { createCharacterRouter } = require("./routes/characterRoutes");

async function start() {
    const redis = createRedisClient();
    const app = express();
    const profileRepository = new ProfileRepository(redis);
    const rewardRepository = new RewardRepository(redis);
    const characterProgressionService = new CharacterProgressionService(profileRepository);
    const rewardService = new RewardService(profileRepository, rewardRepository);

    app.use(express.json());

    const ensureRedisReady = (req, res, next) => {
        if (!redis.isReady) {
            return res.status(503).json({
                ok: false,
                error: "Service is starting, Redis is not ready yet"
            });
        }

        next();
    };

    app.get("/health", (req, res) => {
        res.json({
            status: redis.isReady ? "ok" : "starting",
            redisReady: redis.isReady
        });
    });

    app.use("/profile", ensureRedisReady, createProfileRouter(profileRepository));
    app.use("/characters", ensureRedisReady, createCharacterRouter(characterProgressionService));
    app.use("/", ensureRedisReady, createRewardRouter(rewardService));

    const port = Number(process.env.PORT || process.env.REWARDS_PORT || 3002);
    const host = process.env.HOST || "0.0.0.0";

    app.listen(port, host, () => {
        console.log(`Rewards server started on http://${host}:${port}`);
    });

    redis.connect()
        .then(() => console.log("Redis connected (Rewards)"))
        .catch((err) => console.error("Failed to connect to Redis during startup:", err));
}

start();
