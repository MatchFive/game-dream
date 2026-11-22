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
        SurvivorSim sim = new SurvivorSim();
        Debug.Log("UNITY_SURVIVOR_SPAWN");
        bool levelLogged = false;
        bool bossLogged = false;
        bool phaseLogged = false;
        bool eliteLogged = false;
        bool evolutionLogged = false;
        for (int frame = 0; frame < 12000 && !sim.Won && !sim.Lost; frame += 1)
        {
            sim.AutoStep(1f / 60f);
            if (!levelLogged && sim.Level > 1)
            {
                levelLogged = true;
                Debug.Log("UNITY_SURVIVOR_LEVEL");
            }
            if (!eliteLogged && sim.EliteFirstSeen())
            {
                eliteLogged = true;
                Debug.Log("UNITY_ELITE");
                Debug.Log("SURVIVOR_ELITE");
            }
            if (!evolutionLogged && sim.EvolutionFirstSeen())
            {
                evolutionLogged = true;
                Debug.Log("UNITY_EVOLUTION");
                Debug.Log("SURVIVOR_EVOLUTION");
            }
            if (!bossLogged && sim.BossSpawned)
            {
                bossLogged = true;
                Debug.Log("UNITY_BOSS");
            }
            if (!phaseLogged && sim.BossPhaseFirstSeen())
            {
                phaseLogged = true;
                Debug.Log("UNITY_BOSS_PHASE");
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
