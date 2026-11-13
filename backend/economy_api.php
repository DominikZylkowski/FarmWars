<?php
declare(strict_types=1);

require __DIR__ . '/economy.php';
require __DIR__ . '/online.php';

final class ApiError extends RuntimeException
{
    public string $apiCode;
    public array $details;

    public function __construct(int $status, string $message, string $apiCode = '', array $details = [])
    {
        parent::__construct($message, $status);
        $this->apiCode = $apiCode;
        $this->details = $details;
    }
}

function economyErrorResponse(ApiError $error): array
{
    $body = ['ok' => false, 'error' => ['code' => $error->apiCode, 'message' => $error->getMessage()]];
    if ($error->details) {
        $body['error']['details'] = $error->details;
    }
    if ($error->apiCode === 'REVISION_CONFLICT') {
        $body['data'] = $error->details;
    }
    return [$error->getCode(), $body];
}

function economySuccess(int $status, array $data): array
{
    return [$status, ['ok' => true, 'data' => $data]];
}

function badEconomyRequest(): ApiError
{
    return new ApiError(400, 'Nieprawidłowa struktura żądania.', 'BAD_REQUEST');
}

function economyBody(): array
{
    if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') {
        throw new ApiError(415, 'Wymagany jest JSON.', 'BAD_REQUEST');
    }
    $raw = file_get_contents('php://input', false, null, 0, 4097);
    if ($raw === false || strlen($raw) > 4096) {
        throw new ApiError(413, 'Żądanie jest za duże.', 'BAD_REQUEST');
    }
    try {
        $object = json_decode($raw, false, 16, JSON_THROW_ON_ERROR);
    } catch (JsonException $error) {
        throw badEconomyRequest();
    }
    if (!$object instanceof stdClass) {
        throw badEconomyRequest();
    }
    return get_object_vars($object);
}

function exactEconomyKeys(array $input, array $expected): void
{
    $actual = array_keys($input);
    sort($actual);
    sort($expected);
    if ($actual !== $expected) {
        throw badEconomyRequest();
    }
}

function economyIdentifier(mixed $value): bool
{
    return is_string($value) && preg_match('/^[A-Za-z0-9_-]{1,80}$/D', $value) === 1;
}

function parseEconomyCommand(array $input): array
{
    exactEconomyKeys($input, ['commandId', 'expectedRevision', 'type', 'payload']);
    if (!economyIdentifier($input['commandId']) || !is_int($input['expectedRevision']) ||
        $input['expectedRevision'] < 0 || $input['expectedRevision'] > 4294967295 ||
        !is_string($input['type']) || !$input['payload'] instanceof stdClass) {
        throw badEconomyRequest();
    }
    $payload = get_object_vars($input['payload']);
    $commandKeys = [
        'collect' => ['tileId'],
        'hit_enemy' => ['enemyId'],
        'place' => ['tileId', 'itemType'],
        'pause' => [],
        'resume' => [],
        'set_speed' => ['speed'],
    ];
    $type = $input['type'];
    if (!isset($commandKeys[$type])) {
        throw new ApiError(422, 'Nieznany rodzaj komendy.', 'INVALID_ACTION');
    }
    exactEconomyKeys($payload, $commandKeys[$type]);
    foreach ($payload as $key => $value) {
        if ($key === 'speed') {
            $valid = is_int($value) || is_float($value);
        } elseif ($key === 'enemyId') {
            $valid = is_int($value) && $value > 0;
        } else {
            $valid = economyIdentifier($value);
        }
        if (!$valid) {
            throw new ApiError(422, 'Nieprawidłowy argument komendy.', 'INVALID_ACTION');
        }
    }
    ksort($payload);
    return [$input['commandId'], $input['expectedRevision'], $type, $payload];
}

function limitEconomyRequests(string $bucket, int $limit): void
{
    $now = time();
    $times = [];
    foreach ($_SESSION['economy_limits'][$bucket] ?? [] as $at) {
        if ($at > $now - 60) {
            $times[] = $at;
        }
    }
    if (count($times) >= $limit) {
        header('Retry-After: ' . max(1, $times[0] + 60 - $now));
        throw new ApiError(429, 'Zbyt wiele żądań. Spróbuj za chwilę.', 'RATE_LIMITED');
    }
    $times[] = $now;
    $_SESSION['economy_limits'][$bucket] = $times;
}

function economyRules(PDO $db, string $id): array
{
    $json = query($db, 'SELECT config_json FROM game_rulesets WHERE id = ?', [$id])->fetchColumn();
    return json_decode($json, true, 32, JSON_THROW_ON_ERROR);
}

function economyNow(): int
{
    return (int) floor(microtime(true) * 1000);
}

