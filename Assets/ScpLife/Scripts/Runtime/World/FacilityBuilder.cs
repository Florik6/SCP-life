using System;
using System.Collections.Generic;
using ScpLife.Core;
using UnityEngine;
using UnityEngine.UI;

namespace ScpLife.Runtime
{
    public sealed class RoomView
    {
        public Room Room;
        public GameObject Root;
        public readonly List<Light> Lights = new List<Light>();
        public readonly List<MeshRenderer> Fixtures = new List<MeshRenderer>();
        public bool Visible = true;
    }

    public sealed class FacilityView
    {
        public Transform Root;
        public readonly Dictionary<string, RoomView> Rooms = new Dictionary<string, RoomView>();
        public readonly Dictionary<string, DoorView> Doors = new Dictionary<string, DoorView>();
        public readonly List<Light> AlarmLights = new List<Light>();
        public readonly List<MeshRenderer> AlarmBeacons = new List<MeshRenderer>();
        public Transform ObservationGlass;
    }

    /// <summary>
    /// Builds the 3D facility from the simulation's room/door model. Every room becomes a
    /// combined static mesh (floors, walls with door/window openings, furniture), plus colliders,
    /// light fixtures, realtime lights and signage.
    /// </summary>
    public sealed class FacilityBuilder
    {
        public const float WallThickness = 0.15f;
        private const float LowerBand = 1.1f;
        private const float StripeHeight = 0.1f;
        private const float ChunkLength = 13f;

        private struct Opening
        {
            public float A0, A1, Y0, Y1;
        }

        private struct WindowDef
        {
            public string RoomA, RoomB;
            public float Min, Max, Y0, Y1;
        }

        private static readonly WindowDef[] Windows =
        {
            new WindowDef { RoomA = "obs", RoomB = "chamber", Min = 11.0f, Max = 15.7f, Y0 = 1.0f, Y1 = 2.4f }
        };

        private readonly SimWorld _world;
        private readonly MaterialLibrary _m;
        private readonly FacilityView _view = new FacilityView();
        private readonly Dictionary<string, MeshBuilder> _builders = new Dictionary<string, MeshBuilder>();
        private readonly Dictionary<string, MeshBuilder> _fixtureBuilders = new Dictionary<string, MeshBuilder>();
        private Room _room;
        private RoomView _roomView;
        private GameObject _colliders;
        private Font _font;

        public FacilityBuilder(SimWorld world, MaterialLibrary materials, Font font)
        {
            _world = world;
            _m = materials;
            _font = font;
        }

        public FacilityView Build(Transform parent)
        {
            var root = new GameObject("Facility");
            root.transform.SetParent(parent, false);
            _view.Root = root.transform;

            foreach (var room in _world.Facility.RoomList) BuildRoom(room);
            foreach (var door in _world.Facility.DoorList) BuildDoor(door);
            BuildWindows();
            return _view;
        }

        // ------------------------------------------------------------------ rooms

        private MeshBuilder MB(Vector3 at)
        {
            string key = _room.Id;
            if (_room.Type == RoomType.Corridor)
                key += "#" + Mathf.Clamp(Mathf.FloorToInt((at.x - _room.MinX) / ChunkLength), 0, 9);
            if (!_builders.TryGetValue(key, out var mb))
            {
                mb = new MeshBuilder();
                _builders[key] = mb;
            }
            return mb;
        }

        private MeshBuilder FixtureMB()
        {
            if (!_fixtureBuilders.TryGetValue(_room.Id, out var mb))
            {
                mb = new MeshBuilder();
                _fixtureBuilders[_room.Id] = mb;
            }
            return mb;
        }

        private void Box(Material mat, Vector3 center, Vector3 size, bool collider = false, float uv = 2f)
        {
            MB(center).Box(mat, center, size, uv);
            if (collider) Collider(center, size);
        }

        private void Collider(Vector3 center, Vector3 size)
        {
            var c = _colliders.AddComponent<BoxCollider>();
            c.center = center;
            c.size = size;
        }

        private void BuildRoom(Room room)
        {
            _room = room;
            var rootGo = new GameObject("Room_" + room.Id);
            rootGo.transform.SetParent(_view.Root, false);
            _roomView = new RoomView { Room = room, Root = rootGo };
            _view.Rooms[room.Id] = _roomView;
            _colliders = new GameObject("Colliders");
            _colliders.transform.SetParent(rootGo.transform, false);

            float t = WallThickness;
            float h = room.Height;
            float y0 = room.FloorY;

            // Floor and ceiling (extended under the walls so wall gaps never show the void).
            Material floor = FloorMaterial(room.Type);
            if (room.Type == RoomType.Corridor)
            {
                for (float x = room.MinX - t; x < room.MaxX + t - 0.01f; x += ChunkLength)
                {
                    float x1 = Mathf.Min(x + ChunkLength, room.MaxX + t);
                    var c = new Vector3((x + x1) * 0.5f, y0 - 0.05f, (room.MinZ + room.MaxZ) * 0.5f);
                    MB(c).Box(floor, c, new Vector3(x1 - x, 0.1f, room.Depth + 2 * t), 2.5f);
                    var cc = new Vector3((x + x1) * 0.5f, y0 + h + 0.05f, (room.MinZ + room.MaxZ) * 0.5f);
                    MB(cc).Box(_m.Ceiling, cc, new Vector3(x1 - x, 0.1f, room.Depth + 2 * t), 3f);
                }
            }
            else
            {
                Box(floor, new Vector3((room.MinX + room.MaxX) * 0.5f, y0 - 0.05f, (room.MinZ + room.MaxZ) * 0.5f),
                    new Vector3(room.Width + 2 * t, 0.1f, room.Depth + 2 * t), false, 2.5f);
                Box(_m.Ceiling, new Vector3((room.MinX + room.MaxX) * 0.5f, y0 + h + 0.05f, (room.MinZ + room.MaxZ) * 0.5f),
                    new Vector3(room.Width + 2 * t, 0.1f, room.Depth + 2 * t), false, 3f);
            }
            Collider(new Vector3((room.MinX + room.MaxX) * 0.5f, y0 - 0.05f, (room.MinZ + room.MaxZ) * 0.5f),
                new Vector3(room.Width + 2 * t, 0.1f, room.Depth + 2 * t));

            BuildWalls(room);
            BuildProps(room);
            BuildLighting(room);

            foreach (var kv in _builders)
                if (kv.Key == room.Id || kv.Key.StartsWith(room.Id + "#", StringComparison.Ordinal))
                    kv.Value.Build("Mesh_" + kv.Key, rootGo.transform);
            if (_fixtureBuilders.TryGetValue(room.Id, out var fixtures) && !fixtures.IsEmpty)
            {
                var fgo = fixtures.Build("Fixtures", rootGo.transform);
                fgo.isStatic = false;
                _roomView.Fixtures.Add(fgo.GetComponent<MeshRenderer>());
            }
        }

