using System;
using System.Collections.Generic;

namespace ScpLife.Core
{
    public enum MoveStatus
    {
        Idle,
        Moving,
        Arrived,
        Waiting,
        Blocked
    }

    public enum DoorWaitOutcome
    {
        Wait,
        Blocked
    }

    /// <summary>Decides what an agent does in front of a closed door (present card, force it, wait...).</summary>
    public delegate DoorWaitOutcome ClosedDoorHandler(Door door, string fromRoomId);

    /// <summary>
    /// Root of the engine-independent simulation. Everything that happens in the facility
    /// (doors, NPC routines, anomaly behaviour, cameras, alerts, tasks) is advanced here,
    /// independently of what the player sees. The Unity layer only renders this state and
    /// feeds player input in.
    /// </summary>
    public sealed class SimWorld
    {
        public const int SaveVersion = 1;
        public const float FixedStep = 0.1f;
        /// <summary>Rooms this many door-hops or more from the player are simulated at low frequency.</summary>
        public const int RemoteRoomDistance = 3;
        public const float RemoteStep = 1.0f;

        public readonly Facility Facility;
        public readonly GameClock Clock;
        public readonly SimRandom Rng;
        public readonly EventLog Events = new EventLog();
        public readonly AccessLog AccessLog = new AccessLog();
        public readonly Dictionary<string, Keycard> Keycards = new Dictionary<string, Keycard>();
        public readonly List<Npc> Npcs = new List<Npc>();
        public readonly Dictionary<string, Npc> NpcById = new Dictionary<string, Npc>();
        public readonly List<AnomalyInstance> Anomalies = new List<AnomalyInstance>();
        public readonly SurveillanceSystem Surveillance = new SurveillanceSystem();
        public readonly AlertSystem Alert = new AlertSystem();
        public readonly TaskBoard Tasks = new TaskBoard();
        public readonly ShiftDispatcher Dispatcher = new ShiftDispatcher();
        public readonly PlayerState Player = new PlayerState();
        public AnomalyCatalog Catalog = new AnomalyCatalog();

        /// <summary>Real seconds simulated since this world was created/loaded.</summary>
        public float RealTime;
        public double Now => Clock.TotalMinutes;
        public string PlayerRoomId => Player.RoomId;

        /// <summary>Events the player personally perceives (witnessed, PA, own tasks).</summary>
        public event Action<FacilityEvent> PlayerNotified;

        private readonly Dictionary<string, float> _remoteAccumulator = new Dictionary<string, float>();
        private readonly Dictionary<string, int> _roomDistanceCache = new Dictionary<string, int>();
        private string _distanceCacheRoom;

        public SimWorld(Facility facility, GameClock clock, ulong seed)
        {
            Facility = facility;
            Clock = clock;
            Rng = new SimRandom(seed);
            Events.Posted += OnEventPosted;
        }

        // ------------------------------------------------------------------ registry

        public void AddNpc(Npc npc)
        {
            Npcs.Add(npc);
            NpcById[npc.Id] = npc;
        }

        public void AddKeycard(Keycard card) => Keycards[card.Id] = card;

        public void AddAnomaly(AnomalyInstance anomaly)
        {
            Anomalies.Add(anomaly);
            anomaly.Behaviour.Owner = anomaly;
        }

        public Npc GetNpc(string id) => id != null && NpcById.TryGetValue(id, out var n) ? n : null;
        public Keycard GetCard(string id) => id != null && Keycards.TryGetValue(id, out var c) ? c : null;

        public AnomalyInstance GetAnomaly(string id)
        {
            foreach (var a in Anomalies)
                if (a.Id == id) return a;
            return null;
        }

        public string NameOf(string id)
        {
            if (id == null) return "—";
            if (id == PlayerState.PlayerId) return Player.Name;
            var npc = GetNpc(id);
            if (npc != null) return npc.DisplayName;
            var anomaly = GetAnomaly(id);
            if (anomaly != null) return anomaly.Id;
            return id;
        }