function createEconomyRun(PDO $db, string $owner, string $requestId, string $mode): array
{
    $select = 'SELECT initial_json FROM economy_runs WHERE identity_id = ? AND request_id = ?';
    $saved = query($db, $select, [$owner, $requestId])->fetchColumn();
    if ($saved === false) {
        $ruleset = $mode === 'online' ? 'farmwars-online-1' : 'farmwars-economy-1';
        $rules = economyRules($db, $ruleset);
        $now = economyNow();
        $id = randomId();
        $seed = random_int(1, 0xffffffff);
        $state = $mode === 'online' ? newOnlineState($rules, $now, $seed) : newEconomyState($rules, $now, $seed);
        $initial = ['runId' => $id, 'revision' => 0, 'rulesetId' => $ruleset, 'mode' => $mode,
            'state' => publicRunState($state, $id, 0, $ruleset, $rules, $now)];
        query($db, 'INSERT INTO economy_runs (id, identity_id, request_id, ruleset_id, state_json, initial_json)
            VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = id',
            [$id, $owner, $requestId, $ruleset, encodeJson($state), encodeJson($initial)]);
        // Jeśli drugi start zapisał partię w międzyczasie, zwróć zapisaną wersję.
        $saved = query($db, $select, [$owner, $requestId])->fetchColumn();
    }
    $data = json_decode($saved, true, 32, JSON_THROW_ON_ERROR);
    if ($data['mode'] !== $mode) {
        throw new ApiError(409, 'Identyfikator startu był użyty w innym trybie.', 'IDEMPOTENCY_CONFLICT');
    }
    return economySuccess(201, $data);
}

function writeEconomyState(PDO $db, string $id, int $revision, array $state): void
{
    query($db, 'UPDATE economy_runs SET revision = ?, state_json = ? WHERE id = ?', [$revision, encodeJson($state), $id]);
}

function economyRunOperation(PDO $db, string $owner, string $id, ?array $command): array
{
    $db->beginTransaction();
    try {
        $run = query($db, 'SELECT revision, ruleset_id, state_json FROM economy_runs WHERE id = ? AND identity_id = ? FOR UPDATE',
            [$id, $owner])->fetch();
        if (!$run) {
            throw new ApiError(404, 'Nie znaleziono partii.', 'RUN_NOT_FOUND');
        }
        if ($command !== null) {
            [$commandId, $expectedRevision, $type, $payload] = $command;
            $hash = hash('sha256', encodeJson([$expectedRevision, $type, (object) $payload]));
            $saved = query($db, 'SELECT request_hash, http_status, response_json FROM economy_commands WHERE run_id = ? AND command_id = ?',
                [$id, $commandId])->fetch();
            if ($saved) {
                if (!hash_equals($saved['request_hash'], $hash)) {
                    throw new ApiError(409, 'Identyfikator komendy był już użyty.', 'IDEMPOTENCY_CONFLICT');
                }
                $db->commit();
                // Przy ponowieniu puste obiekty JSON mają zostać obiektami.
                $body = json_decode($saved['response_json'], false, 32, JSON_THROW_ON_ERROR);
                return [(int) $saved['http_status'], $body];
            }
        }

        $now = economyNow();
        $ruleset = $run['ruleset_id'];
        $rules = economyRules($db, $ruleset);
        $savedRevision = (int) $run['revision'];
        $revision = $savedRevision;
        $state = json_decode($run['state_json'], true, 32, JSON_THROW_ON_ERROR);
        $online = isset($state['schemaVersion']);
        if ($online) {
            // MySQL JSON może zmienić kolejność kluczy obiektów.
            foreach (['tasks', 'enemies', 'projectiles'] as $collection) {
                ksort($state[$collection], SORT_NUMERIC);
            }
        }
        $before = $state;
        $catchingUp = false;
        if ($online) {
            $catchingUp = advanceOnline($state, $rules, $now);
        } else {
            advanceEconomy($state, $rules, $now);
            if ($before['tiles'] !== $state['tiles'] || $before['phase'] !== $state['phase']) {
                // W podglądzie zmiana planszy przez upływ czasu ma własną rewizję.
                $revision++;
            }
        }

        $commandError = null;
        if ($command !== null) {
            try {
                if ($expectedRevision !== $revision) {
                    throw new ApiError(409, 'Stan rozgrywki jest nieaktualny.', 'REVISION_CONFLICT');
                }
                if ($catchingUp) {
                    throw new ApiError(409, 'Serwer rozlicza zaległą symulację.', 'SIMULATION_CATCH_UP');
                }
                if ($online) {
                    applyOnlineCommand($state, $rules, $type, $payload, $now);
                } elseif ($type === 'hit_enemy') {
                    throw new ApiError(422, 'Walka jest dostępna w pełnym trybie online.', 'INVALID_ACTION');
                } else {
                    applyEconomyCommand($state, $rules, $type, $payload, $now);
                }
            } catch (ApiError $error) {
                $commandError = $error;
            }
        }

        $nextRevision = $revision;
        if (($command !== null && $commandError === null) || ($online && $before !== $state)) {
            $nextRevision++;
        }
        if ($nextRevision !== $savedRevision) {
            writeEconomyState($db, $id, $nextRevision, $state);
            if ($online && $before['finishedMs'] === null && $state['finishedMs'] !== null) {
                persistOnlineResult($db, $id, $owner, $ruleset, $state, $rules);
            }
        }
        if ($command === null) {
            $view = publicRunState($state, $id, $nextRevision, $ruleset, $rules, $now, $catchingUp);
            $db->commit();
            return economySuccess(200, $view);
        }
        if ($commandError !== null) {
            if ($online || $commandError->apiCode === 'REVISION_CONFLICT') {
                $commandError->details['currentRevision'] = $nextRevision;
            }
            $response = economyErrorResponse($commandError);
        } else {
            $view = publicRunState($state, $id, $nextRevision, $ruleset, $rules, $now, $catchingUp);
            $changedTiles = [];
            foreach ($view['tiles'] as $index => $tile) {
                if ($state['tiles'][$index] !== $before['tiles'][$index]) {
                    $changedTiles[] = $tile;
                }
            }
            $view['tiles'] = $changedTiles;
            unset($view['runId'], $view['revision'], $view['rulesetId'], $view['mode']);
            $response = economySuccess(200, ['runId' => $id, 'commandId' => $commandId, 'previousRevision' => $revision,
                'revision' => $nextRevision, 'applied' => true, 'changes' => $view]);
        }

        query($db, 'INSERT INTO economy_commands (run_id, command_id, request_hash, http_status, response_json)
            VALUES (?, ?, ?, ?, ?)', [$id, $commandId, $hash, $response[0], encodeJson($response[1])]);
        $db->commit();
        return $response;
    } catch (Throwable $error) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $error;
    }
}

