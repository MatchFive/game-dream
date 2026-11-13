using System;
using GameDream;
using UnityEditor;

public static class EditorVerifier
{
    public static void Run()
    {
        Console.WriteLine("UNITY_BOOT_OK");
        GameSim sim = new GameSim();
        for (int frame = 0; frame < 1800 && !sim.Won && !sim.Lost; frame += 1)
        {
            float gap = sim.Distance();
            float moveX = sim.EnemyX > sim.PlayerX ? 1f : sim.EnemyX < sim.PlayerX ? -1f : 0f;
            sim.Step(moveX, 0f, gap <= 64f, 1f / 60f);
        }
        if (sim.Won)
        {
            Console.WriteLine("UNITY_WIN");
            EditorApplication.Exit(0);
            return;
        }
        Console.WriteLine(sim.Lost ? "UNITY_LOSE" : "UNITY_TIMEOUT");
        EditorApplication.Exit(1);
    }
}
