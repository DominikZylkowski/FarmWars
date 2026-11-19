// ------------------------- Konfiguracja gry -------------------------
const GAME_CONFIG = {
    rulesetId: 'farmwars-1',
    freeLocalPurchases: false,
    baseGameSpeed: 1.1,
    removalRefundRate: 0.25,
    preparationSeconds: 120,
    gameSpeeds: Object.freeze([0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3]),
    rows: 5,
    columns: 10,
    tileClassNames: ['game-tile--light', 'game-tile--dark'],
    baseGrassCount: 6,
    grassPerSpawn: 3,
    grassSizeThresholds: [0.75, 1],
    baseStoneCount: 11,
    firstWaveStoneLimit: 28,
    spawnIntervals: {
        grass: 10000,
        stone: 25000  
    },
    treeGrowthTime: 15000,
    treeProductionInterval: 15000,
    treeWoodPerLevel: [6, 8, 10, 12, 15],
    quarryProductionInterval: 15000,
    // Wczesne inwestycje w produkcję pozwalają domknąć pełny rozwój przed 10. falą.
    quarryStonePerLevel: [7, 11, 17, 23, 28],
    producerUpgradeCosts: [25, 50, 75, 100],
    treeUpgradeSeedCosts: [4, 8, 12, 16],
    hpValues: { 
        tree: 5, 
        cannon: 10, 
        woodFence: 8, 
        stoneWall: 25,
        quarry: 25,
        worm: 10,
        worm_boss: 30 
    },
    waves: {
        1: { normal: 5, boss: 0 },
        2: { normal: 10, boss: 0 },
        3: { normal: 15, boss: 1 },
        4: { normal: 20, boss: 2 },
        5: { normal: 25, boss: 3 },
        6: { normal: 30, boss: 5 },
        7: { normal: 35, boss: 7 },
        8: { normal: 40, boss: 10 },
        9: { normal: 45, boss: 15 },
        10: { normal: 50, boss: 20 }
    },
    enemySpeed: 0.6875,
    bossSpeed: 0.5625,
    bossMasterMultiplier: 2.5,
    projectileSpeed: 4, 
    cannonDamage: 3,
    cannonDamagePerLevel: [3, 4, 5, 6, 8],
    cannonUpgradeCosts: [50, 100, 150, 200],
    scoring: {
        pointsPerSecond: 1,
        items: { cannon: 10, seedling: 10, woodFence: 10, stoneWall: 10 },
        enemies: { normal: 20, boss: 35 },
        resources: { tree: 12 }
    }
};

function createGameState() {
    const prepTime = GAME_CONFIG.preparationSeconds;
    const timedStoneDeposits = Math.ceil(prepTime * 1000 / GAME_CONFIG.spawnIntervals.stone) - 1;
    return {
        gameStarted: false,
        level: 1,
        seedCount: 0,
        stoneCount: 0,
        woodCount: 0,
        prepTime,
        firstWaveStoneBonus: Math.max(0, GAME_CONFIG.firstWaveStoneLimit - GAME_CONFIG.baseStoneCount - timedStoneDeposits),
        gamePaused: true,
        gameEnded: false,
        isInvasionActive: false,
        enemiesDefeated: 0,
        totalEnemiesInWave: 0,
        tiles: [],
        geometry: { tileWidth: 100, columnPitch: 100, projectileLimit: 1000 },
        activeEnemies: [],
        activeProjectiles: [],
        tutorialVisible: false,
        tutorialStep: 0,
        tutorialCompleted: false,
        gameSpeed: 1
    };
}

const gameState = createGameState();

function getEffectiveGameSpeed(speed = gameState.gameSpeed) {
    return Number((speed * GAME_CONFIG.baseGameSpeed).toFixed(6));
}

function getStoredGameSpeed() {
    const stored = safeGetStoredValue('gameSpeed');
    const speed = stored === null ? 1 : Number(stored);
    return GAME_CONFIG.gameSpeeds.includes(speed) ? speed : 1;
}

