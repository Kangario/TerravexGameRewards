class RewardRepository {
    constructor(redis) {
        this.redis = redis;
    }

    async enqueue(playerId, reward) {
        await this.redis.rPush(this.getQueueKey(playerId), JSON.stringify(reward));
    }

    async claim(playerId) {
        const rawReward = await this.redis.lPop(this.getQueueKey(playerId));
        return rawReward ? JSON.parse(rawReward) : null;
    }

    async list(playerId) {
        const rewards = await this.redis.lRange(this.getQueueKey(playerId), 0, -1);
        return rewards.map((reward) => JSON.parse(reward));
    }

    getQueueKey(playerId) {
        return `user:${playerId}:rewards`;
    }
}

module.exports = { RewardRepository };
