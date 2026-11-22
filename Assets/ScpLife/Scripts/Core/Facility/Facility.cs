using System;
using System.Collections.Generic;

namespace ScpLife.Core
{
    public enum RoomType
    {
        Corridor,
        SecurityPost,
        Dormitory,
        Canteen,
        Laboratory,
        Observation,
        Airlock,
        Containment,
        MedicalBay,
        DClassCommon,
        DClassCell,
        Engineering
    }

    public enum PoiType
    {
        Stand,
        Bed,
        Seat,
        Desk,
        Console,
        GuardPost,
        PatrolPoint,
        FoodCounter,
        Workbench,
        Locker,
        Panel,
        MedBed,
        Window,
        CellBunk,
        CleaningSpot,
        Terminal
    }

    /// <summary>A spot where an agent can perform an activity (bed, desk, seat...).</summary>
    public sealed class PointOfInterest
    {
        public string Id;
        public PoiType Type;
        public string RoomId;
        public Vec3 Position;
        public float FacingYaw;
        /// <summary>Optional owner (e.g. personal bed). Null = shared.</summary>
        public string OwnerId;
        /// <summary>Agent currently using or walking to the spot.</summary>
        public string ReservedBy;
        public int NodeIndex = -1;
        public string Label;
    }

    public sealed class Room
    {
        public string Id;
        public string Name;
        public RoomType Type;
        public string Sector = "Б-3";
        public float MinX, MaxX, MinZ, MaxZ;
        public float FloorY;
        public float Height = 3.2f;
        public readonly List<PointOfInterest> Pois = new List<PointOfInterest>();
        public readonly List<Vec3> HubPoints = new List<Vec3>();
        public readonly List<int> HubNodes = new List<int>();
        /// <summary>Explicit hub links (index pairs). Empty = every hub sees every other (open room).</summary>
        public readonly List<int[]> HubEdges = new List<int[]>();
        /// <summary>Rooms that can be seen from this room (observation windows).</summary>
        public readonly List<string> VisibleRooms = new List<string>();
        public readonly List<string> DoorIds = new List<string>();

        // Dynamic state
        public bool LightsOn = true;
        public double FlickerUntil;

        public float Width => MaxX - MinX;
        public float Depth => MaxZ - MinZ;
        public Vec3 Center => new Vec3((MinX + MaxX) * 0.5f, FloorY, (MinZ + MaxZ) * 0.5f);

        public bool Contains(Vec3 p, float margin = 0f)
        {
            return p.X >= MinX - margin && p.X <= MaxX + margin &&
                   p.Z >= MinZ - margin && p.Z <= MaxZ + margin &&
                   p.Y >= FloorY - 1.5f && p.Y <= FloorY + Height + 1.5f;
        }

        public bool IsFlickering(double now) => FlickerUntil > now;

        public bool CanSeeInto(string otherRoomId) => otherRoomId == Id || VisibleRooms.Contains(otherRoomId);
    }

    public enum DoorKind
    {
        Standard,
        Security,
        Heavy,
        Cell,
        Archway
    }

    public enum DoorState
    {
        Closed,
        Opening,
        Open,
        Closing
    }

    /// <summary>Doors run in the simulation whether or not anyone renders them.</summary>
    public sealed class Door
    {
        // --- configuration ---
        public string Id;
        public string Name;
        public string RoomA;
        public string RoomB;
        public Vec3 Position;
        /// <summary>True if the door plane is perpendicular to X (agents cross along X).</summary>
        public bool CrossesAlongX;
        public float Width = 1.6f;
        public float Height = 2.4f;
        public DoorKind Kind = DoorKind.Standard;
        public AccessRequirement Requirement;
        /// <summary>Optional relaxed requirement when leaving from ExitFromRoom (e.g. leaving a chamber).</summary>
        public bool HasExitRequirement;
        public string ExitFromRoom;
        public AccessRequirement ExitRequirement;
        public float OpenSeconds = 1.1f;
        public float AutoCloseSeconds = 4f;
        public int NodeA = -1;
        public int NodeB = -1;
        /// <summary>Curfew window (minute of day) when the door is auto-locked. -1 = none.</summary>
        public int CurfewStart = -1;
        public int CurfewEnd = -1;

