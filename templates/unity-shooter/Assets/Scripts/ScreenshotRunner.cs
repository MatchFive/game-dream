#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;

public sealed class ScreenshotRunner : MonoBehaviour
{
    private static string _path;
    private int _frames;
    private bool _captured;

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    private static void Bootstrap()
    {
        _path = Environment.GetEnvironmentVariable("GAMEDREAM_SCREENSHOT_OUT");
        if (string.IsNullOrEmpty(_path))
        {
            return;
        }
        _path = Path.GetFullPath(_path);
        Directory.CreateDirectory(Path.GetDirectoryName(_path));
        GameObject root = new GameObject("ScreenshotRunner");
        DontDestroyOnLoad(root);
        root.AddComponent<ScreenshotRunner>();
    }

    private void Update()
    {
        _frames += 1;
        if (_frames == 1)
        {
            Debug.Log("UNITY_SCREENSHOT_PLAY");
        }
        if (_frames < 30)
        {
            return;
        }
        if (!_captured)
        {
            Debug.Log("UNITY_SCREENSHOT_CAPTURE " + _path);
            try
            {
                Capture(_path);
            }
            catch (Exception error)
            {
                Debug.LogError("UNITY_SCREENSHOT_ERROR " + error.Message);
                Finish(1);
                return;
            }
            _captured = true;
            return;
        }
        if (File.Exists(_path) && new FileInfo(_path).Length > 0)
        {
            Finish(0);
            return;
        }
        if (_frames > 300)
        {
            Debug.LogError("UNITY_SCREENSHOT_TIMEOUT");
            Finish(1);
        }
    }

    private static void Capture(string path)
    {
        Camera camera = Camera.main;
        if (camera == null)
        {
            throw new InvalidOperationException("No camera for screenshot");
        }
        int width = Screen.width > 0 ? Screen.width : 960;
        int height = Screen.height > 0 ? Screen.height : 540;
        RenderTexture target = new RenderTexture(width, height, 24);
        camera.targetTexture = target;
        camera.Render();
        RenderTexture.active = target;
        Texture2D image = new Texture2D(width, height, TextureFormat.RGB24, false);
        image.ReadPixels(new Rect(0f, 0f, width, height), 0, 0);
        image.Apply();
        HashSet<Color32> colors = new HashSet<Color32>();
        int step = Mathf.Max(1, Mathf.Min(width, height) / 32);
        for (int y = 0; y < height; y += step)
        {
            for (int x = 0; x < width; x += step)
            {
                colors.Add(image.GetPixel(x, y));
            }
        }
        File.WriteAllBytes(path, image.EncodeToPNG());
        RenderTexture.active = null;
        camera.targetTexture = null;
        target.Release();
        UnityEngine.Object.Destroy(image);
        UnityEngine.Object.Destroy(target);
        Debug.Log(
            "UNITY_SCREENSHOT_OK " + path + " " + width + "x" + height + " colors=" + colors.Count
        );
    }

    private static void Finish(int code)
    {
        EditorApplication.Exit(code);
    }
}
#endif
