using System;
using System.Collections.Generic;

namespace ScpLife.Core
{
    public enum NpcRole
    {
        DClass,
        Guard,
        Scientist,
        Technician,
        Medic,
        MtfOperative,
        SecurityChief,
        Director
    }

    public enum ActivityType
    {
        Idle,
        Sleep,
        Eat,
        Work,
        Patrol,
        GuardPost,
        Leisure,
        Hygiene,
        ObservationSession,
        ChamberInspection,
        Maintenance,
        Treat,
        Labor,
        Confined,
        Respond,
        Shelter,
        Flee,
        Injured,
        SeekTreatment,
        CountingProtocol,
        Escort,
        Escorted,
        Converse,
        Task,
        RepairDoor,
        RetrieveCard
    }

    public enum Posture
    {
        Standing,
        Sitting,
        Lying,
        Working,
        Counting,
        Cowering,
        Down
    }

    /// <summary>Movement state shared by NPCs and mobile anomalies.</summary>
    public sealed class NavAgent
    {
        public Vec3 Position;
        public float Yaw;
        public string RoomId;
        public readonly List<int> Path = new List<int>();
        public int PathIndex;
        public float Speed = 1.35f;
        public float WaitTime;
        public float BlockedTime;
        public string WaitingDoorId;
        public float DoorRequestCooldown;
        public float? ArriveYaw;
        public int LastNode = -1;

        public bool HasPath => PathIndex < Path.Count;
        public bool IsMoving { get; set; }

        public void SetPath(List<int> path)
        {
            Path.Clear();
            PathIndex = 0;
            WaitingDoorId = null;
            WaitTime = 0f;
            BlockedTime = 0f;
            if (path != null) Path.AddRange(path);
        }

        public void ClearPath()
        {
            Path.Clear();
            PathIndex = 0;
            WaitingDoorId = null;
            IsMoving = false;
        }

        public JObj Save()
        {
            var o = new JObj();
            o["pos"] = JObj.FromV3(Position);
            o["yaw"] = Yaw;
            o["room"] = RoomId;
            o["last"] = LastNode;
            return o;
        }

        public void Load(JObj o)
        {
            if (o == null) return;
            Position = o.V3("pos", Position);
            Yaw = o.F("yaw");
            RoomId = o.Str("room", RoomId);
            LastNode = o.Int("last", -1);
            ClearPath();
        }
    }

    public sealed class Needs
    {
        /// <summary>0 = full, 100 = starving.</summary>
        public float Hunger = 20f;
        /// <summary>100 = rested, 0 = exhausted.</summary>
        public float Energy = 80f;
        /// <summary>100 = socially satisfied.</summary>
        public float Social = 60f;
        /// <summary>0 = calm, 100 = panic.</summary>
        public float Stress = 10f;
        public float Health = 100f;

        public void Clamp()
        {
            Hunger = SimMath.Clamp(Hunger, 0f, 100f);
            Energy = SimMath.Clamp(Energy, 0f, 100f);
            Social = SimMath.Clamp(Social, 0f, 100f);
            Stress = SimMath.Clamp(Stress, 0f, 100f);
            Health = SimMath.Clamp(Health, 0f, 100f);
        }

        public JObj Save()
        {
            var o = new JObj();
            o["hunger"] = Hunger;
            o["energy"] = Energy;
            o["social"] = Social;
            o["stress"] = Stress;
            o["health"] = Health;
            return o;
        }

        public void Load(JObj o)
        {
            if (o == null) return;
            Hunger = o.F("hunger", Hunger);
            Energy = o.F("energy", Energy);
            Social = o.F("social", Social);
            Stress = o.F("stress", Stress);
            Health = o.F("health", Health);
        }
    }

    public sealed class ScheduleBlock
    {
        public int Start;
        public int End;
        public ActivityType Activity;
        public string RoomId;
        public PoiType Poi;
        public string Label;
        /// <summary>Patrol checkpoints (POI ids) or other activity parameters.</summary>
        public string[] Route;

        public ScheduleBlock(int start, int end, ActivityType activity, string roomId, PoiType poi, string label, params string[] route)
        {
            Start = start;
            End = end;
            Activity = activity;
            RoomId = roomId;
            Poi = poi;
            Label = label;
            Route = route ?? Array.Empty<string>();
        }
    }

