const express = require("express");
const { createClient } = require("redis");
const crypto = require("crypto");

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 24;
const USERNAME_REGEX = /^[A-Za-z0-9_]+$/;

function getUserIdFromBody(body = {}) {
    const rawUserId = body.userId ?? body.playerId;
    if (typeof rawUserId !== "string") {
        return null;
    }

    const normalizedUserId = rawUserId.trim();
    return normalizedUserId || null;
}

function getUserProfileKeyCandidates(userId) {
    return [
        `user:${userId}:profile`,
        `user:${userId}`,
        `profile:${userId}`,
        `player:${userId}`
    ];
}

function getUsernameIndexKey(username) {
    return `username_index:${username.toLowerCase()}`;
}

function getDaysInGame(dateRegistration) {
    const registrationDateMs = Number(dateRegistration);

    if (!Number.isFinite(registrationDateMs) || registrationDateMs <= 0) {
        return 0;
    }

    const differenceMs = Date.now() - registrationDateMs;
    if (differenceMs <= 0) {
        return 0;
    }

    return Math.floor(differenceMs / (1000 * 60 * 60 * 24));
}

function buildPublicProfile(profile) {
    return {
        username: profile.username,
        level: Number(profile.level) || 0,
        gold: Number(profile.gold) || 0,
        victories: Number(profile.victories) || 0,
        defeats: Number(profile.defeats) || 0,
        rating: Number(profile.rating) || 0,
        daysInGame: getDaysInGame(profile.dateRegistration)
    };
}

function parseRawProfile(type, rawValue) {
    if (!rawValue) {
        return null;
    }

    if (type === "string") {
        const parsed = JSON.parse(rawValue);
        if (parsed && typeof parsed === "object") {
            if (parsed.profile && typeof parsed.profile === "object") {
                return parsed.profile;
            }
            return parsed;
        }
        return null;
    }

    if (type === "hash") {
        return rawValue;
    }

    return null;
}

async function loadUserProfile(redis, userId) {
    for (const key of getUserProfileKeyCandidates(userId)) {
        const type = await redis.type(key);

        if (type === "none") {
            continue;
        }

        if (type === "string") {
            const rawProfile = await redis.get(key);
            const parsedProfile = parseRawProfile(type, rawProfile);

            if (parsedProfile) {
                return { profile: parsedProfile, storageType: "string", key };
            }
        }

        if (type === "hash") {
            const hashProfile = await redis.hGetAll(key);
            if (Object.keys(hashProfile).length > 0) {
                return { profile: parseRawProfile(type, hashProfile), storageType: "hash", key };
            }
        }
    }

    return null;
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


    // =====================================
    // 👤 GET PROFILE (public fields)
    // =====================================
    app.post("/profile/get", async (req, res) => {
        try {
            const userId = getUserIdFromBody(req.body);

            if (!userId) {
                return res.status(400).json({
                    ok: false,
                    error: "userId (or playerId) is required"
                });
            }

            const loadedProfile = await loadUserProfile(redis, userId);

            if (!loadedProfile?.profile) {
                return res.status(404).json({
                    ok: false,
                    error: "User profile not found"
                });
            }

            return res.json({
                ok: true,
                profile: buildPublicProfile(loadedProfile.profile)
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
            const userId = getUserIdFromBody(req.body);
            const { username } = req.body;

            if (!userId) {
                return res.status(400).json({
                    ok: false,
                    error: "userId (or playerId) is required"
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

            const loadedProfile = await loadUserProfile(redis, userId);
            const profile = loadedProfile?.profile;

            if (!profile) {
                return res.status(404).json({
                    ok: false,
                    error: "User profile not found"
                });
            }

            const previousUsername = String(profile.username || "").trim();

            if (!previousUsername) {
                return res.status(400).json({
                    ok: false,
                    error: "Current username is missing in profile"
                });
            }

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

            const tx = redis.multi();

            if (loadedProfile.storageType === "hash") {
                tx.hSet(loadedProfile.key, profile);
            } else {
                tx.set(loadedProfile.key, JSON.stringify(profile));
            }

            tx.set(newIndexKey, userId);
            tx.del(oldIndexKey);

            const transactionResult = await tx.exec();

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