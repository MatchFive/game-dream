using System;
using UnityEngine;

namespace GameDream
{
    [Serializable]
    public sealed class ArenaConfig
    {
        public float width = 960f;
        public float height = 540f;
    }

    [Serializable]
    public sealed class FighterConfig
    {
        public int hp = 100;
        public int damage = 15;
        public float speed = 220f;
        public float attack_range = 64f;
    }

    [Serializable]
    public sealed class TilesetConfig
    {
        public string floor = "2f4f3f";
        public string wall = "181c2f";
    }

    [Serializable]
    public sealed class MapConfig
    {
        public string[] rows;
        public int tile_size = 32;
        public TilesetConfig tileset = new TilesetConfig();
    }

    [Serializable]
    public sealed class EnemyConfig
    {
        public string kind = "slime";
        public int max_hp = 30;
        public int attack_damage = 5;
        public float attack_range = 40f;
        public float attack_cooldown = 1f;
        public float speed = 80f;
        public float x = 600f;
        public float y = 240f;
        public float scale = 1f;
    }

    [Serializable]
    public sealed class LevelConfig
    {
        public string id = "arena";
        public string name = "Arena";
        public MapConfig map;
        public EnemyConfig enemy = new EnemyConfig();
    }

    [Serializable]
    public sealed class QuestConfig
    {
        public string id;
        public string title;
        public string type = "kill";
        public string target;
        public int count = 1;
    }

    [Serializable]
    public sealed class GameConfig
    {
        public string name = "unity-m0";
        public ArenaConfig arena = new ArenaConfig();
        public FighterConfig player = new FighterConfig();
        public FighterConfig enemy = new FighterConfig
        {
            hp = 30,
            damage = 5,
            speed = 70f,
            attack_range = 40f,
        };
        public LevelConfig[] levels;
        public QuestConfig[] quests;
    }

    public static class GameConfigLoader
    {
        public static GameConfig Load()
        {
            TextAsset asset = Resources.Load<TextAsset>("GameConfig");
            if (asset == null)
            {
                Debug.LogWarning("UNITY_CONFIG_FALLBACK: Resources/GameConfig.json is missing");
                return new GameConfig();
            }
            try
            {
                GameConfig config = JsonUtility.FromJson<GameConfig>(asset.text);
                if (config == null)
                {
                    Debug.LogWarning("UNITY_CONFIG_FALLBACK: GameConfig.json parsed empty");
                    return new GameConfig();
                }
                return config;
            }
            catch (Exception error)
            {
                Debug.LogWarning("UNITY_CONFIG_FALLBACK: " + error.Message);
                return new GameConfig();
            }
        }
    }
}