    public sealed class Schedule
    {
        public readonly List<ScheduleBlock> Blocks = new List<ScheduleBlock>();

        public Schedule Add(int start, int end, ActivityType activity, string roomId, PoiType poi, string label, params string[] route)
        {
            Blocks.Add(new ScheduleBlock(start, end, activity, roomId, poi, label, route));
            return this;
        }

        public ScheduleBlock At(double minuteOfDay)
        {
            foreach (var b in Blocks)
                if (GameClock.InRange(minuteOfDay, b.Start, b.End)) return b;
            return null;
        }

        public ScheduleBlock Next(double minuteOfDay)
        {
            ScheduleBlock best = null;
            double bestDiff = double.MaxValue;
            foreach (var b in Blocks)
            {
                double diff = b.Start - minuteOfDay;
                if (diff <= 0) diff += GameClock.MinutesPerDay;
                if (diff < bestDiff)
                {
                    bestDiff = diff;
                    best = b;
                }
            }
            return best;
        }
    }

    public sealed class Personality
    {
        public float Bravery = 0.5f;
        public float Sociability = 0.5f;
        public float Diligence = 0.5f;
        public float Temper = 0.3f;
        public float Curiosity = 0.5f;
    }

    public sealed class Npc
    {
        // --- identity / static data ---
        public string Id;
        public string FirstName;
        public string LastName;
        public string Callsign;
        public NpcRole Role;
        public string Title;
        public string KeycardId;
        public string BedPoiId;
        public string WorkRoomId;
        public Schedule Schedule = new Schedule();
        public Personality Traits = new Personality();
        /// <summary>Briefed on the counting protocol for SCP-L-001.</summary>
        public bool KnowsCountingProtocol;
        public bool Female;
        public int ColorVariant;

        // --- dynamic state ---
        public readonly NavAgent Agent = new NavAgent();
        public readonly Needs Needs = new Needs();
        public readonly NpcMemory Memory = new NpcMemory();
        public readonly Dictionary<string, float> Relations = new Dictionary<string, float>();

        public ActivityType Activity = ActivityType.Idle;
        public string ActivityLabel = "";
        public string TargetRoomId;
        public string TargetPoiId;
        public string ReservedPoiId;
        public double ActivityStarted;
        public double ActivityUntil;
        public int RouteIndex;
        public string[] Route = Array.Empty<string>();
        public bool Arrived;
        public Posture Posture = Posture.Standing;
        public float NextThink;
        public string Bark;
        public double BarkUntil;
        public string ConversationWith;
        public double ConversationUntil;
        public double NextConversationTime;
        public double IncapacitatedUntil;
        public string CurrentTaskId;
        public string FollowTargetId;
        public double LastAnomalyCheck;
        public string Thought = "";
        /// <summary>What this NPC believes about SCP-L-001's agitation (may be outdated).</summary>
        public float KnownAnomalyThreat;
        public double KnownAnomalyThreatTime = -1;
        public bool NeedDriven;
        public float DwellTimer;
        public int BlockedCount;
        public float BlockedRetryTimer;
        public string PendingBark;
        public double PendingBarkAt;
        public double CardLostReportedAt = -1;
        /// <summary>Cached delegate used by the movement system at closed doors.</summary>
        public ClosedDoorHandler DoorHandler;

        public string DisplayName
        {
            get
            {
                if (Role == NpcRole.DClass) return Callsign;
                return $"{Title} {LastName}";
            }
        }

        public string ShortName => Role == NpcRole.DClass ? Callsign : $"{FirstName[0]}. {LastName}";

        /// <summary>Picks the grammatical form matching the NPC's gender (Russian verbs/adjectives).</summary>
        public string G(string male, string female) => Female ? female : male;

        public bool IsIncapacitated(double now) => IncapacitatedUntil > now || Needs.Health <= 0f;

        public float RelationTo(string otherId) => otherId != null && Relations.TryGetValue(otherId, out float v) ? v : 0f;

        public void AdjustRelation(string otherId, float delta)
        {
            if (otherId == null || otherId == Id) return;
            Relations[otherId] = SimMath.Clamp(RelationTo(otherId) + delta, -100f, 100f);
        }

        public void Say(string text, double now, double durationMinutes = 1.5)
        {
            Bark = text;
            BarkUntil = now + durationMinutes;
        }