        private Material FloorMaterial(RoomType type)
        {
            switch (type)
            {
                case RoomType.Corridor: return _m.CorridorFloor;
                case RoomType.Laboratory:
                case RoomType.MedicalBay:
                case RoomType.Observation:
                case RoomType.Canteen:
                    return _m.TileFloor;
                default: return _m.ConcreteFloor;
            }
        }

        // ------------------------------------------------------------------ walls with openings

        private enum Side { North, South, East, West }

        private void BuildWalls(Room room)
        {
            foreach (Side side in new[] { Side.North, Side.South, Side.East, Side.West })
            {
                var openings = new List<Opening>();
                foreach (string doorId in room.DoorIds)
                {
                    var door = _world.Facility.GetDoor(doorId);
                    if (DoorSide(room, door) != side) continue;
                    float along = door.CrossesAlongX ? door.Position.Z : door.Position.X;
                    float w = door.Kind == DoorKind.Archway ? door.Width : door.Width + 0.24f;
                    float hgt = door.Kind == DoorKind.Archway ? 2.6f : door.Height + 0.12f;
                    openings.Add(new Opening { A0 = along - w * 0.5f, A1 = along + w * 0.5f, Y0 = 0f, Y1 = hgt });
                }
                foreach (var win in Windows)
                {
                    if (win.RoomA != room.Id && win.RoomB != room.Id) continue;
                    string other = win.RoomA == room.Id ? win.RoomB : win.RoomA;
                    var otherRoom = _world.Facility.GetRoom(other);
                    if (SideTowards(room, otherRoom) != side) continue;
                    openings.Add(new Opening { A0 = win.Min, A1 = win.Max, Y0 = win.Y0, Y1 = win.Y1 });
                }
                BuildWallSide(room, side, openings);
            }
        }

        private static Side DoorSide(Room room, Door door)
        {
            if (door.CrossesAlongX) return door.Position.X > (room.MinX + room.MaxX) * 0.5f ? Side.East : Side.West;
            return door.Position.Z > (room.MinZ + room.MaxZ) * 0.5f ? Side.North : Side.South;
        }

        private static Side SideTowards(Room room, Room other)
        {
            if (other.MinZ >= room.MaxZ - 0.01f) return Side.North;
            if (other.MaxZ <= room.MinZ + 0.01f) return Side.South;
            if (other.MinX >= room.MaxX - 0.01f) return Side.East;
            return Side.West;
        }

        private void BuildWallSide(Room room, Side side, List<Opening> openings)
        {
            float t = WallThickness;
            bool alongX = side == Side.North || side == Side.South;
            float a0 = alongX ? room.MinX - t : room.MinZ;
            float a1 = alongX ? room.MaxX + t : room.MaxZ;
            float plane;
            switch (side)
            {
                case Side.North: plane = room.MaxZ + t * 0.5f; break;
                case Side.South: plane = room.MinZ - t * 0.5f; break;
                case Side.East: plane = room.MaxX + t * 0.5f; break;
                default: plane = room.MinX - t * 0.5f; break;
            }

            var cuts = new List<float> { a0, a1 };
            foreach (var o in openings)
            {
                cuts.Add(Mathf.Clamp(o.A0, a0, a1));
                cuts.Add(Mathf.Clamp(o.A1, a0, a1));
            }
            for (float c = a0 + 12f; c < a1; c += 12f) cuts.Add(c);
            cuts.Sort();

            bool chamber = room.Type == RoomType.Containment;
            for (int i = 0; i + 1 < cuts.Count; i++)
            {
                float s0 = cuts[i], s1 = cuts[i + 1];
                if (s1 - s0 < 0.01f) continue;
                float mid = (s0 + s1) * 0.5f;
                var solid = new List<Vector2> { new Vector2(0f, room.Height) };
                foreach (var o in openings)
                    if (mid > o.A0 && mid < o.A1) solid = Subtract(solid, o.Y0, o.Y1);

                foreach (var range in solid)
                {
                    if (range.y - range.x < 0.01f) continue;
                    if (chamber)
                    {
                        WallPiece(alongX, plane, s0, s1, range.x, range.y, _m.ChamberWall, room);
                    }
                    else
                    {
                        Layer(alongX, plane, s0, s1, range, 0f, LowerBand, _m.WallLower, room);
                        Layer(alongX, plane, s0, s1, range, LowerBand, LowerBand + StripeHeight, _m.Stripe, room);
                        Layer(alongX, plane, s0, s1, range, LowerBand + StripeHeight, room.Height, _m.WallUpper, room);
                    }
                    Vector3 cc = alongX
                        ? new Vector3((s0 + s1) * 0.5f, room.FloorY + (range.x + range.y) * 0.5f, plane)
                        : new Vector3(plane, room.FloorY + (range.x + range.y) * 0.5f, (s0 + s1) * 0.5f);
                    Vector3 cs = alongX ? new Vector3(s1 - s0, range.y - range.x, t) : new Vector3(t, range.y - range.x, s1 - s0);
                    Collider(cc, cs);
                }
            }
        }

        private void Layer(bool alongX, float plane, float s0, float s1, Vector2 range, float l0, float l1, Material mat, Room room)
        {
            float y0 = Mathf.Max(range.x, l0), y1 = Mathf.Min(range.y, l1);
            if (y1 - y0 < 0.005f) return;
            WallPiece(alongX, plane, s0, s1, y0, y1, mat, room);
        }

        private void WallPiece(bool alongX, float plane, float s0, float s1, float y0, float y1, Material mat, Room room)
        {
            Vector3 c = alongX
                ? new Vector3((s0 + s1) * 0.5f, room.FloorY + (y0 + y1) * 0.5f, plane)
                : new Vector3(plane, room.FloorY + (y0 + y1) * 0.5f, (s0 + s1) * 0.5f);
            Vector3 size = alongX ? new Vector3(s1 - s0, y1 - y0, WallThickness) : new Vector3(WallThickness, y1 - y0, s1 - s0);
            MB(c).Box(mat, c, size, 2f, false);
        }

        private static List<Vector2> Subtract(List<Vector2> ranges, float y0, float y1)
        {
            var result = new List<Vector2>();
            foreach (var r in ranges)
            {
                if (y1 <= r.x || y0 >= r.y)
                {
                    result.Add(r);
                    continue;
                }
                if (y0 > r.x) result.Add(new Vector2(r.x, y0));
                if (y1 < r.y) result.Add(new Vector2(y1, r.y));
            }
            return result;
        }

