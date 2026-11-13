using System;
using System.Collections.Generic;

namespace GameDream
{
    public sealed class QuestState
    {
        public string Id;
        public string Title;
        public string Type;
        public string Target;
        public int Count;
        public int Progress;
        public bool Completed;
    }

    public sealed class GameSim
    {
        public float PlayerX;
        public float PlayerY;
        public float EnemyX;
        public float EnemyY;
        public int PlayerHp;
        public int EnemyHp;
        public bool Won { get; private set; }
        public bool Lost { get; private set; }
        public int LevelIndex { get; private set; }
        public string LevelName { get; private set; } = "Arena";
        public bool HasMap { get; private set; }
        public string[] MapRows { get; private set; }
        public int MapTileSize { get; private set; } = 32;
        public string EnemyKind { get; private set; } = "slime";
        public int EnemyMaxHp { get; private set; } = 30;
        public float EnemyScale { get; private set; } = 1f;
        public bool BossPhase { get; private set; }
        public float ArenaWidth { get; private set; }
        public float ArenaHeight { get; private set; }
        public string MapFloorColor { get; private set; } = "2f4f3f";
        public string MapWallColor { get; private set; } = "181c2f";
        public readonly List<QuestState> Quests = new List<QuestState>();
        public readonly Dictionary<string, int> Inventory = new Dictionary<string, int>();
        public readonly Dictionary<string, string> Equipment = new Dictionary<string, string>();
        public int PlayerDamage => _config.player.damage + Bonus("attack_damage");
        public int PlayerMaxHp => _config.player.hp + Bonus("max_hp");
        public float PlayerAttackRange => _config.player.attack_range;
        public float PlayerSpeed => _config.player.speed;

        public string EquippedName(string slot)
        {
            string itemId;
            if (!Equipment.TryGetValue(slot, out itemId))
            {
                return "";
            }
            ItemConfig item;
            return _items.TryGetValue(itemId, out item)
                ? (string.IsNullOrEmpty(item.name) ? item.id : item.name)
                : itemId;
        }

        private readonly GameConfig _config;
        private readonly Dictionary<string, ItemConfig> _items = new Dictionary<string, ItemConfig>();
        private readonly Dictionary<string, LootTableConfig> _loot =
            new Dictionary<string, LootTableConfig>();
        private LevelConfig[] _levels;
        private MapConfig _map;
        private EnemyConfig _enemyConfig;
        private float _playerCooldown;
        private float _enemyCooldown;
        private uint _lootRng = 42;

        public GameSim() : this(new GameConfig())
        {
        }

        public GameSim(GameConfig config)
        {
            _config = config ?? new GameConfig();
            BuildLevels();
            BuildLoot();
            Reset();
        }

        private void BuildLoot()
        {
            if (_config.items != null)
            {
                foreach (ItemConfig item in _config.items)
                {
                    _items[item.id] = item;
                }
            }
            if (_config.loot != null)
            {
                foreach (LootTableConfig table in _config.loot)
                {
                    _loot[table.id] = table;
                }
            }
        }

        private void BuildLevels()
        {
            if (_config.levels != null && _config.levels.Length > 0)
            {
                _levels = _config.levels;
                return;
            }
            _levels = new[]
            {
                new LevelConfig
                {
                    id = "arena",
                    name = "Arena",
                    map = null,
                    enemy = new EnemyConfig
                    {
                        kind = "slime",
                        max_hp = _config.enemy.hp,
                        attack_damage = _config.enemy.damage,
                        attack_range = _config.enemy.attack_range,
                        attack_cooldown = 1f,
                        speed = _config.enemy.speed,
                        x = _config.arena.width - 200f,
                        y = _config.arena.height / 2f,
                        scale = 1f,
                    },
                },
            };
        }

        public void Reset()
        {
            Quests.Clear();
            if (_config.quests != null)
            {
                foreach (QuestConfig quest in _config.quests)
                {
                    Quests.Add(
                        new QuestState
                        {
                            Id = quest.id,
                            Title = quest.title,
                            Type = quest.type,
                            Target = quest.target,
                            Count = Math.Max(1, quest.count),
                        }
                    );
                }
            }
            Inventory.Clear();
            Equipment.Clear();
            _lootRng = 42;
            Won = false;
            Lost = false;
            StartLevel(0);
        }

