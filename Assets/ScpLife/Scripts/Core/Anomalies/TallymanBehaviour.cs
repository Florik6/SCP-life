using System;
using System.Collections.Generic;

namespace ScpLife.Core
{
    /// <summary>
    /// SCP-L-001 «Счетовод» — a sapient, slow humanoid that counts everything it perceives.
    ///
    /// Behaviour model:
    ///  • Remembers every person it sees and the hours they appear; irregular visitors raise its
    ///    "dissonance", regular ones calm it.
    ///  • Learns when its chamber door opens (15-minute buckets). After seeing the same time twice
    ///    it can predict the next opening and wait next to the door.
    ///  • Containment requirements: a counting session by a briefed scientist every 6 hours,
    ///    working lights, a closed door. Violations accumulate dissonance.
    ///  • Escalation (contained): counting → watching → tapping signals → probing the lock
    ///    (reader faults, light flicker, lock integrity loss) → silently waiting at the door.
    ///  • A breach only happens through a concrete opening: a scheduled/unscheduled door cycle
    ///    while it is agitated and close, or a lock that failed after prolonged probing.
    ///  • Breached: hunts the most "irregular" person it remembers, forces doors slowly,
    ///    is slowed and calmed by the counting protocol, returns to its chamber when calm.
    /// </summary>
    public sealed class TallymanBehaviour : AnomalyBehaviour
    {
        public const string AnomalyId = "SCP-L-001";
        public const float SessionInterval = 360f;
        public const float SessionGrace = 60f;
        public const int BucketsPerDay = 96;

        public enum TallyState
        {
            Counting,
            Watching,
            Signaling,
            Probing,
            WaitingAtDoor,
            Breached,
            Returning
        }

        public sealed class PersonModel
        {
            public int Visits;
            public readonly float[] Hours = new float[24];
            public double LastSeen = -1000;
            public float Irregularity;
        }

        // --- configuration resolved at Initialize ---
        public string ContainmentDoorId;
        public string ObservationRoomId;
        public string WindowPoiId;
        public string CenterPoiId;
        public readonly List<string> WanderPoiIds = new List<string>();

        // --- dynamic state ---
        public float Dissonance = 12f;
        public TallyState State = TallyState.Counting;
        public double LastSessionEnd;
        public float SessionProgress;
        public double SessionLastActive = -1000;
        public int TallyCount = 1342;
        public readonly int[] DoorHistogram = new int[BucketsPerDay];
        public int LastDoorCycles;
        public readonly Dictionary<string, PersonModel> People = new Dictionary<string, PersonModel>();
        public string TargetId;
        public double LastObservedByPlayer = -1;
        public float LastPlayerObservedThreat;
        public int VisitorsToday;
        public int ReadersActive;

        private SimWorld _world;
        private ClosedDoorHandler _breachDoorHandler;
        private ClosedDoorHandler _containedDoorHandler;
        private float _perceptionTimer;
        private float _wanderTimer;
        private float _signalTimer = 30f;
        private float _probeTimer = 20f;
        private float _attackCooldown;
        private float _poseTimer;
        private float _repathTimer;
        private float _scratchTimer;
        private int _goalNode = -1;
        private string _forcingDoorId;
        private float _forceStartTime;
        private int _lastVisitDay = -1;

        public override float ThreatLevel => Owner != null && !Owner.Contained ? 100f : Dissonance;

        public override string StatusText
        {
            get
            {
                switch (State)
                {
                    case TallyState.Counting: return "Счёт · спокоен";
                    case TallyState.Watching: return "Наблюдает · насторожен";
                    case TallyState.Signaling: return "Стучит по стеклу · возбуждён";
                    case TallyState.Probing: return "Воздействует на замок · опасно";
                    case TallyState.WaitingAtDoor: return "Неподвижен у двери";
                    case TallyState.Breached: return "ВНЕ КАМЕРЫ";
                    case TallyState.Returning: return "Возвращается в камеру";
                    default: return State.ToString();
                }
            }
        }