        // --- dynamic state ---
        public DoorState State = DoorState.Closed;
        public float Openness;
        public float HoldTimer;
        public bool Locked;
        public bool Lockdown;
        public float Integrity = 100f;
        public double ReaderFaultUntil;
        public string PendingFirstCardId;
        public string PendingFirstOwnerId;
        public double PendingFirstTime;
        public AccessResult LastResult = AccessResult.Granted;
        public double LastResultTime = -1000;
        /// <summary>Incremented whenever the door starts opening, lets views/anomalies count cycles.</summary>
        public int OpenCycles;

        public bool IsPassable => Kind == DoorKind.Archway || Openness >= 0.92f;
        public bool IsClosed => Kind != DoorKind.Archway && Openness <= 0.01f && State == DoorState.Closed;
        public bool HasLeaf => Kind != DoorKind.Archway;

        public string OtherSide(string roomId) => roomId == RoomA ? RoomB : RoomA;
        public int NodeOnSide(string roomId) => roomId == RoomA ? NodeA : NodeB;

        public AccessRequirement RequirementFrom(string fromRoomId)
        {
            if (HasExitRequirement && fromRoomId == ExitFromRoom) return ExitRequirement;
            return Requirement;
        }

        public bool InCurfew(double minuteOfDay)
        {
            if (CurfewStart < 0) return false;
            return GameClock.InRange(minuteOfDay, CurfewStart, CurfewEnd);
        }

        public void CommandOpen(float holdSeconds)
        {
            if (Kind == DoorKind.Archway) return;
            if (State == DoorState.Closed || State == DoorState.Closing)
            {
                State = DoorState.Opening;
                OpenCycles++;
            }
            HoldTimer = Math.Max(HoldTimer, holdSeconds);
        }

        public void CommandClose()
        {
            if (Kind == DoorKind.Archway) return;
            if (State == DoorState.Open || State == DoorState.Opening)
            {
                State = DoorState.Closing;
                HoldTimer = 0f;
            }
        }

        /// <summary>Advances the door mechanism. `occupied` keeps it from closing on someone.</summary>
        public void Tick(float dt, bool occupied)
        {
            if (Kind == DoorKind.Archway)
            {
                Openness = 1f;
                State = DoorState.Open;
                return;
            }
            float speed = 1f / Math.Max(0.1f, OpenSeconds);
            switch (State)
            {
                case DoorState.Opening:
                    Openness += speed * dt;
                    if (Openness >= 1f)
                    {
                        Openness = 1f;
                        State = DoorState.Open;
                    }
                    break;
                case DoorState.Open:
                    if (occupied) HoldTimer = Math.Max(HoldTimer, 1.0f);
                    HoldTimer -= dt;
                    if (HoldTimer <= 0f && !occupied && Integrity > 0f) State = DoorState.Closing;
                    break;
                case DoorState.Closing:
                    if (occupied)
                    {
                        // Safety sensor: re-open instead of crushing someone.
                        State = DoorState.Opening;
                        HoldTimer = 1.5f;
                        break;
                    }
                    Openness -= speed * dt;
                    if (Openness <= 0f)
                    {
                        Openness = 0f;
                        State = DoorState.Closed;
                    }
                    break;
            }
        }

        public JObj Save()
        {
            var o = new JObj();
            o["id"] = Id;
            o["state"] = (int)State;
            o["open"] = Openness;
            o["hold"] = HoldTimer;
            o["locked"] = Locked;
            o["lockdown"] = Lockdown;
            o["integrity"] = Integrity;
            o["fault"] = ReaderFaultUntil;
            o["cycles"] = OpenCycles;
            o["lastResult"] = (int)LastResult;
            o["lastResultTime"] = LastResultTime;
            return o;
        }

        public void Load(JObj o)
        {
            State = (DoorState)o.Int("state");
            Openness = o.F("open");
            HoldTimer = o.F("hold");
            Locked = o.Bool("locked");
            Lockdown = o.Bool("lockdown");
            Integrity = o.F("integrity", 100f);
            ReaderFaultUntil = o.Num("fault");
            OpenCycles = o.Int("cycles");
            LastResult = (AccessResult)o.Int("lastResult");
            LastResultTime = o.Num("lastResultTime", -1000);
        }
    }

    public sealed class NavNode
    {
        public int Index;
        public string Id;
        public Vec3 Position;
        public string RoomId;
        public string DoorId;
    }

    public sealed class NavEdge
    {
        public int To;
        public float Cost;
        public string DoorId;
    }

