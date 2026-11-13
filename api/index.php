<?php
declare(strict_types=1);

require __DIR__ . '/../backend/results.php';
require __DIR__ . '/../backend/economy_api.php';

function readRequest(): array
{
    if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') {
        throw new ApiError(415, 'Wymagany jest JSON.');
    }
    $raw = file_get_contents('php://input', false, null, 0, 131073);
    if (strlen($raw) > 131072) {
        throw new ApiError(413, 'Żądanie jest za duże.');
    }
    $data = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
    requireValid(is_array($data));
    return $data;
}

function openFarmWarsSession(): void
{
    ini_set('session.use_strict_mode', '1');
    ini_set('session.gc_maxlifetime', '86400');
    $sessionPath = getenv('FARMWARS_SESSION_PATH');
    if ($sessionPath !== false && $sessionPath !== '') {
        session_save_path($sessionPath);
    }
    ini_set('session.use_only_cookies', '1');
    session_name('FarmWarsSession');
    $script = $_SERVER['SCRIPT_NAME'];
    // Apache może zachować ścieżkę publiczną w SCRIPT_NAME po wewnętrznym rewrite.
    $applicationPath = preg_match('~^(.*)/api/(?:index\.php|v1(?:/.*)?)$~D', $script, $match)
        ? $match[1] : dirname(dirname($script));
    session_set_cookie_params([
        'path' => rtrim($applicationPath, '/') . '/',
        'httponly' => true, 'samesite' => 'Strict',
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    ]);
    if (!session_start()) {
        throw new RuntimeException('Cannot open session');
    }
}

function ensureGuestIdentity(): void
{
    // JSON i brak CORS blokują wywołanie inicjalizujące z obcego originu.
    if (!isset($_SESSION['owner'])) {
        $db = connectDatabase();
        $owner = randomId();
        query($db, 'INSERT INTO guest_identities (id) VALUES (?)', [$owner]);
        if (!session_regenerate_id(true)) {
            throw new RuntimeException('Cannot rotate session');
        }
        $_SESSION['owner'] = $owner;
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
}

function dispatch(): array
{
    $action = $_GET['action'] ?? '';
    requireValid(is_string($action));
    $method = ['session' => 'POST', 'start' => 'POST', 'result' => 'POST', 'history' => 'GET'][$action] ?? null;
    if (!$method) {
        throw new ApiError(404, 'Nieznana operacja.');
    }
    if ($_SERVER['REQUEST_METHOD'] !== $method) {
        header('Allow: ' . $method);
        throw new ApiError(405, 'Niedozwolona metoda.');
    }
    $input = $method === 'POST' ? readRequest() : [];
    openFarmWarsSession();

    if ($action === 'session') {
        ensureGuestIdentity();
        return ['csrf' => $_SESSION['csrf']];
    }

    $owner = $_SESSION['owner'] ?? null;
    $csrf = $_SESSION['csrf'] ?? '';
    session_write_close();
    if (!$owner) {
        throw new ApiError(401, 'Sesja wygasła. Otwórz grę ponownie.');
    }
    if ($method === 'POST' && !hash_equals($csrf, $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) {
        throw new ApiError(403, 'Nieprawidłowy token sesji.');
    }

    $db = connectDatabase();
    if ($action === 'start') {
        $id = $input['clientRunId'] ?? null;
        requireValid(is_string($id) && preg_match('/^[A-Za-z0-9_-]{1,80}$/D', $id) === 1);
        return ['runId' => registerRun($db, $owner, $id)];
    }
    if ($action === 'result') {
        saveResult($db, $owner, $input);
        return ['saved' => true];
    }
    $offset = filter_var($_GET['offset'] ?? 0, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0, 'max_range' => 1000000]]);
    requireValid($offset !== false);
    return readHistory($db, $owner, $offset);
}

ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
try {
    if (array_key_exists('v1', $_GET)) {
        sendEconomyResponse();
    } else {
        echo encodeJson(dispatch());
    }
} catch (ApiError $error) {
    http_response_code($error->getCode());
    echo encodeJson(['error' => $error->getMessage()]);
} catch (InvalidArgumentException | JsonException $error) {
    http_response_code(400);
    echo encodeJson(['error' => 'Nieprawidłowe dane żądania.']);
} catch (Throwable $error) {
    error_log('FarmWars API: ' . get_class($error) . ' (' . $error->getCode() . ')');
    http_response_code(503);
    echo encodeJson(['error' => 'Zapis online jest chwilowo niedostępny. Spróbuj ponownie.']);
}
