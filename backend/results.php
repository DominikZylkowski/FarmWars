<?php
declare(strict_types=1);

function connectDatabase(): PDO
{
    $dsn = getenv('FARMWARS_DSN');
    $user = getenv('FARMWARS_DB_USER');
    $password = getenv('FARMWARS_DB_PASSWORD');
    if (!$dsn || !$user || $password === false) {
        throw new RuntimeException('Missing database configuration');
    }
    $db = new PDO($dsn, $user, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $db->exec("SET time_zone = '+00:00'");
    return $db;
}

function query(PDO $db, string $sql, array $parameters = []): PDOStatement
{
    $statement = $db->prepare($sql);
    $statement->execute($parameters);
    return $statement;
}

function requireValid(bool $condition): void
{
    if (!$condition) {
        throw new InvalidArgumentException('Nieprawidłowe dane partii lub profilu.');
    }
}

function validateResult(array $input, array $rules): array
{
    $nickname = $input['nickname'] ?? null;
    requireValid(is_string($nickname));
    $nickname = preg_replace('/^[\s\x{FEFF}]+|[\s\x{FEFF}]+$/u', '', $nickname);
    requireValid(is_string($nickname) && preg_match('/^.{3,20}$/usD', $nickname) === 1 &&
        preg_match('/[\x{0000}-\x{001F}\x{007F}-\x{009F}\x{202A}-\x{202E}\x{2066}-\x{2069}]/u', $nickname) === 0);
    $summary = $input['summary'] ?? null;
    requireValid(is_array($summary) && in_array($summary['schemaVersion'] ?? null, [2, 3], true) &&
        ($summary['rulesetId'] ?? null) === 'farmwars-1' &&
        in_array($summary['status'] ?? null, ['won', 'lost'], true));
    $active = $summary['activeTimeSeconds'] ?? null;
    requireValid(validTime($active));
    $speeds = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 2.75, 3.0];
    foreach (['initialGameSpeed', 'gameSpeed'] as $field) {
        $speed = $summary[$field] ?? null;
        requireValid((is_int($speed) || is_float($speed)) && in_array((float) $speed, $speeds, true));
    }
    $history = $summary['speedHistory'] ?? null;
    requireValid(is_array($history) && $history !== []);
    $previous = null;
    $normalizedHistory = [];
    foreach ($history as $index => $entry) {
        requireValid($index === count($normalizedHistory) && is_array($entry) && count($entry) === 3);
        $at = $entry['atActiveSeconds'] ?? null;
        $sim = $entry['atSimulationSeconds'] ?? null;
        $speed = $entry['gameSpeed'] ?? null;
        requireValid(validTime($at) && validTime($sim) && $at <= $active &&
            (is_int($speed) || is_float($speed)) && in_array((float) $speed, $speeds, true));
        if ($previous === null) {
            requireValid($at == 0 && $sim == 0 && $speed == ($summary['initialGameSpeed'] ?? null));
        } else {
            $expected = $previous['atSimulationSeconds'] + ($at - $previous['atActiveSeconds']) * $previous['gameSpeed'];
            requireValid($at >= $previous['atActiveSeconds'] && $speed != $previous['gameSpeed']);
            requireValid(nearTime($sim, $expected));
        }
        $previous = ['atActiveSeconds' => $at, 'atSimulationSeconds' => $sim, 'gameSpeed' => $speed];
        $normalizedHistory[] = $previous;
    }
    $simulation = $summary['simulationTimeSeconds'] ?? null;
    $expected = $previous['atSimulationSeconds'] + ($active - $previous['atActiveSeconds']) * $previous['gameSpeed'];
    requireValid(validTime($simulation) && $previous['gameSpeed'] == ($summary['gameSpeed'] ?? null));
    requireValid(nearTime($simulation, $expected));
    $scoringTime = $summary['schemaVersion'] === 3 ? $simulation : $active;
    $points = ['time' => (int) floor($scoringTime) * $rules['pointsPerSecond']];
    $counts = [];
    $maps = [];
    foreach (['items' => 'itemsCrafted', 'enemies' => 'enemiesDefeated', 'resources' => 'resourcesCollected'] as $category => $field) {
        $map = $summary[$category . 'ByType'] ?? null;
        requireValid(is_array($map));
        $points[$category] = 0;
        foreach ($map as $type => $count) {
            requireValid(isset($rules[$category][$type]) && is_int($count) && $count >= 0 && $count <= 4294967295);
            $points[$category] += $count * $rules[$category][$type];
        }
        $counts[$category] = array_sum($map);
        requireValid($counts[$category] <= 4294967295 && $counts[$category] === ($summary[$field] ?? null));
        ksort($map);
        $maps[$category] = (object) $map;
    }
    $submittedPoints = $summary['points'] ?? null;
    requireValid(is_array($submittedPoints) && count($submittedPoints) === 4);
    foreach ($points as $category => $value) {
        requireValid($value === ($submittedPoints[$category] ?? null));
    }
    $total = array_sum($points);
    requireValid($total === ($summary['totalScore'] ?? null));
    return [
        'nickname' => $nickname, 'status' => $summary['status'], 'activeMs' => (int) round($active * 1000),
        'total' => $total, 'points' => $points, 'counts' => $counts, 'maps' => $maps,
        'extra' => ['simulationTimeSeconds' => $simulation, 'speedHistory' => $normalizedHistory],
    ];
}

