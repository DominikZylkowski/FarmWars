// Adapter przechowywania. Interfejs korzysta tylko z asynchronicznego rankingRepository.
const RANKING_STORAGE_KEY = 'farmwarsRankingV1';
let rankingWriteQueue = Promise.resolve();

function isRecord(value) {
    return value !== null && typeof value === 'object' && Object.prototype.toString.call(value) === '[object Object]';
}

function isRankingId(value) {
    return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
}

function isStoredNickname(value) {
    // Zachowujemy również stare nazwy, które były dopuszczone przed audytem.
    return typeof value === 'string' && value === value.trim() &&
        Array.from(value).length >= 3 && Array.from(value).length <= 20;
}

function createPlayerId() {
    return createLocalId('player');
}

function validateNickname(value) {
    if (typeof value !== 'string') throw new Error('Podaj nazwę gracza.');
    const nickname = value.trim();
    const length = Array.from(nickname).length;
    if (length < 3 || length > 20) throw new Error('Nazwa gracza musi mieć od 3 do 20 znaków.');
    if (/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(nickname)) {
        throw new Error('Nazwa zawiera niedozwolone znaki sterujące.');
    }
    return nickname;
}

function validateSpeedStatistics(summary) {
    const history = summary.speedHistory;
    const isTime = value => Number.isFinite(value) && value >= 0;
    const near = (a, b) => Math.abs(a - b) <= 0.000001 * Math.max(1, Math.abs(a), Math.abs(b));
    if (!GAME_CONFIG.gameSpeeds.includes(summary.initialGameSpeed) ||
        !GAME_CONFIG.gameSpeeds.includes(summary.gameSpeed) || !isTime(summary.simulationTimeSeconds) ||
        !Array.isArray(history) || history.length === 0) throw new Error('Nieprawidłowa historia szybkości.');
    let previous = null;
    for (const entry of history) {
        if (!isRecord(entry) || Object.keys(entry).length !== 3 ||
            !['gameSpeed', 'atActiveSeconds', 'atSimulationSeconds'].every(key => Object.hasOwn(entry, key)) ||
            !GAME_CONFIG.gameSpeeds.includes(entry.gameSpeed) || !isTime(entry.atActiveSeconds) ||
            !isTime(entry.atSimulationSeconds) || entry.atActiveSeconds > summary.activeTimeSeconds) {
            throw new Error('Nieprawidłowa historia szybkości.');
        }
        if (!previous) {
            if (entry.atActiveSeconds !== 0 || entry.atSimulationSeconds !== 0 || entry.gameSpeed !== summary.initialGameSpeed) {
                throw new Error('Nieprawidłowy początek historii szybkości.');
            }
        } else if (entry.atActiveSeconds < previous.atActiveSeconds || entry.gameSpeed === previous.gameSpeed ||
            !near(entry.atSimulationSeconds, previous.atSimulationSeconds +
                (entry.atActiveSeconds - previous.atActiveSeconds) * previous.gameSpeed)) {
            throw new Error('Niespójna historia szybkości.');
        }
        previous = entry;
    }
    if (previous.gameSpeed !== summary.gameSpeed || !near(summary.simulationTimeSeconds,
        previous.atSimulationSeconds + (summary.activeTimeSeconds - previous.atActiveSeconds) * previous.gameSpeed)) {
        throw new Error('Czas symulacji nie zgadza się z historią szybkości.');
    }
    return {
        initialGameSpeed: summary.initialGameSpeed, gameSpeed: summary.gameSpeed,
        simulationTimeSeconds: summary.simulationTimeSeconds,
        speedHistory: history.map(entry => ({ ...entry }))
    };
}

