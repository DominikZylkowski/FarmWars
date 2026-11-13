<?php
declare(strict_types=1);

require __DIR__ . '/../backend/economy_api.php';

$sql = file_get_contents(__DIR__ . '/../database/003-economy.sql');
preg_match("/\n    '(\{[\s\S]*?\})'\n\)/", $sql, $match);
$rules = json_decode($match[1], true, 32, JSON_THROW_ON_ERROR);
function checkEconomy(bool $condition): void
{
    if (!$condition) {
        throw new RuntimeException('Economy invariant failed');
    }
}

$state = newEconomyState($rules, 1000, 123456);
checkEconomy($state === newEconomyState($rules, 1000, 123456));
advanceEconomy($state, $rules, 5000);
checkEconomy($state['simulationMs'] === 0);
applyEconomyCommand($state, $rules, 'resume', [], 5000);
$grass = array_values(array_filter($state['tiles'], fn ($tile) => ($tile['resource']['kind'] ?? null) === 'grass'))[0];
applyEconomyCommand($state, $rules, 'collect', ['tileId' => $grass['id']], 5000);
checkEconomy($state['resources']['seeds'] === $grass['resource']['size']);
applyEconomyCommand($state, $rules, 'place', ['tileId' => $grass['id'], 'itemType' => 'seedling'], 5000);
$index = array_search($grass['id'], array_column($state['tiles'], 'id'), true);
$id = $state['tiles'][$index]['object']['id'];
applyEconomyCommand($state, $rules, 'set_speed', ['speed' => 2], 5000);
advanceEconomy($state, $rules, 12499);
checkEconomy($state['tiles'][$index]['object']['kind'] === 'seedling');
advanceEconomy($state, $rules, 12500);
checkEconomy($state['tiles'][$index]['object'] === ['id' => $id, 'kind' => 'tree', 'hp' => 5, 'growthAtMs' => null]);
applyEconomyCommand($state, $rules, 'collect', ['tileId' => $grass['id']], 12500);
checkEconomy($state['resources']['wood'] === 2);
applyEconomyCommand($state, $rules, 'pause', [], 12500);
advanceEconomy($state, $rules, 100000);
checkEconomy($state['simulationMs'] === 15000);
applyEconomyCommand($state, $rules, 'resume', [], 100000);
advanceEconomy($state, $rules, 1000000);
checkEconomy($state['simulationMs'] === 120000 && $state['phase'] === 'combat_boundary' && $state['paused']);
echo "PHP economy validation passed\n";
