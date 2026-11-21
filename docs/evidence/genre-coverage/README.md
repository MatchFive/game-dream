# Web/Unity Genre Coverage

| Slice | Web verify | Web screenshot | Unity runtime |
|---|---|---|---|
| roguelike | `WEB_BOOT_OK`, `WEB_WIN` | 32 colors | `UNITY_SIM_OK`, `UNITY_WIN` |
| tower-defense | `WEB_BOOT_OK`, `WEB_WIN` | 87 colors | `UNITY_SIM_OK`, `UNITY_WIN` |
| puzzle | `WEB_BOOT_OK`, `WEB_WIN` | 53 colors | `UNITY_SIM_OK`, `UNITY_WIN` |
| platformer | existing Web slice | existing Web slice | `UNITY_SIM_OK`, `UNITY_WIN` |
| shooter | `WEB_BOOT_OK`, `WEB_WIN` | 74 colors | `UNITY_SIM_OK`, `UNITY_WIN` |

Web templates live under `templates/web-*`; Unity templates use the shared
`GenreSim` shell. Unity entries are deterministic smoke/coverage slices, not
full gameplay ports. Runtime logs were produced with Unity 6000.6.9f1
batchmode. Web verify screenshots are in this directory.
