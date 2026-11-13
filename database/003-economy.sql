-- Import do istniejącej bazy FarmWars wybranej w phpMyAdmin.
-- Osobne partie podglądu zachowują historię i kontrakt etapu 1.
CREATE TABLE IF NOT EXISTS economy_runs (
    id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    identity_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    request_id VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    ruleset_id VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    revision INT UNSIGNED NOT NULL DEFAULT 0,
    state_json JSON NOT NULL,
    initial_json JSON NOT NULL,
    UNIQUE KEY uq_economy_owner_request (identity_id, request_id),
    FOREIGN KEY (identity_id) REFERENCES guest_identities(id),
    FOREIGN KEY (ruleset_id) REFERENCES game_rulesets(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS economy_commands (
    run_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    command_id VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    http_status SMALLINT UNSIGNED NOT NULL,
    response_json JSON NOT NULL,
    PRIMARY KEY (run_id, command_id),
    FOREIGN KEY (run_id) REFERENCES economy_runs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO game_rulesets (id, schema_version, config_json) VALUES (
    'farmwars-economy-1', 1,
    '{
        "rows":5,"columns":10,"preparationMs":120000,
        "initialGrass":6,"initialStone":4,"grassInterval":15000,"stoneInterval":25000,
        "growthMs":15000,"growthCheckMs":100,"woodYield":2,
        "speeds":[0.75,1,1.25,1.5,1.75,2,2.25,2.5,2.75,3],
        "hp":{"seedling":2,"tree":5,"cannon":10,"woodFence":8,"stoneWall":25},
        "shop":{"cannon":{"wood":20,"stones":15},"seedling":{"seeds":1},"woodFence":{"wood":10},"stoneWall":{"stones":12}}
    }'
) ON DUPLICATE KEY UPDATE id = id;