        // ------------------------------------------------------------------ helpers for props

        private static Vector3 Fwd(float yaw)
        {
            Vector3 f = Quaternion.Euler(0f, yaw, 0f) * Vector3.forward;
            return new Vector3(Mathf.Round(f.x), 0f, Mathf.Round(f.z));
        }

        /// <summary>Size vector for an object `length` along `fwd`, `width` across, `height` up.</summary>
        private static Vector3 Oriented(Vector3 fwd, float length, float width, float height)
        {
            return Mathf.Abs(fwd.x) > 0.5f ? new Vector3(length, height, width) : new Vector3(width, height, length);
        }

        private static Vector3 P(PointOfInterest poi, float up = 0f) => new Vector3(poi.Position.X, poi.Position.Y + up, poi.Position.Z);

        private IEnumerable<PointOfInterest> Pois(PoiType type)
        {
            foreach (var p in _room.Pois)
                if (p.Type == type) yield return p;
        }

        private void Chair(PointOfInterest poi, Material seatMat)
        {
            Vector3 f = Fwd(poi.FacingYaw);
            Vector3 c = P(poi);
            Box(_m.DarkMetal, c + Vector3.up * 0.22f, new Vector3(0.06f, 0.44f, 0.06f));
            Box(seatMat, c + Vector3.up * 0.46f, new Vector3(0.44f, 0.05f, 0.44f));
            Box(seatMat, c - f * 0.21f + Vector3.up * 0.7f, Oriented(f, 0.05f, 0.44f, 0.45f));
        }

        private void Desk(PointOfInterest poi, bool monitor)
        {
            Vector3 f = Fwd(poi.FacingYaw);
            Vector3 c = P(poi) + f * 0.65f;
            Box(_m.Plastic, c + Vector3.up * 0.75f, Oriented(f, 0.75f, 1.4f, 0.04f), true);
            Box(_m.DarkMetal, c + Vector3.up * 0.37f, Oriented(f, 0.6f, 1.3f, 0.72f));
            if (monitor)
            {
                Box(_m.DarkMetal, c + f * 0.2f + Vector3.up * 0.82f, Oriented(f, 0.12f, 0.12f, 0.1f));
                Box(_m.ScreenBlue, c + f * 0.22f + Vector3.up * 1.05f, Oriented(f, 0.04f, 0.6f, 0.36f));
                Box(_m.Black, c - f * 0.05f + Vector3.up * 0.775f, Oriented(f, 0.18f, 0.45f, 0.02f));
            }
            Chair(poi, _m.Fabric);
        }

        private void Bed(PointOfInterest poi, Material frame, Material sheet, float height)
        {
            Vector3 f = Fwd(poi.FacingYaw);
            Vector3 c = P(poi);
            Box(frame, c + Vector3.up * (height * 0.5f), Oriented(f, 2.0f, 0.9f, height), true);
            Box(_m.Mattress, c + Vector3.up * (height + 0.07f), Oriented(f, 1.95f, 0.86f, 0.14f));
            Box(_m.White, c + f * 0.75f + Vector3.up * (height + 0.19f), Oriented(f, 0.35f, 0.6f, 0.1f));
            Box(sheet, c - f * 0.35f + Vector3.up * (height + 0.15f), Oriented(f, 1.2f, 0.88f, 0.04f));
        }

        private void Sign(string text, Vector3 position, float yaw, float width, Color background, Color textColor, int fontSize = 56)
        {
            var go = new GameObject("Sign");
            go.transform.SetParent(_roomView.Root.transform, false);
            go.transform.position = position;
            go.transform.rotation = Quaternion.Euler(0f, yaw, 0f);
            var canvas = go.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.WorldSpace;
            var rt = go.GetComponent<RectTransform>();
            const float scale = 0.0025f;
            rt.sizeDelta = new Vector2(width / scale, 0.3f / scale);
            go.transform.localScale = Vector3.one * scale;

            var bg = new GameObject("Bg");
            bg.transform.SetParent(go.transform, false);
            var img = bg.AddComponent<Image>();
            img.color = background;
            UiFactory.Stretch(img.rectTransform);

            var txt = new GameObject("Text");
            txt.transform.SetParent(go.transform, false);
            var label = txt.AddComponent<Text>();
            label.font = _font;
            label.text = text;
            label.fontSize = fontSize;
            label.alignment = TextAnchor.MiddleCenter;
            label.color = textColor;
            label.horizontalOverflow = HorizontalWrapMode.Wrap;
            label.verticalOverflow = VerticalWrapMode.Truncate;
            label.resizeTextForBestFit = true;
            label.resizeTextMinSize = 12;
            label.resizeTextMaxSize = fontSize;
            UiFactory.Stretch(label.rectTransform, 12f);
        }

        /// <summary>Sign mounted on a wall on the given room side, facing into the room.</summary>
        private void WallSign(string text, Side side, float along, float height, float width, Color bg, Color fg, int fontSize = 56)
        {
            Vector3 pos;
            float yaw;
            const float inset = 0.02f;
            switch (side)
            {
                case Side.North: pos = new Vector3(along, height, _room.MaxZ - inset); yaw = 0f; break;
                case Side.South: pos = new Vector3(along, height, _room.MinZ + inset); yaw = 180f; break;
                case Side.East: pos = new Vector3(_room.MaxX - inset, height, along); yaw = 90f; break;
                default: pos = new Vector3(_room.MinX + inset, height, along); yaw = 270f; break;
            }
            // Canvas faces -Z of its transform towards the viewer, so rotate to face into the room.
            Sign(text, pos, yaw, width, bg, fg, fontSize);
        }

        private static readonly Color SignDark = new Color(0.08f, 0.09f, 0.1f, 0.95f);
        private static readonly Color SignYellow = new Color(0.85f, 0.65f, 0.1f, 0.95f);
        private static readonly Color SignRed = new Color(0.55f, 0.06f, 0.06f, 0.95f);
        private static readonly Color SignText = new Color(0.92f, 0.92f, 0.88f);

        // ------------------------------------------------------------------ props per room type

        private void BuildProps(Room room)
        {
            switch (room.Type)
            {
                case RoomType.Corridor: CorridorProps(room); break;
                case RoomType.Dormitory: DormProps(room); break;
                case RoomType.Canteen: CanteenProps(room); break;
                case RoomType.Laboratory: LabProps(room); break;
                case RoomType.Observation: ObservationProps(room); break;
                case RoomType.Airlock: AirlockProps(room); break;
                case RoomType.Containment: ChamberProps(room); break;
                case RoomType.SecurityPost: PostProps(room); break;
                case RoomType.MedicalBay: MedProps(room); break;
                case RoomType.DClassCommon: DBlockProps(room); break;
                case RoomType.DClassCell: CellProps(room); break;
                case RoomType.Engineering: EngProps(room); break;
            }
            foreach (var poi in Pois(PoiType.PatrolPoint)) Checkpoint(poi);
            foreach (var poi in Pois(PoiType.Panel)) WallPanel(poi);
        }