        public override void Initialize(SimWorld world)
        {
            _world = world;
            Room chamber = world.Facility.GetRoom(Owner.ContainmentRoomId);
            foreach (string doorId in chamber.DoorIds)
            {
                var d = world.Facility.GetDoor(doorId);
                if (d.Kind == DoorKind.Heavy) ContainmentDoorId = d.Id;
            }
            if (ContainmentDoorId == null && chamber.DoorIds.Count > 0) ContainmentDoorId = chamber.DoorIds[0];
            ObservationRoomId = chamber.VisibleRooms.Count > 0 ? chamber.VisibleRooms[0] : null;
            WanderPoiIds.Clear();
            foreach (var poi in chamber.Pois)
            {
                if (poi.Type == PoiType.Window) WindowPoiId = poi.Id;
                else if (poi.Type == PoiType.Stand) WanderPoiIds.Add(poi.Id);
            }
            CenterPoiId = WanderPoiIds.Count > 0 ? WanderPoiIds[0] : null;
            var door = world.Facility.GetDoor(ContainmentDoorId);
            LastDoorCycles = door?.OpenCycles ?? 0;
            if (Owner.Agent.RoomId == null)
            {
                Owner.Agent.RoomId = chamber.Id;
                var center = world.Facility.GetPoi(CenterPoiId);
                Owner.Agent.Position = center?.Position ?? chamber.Center;
            }
            Owner.Agent.Speed = 0.9f;
            _breachDoorHandler = ForceDoor;
            _containedDoorHandler = (d, f) => DoorWaitOutcome.Blocked;
        }

        /// <summary>Pre-seeds knowledge accumulated before the game starts (regular staff, past door cycles).</summary>
        public void SeedFamiliarity(string personId, params int[] hours)
        {
            var p = GetPerson(personId);
            foreach (int h in hours)
            {
                p.Hours[((h % 24) + 24) % 24] += 2f;
                p.Visits += 2;
            }
            p.Irregularity = 0.15f;
        }

        public void SeedDoorCycle(int hour, int minute, int count)
        {
            DoorHistogram[Bucket(hour * 60 + minute)] += count;
        }

        private PersonModel GetPerson(string id)
        {
            if (!People.TryGetValue(id, out var p))
            {
                p = new PersonModel();
                People[id] = p;
            }
            return p;
        }

        public static int Bucket(double minuteOfDay) => ((int)(minuteOfDay / 15.0) % BucketsPerDay + BucketsPerDay) % BucketsPerDay;

        public float SessionOverdueMinutes(double now) => (float)(now - (LastSessionEnd + SessionInterval + SessionGrace));

        /// <summary>Minutes until the next door opening this entity expects, or -1 if it has not learned one.</summary>
        public double PredictMinutesToDoorOpening(double now)
        {
            double minute = now % GameClock.MinutesPerDay;
            int current = Bucket(minute);
            double intoBucket = minute - current * 15.0;
            for (int k = 0; k <= 12; k++)
            {
                int b = (current + k) % BucketsPerDay;
                if (DoorHistogram[b] >= 2) return Math.Max(0.0, k * 15.0 - intoBucket);
            }
            return -1;
        }

        /// <summary>The time slot the entity has learned best (for clues on the chamber walls).</summary>
        public int StrongestLearnedBucket()
        {
            int best = -1;
            int bestCount = 1;
            for (int i = 0; i < BucketsPerDay; i++)
            {
                if (DoorHistogram[i] > bestCount)
                {
                    bestCount = DoorHistogram[i];
                    best = i;
                }
            }
            return best;
        }

        // ------------------------------------------------------------------ main tick

        public override void Tick(SimWorld world, float dt, double gameMinutes)
        {
            _world = world;
            double now = world.Now;
            float m = (float)gameMinutes;
            Room room = world.Facility.GetRoom(Owner.Agent.RoomId);
            Door door = world.Facility.GetDoor(ContainmentDoorId);
            _attackCooldown -= dt;
            _poseTimer -= dt;

            if (world.Clock.Day != _lastVisitDay)
            {
                _lastVisitDay = world.Clock.Day;
                VisitorsToday = 0;
            }

            // Door cycles are counted (it hears the mechanism).
            if (door != null && door.OpenCycles != LastDoorCycles)
            {
                int delta = door.OpenCycles - LastDoorCycles;
                LastDoorCycles = door.OpenCycles;
                if (delta > 0)
                {
                    int bucket = Bucket(world.Clock.MinuteOfDay);
                    bool expected = DoorHistogram[bucket] >= 2;
                    DoorHistogram[bucket] += 1;
                    TallyCount += delta;
                    if (Owner.Contained) Dissonance += expected ? -1.5f : 3f;
                }
            }

            _perceptionTimer -= dt;
            if (_perceptionTimer <= 0f)
            {
                _perceptionTimer = 1f;
                Perceive(world, now);
            }

            ReadersActive = CountReaders(world);
            bool sessionActive = Owner.Contained && IsSessionActive(world);
            float overdue = SessionOverdueMinutes(now);
            bool dark = room != null && !room.LightsOn;

            if (sessionActive)
            {
                SessionProgress += m;
                SessionLastActive = now;
                Dissonance -= 1.2f * m;
                if (SessionProgress >= 15f) LastSessionEnd = now;
            }
            else if (now - SessionLastActive > 5) SessionProgress = 0f;

            if (overdue > 0f) Dissonance += m * Math.Min(0.6f, 0.12f + overdue / 600f);
            if (dark) Dissonance += 2.5f * m;
            if (ReadersActive > 0) Dissonance -= (Owner.Contained ? 1.5f : 3f) * ReadersActive * m;
            // Once agitated (signalling or worse) it does not settle by itself: it needs a session or the protocol.
            if (Owner.Contained && overdue <= 0f && !dark && ReadersActive == 0 && !sessionActive && State <= TallyState.Watching)
                Dissonance -= 0.15f * m;
            if (!Owner.Contained) Dissonance -= 0.1f * m;
            Dissonance = SimMath.Clamp(Dissonance, Owner.Contained ? 3f : 0f, 100f);

            if (door != null && Dissonance < 50f && door.Integrity < 100f && door.Integrity > 0f)
                door.Integrity = Math.Min(100f, door.Integrity + 0.1f * m);

            if (Owner.Contained) TickContained(world, dt, m, door);
            else TickBreached(world, dt, door);
        }