        private void StartLevel(int index)
        {
            LevelIndex = index;
            LevelConfig level = _levels[index];
            LevelName = level.name;
            _map = level.map;
            HasMap = _map != null && _map.rows != null && _map.rows.Length > 0;
            MapRows = HasMap ? _map.rows : null;
            MapTileSize = HasMap ? Math.Max(1, _map.tile_size) : 32;
            ArenaWidth = HasMap ? MapRows[0].Length * MapTileSize : _config.arena.width;
            ArenaHeight = HasMap ? MapRows.Length * MapTileSize : _config.arena.height;
            EnemyConfig source = level.enemy ?? new EnemyConfig();
            _enemyConfig = new EnemyConfig
            {
                kind = source.kind,
                max_hp = source.max_hp,
                attack_damage = source.attack_damage,
                attack_range = source.attack_range,
                attack_cooldown = source.attack_cooldown,
                speed = source.speed,
                x = source.x,
                y = source.y,
                scale = source.scale,
            };
            EnemyKind = _enemyConfig.kind;
            EnemyScale = Math.Max(0.1f, _enemyConfig.scale);
            EnemyMaxHp = Math.Max(1, _enemyConfig.max_hp);
            EnemyHp = EnemyMaxHp;
            MapFloorColor = _map != null && _map.tileset != null
                ? _map.tileset.floor
                : "2f4f3f";
            MapWallColor = _map != null && _map.tileset != null
                ? _map.tileset.wall
                : "181c2f";
            EnemyX = _enemyConfig.x;
            EnemyY = _enemyConfig.y;
            PlayerX = 100f;
            PlayerY = ArenaHeight / 2f;
            PlayerHp = PlayerMaxHp;
            _playerCooldown = 0f;
            _enemyCooldown = 0f;
            BossPhase = false;
            SnapToFloor(ref PlayerX, ref PlayerY, 12f);
            SnapToFloor(ref EnemyX, ref EnemyY, 12f * _enemyConfig.scale);
        }

        public void Step(float moveX, float moveY, bool attack, float dt)
        {
            if (Won || Lost || dt <= 0f)
            {
                return;
            }
            dt = Math.Min(dt, 0.05f);
            float length = (float)Math.Sqrt(moveX * moveX + moveY * moveY);
            if (length > 1f)
            {
                moveX /= length;
                moveY /= length;
            }
            MoveActor(
                ref PlayerX,
                ref PlayerY,
                moveX * _config.player.speed * dt,
                moveY * _config.player.speed * dt,
                12f
            );
            if (!HasMap)
            {
                PlayerX = Math.Max(16f, Math.Min(ArenaWidth - 16f, PlayerX));
                PlayerY = Math.Max(16f, Math.Min(ArenaHeight - 16f, PlayerY));
            }

            float gap = Distance(PlayerX, PlayerY, EnemyX, EnemyY);
            _playerCooldown = Math.Max(0f, _playerCooldown - dt);
            _enemyCooldown = Math.Max(0f, _enemyCooldown - dt);

            if (attack && gap <= PlayerAttackRange && _playerCooldown <= 0f && HasLineOfSight(
                PlayerX,
                PlayerY,
                EnemyX,
                EnemyY
            ))
            {
                _playerCooldown = 0.25f;
                EnemyHp -= PlayerDamage;
                gap = Distance(PlayerX, PlayerY, EnemyX, EnemyY);
            }

            if (
                gap > _enemyConfig.attack_range ||
                !HasLineOfSight(PlayerX, PlayerY, EnemyX, EnemyY)
            )
            {
                float dx = PlayerX - EnemyX;
                float dy = PlayerY - EnemyY;
                float normal = (float)Math.Sqrt(dx * dx + dy * dy);
                if (normal > 0.001f)
                {
                    MoveActor(
                        ref EnemyX,
                        ref EnemyY,
                        dx / normal * _enemyConfig.speed * dt,
                        dy / normal * _enemyConfig.speed * dt,
                        12f * _enemyConfig.scale
                    );
                }
                if (!HasMap)
                {
                    EnemyX = Math.Max(16f, Math.Min(ArenaWidth - 16f, EnemyX));
                    EnemyY = Math.Max(16f, Math.Min(ArenaHeight - 16f, EnemyY));
                }
            }
            else if (_enemyCooldown <= 0f)
            {
                _enemyCooldown = _enemyConfig.attack_cooldown;
                PlayerHp -= _enemyConfig.attack_damage;
            }

            if (
                EnemyKind == "boss" &&
                !BossPhase &&
                EnemyHp > 0 &&
                EnemyHp <= EnemyMaxHp * 0.5f
            )
            {
                BossPhase = true;
                _enemyConfig.speed *= 1.35f;
                _enemyConfig.attack_damage = (int)Math.Ceiling(_enemyConfig.attack_damage * 1.5f);
                _enemyConfig.attack_cooldown *= 0.7f;
            }

            if (EnemyHp <= 0)
            {
                EnemyHp = 0;
                AddLoot(EnemyKind);
                CompleteKillQuests(EnemyKind);
                if (LevelIndex + 1 < _levels.Length)
                {
                    StartLevel(LevelIndex + 1);
                }
                else
                {
                    Won = true;
                }
            }
            else if (PlayerHp <= 0)
            {
                PlayerHp = 0;
                Lost = true;
            }
        }

