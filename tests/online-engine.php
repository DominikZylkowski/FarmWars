<?php
declare(strict_types=1);
require __DIR__ . '/../backend/economy_api.php';

function testRules(string $file): array
{
    $sql = file_get_contents(__DIR__ . '/../database/' . $file);
    preg_match("/'(\{[\s\S]*?\})'/", $sql, $match);
    return json_decode($match[1], true, 32, JSON_THROW_ON_ERROR);
}

function checkOnline(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function catchUp(array &$state, array $rules, int $now): void
{
    while (advanceOnline($state, $rules, $now)) {
        // Każdy obrót reprezentuje osobną porcję żądania.
    }
}

function emptyBoard(array &$state): void
{
    foreach ($state['tiles'] as &$tile) {
        $tile['object'] = null;
        $tile['resource'] = null;
    }
    unset($tile);
}

$base = testRules('farmwars.sql');
$rules = testRules('003-economy.sql') + testRules('004-online.sql') + ['waves' => $base['waves'], 'scoring' => $base['scoring']];
if (in_array('--trace', $argv, true)) {
    $state = newOnlineState($rules, 0, 123456);
    applyOnlineCommand($state, $rules, 'resume', [], 0);
    $trace = [];
    foreach ([0, 15000, 25000, 120000, 122800, 123300, 125600, 128400] as $now) {
        catchUp($state, $rules, $now);
        $trace[] = [
            'tiles' => array_map(fn ($tile) => $tile['resource'] ? [
                $tile['resource']['id'], $tile['resource']['kind'], $tile['resource']['size'],
            ] : null, $state['tiles']),
            'enemies' => array_values(array_map(fn ($enemy) => [
                $enemy['id'], $enemy['type'], $enemy['row'], $enemy['hp'], $enemy['currentCol'], round($enemy['offsetX'], 6),
            ], $state['enemies'])),
            'seed' => $state['seed'], 'total' => $state['waveTotal'], 'sim' => $state['simulationMs'],
            'points' => onlineScore($state, $rules)['totalScore'],
        ];
    }
    $state = newOnlineState($rules, 0, 123456);
    emptyBoard($state);
    applyOnlineCommand($state, $rules, 'resume', [], 0);
    onlineWave($state, $rules);
    $enemy = onlineSpawnEnemy($state, $rules, 0, 'boss');
    $state['resources'] = ['seeds' => 0, 'stones' => 15, 'wood' => 20];
    applyOnlineCommand($state, $rules, 'place', ['tileId' => 'tile_0_8', 'itemType' => 'cannon'], 0);
    foreach ([10, 100, 300, 1000, 1400, 2800] as $now) {
        catchUp($state, $rules, $now);
        $trace[] = [
            'enemies' => array_values(array_map(fn ($enemy) => [
                $enemy['id'], $enemy['type'], $enemy['row'], $enemy['hp'], $enemy['currentCol'], round($enemy['offsetX'], 6),
            ], $state['enemies'])),
            'projectiles' => array_values(array_map(fn ($p) => [$p['id'], $p['row'], $p['column'], round($p['xOffset'], 6)], $state['projectiles'])),
            'hp' => $state['tiles'][8]['object']['hp'] ?? null,
            'points' => onlineScore($state, $rules)['totalScore'],
        ];
    }
    echo json_encode($trace, JSON_THROW_ON_ERROR);
    exit;
}

$state = newOnlineState($rules, 0, 123456);
applyOnlineCommand($state, $rules, 'set_speed', ['speed' => 3], 0);
applyOnlineCommand($state, $rules, 'resume', [], 0);
checkOnline(advanceOnline($state, $rules, 40000) && $state['simulationMs'] === 3000, 'Limit porcji');
catchUp($state, $rules, 40000);
checkOnline($state['phase'] === 'combat' && $state['simulationMs'] === 120000, 'Fala po 40 s przy 3×');
applyOnlineCommand($state, $rules, 'pause', [], 40000);
catchUp($state, $rules, 55000);
checkOnline($state['simulationMs'] === 120000, 'Pauza zatrzymuje symulację');
applyOnlineCommand($state, $rules, 'set_speed', ['speed' => 1.5], 55000);
applyOnlineCommand($state, $rules, 'resume', [], 55000);
catchUp($state, $rules, 57000);
checkOnline($state['simulationMs'] === 123000 && onlineScore($state, $rules)['points']['time'] === 42, 'Czas i szybkość');
checkOnline(count($state['enemies']) === 1, 'Harmonogram pierwszej fali');

$state = newOnlineState($rules, 0, 42);
emptyBoard($state);
applyOnlineCommand($state, $rules, 'resume', [], 0);
onlineWave($state, $rules);
$id = onlineSpawnEnemy($state, $rules, 0, 'boss');
$state['resources']['wood'] = 10;
applyOnlineCommand($state, $rules, 'place', ['tileId' => 'tile_0_8', 'itemType' => 'woodFence'], 0);
catchUp($state, $rules, 4400);
checkOnline($state['tiles'][8]['object']['hp'] === 5.5, 'Boss zadaje 2,5 obrażeń');
catchUp($state, $rules, 12000);
checkOnline($state['tiles'][8]['object'] === null, 'Boss niszczy budowlę');
applyOnlineCommand($state, $rules, 'hit_enemy', ['enemyId' => $id], 12000);
checkOnline($state['enemies'][$id]['hp'] === 28, 'Kliknięcie zadaje 2 obrażenia');
catchUp($state, $rules, 200000);
checkOnline($state['phase'] === 'lost' && $state['paused'] && $state['finishedMs'] !== null, 'Porażka');

$state = newOnlineState($rules, 0, 42);
emptyBoard($state);
applyOnlineCommand($state, $rules, 'resume', [], 0);
$wall = 0;
foreach ($rules['waves'] as $wave) {
    onlineWave($state, $rules);
    for ($i = 0; $i < $wave['normal'] + $wave['boss']; $i++) {
        $wall += max(500, 3000 - $state['level'] * 200);
        catchUp($state, $rules, $wall);
        checkOnline(count($state['enemies']) === 1, 'Przeciwnik pojawia się raz');
        $enemy = reset($state['enemies']);
        while (isset($state['enemies'][$enemy['id']])) {
            applyOnlineCommand($state, $rules, 'hit_enemy', ['enemyId' => $enemy['id']], $wall);
        }
    }
}
$score = onlineScore($state, $rules);
checkOnline($state['phase'] === 'won' && $state['level'] === 10, 'Dziesięć fal i zwycięstwo');
checkOnline($state['counts']['enemies']['normal'] === 275 && $state['counts']['enemies']['boss'] === 63 &&
    $score['points']['enemies'] === 7705, 'Punktacja przeciwników');
echo "PHP online simulation passed\n";
