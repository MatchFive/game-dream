using GameDream;
using UnityEditor;
using UnityEngine;

public static class EditorVerifier
{
    public static void Run()
    {
        Debug.Log("UNITY_SIM_OK");
        GameSim sim = new GameSim(GameConfigLoader.Load());
        bool mapLogged = false;
        for (int frame = 0; frame < 12000 && !sim.Won && !sim.Lost; frame += 1)
        {
            if (sim.HasMap && !mapLogged)
            {
                mapLogged = true;
                Debug.Log("UNITY_MAP_OK");
            }
            float gap = sim.Distance();
            float x =
                sim.PlayerX < sim.EnemyX - 20f ? 1f : sim.PlayerX > sim.EnemyX + 20f ? -1f : 0f;
            float y =
                sim.PlayerY < sim.EnemyY - 20f ? 1f : sim.PlayerY > sim.EnemyY + 20f ? -1f : 0f;
            sim.Step(x, y, gap <= sim.PlayerAttackRange, 1f / 60f);
        }
        if (sim.BossPhase)
        {
            Debug.Log("UNITY_BOSS_PHASE");
        }
        bool allKillQuests = sim.Quests.Count > 0;
        foreach (QuestState quest in sim.Quests)
        {
            if (quest.Type == "kill" && !quest.Completed)
            {
                allKillQuests = false;
            }
        }
        if (allKillQuests)
        {
            Debug.Log("UNITY_QUEST_COMPLETE");
        }
        if (sim.Won)
        {
            Debug.Log("UNITY_WIN");
            EditorApplication.Exit(0);
            return;
        }
        Debug.Log(sim.Lost ? "UNITY_LOSE" : "UNITY_TIMEOUT");
        EditorApplication.Exit(1);
    }
}
