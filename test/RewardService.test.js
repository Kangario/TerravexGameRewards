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
        equipmentHeroes: [{ Id: 7, InstanceId: "hero-7", Name: "Gargonruk", Lvl: 10, Xp: 100 }]
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
            survivorXp: [{ instanceId: "hero-7", xpDelta: 50, source: "pve_win" }],
            killXp: [{ instanceId: "hero-7", xpDelta: 500, kills: 10 }],
            removedHeroes: []
        }
    });

    assert.equal(profile.equipmentHeroes[0].Xp, 650);
    assert.equal(result.characters[0].before.Xp, 100);
    assert.equal(result.characters[0].after.Xp, 650);
    assert.deepEqual(result.profile, {
        before: { gold: 10, rating: 1000, victories: 0, defeats: 0 },
        after: { gold: 110, rating: 1100, victories: 1, defeats: 0 }
    });
    assert.equal(rewards[0].reward.payload.characters[0].reward.xpDelta, 550);
    assert.equal(rewards[0].reward.payload.rewards.survivorXp[0].Name, "Gargonruk");
    assert.equal(rewards[0].reward.payload.rewards.killXp[0].Name, "Gargonruk");
    assert.equal(rewards[0].reward.payload.rewards.killXp[0].HeroName, "Gargonruk");
    assert.equal(rewards[0].reward.payload.rewards.killXp[0].DisplayName, "Gargonruk");
});

test("pve battle reward does not apply or queue rating delta", async () => {
    const profile = {
        gold: 10,
        rating: 1000,
        victories: 0,
        defeats: 0,
        equipmentHeroes: []
    };
    const { profileRepository, rewardRepository, rewards } = createRepositories(profile);
    const service = new RewardService(profileRepository, rewardRepository);

    const result = await service.applyBattleReward({
        playerId: "u1",
        rewardType: "battle_win",
        battle: { matchId: "pve-1", mode: "PVE", outcome: "win" },
        reward: {
            goldDelta: 100,
            ratingDelta: 100,
            victoriesDelta: 1,
            defeatsDelta: 0,
            killXp: [],
            survivorXp: [],
            removedHeroes: []
        }
    });

    assert.deepEqual(result.profile, {
        before: { gold: 10, rating: 1000, victories: 0, defeats: 0 },
        after: { gold: 110, rating: 1000, victories: 1, defeats: 0 }
    });
    assert.equal("ratingDelta" in rewards[0].reward.payload.rewards, false);
});

test("battle reward remembers removed hero ids for shop filtering", async () => {
    const profile = {
        gold: 10,
        rating: 1000,
        victories: 0,
        defeats: 0,
        deadHeroIds: [3],
        equipmentHeroes: [{ Id: 7, InstanceId: "hero-7", Name: "Gargonruk", Lvl: 10, Xp: 100 }]
    };
    const { profileRepository } = createRepositories(profile);
    const service = new RewardService(profileRepository, { async enqueue() {} });

    const result = await service.applyBattleReward({
        playerId: "u1",
        rewardType: "battle_loss",
        battle: { matchId: "m1", outcome: "lose" },
        reward: {
            defeatsDelta: 1,
            removedHeroes: [{ instanceId: "hero-7" }]
        }
    });

    assert.deepEqual(profile.equipmentHeroes, []);
    assert.deepEqual(profile.deadHeroIds, [3, 7]);
    assert.equal(result.characters[0].removed, true);
    assert.equal(result.characters[0].identity.heroId, 7);
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