        private void Checkpoint(PointOfInterest poi)
        {
            Vector3 f = Fwd(poi.FacingYaw);
            Vector3 c = P(poi) + f * 0.55f;
            Box(_m.DarkMetal, c + Vector3.up * 0.6f, new Vector3(0.1f, 1.2f, 0.1f));
            var go = new GameObject("Checkpoint_" + poi.Id);
            go.transform.SetParent(_roomView.Root.transform, false);
            go.transform.position = c + Vector3.up * 1.25f;
            go.transform.rotation = Quaternion.LookRotation(-f);
            var mf = go.AddComponent<MeshFilter>();
            mf.sharedMesh = PrimitiveMeshes.Cube;
            go.AddComponent<MeshRenderer>().sharedMaterial = _m.Hazard;
            go.transform.localScale = new Vector3(0.22f, 0.16f, 0.12f);
            go.AddComponent<BoxCollider>();
            go.AddComponent<CheckpointInteractable>().Init(poi.Id, poi.Label);
        }

        private void WallPanel(PointOfInterest poi)
        {
            Vector3 f = Fwd(poi.FacingYaw);
            Vector3 c = P(poi) + f * 0.55f + Vector3.up * 1.35f;
            Box(_m.Metal, c, Oriented(f, 0.18f, 0.6f, 0.8f), true);
            Box(_m.IndicatorGreen, c - f * 0.1f + Vector3.up * 0.28f, Oriented(f, 0.02f, 0.06f, 0.04f));
            Box(_m.IndicatorRed, c - f * 0.1f + Vector3.up * 0.28f + Vector3.Cross(Vector3.up, f) * 0.12f, Oriented(f, 0.02f, 0.06f, 0.04f));
            Box(_m.Hazard, c - f * 0.1f - Vector3.up * 0.3f, Oriented(f, 0.01f, 0.5f, 0.08f));
        }

        private void CorridorProps(Room room)
        {
            float h = room.Height;
            // Ceiling pipes along the whole corridor.
            for (float x = room.MinX; x < room.MaxX; x += 12f)
            {
                float x1 = Mathf.Min(x + 12f, room.MaxX);
                Box(_m.Metal, new Vector3((x + x1) * 0.5f, h - 0.25f, room.MaxZ - 0.3f), new Vector3(x1 - x, 0.16f, 0.16f));
                Box(_m.DarkMetal, new Vector3((x + x1) * 0.5f, h - 0.25f, room.MaxZ - 0.55f), new Vector3(x1 - x, 0.12f, 0.12f));
                Box(_m.Hazard, new Vector3((x + x1) * 0.5f, h - 0.42f, room.MinZ + 0.3f), new Vector3(x1 - x, 0.08f, 0.08f), false, 0.5f);
            }
            // Fire extinguishers and alarm beacons.
            for (float x = room.MinX + 6f; x < room.MaxX - 2f; x += 13f)
            {
                Box(_m.IndicatorRed, new Vector3(x, 0.55f, room.MinZ + 0.12f), new Vector3(0.18f, 0.5f, 0.18f));
                var beacon = new GameObject("AlarmBeacon");
                beacon.transform.SetParent(_roomView.Root.transform, false);
                beacon.transform.position = new Vector3(x + 1f, h - 0.35f, room.MaxZ - 0.12f);
                beacon.transform.localScale = new Vector3(0.2f, 0.2f, 0.12f);
                beacon.AddComponent<MeshFilter>().sharedMesh = PrimitiveMeshes.Cube;
                var mr = beacon.AddComponent<MeshRenderer>();
                mr.sharedMaterial = _m.AlarmRed;
                _view.AlarmBeacons.Add(mr);
                var light = new GameObject("AlarmLight").AddComponent<Light>();
                light.transform.SetParent(beacon.transform, false);
                light.transform.position = beacon.transform.position + Vector3.down * 0.3f + Vector3.back * 0.3f;
                light.type = LightType.Point;
                light.color = new Color(1f, 0.1f, 0.05f);
                light.range = 7f;
                light.intensity = 0f;
                light.shadows = LightShadows.None;
                light.enabled = false;
                _view.AlarmLights.Add(light);
            }
            // Hazard floor band in front of the containment wing.
            Box(_m.Hazard, new Vector3(19.5f, 0.005f, 1.2f), new Vector3(3.0f, 0.01f, 0.5f), false, 0.5f);

            // Sealed elevator at the east end.
            float ex = room.MaxX - 0.08f;
            Box(_m.DarkMetal, new Vector3(ex, 1.3f, -0.95f), new Vector3(0.12f, 2.6f, 0.2f), true);
            Box(_m.DarkMetal, new Vector3(ex, 1.3f, 0.95f), new Vector3(0.12f, 2.6f, 0.2f), true);
            Box(_m.DarkMetal, new Vector3(ex, 2.7f, 0f), new Vector3(0.12f, 0.2f, 2.1f));
            Box(_m.DoorMetal, new Vector3(ex - 0.02f, 1.25f, -0.43f), new Vector3(0.06f, 2.5f, 0.84f), true);
            Box(_m.DoorMetal, new Vector3(ex - 0.02f, 1.25f, 0.43f), new Vector3(0.06f, 2.5f, 0.84f), true);
            Box(_m.Hazard, new Vector3(ex - 0.05f, 1.25f, 0f), new Vector3(0.02f, 2.5f, 0.04f), false, 0.3f);
            WallSign("ЛИФТ Б-3 · УРОВНИ 1–8\nОБСЛУЖИВАНИЕ — ДВИЖЕНИЕ ПРИОСТАНОВЛЕНО", Side.East, 0f, 3.0f, 2.2f, SignYellow, Color.black, 44);
            WallSign("ЗОНА-19 · УРОВЕНЬ 3 · СЕКТОР Б-3\nСЕКТОР СОДЕРЖАНИЯ", Side.West, 0f, 2.0f, 2.6f, SignDark, SignText, 50);

            // Door signs on the corridor side.
            foreach (string doorId in room.DoorIds)
            {
                var door = _world.Facility.GetDoor(doorId);
                var other = _world.Facility.GetRoom(door.OtherSide(room.Id));
                bool north = door.Position.Z > 0f;
                string text = other.Name.ToUpperInvariant();
                if (door.Kind != DoorKind.Archway && door.Requirement.MinLevel > AccessLevel.L0)
                    text += "\nДОПУСК " + door.Requirement.Describe();
                bool yellow = other.Type == RoomType.DClassCommon;
                Color bg = other.Type == RoomType.Airlock || other.Type == RoomType.Containment ? SignRed : yellow ? SignYellow : SignDark;
                Color fg = yellow ? Color.black : SignText;
                float off = door.Width * 0.5f + 0.9f;
                WallSign(text, north ? Side.North : Side.South, door.Position.X + off, 2.05f, 1.5f, bg, fg, 40);
            }
        }