function validateScoreSummary(summary) {
    if (!isRecord(summary) || !['won', 'lost'].includes(summary.status) || !isRankingId(summary.runId) ||
        typeof summary.finishedAt !== 'string' || !Number.isFinite(Date.parse(summary.finishedAt)) ||
        new Date(summary.finishedAt).toISOString() !== summary.finishedAt) {
        throw new Error('Można zapisać tylko wynik zakończonej rozgrywki.');
    }
    const isCount = value => Number.isSafeInteger(value) && value >= 0;
    const rules = GAME_CONFIG.scoring;
    const countMaps = { items: summary.itemsByType, enemies: summary.enemiesByType, resources: summary.resourcesByType };
    const expected = { time: 0, items: 0, enemies: 0, resources: 0 };
    if (![1, 2, 3].includes(summary.schemaVersion) || summary.rulesetId !== GAME_CONFIG.rulesetId ||
        !Number.isFinite(summary.activeTimeSeconds) || summary.activeTimeSeconds < 0 ||
        summary.activeTimeSeconds > Number.MAX_SAFE_INTEGER / 1000 || !isRecord(summary.points)) {
        throw new Error('Nieprawidłowe statystyki wyniku.');
    }
    const speedStatistics = summary.schemaVersion >= 2 ? validateSpeedStatistics(summary) : {};
    const scoringTime = summary.schemaVersion === 3 ? speedStatistics.simulationTimeSeconds : summary.activeTimeSeconds;
    expected.time = Math.floor(scoringTime) * rules.pointsPerSecond;
    for (const [category, counts] of Object.entries(countMaps)) {
        if (!isRecord(counts)) throw new Error('Nieprawidłowe statystyki wyniku.');
        for (const [type, count] of Object.entries(counts)) {
            if (!Object.hasOwn(rules[category], type) || !isCount(count)) throw new Error('Nieprawidłowe statystyki wyniku.');
            expected[category] += count * rules[category][type];
        }
        const totalField = { items: 'itemsCrafted', enemies: 'enemiesDefeated', resources: 'resourcesCollected' }[category];
        if (!isCount(summary[totalField]) || summary[totalField] !== Object.values(counts).reduce((sum, count) => sum + count, 0)) {
            throw new Error('Niespójne liczniki wyniku.');
        }
    }
    if (Object.keys(summary.points).length !== 4 || Object.entries(expected).some(([category, points]) =>
        !Object.hasOwn(summary.points, category) || !isCount(points) || summary.points[category] !== points) || !isCount(summary.totalScore) ||
        summary.totalScore !== Object.values(expected).reduce((sum, points) => sum + points, 0)) {
        throw new Error('Score nie zgadza się ze statystykami.');
    }
    // Zamknięta lista pól; nie kopiujemy dowolnych właściwości przekazanych przez wywołującego.
    return JSON.parse(JSON.stringify({
        schemaVersion: summary.schemaVersion, rulesetId: summary.rulesetId,
        runId: summary.runId, finishedAt: summary.finishedAt, totalScore: summary.totalScore,
        activeTimeSeconds: summary.activeTimeSeconds, itemsCrafted: summary.itemsCrafted,
        enemiesDefeated: summary.enemiesDefeated, resourcesCollected: summary.resourcesCollected,
        itemsByType: summary.itemsByType, enemiesByType: summary.enemiesByType,
        resourcesByType: summary.resourcesByType, points: summary.points, status: summary.status,
        ...speedStatistics
    }));
}

function readRankingData() {
    try {
        const raw = window.localStorage.getItem(RANKING_STORAGE_KEY);
        if (raw === null) return { version: 1, players: [], results: [], lastPlayerId: null };
        const data = JSON.parse(raw);
        if (!isRecord(data) || data.version !== 1 || !Array.isArray(data.players) || !Array.isArray(data.results)) {
            throw new Error();
        }
        const playerIds = new Set();
        for (const player of data.players) {
            if (!isRecord(player) || !isRankingId(player.playerId) || playerIds.has(player.playerId) ||
                !isStoredNickname(player.nickname)) throw new Error();
            playerIds.add(player.playerId);
        }
        const runIds = new Set();
        for (const result of data.results) {
            // Stare wyniki nie muszą zawierać nowych pól ani podlegać aktualnym stawkom.
            if (!isRecord(result) || !isRankingId(result.runId) || runIds.has(result.runId) ||
                !playerIds.has(result.playerId) || !isStoredNickname(result.nickname) ||
                !Number.isSafeInteger(result.totalScore) || result.totalScore < 0 ||
                !['won', 'lost'].includes(result.status) || typeof result.finishedAt !== 'string' ||
                !Number.isFinite(Date.parse(result.finishedAt))) throw new Error();
            runIds.add(result.runId);
            if (Object.hasOwn(result, 'points') && (!isRecord(result.points) ||
                Object.entries(result.points).some(([category, value]) => !['time', 'items', 'enemies', 'resources'].includes(category) ||
                    !Number.isSafeInteger(value) || value < 0) ||
                Object.values(result.points).reduce((sum, value) => sum + value, 0) !== result.totalScore)) throw new Error();
        }
        return data;
    } catch (error) {
        throw new Error('Nie można odczytać rankingu. Sprawdź dostęp do pamięci przeglądarki.');
    }
}

