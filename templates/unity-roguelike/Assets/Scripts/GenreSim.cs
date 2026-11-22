using System;
using System.Collections.Generic;

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
        public const int RoomCount = 3;

        public readonly string Mode;
        public float X;
        public float Y;
        public float Time;
        public int Progress;
        public bool Won;
        public bool Lost;
        public string Status = "READY";
        public int Milestone;
        public int RoomIndex;
        public string RoomName = "Entry Hall";
        public int Gold;
        public readonly List<string> Relics = new List<string>();
        public readonly List<string> RoomEvents = new List<string>();

        private int _lastMilestone;
        private bool _roomLogged;
        private bool _relicLogged;

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
            RoomIndex = 0;
            RoomName = "Entry Hall";
            Gold = 0;
            Relics.Clear();
            RoomEvents.Clear();
            _roomLogged = false;
            _relicLogged = false;
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
                        if (Progress >= 4)
                        {
                            Won = true;
                            Status = "CIRCUITS ALIGNED";
                        }
                    }
                    break;
                case "platformer":
                    if (Time >= 0.6f * (Progress + 1))
                    {
                        Progress += 1;
                        Milestone = 1;
                        Status = "PLATFORM " + Progress;
                        if (Progress >= 4)
                        {
                            Won = true;
                            Status = "COURSE CLEAR";
                        }
                    }
                    break;
                case "shooter":
                    if (Time >= 0.7f * (Progress + 1))
                    {
                        Progress += 1;
                        Milestone = 1;
                        Status = "WAVE " + Progress;
                        if (Progress >= 5)
                        {
                            Won = true;
                            Status = "SECTOR CLEAR";
                        }
                    }
                    break;
                default:
                    if (Time >= 0.1f * (Progress + 1))
                    {
                        Progress += 1;
                        Milestone = 1;
                        if (Progress == 8)
                        {
                            RoomIndex = 1;
                            RoomName = "Ash Market";
                            Gold += 6;
                            RoomEvents.Add("market:cache");
                            if (Gold >= 5)
                            {
                                Gold -= 5;
                                Relics.Add("ember");
                            }
                        }
                        else if (Progress == 16)
                        {
                            RoomIndex = 2;
                            RoomName = "Vault";
                            RoomEvents.Add("vault:ambush");
                        }
                        Status = $"ROOM {RoomIndex + 1}/{RoomCount} {RoomName} · TURN {Progress}";
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

        public bool RoomFirstSeen()
        {
            if (RoomIndex > 0 && !_roomLogged)
            {
                _roomLogged = true;
                return true;
            }
            return false;
        }

        public bool RelicFirstSeen()
        {
            if (Relics.Count > 0 && !_relicLogged)
            {
                _relicLogged = true;
                return true;
            }
            return false;
        }
    }
}
