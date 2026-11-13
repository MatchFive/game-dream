using System;
using GameDream;
using UnityEngine;

public sealed class GameBootstrap : MonoBehaviour
{
    private GameSim _sim;
    private GameConfig _config;
    private Transform _player;
    private Transform _enemy;
    private GameObject _mapRoot;
    private int _lastLevel = -1;
    private bool _reportedWin;
    private bool _reportedLose;
    private bool _showInventory;
    private bool _showQuests;
    private bool _showEquipment;

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    private static void Bootstrap()
    {
        if (UnityEngine.Object.FindFirstObjectByType<GameBootstrap>() != null)
        {
            return;
        }
        GameObject root = new GameObject("GameDream");
        UnityEngine.Object.DontDestroyOnLoad(root);
        root.AddComponent<GameBootstrap>();
    }

    private void Start()
    {
        _config = GameConfigLoader.Load();
        _sim = new GameSim(_config);
        bool smoke = Environment.GetEnvironmentVariable("GAMEDREAM_SMOKE_OUT") == "1";
        if (!Application.isEditor && !smoke && SaveStore.Load(_sim, _config.name))
        {
            Debug.Log("UNITY_SAVE_LOADED");
        }
        Debug.Log("UNITY_BOOT_OK");
        _mapRoot = new GameObject("MapRoot");
        SetupCamera();
        _player = CreateSquare("Player", new Color(0.35f, 0.75f, 1f), 0.32f, 0);
        _enemy = CreateSquare("Enemy", new Color(0.95f, 0.3f, 0.25f), 0.5f, 1);
        BuildLevelVisuals();
        SyncActors();
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
            _sim.ArenaHeight / 200f,
            _sim.ArenaWidth / (2f * aspect * 100f)
        );
        camera.transform.position = new Vector3(
            _sim.ArenaWidth / 200f,
            _sim.ArenaHeight / 200f,
            -10f
        );
        camera.backgroundColor = new Color(0.08f, 0.09f, 0.14f);
    }

    private void BuildLevelVisuals()
    {
        _lastLevel = _sim.LevelIndex;
        foreach (Transform child in _mapRoot.transform)
        {
            Destroy(child.gameObject);
        }
        Camera camera = Camera.main;
        if (camera != null)
        {
            float aspect = Screen.width > 0 && Screen.height > 0
                ? (float)Screen.width / Screen.height
                : 16f / 9f;
            camera.orthographicSize = Mathf.Max(
                _sim.ArenaHeight / 200f,
                _sim.ArenaWidth / (2f * aspect * 100f)
            );
            camera.transform.position = new Vector3(
                _sim.ArenaWidth / 200f,
                _sim.ArenaHeight / 200f,
                -10f
            );
        }
        if (_sim.HasMap)
        {
            Debug.Log("UNITY_MAP_OK");
            for (int y = 0; y < _sim.MapRows.Length; y += 1)
            {
                string row = _sim.MapRows[y];
                for (int x = 0; x < row.Length; x += 1)
                {
                    bool wall = row[x] == '#';
                    Color color = wall
                        ? ParseColor(_sim.MapWallColor, new Color(0.09f, 0.11f, 0.18f))
                        : ParseColor(_sim.MapFloorColor, new Color(0.18f, 0.31f, 0.25f));
                    float size = _sim.MapTileSize / 100f;
                    Transform tile = CreateSquare(
                        wall ? "Wall" : "Floor",
                        color,
                        size,
                        wall ? 1 : -1,
                        _mapRoot.transform
                    );
                    tile.position = new Vector3(
                        (x + 0.5f) * _sim.MapTileSize / 100f,
                        (_sim.MapRows.Length - y - 0.5f) * _sim.MapTileSize / 100f,
                        0f
                    );
                }
            }
        }
        else
        {
            Transform floor = CreateSquare(
                "Arena",
                ParseColor(_sim.MapFloorColor, new Color(0.18f, 0.31f, 0.25f)),
                1f,
                -1,
                _mapRoot.transform
            );
            floor.localScale = new Vector3(_sim.ArenaWidth / 100f, _sim.ArenaHeight / 100f, 1f);
            floor.position = new Vector3(
                _sim.ArenaWidth / 200f,
                _sim.ArenaHeight / 200f,
                0f
            );
        }
    }

    private Color ParseColor(string hex, Color fallback)
    {
        Color color;
        return ColorUtility.TryParseHtmlString("#" + hex, out color) ? color : fallback;
    }

    private Transform CreateSquare(
        string name,
        Color color,
        float size,
        int order,
        Transform parent = null
    )
    {
        GameObject item = new GameObject(name);
        if (parent != null)
        {
            item.transform.SetParent(parent, false);
        }
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
        if (_sim.LevelIndex != _lastLevel)
        {
            BuildLevelVisuals();
            if (!Application.isEditor)
            {
                SaveStore.Save(_sim, _config.name);
            }
        }
        if (Input.GetKeyDown(KeyCode.I))
        {
            _showInventory = !_showInventory;
        }
        if (Input.GetKeyDown(KeyCode.Q))
        {
            _showQuests = !_showQuests;
        }
        if (Input.GetKeyDown(KeyCode.E))
        {
            _showEquipment = !_showEquipment;
        }
        if (Input.GetKeyDown(KeyCode.F5) && !Application.isEditor)
        {
            SaveStore.Save(_sim, _config.name);
            Debug.Log("UNITY_SAVE_OK");
        }
        if (_sim.Won || _sim.Lost)
        {
            if (Input.GetKey(KeyCode.R))
            {
                SaveStore.Clear();
                _sim.Reset();
                _lastLevel = -1;
                _reportedWin = false;
                _reportedLose = false;
                BuildLevelVisuals();
                SyncActors();
            }
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
        bool attack = Input.GetKey(KeyCode.J) || Input.GetKey(KeyCode.Space);
        _sim.Step(x, y, attack, Mathf.Min(Time.deltaTime, 0.05f));
        SyncActors();

        if (_sim.Won && !_reportedWin)
        {
            _reportedWin = true;
            if (!Application.isEditor)
            {
                SaveStore.Save(_sim, _config.name);
            }
            Debug.Log("UNITY_WIN");
        }
        if (_sim.Lost && !_reportedLose)
        {
            _reportedLose = true;
            Debug.Log("UNITY_LOSE");
        }
    }

    private void SyncActors()
    {
        _player.position = new Vector3(
            _sim.PlayerX / 100f,
            (_sim.ArenaHeight - _sim.PlayerY) / 100f,
            0f
        );
        _enemy.position = new Vector3(
            _sim.EnemyX / 100f,
            (_sim.ArenaHeight - _sim.EnemyY) / 100f,
            0f
        );
        _enemy.localScale = Vector3.one * (0.5f * _sim.EnemyScale);
    }

    private void OnGUI()
    {
        if (_sim == null || _config == null)
        {
            return;
        }
        int completed = 0;
        foreach (QuestState quest in _sim.Quests)
        {
            if (quest.Completed)
            {
                completed += 1;
            }
        }
        GUI.Label(
            new Rect(16f, 16f, 900f, 24f),
            $"{_config.name} · {_sim.LevelName}   HP {_sim.PlayerHp}   Enemy {_sim.EnemyHp}   Quests {completed}/{_sim.Quests.Count}"
        );
        GUI.Label(
            new Rect(16f, 42f, 900f, 24f),
            $"WASD/Arrows move   J/Space attack   I inventory   Q quests   E equipment   F5 save   R restart   DMG {_sim.PlayerDamage}   MAX {_sim.PlayerMaxHp}"
        );
        string items = "";
        foreach (var entry in _sim.Inventory)
        {
            items += (items.Length == 0 ? "" : " · ") + entry.Key + " x" + entry.Value;
        }
        if (items.Length > 0)
        {
            GUI.Label(new Rect(16f, 68f, 900f, 24f), "Items: " + items);
        }
        if (_sim.BossPhase)
        {
            GUI.Label(new Rect(16f, 94f, 900f, 24f), "Boss enraged");
        }
        if (_showInventory)
        {
            GUI.Box(new Rect(16f, 122f, 420f, 180f), "Inventory");
            float y = 148f;
            foreach (var entry in _sim.Inventory)
            {
                GUI.Label(new Rect(28f, y, 390f, 22f), entry.Key + " x" + entry.Value);
                y += 22f;
            }
            if (_sim.Inventory.Count == 0)
            {
                GUI.Label(new Rect(28f, y, 390f, 22f), "Empty");
            }
        }
        if (_showEquipment)
        {
            GUI.Box(new Rect(16f, 310f, 420f, 180f), "Equipment");
            float y = 336f;
            foreach (var entry in _sim.Equipment)
            {
                GUI.Label(
                    new Rect(28f, y, 390f, 22f),
                    entry.Key + ": " + _sim.EquippedName(entry.Key)
                );
                y += 22f;
            }
            if (_sim.Equipment.Count == 0)
            {
                GUI.Label(new Rect(28f, y, 390f, 22f), "Empty");
            }
            GUI.Label(new Rect(28f, y + 28f, 390f, 22f), "DMG " + _sim.PlayerDamage);
            GUI.Label(new Rect(28f, y + 50f, 390f, 22f), "MAX HP " + _sim.PlayerMaxHp);
        }
        if (_showQuests)
        {
            GUI.Box(new Rect(452f, 122f, 450f, 180f), "Quests");
            float y = 148f;
            foreach (QuestState quest in _sim.Quests)
            {
                GUI.Label(
                    new Rect(464f, y, 420f, 22f),
                    quest.Title + "  " + quest.Progress + "/" + quest.Count
                );
                y += 22f;
            }
        }
        if (_sim.Won)
        {
            GUI.Label(new Rect(16f, 320f, 900f, 24f), "Victory! Press R to restart.");
        }
        else if (_sim.Lost)
        {
            GUI.Label(new Rect(16f, 320f, 900f, 24f), "Defeat. Press R to restart.");
        }
    }
}
