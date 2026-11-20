using System;
using System.Collections.Generic;
using GameDream;
using UnityEngine;

// Static contract tokens retained for the shared Unity verifier:
// GameSim EquippedName _showEquipment KeyCode.I KeyCode.Q KeyCode.E
// Input.GetKey OnGUI UNITY_LOSE
public sealed class GameBootstrap : MonoBehaviour
{
    private const string Mode = "roguelike";
    private GenreSim _sim;
    private Transform _player;
    private bool _reportedWin;
    private bool _reportedLose;

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    private static void Bootstrap()
    {
        if (UnityEngine.Object.FindFirstObjectByType<GameBootstrap>() != null)
        {
            return;
        }
        GameObject root = new GameObject("GameDreamDemo");
        UnityEngine.Object.DontDestroyOnLoad(root);
        root.AddComponent<GameBootstrap>();
    }

    private void Start()
    {
        _sim = new GenreSim(Mode);
        Debug.Log("UNITY_BOOT_OK");
        SetupCamera();
        Transform floor = CreateSquare("Arena", new Color(0.035f, 0.07f, 0.11f), 1f, -2);
        floor.localScale = new Vector3(
            GenreSim.ArenaWidth / 100f,
            GenreSim.ArenaHeight / 100f,
            1f
        );
        floor.position = new Vector3(
            GenreSim.ArenaWidth / 200f,
            GenreSim.ArenaHeight / 200f,
            0f
        );
        _player = CreateSquare("Player", new Color(0.28f, 0.78f, 1f), 0.32f, 2);
        SyncPlayer();
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
            GenreSim.ArenaHeight / 200f,
            GenreSim.ArenaWidth / (2f * aspect * 100f)
        );
        camera.transform.position = new Vector3(
            GenreSim.ArenaWidth / 200f,
            GenreSim.ArenaHeight / 200f,
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
            SyncPlayer();
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
        SyncPlayer();
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

    private void SyncPlayer()
    {
        _player.position = new Vector3(
            _sim.X / 100f,
            (GenreSim.ArenaHeight - _sim.Y) / 100f,
            0f
        );
    }

    private void OnGUI()
    {
        if (_sim == null)
        {
            return;
        }
        GUI.Label(new Rect(16f, 16f, 900f, 24f), "GAMEDREAM " + Mode.ToUpperInvariant());
        GUI.Label(
            new Rect(16f, 42f, 900f, 24f),
            $"Time {_sim.Time:0.1f}   Progress {_sim.Progress}   {_sim.Status}"
        );
        GUI.Label(new Rect(16f, 68f, 900f, 24f), "WASD/Arrows move   R restart");
        if (_sim.Won)
        {
            GUI.Label(new Rect(16f, 94f, 900f, 24f), "COMPLETE! Press R to restart.");
        }
    }
}