        public string RoomName(string roomId) => Facility.GetRoom(roomId)?.Name ?? "—";

        public IEnumerable<SubjectInfo> EnumerateSubjects()
        {
            if (!Player.Dead)
                yield return new SubjectInfo
                {
                    Id = PlayerState.PlayerId,
                    Name = Player.Name,
                    Position = Player.Position,
                    RoomId = Player.RoomId,
                    IsPlayer = true,
                    Role = Player.Role
                };
            foreach (var npc in Npcs)
                yield return new SubjectInfo
                {
                    Id = npc.Id,
                    Name = npc.DisplayName,
                    Position = npc.Agent.Position,
                    RoomId = npc.Agent.RoomId,
                    Role = npc.Role
                };
            foreach (var a in Anomalies)
                yield return new SubjectInfo
                {
                    Id = a.Id,
                    Name = a.DisplayName,
                    Position = a.Agent.Position,
                    RoomId = a.Agent.RoomId,
                    IsAnomaly = true
                };
        }

        /// <summary>People (player + conscious NPCs) visible from a room, including through observation windows.</summary>
        public IEnumerable<SubjectInfo> PeopleVisibleFrom(string roomId)
        {
            Room room = Facility.GetRoom(roomId);
            if (room == null) yield break;
            if (!Player.Dead && Player.RoomId != null && room.CanSeeInto(Player.RoomId))
                yield return new SubjectInfo { Id = PlayerState.PlayerId, Name = Player.Name, Position = Player.Position, RoomId = Player.RoomId, IsPlayer = true, Role = Player.Role };
            foreach (var npc in Npcs)
            {
                if (npc.Agent.RoomId == null || !room.CanSeeInto(npc.Agent.RoomId)) continue;
                yield return new SubjectInfo { Id = npc.Id, Name = npc.DisplayName, Position = npc.Agent.Position, RoomId = npc.Agent.RoomId, Role = npc.Role };
            }
        }

        public Vec3 PositionOf(string id)
        {
            if (id == PlayerState.PlayerId) return Player.Position;
            var npc = GetNpc(id);
            if (npc != null) return npc.Agent.Position;
            var a = GetAnomaly(id);
            return a?.Agent.Position ?? Vec3.Zero;
        }

        public string RoomOf(string id)
        {
            if (id == PlayerState.PlayerId) return Player.RoomId;
            var npc = GetNpc(id);
            if (npc != null) return npc.Agent.RoomId;
            return GetAnomaly(id)?.Agent.RoomId;
        }

        // ------------------------------------------------------------------ main loop

        /// <summary>Advances the simulation by one fixed step (real seconds).</summary>
        public void Tick(float dt)
        {
            RealTime += dt;
            double gameMinutes = Clock.Advance(dt);
            if (Player.RoomId != _distanceCacheRoom)
            {
                _roomDistanceCache.Clear();
                _distanceCacheRoom = Player.RoomId;
            }

            TickDoors(dt);
            foreach (var anomaly in Anomalies) anomaly.Behaviour.Tick(this, dt, gameMinutes);

            foreach (var npc in Npcs)
            {
                if (IsRemote(npc.Agent.RoomId))
                {
                    _remoteAccumulator.TryGetValue(npc.Id, out float acc);
                    acc += dt;
                    if (acc < RemoteStep)
                    {
                        _remoteAccumulator[npc.Id] = acc;
                        continue;
                    }
                    _remoteAccumulator[npc.Id] = 0f;
                    NpcBrain.Update(this, npc, acc, acc * Clock.MinutesPerRealSecond);
                }
                else
                {
                    if (_remoteAccumulator.TryGetValue(npc.Id, out float pending) && pending > 0f)
                    {
                        _remoteAccumulator[npc.Id] = 0f;
                        NpcBrain.Update(this, npc, dt + pending, (dt + pending) * Clock.MinutesPerRealSecond);
                    }
                    else NpcBrain.Update(this, npc, dt, gameMinutes);
                }
            }

            Surveillance.Tick(this, dt);
            Tasks.Tick(this);
            Dispatcher.Tick(this, dt);
            TickRooms();
            TickPlayer(dt, gameMinutes);
        }