        private int Bonus(string stat)
        {
            int total = 0;
            foreach (string itemId in Equipment.Values)
            {
                ItemConfig item;
                if (_items.TryGetValue(itemId, out item) && item.bonuses != null)
                {
                    if (stat == "attack_damage")
                    {
                        total += item.bonuses.attack_damage;
                    }
                    else if (stat == "max_hp")
                    {
                        total += item.bonuses.max_hp;
                    }
                }
            }
            return total;
        }

        private void AutoEquip(string itemId)
        {
            ItemConfig item;
            if (
                !_items.TryGetValue(itemId, out item) ||
                string.IsNullOrEmpty(item.slot) ||
                Equipment.ContainsKey(item.slot)
            )
            {
                return;
            }
            int before = PlayerMaxHp;
            Equipment[item.slot] = itemId;
            int gained = PlayerMaxHp - before;
            if (gained > 0)
            {
                PlayerHp += gained;
            }
        }

        public bool Restore(
            int levelIndex,
            int playerHp,
            string[] inventoryNames,
            int[] inventoryCounts,
            string[] equipmentSlots,
            string[] equipmentIds,
            int[] questProgress,
            bool[] questCompleted
        )
        {
            if (levelIndex < 0 || levelIndex >= _levels.Length)
            {
                return false;
            }
            Inventory.Clear();
            Equipment.Clear();
            if (equipmentSlots != null && equipmentIds != null)
            {
                int count = Math.Min(equipmentSlots.Length, equipmentIds.Length);
                for (int i = 0; i < count; i += 1)
                {
                    if (!string.IsNullOrEmpty(equipmentSlots[i]))
                    {
                        Equipment[equipmentSlots[i]] = equipmentIds[i];
                    }
                }
            }
            StartLevel(levelIndex);
            if (inventoryNames != null && inventoryCounts != null)
            {
                int count = Math.Min(inventoryNames.Length, inventoryCounts.Length);
                for (int i = 0; i < count; i += 1)
                {
                    if (!string.IsNullOrEmpty(inventoryNames[i]) && inventoryCounts[i] > 0)
                    {
                        Inventory[inventoryNames[i]] = inventoryCounts[i];
                    }
                }
            }
            if (questProgress != null && questCompleted != null)
            {
                int count = Math.Min(
                    Math.Min(questProgress.Length, questCompleted.Length),
                    Quests.Count
                );
                for (int i = 0; i < count; i += 1)
                {
                    Quests[i].Progress = questProgress[i];
                    Quests[i].Completed = questCompleted[i];
                }
            }
            PlayerHp = Math.Max(1, Math.Min(playerHp, PlayerMaxHp));
            return true;
        }

        private void AddLoot(string kind)
        {
            LootTableConfig table;
            if (!_loot.TryGetValue(kind, out table) || table.drops == null)
            {
                return;
            }
            foreach (LootDropConfig drop in table.drops)
            {
                if (string.IsNullOrEmpty(drop.item_id))
                {
                    continue;
                }
                float chance = Math.Max(0f, Math.Min(1f, drop.chance));
                if (chance < 1f && NextLootRoll() > chance)
                {
                    continue;
                }
                ItemConfig item;
                string name = _items.TryGetValue(drop.item_id, out item)
                    ? (string.IsNullOrEmpty(item.name) ? item.id : item.name)
                    : drop.item_id;
                Inventory[name] = (Inventory.ContainsKey(name) ? Inventory[name] : 0) + 1;
                AutoEquip(drop.item_id);
            }
        }

