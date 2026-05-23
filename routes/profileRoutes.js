const express = require("express");
const { getPlayerId, sendServerError } = require("./routeUtils");

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 24;
const USERNAME_REGEX = /^[A-Za-z0-9_]+$/;

function getDaysInGame(dateRegistration) {
    const registrationDateMs = Number(dateRegistration);
    if (!Number.isFinite(registrationDateMs) || registrationDateMs <= 0) {
        return 0;
    }

    const differenceMs = Date.now() - registrationDateMs;
    return differenceMs > 0 ? Math.floor(differenceMs / (1000 * 60 * 60 * 24)) : 0;
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

function createProfileRouter(profileRepository) {
    const router = express.Router();

    router.post("/get", async (req, res) => {
        try {
            const playerId = getPlayerId(req.body);
            if (!playerId) {
                return res.status(400).json({ ok: false, error: "userId (or playerId) is required" });
            }

            const loadedProfile = await profileRepository.load(playerId);
            if (!loadedProfile) {
                return res.status(404).json({ ok: false, error: "User profile not found" });
            }

            return res.json({ ok: true, profile: buildPublicProfile(loadedProfile.profile) });
        } catch (err) {
            return sendServerError(res, "Profile get error", err);
        }
    });

    router.post("/username/update", async (req, res) => {
        try {
            const playerId = getPlayerId(req.body);
            const username = typeof req.body.username === "string" ? req.body.username.trim() : "";

            if (!playerId) {
                return res.status(400).json({ ok: false, error: "userId (or playerId) is required" });
            }

            if (!username ||
                username.length < USERNAME_MIN_LENGTH ||
                username.length > USERNAME_MAX_LENGTH ||
                !USERNAME_REGEX.test(username)) {
                return res.status(400).json({
                    ok: false,
                    error: "username must be 3-24 letters, numbers or underscores"
                });
            }

            const loadedProfile = await profileRepository.load(playerId);
            if (!loadedProfile) {
                return res.status(404).json({ ok: false, error: "User profile not found" });
            }

            const previousUsername = String(loadedProfile.profile.username || "").trim();
            if (!previousUsername || previousUsername === username) {
                return res.status(400).json({
                    ok: false,
                    error: previousUsername ? "New username must be different" : "Current username is missing"
                });
            }

            loadedProfile.profile.username = username;
            const updated = await profileRepository.updateUsernameIndex({
                userId: playerId,
                previousUsername,
                nextUsername: username,
                loadedProfile
            });

            if (!updated.ok) {
                return res.status(409).json({
                    ok: false,
                    error: updated.conflict ? "username is already taken" : "Username update conflicted, retry request"
                });
            }

            return res.json({
                ok: true,
                message: "username updated",
                profile: buildPublicProfile(loadedProfile.profile)
            });
        } catch (err) {
            return sendServerError(res, "Profile username update error", err);
        }
    });

    return router;
}

module.exports = { createProfileRouter };