        /// <summary>Simulation level of detail: far rooms are updated once per second.</summary>
        public bool IsRemote(string roomId)
        {
            if (roomId == null || Player.RoomId == null) return false;
            if (!_roomDistanceCache.TryGetValue(roomId, out int d))
            {
                d = Facility.RoomDistance(Player.RoomId, roomId, RemoteRoomDistance + 1);
                _roomDistanceCache[roomId] = d;
            }
            return d >= RemoteRoomDistance;
        }

        private void TickDoors(float dt)
        {
            double minuteOfDay = Clock.MinuteOfDay;
            foreach (var door in Facility.DoorList)
            {
                if (door.CurfewStart >= 0)
                {
                    bool curfew = door.InCurfew(minuteOfDay);
                    if (curfew && !door.Locked)
                    {
                        door.Locked = true;
                        door.CommandClose();
                    }
                    else if (!curfew && door.Locked)
                    {
                        door.Locked = false;
                    }
                }
                if (door.PendingFirstCardId != null && RealTime - door.PendingFirstTime > 20f)
                    door.PendingFirstCardId = null;
                door.Tick(dt, IsDoorOccupied(door));
            }
        }

        public bool IsDoorOccupied(Door door)
        {
            if (!door.HasLeaf) return false;
            if (!Player.Dead && InDoorway(door, Player.Position)) return true;
            foreach (var npc in Npcs)
                if (InDoorway(door, npc.Agent.Position)) return true;
            foreach (var a in Anomalies)
                if (InDoorway(door, a.Agent.Position)) return true;
            return false;
        }

        public static bool InDoorway(Door door, Vec3 p)
        {
            float along = door.CrossesAlongX ? Math.Abs(p.X - door.Position.X) : Math.Abs(p.Z - door.Position.Z);
            float across = door.CrossesAlongX ? Math.Abs(p.Z - door.Position.Z) : Math.Abs(p.X - door.Position.X);
            return along < 0.75f && across < door.Width * 0.5f + 0.25f && Math.Abs(p.Y - door.Position.Y) < 2.5f;
        }

        private void TickRooms()
        {
            foreach (var room in Facility.RoomList)
                if (room.FlickerUntil > 0 && room.FlickerUntil < Now) room.FlickerUntil = 0;
        }

        private void TickPlayer(float dt, double gameMinutes)
        {
            if (Player.Dead) return;
            Room room = Facility.RoomAt(Player.Position);
            if (room != null) Player.RoomId = room.Id;
            if (Player.Health < 100f && Player.Health > 0f) Player.Health = Math.Min(100f, Player.Health + (float)gameMinutes * 0.05f);

            if (Player.Counting)
            {
                var target = GetAnomaly(Player.CountingTargetId);
                if (target == null || !CanPerformCounting(PlayerState.PlayerId, Player.Position, Player.RoomId, target))
                {
                    StopPlayerCounting("цель вне зоны видимости");
                }
                else
                {
                    Player.CountingSeconds += dt;
                }
            }
        }

        // ------------------------------------------------------------------ doors & access

