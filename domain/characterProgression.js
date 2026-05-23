function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function getHeroIdentity(hero) {
    return {
        heroId: hero.Id ?? hero.id ?? null,
        instanceId: hero.InstanceId ?? hero.instanceId ?? null
    };
}

function sameHero(hero, identity = {}) {
    const heroIdentity = getHeroIdentity(hero);

    if (identity.instanceId && heroIdentity.instanceId === identity.instanceId) {
        return true;
    }

    return identity.heroId !== null &&
        identity.heroId !== undefined &&
        heroIdentity.heroId === identity.heroId;
}

function normalizeHeroProgression(hero) {
    hero.Lvl = Number.isFinite(Number(hero.Lvl)) && Number(hero.Lvl) > 0 ? Number(hero.Lvl) : 1;
    hero.Xp = Number.isFinite(Number(hero.Xp)) && Number(hero.Xp) >= 0 ? Number(hero.Xp) : 0;
    hero.StatUpPoints = Number.isFinite(Number(hero.StatUpPoints)) && Number(hero.StatUpPoints) >= 0
        ? Number(hero.StatUpPoints)
        : 0;
    return hero;
}

function levelUpHero(hero, levels = 1) {
    normalizeHeroProgression(hero);

    const safeLevels = Math.floor(Number(levels));
    if (!Number.isFinite(safeLevels) || safeLevels <= 0) {
        throw new Error("levels must be a positive number");
    }

    const before = clone(hero);
    hero.Lvl += safeLevels;
    hero.StatUpPoints += safeLevels * 5;

    return {
        before,
        after: clone(hero),
        levelsAdded: safeLevels,
        statPointsGained: safeLevels * 5
    };
}

function addHeroXp(hero, xpDelta) {
    normalizeHeroProgression(hero);

    const safeXpDelta = Math.floor(Number(xpDelta));
    if (!Number.isFinite(safeXpDelta) || safeXpDelta <= 0) {
        return null;
    }

    const before = clone(hero);
    hero.Xp += safeXpDelta;

    return {
        before,
        after: clone(hero),
        xpDelta: safeXpDelta
    };
}

function getHeroCollections(profile) {
    return ["equipmentHeroes", "heroesBought"].map((location) => ({
        location,
        heroes: Array.isArray(profile[location]) ? profile[location] : []
    }));
}

function findHero(profile, identity) {
    for (const collection of getHeroCollections(profile)) {
        const hero = collection.heroes.find((candidate) => sameHero(candidate, identity));
        if (hero) {
            return { hero, location: collection.location };
        }
    }

    return null;
}


module.exports = {
    addHeroXp,
    clone,
    findHero,
    getHeroCollections,
    getHeroIdentity,
    levelUpHero,
    sameHero
};