function validTime(mixed $value): bool
{
    return (is_int($value) || is_float($value)) && $value >= 0 && $value <= 31536000;
}

function nearTime(float $left, float $right): bool
{
    return abs($left - $right) <= 0.000001 * max(1, abs($left), abs($right));
}

function randomId(): string
{
    return bin2hex(random_bytes(16));
}

function encodeJson(mixed $value): string
{
    return json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
}

function registerRun(PDO $db, string $owner, string $clientId): string
{
    query($db, "INSERT INTO game_runs (id, identity_id, client_run_id, ruleset_id, summary_schema_version)
        VALUES (?, ?, ?, 'farmwars-1', 2) ON DUPLICATE KEY UPDATE id = id", [randomId(), $owner, $clientId]);
    return query($db, 'SELECT id FROM game_runs WHERE identity_id = ? AND client_run_id = ?', [$owner, $clientId])->fetchColumn();
}

function findOrCreatePlayer(PDO $db, string $owner, string $nickname): string
{
    query($db, 'INSERT INTO players (id, identity_id, nickname) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE last_used_at = CURRENT_TIMESTAMP(3)', [randomId(), $owner, $nickname]);
    return query($db, 'SELECT id FROM players WHERE identity_id = ? AND nickname = ?',
        [$owner, $nickname])->fetchColumn();
}

function saveRunDetails(PDO $db, string $id, array $result, string $validationLevel, string $hash): void
{
    $counts = $result['counts'];
    $maps = $result['maps'];
    query($db, 'INSERT INTO run_statistics
        (run_id, items_crafted, enemies_defeated, resources_collected, items_by_type, enemies_by_type, resources_by_type, extra_stats)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
        $id, $counts['items'], $counts['enemies'], $counts['resources'],
        encodeJson($maps['items']), encodeJson($maps['enemies']), encodeJson($maps['resources']),
        encodeJson($result['extra']),
    ]);

    $points = $result['points'];
    query($db, 'INSERT INTO run_scores
        (run_id, nickname_snapshot, total_score, time_points, item_points, enemy_points, resource_points,
         validation_level, is_ranked, submission_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)', [
        $id, $result['nickname'], $result['total'], $points['time'], $points['items'],
        $points['enemies'], $points['resources'], $validationLevel, $hash,
    ]);
}