function dispatchEconomy(): array
{
    $path = $_GET['v1'];
    $runId = null;
    if ($path === 'session' || $path === 'runs') {
        $operation = $path;
    } elseif (is_string($path) && preg_match('~^runs/([a-f0-9]{32})/(state|commands)$~D', $path, $match)) {
        [, $runId, $operation] = $match;
    } else {
        throw new ApiError(404, 'Nie znaleziono zasobu API.', 'RUN_NOT_FOUND');
    }
    $method = $operation === 'state' ? 'GET' : 'POST';
    if ($_SERVER['REQUEST_METHOD'] !== $method) {
        header('Allow: ' . $method);
        throw new ApiError(405, 'Niedozwolona metoda.', 'BAD_REQUEST');
    }
    $input = $method === 'POST' ? economyBody() : [];
    session_cache_limiter('');
    openFarmWarsSession();
    try {
        if ($operation === 'session') {
            exactEconomyKeys($input, []);
            limitEconomyRequests('session', 20);
            ensureGuestIdentity();
            return economySuccess(200, ['csrf' => $_SESSION['csrf']]);
        }
        $owner = $_SESSION['owner'] ?? null;
        if (!$owner) {
            throw new ApiError(401, 'Sesja wygasła. Otwórz grę ponownie.', 'UNAUTHENTICATED');
        }
        if ($method === 'POST' && !hash_equals($_SESSION['csrf'], $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) {
            throw new ApiError(403, 'Nieprawidłowy token sesji.', 'INVALID_CSRF');
        }
        if ($operation === 'state') {
            limitEconomyRequests('state', 360);
        } else {
            limitEconomyRequests('operations', 900);
        }
        if ($operation === 'runs') {
            limitEconomyRequests('runs', 10);
        }
    } finally {
        session_write_close();
    }

    if ($operation === 'runs') {
        exactEconomyKeys($input, array_key_exists('mode', $input) ? ['requestId', 'mode'] : ['requestId']);
        $mode = $input['mode'] ?? 'economy_preview';
        if (!economyIdentifier($input['requestId']) ||
            (array_key_exists('mode', $input) && !in_array($input['mode'], ['online', 'economy_preview'], true))) {
            throw badEconomyRequest();
        }
        return createEconomyRun(connectDatabase(), $owner, $input['requestId'], $mode);
    }
    $command = $operation === 'commands' ? parseEconomyCommand($input) : null;
    return economyRunOperation(connectDatabase(), $owner, $runId, $command);
}

function sendEconomyResponse(): void
{
    try {
        [$status, $body] = dispatchEconomy();
    } catch (ApiError $error) {
        [$status, $body] = economyErrorResponse($error);
    } catch (Throwable $error) {
        error_log('FarmWars economy: ' . get_class($error) . ' (' . $error->getCode() . ')');
        $driverCode = $error instanceof PDOException ? ($error->errorInfo[1] ?? null) : null;
        $unavailable = $error instanceof PDOException && (str_starts_with((string) $error->getCode(), '08') ||
            in_array($driverCode, [1040, 1044, 1045, 1049, 1205, 1213, 2002, 2003, 2006, 2013], true));
        if ($unavailable) {
            $apiError = new ApiError(503, 'Baza danych jest chwilowo niedostępna.', 'DATABASE_UNAVAILABLE');
        } else {
            $apiError = new ApiError(500, 'Wystąpił błąd serwera.', 'INTERNAL_ERROR');
        }
        [$status, $body] = economyErrorResponse($apiError);
    }
    http_response_code($status);
    echo encodeJson($body);
}
