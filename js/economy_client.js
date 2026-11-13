function createEconomyClient(baseUrl, fetchRequest = fetch) {
    let csrf;
    let state;
    let pending;
    let busy = false;

    async function request(path, body) {
        const headers = { Accept: 'application/json' };
        if (body !== undefined) {
            headers['Content-Type'] = 'application/json';
            if (csrf) headers['X-CSRF-Token'] = csrf;
        }
        let response;
        let envelope;
        try {
            response = await fetchRequest(new URL(path, baseUrl), {
                method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers,
                body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000)
            });
            envelope = await response.json();
        } catch {
            throw new Error('Brak odpowiedzi API ekonomii. Spróbuj ponownie.');
        }
        if (!response.ok || envelope.ok !== true) {
            const error = new Error(envelope.error?.message || 'Operacja ekonomii nie powiodła się.');
            error.code = envelope.error?.code;
            error.status = response.status;
            throw error;
        }
        return envelope.data;
    }

    function accept(next) {
        if (!state || (state.runId === next.runId && next.revision >= state.revision)) state = next;
        return state;
    }

    async function refresh(runId = state.runId) {
        return accept(await request(`runs/${runId}/state`));
    }

    async function exclusively(work) {
        if (busy) return;
        busy = true;
        try {
            return await work();
        } finally {
            busy = false;
        }
    }

    async function send(command, retry) {
        let result;
        try {
            result = await request(`runs/${state.runId}/commands`, command);
        } catch (error) {
            if (error.status && error.status < 500 && error.status !== 429) pending = undefined;
            if (error.code === 'REVISION_CONFLICT' || error.code === 'SIMULATION_CATCH_UP' ||
                (state.mode === 'online' && error.status === 422)) {
                await refresh();
                error.message += ' Odświeżono stan. Oceń akcję i wykonaj ją ponownie, jeśli nadal ma sens.';
            }
            throw error;
        }
        pending = undefined;
        if (retry || result.previousRevision !== state.revision) return refresh();
        const changes = new Map(result.changes.tiles.map(tile => [tile.id, tile]));
        return accept({
            ...state, ...result.changes, revision: result.revision,
            tiles: state.tiles.map(tile => changes.get(tile.id) || tile)
        });
    }

    return {
        get state() { return state; },
        get busy() { return busy; },
        get pending() { return Boolean(pending); },
        open(pointer) {
            return exclusively(async () => {
                csrf = (await request('session', {})).csrf;
                if (pointer.runId) return refresh(pointer.runId);
                const body = { requestId: pointer.requestId };
                if (pointer.mode) body.mode = pointer.mode;
                const created = await request('runs', body);
                // Powtórka startu zwraca pierwotny stan. GET dostarcza bieżący.
                pointer.runId = created.runId;
                return refresh(created.runId);
            });
        },
        refresh() {
            return exclusively(() => refresh());
        },
        command(type, payload, commandId) {
            if (pending || !state) return;
            return exclusively(() => {
                pending = { commandId, expectedRevision: state.revision, type, payload };
                return send(pending, false);
            });
        },
        retry() {
            if (pending) return exclusively(() => send(pending, true));
        }
    };
}

function economyTileId(index) {
    return `tile_${Math.floor(index / GAME_CONFIG.columns)}_${index % GAME_CONFIG.columns}`;
}

function showServerGameLinks() {
    if (!onlineRanking) return;
    const menu = document.getElementById('gameMenu');
    if (!menu) return;
    const note = document.createElement('p');
    note.textContent = 'Bieżący tryb rozlicza grę w przeglądarce i zapisuje wyniki niezweryfikowane.';
    const link = document.createElement('a');
    link.href = '?mode=economy';
    link.textContent = 'Podgląd ekonomii serwerowej';
    const online = document.createElement('a');
    online.href = '?mode=online';
    online.textContent = 'Pełna gra online';
    menu.append(note, online, link);
}

function projectEconomyState(state) {
    gameState.seedCount = state.resources.seeds;
    gameState.stoneCount = state.resources.stones;
    gameState.woodCount = state.resources.wood;
    gameState.gameSpeed = state.gameSpeed;
    gameState.gamePaused = state.paused;
    gameState.prepTime = Math.ceil((state.preparationMs - state.simulationMs) / 1000);
    for (const tile of state.tiles) {
        const object = tile.resource
            ? { id: tile.resource.id, type: tile.resource.kind, size: tile.resource.size, hp: 0 }
            : tile.object && { id: tile.object.id, type: tile.object.kind, hp: tile.object.hp, growthAt: tile.object.growthAtMs,
                lastShot: tile.object.lastShot, lastDamagedAt: tile.object.lastDamagedAt };
        gameState.tiles[tile.row * GAME_CONFIG.columns + tile.column].object = object;
    }
}

