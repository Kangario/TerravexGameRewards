const express = require("express");
const { createClient } = require("redis");
const crypto = require("crypto");

async function start() {
    const redis  = createClient({
        username: "default",
        password: "af0gO9r23iS9w7sYd8T0XtQktQR0ZXnl",
        socket: { host: "redis-17419.c328.europe-west3-1.gce.cloud.redislabs.com", port: 17419 }
    });

    redis.on("error", (err) => console.error("Rewards Redis error:", err));
    await redis.connect();

    console.log("✅ Redis connected (Rewards)");

    const app = express();
    app.use(express.json());

    const PORT = Number(process.env.REWARDS_PORT || 3002);

    // =====================================
    // 🎁 CREATE REWARD
    // =====================================
    app.post("/rewards/create", async (req, res) => {
        try {
            const { playerId, rewardType, payload = {} } = req.body;

            if (!playerId || !rewardType) {
                return res.status(400).json({
                    ok: false,
                    error: "playerId and rewardType are required"
                });
            }

            const reward = {
                id: crypto.randomUUID(),
                type: rewardType,
                payload,
                createdAt: Date.now()
            };

            const rewardsKey = `user:${playerId}:rewards`;

            await redis.rPush(rewardsKey, JSON.stringify(reward));

            return res.status(201).json({
                ok: true,
                messageType: "reward_created",
                reward
            });

        } catch (err) {
            console.error("[Rewards] Create error:", err);
            return res.status(500).json({
                ok: false,
                error: "Internal server error"
            });
        }
    });

    // =====================================
    // 🏆 CLAIM REWARD
    // =====================================
    app.post("/rewards/claim", async (req, res) => {
        try {
            const { playerId } = req.body;

            if (!playerId) {
                return res.status(400).json({
                    ok: false,
                    error: "playerId is required"
                });
            }

            const rewardsKey = `user:${playerId}:rewards`;

            const rawReward = await redis.lPop(rewardsKey);

            if (!rawReward) {
                return res.json({
                    ok: true,
                    messageType: "no_rewards",
                    message: "У игрока нет неполученных наград"
                });
            }

            return res.json({
                ok: true,
                messageType: "reward",
                reward: JSON.parse(rawReward)
            });

        } catch (err) {
            console.error("[Rewards] Claim error:", err);
            return res.status(500).json({
                ok: false,
                error: "Internal server error"
            });
        }
    });

    // =====================================
    // 📦 GET ALL REWARDS (опционально)
    // =====================================
    app.post("/rewards/list", async (req, res) => {
        try {
            const { playerId } = req.body;

            if (!playerId) {
                return res.status(400).json({
                    ok: false,
                    error: "playerId is required"
                });
            }

            const rewardsKey = `user:${playerId}:rewards`;

            const rewards = await redis.lRange(rewardsKey, 0, -1);

            const parsedRewards = rewards.map(r => JSON.parse(r));

            return res.json({
                ok: true,
                count: parsedRewards.length,
                rewards: parsedRewards
            });

        } catch (err) {
            console.error("[Rewards] List error:", err);
            return res.status(500).json({
                ok: false,
                error: "Internal server error"
            });
        }
    });

    // =====================================
    // ❤️ HEALTH
    // =====================================
    app.get("/health", (req, res) => {
        res.json({ status: "ok" });
    });

    app.listen(PORT, () => {
        console.log(`🚀 Rewards server started on http://localhost:${PORT}`);
    });
}

start();