        /// <summary>
        /// A card is presented to a door reader. Handles dual authorisation, curfew, lockdown,
        /// reader faults and writes the access journal.
        /// </summary>
        public AccessResult PresentCard(string doorId, string cardId, string presenterId, string fromRoomId)
        {
            Door door = Facility.GetDoor(doorId);
            if (door == null) return AccessResult.ReaderFault;
            if (door.Kind == DoorKind.Archway) return AccessResult.Granted;

            Keycard card = GetCard(cardId);
            AccessResult result;
            if (card == null) result = AccessResult.DeniedLevel;
            else if (door.ReaderFaultUntil > Now) result = AccessResult.ReaderFault;
            else if (door.Lockdown && card.Level < AccessLevel.L4) result = AccessResult.DeniedLockdown;
            else if (door.Locked && door.InCurfew(Clock.MinuteOfDay) && (card.Permissions & Permission.CellResident) != 0 && card.Level < AccessLevel.L2)
                result = AccessResult.DeniedCurfew;
            else if (door.Locked && !door.InCurfew(Clock.MinuteOfDay) && card.Level < AccessLevel.L4)
                result = AccessResult.DeniedLocked;
            else
            {
                var req = door.RequirementFrom(fromRoomId);
                result = AccessControl.CheckCard(card, req, Now);
                if (AccessControl.IsSuccess(result) && req.DualAuthorization && card.Level < AccessLevel.L5)
                {
                    bool pendingValid = door.PendingFirstCardId != null && RealTime - door.PendingFirstTime <= 20f;
                    if (!pendingValid)
                    {
                        door.PendingFirstCardId = card.Id;
                        door.PendingFirstOwnerId = card.OwnerId;
                        door.PendingFirstTime = RealTime;
                        result = AccessResult.AwaitingSecondCard;
                    }
                    else if (door.PendingFirstOwnerId == card.OwnerId)
                    {
                        result = door.PendingFirstCardId == card.Id ? AccessResult.AwaitingSecondCard : AccessResult.DeniedSameCard;
                    }
                    else
                    {
                        door.PendingFirstCardId = null;
                    }
                }
            }

            if (AccessControl.IsSuccess(result)) door.CommandOpen(door.AutoCloseSeconds);

            bool repeatAwait = result == AccessResult.AwaitingSecondCard && door.LastResult == AccessResult.AwaitingSecondCard &&
                               RealTime - door.LastResultTime < 20f;
            door.LastResult = result;
            door.LastResultTime = RealTime;
            if (!repeatAwait)
            {
                AccessLog.Add(new AccessLogEntry
                {
                    Time = Now,
                    DoorId = door.Id,
                    CardId = card?.Id ?? "—",
                    CardOwnerName = card?.OwnerName ?? "нет карты",
                    PresenterId = presenterId,
                    Result = result
                });
            }

            if (!AccessControl.IsSuccess(result) && result != AccessResult.AwaitingSecondCard && !repeatAwait)
            {
                Events.Post(new FacilityEvent
                {
                    Time = Now,
                    Type = result == AccessResult.ReaderFault ? EventType.ReaderMalfunction : EventType.DoorDenied,
                    RoomId = fromRoomId,
                    Position = door.Position,
                    ActorId = presenterId,
                    TargetId = door.Id,
                    Severity = 0,
                    Text = $"{door.Name}: {AccessText.ResultText(result)} ({NameOf(presenterId)})"
                });
            }
            else if (door.Kind == DoorKind.Heavy && AccessControl.IsSuccess(result))
            {
                Events.Post(new FacilityEvent
                {
                    Time = Now,
                    Type = EventType.DoorAccess,
                    RoomId = fromRoomId,
                    Position = door.Position,
                    ActorId = presenterId,
                    TargetId = door.Id,
                    Severity = 1,
                    Text = $"{door.Name} открыта ({NameOf(presenterId)})"
                });
            }
            return result;
        }

        /// <summary>Whether an agent holding `card` may plan a route through a door.</summary>
        public bool CanPlanThrough(Door door, string fromRoom, Keycard card)
        {
            if (door.Kind == DoorKind.Archway) return true;
            if (door.Lockdown && (card == null || card.Level < AccessLevel.L4)) return door.IsPassable;
            if (card == null) return door.IsPassable;
            if (door.Locked)
            {
                bool curfew = door.InCurfew(Clock.MinuteOfDay);
                if (curfew && (card.Permissions & Permission.CellResident) != 0 && card.Level < AccessLevel.L2) return false;
                if (!curfew && card.Level < AccessLevel.L4) return false;
            }
            var req = door.RequirementFrom(fromRoom);
            return AccessControl.IsSuccess(AccessControl.CheckCard(card, req, Now));
        }