const rankingRepository = {
    startRun(clientRunId) {
        return onlineRanking?.register(clientRunId);
    },
    async getLastNickname() {
        if (onlineRanking) return onlineRanking.getLastNickname();
        const data = readRankingData();
        return data.players.find(player => player.playerId === data.lastPlayerId)?.nickname || '';
    },

    async saveResult(nickname, summary) {
        nickname = validateNickname(nickname);
        summary = validateScoreSummary(summary);
        if (onlineRanking) return onlineRanking.saveResult(nickname, summary);
        const save = () => saveLocalResult(nickname, summary);
        // Web Locks serializuje zapis również między kartami tej samej witryny.
        const write = async () => {
            if (typeof navigator === 'undefined' || !navigator.locks?.request) return save();
            try {
                return await navigator.locks.request(RANKING_STORAGE_KEY, save);
            } catch (error) {
                // Niektóre konteksty file:// udostępniają API, ale odmawiają blokady.
                if (error.name === 'SecurityError' || error.name === 'NotSupportedError') return save();
                throw error;
            }
        };
        const pending = rankingWriteQueue.then(write);
        rankingWriteQueue = pending.catch(() => {});
        return pending;
    },

    async getHistory() {
        return onlineRanking ? onlineRanking.getHistory() : readRankingData().results;
    },

    async getLeaderboard() {
        const best = new Map();
        for (const result of await this.getHistory()) {
            const key = result.validationLevel === 'server_simulated' ? `online:${result.playerId}` : result.playerId;
            const previous = best.get(key);
            if (!previous || result.totalScore > previous.totalScore) best.set(key, result);
        }
        return Array.from(best.values()).sort((a, b) => b.totalScore - a.totalScore);
    }
};

function saveLocalResult(nickname, summary) {
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
}

const onlineRanking = (() => {
    const location = window.location;
    if (!location || !['http:', 'https:'].includes(location.protocol) ||
        window.document?.head?.querySelector('meta[name="farmwars-local-only"]') ||
        new URLSearchParams(location.search).get('mode') === 'local') return null;

    let session;
    const runs = new Map();

    async function request(action, { body, csrf, offset } = {}) {
        const url = new URL('./api/index.php', location.href);
        url.searchParams.set('action', action);
        if (offset !== undefined) url.searchParams.set('offset', offset);
        const headers = { Accept: 'application/json' };
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        if (csrf) headers['X-CSRF-Token'] = csrf;
        let response;
        let data;
        try {
            response = await fetch(url, {
                method: body === undefined ? 'GET' : 'POST',
                credentials: 'same-origin',
                headers,
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: AbortSignal.timeout(10000)
            });
            data = await response.json();
        } catch {
            throw new Error('Zapis online jest niedostępny. Spróbuj ponownie lub otwórz grę z ?mode=local.');
        }
        if (!response.ok) throw new Error(data.error || 'Nie udało się wykonać operacji online.');
        return data;
    }

    function getSession() {
        if (!session) {
            session = request('session', { body: {} }).catch(error => {
                session = null;
                throw error;
            });
        }
        return session;
    }

    async function mutate(action, body) {
        const { csrf } = await getSession();
        return request(action, { body, csrf });
    }

    function register(clientRunId) {
        if (!runs.has(clientRunId)) {
            runs.set(clientRunId, mutate('start', { clientRunId }).catch(error => {
                runs.delete(clientRunId);
                throw error;
            }));
        }
        return runs.get(clientRunId);
    }

    async function getHistory() {
        await getSession();
        const results = [];
        let offset = 0;
        do {
            const page = await request('history', { offset });
            results.push(...page.results);
            offset = page.nextOffset;
        } while (offset !== null);
        return results;
    }

    return {
        register,
        getHistory,
        async getLastNickname() {
            await getSession();
            const { results } = await request('history');
            return results[0]?.nickname || '';
        },
        async saveResult(nickname, summary) {
            const { runId } = await register(summary.runId);
            return mutate('result', { runId, nickname, summary });
        }
    };
})();
