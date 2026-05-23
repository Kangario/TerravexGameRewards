const express = require("express");
const { getPlayerId, sendServerError } = require("./routeUtils");

function createCharacterRouter(characterProgressionService) {
    const router = express.Router();

    router.post("/level-up", async (req, res) => {
        try {
            const playerId = getPlayerId(req.body);
            const { instanceId, heroId, levels = 1 } = req.body;

            if (!playerId || (!instanceId && heroId === undefined)) {
                return res.status(400).json({
                    ok: false,
                    error: "playerId and instanceId (or heroId) are required"
                });
            }

            const safeLevels = Number(levels);
            if (!Number.isInteger(safeLevels) || safeLevels <= 0) {
                return res.status(400).json({
                    ok: false,
                    error: "levels must be a positive integer"
                });
            }

            const result = await characterProgressionService.levelUp({
                playerId,
                instanceId,
                heroId,
                levels: safeLevels
            });

            if (!result) {
                return res.status(404).json({ ok: false, error: "User profile not found" });
            }

            if (!result.after) {
                return res.status(404).json({ ok: false, error: "Character not found" });
            }

            return res.json({
                ok: true,
                messageType: "character_level_up",
                ...result
            });
        } catch (err) {
            return sendServerError(res, "Character level up error", err);
        }
    });

    return router;
}

module.exports = { createCharacterRouter };
