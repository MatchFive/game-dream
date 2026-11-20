# Web/Unity Genre Coverage

| Slice | Web verify | Web screenshot | Unity runtime |
|---|---|---|---|
| roguelike | `WEB_BOOT_OK`, `WEB_WIN` | 32 colors | `UNITY_SIM_OK`, `UNITY_WIN` |
| tower-defense | `WEB_BOOT_OK`, `WEB_WIN` | 87 colors | `UNITY_SIM_OK`, `UNITY_WIN` |
| puzzle | `WEB_BOOT_OK`, `WEB_WIN` | 53 colors | `UNITY_SIM_OK`, `UNITY_WIN` |

Web templates live under `templates/web-roguelike`, `web-tower-defense`, and
`web-puzzle`; Unity templates use the shared `GenreSim` shell. Runtime logs
were produced with Unity 6000.6.9f1 batchmode.