        // ------------------------------------------------------------------ movement

        public List<int> PlanPath(Vec3 from, string fromRoom, int goalNode, Func<Door, string, bool> canUseDoor)
        {
            int start = Facility.NearestNode(from, fromRoom ?? Facility.RoomAt(from)?.Id);
            if (start < 0) start = Facility.NearestNode(from, null);
            return PathFinder.FindPath(Facility, start, goalNode, canUseDoor);
        }

        /// <summary>
        /// Moves an agent along its path. Works with any dt so remote agents can be advanced
        /// in large steps without rendering.
        /// </summary>
        public MoveStatus MoveAgent(NavAgent a, float dt, ClosedDoorHandler onClosedDoor, bool yieldToPlayer)
        {
            if (!a.HasPath)
            {
                a.IsMoving = false;
                return MoveStatus.Idle;
            }
            var nodes = Facility.Graph.Nodes;
            a.DoorRequestCooldown -= dt;
            int guard = 0;
            while (dt > 1e-5f && a.HasPath && guard++ < 32)
            {
                int targetIndex = a.Path[a.PathIndex];
                NavNode target = nodes[targetIndex];

                if (a.PathIndex > 0)
                {
                    int prevIndex = a.Path[a.PathIndex - 1];
                    NavEdge edge = Facility.Graph.FindEdge(prevIndex, targetIndex);
                    if (edge != null && edge.DoorId != null)
                    {
                        Door door = Facility.Doors[edge.DoorId];
                        if (!door.IsPassable && Vec3.DistanceXZ(a.Position, nodes[prevIndex].Position) < 0.7f)
                        {
                            a.IsMoving = false;
                            a.WaitingDoorId = door.Id;
                            a.WaitTime += dt;
                            FaceTowards(a, door.Position, dt);
                            var outcome = onClosedDoor != null ? onClosedDoor(door, nodes[prevIndex].RoomId) : DoorWaitOutcome.Blocked;
                            return outcome == DoorWaitOutcome.Blocked ? MoveStatus.Blocked : MoveStatus.Waiting;
                        }
                    }
                }
                a.WaitingDoorId = null;
                a.WaitTime = 0f;

                if (yieldToPlayer && IsPlayerBlocking(a, target.Position))
                {
                    a.BlockedTime += dt;
                    if (a.BlockedTime < 3.5f)
                    {
                        a.IsMoving = false;
                        return MoveStatus.Waiting;
                    }
                }
                else a.BlockedTime = 0f;

                Vec3 diff = target.Position - a.Position;
                diff.Y = 0f;
                float dist = diff.LengthXZ;
                float step = a.Speed * dt;
                if (dist <= step)
                {
                    a.Position = new Vec3(target.Position.X, target.Position.Y, target.Position.Z);
                    dt -= a.Speed > 0 ? dist / a.Speed : dt;
                    a.LastNode = targetIndex;
                    a.RoomId = target.RoomId;
                    a.PathIndex++;
                }
                else
                {
                    a.Position = a.Position + diff / dist * step;
                    float desiredYaw = Vec3.YawFromDirection(diff);
                    a.Yaw = SimMath.MoveTowardsAngle(a.Yaw, desiredYaw, 540f * dt);
                    dt = 0f;
                }
                a.IsMoving = true;
            }

            Room r = Facility.RoomAt(a.Position);
            if (r != null && r.Contains(a.Position)) a.RoomId = r.Id;

            if (!a.HasPath)
            {
                a.IsMoving = false;
                if (a.ArriveYaw.HasValue) a.Yaw = a.ArriveYaw.Value;
                return MoveStatus.Arrived;
            }
            return MoveStatus.Moving;
        }

        private bool IsPlayerBlocking(NavAgent a, Vec3 target)
        {
            if (Player.Dead) return false;
            Vec3 toPlayer = Player.Position - a.Position;
            toPlayer.Y = 0f;
            float d = toPlayer.LengthXZ;
            if (d > 1.1f || d < 0.05f) return false;
            Vec3 dir = (target - a.Position).FlatXZ.Normalized;
            return Vec3.Dot(dir, toPlayer / d) > 0.55f;
        }