        // ------------------------------------------------------------------ perception

        private void Perceive(SimWorld world, double now)
        {
            int hour = world.Clock.Hour;
            string nearest = null;
            float nearestD = float.MaxValue;
            string mostIrregular = null;
            float maxIrr = -1f;
            foreach (var s in world.PeopleVisibleFrom(Owner.Agent.RoomId))
            {
                float d = Vec3.DistanceXZ(Owner.Agent.Position, s.Position);
                if (d > 20f) continue;
                if (s.Id != PlayerState.PlayerId && world.GetNpc(s.Id)?.IsIncapacitated(now) == true) continue;
                var p = GetPerson(s.Id);
                if (now - p.LastSeen > 30)
                {
                    float familiarity = p.Visits == 0 ? 0f
                        : Math.Min(1f, (p.Hours[hour] + 0.5f * (p.Hours[(hour + 23) % 24] + p.Hours[(hour + 1) % 24])) / 2f);
                    float irr = p.Visits == 0 ? 0.8f : Math.Max(0.1f, 1f - familiarity);
                    if (Owner.Contained) Dissonance += irr * 6f - (1f - irr) * 2f;
                    p.Irregularity = p.Visits == 0 ? irr : p.Irregularity * 0.7f + irr * 0.3f;
                    p.Visits++;
                    p.Hours[hour] += 1f;
                    TallyCount++;
                    VisitorsToday++;
                }
                p.LastSeen = now;
                if (d < nearestD)
                {
                    nearestD = d;
                    nearest = s.Id;
                }
                if (p.Irregularity > maxIrr)
                {
                    maxIrr = p.Irregularity;
                    mostIrregular = s.Id;
                }
            }
            Owner.LookAtId = mostIrregular ?? nearest;
        }

        private bool IsSessionActive(SimWorld world)
        {
            foreach (var npc in world.Npcs)
            {
                if (npc.Activity != ActivityType.ObservationSession || !npc.Arrived || npc.Agent.HasPath) continue;
                if (npc.IsIncapacitated(world.Now)) continue;
                if (npc.Agent.RoomId != ObservationRoomId && npc.Agent.RoomId != Owner.ContainmentRoomId) continue;
                return true;
            }
            return false;
        }

        private int CountReaders(SimWorld world)
        {
            int count = 0;
            foreach (var npc in world.Npcs)
            {
                if (npc.Activity != ActivityType.CountingProtocol || npc.Posture != Posture.Counting) continue;
                if (npc.FollowTargetId != Owner.Id || npc.IsIncapacitated(world.Now)) continue;
                if (world.CanPerformCounting(npc.Id, npc.Agent.Position, npc.Agent.RoomId, Owner)) count++;
            }
            var pl = world.Player;
            if (pl.Counting && pl.CountingTargetId == Owner.Id && !pl.Dead &&
                world.CanPerformCounting(PlayerState.PlayerId, pl.Position, pl.RoomId, Owner))
                count++;
            return count;
        }

        // ------------------------------------------------------------------ contained behaviour

        private static float Threshold(TallyState s)
        {
            switch (s)
            {
                case TallyState.Watching: return 30f;
                case TallyState.Signaling: return 55f;
                case TallyState.Probing: return 75f;
                case TallyState.WaitingAtDoor: return 70f;
                default: return 0f;
            }
        }

