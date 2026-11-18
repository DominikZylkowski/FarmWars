<?php
declare(strict_types=1);

const ONLINE_STEP = 10;
const ONLINE_STEP_LIMIT = 300;

function newOnlineState(array $rules, int $now, int $seed): array
{
    $state = newEconomyState($rules, 0, $seed);
    $state += [
        'schemaVersion' => 1, 'createdMs' => $now, 'activeMs' => 0, 'remainderMs' => 0,
        'level' => 1, 'prepLeftMs' => $rules['preparationMs'], 'enemies' => [], 'projectiles' => [],
        'defeated' => 0, 'waveTotal' => 0, 'nextTask' => 0, 'tasks' => [], 'finishedMs' => null,
        'counts' => ['items' => [], 'enemies' => [], 'resources' => []],
        'speedHistory' => [['atActiveSeconds' => 0, 'atSimulationSeconds' => 0, 'gameSpeed' => 1]],
    ];
    onlineTask($state, 'growth', $rules['growthCheckMs']);
    onlineTask($state, 'prep', 1000);
    onlineTask($state, 'grass', $rules['grassInterval']);
    onlineTask($state, 'stone', $rules['stoneInterval']);
    return $state;
}

function onlineTask(array &$state, string $type, int $interval, array $data = []): int
{
    $id = ++$state['nextTask'];
    $state['tasks'][$id] = ['type' => $type, 'due' => $state['simulationMs'] + $interval,
        'interval' => $interval, 'data' => $data];
    return $id;
}

function onlineWave(array &$state, array $rules): void
{
    $state['phase'] = 'combat';
    $state['defeated'] = 0;
    $wave = $rules['waves'][$state['level']];
    $queue = array_merge(array_fill(0, $wave['normal'], 'normal'), array_fill(0, $wave['boss'], 'boss'));
    for ($index = count($queue) - 1; $index > 0; $index--) {
        $other = economyRandom($state, $index + 1);
        $type = $queue[$index];
        $queue[$index] = $queue[$other];
        $queue[$other] = $type;
    }
    $state['waveTotal'] = count($queue);
    onlineTask($state, 'wave', max(500, 3000 - $state['level'] * 200), ['queue' => $queue, 'index' => 0]);
}

function onlineSpawnEnemy(array &$state, array $rules, int $row, string $type): int
{
    $id = ++$state['nextId'];
    $hp = $rules['combat'][$type]['hp'];
    $state['enemies'][$id] = ['id' => $id, 'type' => $type, 'hp' => $hp, 'maxHp' => $hp,
        'row' => $row, 'currentCol' => $rules['columns'] - 1, 'offsetX' => 0, 'attack' => null];
    return $id;
}

function onlineFinish(array &$state, string $status): void
{
    $state['phase'] = $status;
    $state['paused'] = true;
    $state['finishedMs'] = (int) floor($state['createdMs'] + $state['anchorMs']);
    $state['projectiles'] = [];
    $state['tasks'] = [];
}

function onlineCount(array &$state, string $category, string $kind): void
{
    $state['counts'][$category][$kind] = ($state['counts'][$category][$kind] ?? 0) + 1;
}

function onlineDamage(array &$state, array $rules, int $id, int $amount): void
{
    if (!isset($state['enemies'][$id])) {
        return;
    }
    $state['enemies'][$id]['hp'] -= $amount;
    if ($state['enemies'][$id]['hp'] > 0) {
        return;
    }
    $enemy = $state['enemies'][$id];
    unset($state['enemies'][$id], $state['tasks'][$enemy['attack']]);
    onlineCount($state, 'enemies', $enemy['type']);
    if (++$state['defeated'] === $state['waveTotal'] && !$state['enemies']) {
        $state['projectiles'] = [];
        if ($state['level'] === count($rules['waves'])) {
            onlineFinish($state, 'won');
        } else {
            $state['level']++;
            $state['phase'] = 'preparation';
            $state['prepLeftMs'] = $rules['preparationMs'];
        }
    }
}