        public static void FaceTowards(NavAgent a, Vec3 point, float dt)
        {
            Vec3 d = point - a.Position;
            if (d.LengthXZ < 0.05f) return;
            a.Yaw = SimMath.MoveTowardsAngle(a.Yaw, Vec3.YawFromDirection(d), 360f * dt);
        }

        // ------------------------------------------------------------------ perception & events

        private void OnEventPosted(FacilityEvent e)
        {
            // Witnesses: everyone who can see into the room where it happened.
            Room room = Facility.GetRoom(e.RoomId);
            float importance = 0.15f + e.Severity * 0.28f;
            Npc reporter = null;
            foreach (var npc in Npcs)
            {
                bool witnessed = room != null && npc.Agent.RoomId != null && !npc.IsIncapacitated(Now) &&
                                 Facility.GetRoom(npc.Agent.RoomId)?.CanSeeInto(room.Id) == true;
                if (!witnessed && !e.Public) continue;
                if (e.Type == EventType.Conversation || e.Type == EventType.TaskIssued || e.Type == EventType.TaskCompleted) continue;
                if (e.Type == EventType.DoorDenied && e.ActorId == npc.Id) continue;
                npc.Memory.Remember(new MemoryEntry
                {
                    EventId = e.Id,
                    Time = e.Time,
                    Type = e.Type,
                    RoomId = e.RoomId,
                    SubjectId = e.ActorId,
                    Text = e.Text,
                    Importance = SimMath.Clamp01(importance),
                    Confidence = witnessed ? 1f : 0.9f,
                    Source = witnessed ? MemorySource.Witnessed : MemorySource.Announcement
                }, Now);
                if (witnessed && e.Severity >= 2) npc.Needs.Stress += 6f * e.Severity * (1.2f - npc.Traits.Bravery);
                if (witnessed && reporter == null && npc.Role != NpcRole.DClass && e.Severity >= 1 &&
                    (e.Type == EventType.AnomalyBehaviour || e.Type == EventType.ContainmentWarning) && GetAnomaly(e.ActorId) != null)
                    reporter = npc;
            }
            if (reporter != null) ReportAnomalyBehaviour(reporter.Id, reporter.DisplayName, e);

            bool playerSees = !Player.Dead && Player.RoomId != null && room != null &&
                              Facility.GetRoom(Player.RoomId)?.CanSeeInto(room.Id) == true;
            bool forPlayer = e.Public || e.ActorId == PlayerState.PlayerId ||
                             ((e.Type == EventType.TaskIssued || e.Type == EventType.TaskCompleted || e.Type == EventType.TaskFailed) &&
                              e.ActorId == PlayerState.PlayerId) ||
                             (playerSees && e.Type != EventType.TaskIssued && e.Type != EventType.TaskCompleted && e.Type != EventType.TaskFailed &&
                              e.Type != EventType.DoorDenied);
            if (forPlayer) PlayerNotified?.Invoke(e);
        }

        /// <summary>A person who saw restless anomaly behaviour reports it over the radio (Yellow alert).</summary>
        public void ReportAnomalyBehaviour(string reporterId, string reporterName, FacilityEvent e)
        {
            var anomaly = GetAnomaly(e.ActorId);
            if (anomaly == null || !anomaly.Contained) return;
            if (Alert.Level >= AlertLevel.Yellow && Alert.RoomId == anomaly.ContainmentRoomId) return;
            Alert.Raise(this, AlertLevel.Yellow, $"Доклад: {reporterName} — беспокойство {anomaly.Id}", anomaly.ContainmentRoomId);
            GetNpc(reporterId)?.Say($"Пост, это {reporterName}: {anomaly.Id} беспокоится, прошу внимания.", Now);
        }

