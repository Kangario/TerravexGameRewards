const { findHero, levelUpHero } = require("../domain/characterProgression");

class CharacterProgressionService {
    constructor(profileRepository) {
        this.profileRepository = profileRepository;
    }

    async levelUp({ playerId, instanceId, heroId, levels }) {
        const loadedProfile = await this.profileRepository.load(playerId);
        if (!loadedProfile) {
            return null;
        }

        const found = findHero(loadedProfile.profile, { instanceId, heroId });
        if (!found) {
            return { loadedProfile, hero: null };
        }

        const change = levelUpHero(found.hero, levels);
        await this.profileRepository.save(loadedProfile);

        return {
            location: found.location,
            ...change
        };
    }
}

module.exports = { CharacterProgressionService };
