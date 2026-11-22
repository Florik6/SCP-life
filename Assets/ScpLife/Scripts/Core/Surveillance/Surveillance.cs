using System;
using System.Collections.Generic;

namespace ScpLife.Core
{
    public sealed class SecurityCamera
    {
        public string Id;
        public string Name;
        public string RoomId;
        public Vec3 Position;
        public float BaseYaw;
        public float Pitch = 25f;
        public float Fov = 75f;
        public float Range = 16f;
        public float SweepAngle = 30f;
        public float SweepPeriod = 14f;
        public bool Operational = true;

        public float CurrentYaw;
        public float Phase;
        public readonly HashSet<string> Visible = new HashSet<string>();

        public bool SeesPoint(Vec3 p)
        {
            Vec3 d = p - Position;
            float dist = d.LengthXZ;
            if (dist > Range) return false;
            if (dist < 1.0f) return true;
            float yawTo = Vec3.YawFromDirection(d);
            return Math.Abs(SimMath.DeltaAngle(CurrentYaw, yawTo)) <= Fov * 0.5f + 8f;
        }

        public JObj Save()
        {
            var o = new JObj();
            o["id"] = Id;
            o["op"] = Operational;
            o["phase"] = Phase;
            return o;
        }

        public void Load(JObj o)
        {
            Operational = o.Bool("op", true);
            Phase = o.F("phase");
        }
    }

    public sealed class CameraSighting
    {
        public double Time;
        public string CameraId;
        public string SubjectId;
        public string SubjectName;
        public string RoomId;
        public bool Flagged;
        public string Note;

        public JObj Save()
        {
            var o = new JObj();
            o["t"] = Time;
            o["cam"] = CameraId;
            o["subj"] = SubjectId;
            o["name"] = SubjectName;
            o["room"] = RoomId;
            o["flag"] = Flagged;
            o["note"] = Note;
            return o;
        }

        public static CameraSighting Load(JObj o) => new CameraSighting
        {
            Time = o.Num("t"),
            CameraId = o.Str("cam"),
            SubjectId = o.Str("subj"),
            SubjectName = o.Str("name"),
            RoomId = o.Str("room"),
            Flagged = o.Bool("flag"),
            Note = o.Str("note")
        };
    }

    /// <summary>
    /// CCTV network. Cameras sweep, record who they see and flag suspicious sightings
    /// (anomaly outside containment, class-D outside their block, people in restricted rooms).
    /// </summary>
    public sealed class SurveillanceSystem
    {
        public const int LogCapacity = 300;
        public readonly List<SecurityCamera> Cameras = new List<SecurityCamera>();
        public readonly List<CameraSighting> Log = new List<CameraSighting>();
        private float _scanTimer;

        public SecurityCamera Get(string id)
        {
            foreach (var c in Cameras)
                if (c.Id == id) return c;
            return null;
        }

        public IEnumerable<SecurityCamera> InRoom(string roomId)
        {
            foreach (var c in Cameras)
                if (c.RoomId == roomId) yield return c;
        }

        public bool RoomCovered(string roomId)
        {
            foreach (var c in Cameras)
                if (c.RoomId == roomId && c.Operational) return true;
            return false;
        }

        public void Tick(SimWorld world, float dt)
        {
            foreach (var cam in Cameras)
            {
                if (!cam.Operational) continue;
                cam.Phase += dt / Math.Max(1f, cam.SweepPeriod);
                if (cam.Phase > 1f) cam.Phase -= 1f;
                cam.CurrentYaw = cam.BaseYaw + (float)Math.Sin(cam.Phase * Math.PI * 2.0) * cam.SweepAngle;
            }

            _scanTimer -= dt;
            if (_scanTimer > 0f) return;
            _scanTimer = 0.5f;

            foreach (var cam in Cameras)
            {
                if (!cam.Operational)
                {
                    cam.Visible.Clear();
                    continue;
                }
                var nowVisible = new HashSet<string>();
                foreach (var subject in world.EnumerateSubjects())
                {
                    if (subject.RoomId != cam.RoomId) continue;
                    if (!cam.SeesPoint(subject.Position)) continue;
                    nowVisible.Add(subject.Id);
                    if (cam.Visible.Contains(subject.Id)) continue;
                    RecordSighting(world, cam, subject);
                }
                cam.Visible.Clear();
                foreach (string id in nowVisible) cam.Visible.Add(id);
            }
        }

        private void RecordSighting(SimWorld world, SecurityCamera cam, SubjectInfo subject)
        {
            var s = new CameraSighting
            {
                Time = world.Now,
                CameraId = cam.Id,
                SubjectId = subject.Id,
                SubjectName = subject.Name,
                RoomId = cam.RoomId
            };

            Room room = world.Facility.GetRoom(cam.RoomId);
            if (subject.IsAnomaly)
            {
                var anomaly = world.GetAnomaly(subject.Id);
                if (anomaly != null && !anomaly.Contained)
                {
                    s.Flagged = true;
                    s.Note = "Аномалия вне камеры содержания";
                    world.Alert.ReportBreachSighting(world, anomaly, cam.RoomId, $"камера {cam.Name}");
                }
            }
            else if (subject.Role == NpcRole.DClass && room != null &&
                     room.Type != RoomType.DClassCell && room.Type != RoomType.DClassCommon &&
                     room.Type != RoomType.MedicalBay)
            {
                s.Flagged = true;
                s.Note = "Класс D вне жилого блока";
                world.Events.Post(new FacilityEvent
                {
                    Time = world.Now,
                    Type = EventType.SuspiciousActivity,
                    RoomId = cam.RoomId,
                    Position = subject.Position,
                    ActorId = subject.Id,
                    Severity = 2,
                    Text = $"Камера {cam.Name}: {subject.Name} вне блока D ({room.Name})"
                });
            }

            Log.Add(s);
            if (Log.Count > LogCapacity) Log.RemoveRange(0, Log.Count - LogCapacity);
        }

        public List<object> Save()
        {
            var list = new List<object>();
            foreach (var c in Cameras) list.Add(c.Save());
            return list;
        }

        public List<object> SaveLog()
        {
            var list = new List<object>();
            int start = Math.Max(0, Log.Count - 120);
            for (int i = start; i < Log.Count; i++) list.Add(Log[i].Save());
            return list;
        }

        public void Load(List<object> cams, List<object> log)
        {
            if (cams != null)
                foreach (object o in cams)
                {
                    if (!(o is Dictionary<string, object> d)) continue;
                    var jo = new JObj(d);
                    Get(jo.Str("id"))?.Load(jo);
                }
            Log.Clear();
            if (log != null)
                foreach (object o in log)
                    if (o is Dictionary<string, object> d)
                        Log.Add(CameraSighting.Load(new JObj(d)));
        }
    }

    /// <summary>Lightweight view of anything that can be perceived (player, NPC, anomaly).</summary>
    public struct SubjectInfo
    {
        public string Id;
        public string Name;
        public Vec3 Position;
        public string RoomId;
        public bool IsAnomaly;
        public bool IsPlayer;
        public NpcRole Role;
    }
}