        /// <summary>Can `observer` count at an anomaly: line of sight (same or window-linked room) within 10 m.</summary>
        public bool CanPerformCounting(string observerId, Vec3 pos, string roomId, AnomalyInstance anomaly)
        {
            Room room = Facility.GetRoom(roomId);
            if (room == null || anomaly.Agent.RoomId == null) return false;
            if (!room.CanSeeInto(anomaly.Agent.RoomId)) return false;
            return Vec3.DistanceXZ(pos, anomaly.Agent.Position) <= 10.5f;
        }

        public bool StartPlayerCounting(string anomalyId)
        {
            var anomaly = GetAnomaly(anomalyId);
            if (anomaly == null || Player.Dead) return false;
            if (!CanPerformCounting(PlayerState.PlayerId, Player.Position, Player.RoomId, anomaly)) return false;
            Player.Counting = true;
            Player.CountingTargetId = anomalyId;
            Player.CountingSeconds = 0f;
            Events.Post(new FacilityEvent
            {
                Time = Now,
                Type = EventType.CountingProtocol,
                RoomId = Player.RoomId,
                Position = Player.Position,
                ActorId = PlayerState.PlayerId,
                TargetId = anomalyId,
                Severity = 1,
                Text = $"{Player.Name} начинает протокол счёта для {anomaly.Id}"
            });
            return true;
        }

        public void StopPlayerCounting(string reason)
        {
            if (!Player.Counting) return;
            Player.Counting = false;
            PlayerNotified?.Invoke(new FacilityEvent
            {
                Time = Now,
                Type = EventType.CountingProtocol,
                RoomId = Player.RoomId,
                ActorId = PlayerState.PlayerId,
                Text = $"Протокол счёта прерван: {reason}"
            });
        }

        public void DamagePlayer(float amount, string sourceId, string description)
        {
            if (Player.Dead) return;
            Player.Health -= amount;
            Player.StunnedUntil = RealTime + 2.5f;
            StopPlayerCounting("получен удар");
            Events.Post(new FacilityEvent
            {
                Time = Now,
                Type = EventType.Injury,
                RoomId = Player.RoomId,
                Position = Player.Position,
                ActorId = sourceId,
                TargetId = PlayerState.PlayerId,
                Severity = 2,
                Text = description
            });
            if (Player.Health <= 0f)
            {
                Player.Health = 0f;
                Player.Dead = true;
            }
        }

        public void InjureNpc(Npc npc, float amount, string sourceId, string description, double incapacitatedMinutes)
        {
            npc.Needs.Health -= amount;
            npc.Needs.Stress += 35f;
            npc.Needs.Clamp();
            npc.IncapacitatedUntil = Now + incapacitatedMinutes;
            npc.NextThink = 0f;
            Events.Post(new FacilityEvent
            {
                Time = Now,
                Type = EventType.Injury,
                RoomId = npc.Agent.RoomId,
                Position = npc.Agent.Position,
                ActorId = sourceId,
                TargetId = npc.Id,
                Severity = 2,
                Text = description
            });
        }

        // ------------------------------------------------------------------ player actions

        public void UpdatePlayerTransform(Vec3 position, float yaw, float pitch)
        {
            Player.Position = position;
            Player.Yaw = yaw;
            Player.Pitch = pitch;
        }

        public string ReachPatrolCheckpoint(string poiId)
        {
            var poi = Facility.GetPoi(poiId);
            if (poi == null) return null;
            var task = Tasks.FirstActive(PlayerState.PlayerId, TaskKind.Patrol);
            Events.Post(new FacilityEvent
            {
                Time = Now,
                Type = EventType.PatrolCheckpoint,
                RoomId = poi.RoomId,
                Position = poi.Position,
                ActorId = PlayerState.PlayerId,
                TargetId = poiId,
                Text = $"{Player.Name} отметился на точке «{poi.Label}»"
            });
            if (task == null) return $"Точка «{poi.Label}» отмечена (активного обхода нет)";
            if (!task.Checkpoints.Contains(poiId)) return $"Точка «{poi.Label}» не входит в текущий маршрут";
            task.Done.Add(poiId);
            if (task.Done.Count >= task.Checkpoints.Count)
            {
                Tasks.Complete(this, task, "маршрут пройден");
                return $"Обход завершён: {task.Done.Count}/{task.Checkpoints.Count}";
            }
            return $"Точка «{poi.Label}» отмечена: {task.ProgressText}";
        }

