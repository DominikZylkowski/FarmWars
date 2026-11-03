// ------------------------- Konfiguracja gry -------------------------
const GAME_CONFIG = {
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

const gameState = {
    level: 1, 
    seedCount: 0, 
    stoneCount: 0, 
    woodCount: 0,
    prepTime: 120, 
    gamePaused: true, 
    gameEnded: false,
    selectedItemToPlace: null,
    isInvasionActive: false,
    enemiesDefeated: 0,
    totalEnemiesInWave: 0,
    activeEnemies: [],
    activeProjectiles: [], 
    tutorialVisible: false,
    tutorialStep: 0,
    tutorialCompleted: safeGetStoredValue('farmwarsTutorialCompleted') === '1',
    volume: Number(safeGetStoredValue('gameVolume')) || 50
};

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
    tree: 'assets/images/tree.png',
    woodFence: 'assets/images/woodFence.png',
    stoneWall: 'assets/images/stoneWall.png',
    worm_full: 'assets/images/worm_full.png',
    worm_boss: 'assets/images/worm_boss.png',
    cannonball: 'assets/images/cannonball.png' 
};