function onlineAttack(array &$state, array $rules, int $task, array $data): void
{
    $id = $data['enemy'];
    $tile = &$state['tiles'][$data['tile']];
    if (!isset($state['enemies'][$id])) {
        unset($state['tasks'][$task]);
        return;
    }
    if ($tile['object'] !== null) {
        $tile['object']['hp'] -= $rules['combat'][$state['enemies'][$id]['type']]['attackDamage'];
        if ($tile['object']['hp'] > 0) {
            $tile['object']['lastDamagedAt'] = $state['simulationMs'];
            return;
        }
        $tile['object'] = null;
    } else {
        $tile['resource'] = null;
    }
    unset($state['tasks'][$task]);
    $state['enemies'][$id]['attack'] = null;
}

function onlineRunTasks(array &$state, array $rules): void
{
    $now = $state['simulationMs'];
    foreach (array_keys($state['tasks']) as $id) {
        if (!isset($state['tasks'][$id]) || $state['tasks'][$id]['due'] > $now) {
            continue;
        }
        $task = $state['tasks'][$id];
        $state['tasks'][$id]['due'] += $task['interval'];
        switch ($task['type']) {
            case 'growth':
                foreach ($state['tiles'] as $index => $tile) {
                    $deadline = $tile['object']['growthAtMs'] ?? null;
                    if ($deadline !== null && $deadline <= $now) {
                        growTree($state['tiles'][$index], $rules);
                    }
                }
                break;
            case 'prep':
                if ($state['phase'] === 'preparation') {
                    $state['prepLeftMs'] -= 1000;
                    if ($state['prepLeftMs'] === 0) {
                        onlineWave($state, $rules);
                    }
                }
                break;
            case 'grass':
            case 'stone':
                if ($state['phase'] === 'preparation') {
                    economySpawn($state, $task['type']);
                }
                break;
            case 'wave':
                $row = economyRandom($state, $rules['rows']);
                onlineSpawnEnemy($state, $rules, $row, $task['data']['queue'][$task['data']['index']]);
                if (++$state['tasks'][$id]['data']['index'] === count($task['data']['queue'])) {
                    unset($state['tasks'][$id]);
                }
                break;
            case 'attack':
                onlineAttack($state, $rules, $id, $task['data']);
                break;
        }
    }
}

function onlineOccupied(array $tile): bool
{
    return $tile['object'] !== null || $tile['resource'] !== null;
}

function onlineMoveEnemies(array &$state, array $rules): void
{
    $combat = $rules['combat'];
    $width = $combat['tileWidth'];
    $contact = min($combat['contact'], $width / 2);
    $columns = $rules['columns'];
    foreach ($state['enemies'] as &$enemy) {
        $rowStart = $enemy['row'] * $columns;
        if ($enemy['attack'] !== null) {
            if (onlineOccupied($state['tiles'][$rowStart + $enemy['currentCol']])) {
                continue;
            }
            unset($state['tasks'][$enemy['attack']]);
            $enemy['attack'] = null;
        }
        $profile = $combat[$enemy['type']];
        $enemy['offsetX'] += $profile['speed'] * 0.01 * 60;
        $newCol = $columns - 1 - (int) floor(($enemy['offsetX'] + $contact) / $width);
        if ($newCol < 0) {
            onlineFinish($state, 'lost');
            return;
        }
        for ($column = $enemy['currentCol']; $column >= $newCol; $column--) {
            $index = $rowStart + $column;
            if (!onlineOccupied($state['tiles'][$index])) {
                continue;
            }
            $enemy['currentCol'] = $column;
            $enemy['offsetX'] = max(0, ($columns - 1 - $column) * $width - $contact);
            $enemy['attack'] = onlineTask($state, 'attack', $profile['attackInterval'],
                ['enemy' => $enemy['id'], 'tile' => $index]);
            break;
        }
        if ($enemy['attack'] === null) {
            $enemy['currentCol'] = $newCol;
        }
    }
    unset($enemy);
}

function onlineFireCannons(array &$state, array $combat, array $rows): void
{
    foreach ($state['tiles'] as &$tile) {
        if (($tile['object']['kind'] ?? null) !== 'cannon' || !$rows[$tile['row']] ||
            $state['simulationMs'] - $tile['object']['lastShot'] < $combat['shotInterval']) {
            continue;
        }
        $tile['object']['lastShot'] = $state['simulationMs'];
        $id = ++$state['nextId'];
        $state['projectiles'][$id] = ['id' => $id, 'column' => $tile['column'], 'row' => $tile['row'], 'xOffset' => 0];
    }
    unset($tile);
}