        private void TickContained(SimWorld world, float dt, float m, Door door)
        {
            double now = world.Now;
            float d = Dissonance;
            TallyState desired;
            if (d < 30f) desired = TallyState.Counting;
            else if (d < 55f) desired = TallyState.Watching;
            else if (d < 75f) desired = TallyState.Signaling;
            else desired = TallyState.Probing;

            double untilOpen = PredictMinutesToDoorOpening(now);
            if (d >= 70f && ((untilOpen >= 0 && untilOpen <= 25) || (door != null && door.Integrity <= 0f)))
                desired = TallyState.WaitingAtDoor;

            // Hysteresis when calming down.
            if (State != TallyState.Breached && State != TallyState.Returning && desired < State &&
                State != TallyState.WaitingAtDoor && d > Threshold(State) - 3f)
                desired = State;
            if (State == TallyState.Breached || State == TallyState.Returning) desired = TallyState.Counting;
            if (desired != State) EnterState(world, desired);

            Owner.Agent.Speed = 0.9f;
            int doorNode = DoorNode(world, door);
            switch (State)
            {
                case TallyState.Counting:
                    _wanderTimer -= dt;
                    if (!Owner.Agent.HasPath && _wanderTimer <= 0f && WanderPoiIds.Count > 0)
                    {
                        var poi = world.Facility.GetPoi(WanderPoiIds[world.Rng.Range(0, WanderPoiIds.Count)]);
                        if (poi != null) MoveToNode(world, poi.NodeIndex, poi.FacingYaw, false);
                        _wanderTimer = world.Rng.Range(18f, 40f);
                    }
                    _scratchTimer -= dt;
                    if (_scratchTimer <= 0f)
                    {
                        _scratchTimer = 25f;
                        TallyCount++;
                    }
                    SetPose(Owner.Agent.IsMoving ? AnomalyPose.Walking : AnomalyPose.Scratching);
                    break;

                case TallyState.Watching:
                    MoveToPoi(world, WindowPoiId);
                    SetPose(Owner.Agent.IsMoving ? AnomalyPose.Walking : AnomalyPose.Watching);
                    break;

                case TallyState.Signaling:
                    MoveToPoi(world, WindowPoiId);
                    SetPose(Owner.Agent.IsMoving ? AnomalyPose.Walking : AnomalyPose.Tapping);
                    _signalTimer -= dt;
                    if (_signalTimer <= 0f && !Owner.Agent.IsMoving)
                    {
                        _signalTimer = world.Rng.Range(45f, 90f);
                        PostBehaviour(world, 1, EventType.AnomalyBehaviour, $"{Owner.Id} стучит по стеклу: {TapPattern(world)}");
                    }
                    break;

                case TallyState.Probing:
                    if (doorNode >= 0) MoveToNode(world, doorNode, null, false);
                    SetPose(Owner.Agent.IsMoving ? AnomalyPose.Walking : AnomalyPose.Probing);
                    if (!Owner.Agent.IsMoving && door != null)
                    {
                        door.Integrity = Math.Max(0f, door.Integrity - 0.6f * m);
                        _probeTimer -= dt;
                        if (_probeTimer <= 0f)
                        {
                            _probeTimer = world.Rng.Range(40f, 80f);
                            door.ReaderFaultUntil = now + 3;
                            Flicker(world, Owner.ContainmentRoomId, now);
                            Flicker(world, ObservationRoomId, now);
                            Flicker(world, door.OtherSide(Owner.ContainmentRoomId), now);
                            PostBehaviour(world, 2, EventType.ContainmentWarning,
                                $"Сбой контроллера замка камеры {Owner.Id}: целостность {door.Integrity:0}%. Мигает свет.");
                        }
                    }
                    break;

                case TallyState.WaitingAtDoor:
                    if (doorNode >= 0) MoveToNode(world, doorNode, null, false);
                    SetPose(Owner.Agent.IsMoving ? AnomalyPose.Walking : AnomalyPose.Waiting);
                    if (!Owner.Agent.IsMoving && door != null) door.Integrity = Math.Max(0f, door.Integrity - 0.3f * m);
                    break;
            }

            if (door != null)
            {
                if (door.Integrity <= 0f && d >= 70f && door.State == DoorState.Closed)
                {
                    door.CommandOpen(30f);
                    PostBehaviour(world, 3, EventType.ContainmentWarning, $"Замок двери камеры {Owner.Id} отказал — дверь открывается!");
                }
                if (door.IsPassable && d >= 70f)
                {
                    var spot = doorNode >= 0 ? world.Facility.Graph.Nodes[doorNode].Position : door.Position;
                    if (Vec3.DistanceXZ(Owner.Agent.Position, spot) < 2.8f)
                    {
                        BeginBreach(world);
                        return;
                    }
                    // Rush to the open door.
                    Owner.Agent.Speed = 2.0f;
                    if (doorNode >= 0) MoveToNode(world, doorNode, null, false);
                }
            }

            if (d >= 60f) TryAttackNearby(world, true);
            world.MoveAgent(Owner.Agent, dt, _containedDoorHandler, false);
        }

