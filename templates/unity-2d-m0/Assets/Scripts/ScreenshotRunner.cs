using System;
using System.IO;
using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif

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
            Debug.Log("UNITY_SCREENSHOT_OK " + _path);
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
        File.WriteAllBytes(path, image.EncodeToPNG());
        RenderTexture.active = null;
        camera.targetTexture = null;
        target.Release();
        UnityEngine.Object.Destroy(image);
        UnityEngine.Object.Destroy(target);
    }

    private static void Finish(int code)
    {
#if UNITY_EDITOR
        EditorApplication.Exit(code);
#else
        Application.Quit(code);
#endif
    }
}
