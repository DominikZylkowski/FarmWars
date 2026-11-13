<?php
declare(strict_types=1);

require __DIR__ . '/../backend/results.php';

$sql = file_get_contents(__DIR__ . '/../database/farmwars.sql');
preg_match("/\n    '(\{[\s\S]*?\})'\n\);/", $sql, $match);
$rules = json_decode($match[1], true, 32, JSON_THROW_ON_ERROR)['scoring'];
$input = [
    'nickname' => '  Żaba  ',
    'summary' => [
        'schemaVersion' => 2, 'rulesetId' => 'farmwars-1', 'status' => 'won',
        'activeTimeSeconds' => 2.5, 'simulationTimeSeconds' => 3.5,
        'initialGameSpeed' => 1, 'gameSpeed' => 2,
        'speedHistory' => [
            ['atActiveSeconds' => 0, 'atSimulationSeconds' => 0, 'gameSpeed' => 1],
            ['atActiveSeconds' => 1.5, 'atSimulationSeconds' => 1.5, 'gameSpeed' => 2],
        ],
        'itemsByType' => ['cannon' => 1], 'enemiesByType' => ['boss' => 1],
        'resourcesByType' => ['tree' => 1],
        'itemsCrafted' => 1, 'enemiesDefeated' => 1, 'resourcesCollected' => 1,
        'points' => ['time' => 2, 'items' => 10, 'enemies' => 35, 'resources' => 12], 'totalScore' => 59,
    ],
];
$result = validateResult($input, $rules);
if ($result['nickname'] !== 'Żaba' || $result['activeMs'] !== 2500 || $result['total'] !== 59) {
    throw new RuntimeException('Incorrect normalized result');
}
foreach ([
    ['totalScore' => 60], ['simulationTimeSeconds' => 4], ['itemsByType' => ['unknown' => 1]],
    ['status' => 'active'], ['enemiesDefeated' => '1'], ['speedHistory' => []],
    ['gameSpeed' => '2'],
] as $override) {
    $invalid = $input;
    $invalid['summary'] = array_replace($input['summary'], $override);
    try {
        validateResult($invalid, $rules);
    } catch (InvalidArgumentException $error) {
        continue;
    }
    throw new RuntimeException('Accepted invalid summary: ' . encodeJson($override));
}
echo "PHP result validation passed\n";
