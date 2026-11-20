using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;

namespace GameDream
{
    [Serializable]
    public sealed class SaveData
    {
        public int version = 1;
        public string fingerprint;
        public int level;
        public int hp;
        public string[] inventory_names;
        public int[] inventory_counts;
        public string[] equipment_slots;
        public string[] equipment_ids;
        public int[] quest_progress;
        public bool[] quest_completed;
    }

    public static class SaveStore
    {
        private static string PathFor()
        {
            return Path.Combine(Application.persistentDataPath, "gamedream-unity-save.json");
        }

        public static bool Save(GameSim sim, string fingerprint)
        {
            try
            {
                var names = new List<string>();
                var counts = new List<int>();
                foreach (KeyValuePair<string, int> item in sim.Inventory)
                {
                    names.Add(item.Key);
                    counts.Add(item.Value);
                }
                var slots = new List<string>();
                var ids = new List<string>();
                foreach (KeyValuePair<string, string> item in sim.Equipment)
                {
                    slots.Add(item.Key);
                    ids.Add(item.Value);
                }
                var progress = new List<int>();
                var completed = new List<bool>();
                foreach (QuestState quest in sim.Quests)
                {
                    progress.Add(quest.Progress);
                    completed.Add(quest.Completed);
                }
                var data = new SaveData
                {
                    fingerprint = fingerprint,
                    level = sim.LevelIndex,
                    hp = sim.PlayerHp,
                    inventory_names = names.ToArray(),
                    inventory_counts = counts.ToArray(),
                    equipment_slots = slots.ToArray(),
                    equipment_ids = ids.ToArray(),
                    quest_progress = progress.ToArray(),
                    quest_completed = completed.ToArray(),
                };
                File.WriteAllText(PathFor(), JsonUtility.ToJson(data));
                return true;
            }
            catch (Exception error)
            {
                Debug.LogWarning("UNITY_SAVE_WRITE_FAILED: " + error.Message);
                return false;
            }
        }

        public static bool Load(GameSim sim, string fingerprint)
        {
            try
            {
                string path = PathFor();
                if (!File.Exists(path))
                {
                    return false;
                }
                SaveData data = JsonUtility.FromJson<SaveData>(File.ReadAllText(path));
                if (data == null || data.version != 1 || data.fingerprint != fingerprint)
                {
                    return false;
                }
                return sim.Restore(
                    data.level,
                    data.hp,
                    data.inventory_names,
                    data.inventory_counts,
                    data.equipment_slots,
                    data.equipment_ids,
                    data.quest_progress,
                    data.quest_completed
                );
            }
            catch (Exception error)
            {
                Debug.LogWarning("UNITY_SAVE_READ_FAILED: " + error.Message);
                return false;
            }
        }

        public static void Clear()
        {
            try
            {
                File.Delete(PathFor());
            }
            catch (Exception error)
            {
                Debug.LogWarning("UNITY_SAVE_CLEAR_FAILED: " + error.Message);
            }
        }
    }
}
