const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scripts = ['config', 'score', 'runtime', 'game_model', 'war_logic']
    .map(name => fs.readFileSync(path.join(__dirname, '../js', `${name}.js`), 'utf8')).join('\n');

// Uses real game actions, prices, production, combat and timers. No free resources,
// enemy stalling or state restoration. At most four enemy clicks per real second
// and one construction/upgrade action per second; deposits are collected each second.
// Collection is idealized: every available deposit is picked up at that interval.
function simulateBalance(seed, options = {}) {
    const context = vm.createContext({ options, seed });
    vm.runInContext(scripts, context);
    return JSON.parse(vm.runInContext(`
        if (options.grassPerSpawn) GAME_CONFIG.grassPerSpawn = options.grassPerSpawn;
        if (options.quarryYield) GAME_CONFIG.quarryStonePerLevel = options.quarryYield;
        if (options.treeSeedCosts) {
            GAME_CONFIG.treeUpgradeSeedCosts = options.treeSeedCosts;
        }
        initializeGameModel(seed, 1700000000000);
        gameState.gameStarted = true;
        startScore('balance');
        setSimulationPaused(false, 0);
        const initialResources = {
            grass: gameState.tiles.filter(tile => tile.object?.type === 'grass').length,
            stone: gameState.tiles.filter(tile => tile.object?.type === 'stone').length,
            seedsAvailable: gameState.tiles.reduce((sum, tile) => sum + (tile.object?.type === 'grass' ? tile.object.size : 0), 0),
            stoneAvailable: gameState.tiles.reduce((sum, tile) => sum + (tile.object?.type === 'stone' ? tile.object.size : 0), 0)
        };
        const trees = [0, 10, 20, 30, 40];
        const quarries = [1, 11, 21, 31, 41];
        const cannons = [2, 3, 12, 13, 22, 23, 32, 33, 42, 43];
        const walls = [4, 14, 24, 34, 44];
        let firstMax = null;
        let finalPreparation = null;
        let lastPreparation = null;
        let hits = 0;
        const milestones = {};
        const preparations = [];
        function buy(ids, type) {
            for (const id of ids) {
                if (!gameState.tiles[id].object && placeItem(id, type)) return true;
            }
            return false;
        }
        function upgrade(ids) {
            const ordered = [...ids].sort((a, b) =>
                (gameState.tiles[a].object?.level ?? 1) - (gameState.tiles[b].object?.level ?? 1));
            for (const id of ordered) {
                const object = gameState.tiles[id].object;
                if (object && upgradeBuilding(id, object.id)) return true;
            }
            return false;
        }
        function isMaxed() {
            return [...trees, ...quarries, ...cannons].every(id => gameState.tiles[id].object?.level === 5) &&
                walls.every(id => gameState.tiles[id].object?.type === 'stoneWall');
        }
        function report(real) {
            return { realSeconds: real / 1000, wave: gameState.level, preparation: !gameState.isInvasionActive,
                maxed: isMaxed(), stone: gameState.stoneCount, seeds: gameState.seedCount, wood: gameState.woodCount,
                trees: trees.map(id => gameState.tiles[id].object?.level ?? 0),
                quarries: quarries.map(id => gameState.tiles[id].object?.level ?? 0),
                cannons: cannons.map(id => gameState.tiles[id].object?.level ?? 0) };
        }
        function build() {
            for (const id of walls) {
                const object = gameState.tiles[id].object;
                if (object && object.hp <= 12.5 && repairBuilding(id, object.id)) return;
            }
            const economyEnabled = gameState.level >= (options.economyDelayWave ?? 1);
            if (economyEnabled) {
                if (buy(trees, 'seedling') || buy(quarries, 'quarry')) return;
                if (upgrade(trees) || upgrade(quarries)) return;
            }
            if (buy(cannons, 'cannon') || buy(walls, 'stoneWall') || upgrade(cannons)) return;
        }
        let real = 0;
        for (real = 250; real <= 3600000 && !gameState.gameEnded; real += 250) {
            advanceGameTo(real);
            if (gameState.gameEnded) break;
            if (real % (options.collectionInterval ?? 1000) === 0) {
                for (const tile of gameState.tiles) {
                    if (['grass', 'stone'].includes(tile.object?.type)) collectResource(tile.id);
                }
            }
            if (real % 1000 === 0) {
                build();
                for (const type of ['seedling', 'tree', 'quarry', 'cannon']) {
                    if (!milestones[type] && gameState.tiles.some(tile => tile.object?.type === type)) {
                        milestones[type] = { realSeconds: real / 1000, simulationSeconds: getGameTime() / 1000, wave: gameState.level };
                    }
                }
            }
            const enemy = [...gameState.activeEnemies].sort((a, b) => b.offsetX - a.offsetX)[0];
            if (enemy && real % (options.clickInterval ?? 250) === 0) { damageEnemy(enemy, 2); hits++; }
            if (gameState.gameEnded) break;
            if (!firstMax && isMaxed()) firstMax = report(real);
            if (!gameState.isInvasionActive && !preparations.some(entry => entry.wave === gameState.level)) preparations.push(report(real));
            if (gameState.level === 10 && !gameState.isInvasionActive) {
                finalPreparation ??= report(real);
                lastPreparation = report(real);
            }
        }
        JSON.stringify({ seed, status: scoreState.status, initialResources, preparations, firstMax, finalPreparation, lastPreparation, hits, milestones,
            end: report(currentRealTime) });
    `, context));
}

module.exports = { simulateBalance };
