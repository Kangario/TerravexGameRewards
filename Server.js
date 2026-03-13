const express = require("express");
const { createClient } = require("redis");
const crypto = require("crypto");

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 24;
const USERNAME_REGEX = /^[A-Za-z0-9_]+$/;

function getUserProfileKey(userId) {
    return userId;
}

function getUsernameIndexKey(username) {
    return `username:${username.toLowerCase()}`;
}

function getDaysInGame(dateRegistration) {
    if (!Number.isFinite(dateRegistration)) {
        return 0;
    }

    const registrationDateMs = Math.max(0, Number(dateRegistration));
    const differenceMs = Date.now() - registrationDateMs;

    if (differenceMs <= 0) {
        return 0;
    }

    return Math.floor(differenceMs / (1000 * 60 * 60 * 24));
}

function buildPublicProfile(profile) {
    return {
        username: profile.username,
        level: profile.level,
        gold: profile.gold,
        victories: profile.victories,
        defeats: profile.defeats,
        rating: profile.rating,
        daysInGame: getDaysInGame(profile.dateRegistration)
    };
}

async function loadUserProfile(redis, userId) {
    const userProfileKey = getUserProfileKey(userId);
    const rawProfile = await redis.get(userProfileKey);

    if (!rawProfile) {
        return null;
    }

    return JSON.parse(rawProfile);
}

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


    app.post("/profile/get", async (req, res) => {
        try {
            const { userId } = req.body;

            if (!userId || typeof userId !== "string") {
                return res.status(400).json({
                    ok: false,
                    error: "userId is required"
                });
            }

            const profile = await loadUserProfile(redis, userId);

            if (!profile) {
                return res.status(404).json({
                    ok: false,
                    error: "User profile not found"
                });
            }

            return res.json({
                ok: true,
                profile: buildPublicProfile(profile)
            });
        } catch (err) {
            console.error("[Profile] Get error:", err);
            return res.status(500).json({
                ok: false,
                error: "Internal server error"
            });
        }
    });

    // =====================================
    // ✏️ UPDATE USERNAME
    // =====================================
    app.post("/profile/username/update", async (req, res) => {
        try {
            const { userId, username } = req.body;

            if (!userId || typeof userId !== "string") {
                return res.status(400).json({
                    ok: false,
                    error: "userId is required"
                });
            }

            if (typeof username !== "string") {
                return res.status(400).json({
                    ok: false,
                    error: "username must be a string"
                });
            }

            const normalizedUsername = username.trim();

            if (!normalizedUsername) {
                return res.status(400).json({
                    ok: false,
                    error: "username cannot be empty"
                });
            }

            if (normalizedUsername.length < USERNAME_MIN_LENGTH || normalizedUsername.length > USERNAME_MAX_LENGTH) {
                return res.status(400).json({
                    ok: false,
                    error: `username length should be between ${USERNAME_MIN_LENGTH} and ${USERNAME_MAX_LENGTH} characters`
                });
            }

            if (!USERNAME_REGEX.test(normalizedUsername)) {
                return res.status(400).json({
                    ok: false,
                    error: "username can contain only letters, numbers and underscore"
                });
            }

            const profile = await loadUserProfile(redis, userId);

            if (!profile) {
                return res.status(404).json({
                    ok: false,
                    error: "User profile not found"
                });
            }

            const previousUsername = profile.username;

            if (previousUsername === normalizedUsername) {
                return res.status(400).json({
                    ok: false,
                    error: "New username must be different from current username"
                });
            }

            const oldIndexKey = getUsernameIndexKey(previousUsername);
            const newIndexKey = getUsernameIndexKey(normalizedUsername);

            await redis.watch(newIndexKey);

            const existingUserId = await redis.get(newIndexKey);

            if (existingUserId && existingUserId !== userId) {
                await redis.unwatch();
                return res.status(409).json({
                    ok: false,
                    error: "username is already taken"
                });
            }

            profile.username = normalizedUsername;

            const transactionResult = await redis.multi()
                .set(getUserProfileKey(userId), JSON.stringify(profile))
                .set(newIndexKey, userId)
                .del(oldIndexKey)
                .exec();

            if (!transactionResult) {
                return res.status(409).json({
                    ok: false,
                    error: "Username update conflicted, retry request"
                });
            }

            return res.json({
                ok: true,
                message: "username updated",
                profile: buildPublicProfile(profile)
            });
        } catch (err) {
            console.error("[Profile] Username update error:", err);
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