        private void DormProps(Room room)
        {
            foreach (var bed in Pois(PoiType.Bed)) Bed(bed, _m.DarkMetal, _m.Fabric, 0.4f);
            foreach (var seat in Pois(PoiType.Seat))
            {
                Vector3 f = Fwd(seat.FacingYaw);
                Vector3 c = P(seat);
                Box(_m.Fabric, c + Vector3.up * 0.22f, new Vector3(0.7f, 0.44f, 0.7f), true);
                Box(_m.Fabric, c - f * 0.32f + Vector3.up * 0.65f, Oriented(f, 0.12f, 0.7f, 0.5f));
            }
            Box(_m.Wood, new Vector3(-20.6f, 0.25f, 11.75f), new Vector3(0.6f, 0.5f, 0.5f), true);
            // Lockers by the entrance.
            for (float x = -25.5f; x < -23.0f; x += 0.6f) Locker(new Vector3(x + 0.3f, 0f, room.MinZ + 0.28f), 0f);
            for (float x = -18.1f; x < -15.6f; x += 0.6f) Locker(new Vector3(x + 0.3f, 0f, room.MinZ + 0.28f), 0f);
            WallSign("ЖИЛОЙ БЛОК ПЕРСОНАЛА · ТИШИНА 23:00–06:30", Side.North, -20.6f, 2.4f, 2.4f, SignDark, SignText, 44);
        }

        private void Locker(Vector3 basePos, float yaw)
        {
            Box(_m.DoorMetal, basePos + Vector3.up * 0.95f, new Vector3(0.56f, 1.9f, 0.5f), true);
            Box(_m.Black, basePos + Vector3.up * 1.6f + Vector3.forward * (yaw == 0f ? 0.26f : -0.26f), new Vector3(0.3f, 0.04f, 0.02f));
        }

        private void CanteenProps(Room room)
        {
            float[] tableX = { -12.6f, -5.8f };
            float[] tableZ = { 5.5f, 8.5f };
            foreach (float tx in tableX)
                foreach (float tz in tableZ)
                {
                    Box(_m.Plastic, new Vector3(tx, 0.75f, tz), new Vector3(2.4f, 0.05f, 1.0f), false);
                    Box(_m.DarkMetal, new Vector3(tx - 0.8f, 0.37f, tz), new Vector3(0.12f, 0.72f, 0.12f));
                    Box(_m.DarkMetal, new Vector3(tx + 0.8f, 0.37f, tz), new Vector3(0.12f, 0.72f, 0.12f));
                    Collider(new Vector3(tx, 0.39f, tz), new Vector3(2.4f, 0.78f, 1.0f));
                    // Trays and cups for a lived-in look.
                    Box(_m.DarkMetal, new Vector3(tx - 0.6f, 0.785f, tz - 0.25f), new Vector3(0.4f, 0.02f, 0.3f));
                    Box(_m.White, new Vector3(tx + 0.5f, 0.82f, tz + 0.2f), new Vector3(0.08f, 0.1f, 0.08f));
                }
            foreach (var seat in Pois(PoiType.Seat)) Chair(seat, _m.Plastic);

            Box(_m.Metal, new Vector3(-9.15f, 0.47f, 11.85f), new Vector3(8.7f, 0.95f, 0.8f), true);
            Box(_m.Plastic, new Vector3(-9.15f, 0.97f, 11.85f), new Vector3(8.8f, 0.04f, 0.85f));
            for (float x = -13f; x < -5f; x += 1.1f)
                Box(_m.Metal, new Vector3(x, 1.05f, 11.95f), new Vector3(0.5f, 0.12f, 0.35f));
            Box(_m.Glass, new Vector3(-9.15f, 1.3f, 11.5f), new Vector3(8.6f, 0.5f, 0.02f));
            Box(_m.White, new Vector3(-14.45f, 1.0f, 10.6f), new Vector3(0.9f, 2.0f, 0.8f), true);
            Box(_m.ScreenGreen, new Vector3(-14.0f, 1.4f, 10.6f), new Vector3(0.02f, 0.3f, 0.4f));
            WallSign("СТОЛОВАЯ · ЗАВТРАК 06:30–08:00 · ОБЕД 12:00–13:30 · УЖИН 18:30–20:30", Side.North, -9.15f, 2.5f, 3.8f, SignDark, SignText, 40);
        }

        private void LabProps(Room room)
        {
            foreach (var desk in Pois(PoiType.Desk)) Desk(desk, true);
            // Central island bench with equipment.
            Box(_m.Metal, new Vector3(3.35f, 0.45f, 7.8f), new Vector3(2.4f, 0.9f, 1.6f), true);
            Box(_m.Plastic, new Vector3(3.35f, 0.92f, 7.8f), new Vector3(2.5f, 0.04f, 1.7f));
            Box(_m.DarkMetal, new Vector3(2.7f, 1.12f, 7.6f), new Vector3(0.35f, 0.36f, 0.35f));
            Box(_m.White, new Vector3(3.6f, 1.05f, 8.1f), new Vector3(0.5f, 0.22f, 0.4f));
            Box(_m.Glass, new Vector3(4.1f, 1.1f, 7.5f), new Vector3(0.3f, 0.3f, 0.3f));
            for (int i = 0; i < 5; i++) Box(_m.Plastic, new Vector3(2.4f + i * 0.12f, 1.0f, 8.3f), new Vector3(0.05f, 0.14f, 0.05f));
            // Terminal and fume hood.
            Box(_m.DarkMetal, new Vector3(3.35f, 0.6f, 11.95f), new Vector3(0.9f, 1.2f, 0.5f), true);
            Box(_m.ScreenGreen, new Vector3(3.35f, 1.4f, 11.85f), new Vector3(0.7f, 0.45f, 0.04f));
            Box(_m.Metal, new Vector3(8.75f, 1.1f, 11.7f), new Vector3(1.6f, 2.2f, 0.9f), true);
            Box(_m.Glass, new Vector3(8.75f, 1.3f, 11.24f), new Vector3(1.4f, 0.8f, 0.02f));
            // Archive shelves along the north wall.
            for (float x = -2.5f; x < 1.0f; x += 1.2f)
            {
                Box(_m.DarkMetal, new Vector3(x + 0.6f, 1.0f, 12.05f), new Vector3(1.1f, 2.0f, 0.4f), true);
                for (int s = 0; s < 4; s++)
                    Box(s % 2 == 0 ? _m.White : _m.Wood, new Vector3(x + 0.6f, 0.4f + s * 0.45f, 11.95f), new Vector3(0.9f, 0.25f, 0.25f));
            }
            WallSign("ЛАБОРАТОРИЯ ИССЛЕДОВАНИЙ · ПРОЕКТ «СЧЕТОВОД»", Side.South, 6.6f, 2.5f, 2.6f, SignDark, SignText, 44);
        }

