function getPlayerId(body = {}) {
    const rawPlayerId = body.playerId ?? body.userId;
    if (typeof rawPlayerId !== "string") {
        return null;
    }

    const playerId = rawPlayerId.trim();
    return playerId || null;
}

function sendServerError(res, scope, err) {
    console.error(`[${scope}]`, err);
    return res.status(500).json({
        ok: false,
        error: "Internal server error"
    });
}

module.exports = { getPlayerId, sendServerError };