function onlineCombatStep(array &$state, array $rules): void
{
    onlineMoveEnemies($state, $rules);
    if ($state['phase'] !== 'combat') {
        return;
    }
    $combat = $rules['combat'];
    $rows = array_fill(0, $rules['rows'], []);
    foreach ($state['enemies'] as $id => $enemy) {
        $rows[$enemy['row']][] = $id;
    }
    onlineFireCannons($state, $combat, $rows);
    $width = $combat['tileWidth'];
    foreach (array_reverse(array_keys($state['projectiles'])) as $id) {
        $projectile = &$state['projectiles'][$id];
        $projectile['xOffset'] += $combat['projectileSpeed'] * 0.01 * 60;
        $x = ($projectile['column'] + 0.5) * $width + $projectile['xOffset'];
        $angle = $projectile['xOffset'] * 2 * M_PI / 180;
        $half = $combat['projectileSize'] / 2 * (abs(cos($angle)) + abs(sin($angle)));
        $hit = false;
        foreach ($rows[$projectile['row']] as $enemyId) {
            $enemy = $state['enemies'][$enemyId] ?? null;
            if (!$enemy) {
                continue;
            }
            $enemyX = ($rules['columns'] - 0.5) * $width - $enemy['offsetX'];
            $enemyHalf = $combat[$enemy['type']]['size'] / 2;
            if ($x + $half >= $enemyX - $enemyHalf + $combat['hitInset'] && $x - $half <= $enemyX + $enemyHalf) {
                onlineDamage($state, $rules, $enemyId, $combat['cannonDamage']);
                $hit = true;
                break;
            }
        }
        unset($projectile);
        if ($state['phase'] !== 'combat') {
            return;
        }
        if ($hit || $x > $combat['projectileLimit']) {
            unset($state['projectiles'][$id]);
        }
    }
}

function advanceOnline(array &$state, array $rules, int $now): bool
{
    $now = max(0, $now - $state['createdMs']);
    for ($step = 0; !$state['paused'] && $step < ONLINE_STEP_LIMIT; $step++) {
        $wall = max(0, $now - $state['anchorMs']);
        $needed = (ONLINE_STEP - $state['remainderMs']) / $state['gameSpeed'];
        if ($wall + 0.0002 < $needed) {
            $state['activeMs'] += $wall;
            $state['remainderMs'] += $wall * $state['gameSpeed'];
            $state['anchorMs'] += $wall;
            return false;
        }
        $state['anchorMs'] += $needed;
        $state['activeMs'] += $needed;
        $state['remainderMs'] = 0;
        $state['simulationMs'] += ONLINE_STEP;
        onlineRunTasks($state, $rules);
        if ($state['phase'] === 'combat') {
            onlineCombatStep($state, $rules);
        }
    }
    return !$state['paused'] && $now - $state['anchorMs'] > 0.0002;
}

