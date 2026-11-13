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
    }

    public static class GameConfigLoader
    {
        public static GameConfig Load()
        {
            TextAsset asset = Resources.Load<TextAsset>("GameConfig");
            if (asset == null)
            {
                return new GameConfig();
            }
            try
            {
                GameConfig config = JsonUtility.FromJson<GameConfig>(asset.text);
                return config ?? new GameConfig();
            }
            catch (Exception)
            {
                return new GameConfig();
            }
        }
    }
}