const serverGame = (() => {
    const location = window.location;
    if (!location || !['http:', 'https:'].includes(location.protocol) ||
        window.document?.head?.querySelector('meta[name="farmwars-local-only"]')) return null;
    const mode = new URLSearchParams(location.search).get('mode');
    if (!['economy', 'online'].includes(mode)) return null;
    const isOnline = mode === 'online';

    const client = createEconomyClient(new URL('./api/v1/', location.href));
    const storageKey = isOnline ? 'farmwarsOnlineV1' : 'farmwarsEconomyPreviewV1';
    const queue = [];
    let draining = false;
    let pointer;
    let message;
    let retry;
    let startButton;

    function project() {
        if (!client.state) return;
        const pauseChanged = gameState.gamePaused !== client.state.paused;
        projectEconomyState(client.state);
        if (isOnline) {
            const state = client.state;
            gameState.prepTime = Math.ceil(state.preparationRemainingMs / 1000);
            gameState.level = state.level;
            gameState.isInvasionActive = state.phase === 'combat';
            gameState.enemiesDefeated = state.defeated;
            gameState.totalEnemiesInWave = state.waveTotal;
            gameState.activeEnemies = state.enemies;
            gameState.activeProjectiles = state.projectiles;
            gameState.gameEnded = Boolean(state.summary);
            simulatedUntil = state.simulationMs;
            scoreState.runId = state.runId;
            scoreState.totalScore = state.score.totalScore;
            scoreState.status = state.summary?.status || 'active';
        }
        updateGameSpeedUI();
        renderGameState();
        if (client.state.phase === 'combat_boundary') {
            startButton.disabled = true;
            syncPauseView(true, false);
            message.textContent = 'Koniec podglądu przed walką. Możesz przejść do pełnej gry online.';
        } else if (pauseChanged && !gameState.gameEnded) {
            syncPauseView(client.state.paused, true);
        }
    }

    async function run(work) {
        if (client.busy) return;
        try {
            const state = await work();
            if (state) {
                message.textContent = isOnline
                    ? (state.catchingUp ? 'Serwer rozlicza zaległą rozgrywkę…' : 'Pełna gra online')
                    : 'Podgląd ekonomii online. Bez walki i zapisu wyniku.';
                project();
            }
            return true;
        } catch (error) {
            project();
            message.textContent = error.message;
            return false;
        } finally {
            retry.hidden = !client.pending;
        }
    }

    async function drain() {
        if (draining || client.busy || client.pending || client.state?.catchingUp || gameState.gameEnded) return;
        draining = true;
        try {
            while (queue.length && !gameState.gameEnded) {
                const { type, payload } = queue.shift();
                if (!await run(() => client.command(type, payload, createLocalId('command')))) {
                    queue.length = 0;
                    break;
                }
            }
        } finally {
            draining = false;
        }
    }

    function command(type, payload = {}) {
        if (!client.state || !['preparation', 'combat'].includes(client.state.phase)) return;
        if (client.pending && !client.busy) {
            message.textContent = 'Najpierw ponów komendę, której wyniku nie udało się potwierdzić.';
            return;
        }
        if (!isOnline) return run(() => client.command(type, payload, createLocalId('command')));
        if (client.state.catchingUp || queue.length >= 12) {
            message.textContent = 'Zaczekaj na rozliczenie rozgrywki i potwierdzenie poprzednich akcji.';
            return;
        }
        queue.push({ type, payload });
        return drain();
    }

    function restart() {
        if (client.busy) return;
        safeSetStoredValue(storageKey, JSON.stringify({ requestId: createLocalId('run') }));
        window.location.reload();
    }

    async function open() {
        await run(async () => {
            try {
                return await client.open(pointer);
            } finally {
                safeSetStoredValue(storageKey, JSON.stringify(pointer));
            }
        });
    }

    function setup() {
        gameTimers.clear();
        for (const tile of gameState.tiles) tile.object = null;
        gameState.gameStarted = true;
        gameState.gamePaused = true;
        try { pointer = JSON.parse(safeGetStoredValue(storageKey)); } catch { pointer = null; }
        if (!pointer?.requestId) pointer = { requestId: createLocalId('preview') };
        if (isOnline) pointer.mode = 'online';
        safeSetStoredValue(storageKey, JSON.stringify(pointer));

        const controls = document.createElement('div');
        message = document.createElement('p');
        message.setAttribute('role', 'status');
        message.textContent = 'Łączenie z serwerem…';
        retry = document.createElement('button');
        retry.type = 'button';
        retry.textContent = 'Ponów tę samą komendę';
        retry.hidden = true;
        retry.onclick = () => run(() => client.retry());
        const fullGame = document.createElement('a');
        fullGame.href = isOnline ? './' : '?mode=online';
        fullGame.textContent = isOnline ? 'Gra z walką lokalną' : 'Pełna gra online';
        const newRun = document.createElement('button');
        newRun.type = 'button';
        newRun.textContent = isOnline ? 'Nowa gra online' : 'Nowy podgląd';
        newRun.onclick = restart;
        controls.append(message, retry, fullGame, newRun);
        document.getElementById('appScale').prepend(controls);
        startButton = document.getElementById('startGameButton');
        startButton.onclick = () => {
            if (!client.state) return open();
            if (isOnline && client.state.paused && client.state.simulationMs === 0 &&
                !gameState.tutorialCompleted && !gameState.tutorialVisible) {
                document.getElementById('gameMenu')?.classList.add('is-hidden');
                showTutorial();
                return;
            }
            return command(client.state.paused ? 'resume' : 'pause');
        };
        syncPauseView(true, true);
        open();
        let nextPoll = 0;
        setInterval(async () => {
            const state = client.state;
            if (!state || document.hidden || client.busy || client.pending || gameState.gameEnded ||
                performance.now() < nextPoll || !['preparation', 'combat'].includes(state.phase)) return;
            const ok = await run(() => client.refresh());
            nextPoll = performance.now() + (!ok ? 2000 : state.paused ? 1600 : 0);
            await drain();
        }, isOnline ? 400 : 2000);
    }

    return {
        setup, isOnline, restart,
        pause: shouldPause => client.state?.paused === shouldPause ? undefined : command(shouldPause ? 'pause' : 'resume'),
        speed(speed) {
            updateGameSpeedUI();
            command('set_speed', { speed });
        },
        action(action) {
            if (isOnline && action.type === 'hit') command('hit_enemy', { enemyId: action.enemyId });
            if (action.type === 'collect') command('collect', { tileId: economyTileId(action.tileId) });
            if (action.type === 'place') command('place', { tileId: economyTileId(action.tileId), itemType: action.item });
        }
    };
})();
