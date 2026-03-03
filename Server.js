const express = require("express");
const { createClient } = require("redis");

async function start() {

    const redis = createClient({
        socket: {
            host: "redis-17419.c328.europe-west3-1.gce.cloud.redislabs.com",
            port: 17419,
        },
        password: "af0gO9r23iS9w7sYd8T0XtQktQR0ZXnl",
    });

    redis.on("error", (err) => console.error("Redis error:", err));
    await redis.connect();

    console.log("✅ Redis connected (Progression)");

    const app = express();
    app.use(express.json());

    app.post("/rewards/match-win", async (req, res) => {
        try {
            const { playerId, unitId, xpCount } = req.body;

            if (!playerId || !unitId || !xpCount) {
                return res.status(400).json({
                    ok: false,
                    error: "playerId, unitId, xpCount required"
                });
            }

            const key = `user:${playerId}`;
            const rawPlayer = await redis.get(key);

            if (!rawPlayer) {
                return res.status(404).json({ error: "Player not found" });
            }

            const player = JSON.parse(rawPlayer);

            // === Ищем героя ===
            let hero = player.heroesBought?.find(h => h.InstanceId === unitId)
                || player.equipmentHeroes?.find(h => h.InstanceId === unitId);

            if (!hero) {
                return res.status(400).json({ error: "Hero not found" });
            }

            // === Считаем награды ===
            const ratingGain = 50;
            const goldReward = 100;

            hero.Xp += xpCount;
            player.rating = (player.rating || 0) + ratingGain;
            player.victories = (player.victories || 0) + 1;
            player.gold = (player.gold || 0) + goldReward;

            // === Сохраняем профиль ===
            await redis.set(key, JSON.stringify(player));

            // === Добавляем запись в inbox ===
            const rewardRecord = {
                id: crypto.randomUUID(),
                type: "match_win",
                heroId: unitId,
                xp: xpCount,
                ratingChange: ratingGain,
                gold: goldReward,
                createdAt: Date.now()
            };

            await redis.lPush(
                `user:${playerId}:rewards`,
                JSON.stringify(rewardRecord)
            );

            // === Возвращаем diff ===
            return res.json({
                ok: true,
                rewards: rewardRecord,
                newProfile: {
                    rating: player.rating,
                    gold: player.gold,
                    victories: player.victories
                }
            });

        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: "Internal server error" });
        }
    });

    app.listen(3001, () => {
        console.log("🚀 Progression server running on port 3001");
    });
}

start();