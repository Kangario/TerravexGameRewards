const express = require("express");
const { getPlayerId, sendServerError } = require("./routeUtils");

function createRewardRouter(rewardService) {
    const router = express.Router();

    router.post("/rewards/create", async (req, res) => {
        try {
            const playerId = getPlayerId(req.body);
            const { rewardType, payload = {} } = req.body;

            if (!playerId || typeof rewardType !== "string" || !rewardType.trim()) {
                return res.status(400).json({
                    ok: false,
                    error: "playerId and rewardType are required"
                });
            }

            const reward = await rewardService.createQueuedReward({
                playerId,
                rewardType: rewardType.trim(),
                payload
            });

            return res.status(201).json({ ok: true, messageType: "reward_created", reward });
        } catch (err) {
            return sendServerError(res, "Rewards create error", err);
        }
    });

    router.post("/battle-rewards/apply", async (req, res) => {
        try {
            const playerId = getPlayerId(req.body);
            const { rewardType, battle, reward } = req.body;

            if (!playerId || !reward || typeof reward !== "object") {
                return res.status(400).json({
                    ok: false,
                    error: "playerId and reward are required"
                });
            }

            const result = await rewardService.applyBattleReward({
                playerId,
                rewardType: rewardType || "battle_reward",
                battle,
                reward
            });

            if (!result) {
                return res.status(404).json({ ok: false, error: "User profile not found" });
            }

            return res.status(201).json({
                ok: true,
                messageType: "battle_reward_applied",
                ...result
            });
        } catch (err) {
            return sendServerError(res, "Battle rewards apply error", err);
        }
    });

    router.post("/rewards/claim", async (req, res) => {
        try {
            const playerId = getPlayerId(req.body);
            if (!playerId) {
                return res.status(400).json({ ok: false, error: "playerId is required" });
            }

            const reward = await rewardService.claim(playerId);
            if (!reward) {
                return res.json({
                    ok: true,
                    messageType: "no_rewards",
                    message: "Player has no unclaimed rewards"
                });
            }

            return res.json({ ok: true, messageType: "reward", reward });
        } catch (err) {
            return sendServerError(res, "Rewards claim error", err);
        }
    });

    router.post("/rewards/list", async (req, res) => {
        try {
            const playerId = getPlayerId(req.body);
            if (!playerId) {
                return res.status(400).json({ ok: false, error: "playerId is required" });
            }

            const rewards = await rewardService.list(playerId);
            return res.json({ ok: true, count: rewards.length, rewards });
        } catch (err) {
            return sendServerError(res, "Rewards list error", err);
        }
    });

    return router;
}

module.exports = { createRewardRouter };
