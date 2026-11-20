#if !UNITY_EDITOR
using System;
using UnityEngine;

public sealed class SmokeRunner : MonoBehaviour
{
    private int _frames;

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    private static void Bootstrap()
    {
        if (Environment.GetEnvironmentVariable("GAMEDREAM_SMOKE_OUT") != "1")
        {
            return;
        }
        GameObject root = new GameObject("SmokeRunner");
        DontDestroyOnLoad(root);
        root.AddComponent<SmokeRunner>();
    }

    private void Update()
    {
        _frames += 1;
        if (_frames < 10)
        {
            return;
        }
        Debug.Log("UNITY_SMOKE_OK");
        Application.Quit(0);
    }
}
#endif
