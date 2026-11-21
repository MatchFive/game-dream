using System;
using System.Collections;
using System.IO;
using UnityEngine;
using UnityEngine.Networking;

namespace GameDream
{
    public static class BgmPlayer
    {
        [Serializable]
        private sealed class BuildAsset
        {
            public string kind;
            public string file;
        }

        [Serializable]
        private sealed class BuildManifest
        {
            public BuildAsset[] assets;
        }

        public static IEnumerator Load(GameObject host, float volume = 0.35f)
        {
            string manifestPath = Path.Combine(
                Application.streamingAssetsPath,
                "game",
                "build-assets",
                "manifest.json"
            );
            if (!File.Exists(manifestPath))
            {
                yield break;
            }

            BuildManifest manifest;
            try
            {
                manifest = JsonUtility.FromJson<BuildManifest>(File.ReadAllText(manifestPath));
            }
            catch (Exception error)
            {
                Debug.LogWarning($"UNITY_BGM_FAILED {error.Message}");
                yield break;
            }

            BuildAsset track = null;
            foreach (BuildAsset asset in manifest?.assets ?? new BuildAsset[0])
            {
                if (asset != null
                    && asset.kind == "audio"
                    && !string.IsNullOrEmpty(asset.file)
                    && !asset.file.Contains("/sfx-")
                    && !asset.file.Contains("/sfx_"))
                {
                    track = asset;
                    break;
                }
            }
            if (track == null)
            {
                yield break;
            }

            string audioPath = Path.Combine(
                Application.streamingAssetsPath,
                track.file.Replace('/', Path.DirectorySeparatorChar)
            );
            if (!File.Exists(audioPath))
            {
                Debug.LogWarning($"UNITY_BGM_FAILED missing {audioPath}");
                yield break;
            }

            AudioType audioType = audioPath.EndsWith(".wav", StringComparison.OrdinalIgnoreCase)
                ? AudioType.WAV
                : AudioType.MPEG;
            using (UnityWebRequest request = UnityWebRequestMultimedia.GetAudioClip(
                new Uri(audioPath).AbsoluteUri,
                audioType
            ))
            {
                yield return request.SendWebRequest();
                AudioClip clip = DownloadHandlerAudioClip.GetContent(request);
                if (request.result != UnityWebRequest.Result.Success || clip == null)
                {
                    Debug.LogWarning($"UNITY_BGM_FAILED {request.error}");
                    yield break;
                }
                AudioSource source = host.AddComponent<AudioSource>();
                source.clip = clip;
                source.loop = true;
                source.volume = Mathf.Clamp01(volume);
                source.playOnAwake = false;
                source.Play();
                Debug.Log("UNITY_BGM_OK");
            }
        }
    }
}
