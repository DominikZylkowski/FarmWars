// Geometria w pikselach logicznych, zapisana raz na początku partii.
const COLLISION_GEOMETRY = Object.freeze({ normal: 120, boss: 160, projectile: 45, hitInset: 20, contact: 55 });

function handleInvasionStart(now = getGameTime()) {
    if (gameState.gamePaused || gameState.gameEnded || gameState.isInvasionActive) return;
    gameState.isInvasionActive = true;
    gameState.enemiesDefeated = 0;
    const wave = GAME_CONFIG.waves[gameState.level];
    const queue = [...Array(wave.normal).fill('normal'), ...Array(wave.boss).fill('boss')];
    // Jawna kolejność losowań, niezależna od implementacji Array.sort().
    for (let i = queue.length - 1; i > 0; i--) {
        const index = Math.floor(gameRandom() * (i + 1));
        [queue[i], queue[index]] = [queue[index], queue[i]];
    }
    gameState.totalEnemiesInWave = queue.length;
    scheduleGameTask('wave', Math.max(500, 3000 - gameState.level * 200), true, { queue, spawned: 0 }, now);
}

function spawnEnemy(row, type) {
    if (gameState.gamePaused || gameState.gameEnded || !gameState.isInvasionActive ||
        !Number.isInteger(row) || row < 0 || row >= GAME_CONFIG.rows || !['normal', 'boss'].includes(type)) return;
    const hp = GAME_CONFIG.hpValues[type === 'boss' ? 'worm_boss' : 'worm'];
    gameState.activeEnemies.push({
        id: ++nextEntityId, hp, maxHp: hp, offsetX: 0, row, currentCol: GAME_CONFIG.columns - 1,
        attackTimer: null, type
    });
}

function damageEnemy(enemy, amount) {
    if (gameState.gamePaused || gameState.gameEnded || !enemy || !Number.isFinite(amount) ||
        amount <= 0 || !gameState.activeEnemies.includes(enemy)) return false;

    enemy.hp -= amount;
    if (enemy.hp > 0) return true;

    cancelGameTask(enemy.attackTimer);
    awardScoreForEvent('enemies', enemy.type, enemy.id);
    gameState.activeEnemies = gameState.activeEnemies.filter(candidate => candidate !== enemy);
    gameState.enemiesDefeated++;
    if (gameState.enemiesDefeated >= gameState.totalEnemiesInWave && gameState.activeEnemies.length === 0) {
        handleLevelComplete();
    }
    return true;
}

function updateCannons(now = getGameTime()) {
    const occupiedRows = new Set(gameState.activeEnemies.map(enemy => enemy.row));
    for (const tile of gameState.tiles) {
        const cannon = tile.object;
        if (cannon?.type === 'cannon' && occupiedRows.has(tile.row) && now - cannon.lastShot >= 1000) {
            cannon.lastShot = now;
            fireCannon(tile);
        }
    }
}

function fireCannon(tile) {
    gameState.activeProjectiles.push({
        id: ++nextEntityId, column: tile.column, xOffset: 0, row: tile.row
    });
}

function projectileHitsEnemy(projectile, enemy, tileWidth) {
    // Obrócony kwadrat pocisku dawał prostokąt AABB w getBoundingClientRect().
    const angle = projectile.xOffset * 2 * Math.PI / 180;
    const halfProjectile = COLLISION_GEOMETRY.projectile / 2 * (Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle)));
    const halfEnemy = COLLISION_GEOMETRY[enemy.type] / 2;
    const enemyX = (GAME_CONFIG.columns - 0.5) * tileWidth - enemy.offsetX;
    const projectileX = (projectile.column + 0.5) * tileWidth + projectile.xOffset;
    return projectileX + halfProjectile >= enemyX - halfEnemy + COLLISION_GEOMETRY.hitInset &&
        projectileX - halfProjectile <= enemyX + halfEnemy;
}

function updateProjectiles(delta = 1 / 60) {
    const { columnPitch, projectileLimit } = gameState.geometry;
    const enemiesByRow = Array.from({ length: GAME_CONFIG.rows }, () => []);
    for (const enemy of gameState.activeEnemies) enemiesByRow[enemy.row].push(enemy);
    for (let i = gameState.activeProjectiles.length - 1; i >= 0; i--) {
        const projectile = gameState.activeProjectiles[i];
        projectile.xOffset += GAME_CONFIG.projectileSpeed * delta * 60;
        const enemy = enemiesByRow[projectile.row].find(candidate =>
            candidate.hp > 0 && projectileHitsEnemy(projectile, candidate, columnPitch)
        );
        if (enemy) {
            damageEnemy(enemy, GAME_CONFIG.cannonDamage);
            if (!gameState.isInvasionActive || gameState.gameEnded) return;
        }
        if (enemy || (projectile.column + 0.5) * columnPitch + projectile.xOffset > projectileLimit) {
            gameState.activeProjectiles.splice(i, 1);
        }
    }
}

function clearProjectiles() {
    gameState.activeProjectiles = [];
}

function stopEnemyAttack(enemy) {
    cancelGameTask(enemy.attackTimer);
    enemy.attackTimer = null;
}

function attackTile(enemyId, tileId, timerId, now) {
    const enemy = gameState.activeEnemies.find(candidate => candidate.id === enemyId);
    const tile = gameState.tiles[tileId];
    if (!gameState.isInvasionActive || !enemy || !tile.object) {
        if (enemy) stopEnemyAttack(enemy);
        else cancelGameTask(timerId);
        return;
    }
    const object = tile.object;
    object.hp -= enemy.type === 'boss' ? 2.5 : 1;
    if (object.hp <= 0) {
        tile.object = null;
        stopEnemyAttack(enemy);
    } else {
        object.lastDamagedAt = now;
    }
}

function updateGameLoop(delta, now = getGameTime()) {
    if (gameState.gamePaused || gameState.gameEnded || !gameState.isInvasionActive) return;
    const width = gameState.geometry.tileWidth;
    const contact = Math.min(COLLISION_GEOMETRY.contact, width / 2);
    for (const enemy of gameState.activeEnemies) {
        const rowStart = enemy.row * GAME_CONFIG.columns;
        if (enemy.attackTimer !== null) {
            if (gameState.tiles[rowStart + enemy.currentCol].object) continue;
            stopEnemyAttack(enemy);
        }

        const speed = enemy.type === 'boss' ? GAME_CONFIG.bossSpeed : GAME_CONFIG.enemySpeed;
        enemy.offsetX += speed * delta * 60;
        const newCol = GAME_CONFIG.columns - 1 - Math.floor((enemy.offsetX + contact) / width);
        if (newCol < 0) {
            gameOver();
            return;
        }
        for (let col = enemy.currentCol; col >= newCol; col--) {
            const tile = gameState.tiles[rowStart + col];
            if (!tile.object) continue;
            enemy.currentCol = col;
            enemy.offsetX = Math.max(0, (GAME_CONFIG.columns - 1 - col) * width - contact);
            enemy.attackTimer = scheduleGameTask('attack', enemy.type === 'boss' ? 2500 : 1200, true,
                { enemyId: enemy.id, tileId: tile.id }, now);
            break;
        }
        if (enemy.attackTimer === null) enemy.currentCol = newCol;
    }
    updateCannons(now);
    if (gameState.activeProjectiles.length) updateProjectiles(delta);
}

function handleLevelComplete() {
    if (!gameState.isInvasionActive || gameState.gameEnded) return;
    gameState.isInvasionActive = false;
    clearProjectiles();
    if (gameState.level >= 10) gameWin();
    else {
        gameState.level++;
        gameState.prepTime = 120;
    }
}