        private void ObservationProps(Room room)
        {
            Box(_m.DarkMetal, new Vector3(13.35f, 0.42f, 7.95f), new Vector3(4.7f, 0.85f, 0.6f), true);
            Box(_m.Plastic, new Vector3(13.35f, 0.86f, 7.9f), new Vector3(4.8f, 0.04f, 0.7f));
            Box(_m.ScreenGreen, new Vector3(11.4f, 1.1f, 8.1f), new Vector3(0.6f, 0.4f, 0.05f));
            Box(_m.ScreenBlue, new Vector3(15.3f, 1.1f, 8.1f), new Vector3(0.6f, 0.4f, 0.05f));
            for (int i = 0; i < 6; i++)
                Box(i % 3 == 0 ? _m.IndicatorRed : _m.IndicatorGreen, new Vector3(12.6f + i * 0.3f, 0.9f, 7.75f), new Vector3(0.06f, 0.03f, 0.06f));
            foreach (var c in Pois(PoiType.Console)) Chair(c, _m.Fabric);
            WallSign("НЕ СТУЧАТЬ ПО СТЕКЛУ · СЕАНС СЧЁТА КАЖДЫЕ 6 Ч · ПРИ ВОЗБУЖДЕНИИ ОБЪЕКТА — ДОКЛАД НА ПОСТ", Side.East, 5.3f, 2.3f, 2.8f, SignYellow, Color.black, 38);
        }

        private void AirlockProps(Room room)
        {
            Box(_m.Hazard, new Vector3(19.5f, 0.005f, 7.8f), new Vector3(2.6f, 0.01f, 0.6f), false, 0.5f);
            Box(_m.Hazard, new Vector3(19.5f, 0.005f, 2.8f), new Vector3(2.0f, 0.01f, 0.4f), false, 0.5f);
            for (int i = 0; i < 3; i++)
                Box(_m.Metal, new Vector3(18.2f + i * 1.3f, room.Height - 0.1f, 5.2f), new Vector3(0.3f, 0.12f, 0.3f));
            Box(_m.DarkMetal, new Vector3(17.35f, 0.25f, 5.3f), new Vector3(0.5f, 0.5f, 2.4f), true);
            WallSign("ВХОД В КАМЕРУ — ТОЛЬКО ДВЕ КАРТЫ L3 «СОДЕРЖАНИЕ» · ПРИ ВОЗБУЖДЕНИИ ОБЪЕКТА ВХОД ЗАПРЕЩЁН", Side.West, 5.3f, 2.2f, 2.6f, SignRed, SignText, 38);
        }

        private void ChamberProps(Room room)
        {
            Box(_m.DarkMetal, new Vector3(16f, 0.005f, 13.6f), new Vector3(0.7f, 0.01f, 0.7f));
            foreach (var s in Pois(PoiType.Terminal))
            {
                Vector3 f = Fwd(s.FacingYaw);
                Vector3 c = P(s) + f * 0.55f;
                Box(_m.DarkMetal, c + Vector3.up * 0.55f, new Vector3(0.4f, 1.1f, 0.3f), true);
                Box(_m.ScreenGreen, c + Vector3.up * 1.0f - f * 0.16f, Oriented(f, 0.02f, 0.3f, 0.2f));
            }
        }

        private void PostProps(Room room)
        {
            Box(_m.DarkMetal, new Vector3(-21.65f, 0.4f, -9.9f), new Vector3(5.8f, 0.8f, 0.8f), true);
            Box(_m.Plastic, new Vector3(-21.65f, 0.82f, -9.85f), new Vector3(5.9f, 0.04f, 0.9f));
            for (int i = 0; i < 6; i++)
            {
                float x = -24.0f + (i % 3) * 1.4f + (i >= 3 ? 0.7f : 0f) + 0.35f;
                float y = i < 3 ? 1.3f : 1.85f;
                Box(_m.DarkMetal, new Vector3(x, y, -10.25f), new Vector3(0.8f, 0.52f, 0.08f));
                Box(i % 2 == 0 ? _m.ScreenGreen : _m.ScreenBlue, new Vector3(x, y, -10.2f), new Vector3(0.7f, 0.42f, 0.02f));
            }
            foreach (var c in Pois(PoiType.GuardPost)) Chair(c, _m.Fabric);
            for (float z = -9.2f; z < -4.5f; z += 0.6f) Locker(new Vector3(room.MinX + 0.28f, 0f, z + 0.3f), 90f);
            Box(_m.DarkMetal, new Vector3(room.MinX + 0.18f, 1.2f, -3.3f), new Vector3(0.3f, 1.4f, 1.0f), true);
            WallSign("КПП · ПОСТ ОХРАНЫ СЕКТОРА Б-3", Side.North, -24.2f, 2.5f, 2.2f, SignDark, SignText, 46);
            WallSign("ТЕРМИНАЛ ДЕЖУРНОГО", Side.East, -6.0f, 2.1f, 1.2f, SignDark, SignText, 40);

            // Duty terminal (interactive).
            var term = new GameObject("DutyTerminal");
            term.transform.SetParent(_roomView.Root.transform, false);
            term.transform.position = new Vector3(room.MaxX - 0.1f, 1.3f, -6.0f);
            term.transform.rotation = Quaternion.Euler(0f, 270f, 0f);
            Box(_m.DarkMetal, new Vector3(room.MaxX - 0.1f, 1.3f, -6.0f), new Vector3(0.16f, 0.7f, 1.0f));
            Box(_m.ScreenGreen, new Vector3(room.MaxX - 0.19f, 1.35f, -6.0f), new Vector3(0.02f, 0.5f, 0.85f));
            var col = term.AddComponent<BoxCollider>();
            col.size = new Vector3(1.0f, 0.8f, 0.3f);
            term.AddComponent<TerminalInteractable>();
        }