        private void EnterState(SimWorld world, TallyState next)
        {
            TallyState previous = State;
            State = next;
            _goalNode = -1;
            switch (next)
            {
                case TallyState.Counting:
                    if (previous >= TallyState.Signaling && previous <= TallyState.WaitingAtDoor)
                        PostBehaviour(world, 0, EventType.AnomalyBehaviour, $"{Owner.Id} отошёл от двери и вернулся к счёту");
                    break;
                case TallyState.Watching:
                    if (previous == TallyState.Counting)
                        PostBehaviour(world, 0, EventType.AnomalyBehaviour, $"{Owner.Id} прекратил счёт и подошёл к стеклу");
                    break;
                case TallyState.Signaling:
                    _signalTimer = 5f;
                    break;
                case TallyState.Probing:
                    _probeTimer = 10f;
                    PostBehaviour(world, 2, EventType.ContainmentWarning, $"Датчики камеры: {Owner.Id} у двери, фиксируется воздействие на замок");
                    break;
                case TallyState.WaitingAtDoor:
                    // Deliberately silent: it stops making noise and simply waits.
                    break;
            }
        }

        private string TapPattern(SimWorld world)
        {
            int bucket = StrongestLearnedBucket();
            if (bucket >= 0)
            {
                int hour = bucket / 4;
                int tens = hour / 10;
                int units = hour % 10;
                string first = tens > 0 ? $"{NumberWords.ToWords(tens)} {Plural(tens)}, пауза, " : "";
                return $"{first}{NumberWords.ToWords(units)} {Plural(units)}. Повторяет снова и снова.";
            }
            int n = Math.Max(1, VisitorsToday % 10);
            return $"{NumberWords.ToWords(n)} {Plural(n)}, затем долгая тишина.";
        }

        private static string Plural(int n)
        {
            int mod10 = n % 10, mod100 = n % 100;
            if (mod10 == 1 && mod100 != 11) return "удар";
            if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "удара";
            return "ударов";
        }

        private static void Flicker(SimWorld world, string roomId, double now)
        {
            var room = world.Facility.GetRoom(roomId);
            if (room != null) room.FlickerUntil = Math.Max(room.FlickerUntil, now + 1.5);
        }

        private int DoorNode(SimWorld world, Door door)
        {
            if (door == null) return -1;
            return door.NodeOnSide(Owner.ContainmentRoomId);
        }

        private void MoveToPoi(SimWorld world, string poiId)
        {
            var poi = world.Facility.GetPoi(poiId);
            if (poi != null) MoveToNode(world, poi.NodeIndex, poi.FacingYaw, false);
        }

        private void MoveToNode(SimWorld world, int node, float? yaw, bool allowDoors)
        {
            if (node < 0 || node == _goalNode) return;
            _goalNode = node;
            var path = world.PlanPath(Owner.Agent.Position, Owner.Agent.RoomId, node, (d, f) => allowDoors);
            if (path == null) return;
            Owner.Agent.SetPath(path);
            Owner.Agent.ArriveYaw = yaw;
        }

        private void SetPose(AnomalyPose pose)
        {
            if (_poseTimer > 0f) return;
            Owner.Pose = pose;
        }

        // ------------------------------------------------------------------ breach behaviour

        private void BeginBreach(SimWorld world)
        {
            Owner.Contained = false;
            Owner.BreachDetected = false;
            Owner.BreachStartedAt = world.Now;
            State = TallyState.Breached;
            _goalNode = -1;
            Owner.Agent.ClearPath();
            ChooseTarget(world);
            PostBehaviour(world, 3, EventType.AnomalyBehaviour, $"{Owner.Id} выходит из камеры содержания");
        }

