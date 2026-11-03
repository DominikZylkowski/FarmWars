// Adapter przechowywania. Interfejs korzysta tylko z asynchronicznego rankingRepository.
const RANKING_STORAGE_KEY = 'farmwarsRankingV1';

function createPlayerId() {
    return typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID() : `player-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function validateNickname(value) {
    const nickname = value.trim();
    const length = Array.from(nickname).length;
    if (length < 3 || length > 20) throw new Error('Nazwa gracza musi mieć od 3 do 20 znaków.');
    return nickname;
}

function readRankingData() {
    try {
        const raw = window.localStorage.getItem(RANKING_STORAGE_KEY);
        if (raw === null) return { version: 1, players: [], results: [], lastPlayerId: null };
        const data = JSON.parse(raw);
        if (data.version !== 1 || !Array.isArray(data.players) || !Array.isArray(data.results) ||
            !data.players.every(player => typeof player.playerId === 'string' && typeof player.nickname === 'string') ||
            !data.results.every(result => typeof result.runId === 'string' && typeof result.playerId === 'string' &&
                typeof result.nickname === 'string' && Number.isFinite(result.totalScore) && result.totalScore >= 0 &&
                ['won', 'lost'].includes(result.status) && Number.isFinite(Date.parse(result.finishedAt)))) {
            throw new Error();
        }
        return data;
    } catch (error) {
        throw new Error('Nie można odczytać rankingu. Sprawdź dostęp do pamięci przeglądarki.');
    }
}

const rankingRepository = {
    async getLastNickname() {
        const data = readRankingData();
        return data.players.find(player => player.playerId === data.lastPlayerId)?.nickname || '';
    },

    async saveResult(nickname, summary) {
        nickname = validateNickname(nickname);
        if (!['won', 'lost'].includes(summary.status) || !summary.runId ||
            !Number.isFinite(summary.totalScore) || summary.totalScore < 0 ||
            !Number.isFinite(Date.parse(summary.finishedAt))) {
            throw new Error('Można zapisać tylko wynik zakończonej rozgrywki.');
        }
        const data = readRankingData();
        if (data.results.some(result => result.runId === summary.runId)) {
            throw new Error('Wynik tej rozgrywki został już zapisany.');
        }
        // Lokalne profile mają osobne identyfikatory. Nick nie jest kluczem wyniku ani identyfikatorem globalnym.
        let player = data.players.find(profile => profile.nickname === nickname);
        if (!player) {
            player = { playerId: createPlayerId(), nickname };
            data.players.push(player);
        }
        const result = JSON.parse(JSON.stringify({ ...summary, playerId: player.playerId, nickname, savedAt: new Date().toISOString() }));
        data.results.push(result);
        data.lastPlayerId = player.playerId;
        try {
            window.localStorage.setItem(RANKING_STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            throw new Error('Nie udało się zapisać wyniku. Sprawdź dostępne miejsce i ustawienia pamięci przeglądarki.');
        }
        return result;
    },

    async getHistory() {
        return readRankingData().results;
    },

    async getLeaderboard() {
        const best = new Map();
        for (const result of await this.getHistory()) {
            const previous = best.get(result.playerId);
            if (!previous || result.totalScore > previous.totalScore) best.set(result.playerId, result);
        }
        return Array.from(best.values()).sort((a, b) => b.totalScore - a.totalScore);
    }
};
