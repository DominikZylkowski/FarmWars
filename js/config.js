// ------------------------- Konfiguracja gry -------------------------
const GAME_CONFIG = {
    rulesetId: 'farmwars-1',
    gameSpeeds: Object.freeze([0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3]),
    rows: 5,
    columns: 10,
    tileClassNames: ['game-tile--light', 'game-tile--dark'],
    baseGrassCount: 6,
    baseStoneCount: 4,
    spawnIntervals: {
        grass: 15000, 
        stone: 25000  
    },
    treeGrowthTime: 15000, 
    hpValues: { 
        tree: 5, 
        cannon: 10, 
        woodFence: 8, 
        stoneWall: 25, 
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
    enemySpeed: 0.55,
    bossSpeed: 0.45,
    projectileSpeed: 4, 
    cannonDamage: 3,
    scoring: {
        pointsPerSecond: 1,
        items: { cannon: 10, seedling: 10, woodFence: 10, stoneWall: 10 },
        enemies: { normal: 20, boss: 35 },
        resources: { tree: 12 }
    }
};

function createGameState() {
    return {
        gameStarted: false,
        level: 1,
        seedCount: 0,
        stoneCount: 0,
        woodCount: 0,
        prepTime: 120,
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
    cannon: 'assets/images/cannon.png',
    seedling: 'assets/images/seedling.png',
    tree: 'assets/images/Tree.png',
    woodFence: 'assets/images/woodFence.png',
    stoneWall: 'assets/images/stoneWall.png',
    worm_full: 'assets/images/worm_full.png',
    worm_boss: 'assets/images/worm_boss.png',
    cannonball: 'assets/images/cannonball.png' 
};
