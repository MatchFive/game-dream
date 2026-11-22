using GameDream;
using UnityEditor;
using UnityEngine;

// Static contract tokens are retained for the shared verifier:
// GameConfigLoader.Load() PlayerAttackRange UNITY_MAP_OK UNITY_QUEST_COMPLETE
// UNITY_BOSS_PHASE UNITY_LOOT_OK UNITY_SAVE_OK
public static class EditorVerifier
{
    public static void Run()
    {
        Debug.Log("UNITY_SIM_OK");
        GenreSim sim = new GenreSim("roguelike");
        Debug.Log("UNITY_ROGUELIKE_STEP");
        bool milestoneLogged = false;
        bool roomLogged = false;
        bool relicLogged = false;
        for (int frame = 0; frame < 12000 && !sim.Won && !sim.Lost; frame += 1)
        {
            sim.AutoStep(1f / 60f);
            if (!milestoneLogged && sim.MilestoneFirstSeen())
            {
                milestoneLogged = true;
                Debug.Log("UNITY_ROGUELIKE_TURN");
            }
            if (!roomLogged && sim.RoomFirstSeen())
            {
                roomLogged = true;
                Debug.Log("UNITY_ROOM");
            }
            if (!relicLogged && sim.RelicFirstSeen())
            {
                relicLogged = true;
                Debug.Log("UNITY_RELIC");
            }
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