        private void MedProps(Room room)
        {
            foreach (var bed in Pois(PoiType.MedBed)) Bed(bed, _m.Metal, _m.White, 0.6f);
            foreach (var d in Pois(PoiType.Desk)) Desk(d, true);
            Box(_m.White, new Vector3(room.MinX + 0.3f, 1.0f, -6.0f), new Vector3(0.5f, 2.0f, 1.4f), true);
            Box(_m.IndicatorRed, new Vector3(room.MinX + 0.56f, 1.5f, -6.0f), new Vector3(0.02f, 0.4f, 0.12f));
            Box(_m.IndicatorRed, new Vector3(room.MinX + 0.56f, 1.5f, -6.0f), new Vector3(0.02f, 0.12f, 0.4f));
            Box(_m.Metal, new Vector3(-14.0f, room.Height - 0.2f, -8.2f), new Vector3(6f, 0.04f, 0.04f));
            WallSign("МЕДПУНКТ · ПРИЁМ 07:30–19:00", Side.North, -11.0f, 2.4f, 1.8f, SignDark, SignText, 44);
        }

        private void DBlockProps(Room room)
        {
            float[] tableX = { -4.5f, 3.2f };
            foreach (float tx in tableX)
            {
                Box(_m.Metal, new Vector3(tx, 0.74f, -6.3f), new Vector3(4.0f, 0.06f, 1.0f));
                Box(_m.DarkMetal, new Vector3(tx, 0.36f, -6.3f), new Vector3(3.6f, 0.72f, 0.2f));
                Collider(new Vector3(tx, 0.39f, -6.3f), new Vector3(4.0f, 0.78f, 1.0f));
                Box(_m.Metal, new Vector3(tx, 0.44f, -5.45f), new Vector3(4.0f, 0.05f, 0.35f));
                Box(_m.Metal, new Vector3(tx, 0.44f, -7.15f), new Vector3(4.0f, 0.05f, 0.35f));
                Box(_m.DarkMetal, new Vector3(tx, 0.21f, -5.45f), new Vector3(3.6f, 0.42f, 0.08f));
                Box(_m.DarkMetal, new Vector3(tx, 0.21f, -7.15f), new Vector3(3.6f, 0.42f, 0.08f));
            }
            foreach (var w in Pois(PoiType.Workbench))
            {
                Vector3 f = Fwd(w.FacingYaw);
                Vector3 c = P(w) + f * 0.5f;
                bool washer = w.Position.X > 0f;
                if (washer)
                {
                    Box(_m.White, c + Vector3.up * 0.45f, new Vector3(0.65f, 0.9f, 0.65f), true);
                    Box(_m.Black, c - f * 0.33f + Vector3.up * 0.5f, Oriented(f, 0.02f, 0.38f, 0.38f));
                }
                else
                {
                    Box(_m.Metal, c + Vector3.up * 0.45f, Oriented(f, 0.7f, 1.4f, 0.9f), true);
                    Box(_m.Orange, c + Vector3.up * 0.95f, Oriented(f, 0.4f, 0.6f, 0.12f));
                    Box(_m.White, c + Vector3.up * 0.95f + Vector3.Cross(Vector3.up, f) * 0.4f, Oriented(f, 0.3f, 0.3f, 0.15f));
                }
            }
            // Hazard frames around cell doors.
            for (int i = 0; i < 4; i++)
                Box(_m.Hazard, new Vector3(-7.15f + 4f * i, 0.005f, room.MinZ + 0.35f), new Vector3(1.6f, 0.01f, 0.5f), false, 0.5f);
            WallSign("РАСПОРЯДОК КЛАССА D: 06:30 ПОДЪЁМ · 07:00 РАЗДАЧА · 07:40 ТРУДОВАЯ СМЕНА · 22:00 ОТБОЙ", Side.East, -6.3f, 2.2f, 3.4f, SignYellow, Color.black, 36);
            WallSign("ПЕРЕМЕЩЕНИЕ ВНЕ БЛОКА — ТОЛЬКО ПОД КОНВОЕМ", Side.West, -6.3f, 2.2f, 2.6f, SignRed, SignText, 40);
        }

        private void CellProps(Room room)
        {
            foreach (var bunk in Pois(PoiType.CellBunk)) Bed(bunk, _m.DarkMetal, _m.Orange, 0.45f);
            float cx = (room.MinX + room.MaxX) * 0.5f;
            Box(_m.Metal, new Vector3(cx + 1.35f, 0.22f, room.MinZ + 0.4f), new Vector3(0.45f, 0.45f, 0.55f), true);
            Box(_m.Metal, new Vector3(cx + 1.45f, 0.85f, room.MinZ + 1.2f), new Vector3(0.35f, 0.15f, 0.45f));
            Box(_m.Wood, new Vector3(room.MinX + 0.2f, 1.5f, room.MaxZ - 1.5f), new Vector3(0.3f, 0.04f, 0.8f));
        }

        private void EngProps(Room room)
        {
            Box(_m.DarkMetal, new Vector3(13.35f, 0.9f, -7.4f), new Vector3(4.0f, 1.8f, 2.4f), true);
            Box(_m.Hazard, new Vector3(13.35f, 1.0f, -6.19f), new Vector3(4.0f, 0.2f, 0.02f), false, 0.5f);
            Box(_m.Metal, new Vector3(12.0f, 1.9f + (room.Height - 1.9f) * 0.5f, -7.4f), new Vector3(0.35f, room.Height - 1.9f, 0.35f));
            Box(_m.IndicatorGreen, new Vector3(14.6f, 1.4f, -6.18f), new Vector3(0.1f, 0.06f, 0.02f));
            Box(_m.IndicatorRed, new Vector3(14.9f, 1.4f, -6.18f), new Vector3(0.1f, 0.06f, 0.02f));
            Box(_m.ScreenGreen, new Vector3(13.35f, 1.5f, -6.18f), new Vector3(0.6f, 0.3f, 0.02f));
            for (float x = room.MinX; x < room.MaxX; x += 5.4f)
            {
                float x1 = Mathf.Min(x + 5.4f, room.MaxX);
                Box(_m.Metal, new Vector3((x + x1) * 0.5f, room.Height - 0.3f, room.MinZ + 0.35f), new Vector3(x1 - x, 0.22f, 0.22f));
                Box(_m.Orange, new Vector3((x + x1) * 0.5f, room.Height - 0.6f, room.MinZ + 0.35f), new Vector3(x1 - x, 0.12f, 0.12f));
            }
            var bench = _world.Facility.GetPoi("eng.bench");
            if (bench != null)
            {
                Vector3 f = Fwd(bench.FacingYaw);
                Vector3 c = P(bench) + f * 0.5f;
                Box(_m.DarkMetal, c + Vector3.up * 0.43f, Oriented(f, 0.7f, 1.8f, 0.86f), true);
                Box(_m.Wood, c + Vector3.up * 0.88f, Oriented(f, 0.75f, 1.9f, 0.04f));
                Box(_m.IndicatorRed, c + Vector3.up * 0.95f, Oriented(f, 0.3f, 0.4f, 0.1f));
            }
            Box(_m.Orange, new Vector3(18.1f, 0.45f, -9.6f), new Vector3(0.6f, 0.9f, 0.6f), true);
            Box(_m.DarkMetal, new Vector3(17.3f, 0.45f, -9.6f), new Vector3(0.6f, 0.9f, 0.6f), true);
            WallSign("ИНЖЕНЕРНЫЙ БЛОК · ВЫСОКОЕ НАПРЯЖЕНИЕ", Side.North, 10.5f, 2.5f, 2.2f, SignYellow, Color.black, 42);
        }

