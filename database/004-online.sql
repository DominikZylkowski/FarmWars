-- Wymaga 003-economy.sql. Zachowuje istniejące wartości ENUM i dane.
ALTER TABLE run_scores MODIFY validation_level
    ENUM('client_reported','consistency_checked','replay_verified','server_simulated')
    NOT NULL DEFAULT 'client_reported';

-- Weź ekonomię z podglądu, a fale i punkty z podstawowych reguł.
-- Do tego dołóż ustawienia walki. Ponowny import nie nadpisuje reguł online.
INSERT INTO game_rulesets (id, schema_version, config_json)
SELECT 'farmwars-online-1', 1,
    JSON_MERGE_PATCH(
        economy.config_json,
        JSON_OBJECT(
            'waves', JSON_EXTRACT(base.config_json, '$.waves'),
            'scoring', JSON_EXTRACT(base.config_json, '$.scoring')
        ),
        '{
            "combat": {
                "tileWidth":100,"projectileLimit":1000,"contact":55,"projectileSize":45,"hitInset":20,
                "shotInterval":1000,"projectileSpeed":4,"cannonDamage":3,"clickDamage":2,
                "normal":{"hp":10,"size":120,"speed":0.55,"attackInterval":1200,"attackDamage":1},
                "boss":{"hp":30,"size":160,"speed":0.45,"attackInterval":2500,"attackDamage":2.5}
            }
        }'
    )
FROM game_rulesets AS economy
JOIN game_rulesets AS base ON base.id = 'farmwars-1'
WHERE economy.id = 'farmwars-economy-1'
ON DUPLICATE KEY UPDATE id = VALUES(id);
