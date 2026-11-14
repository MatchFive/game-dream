using System;
using System.Collections.Generic;
using UnityEngine;

namespace GameDream
{
    public sealed class SurvivorEnemy
    {
        public Vector2 Position;
        public int Hp;
        public int MaxHp;
        public bool Boss;
        public bool Phase;
        public float Radius;
        public float Speed;
    }

    public sealed class SurvivorSim
    {
        public const float RunSeconds = 20f;
        public const float ArenaWidth = 960f;
        public const float ArenaHeight = 540f;

        public Vector2 Player = new Vector2(480f, 270f);
        public int PlayerHp = 100;
        public int Level = 1;
        public int Kills;
        public float Time;
        public bool Won { get; private set; }
        public bool Lost { get; private set; }
        public bool BossSpawned { get; private set; }
        public bool BossPhase { get; private set; }
        public readonly List<SurvivorEnemy> Enemies = new List<SurvivorEnemy>();
        public readonly List<Vector2> Bullets = new List<Vector2>();
        public readonly List<Vector2> BulletVelocity = new List<Vector2>();

        private float _spawnTimer;
        private float _attackTimer;
        private int _xp;
        private int _nextXp = 4;
        private int _spawnIndex;
        private bool _bossPhaseLogged;

        private static readonly Vector2[] Spawns =
        {
            new Vector2(60f, 60f),
            new Vector2(480f, 50f),
            new Vector2(900f, 60f),
            new Vector2(60f, 480f),
            new Vector2(900f, 480f),
        };

        public SurvivorSim()
        {
            Reset();
        }

        public void Reset()
        {
            Player = new Vector2(480f, 270f);
            PlayerHp = 100;
            Level = 1;
            Kills = 0;
            Time = 0f;
            Won = false;
            Lost = false;
            BossSpawned = false;
            BossPhase = false;
            _spawnTimer = 0f;
            _attackTimer = 0f;
            _xp = 0;
            _nextXp = 4;
            _spawnIndex = 0;
            _bossPhaseLogged = false;
            Enemies.Clear();
            Bullets.Clear();
            BulletVelocity.Clear();
            for (int i = 0; i < 5; i += 1)
            {
                SpawnEnemy();
            }
        }

        private void SpawnEnemy()
        {
            if (Enemies.Count >= 40)
            {
                return;
            }
            Vector2 point = Spawns[_spawnIndex % Spawns.Length];
            _spawnIndex += 1;
            Enemies.Add(new SurvivorEnemy
            {
                Position = point,
                Hp = 1,
                MaxHp = 1,
                Radius = 13f,
                Speed = 40f,
            });
        }

        private void SpawnBoss()
        {
            BossSpawned = true;
            Enemies.Add(new SurvivorEnemy
            {
                Position = new Vector2(480f, 70f),
                Hp = 12,
                MaxHp = 12,
                Boss = true,
                Radius = 26f,
                Speed = 35f,
            });
        }

        public void Step(float moveX, float moveY, float dt)
        {
            if (Won || Lost || dt <= 0f)
            {
                return;
            }
            dt = Mathf.Min(dt, 0.05f);
            Time += dt;
            float length = Mathf.Sqrt(moveX * moveX + moveY * moveY);
            if (length > 1f)
            {
                moveX /= length;
                moveY /= length;
            }
            Player.x = Mathf.Clamp(Player.x + moveX * 230f * dt, 30f, ArenaWidth - 30f);
            Player.y = Mathf.Clamp(Player.y + moveY * 230f * dt, 30f, ArenaHeight - 30f);

            _spawnTimer -= dt;
            if (_spawnTimer <= 0f)
            {
                _spawnTimer = 0.8f;
                SpawnEnemy();
            }
            if (!BossSpawned && Time >= 10f)
            {
                SpawnBoss();
            }

            _attackTimer -= dt;
            SurvivorEnemy target = Nearest();
            if (_attackTimer <= 0f && target != null)
            {
                _attackTimer = 0.22f;
                Vector2 direction = (target.Position - Player).normalized;
                Bullets.Add(Player);
                BulletVelocity.Add(direction * 620f);
            }

            for (int i = Bullets.Count - 1; i >= 0; i -= 1)
            {
                Vector2 position = Bullets[i] + BulletVelocity[i] * dt;
                Bullets[i] = position;
                bool hit = false;
                for (int j = Enemies.Count - 1; j >= 0; j -= 1)
                {
                    SurvivorEnemy enemy = Enemies[j];
                    if (Vector2.Distance(position, enemy.Position) <= enemy.Radius)
                    {
                        enemy.Hp -= 1;
                        hit = true;
                        if (enemy.Hp <= 0)
                        {
                            Enemies.RemoveAt(j);
                            Kills += 1;
                            AddXp(1);
                        }
                        break;
                    }
                }
                if (hit || position.x < 0f || position.x > ArenaWidth || position.y < 0f || position.y > ArenaHeight)
                {
                    Bullets.RemoveAt(i);
                    BulletVelocity.RemoveAt(i);
                }
            }

            for (int i = 0; i < Enemies.Count; i += 1)
            {
                SurvivorEnemy enemy = Enemies[i];
                Vector2 offset = Player - enemy.Position;
                float distance = offset.magnitude;
                if (distance > 24f + enemy.Radius)
                {
                    enemy.Position += offset.normalized * enemy.Speed * dt;
                }
                else
                {
                    PlayerHp -= enemy.Boss ? 14 : 6;
                    if (PlayerHp < 0)
                    {
                        PlayerHp = 0;
                    }
                }
                if (enemy.Boss && !enemy.Phase && enemy.Hp <= enemy.MaxHp / 2)
                {
                    enemy.Phase = true;
                    BossPhase = true;
                    enemy.Speed += 18f;
                }
            }

            if (PlayerHp <= 0)
            {
                Lost = true;
            }
            if (Time >= RunSeconds)
            {
                Won = true;
            }
        }

        private void AddXp(int amount)
        {
            _xp += amount;
            if (_xp < _nextXp)
            {
                return;
            }
            _xp -= _nextXp;
            Level += 1;
            _nextXp = 4 + Level * 2;
        }

        private SurvivorEnemy Nearest()
        {
            SurvivorEnemy best = null;
            float bestDistance = float.MaxValue;
            foreach (SurvivorEnemy enemy in Enemies)
            {
                float distance = Vector2.Distance(Player, enemy.Position);
                if (distance < bestDistance)
                {
                    best = enemy;
                    bestDistance = distance;
                }
            }
            return best;
        }

        public void AutoStep(float dt)
        {
            Step(0f, 0f, dt);
        }

        public bool BossPhaseFirstSeen()
        {
            if (BossPhase && !_bossPhaseLogged)
            {
                _bossPhaseLogged = true;
                return true;
            }
            return false;
        }
    }
}