function getGameDifficulty(speed = gameState.gameSpeed) {
    if (speed === 0.75) return 'Easy';
    if (speed <= 1.5) return 'Normal';
    if (speed <= 2.25) return 'Hard';
    return 'Very Hard';
}

let localIdSequence = 0;

function createLocalId(prefix) {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        return `${prefix}-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
    }
    // Zgodność ze starszymi przeglądarkami; identyfikator lokalny, nie token dostępu.
    return `${prefix}-${Date.now().toString(36)}-${++localIdSequence}-${Math.random().toString(36).slice(2)}`;
}

function safeGetStoredValue(key) {
    try {
        return window.localStorage.getItem(key);
    } catch (error) {
        return null;
    }
}

function safeSetStoredValue(key, value) {
    try {
        window.localStorage.setItem(key, String(value));
    } catch (error) {
        // Gra działa również wtedy, gdy przeglądarka blokuje localStorage.
    }
}

const shopItems = {
    cannon: { wood: 100, stone: 200 },
    seedling: { seeds: 20 },
    woodFence: { wood: 100 },
    stoneWall: { stone: 120 },
    quarry: { stone: 30, wood: 50 }
};

const serverShopItems = {
    cannon: { wood: 20, stone: 15 },
    seedling: { seeds: 1 },
    woodFence: { wood: 10 },
    stoneWall: { stone: 12 }
};

GAME_CONFIG.hpColors = {
    high: '#2ecc71',   
    medium: '#f1c40f', 
    low: '#e74c3c'    
};

const itemImages = {
    cannon: 'assets/images/cannon_lvl_1.png',
    seedling: 'assets/images/seedling.png',
    tree: 'assets/images/tree_lvl_1.png',
    woodFence: 'assets/images/woodFence.png',
    stoneWall: 'assets/images/stoneWall.png',
    quarry: 'assets/images/quarry_lvl_1.png',
    cannonball: 'assets/images/cannonball.png' 
};

const bossMasterImage = 'assets/images/worm_boss_master.png';
const quarryLevelImages = [1, 2, 3, 4, 5].map(level => `assets/images/quarry_lvl_${level}.png`);
const treeLevelImages = [1, 2, 3, 4, 5].map(level => `assets/images/tree_lvl_${level}.png`);
const cannonLevelImages = [1, 2, 3, 4, 5].map(level => `assets/images/cannon_lvl_${level}.png`);
// Coordinates within the square tile, including each image's transparent margins.
const cannonMuzzles = [
    { x: 0.71, y: 0.407, diameter: 0.10 },
    { x: 0.735, y: 0.395, diameter: 0.11 },
    { x: 0.78, y: 0.384, diameter: 0.12 },
    { x: 0.811, y: 0.369, diameter: 0.14 },
    { x: 0.895, y: 0.337, diameter: 0.16 }
];
const wormSkinImages = [1, 2, 3, 4, 5, 6].map(version => `assets/images/worm_ver_${version}.png`);
const bossSkinImages = [1, 2, 3, 4, 5].map(version => `assets/images/worm_boss_ver_${version}.png`);

function getEnemyImage(enemy) {
    if (enemy.type === 'master') return bossMasterImage;
    const skins = enemy.type === 'boss' ? bossSkinImages : wormSkinImages;
    // Skin zależy od ID, więc wczytanie zapisu nie zmienia wyglądu ani losowania fal.
    const mixedId = Math.imul(enemy.id, 0x9e3779b1);
    return skins[((mixedId ^ (mixedId >>> 16)) >>> 0) % skins.length];
}

function getBuildingImage(type, level = 1) {
    if (type === 'cannon') return cannonLevelImages[level - 1] ?? itemImages.cannon;
    if (type === 'quarry') return quarryLevelImages[level - 1] ?? itemImages.quarry;
    if (type === 'tree') return treeLevelImages[level - 1] ?? itemImages.tree;
    return itemImages[type];
}
