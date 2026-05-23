const crypto = require("crypto");
const {
    addHeroXp,
    clone,
    getHeroCollections,
    getHeroIdentity,
    sameHero
} = require("../domain/characterProgression");

class RewardService {
    constructor(profileRepository, rewardRepository) {
        this.profileRepository = profileRepository;
        this.rewardRepository = rewardRepository;
    }

    async createQueuedReward({ playerId, rewardType, payload = {} }) {
        const reward = this.buildReward({ rewardType, payload });
        await this.rewardRepository.enqueue(playerId, reward);
        return reward;
    }

    async claim(playerId) {
        return this.rewardRepository.claim(playerId);
    }

    async list(playerId) {
        return this.rewardRepository.list(playerId);
    }

    async applyBattleReward({ playerId, rewardType, battle = {}, reward }) {
        const loadedProfile = await this.profileRepository.load(playerId);
        if (!loadedProfile) {
            return null;
        }

        const applied = this.applyRewardToProfile(loadedProfile.profile, reward || {});
        const queuedReward = this.buildReward({
            rewardType,
            payload: {
                ...battle,
                rewards: reward || {},
                profile: applied.profile,
                characters: applied.characters
            }
        });

        await this.profileRepository.save(loadedProfile);
        await this.rewardRepository.enqueue(playerId, queuedReward);

        return {
            reward: queuedReward,
            profile: applied.profile,
            characters: applied.characters
        };
    }

    applyRewardToProfile(profile, reward) {
        const beforeProfile = this.getProfileProgressSnapshot(profile);

        profile.gold = Number(profile.gold || 0) + Number(reward.goldDelta || 0);
        profile.rating = Number(profile.rating || 0) + Number(reward.ratingDelta || 0);
        profile.victories = Number(profile.victories || 0) + Number(reward.victoriesDelta || 0);
        profile.defeats = Number(profile.defeats || 0) + Number(reward.defeatsDelta || 0);

        const characterChanges = [];
        for (const collection of getHeroCollections(profile)) {
            const survivors = [];

            for (const hero of collection.heroes) {
                const identity = getHeroIdentity(hero);

                if ((reward.removedHeroes || []).some((removedHero) => sameHero(hero, removedHero))) {
                    characterChanges.push({
                        location: collection.location,
                        identity,
                        removed: true,
                        before: clone(hero),
                        after: null,
                        reward: { removed: true }
                    });
                    continue;
                }

                const xpReward = (reward.killXp || []).find((killReward) => sameHero(hero, killReward));
                const xpChange = addHeroXp(hero, xpReward?.xpDelta);

                if (xpChange) {
                    characterChanges.push({
                        location: collection.location,
                        identity,
                        removed: false,
                        before: xpChange.before,
                        after: xpChange.after,
                        reward: { xpDelta: xpChange.xpDelta }
                    });
                }

                survivors.push(hero);
            }

            profile[collection.location] = survivors;
        }

        return {
            profile: {
                before: beforeProfile,
                after: this.getProfileProgressSnapshot(profile)
            },
            characters: characterChanges
        };
    }

    getProfileProgressSnapshot(profile) {
        return {
            gold: Number(profile.gold || 0),
            rating: Number(profile.rating || 0),
            victories: Number(profile.victories || 0),
            defeats: Number(profile.defeats || 0)
        };
    }

    buildReward({ rewardType, payload }) {
        return {
            id: crypto.randomUUID(),
            type: rewardType,
            payload,
            createdAt: Date.now()
        };
    }
}

module.exports = { RewardService };
