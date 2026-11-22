using System.Collections.Generic;
using ScpLife.Core;
using UnityEngine;

namespace ScpLife.Runtime
{
    /// <summary>
    /// Keeps the rendered facility cheap and in sync with the simulation:
    ///  • portal-style visibility: only rooms reachable through open doors/windows are rendered;
    ///  • light budget: only the nearest realtime lights in visible rooms are enabled;
    ///  • light flicker / blackout from simulated room state; alarm beacons from the alert level;
    ///  • physical keycards lying in the world.
    /// </summary>
    public sealed class FacilityPresenter : MonoBehaviour
    {
        public int MaxLights = 8;
        public int VisibilityDepth = 3;

        private SimWorld _world;
        private FacilityView _view;
        private MaterialLibrary _m;
        private Material _fixtureOff;
        private readonly HashSet<string> _visible = new HashSet<string>();
        private readonly List<Light> _candidateLights = new List<Light>();
        private readonly Dictionary<string, GameObject> _cardViews = new Dictionary<string, GameObject>();
        private float _visTimer;
        private float _cardTimer;
        private string _extraRoom;

        public HashSet<string> VisibleRooms => _visible;

        public void Init(SimWorld world, FacilityView view, MaterialLibrary m)
        {
            _world = world;
            _view = view;
            _m = m;
            _fixtureOff = m.Colored(new Color(0.35f, 0.35f, 0.33f), 0.3f);
        }

        /// <summary>An additional viewpoint room (the CCTV camera's room) that must be rendered.</summary>
        public void SetExtraViewRoom(string roomId) => _extraRoom = roomId;

        public bool IsRoomVisible(string roomId) => roomId != null && _visible.Contains(roomId);

        public void Tick(Vector3 cameraPos, string playerRoom, float dt)
        {
            _visTimer -= dt;
            if (_visTimer <= 0f)
            {
                _visTimer = 0.1f;
                ComputeVisibility(playerRoom, cameraPos);
                ApplyVisibility();
                ApplyLightBudget(cameraPos);
            }
            ApplyFlicker();
            ApplyAlarm();
            _cardTimer -= dt;
            if (_cardTimer <= 0f)
            {
                _cardTimer = 0.5f;
                SyncCards();
            }
        }

        private void ComputeVisibility(string playerRoom, Vector3 cameraPos)
        {
            _visible.Clear();
            Expand(playerRoom, cameraPos, true);
            if (_extraRoom != null) Expand(_extraRoom, cameraPos, false);
        }

        private void Expand(string startRoom, Vector3 cameraPos, bool preloadNearDoors)
        {
            if (startRoom == null) return;
            var frontier = new List<string> { startRoom };
            _visible.Add(startRoom);
            for (int depth = 0; depth < VisibilityDepth && frontier.Count > 0; depth++)
            {
                var next = new List<string>();
                foreach (string rid in frontier)
                {
                    var room = _world.Facility.GetRoom(rid);
                    foreach (string v in room.VisibleRooms)
                        if (_visible.Add(v)) next.Add(v);
                    foreach (string did in room.DoorIds)
                    {
                        var door = _world.Facility.GetDoor(did);
                        bool seeThrough = door.Kind == DoorKind.Archway || door.Openness > 0.02f;
                        string other = door.OtherSide(rid);
                        if (seeThrough)
                        {
                            if (_visible.Add(other)) next.Add(other);
                        }
                        else if (preloadNearDoors && depth == 0 &&
                                 (door.Position.ToUnity() - cameraPos).sqrMagnitude < 25f)
                        {
                            // Preload the room behind a closed door the player stands next to, so
                            // opening it never reveals an empty void for a frame.
                            _visible.Add(other);
                        }
                    }
                }
                frontier = next;
            }
        }

        private void ApplyVisibility()
        {
            foreach (var kv in _view.Rooms)
            {
                bool vis = _visible.Contains(kv.Key);
                if (kv.Value.Visible == vis) continue;
                kv.Value.Visible = vis;
                kv.Value.Root.SetActive(vis);
            }
        }