    /// <summary>Waypoint graph: hub points inside rooms, POIs, and door-side nodes.</summary>
    public sealed class NavGraph
    {
        public readonly List<NavNode> Nodes = new List<NavNode>();
        public readonly List<List<NavEdge>> Edges = new List<List<NavEdge>>();

        public int AddNode(string id, Vec3 pos, string roomId, string doorId = null)
        {
            var node = new NavNode { Index = Nodes.Count, Id = id, Position = pos, RoomId = roomId, DoorId = doorId };
            Nodes.Add(node);
            Edges.Add(new List<NavEdge>());
            return node.Index;
        }

        public void Connect(int a, int b, string doorId = null)
        {
            if (a == b) return;
            foreach (var e in Edges[a])
                if (e.To == b) return;
            float cost = Vec3.Distance(Nodes[a].Position, Nodes[b].Position);
            Edges[a].Add(new NavEdge { To = b, Cost = cost, DoorId = doorId });
            Edges[b].Add(new NavEdge { To = a, Cost = cost, DoorId = doorId });
        }

        public NavEdge FindEdge(int from, int to)
        {
            foreach (var e in Edges[from])
                if (e.To == to) return e;
            return null;
        }
    }

    public sealed class Facility
    {
        public readonly Dictionary<string, Room> Rooms = new Dictionary<string, Room>();
        public readonly List<Room> RoomList = new List<Room>();
        public readonly Dictionary<string, Door> Doors = new Dictionary<string, Door>();
        public readonly List<Door> DoorList = new List<Door>();
        public readonly NavGraph Graph = new NavGraph();
        public readonly Dictionary<string, PointOfInterest> Pois = new Dictionary<string, PointOfInterest>();
        public string Name = "Зона-19 · Уровень 3 · Сектор содержания Б";

        public Room AddRoom(Room room)
        {
            Rooms.Add(room.Id, room);
            RoomList.Add(room);
            return room;
        }

        public Door AddDoor(Door door)
        {
            Doors.Add(door.Id, door);
            DoorList.Add(door);
            Rooms[door.RoomA].DoorIds.Add(door.Id);
            Rooms[door.RoomB].DoorIds.Add(door.Id);
            return door;
        }

        public Room GetRoom(string id) => id != null && Rooms.TryGetValue(id, out Room r) ? r : null;
        public Door GetDoor(string id) => id != null && Doors.TryGetValue(id, out Door d) ? d : null;
        public PointOfInterest GetPoi(string id) => id != null && Pois.TryGetValue(id, out var p) ? p : null;

        /// <summary>Finds the room containing a point. Door gaps belong to the nearest room.</summary>
        public Room RoomAt(Vec3 p)
        {
            foreach (var r in RoomList)
                if (r.Contains(p)) return r;
            Room best = null;
            float bestDist = 1.0f;
            foreach (var r in RoomList)
            {
                float dx = Math.Max(Math.Max(r.MinX - p.X, 0f), p.X - r.MaxX);
                float dz = Math.Max(Math.Max(r.MinZ - p.Z, 0f), p.Z - r.MaxZ);
                float d = (float)Math.Sqrt(dx * dx + dz * dz);
                if (d < bestDist)
                {
                    bestDist = d;
                    best = r;
                }
            }
            return best;
        }

        /// <summary>Nearest navigation node inside a room (or anywhere if roomId is null).</summary>
        public int NearestNode(Vec3 p, string roomId)
        {
            int best = -1;
            float bestD = float.MaxValue;
            foreach (var n in Graph.Nodes)
            {
                if (roomId != null && n.RoomId != roomId) continue;
                float d = (n.Position - p).LengthSq;
                if (d < bestD)
                {
                    bestD = d;
                    best = n.Index;
                }
            }
            return best;
        }

        /// <summary>Number of door hops between two rooms (BFS over doors, ignoring access).</summary>
        public int RoomDistance(string fromRoom, string toRoom, int maxDepth = 16)
        {
            if (fromRoom == null || toRoom == null) return int.MaxValue;
            if (fromRoom == toRoom) return 0;
            var visited = new HashSet<string> { fromRoom };
            var frontier = new List<string> { fromRoom };
            for (int depth = 1; depth <= maxDepth; depth++)
            {
                var next = new List<string>();
                foreach (string rid in frontier)
                {
                    foreach (string did in Rooms[rid].DoorIds)
                    {
                        string other = Doors[did].OtherSide(rid);
                        if (other == toRoom) return depth;
                        if (visited.Add(other)) next.Add(other);
                    }
                }
                if (next.Count == 0) break;
                frontier = next;
            }
            return int.MaxValue;
        }

