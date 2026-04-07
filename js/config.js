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
        stoneWall: 15, 
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
    enemySpeed: 0.2,
    bossSpeed: 0.15,
    projectileSpeed: 4, 
    cannonDamage: 3      
};

const gameState = {
    level: 1, 
    seedCount: 0, 
    stoneCount: 0, 
    woodCount: 0,
    prepTime: 900, 
    gamePaused: true, 
    selectedItemToPlace: null,
    isInvasionActive: false,
    enemiesDefeated: 0,
    totalEnemiesInWave: 0,
    activeEnemies: [],
    activeProjectiles: [], 
    volume: parseInt(localStorage.getItem('gameVolume')) || 50
};

const shopItems = {
    cannon: { wood: 2, stone: 1 }, 
    seedling: { seeds: 1 },
    woodFence: { wood: 10 },
    stoneWall: { stone: 12 }
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