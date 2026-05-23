const test = require("node:test");
const assert = require("node:assert/strict");
const { RewardService } = require("../services/RewardService");
const { CharacterProgressionService } = require("../services/CharacterProgressionService");

function createRepositories(profile) {
    const rewards = [];
    const loadedProfile = {
        key: "user:u1",
        storageType: "string",
        profile
    };

    return {
        rewards,
        profileRepository: {
            async load(playerId) {
                return playerId === "u1" ? loadedProfile : null;
            },
            async save(profileToSave) {
                assert.equal(profileToSave, loadedProfile);
            }
        },
        rewardRepository: {
            async enqueue(playerId, reward) {
                rewards.push({ playerId, reward });
            },
            async claim() {
                return null;
            },
            async list() {
                return rewards.map((item) => item.reward);
            }
        }
    };
}

test("battle reward stores character before and after xp snapshots", async () => {
    const profile = {
        gold: 10,
        rating: 1000,
        victories: 0,
        defeats: 0,
        equipmentHeroes: [{ Id: 7, InstanceId: "hero-7", Lvl: 1, Xp: 100 }]
    };
    const { profileRepository, rewardRepository, rewards } = createRepositories(profile);
    const service = new RewardService(profileRepository, rewardRepository);

    const result = await service.applyBattleReward({
        playerId: "u1",
        rewardType: "battle_win",
        battle: { matchId: "m1", outcome: "win" },
        reward: {
            goldDelta: 100,
            ratingDelta: 100,
            victoriesDelta: 1,
            killXp: [{ instanceId: "hero-7", xpDelta: 50 }],
            removedHeroes: []
        }
    });

    assert.equal(profile.equipmentHeroes[0].Xp, 150);
    assert.equal(result.characters[0].before.Xp, 100);
    assert.equal(result.characters[0].after.Xp, 150);
    assert.deepEqual(result.profile, {
        before: { gold: 10, rating: 1000, victories: 0, defeats: 0 },
        after: { gold: 110, rating: 1100, victories: 1, defeats: 0 }
    });
    assert.equal(rewards[0].reward.payload.characters[0].reward.xpDelta, 50);
});

test("character level up post service returns old and new character state", async () => {
    const profile = {
        heroesBought: [{ Id: 9, InstanceId: "hero-9", Lvl: 2, Xp: 25, StatUpPoints: 1 }]
    };
    const { profileRepository } = createRepositories(profile);
    const service = new CharacterProgressionService(profileRepository);

    const result = await service.levelUp({
        playerId: "u1",
        instanceId: "hero-9",
        levels: 1
    });

    assert.equal(result.before.Lvl, 2);
    assert.equal(result.after.Lvl, 3);
    assert.equal(result.after.Xp, 25);
    assert.equal(result.after.StatUpPoints, 6);
});
