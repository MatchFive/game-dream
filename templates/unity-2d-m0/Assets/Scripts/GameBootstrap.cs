using GameDream;
using UnityEngine;

public sealed class GameBootstrap : MonoBehaviour
{
    private GameSim _sim;
    private GameConfig _config;
    private Transform _player;
    private Transform _enemy;
    private bool _reportedWin;
    private bool _reportedLose;

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    private static void Bootstrap()
    {
        if (Object.FindFirstObjectByType<GameBootstrap>() != null)
        {
            return;
        }
        GameObject root = new GameObject("GameDream");
        Object.DontDestroyOnLoad(root);
        root.AddComponent<GameBootstrap>();
    }

    private void Start()
    {
        _config = GameConfigLoader.Load();
        _sim = new GameSim(_config);
        Debug.Log("UNITY_BOOT_OK");
        SetupCamera();
        SetupBackground();
        _player = CreateSquare("Player", new Color(0.35f, 0.75f, 1f), 0.32f, 0);
        _enemy = CreateSquare("Enemy", new Color(0.95f, 0.3f, 0.25f), 0.5f, 1);
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
        camera.orthographicSize = _config.arena.height / 200f;
        camera.transform.position = new Vector3(
            _config.arena.width / 200f,
            _config.arena.height / 200f,
            -10f
        );
        camera.backgroundColor = new Color(0.08f, 0.09f, 0.14f);
    }

    private void SetupBackground()
    {
        Transform background = CreateSquare(
            "Arena",
            new Color(0.16f, 0.17f, 0.25f),
            1f,
            -1
        );
        background.localScale = new Vector3(
            _config.arena.width / 100f,
            _config.arena.height / 100f,
            1f
        );
        background.position = new Vector3(
            _config.arena.width / 200f,
            _config.arena.height / 200f,
            1f
        );
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
        if (_sim.Won || _sim.Lost)
        {
            if (Input.GetKey(KeyCode.R))
            {
                _sim.Reset();
                _reportedWin = false;
                _reportedLose = false;
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
            y += 1f;
        }
        if (Input.GetKey(KeyCode.S) || Input.GetKey(KeyCode.DownArrow))
        {
            y -= 1f;
        }
        bool attack = Input.GetKey(KeyCode.J) || Input.GetKey(KeyCode.Space);
        _sim.Step(x, y, attack, Mathf.Min(Time.deltaTime, 0.05f));
        SyncActors();

        if (_sim.Won && !_reportedWin)
        {
            _reportedWin = true;
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
        _player.position = new Vector3(_sim.PlayerX / 100f, _sim.PlayerY / 100f, 0f);
        _enemy.position = new Vector3(_sim.EnemyX / 100f, _sim.EnemyY / 100f, 0f);
    }

    private void OnGUI()
    {
        if (_sim == null || _config == null)
        {
            return;
        }
        GUI.Label(
            new Rect(16f, 16f, 700f, 24f),
            $"{_config.name}   HP {_sim.PlayerHp}   Enemy {_sim.EnemyHp}"
        );
        GUI.Label(
            new Rect(16f, 42f, 700f, 24f),
            "WASD/Arrows move   J/Space attack   R restart"
        );
        if (_sim.Won)
        {
            GUI.Label(new Rect(16f, 74f, 700f, 24f), "Victory! Press R to restart.");
        }
        else if (_sim.Lost)
        {
            GUI.Label(new Rect(16f, 74f, 700f, 24f), "Defeat. Press R to restart.");
        }
    }
}
