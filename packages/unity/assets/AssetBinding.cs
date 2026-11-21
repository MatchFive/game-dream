using System;
using System.IO;
using UnityEngine;

namespace GameDream
{
    public static class AssetBinding
    {
        [Serializable]
        private sealed class SpriteBinding
        {
            public string file;
        }

        [Serializable]
        private sealed class Bindings
        {
            public SpriteBinding player;
        }

        public static void ApplyPlayer(GameObject player)
        {
            string bindingsPath = Path.Combine(
                Application.streamingAssetsPath,
                "game",
                "build-assets",
                "bindings.json"
            );
            if (!File.Exists(bindingsPath))
            {
                return;
            }

            Bindings bindings;
            try
            {
                bindings = JsonUtility.FromJson<Bindings>(File.ReadAllText(bindingsPath));
            }
            catch (Exception error)
            {
                Debug.LogWarning($"UNITY_SPRITE_BINDING_FAILED {error.Message}");
                return;
            }
            if (bindings?.player == null || string.IsNullOrEmpty(bindings.player.file))
            {
                return;
            }

            string path = Path.Combine(
                Application.streamingAssetsPath,
                bindings.player.file.Replace('/', Path.DirectorySeparatorChar)
            );
            if (!File.Exists(path))
            {
                Debug.LogWarning($"UNITY_SPRITE_BINDING_FAILED missing {path}");
                return;
            }

            SpriteRenderer renderer = player.GetComponent<SpriteRenderer>();
            if (renderer == null)
            {
                return;
            }
            Texture2D texture = new Texture2D(2, 2, TextureFormat.RGBA32, false);
            if (!texture.LoadImage(File.ReadAllBytes(path)))
            {
                Debug.LogWarning($"UNITY_SPRITE_BINDING_FAILED image {path}");
                return;
            }
            renderer.sprite = Sprite.Create(
                texture,
                new Rect(0f, 0f, texture.width, texture.height),
                new Vector2(0.5f, 0.5f),
                100f
            );
            renderer.color = Color.white;
            Debug.Log("UNITY_SPRITE_BINDING_OK");
        }
    }
}
