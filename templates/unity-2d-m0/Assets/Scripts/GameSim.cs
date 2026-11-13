using System;

namespace GameDream
{
    public sealed class GameSim
    {
        public float PlayerX;
        public float PlayerY;
        public float EnemyX;
        public float EnemyY;
        public int PlayerHp;
        public int EnemyHp;
        public bool Won { get; private set; }
        public bool Lost { get; private set; }
        public float PlayerAttackRange => _config.player.attack_range;
        public float PlayerSpeed => _config.player.speed;

        private readonly GameConfig _config;
        private float _playerCooldown;
        private float _enemyCooldown;


        public GameSim() : this(new GameConfig())
        {
        }

        public GameSim(GameConfig config)
        {
            _config = config ?? new GameConfig();
            Reset();
        }

        public void Reset()
        {
            PlayerX = 160f;
            PlayerY = _config.arena.height / 2f;
            EnemyX = _config.arena.width - 200f;
            EnemyY = _config.arena.height / 2f;
            PlayerHp = _config.player.hp;
            EnemyHp = _config.enemy.hp;
            _playerCooldown = 0f;
            _enemyCooldown = 0f;
            Won = false;
            Lost = false;
        }

        public void Step(float moveX, float moveY, bool attack, float dt)
        {
            if (Won || Lost || dt <= 0f)
            {
                return;
            }
            dt = Math.Min(dt, 0.05f);
            float length = (float)Math.Sqrt(moveX * moveX + moveY * moveY);
            if (length > 1f)
            {
                moveX /= length;
                moveY /= length;
            }
            PlayerX += moveX * _config.player.speed * dt;
            PlayerY += moveY * _config.player.speed * dt;
            PlayerX = Math.Max(16f, Math.Min(_config.arena.width - 16f, PlayerX));
            PlayerY = Math.Max(16f, Math.Min(_config.arena.height - 16f, PlayerY));

            float gap = Distance();
            _playerCooldown = Math.Max(0f, _playerCooldown - dt);
            _enemyCooldown = Math.Max(0f, _enemyCooldown - dt);

            if (attack && gap <= _config.player.attack_range && _playerCooldown <= 0f)
            {
                _playerCooldown = 0.25f;
                EnemyHp -= _config.player.damage;
                gap = Distance();
            }

            if (gap > _config.enemy.attack_range)
            {
                float dx = PlayerX - EnemyX;
                float dy = PlayerY - EnemyY;
                float normal = (float)Math.Sqrt(dx * dx + dy * dy);
                if (normal > 0.001f)
                {
                    EnemyX += dx / normal * _config.enemy.speed * dt;
                    EnemyY += dy / normal * _config.enemy.speed * dt;
                }
            }
            else if (_enemyCooldown <= 0f)
            {
                _enemyCooldown = 1f;
                PlayerHp -= _config.enemy.damage;
            }

            if (EnemyHp <= 0)
            {
                EnemyHp = 0;
                Won = true;
            }
            else if (PlayerHp <= 0)
            {
                PlayerHp = 0;
                Lost = true;
            }
        }

        public float Distance()
        {
            float dx = PlayerX - EnemyX;
            float dy = PlayerY - EnemyY;
            return (float)Math.Sqrt(dx * dx + dy * dy);
        }
    }
}