function applyOnlineCommand(array &$state, array $rules, string $type, array $payload, int $now): void
{
    if ($state['finishedMs'] !== null) {
        throw new ApiError(422, 'Partia jest zakończona.', 'INVALID_ACTION');
    }
    $elapsed = max(0, $now - $state['createdMs']);
    if ($type === 'pause' || $type === 'resume' || $type === 'set_speed') {
        $speed = $state['gameSpeed'];
        // Reguły zegara są wspólne, a faza pełnej gry pozostaje bez zmian.
        applyEconomyCommand($state, $rules, $type, $payload, $elapsed, true);
        if ($state['gameSpeed'] != $speed) {
            $state['speedHistory'][] = ['atActiveSeconds' => $state['activeMs'] / 1000,
                'atSimulationSeconds' => ($state['simulationMs'] + $state['remainderMs']) / 1000,
                'gameSpeed' => $state['gameSpeed']];
        }
        return;
    }
    if ($type === 'hit_enemy') {
        if ($state['paused'] || !isset($state['enemies'][$payload['enemyId']])) {
            throw new ApiError(422, 'Przeciwnik nie jest dostępny.', 'INVALID_ACTION');
        }
        onlineDamage($state, $rules, $payload['enemyId'], $rules['combat']['clickDamage']);
        return;
    }
    $index = array_search($payload['tileId'], array_column($state['tiles'], 'id'), true);
    $before = $index === false ? null : $state['tiles'][$index];
    if ($type === 'place' && !$state['paused'] && $before) {
        foreach ($state['enemies'] as $enemy) {
            if ($enemy['row'] === $before['row'] && $enemy['currentCol'] === $before['column']) {
                throw new ApiError(409, 'Pole jest zajęte przez przeciwnika.', 'TILE_OCCUPIED');
            }
        }
    }
    applyEconomyCommand($state, $rules, $type, $payload, $elapsed, true);
    if ($type === 'place') {
        onlineCount($state, 'items', $payload['itemType']);
        if ($payload['itemType'] === 'cannon') {
            $state['tiles'][$index]['object']['lastShot'] =
                $state['simulationMs'] + $state['remainderMs'] - $rules['combat']['shotInterval'];
        }
    } elseif (($before['object']['kind'] ?? null) === 'tree') {
        onlineCount($state, 'resources', 'tree');
    }
}

function onlineScore(array $state, array $rules): array
{
    $points = ['time' => intdiv($state['simulationMs'], 1000) * $rules['scoring']['pointsPerSecond']];
    $counts = [];
    foreach ($state['counts'] as $category => $categoryCounts) {
        $points[$category] = 0;
        foreach ($categoryCounts as $kind => $count) {
            $points[$category] += $count * $rules['scoring'][$category][$kind];
        }
        // Pusta mapa ma trafić do JSON jako {}, nie jako lista [].
        $counts[$category] = (object) $categoryCounts;
    }
    return ['totalScore' => array_sum($points), 'points' => $points, 'activeTimeMs' => (int) floor($state['activeMs'] + 0.0002),
        'counts' => $counts, 'speedHistory' => $state['speedHistory']];
}

function onlineDate(int $ms): string
{
    return gmdate('Y-m-d H:i:s', intdiv($ms, 1000)) . sprintf('.%03d', $ms % 1000);
}

function publicRunState(array $state, string $id, int $revision, string $ruleset, array $rules, int $now, bool $catchingUp = false): array
{
    $view = [
        'runId' => $id, 'revision' => $revision, 'rulesetId' => $ruleset, 'mode' => 'economy_preview',
        'phase' => $state['phase'], 'simulationMs' => $state['simulationMs'], 'paused' => $state['paused'],
        'gameSpeed' => $state['gameSpeed'], 'resources' => $state['resources'], 'tiles' => $state['tiles'],
        'preparationMs' => $rules['preparationMs'], 'serverTime' => gmdate('Y-m-d\TH:i:s\Z', intdiv($now, 1000)),
    ];
    if (!isset($state['schemaVersion'])) {
        return $view;
    }
    $view['mode'] = 'online';
    foreach ($state['tiles'] as $index => $tile) {
        if (isset($tile['object']['lastShot'])) {
            $view['tiles'][$index]['object']['lastShot'] = max(0, $tile['object']['lastShot']);
        }
    }
    $enemies = [];
    foreach ($state['enemies'] as $enemy) {
        unset($enemy['attack']);
        $enemies[] = $enemy;
    }
    $score = onlineScore($state, $rules);
    return $view + [
        'level' => $state['level'], 'preparationRemainingMs' => $state['prepLeftMs'],
        'defeated' => $state['defeated'], 'waveTotal' => $state['waveTotal'],
        'enemies' => $enemies,
        'projectiles' => array_values($state['projectiles']), 'catchingUp' => $catchingUp,
        'score' => $score, 'summary' => $state['finishedMs'] === null ? null : $score + [
            'status' => $state['phase'], 'finishedAt' => str_replace(' ', 'T', onlineDate($state['finishedMs'])) . 'Z',
            'runId' => $id, 'rulesetId' => $ruleset, 'reachedLevel' => $state['level'],
            'simulationMs' => $state['simulationMs'], 'gameSpeed' => $state['gameSpeed'],
            'validationLevel' => 'server_simulated', 'isRanked' => false,
        ],
    ];
}
