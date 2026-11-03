-- FarmWars: proponowany schemat poczatkowy, wersja 1.
-- Cel: przyszly import do phpMyAdmin. Plik NIE zostal uruchomiony.
-- Wymagania: MariaDB 10.4+ lub MySQL 8.0.16+, InnoDB, utf8mb4.
-- Import tylko do nowej/pustej bazy; to nie jest migracja istniejacego schematu.
-- Brak DROP, TRUNCATE, kont uzytkownikow i danych graczy.
-- DDL moze wykonywac implicit commit: import nie jest atomowy.
-- Hosting z narzucona nazwa bazy: pomin CREATE DATABASE i USE,
-- a nastepnie importuj pozostala tresc do bazy wybranej w phpMyAdmin.
-- DATETIME(3) w calym projekcie oznacza UTC; PDO musi ustawic time_zone.

CREATE DATABASE IF NOT EXISTS farmwars
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE farmwars;
SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- Losowe identyfikatory CHAR(32): PHP bin2hex(random_bytes(16)).
-- Identyfikator nie jest sekretem ani tokenem uwierzytelniania.
CREATE TABLE guest_identities (
    id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Opcjonalne trwale rozpoznawanie goscia, niezalezne od PHPSESSID.
-- Cookie: selector.secret. Baza przechowuje jedynie SHA-256 sekretu.
CREATE TABLE guest_tokens (
    selector CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    identity_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    secret_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    expires_at DATETIME(3) NOT NULL,
    last_used_at DATETIME(3) NULL,
    PRIMARY KEY (selector),
    KEY idx_guest_tokens_identity (identity_id),
    KEY idx_guest_tokens_expiry (expires_at),
    CONSTRAINT fk_guest_tokens_identity FOREIGN KEY (identity_id)
        REFERENCES guest_identities (id) ON DELETE CASCADE,
    CONSTRAINT chk_guest_token_expiry CHECK (expires_at > created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Nick jest unikalny tylko w ramach lokalnego zestawu profili wlasciciela.
-- Rozni wlasciciele moga uzywac tego samego nicku. PHP trimuje nazwe.
CREATE TABLE players (
    id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    identity_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    nickname VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    last_used_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_players_owner_nickname (identity_id, nickname),
    UNIQUE KEY uq_players_id_owner (id, identity_id),
    CONSTRAINT fk_players_identity FOREIGN KEY (identity_id)
        REFERENCES guest_identities (id) ON DELETE RESTRICT,
    CONSTRAINT chk_player_nickname_length CHECK (CHAR_LENGTH(nickname) BETWEEN 3 AND 20)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Opublikowanych wersji nie aktualizujemy; zmiana regul = nowy id.
-- JSON jest typem natywnym w MySQL i aliasem LONGTEXT w MariaDB.
CREATE TABLE game_rulesets (
    id VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    schema_version SMALLINT UNSIGNED NOT NULL,
    config_json JSON NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    CONSTRAINT chk_ruleset_schema CHECK (schema_version >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Profil moze zostac wybrany dopiero przy zatwierdzaniu wyniku.
-- Dlatego player_id jest poczatkowo NULL, a wlasciciel jest znany od startu.
CREATE TABLE game_runs (
    id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    identity_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    player_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
    client_run_id VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    ruleset_id VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    summary_schema_version SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    status ENUM('active', 'paused', 'won', 'lost', 'abandoned') NOT NULL DEFAULT 'active',
    source ENUM('online', 'local_import') NOT NULL DEFAULT 'online',
    started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    finished_at DATETIME(3) NULL,
    client_finished_at DATETIME(3) NULL,
    active_time_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
    reached_level SMALLINT UNSIGNED NULL,
    finish_payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_runs_owner_client (identity_id, client_run_id),
    KEY idx_runs_owner_started (identity_id, started_at),
    KEY idx_runs_player_finished (player_id, finished_at),
    KEY idx_runs_player_owner (player_id, identity_id),
    KEY idx_runs_ruleset (ruleset_id),
    CONSTRAINT fk_runs_identity FOREIGN KEY (identity_id)
        REFERENCES guest_identities (id) ON DELETE RESTRICT,
    CONSTRAINT fk_runs_player_owner FOREIGN KEY (player_id, identity_id)
        REFERENCES players (id, identity_id) ON DELETE RESTRICT,
    CONSTRAINT fk_runs_ruleset FOREIGN KEY (ruleset_id)
        REFERENCES game_rulesets (id) ON DELETE RESTRICT,
    CONSTRAINT chk_runs_level CHECK (reached_level IS NULL OR reached_level >= 1),
    CONSTRAINT chk_runs_schema CHECK (summary_schema_version >= 1),
    CONSTRAINT chk_runs_finish_time CHECK (finished_at IS NULL OR finished_at >= started_at),
    CONSTRAINT chk_runs_terminal CHECK (
        (status IN ('won', 'lost', 'abandoned') AND finished_at IS NOT NULL)
        OR (status IN ('active', 'paused') AND finished_at IS NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE run_statistics (
    run_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    items_crafted INT UNSIGNED NOT NULL,
    enemies_defeated INT UNSIGNED NOT NULL,
    resources_collected INT UNSIGNED NOT NULL,
    items_by_type JSON NOT NULL,
    enemies_by_type JSON NOT NULL,
    resources_by_type JSON NOT NULL,
    resources_gathered JSON NULL,
    resources_spent JSON NULL,
    extra_stats JSON NULL,
    PRIMARY KEY (run_id),
    CONSTRAINT fk_statistics_run FOREIGN KEY (run_id)
        REFERENCES game_runs (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PK(run_id) jest ostateczna blokada ponownego zapisu tej samej partii.
-- PHP sprawdza w tej samej transakcji: wlasciciela, profil, won/lost i statystyki.
CREATE TABLE run_scores (
    run_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    nickname_snapshot VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    total_score BIGINT UNSIGNED NOT NULL,
    time_points BIGINT UNSIGNED NOT NULL,
    item_points BIGINT UNSIGNED NOT NULL,
    enemy_points BIGINT UNSIGNED NOT NULL,
    resource_points BIGINT UNSIGNED NOT NULL,
    validation_level ENUM('client_reported', 'consistency_checked', 'replay_verified')
        NOT NULL DEFAULT 'consistency_checked',
    is_ranked TINYINT UNSIGNED NOT NULL DEFAULT 1,
    submission_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    saved_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (run_id),
    KEY idx_scores_ranked_score (is_ranked, total_score),
    KEY idx_scores_saved (saved_at),
    CONSTRAINT fk_scores_run FOREIGN KEY (run_id)
        REFERENCES game_runs (id) ON DELETE RESTRICT,
    CONSTRAINT chk_score_nickname_length CHECK (CHAR_LENGTH(nickname_snapshot) BETWEEN 3 AND 20),
    CONSTRAINT chk_score_ranked CHECK (is_ranked IN (0, 1)),
    CONSTRAINT chk_score_total CHECK (
        total_score = time_points + item_points + enemy_points + resource_points
    ),
    CONSTRAINT chk_score_js_integer CHECK (total_score <= 9007199254740991)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabele rozszerzen. Backend ustawien i checkpointow nie nalezy do pierwszego MVP.
CREATE TABLE player_settings (
    player_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    volume TINYINT UNSIGNED NOT NULL DEFAULT 50,
    tutorial_completed TINYINT UNSIGNED NOT NULL DEFAULT 0,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (player_id),
    CONSTRAINT fk_settings_player FOREIGN KEY (player_id)
        REFERENCES players (id) ON DELETE CASCADE,
    CONSTRAINT chk_settings_volume CHECK (volume <= 100),
    CONSTRAINT chk_settings_tutorial CHECK (tutorial_completed IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE game_saves (
    id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    run_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    slot SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    schema_version SMALLINT UNSIGNED NOT NULL,
    revision INT UNSIGNED NOT NULL DEFAULT 1,
    snapshot_json JSON NOT NULL,
    saved_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_saves_run_slot (run_id, slot),
    CONSTRAINT fk_saves_run FOREIGN KEY (run_id)
        REFERENCES game_runs (id) ON DELETE CASCADE,
    CONSTRAINT chk_saves_slot CHECK (slot >= 1),
    CONSTRAINT chk_saves_schema CHECK (schema_version >= 1),
    CONSTRAINT chk_saves_revision CHECK (revision >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migawka obecnych regul; bez danych graczy i przykladowych wynikow.
-- Przed pierwszym wdrozeniem ponownie porownac z js/config.js.
INSERT INTO game_rulesets (id, schema_version, config_json) VALUES (
    'farmwars-1',
    1,
    '{
        "scoring": {
            "pointsPerSecond": 1,
            "items": {"cannon": 10, "seedling": 10, "woodFence": 10, "stoneWall": 10},
            "enemies": {"normal": 20, "boss": 35},
            "resources": {"tree": 12}
        },
        "board": {"rows": 5, "columns": 10},
        "prepTimeSeconds": 120,
        "treeGrowthTimeMs": 15000,
        "treeWoodYield": 2,
        "initialResources": {"grass": 6, "stone": 4},
        "spawnIntervalsMs": {"grass": 15000, "stone": 25000},
        "shopItems": {
            "cannon": {"wood": 20, "stone": 15},
            "seedling": {"seeds": 1},
            "woodFence": {"wood": 10},
            "stoneWall": {"stone": 12}
        },
        "waves": {
            "1": {"normal": 5, "boss": 0},
            "2": {"normal": 10, "boss": 0},
            "3": {"normal": 15, "boss": 1},
            "4": {"normal": 20, "boss": 2},
            "5": {"normal": 25, "boss": 3},
            "6": {"normal": 30, "boss": 5},
            "7": {"normal": 35, "boss": 7},
            "8": {"normal": 40, "boss": 10},
            "9": {"normal": 45, "boss": 15},
            "10": {"normal": 50, "boss": 20}
        }
    }'
);

-- Ponizsze zapytanie jest dokumentacja dla api/ranking/top.php.
-- Jest zakomentowane: import nie uruchamia odczytu ani nie tworzy widoku.
-- ROW_NUMBER wybiera jedna najlepsza partie; RANK liczy miejsca po samym Score.
-- saved_at/run_id stabilizuja wybor remisujacej partii, nie zmieniaja miejsca.
/*
WITH candidates AS (
    SELECT r.player_id, s.run_id, s.nickname_snapshot, s.total_score,
           r.status, r.finished_at, s.saved_at,
           ROW_NUMBER() OVER (
               PARTITION BY r.player_id
               ORDER BY s.total_score DESC, s.saved_at ASC, s.run_id ASC
           ) AS player_row
    FROM run_scores AS s
    INNER JOIN game_runs AS r ON r.id = s.run_id
    WHERE s.is_ranked = 1
      AND r.status IN ('won', 'lost')
      AND r.player_id IS NOT NULL
), best AS (
    SELECT * FROM candidates WHERE player_row = 1
), ranked AS (
    SELECT best.*, RANK() OVER (ORDER BY total_score DESC) AS position
    FROM best
)
SELECT player_id, run_id, nickname_snapshot, total_score, status, finished_at, position
FROM ranked
ORDER BY total_score DESC, saved_at ASC, run_id ASC
LIMIT 10;
-- Odczyt pozycji gracza: w ostatnim SELECT zamiast LIMIT 10 dodac
-- WHERE player_id = :player_id. Filtr dopiero PO obliczeniu RANK.
*/