        private void TickBreached(SimWorld world, float dt, Door door)
        {
            float d = Dissonance;
            if (State == TallyState.Breached && d < 35f)
            {
                State = TallyState.Returning;
                TargetId = null;
                _goalNode = -1;
                Owner.Agent.ClearPath();
                PostBehaviour(world, 1, EventType.AnomalyBehaviour, $"{Owner.Id} замедляется и поворачивает обратно к камере");
            }
            else if (State == TallyState.Returning && d >= 60f)
            {
                State = TallyState.Breached;
                ChooseTarget(world);
            }
            else if (State != TallyState.Breached && State != TallyState.Returning)
            {
                State = TallyState.Breached;
                ChooseTarget(world);
            }

            float speedFactor = 1f / (1f + 0.8f * ReadersActive);
            Owner.Agent.Speed = (State == TallyState.Returning ? 1.0f : 1.25f) * speedFactor;

            if (State == TallyState.Breached)
            {
                if (!IsValidTarget(world, TargetId)) ChooseTarget(world);
                _repathTimer -= dt;
                if (TargetId != null && (_repathTimer <= 0f || !Owner.Agent.HasPath))
                {
                    _repathTimer = 3f;
                    PathToPoint(world, world.PositionOf(TargetId), world.RoomOf(TargetId));
                }
                TryAttackNearby(world, false);
            }
            else
            {
                var center = world.Facility.GetPoi(CenterPoiId);
                if (Owner.Agent.RoomId != Owner.ContainmentRoomId)
                {
                    if (!Owner.Agent.HasPath && center != null) PathToNode(world, center.NodeIndex);
                }
                else
                {
                    if (!Owner.Agent.HasPath && center != null && Vec3.DistanceXZ(center.Position, Owner.Agent.Position) > 1.0f)
                        PathToNode(world, center.NodeIndex);
                    if (door != null && door.IsClosed && world.Facility.GetRoom(Owner.ContainmentRoomId).Contains(Owner.Agent.Position))
                    {
                        Recontain(world);
                        return;
                    }
                }
            }

            var status = world.MoveAgent(Owner.Agent, dt, _breachDoorHandler, false);
            if (status != MoveStatus.Waiting)
            {
                _forcingDoorId = null;
                if (ReadersActive > 0) SetPose(AnomalyPose.Slowed);
                else SetPose(Owner.Agent.IsMoving ? AnomalyPose.Walking : AnomalyPose.Watching);
            }
        }

        private DoorWaitOutcome ForceDoor(Door door, string fromRoom)
        {
            var world = _world;
            if (_forcingDoorId != door.Id)
            {
                _forcingDoorId = door.Id;
                _forceStartTime = world.RealTime;
            }
            SetPose(AnomalyPose.Probing);
            float needed = door.Kind == DoorKind.Heavy ? 20f : door.Kind == DoorKind.Security ? 10f : 6f;
            if (ReadersActive > 0) needed *= 2f;
            if (world.RealTime - _forceStartTime >= needed)
            {
                door.ReaderFaultUntil = world.Now + 10;
                door.CommandOpen(6f);
                _forcingDoorId = null;
                Flicker(world, fromRoom, world.Now);
                world.Events.Post(new FacilityEvent
                {
                    Time = world.Now,
                    Type = EventType.ReaderMalfunction,
                    RoomId = fromRoom,
                    Position = door.Position,
                    ActorId = Owner.Id,
                    TargetId = door.Id,
                    Severity = 2,
                    Text = $"{door.Name} открылась без авторизации (сбой контроллера)"
                });
            }
            return DoorWaitOutcome.Wait;
        }

        private bool IsValidTarget(SimWorld world, string id)
        {
            if (id == null) return false;
            if (id == PlayerState.PlayerId) return !world.Player.Dead;
            var npc = world.GetNpc(id);
            return npc != null && !npc.IsIncapacitated(world.Now);
        }

        private void ChooseTarget(SimWorld world)
        {
            string best = null;
            float bestScore = float.MinValue;
            Room myRoom = world.Facility.GetRoom(Owner.Agent.RoomId);
            foreach (var kv in People)
            {
                if (!IsValidTarget(world, kv.Key)) continue;
                string room = world.RoomOf(kv.Key);
                if (room == null) continue;
                bool visible = myRoom != null && myRoom.CanSeeInto(room);
                float dist = Vec3.DistanceXZ(world.PositionOf(kv.Key), Owner.Agent.Position);
                float score = kv.Value.Irregularity * 2f + (visible ? 1f : 0f) - dist / 40f;
                if (score > bestScore)
                {
                    bestScore = score;
                    best = kv.Key;
                }
            }
            if (best == null)
            {
                float bestD = float.MaxValue;
                foreach (var s in world.EnumerateSubjects())
                {
                    if (s.IsAnomaly || !IsValidTarget(world, s.Id)) continue;
                    float dist = Vec3.DistanceXZ(s.Position, Owner.Agent.Position);
                    if (dist < bestD)
                    {
                        bestD = dist;
                        best = s.Id;
                    }
                }
            }
            TargetId = best;
            Owner.LookAtId = best;
            _repathTimer = 0f;
        }

