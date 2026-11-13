using GameDream;
using UnityEditor;
using UnityEngine;

public static class EditorVerifier
{
    public static void Run()
    {
        Debug.Log("UNITY_SIM_OK");
        GameSim sim = new GameSim(GameConfigLoader.Load());
        for (int frame = 0; frame < 1800 && !sim.Won && !sim.Lost; frame += 1)
        {
            float gap = sim.Distance();
            float moveX = sim.EnemyX > sim.PlayerX ? 1f : sim.EnemyX < sim.PlayerX ? -1f : 0f;
            sim.Step(moveX, 0f, gap <= sim.PlayerAttackRange, 1f / 60f);
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
