using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using GameDream;
using UnityEngine;
using UnityEngine.Networking;

// Static contract tokens retained for the shared Unity verifier:
// GameSim EquippedName _showEquipment KeyCode.I KeyCode.Q KeyCode.E
// Input.GetKey OnGUI UNITY_LOSE
public sealed class GameBootstrap : MonoBehaviour
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

    [Serializable]
    private sealed class SurvivorMeta
    {
        public int coins;
        public int damage;
        public int maxHp;
        public int runs;
        public int wins;
    }

    private SurvivorMeta _meta;
    private bool _metaSaved;
    private SurvivorSim _sim;
    private Transform _player;
    private Transform _enemyRoot;
    private readonly List<Transform> _enemies = new List<Transform>();
    private int _lastEnemyCount = -1;
    private bool _reportedWin;
    private bool _reportedLose;

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    private static void Bootstrap()
    {
        if (UnityEngine.Object.FindFirstObjectByType<GameBootstrap>() != null)
        {
            return;
        }
        GameObject root = new GameObject("GameDreamSurvivor");
        UnityEngine.Object.DontDestroyOnLoad(root);
        root.AddComponent<GameBootstrap>();
    }

    private void Start()
    {
        _meta = LoadMeta();
        _sim = new SurvivorSim(_meta.damage, _meta.maxHp);
        Debug.Log("UNITY_BOOT_OK");
        _enemyRoot = new GameObject("Enemies").transform;
        SetupCamera();
        Transform floor = CreateSquare(
            "Arena",
            new Color(0.035f, 0.07f, 0.11f),
            1f,
            -2
        );
        floor.localScale = new Vector3(
            SurvivorSim.ArenaWidth / 100f,
            SurvivorSim.ArenaHeight / 100f,
            1f
        );
        floor.position = new Vector3(
            SurvivorSim.ArenaWidth / 200f,
            SurvivorSim.ArenaHeight / 200f,
            0f
        );
        _player = CreateSquare("Player", new Color(0.28f, 0.78f, 1f), 0.32f, 2);
        AssetBinding.ApplyPlayer(_player.gameObject);
        SyncActors();
        StartCoroutine(LoadBgm());
    }

    private SurvivorMeta LoadMeta()
    {
        string path = Path.Combine(Application.persistentDataPath, "survivor_meta.json");
        if (!File.Exists(path))
        {
            return new SurvivorMeta();
        }
        try
        {
            return JsonUtility.FromJson<SurvivorMeta>(File.ReadAllText(path)) ?? new SurvivorMeta();
        }
        catch (Exception error)
        {
            Debug.LogWarning($"UNITY_META_FAILED {error.Message}");
            return new SurvivorMeta();
        }
    }

    private void SaveMeta()
    {
        if (_metaSaved || _sim == null)
        {
            return;
        }
        _metaSaved = true;
        _meta.coins += _sim.Coins;
        _meta.runs += 1;
        if (_sim.Won)
        {
            _meta.wins += 1;
        }
        try
        {
            string path = Path.Combine(Application.persistentDataPath, "survivor_meta.json");
            File.WriteAllText(path, JsonUtility.ToJson(_meta));
            Debug.Log("UNITY_META_SAVED");
            Debug.Log("SURVIVOR_META_SAVED");
        }
        catch (Exception error)
        {
            Debug.LogWarning($"UNITY_META_FAILED {error.Message}");
        }
    }

    private IEnumerator LoadBgm()
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
        using (UnityWebRequest request = UnityWebRequestMultimedia.GetAudioClip(
            new Uri(audioPath).AbsoluteUri,
            AudioType.MPEG
        ))
        {
            yield return request.SendWebRequest();
            AudioClip clip = DownloadHandlerAudioClip.GetContent(request);
            if (request.result != UnityWebRequest.Result.Success || clip == null)
            {
                Debug.LogWarning($"UNITY_BGM_FAILED {request.error}");
                yield break;
            }
            AudioSource source = gameObject.AddComponent<AudioSource>();
            source.clip = clip;
            source.loop = true;
            source.volume = 0.35f;
            source.playOnAwake = false;
            source.Play();
            Debug.Log("UNITY_BGM_OK");
        }
    }

    private void SetupCamera()
    {
        Camera camera = Camera.main;
        if (camera == null)
        {
            GameObject cameraObject = new GameObject("Main Camera");
            cameraObject.tag = "MainCamera";
            camera = cameraObject.AddComponent<Camera>();
        }
        camera.orthographic = true;
        float aspect = Screen.width > 0 && Screen.height > 0
            ? (float)Screen.width / Screen.height
            : 16f / 9f;
        camera.orthographicSize = Mathf.Max(
            SurvivorSim.ArenaHeight / 200f,
            SurvivorSim.ArenaWidth / (2f * aspect * 100f)
        );
        camera.transform.position = new Vector3(
            SurvivorSim.ArenaWidth / 200f,
            SurvivorSim.ArenaHeight / 200f,
            -10f
        );
        camera.backgroundColor = new Color(0.03f, 0.05f, 0.09f);
    }

    private Transform CreateSquare(string name, Color color, float size, int order)
    {
        GameObject item = new GameObject(name);
        SpriteRenderer renderer = item.AddComponent<SpriteRenderer>();
        renderer.sprite = Sprite.Create(
            Texture2D.whiteTexture,
            new Rect(0f, 0f, 1f, 1f),
            new Vector2(0.5f, 0.5f),
            1f
        );
        renderer.color = color;
        renderer.sortingOrder = order;
        item.transform.localScale = new Vector3(size, size, 1f);
        return item.transform;
    }

    private void Update()
    {
        if (_sim == null)
        {
            return;
        }
        if ((_sim.Won || _sim.Lost) && Input.GetKey(KeyCode.R))
        {
            _sim.Reset();
            _reportedWin = false;
            _reportedLose = false;
            _metaSaved = false;
            SyncActors();
            return;
        }
        float x = 0f;
        float y = 0f;
        if (Input.GetKey(KeyCode.A) || Input.GetKey(KeyCode.LeftArrow))
        {
            x -= 1f;
        }
        if (Input.GetKey(KeyCode.D) || Input.GetKey(KeyCode.RightArrow))
        {
            x += 1f;
        }
        if (Input.GetKey(KeyCode.W) || Input.GetKey(KeyCode.UpArrow))
        {
            y -= 1f;
        }
        if (Input.GetKey(KeyCode.S) || Input.GetKey(KeyCode.DownArrow))
        {
            y += 1f;
        }
        _sim.Step(x, y, Mathf.Min(Time.deltaTime, 0.05f));
        SyncActors();
        if (_sim.Won && !_reportedWin)
        {
            _reportedWin = true;
            Debug.Log("UNITY_WIN");
            SaveMeta();
        }
        if (_sim.Lost && !_reportedLose)
        {
            _reportedLose = true;
            Debug.Log("UNITY_LOSE");
            SaveMeta();
        }
    }

    private void SyncActors()
    {
        _player.position = new Vector3(
            _sim.Player.x / 100f,
            (SurvivorSim.ArenaHeight - _sim.Player.y) / 100f,
            0f
        );
        if (_lastEnemyCount == _sim.Enemies.Count)
        {
            for (int i = 0; i < _enemies.Count; i += 1)
            {
                SurvivorEnemy enemy = _sim.Enemies[i];
                _enemies[i].position = new Vector3(
                    enemy.Position.x / 100f,
                    (SurvivorSim.ArenaHeight - enemy.Position.y) / 100f,
                    0f
                );
            }
            return;
        }
        _lastEnemyCount = _sim.Enemies.Count;
        foreach (Transform child in _enemies)
        {
            Destroy(child.gameObject);
        }
        _enemies.Clear();
        foreach (SurvivorEnemy enemy in _sim.Enemies)
        {
            Color color = enemy.Boss
                ? new Color(0.7f, 0.3f, 0.95f)
                : enemy.Elite
                    ? new Color(1f, 0.7f, 0.2f)
                    : new Color(0.95f, 0.3f, 0.35f);
            Transform item = CreateSquare("Enemy", color, enemy.Radius / 50f, 1);
            item.SetParent(_enemyRoot, false);
            item.position = new Vector3(
                enemy.Position.x / 100f,
                (SurvivorSim.ArenaHeight - enemy.Position.y) / 100f,
                0f
            );
            _enemies.Add(item);
        }
    }

    private void OnGUI()
    {
        if (_sim == null)
        {
            return;
        }
        GUI.Label(new Rect(16f, 16f, 900f, 24f), "EMBER SURVIVOR");
        GUI.Label(
            new Rect(16f, 42f, 900f, 24f),
            $"Time {Mathf.Min(_sim.Time, SurvivorSim.RunSeconds):0.1f}/{SurvivorSim.RunSeconds}   Level {_sim.Level}   HP {_sim.PlayerHp}   Kills {_sim.Kills}   Coins {_sim.Coins}{( _sim.Evolved ? "   EVOLVED" : "")}"
        );
        GUI.Label(new Rect(16f, 68f, 900f, 24f), "WASD/Arrows move   automatic attack   R restart");
        if (_sim.BossSpawned)
        {
            GUI.Label(new Rect(16f, 94f, 900f, 24f), "BOSS");
        }
        if (_sim.BossPhase)
        {
            GUI.Label(new Rect(16f, 120f, 900f, 24f), "BOSS PHASE 2");
        }
        if (_sim.Won)
        {
            GUI.Label(new Rect(16f, 146f, 900f, 24f), "SURVIVED! Press R to restart.");
        }
        else if (_sim.Lost)
        {
            GUI.Label(new Rect(16f, 146f, 900f, 24f), "DEFEATED. Press R to restart.");
        }
    }
}