        private void PathToPoint(SimWorld world, Vec3 pos, string roomId)
        {
            int goal = world.Facility.NearestNode(pos, roomId);
            PathToNode(world, goal);
        }

        private void PathToNode(SimWorld world, int goal)
        {
            if (goal < 0) return;
            var path = world.PlanPath(Owner.Agent.Position, Owner.Agent.RoomId, goal, (d, f) => true);
            if (path == null) return;
            // Append the exact target position by stopping at the node; attacks use proximity.
            Owner.Agent.SetPath(path);
            Owner.Agent.ArriveYaw = null;
        }

        private void TryAttackNearby(SimWorld world, bool sameRoomOnly)
        {
            if (_attackCooldown > 0f) return;
            string victim = null;
            float bestD = 1.5f;
            foreach (var s in world.EnumerateSubjects())
            {
                if (s.IsAnomaly || s.RoomId == null) continue;
                if (sameRoomOnly && s.RoomId != Owner.Agent.RoomId) continue;
                if (!IsValidTarget(world, s.Id)) continue;
                float dist = Vec3.DistanceXZ(s.Position, Owner.Agent.Position);
                if (dist < bestD)
                {
                    bestD = dist;
                    victim = s.Id;
                }
            }
            if (victim == null) return;

            _attackCooldown = 6f;
            _poseTimer = 0f;
            Owner.Pose = AnomalyPose.Attacking;
            _poseTimer = 1.5f;
            Dissonance = Math.Max(0f, Dissonance - 22f);
            if (People.TryGetValue(victim, out var model)) model.Irregularity *= 0.4f;

            if (victim == PlayerState.PlayerId)
            {
                world.DamagePlayer(34f, Owner.Id, $"{Owner.Id} касается {world.Player.Name}: резкая боль, перед глазами мелькают цифры");
            }
            else
            {
                var npc = world.GetNpc(victim);
                world.InjureNpc(npc, 45f, Owner.Id, $"{Owner.Id} атакует: {npc.DisplayName} без сознания", 25);
                var card = world.GetCard(npc.KeycardId);
                if (card != null && card.HolderId == npc.Id && world.Rng.Chance(0.5))
                {
                    card.HolderId = null;
                    card.WorldRoomId = npc.Agent.RoomId;
                    card.WorldPosition = npc.Agent.Position + new Vec3(world.Rng.Range(-0.5f, 0.5f), 0f, world.Rng.Range(-0.5f, 0.5f));
                }
            }
            if (victim == TargetId) ChooseTarget(world);
        }

        private void Recontain(SimWorld world)
        {
            Owner.Contained = true;
            Owner.BreachDetected = false;
            State = TallyState.Counting;
            Dissonance = Math.Min(Dissonance, 25f);
            TargetId = null;
            _goalNode = -1;
            world.Events.Post(new FacilityEvent
            {
                Time = world.Now,
                Type = EventType.Recontained,
                RoomId = Owner.ContainmentRoomId,
                Position = Owner.Agent.Position,
                ActorId = Owner.Id,
                Severity = 2,
                Public = true,
                Text = $"{Owner.DisplayName} в камере содержания, дверь закрыта. Повторное содержание подтверждено."
            });
        }

        private void PostBehaviour(SimWorld world, int severity, EventType type, string text)
        {
            world.Events.Post(new FacilityEvent
            {
                Time = world.Now,
                Type = type,
                RoomId = Owner.Agent.RoomId,
                Position = Owner.Agent.Position,
                ActorId = Owner.Id,
                Severity = severity,
                Text = text
            });
        }

        // ------------------------------------------------------------------ observation reports

