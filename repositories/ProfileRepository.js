const USER_PROFILE_KEY_CANDIDATES = [
    (userId) => `user:${userId}:profile`,
    (userId) => `user:${userId}`,
    (userId) => `profile:${userId}`,
    (userId) => `player:${userId}`,
    (userId) => userId
];

function parseRawProfile(type, rawValue) {
    if (!rawValue) {
        return null;
    }

    if (type === "string") {
        const parsed = JSON.parse(rawValue);
        return parsed?.profile && typeof parsed.profile === "object" ? parsed.profile : parsed;
    }

    if (type === "hash") {
        return rawValue;
    }

    return null;
}

class ProfileRepository {
    constructor(redis) {
        this.redis = redis;
    }

    async load(userId) {
        for (const getKey of USER_PROFILE_KEY_CANDIDATES) {
            const key = getKey(userId);
            const type = await this.redis.type(key);

            if (type === "none") {
                continue;
            }

            if (type === "string") {
                const profile = parseRawProfile(type, await this.redis.get(key));
                if (profile && typeof profile === "object") {
                    return { key, profile, storageType: type };
                }
            }

            if (type === "hash") {
                const rawHash = await this.redis.hGetAll(key);
                if (Object.keys(rawHash).length > 0) {
                    return { key, profile: parseRawProfile(type, rawHash), storageType: type };
                }
            }
        }

        return null;
    }

    async save(loadedProfile) {
        if (loadedProfile.storageType === "hash") {
            await this.redis.hSet(loadedProfile.key, loadedProfile.profile);
            return;
        }

        await this.redis.set(loadedProfile.key, JSON.stringify(loadedProfile.profile));
    }

    async updateUsernameIndex({ userId, previousUsername, nextUsername, loadedProfile }) {
        const previousKey = this.getUsernameIndexKey(previousUsername);
        const nextKey = this.getUsernameIndexKey(nextUsername);

        await this.redis.watch(nextKey);
        const existingUserId = await this.redis.get(nextKey);

        if (existingUserId && existingUserId !== userId) {
            await this.redis.unwatch();
            return { ok: false, conflict: true };
        }

        const tx = this.redis.multi();

        if (loadedProfile.storageType === "hash") {
            tx.hSet(loadedProfile.key, loadedProfile.profile);
        } else {
            tx.set(loadedProfile.key, JSON.stringify(loadedProfile.profile));
        }

        tx.set(nextKey, userId);
        tx.del(previousKey);

        return { ok: Boolean(await tx.exec()), conflict: false };
    }

    getUsernameIndexKey(username) {
        return `username_index:${String(username).toLowerCase()}`;
    }
}

module.exports = { ProfileRepository };
