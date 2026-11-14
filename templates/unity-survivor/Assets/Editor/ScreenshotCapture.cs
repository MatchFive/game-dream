using System;
using System.IO;
using UnityEditor;
using UnityEngine;

public static class ScreenshotCapture
{
    public static void Run()
    {
        try
        {
            string path = Environment.GetEnvironmentVariable("GAMEDREAM_SCREENSHOT_OUT");
            if (string.IsNullOrEmpty(path))
            {
                path = "Screenshots/unity.png";
            }
            path = Path.GetFullPath(path);
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            if (File.Exists(path))
            {
                File.Delete(path);
            }
            Environment.SetEnvironmentVariable("GAMEDREAM_SCREENSHOT_OUT", path);
            EditorApplication.EnterPlaymode();
        }
        catch (Exception error)
        {
            Debug.LogException(error);
            EditorApplication.Exit(1);
        }
    }
}