        public override string Observe(SimWorld world, string observerId)
        {
            double now = world.Now;
            var parts = new List<string>();
            switch (State)
            {
                case TallyState.Counting:
                    parts.Add($"{Owner.Id} медленно царапает стену, добавляя отметки. Всего отметок: {TallyCount}.");
                    break;
                case TallyState.Watching:
                    parts.Add($"{Owner.Id} стоит у стекла и неотрывно смотрит" +
                              (Owner.LookAtId == observerId ? " прямо на вас." : $" на {world.NameOf(Owner.LookAtId)}."));
                    break;
                case TallyState.Signaling:
                    parts.Add($"{Owner.Id} ритмично стучит по стеклу: {TapPattern(world)}");
                    break;
                case TallyState.Probing:
                    parts.Add($"{Owner.Id} прижал ладони к двери. Индикатор замка мигает, свет в камере дрожит.");
                    break;
                case TallyState.WaitingAtDoor:
                    parts.Add($"{Owner.Id} абсолютно неподвижно стоит у двери. Счёт прекратился.");
                    break;
                case TallyState.Breached:
                    parts.Add($"{Owner.Id} вне камеры содержания!");
                    break;
                case TallyState.Returning:
                    parts.Add($"{Owner.Id} бредёт обратно к камере.");
                    break;
            }

            string mood = Dissonance < 30 ? "спокоен" : Dissonance < 55 ? "насторожен" : Dissonance < 75 ? "возбуждён" : "крайне возбуждён";
            parts.Add($"Оценка состояния: {mood}.");

            double sinceSession = now - LastSessionEnd;
            parts.Add($"Последний сеанс счёта: {GameClock.FormatTime(LastSessionEnd)} ({GameClock.DurationText(sinceSession)} назад).");

            int bucket = StrongestLearnedBucket();
            if (bucket >= 0 && DoorHistogram[bucket] >= 2)
            {
                string time = GameClock.FormatTime(bucket * 15);
                parts.Add($"У двери на стене выцарапана отдельная группа: «{time}» и {DoorHistogram[bucket]} черт. Похоже, он считает, когда открывается дверь.");
            }

            var door = world.Facility.GetDoor(ContainmentDoorId);
            if (door != null && door.Integrity < 100f)
                parts.Add($"Целостность замка: {door.Integrity:0}%.");

            if (People.TryGetValue(observerId, out var model) && model.Visits > 0 && model.Irregularity > 0.5f)
                parts.Add("Когда вы появляетесь, он сбивается со счёта.");

            if (observerId == PlayerState.PlayerId)
            {
                LastObservedByPlayer = now;
                LastPlayerObservedThreat = ThreatLevel;
            }
            return string.Join(" ", parts);
        }

        // ------------------------------------------------------------------ persistence

        public override JObj Save()
        {
            var o = new JObj();
            o["dissonance"] = Dissonance;
            o["state"] = (int)State;
            o["lastSession"] = LastSessionEnd;
            o["sessionProgress"] = SessionProgress;
            o["sessionActive"] = SessionLastActive;
            o["tally"] = TallyCount;
            var hist = new List<object>();
            foreach (int v in DoorHistogram) hist.Add(v);
            o["doorHist"] = hist;
            o["doorCycles"] = LastDoorCycles;
            var people = new Dictionary<string, object>();
            foreach (var kv in People)
            {
                var p = new JObj();
                p["visits"] = kv.Value.Visits;
                var hours = new List<object>();
                foreach (float h in kv.Value.Hours) hours.Add(h);
                p["hours"] = hours;
                p["last"] = kv.Value.LastSeen;
                p["irr"] = kv.Value.Irregularity;
                people[kv.Key] = p.Raw;
            }
            o["people"] = people;
            o["target"] = TargetId;
            o["obsByPlayer"] = LastObservedByPlayer;
            o["obsThreat"] = LastPlayerObservedThreat;
            o["visitors"] = VisitorsToday;
            o["visitDay"] = _lastVisitDay;
            return o;
        }

        public override void Load(JObj o)
        {
            Dissonance = o.F("dissonance", 12f);
            State = (TallyState)o.Int("state");
            LastSessionEnd = o.Num("lastSession");
            SessionProgress = o.F("sessionProgress");
            SessionLastActive = o.Num("sessionActive", -1000);
            TallyCount = o.Int("tally", TallyCount);
            var hist = o.Arr("doorHist");
            if (hist != null)
                for (int i = 0; i < Math.Min(hist.Count, BucketsPerDay); i++)
                    DoorHistogram[i] = hist[i] is double dv ? (int)dv : 0;
            LastDoorCycles = o.Int("doorCycles");
            People.Clear();
            var people = o.Obj("people");
            if (people != null)
            {
                foreach (var kv in people.Raw)
                {
                    if (!(kv.Value is Dictionary<string, object> pd)) continue;
                    var pj = new JObj(pd);
                    var model = new PersonModel
                    {
                        Visits = pj.Int("visits"),
                        LastSeen = pj.Num("last", -1000),
                        Irregularity = pj.F("irr")
                    };
                    var hours = pj.Arr("hours");
                    if (hours != null)
                        for (int i = 0; i < Math.Min(24, hours.Count); i++)
                            model.Hours[i] = hours[i] is double hv ? (float)hv : 0f;
                    People[kv.Key] = model;
                }
            }
            TargetId = o.Str("target");
            LastObservedByPlayer = o.Num("obsByPlayer", -1);
            LastPlayerObservedThreat = o.F("obsThreat");
            VisitorsToday = o.Int("visitors");
            _lastVisitDay = o.Int("visitDay", -1);
            _goalNode = -1;
        }
    }
}