        private void ApplyLightBudget(Vector3 cameraPos)
        {
            _candidateLights.Clear();
            foreach (var kv in _view.Rooms)
            {
                var rv = kv.Value;
                if (!rv.Visible) continue;
                bool off = !rv.Room.LightsOn;
                foreach (var l in rv.Lights)
                {
                    if (off)
                    {
                        l.enabled = false;
                        continue;
                    }
                    _candidateLights.Add(l);
                }
            }
            _candidateLights.Sort((a, b) =>
                (a.transform.position - cameraPos).sqrMagnitude.CompareTo((b.transform.position - cameraPos).sqrMagnitude));
            for (int i = 0; i < _candidateLights.Count; i++) _candidateLights[i].enabled = i < MaxLights;
        }

        private void ApplyFlicker()
        {
            double now = _world.Now;
            float t = Time.time;
            foreach (var kv in _view.Rooms)
            {
                var rv = kv.Value;
                if (!rv.Visible) continue;
                bool flicker = rv.Room.IsFlickering(now);
                bool on = rv.Room.LightsOn && (!flicker || Mathf.PerlinNoise(t * 9f, rv.Room.Id.GetHashCode() * 0.01f) > 0.45f);
                foreach (var l in rv.Lights)
                {
                    float target = on ? (rv.Room.Type == RoomType.Containment ? 1.4f : 1.6f) : 0f;
                    l.intensity = target;
                }
                var mat = on ? _m.LightPanel : _fixtureOff;
                foreach (var f in rv.Fixtures)
                    if (f != null && f.sharedMaterial != mat) f.sharedMaterial = mat;
            }
        }

        private void ApplyAlarm()
        {
            bool alarm = _world.Alert.Level >= AlertLevel.Orange;
            float pulse = Mathf.Abs(Mathf.Sin(Time.time * (_world.Alert.Level >= AlertLevel.Red ? 4f : 2f)));
            bool corridorVisible = IsRoomVisible("corridor");
            foreach (var l in _view.AlarmLights)
            {
                l.enabled = alarm && corridorVisible;
                l.intensity = alarm ? pulse * 2.2f : 0f;
            }
            var mat = alarm && pulse > 0.5f ? _m.IndicatorRed : _m.AlarmRed;
            foreach (var b in _view.AlarmBeacons)
                if (b.sharedMaterial != mat) b.sharedMaterial = mat;
        }

        private void SyncCards()
        {
            foreach (var card in _world.Keycards.Values)
            {
                bool shouldShow = card.InWorld && card.WorldRoomId != null;
                bool shown = _cardViews.TryGetValue(card.Id, out var go) && go != null;
                if (shouldShow && !shown)
                {
                    go = new GameObject("Keycard_" + card.Id);
                    go.transform.SetParent(_view.Root, false);
                    go.transform.position = card.WorldPosition.ToUnity() + Vector3.up * 0.015f;
                    go.transform.rotation = Quaternion.Euler(0f, Random.Range(0f, 360f), 0f);
                    PrimitiveMeshes.Part("Card", go.transform, PrimitiveMeshes.Cube, _m.Colored(Conv.LevelColor(card.Level), 0.6f),
                        Vector3.zero, new Vector3(0.086f, 0.005f, 0.054f));
                    PrimitiveMeshes.Part("Stripe", go.transform, PrimitiveMeshes.Cube, _m.Black, new Vector3(0f, 0.003f, 0.015f), new Vector3(0.086f, 0.002f, 0.01f));
                    var col = go.AddComponent<BoxCollider>();
                    col.size = new Vector3(0.3f, 0.12f, 0.3f);
                    go.AddComponent<KeycardPickupInteractable>().CardId = card.Id;
                    _cardViews[card.Id] = go;
                }
                else if (!shouldShow && shown)
                {
                    Destroy(go);
                    _cardViews.Remove(card.Id);
                }
            }
        }
    }
}