        public void PlayerViewedCamera(string cameraId)
        {
            Player.CamerasViewedThisShift.Add(cameraId);
            var task = Tasks.FirstActive(PlayerState.PlayerId, TaskKind.CameraCheck);
            if (task == null) return;
            task.Done.Add(cameraId);
            if (task.Done.Count >= task.RequiredCount) Tasks.Complete(this, task, "камеры проверены");
        }

        /// <summary>Player studies an anomaly through a window or camera. Completes investigations.</summary>
        public string PlayerObserveAnomaly(string anomalyId, bool viaCamera)
        {
            var anomaly = GetAnomaly(anomalyId);
            if (anomaly == null) return "Нет данных";
            string report = anomaly.Behaviour.Observe(this, PlayerState.PlayerId);
            Player.AddJournal($"[{GameClock.FormatStamp(Now)}] {report}");
            Events.Post(new FacilityEvent
            {
                Time = Now,
                Type = EventType.Observation,
                RoomId = Player.RoomId,
                Position = Player.Position,
                ActorId = PlayerState.PlayerId,
                TargetId = anomalyId,
                Text = $"{Player.Name} наблюдает за {anomaly.Id}" + (viaCamera ? " (камера)" : "")
            });
            foreach (var task in new List<DutyTask>(Tasks.ActiveFor(PlayerState.PlayerId)))
                if (task.Kind == TaskKind.Investigate && task.TargetId == anomalyId)
                    Tasks.Complete(this, task, "доклад передан");
            return report;
        }

        public string PlayerReportIncident()
        {
            string summary = Dispatcher.HandlePlayerReport(this);
            Events.Post(new FacilityEvent
            {
                Time = Now,
                Type = EventType.Report,
                RoomId = Player.RoomId,
                ActorId = PlayerState.PlayerId,
                Severity = 1,
                Text = $"Рапорт {Player.Name}: {summary}"
            });
            return summary;
        }

        public bool PickUpCard(string cardId)
        {
            var card = GetCard(cardId);
            if (card == null || !card.InWorld) return false;
            card.HolderId = PlayerState.PlayerId;
            card.WorldRoomId = null;
            if (!Player.CardIds.Contains(card.Id)) Player.CardIds.Add(card.Id);
            Events.Post(new FacilityEvent
            {
                Time = Now,
                Type = EventType.SuspiciousActivity,
                RoomId = Player.RoomId,
                Position = Player.Position,
                ActorId = PlayerState.PlayerId,
                TargetId = cardId,
                Severity = card.OwnerId == PlayerState.PlayerId ? 0 : 1,
                Text = $"{Player.Name} подбирает ключ-карту {card.Label}"
            });
            return true;
        }

        public bool DropCard(string cardId)
        {
            var card = GetCard(cardId);
            if (card == null || card.HolderId != PlayerState.PlayerId) return false;
            card.HolderId = null;
            card.WorldRoomId = Player.RoomId;
            card.WorldPosition = Player.Position + Vec3.DirectionFromYaw(Player.Yaw) * 0.6f;
            card.WorldPosition.Y = Facility.GetRoom(Player.RoomId)?.FloorY ?? 0f;
            Player.CardIds.Remove(card.Id);
            return true;
        }

        /// <summary>Conversation with an NPC: what they are doing, what they know, how they see the player.</summary>
        public List<string> TalkTo(string npcId)
        {
            var npc = GetNpc(npcId);
            if (npc == null) return new List<string> { "..." };
            return NpcDialogue.Talk(this, npc);
        }
    }
}