        public JObj Save()
        {
            var o = new JObj();
            o["id"] = Id;
            o["agent"] = Agent.Save();
            o["needs"] = Needs.Save();
            o["memory"] = Memory.Save();
            var rel = new Dictionary<string, object>();
            foreach (var kv in Relations) rel[kv.Key] = kv.Value;
            o["rel"] = rel;
            o["activity"] = (int)Activity;
            o["label"] = ActivityLabel;
            o["actStart"] = ActivityStarted;
            o["actUntil"] = ActivityUntil;
            o["incap"] = IncapacitatedUntil;
            o["task"] = CurrentTaskId;
            o["card"] = KeycardId;
            o["nextConv"] = NextConversationTime;
            o["threat"] = KnownAnomalyThreat;
            o["threatT"] = KnownAnomalyThreatTime;
            o["cardLost"] = CardLostReportedAt;
            return o;
        }

        public void Load(JObj o)
        {
            Agent.Load(o.Obj("agent"));
            Needs.Load(o.Obj("needs"));
            Memory.Load(o.Arr("memory"));
            Relations.Clear();
            var rel = o.Obj("rel");
            if (rel != null)
                foreach (var kv in rel.Raw)
                    Relations[kv.Key] = (float)rel.Num(kv.Key);
            Activity = (ActivityType)o.Int("activity");
            ActivityLabel = o.Str("label", "");
            ActivityStarted = o.Num("actStart");
            ActivityUntil = o.Num("actUntil");
            IncapacitatedUntil = o.Num("incap");
            CurrentTaskId = o.Str("task");
            KeycardId = o.Str("card", KeycardId);
            NextConversationTime = o.Num("nextConv");
            KnownAnomalyThreat = o.F("threat");
            KnownAnomalyThreatTime = o.Num("threatT", -1);
            CardLostReportedAt = o.Num("cardLost", -1);
            NeedDriven = false;
            // Re-plan on the next think so paths and reservations are rebuilt after loading.
            Arrived = false;
            ReservedPoiId = null;
            NextThink = 0f;
            ConversationWith = null;
        }
    }

    public static class NpcText
    {
        public static string RoleName(NpcRole r)
        {
            switch (r)
            {
                case NpcRole.DClass: return "Класс D";
                case NpcRole.Guard: return "Охрана";
                case NpcRole.Scientist: return "Научный отдел";
                case NpcRole.Technician: return "Технический отдел";
                case NpcRole.Medic: return "Медслужба";
                case NpcRole.MtfOperative: return "МОГ";
                case NpcRole.SecurityChief: return "Начальник СБ";
                case NpcRole.Director: return "Директор";
                default: return r.ToString();
            }
        }

        public static string ActivityName(ActivityType a)
        {
            switch (a)
            {
                case ActivityType.Idle: return "Ожидание";
                case ActivityType.Sleep: return "Сон";
                case ActivityType.Eat: return "Приём пищи";
                case ActivityType.Work: return "Работа";
                case ActivityType.Patrol: return "Патрулирование";
                case ActivityType.GuardPost: return "Дежурство на посту";
                case ActivityType.Leisure: return "Отдых";
                case ActivityType.Hygiene: return "Гигиена";
                case ActivityType.ObservationSession: return "Сеанс счёта SCP-L-001";
                case ActivityType.ChamberInspection: return "Осмотр камеры содержания";
                case ActivityType.Maintenance: return "Техобслуживание";
                case ActivityType.Treat: return "Приём пациентов";
                case ActivityType.Labor: return "Трудовая смена";
                case ActivityType.Confined: return "В камере";
                case ActivityType.Respond: return "Реагирование на угрозу";
                case ActivityType.Shelter: return "Укрытие";
                case ActivityType.Flee: return "Бегство";
                case ActivityType.Injured: return "Ранен";
                case ActivityType.SeekTreatment: return "Идёт в медпункт";
                case ActivityType.CountingProtocol: return "Протокол счёта";
                case ActivityType.Escort: return "Конвой";
                case ActivityType.Escorted: return "Под конвоем";
                case ActivityType.Converse: return "Разговор";
                case ActivityType.Task: return "Задание";
                case ActivityType.RepairDoor: return "Ремонт замка";
                case ActivityType.RetrieveCard: return "Ищет ключ-карту";
                default: return a.ToString();
            }
        }
    }
}
