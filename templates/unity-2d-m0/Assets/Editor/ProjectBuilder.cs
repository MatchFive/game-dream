using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class ProjectBuilder
{
    private const string ScenePath = "Assets/Scenes/Main.unity";

    public static void BuildWindows()
    {
        try
        {
            if (!BuildPipeline.IsBuildTargetSupported(
                BuildTargetGroup.Standalone,
                BuildTarget.StandaloneWindows64
            ))
            {
                Debug.LogError("UNITY_BUILD_MISSING_TARGET: install Windows Build Support");
                EditorApplication.Exit(3);
                return;
            }
            EnsureScene();
            string output = Environment.GetEnvironmentVariable("GAMEDREAM_BUILD_OUT");
            if (string.IsNullOrEmpty(output))
            {
                output = "Builds/Windows/GameDream.exe";
            }
            output = Path.GetFullPath(output);
            Directory.CreateDirectory(Path.GetDirectoryName(output));
            if (File.Exists(output))
            {
                File.Delete(output);
            }
            BuildReport report = BuildPipeline.BuildPlayer(
                new BuildPlayerOptions
                {
                    scenes = new[] { ScenePath },
                    locationPathName = output,
                    target = BuildTarget.StandaloneWindows64,
                    options = BuildOptions.None,
                }
            );
            if (report.summary.result != BuildResult.Succeeded || !File.Exists(output))
            {
                Debug.LogError("UNITY_BUILD_FAILED: " + report.summary.result);
                EditorApplication.Exit(1);
                return;
            }
            Debug.Log("UNITY_BUILD_OK " + output);
            EditorApplication.Exit(0);
        }
        catch (Exception error)
        {
            Debug.LogException(error);
            EditorApplication.Exit(1);
        }
    }

    private static void EnsureScene()
    {
        string absoluteScene = Path.Combine(Application.dataPath, "Scenes/Main.unity");
        Directory.CreateDirectory(Path.GetDirectoryName(absoluteScene));
        if (!File.Exists(absoluteScene))
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            if (!EditorSceneManager.SaveScene(scene, ScenePath))
            {
                throw new InvalidOperationException("could not save " + ScenePath);
            }
        }
        AssetDatabase.Refresh();
        if (!File.Exists(absoluteScene))
        {
            throw new InvalidOperationException("scene missing after save: " + absoluteScene);
        }
        EditorBuildSettings.scenes = new[]
        {
            new EditorBuildSettingsScene(ScenePath, true),
        };
        AssetDatabase.SaveAssets();
    }
}