        public IEnumerable<Room> RoomsOfType(RoomType type)
        {
            foreach (var r in RoomList)
                if (r.Type == type) yield return r;
        }

        public Door DoorBetween(string a, string b)
        {
            foreach (var d in DoorList)
                if ((d.RoomA == a && d.RoomB == b) || (d.RoomA == b && d.RoomB == a)) return d;
            return null;
        }

        /// <summary>
        /// Builds the navigation graph from rooms, hub points, POIs and doors.
        /// Rooms are convex boxes, so straight segments between hub points are walkable.
        /// </summary>
        public void BuildNavigation()
        {
            foreach (var room in RoomList)
            {
                room.HubNodes.Clear();
                if (room.HubPoints.Count == 0) room.HubPoints.Add(room.Center);
                for (int i = 0; i < room.HubPoints.Count; i++)
                    room.HubNodes.Add(Graph.AddNode($"{room.Id}.hub{i}", room.HubPoints[i], room.Id));
                if (room.HubEdges.Count > 0)
                {
                    foreach (var e in room.HubEdges) Graph.Connect(room.HubNodes[e[0]], room.HubNodes[e[1]]);
                }
                else
                {
                    for (int i = 0; i < room.HubNodes.Count; i++)
                        for (int j = i + 1; j < room.HubNodes.Count; j++)
                            Graph.Connect(room.HubNodes[i], room.HubNodes[j]);
                }

                foreach (var poi in room.Pois)
                {
                    poi.RoomId = room.Id;
                    poi.NodeIndex = Graph.AddNode(poi.Id, poi.Position, room.Id);
                    Graph.Connect(poi.NodeIndex, NearestHub(room, poi.Position));
                    Pois[poi.Id] = poi;
                }
            }

            foreach (var door in DoorList)
            {
                Room a = Rooms[door.RoomA];
                Room b = Rooms[door.RoomB];
                door.NodeA = Graph.AddNode($"{door.Id}.A", DoorApproach(door, a), a.Id, door.Id);
                door.NodeB = Graph.AddNode($"{door.Id}.B", DoorApproach(door, b), b.Id, door.Id);
                Graph.Connect(door.NodeA, door.NodeB, door.Id);
                ConnectDoorNodeToRoom(door.NodeA, a);
                ConnectDoorNodeToRoom(door.NodeB, b);
            }
        }

        private void ConnectDoorNodeToRoom(int doorNode, Room room)
        {
            // Door approach nodes link to the nearest hub. In open rooms (corridors, airlocks) they also
            // link directly to the other doors, which keeps routes straight.
            Graph.Connect(doorNode, NearestHub(room, Graph.Nodes[doorNode].Position));
            if (room.Type != RoomType.Corridor && room.Type != RoomType.Airlock) return;
            foreach (var otherId in room.DoorIds)
            {
                var other = Doors[otherId];
                if (other.NodeA < 0 || other.NodeB < 0) continue;
                int otherNode = other.NodeOnSide(room.Id);
                if (otherNode != doorNode && otherNode >= 0) Graph.Connect(doorNode, otherNode);
            }
        }

        private int NearestHub(Room room, Vec3 p)
        {
            int best = room.HubNodes[0];
            float bestD = float.MaxValue;
            foreach (int h in room.HubNodes)
            {
                float d = (Graph.Nodes[h].Position - p).LengthSq;
                if (d < bestD)
                {
                    bestD = d;
                    best = h;
                }
            }
            return best;
        }

        /// <summary>Point 0.9 m inside `room` in front of the door.</summary>
        public static Vec3 DoorApproach(Door door, Room room)
        {
            Vec3 c = room.Center;
            Vec3 p = door.Position;
            const float inset = 0.9f;
            if (door.CrossesAlongX)
                return new Vec3(c.X > p.X ? room.MinX + inset : room.MaxX - inset, room.FloorY, p.Z);
            return new Vec3(p.X, room.FloorY, c.Z > p.Z ? room.MinZ + inset : room.MaxZ - inset);
        }
    }
}
