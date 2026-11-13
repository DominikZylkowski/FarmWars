<?php
declare(strict_types=1);

function economyRandom(array &$state, int $size): int
{
    $seed = $state['seed'];
    $seed = ($seed ^ ($seed << 13)) & 0xffffffff;
    $seed = ($seed ^ ($seed >> 17)) & 0xffffffff;
    $state['seed'] = ($seed ^ ($seed << 5)) & 0xffffffff;
    return (int) floor($state['seed'] * $size / 4294967296);
}

function economySpawn(array &$state, string $kind): void
{
    $free = [];
    foreach ($state['tiles'] as $index => $tile) {
        if ($tile['resource'] === null && $tile['object'] === null) {
            $free[] = $index;
        }
    }
    if (!$free) {
        return;
    }
    $index = $free[economyRandom($state, count($free))];
    $roll = economyRandom($state, 10);
    $state['tiles'][$index]['resource'] = [
        'id' => ++$state['nextId'], 'kind' => $kind, 'size' => $roll < 5 ? 1 : ($roll < 8 ? 2 : 3),
    ];
}

function newEconomyState(array $rules, int $now, int $seed): array
{   
    $state = [
        'phase' => 'preparation', 'simulationMs' => 0, 'paused' => true, 'gameSpeed' => 1,
        'resources' => ['seeds' => 0, 'stones' => 0, 'wood' => 0], 'tiles' => [],
        'anchorMs' => $now, 'nextGrass' => $rules['grassInterval'], 'nextStone' => $rules['stoneInterval'],
        'seed' => $seed, 'nextId' => 0,
    ];
    for ($row = 0; $row < $rules['rows']; $row++) {
        for ($column = 0; $column < $rules['columns']; $column++) {
            $state['tiles'][] = ['id' => "tile_{$row}_{$column}", 'row' => $row, 'column' => $column,
                'resource' => null, 'object' => null];
        }
    }
    foreach (['grass' => $rules['initialGrass'], 'stone' => $rules['initialStone']] as $kind => $count) {
        for ($i = 0; $i < $count; $i++) {
            economySpawn($state, $kind);
        }
    }
    return $state;
}

function growTree(array &$tile, array $rules): void
{
    $tile['object'] = [
        'id' => $tile['object']['id'],
        'kind' => 'tree',
        'hp' => $rules['hp']['tree'],
        'growthAtMs' => null,
    ];
}

function advanceEconomy(array &$state, array $rules, int $now): void
{
    if ($state['paused']) {
        return;
    }
    $now = max($now, $state['anchorMs']);
    $end = $rules['preparationMs'];
    $target = min($end, $state['simulationMs'] + ($now - $state['anchorMs']) * $state['gameSpeed']);
    $state['anchorMs'] = $now;
    $state['simulationMs'] = $target;
    $growth = [];
    foreach ($state['tiles'] as $index => $tile) {
        $deadline = $tile['object']['growthAtMs'] ?? null;
        if ($deadline !== null && $deadline <= $target) {
            $growth[$index] = $deadline;
        }
    }
    asort($growth, SORT_NUMERIC);
    $spawnLimit = min($end, $target + 0.001);
    while (true) {
        $kind = $state['nextGrass'] <= $state['nextStone'] ? 'grass' : 'stone';
        $spawnKey = $kind === 'grass' ? 'nextGrass' : 'nextStone';
        $nextSpawn = $state[$spawnKey];
        $index = array_key_first($growth);
        if ($index === null && $nextSpawn >= $spawnLimit) {
            break;
        }
        if ($index !== null && ($growth[$index] <= $nextSpawn || $nextSpawn >= $end)) {
            growTree($state['tiles'][$index], $rules);
            unset($growth[$index]);
        } else {
            economySpawn($state, $kind);
            $state[$spawnKey] += $rules[$kind . 'Interval'];
        }
    }
    if ($target >= $end) {
        $state['phase'] = 'combat_boundary';
        $state['paused'] = true;
    }
}
function applyEconomyCommand(array &$state, array $rules, string $type, array $payload, int $now, bool $full = false): void
{
    if (!$full && $state['phase'] !== 'preparation') {
        throw new ApiError(422, 'Podgląd ekonomii zakończył przygotowania.', 'INVALID_ACTION');
    }
    if ($type === 'pause' || $type === 'resume') {
        $state['paused'] = $type === 'pause';
        $state['anchorMs'] = max($now, $state['anchorMs']);
        return;
    }
    if ($type === 'set_speed') {
        $speed = $payload['speed'];
        if (!in_array((float) $speed, array_map('floatval', $rules['speeds']), true)) {
            throw new ApiError(422, 'Niedozwolona szybkość.', 'INVALID_ACTION');
        }
        $state['gameSpeed'] = $speed;
        return;
    }
    if ($state['paused']) {
        throw new ApiError(422, 'Wznów przygotowania przed wykonaniem akcji.', 'INVALID_ACTION');
    }
    $index = array_search($payload['tileId'], array_column($state['tiles'], 'id'), true);
    if ($index === false) {
        throw new ApiError(422, 'Pole nie istnieje.', 'INVALID_ACTION');
    }
    $tile = &$state['tiles'][$index];
    if ($type === 'collect') {
        if ($tile['resource'] !== null) {
            $resource = $tile['resource'];
            $state['resources'][$resource['kind'] === 'grass' ? 'seeds' : 'stones'] += $resource['size'];
            $tile['resource'] = null;
        } elseif (($tile['object']['kind'] ?? null) === 'tree') {
            $state['resources']['wood'] += $rules['woodYield'];
            $tile['object'] = null;
        } else {
            throw new ApiError(422, 'Na polu nie ma zasobu do zebrania.', 'INVALID_ACTION');
        }
        return;
    }

    $item = $payload['itemType'];
    if (!isset($rules['shop'][$item])) {
        throw new ApiError(422, 'Nieznany przedmiot.', 'INVALID_ACTION');
    }
    if ($tile['resource'] !== null || $tile['object'] !== null) {
        throw new ApiError(409, 'Pole jest zajęte.', 'TILE_OCCUPIED');
    }
    foreach ($rules['shop'][$item] as $resource => $amount) {
        if ($state['resources'][$resource] < $amount) {
            throw new ApiError(409, 'Brak wymaganych zasobów.', 'INSUFFICIENT_RESOURCES');
        }
    }
    foreach ($rules['shop'][$item] as $resource => $amount) {
        $state['resources'][$resource] -= $amount;
    }
    $growthAt = null;
    if ($item === 'seedling') {
        $deadline = floor($state['simulationMs'] + ($state['remainderMs'] ?? 0)) + $rules['growthMs'];
        $growthAt = (int) ceil($deadline / $rules['growthCheckMs']) * $rules['growthCheckMs'];
    }
    $tile['object'] = ['id' => ++$state['nextId'], 'kind' => $item, 'hp' => $rules['hp'][$item],
        'growthAtMs' => $growthAt];
}
