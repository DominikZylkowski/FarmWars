<?php
declare(strict_types=1);
// Fixture uruchamiana wyłącznie z CLI i tylko na osobnej bazie testowej.
require __DIR__ . '/../backend/results.php';
require __DIR__ . '/../backend/economy_api.php';
if (PHP_SAPI !== 'cli' || getenv('FARMWARS_ONLINE_FIXTURE') !== '1') {
    exit(1);
}
$db = connectDatabase();
[$script, $id, $scenario] = $argv;
$run = query($db, "SELECT state_json, ruleset_id FROM economy_runs WHERE id = ? AND ruleset_id = 'farmwars-online-1'",
    [$id])->fetch();
$state = json_decode($run['state_json'], true, 32, JSON_THROW_ON_ERROR);
$rules = economyRules($db, $run['ruleset_id']);
if ($scenario === 'combat') {
    $now = economyNow();
    $state['createdMs'] = $now - 41000;
    $state['anchorMs'] = 0;
    $state['paused'] = true;
    applyOnlineCommand($state, $rules, 'set_speed', ['speed' => 3], $state['createdMs']);
    applyOnlineCommand($state, $rules, 'resume', [], $state['createdMs']);
    while (advanceOnline($state, $rules, $now)) {
    }
} elseif ($scenario === 'disconnect') {
    $state['createdMs'] -= 200000;
} else {
    exit(1);
}
query($db, 'UPDATE economy_runs SET revision = revision + 1, state_json = ? WHERE id = ?', [encodeJson($state), $id]);
