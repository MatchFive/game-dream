using System;

namespace GameDream
{
    /// <summary>
    /// Small deterministic genre sim used by the Unity cross-engine slices.
    /// The bootstrap renders and the verifier drives the same state machine.
    /// </summary>
    public sealed class GenreSim
    {
        public const float ArenaWidth = 960f;
        public const float ArenaHeight = 540f;

        public readonly string Mode;
        public float X;
        public float Y;
        public float Time;
        public int Progress;
        public bool Won;
        public bool Lost;
        public string Status = "READY";
        public int Milestone;

        private int _lastMilestone;

        public GenreSim(string mode)
        {
            Mode = string.IsNullOrEmpty(mode) ? "roguelike" : mode;
            Reset();
        }

        public void Reset()
        {
            X = ArenaWidth / 2f;
            Y = ArenaHeight / 2f;
            Time = 0f;
            Progress = 0;
            Won = false;
            Lost = false;
            Milestone = 0;
            _lastMilestone = 0;
            Status = "READY";
        }

        public void Step(float moveX, float moveY, float dt)
        {
            if (Won || Lost || dt <= 0f)
            {
                return;
            }
            dt = Math.Min(dt, 0.05f);
            Time += dt;
            X = Math.Max(24f, Math.Min(ArenaWidth - 24f, X + moveX * 220f * dt));
            Y = Math.Max(24f, Math.Min(ArenaHeight - 24f, Y + moveY * 220f * dt));

            switch (Mode)
            {
                case "tower-defense":
                    if (Time >= 1.0f * (Progress + 1))
                    {
                        Progress += 1;
                        Milestone = 1;
                        Status = "WAVE " + Progress;
                        if (Progress >= 5)
                        {
                            Won = true;
                            Status = "GRID HELD";
                        }
                    }
                    break;
                case "puzzle":
                    if (Time >= 0.8f * (Progress + 1))
                    {
                        Progress += 1;
                        Milestone = 1;
                        Status = "PUSH " + Progress;
                        if (Progress >= 2)
                        {
                            Won = true;
                            Status = "CIRCUITS ALIGNED";
                        }
                    }
                    break;
                default:
                    if (Time >= 0.1f * (Progress + 1))
                    {
                        Progress += 1;
                        Milestone = 1;
                        Status = "TURN " + Progress;
                        if (Progress >= 24)
                        {
                            Won = true;
                            Status = "RUN COMPLETE";
                        }
                    }
                    break;
            }
        }

        public void AutoStep(float dt)
        {
            Step(0f, 0f, dt);
        }

        public bool MilestoneFirstSeen()
        {
            if (Milestone > 0 && Milestone != _lastMilestone)
            {
                _lastMilestone = Milestone;
                return true;
            }
            return false;
        }
    }
}