        // ------------------------------------------------------------------ lighting

        private void BuildLighting(Room room)
        {
            float h = room.Height;
            // Ceiling light fixtures (emissive panels) on a grid.
            float spacingX = room.Type == RoomType.Corridor ? 4f : 3.5f;
            float spacingZ = 3.5f;
            int nx = Mathf.Max(1, Mathf.RoundToInt(room.Width / spacingX));
            int nz = Mathf.Max(1, Mathf.RoundToInt(room.Depth / spacingZ));
            if (room.Type == RoomType.Corridor) nz = 1;
            var fixtures = FixtureMB();
            for (int ix = 0; ix < nx; ix++)
                for (int iz = 0; iz < nz; iz++)
                {
                    float x = room.MinX + (ix + 0.5f) * room.Width / nx;
                    float z = room.MinZ + (iz + 0.5f) * room.Depth / nz;
                    fixtures.Box(_m.LightPanel, new Vector3(x, h - 0.03f, z), new Vector3(1.1f, 0.05f, 0.28f), 1f);
                    MB(new Vector3(x, h, z)).Box(_m.DarkMetal, new Vector3(x, h - 0.01f, z), new Vector3(1.2f, 0.03f, 0.36f));
                }

            // Realtime lights: few per room, culled at runtime by distance and visibility.
            int count;
            switch (room.Type)
            {
                case RoomType.Corridor: count = 7; break;
                case RoomType.DClassCommon: count = 3; break;
                case RoomType.DClassCell:
                case RoomType.Airlock:
                case RoomType.Observation:
                    count = 1;
                    break;
                default: count = 2; break;
            }
            Color color = new Color(1f, 0.95f, 0.86f);
            float intensity = 1.6f;
            if (room.Type == RoomType.Containment) { color = new Color(0.8f, 0.9f, 1f); intensity = 1.4f; }
            if (room.Type == RoomType.DClassCommon || room.Type == RoomType.DClassCell) color = new Color(0.9f, 1f, 0.88f);
            if (room.Type == RoomType.Engineering) color = new Color(1f, 0.88f, 0.7f);

            bool alongX = room.Width >= room.Depth;
            for (int i = 0; i < count; i++)
            {
                float frac = (i + 0.5f) / count;
                Vector3 pos = alongX
                    ? new Vector3(room.MinX + frac * room.Width, h - 0.4f, (room.MinZ + room.MaxZ) * 0.5f)
                    : new Vector3((room.MinX + room.MaxX) * 0.5f, h - 0.4f, room.MinZ + frac * room.Depth);
                var light = new GameObject("Light").AddComponent<Light>();
                light.transform.SetParent(_roomView.Root.transform, false);
                light.transform.position = pos;
                light.type = LightType.Point;
                light.color = color;
                light.intensity = intensity;
                light.range = Mathf.Clamp(Mathf.Max(room.Width / count, room.Depth) * 0.95f, 5.5f, 10f);
                light.shadows = LightShadows.None;
                light.renderMode = LightRenderMode.Auto;
                _roomView.Lights.Add(light);
            }
        }

        // ------------------------------------------------------------------ doors & windows

        private void BuildDoor(Door door)
        {
            var go = new GameObject("Door_" + door.Id);
            go.transform.SetParent(_view.Root, false);
            go.transform.position = door.Position.ToUnity();
            var view = go.AddComponent<DoorView>();
            view.Build(_world, door, _m);
            _view.Doors[door.Id] = view;
        }

        private void BuildWindows()
        {
            foreach (var win in Windows)
            {
                var a = _world.Facility.GetRoom(win.RoomA);
                var b = _world.Facility.GetRoom(win.RoomB);
                float z = (a.MaxZ + b.MinZ) * 0.5f;
                float cx = (win.Min + win.Max) * 0.5f;
                float w = win.Max - win.Min;
                float cy = (win.Y0 + win.Y1) * 0.5f;
                float hgt = win.Y1 - win.Y0;

                var go = new GameObject("ObservationWindow");
                go.transform.SetParent(_view.Root, false);
                go.transform.position = new Vector3(cx, cy, z);
                var glass = new GameObject("Glass");
                glass.transform.SetParent(go.transform, false);
                glass.AddComponent<MeshFilter>().sharedMesh = PrimitiveMeshes.Cube;
                glass.AddComponent<MeshRenderer>().sharedMaterial = _m.Glass;
                glass.transform.localScale = new Vector3(w, hgt, 0.04f);
                glass.AddComponent<BoxCollider>();
                glass.AddComponent<ObservationWindowInteractable>().Init(TallymanBehaviour.AnomalyId);
                _view.ObservationGlass = glass.transform;

                var mb = new MeshBuilder();
                float t = 0.08f;
                mb.Box(_m.DarkMetal, new Vector3(cx, win.Y1 + t * 0.5f, z), new Vector3(w + 2 * t, t, 0.36f));
                mb.Box(_m.DarkMetal, new Vector3(cx, win.Y0 - t * 0.5f, z), new Vector3(w + 2 * t, t, 0.36f));
                mb.Box(_m.DarkMetal, new Vector3(win.Min - t * 0.5f, cy, z), new Vector3(t, hgt, 0.36f));
                mb.Box(_m.DarkMetal, new Vector3(win.Max + t * 0.5f, cy, z), new Vector3(t, hgt, 0.36f));
                for (int i = 1; i < 3; i++)
                    mb.Box(_m.DarkMetal, new Vector3(win.Min + w * i / 3f, cy, z), new Vector3(0.04f, hgt, 0.06f));
                mb.Build("Frame", _view.Root);
            }
        }
    }
}