function saveResult(PDO $db, string $owner, array $input): void
{
    $id = $input['runId'] ?? null;
    requireValid(is_string($id) && preg_match('/^[a-f0-9]{32}$/D', $id) === 1);
    $db->beginTransaction();
    try {
        $run = query($db, 'SELECT client_run_id, status, ruleset_id, finish_payload_hash FROM game_runs
            WHERE id = ? AND identity_id = ? AND ruleset_id = ? FOR UPDATE', [$id, $owner, 'farmwars-1'])->fetch();
        if (!$run) {
            throw new ApiError(404, 'Nie znaleziono partii.');
        }
        requireValid(($input['summary']['runId'] ?? null) === $run['client_run_id']);
        $config = query($db, 'SELECT config_json FROM game_rulesets WHERE id = ?', [$run['ruleset_id']])->fetchColumn();
        $result = validateResult($input, json_decode($config, true, 32, JSON_THROW_ON_ERROR)['scoring']);
        $hash = hash('sha256', encodeJson($result));
        if ($run['status'] !== 'active') {
            if ($run['finish_payload_hash'] !== $hash) {
                throw new ApiError(409, 'Partia ma już zapisany wynik.');
            }
            $db->commit();
            return;
        }
        $player = findOrCreatePlayer($db, $owner, $result['nickname']);
        query($db, 'UPDATE game_runs SET player_id = ?, status = ?, finished_at = CURRENT_TIMESTAMP(3),
            active_time_ms = ?, finish_payload_hash = ? WHERE id = ?',
            [$player, $result['status'], $result['activeMs'], $hash, $id]);
        saveRunDetails($db, $id, $result, 'client_reported', $hash);
        $db->commit();
    } catch (Throwable $error) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $error;
    }
}

function persistOnlineResult(PDO $db, string $id, string $owner, string $ruleset, array $state, array $rules): void
{
    $nickname = 'Gracz online';
    $player = findOrCreatePlayer($db, $owner, $nickname);
    $score = onlineScore($state, $rules);
    query($db, 'INSERT INTO game_runs (id, identity_id, player_id, client_run_id, ruleset_id, summary_schema_version,
        status, started_at, finished_at, active_time_ms, reached_level)
        VALUES (?, ?, ?, ?, ?, 2, ?, ?, ?, ?, ?)', [
        $id, $owner, $player, 'server:' . $id, $ruleset, $state['phase'], onlineDate($state['createdMs']),
        onlineDate($state['finishedMs']), $score['activeTimeMs'], $state['level'],
    ]);

    $result = [
        'nickname' => $nickname,
        'total' => $score['totalScore'],
        'points' => $score['points'],
        'counts' => [
            'items' => array_sum($state['counts']['items']),
            'enemies' => array_sum($state['counts']['enemies']),
            'resources' => array_sum($state['counts']['resources']),
        ],
        'maps' => $score['counts'],
        'extra' => ['speedHistory' => $score['speedHistory'], 'simulationMs' => $state['simulationMs']],
    ];
    saveRunDetails($db, $id, $result, 'server_simulated', hash('sha256', encodeJson($score)));
}

function readHistory(PDO $db, string $owner, int $offset): array
{
    $statement = $db->prepare("SELECT r.id AS runId, r.player_id AS playerId, s.nickname_snapshot AS nickname,
        s.total_score AS totalScore, r.status, s.validation_level AS validationLevel,
        r.finished_at AS finishedAt
        FROM game_runs r JOIN run_scores s ON s.run_id = r.id
        WHERE r.identity_id = ? ORDER BY s.saved_at DESC, r.id DESC LIMIT 101 OFFSET ?");
    $statement->bindValue(1, $owner);
    $statement->bindValue(2, $offset, PDO::PARAM_INT);
    $statement->execute();
    $rows = $statement->fetchAll();
    $hasMore = count($rows) > 100;
    if ($hasMore) {
        array_pop($rows);
    }
    foreach ($rows as $index => $row) {
        $row['totalScore'] = (int) $row['totalScore'];
        $row['finishedAt'] = str_replace(' ', 'T', $row['finishedAt']) . 'Z';
        if ($row['validationLevel'] !== 'server_simulated') {
            unset($row['validationLevel']);
        }
        $rows[$index] = $row;
    }
    return ['results' => $rows, 'nextOffset' => $hasMore ? $offset + 100 : null];
}