        private float NextLootRoll()
        {
            _lootRng = _lootRng * 1664525u + 1013904223u;
            return _lootRng / 4294967296f;
        }

        private void CompleteKillQuests(string kind)
        {
            foreach (QuestState quest in Quests)
            {
                if (quest.Completed || quest.Type != "kill" || quest.Target != kind)
                {
                    continue;
                }
                quest.Progress += 1;
                if (quest.Progress >= quest.Count)
                {
                    quest.Completed = true;
                }
            }
        }

        private string TileAt(float x, float y)
        {
            if (!HasMap)
            {
                return ".";
            }
            int tx = (int)Math.Floor(x / MapTileSize);
            int ty = (int)Math.Floor(y / MapTileSize);
            if (ty < 0 || ty >= MapRows.Length)
            {
                return "#";
            }
            if (tx < 0 || tx >= MapRows[ty].Length)
            {
                return "#";
            }
            return MapRows[ty][tx].ToString();
        }

        private bool IsWall(float x, float y, float half)
        {
            if (!HasMap)
            {
                return false;
            }
            int x0 = (int)Math.Floor((x - half) / MapTileSize);
            int x1 = (int)Math.Floor((x + half - 0.0001f) / MapTileSize);
            int y0 = (int)Math.Floor((y - half) / MapTileSize);
            int y1 = (int)Math.Floor((y + half - 0.0001f) / MapTileSize);
            for (int ty = y0; ty <= y1; ty += 1)
            {
                for (int tx = x0; tx <= x1; tx += 1)
                {
                    if (
                        TileAt(
                            tx * MapTileSize + MapTileSize / 2f,
                            ty * MapTileSize + MapTileSize / 2f
                        ) == "#"
                    )
                    {
                        return true;
                    }
                }
            }
            return false;
        }

        private void MoveActor(ref float x, ref float y, float dx, float dy, float half)
        {
            float nextX = x + dx;
            if (!IsWall(nextX, y, half))
            {
                x = nextX;
            }
            float nextY = y + dy;
            if (!IsWall(x, nextY, half))
            {
                y = nextY;
            }
        }

        private void SnapToFloor(ref float x, ref float y, float half)
        {
            if (!HasMap || !IsWall(x, y, half))
            {
                return;
            }
            float bestDistance = float.MaxValue;
            float bestX = x;
            float bestY = y;
            for (int ty = 0; ty < MapRows.Length; ty += 1)
            {
                for (int tx = 0; tx < MapRows[ty].Length; tx += 1)
                {
                    if (MapRows[ty][tx] == '#')
                    {
                        continue;
                    }
                    float fx = tx * MapTileSize + MapTileSize / 2f;
                    float fy = ty * MapTileSize + MapTileSize / 2f;
                    if (IsWall(fx, fy, half))
                    {
                        continue;
                    }
                    float distance = Distance(x, y, fx, fy);
                    if (distance < bestDistance)
                    {
                        bestDistance = distance;
                        bestX = fx;
                        bestY = fy;
                    }
                }
            }
            x = bestX;
            y = bestY;
        }

        private bool HasLineOfSight(float ax, float ay, float bx, float by)
        {
            if (!HasMap)
            {
                return true;
            }
            float distance = Distance(ax, ay, bx, by);
            int steps = Math.Max(1, (int)Math.Ceiling(distance / (MapTileSize / 2f)));
            for (int i = 1; i < steps; i += 1)
            {
                float t = (float)i / steps;
                if (TileAt(ax + (bx - ax) * t, ay + (by - ay) * t) == "#")
                {
                    return false;
                }
            }
            return true;
        }

        public static float Distance(float ax, float ay, float bx, float by)
        {
            float dx = ax - bx;
            float dy = ay - by;
            return (float)Math.Sqrt(dx * dx + dy * dy);
        }

        public float Distance()
        {
            return Distance(PlayerX, PlayerY, EnemyX, EnemyY);
        }
    }
}
