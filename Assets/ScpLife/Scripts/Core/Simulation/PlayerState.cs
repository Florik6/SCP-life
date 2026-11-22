using System.Collections.Generic;

namespace ScpLife.Core
{
    /// <summary>The player as seen by the simulation: position, cards, health, duty record.</summary>
    public sealed class PlayerState
    {
        public const string PlayerId = "player";

        public string Name = "Сержант А. Волков";
        public NpcRole Role = NpcRole.Guard;
        public Vec3 Position;
        public float Yaw;
        public float Pitch;
        public string RoomId;
        public float Health = 100f;
        public readonly List<string> CardIds = new List<string>();
        public int SelectedCard;
        public bool FlashlightOn;
        public double StunnedUntil;
        public bool Dead;

        // Counting protocol (SCP-L-001)
        public bool Counting;
        public string CountingTargetId;
        public float CountingSeconds;

        // Duty record
        public int TasksCompleted;
        public int TasksFailed;
        public int Reputation = 50;
        public readonly List<string> Journal = new List<string>();
        public readonly HashSet<string> CamerasViewedThisShift = new HashSet<string>();

        public string SelectedCardId => CardIds.Count == 0 ? null : CardIds[((SelectedCard % CardIds.Count) + CardIds.Count) % CardIds.Count];

        public void AddJournal(string line)
        {
            Journal.Add(line);
            if (Journal.Count > 80) Journal.RemoveAt(0);
        }

        public JObj Save()
        {
            var o = new JObj();
            o["name"] = Name;
            o["role"] = (int)Role;
            o["pos"] = JObj.FromV3(Position);
            o["yaw"] = Yaw;
            o["pitch"] = Pitch;
            o["room"] = RoomId;
            o["health"] = Health;
            o["cards"] = new List<object>(CardIds);
            o["selected"] = SelectedCard;
            o["flashlight"] = FlashlightOn;
            o["dead"] = Dead;
            o["done"] = TasksCompleted;
            o["failed"] = TasksFailed;
            o["rep"] = Reputation;
            o["journal"] = new List<object>(Journal);
            o["cams"] = new List<object>(CamerasViewedThisShift);
            return o;
        }

        public void Load(JObj o)
        {
            Name = o.Str("name", Name);
            Role = (NpcRole)o.Int("role", (int)NpcRole.Guard);
            Position = o.V3("pos", Position);
            Yaw = o.F("yaw");
            Pitch = o.F("pitch");
            RoomId = o.Str("room");
            Health = o.F("health", 100f);
            CardIds.Clear();
            CardIds.AddRange(o.Strings("cards"));
            SelectedCard = o.Int("selected");
            FlashlightOn = o.Bool("flashlight");
            Dead = o.Bool("dead");
            TasksCompleted = o.Int("done");
            TasksFailed = o.Int("failed");
            Reputation = o.Int("rep", 50);
            Journal.Clear();
            Journal.AddRange(o.Strings("journal"));
            CamerasViewedThisShift.Clear();
            foreach (string c in o.Strings("cams")) CamerasViewedThisShift.Add(c);
            Counting = false;
            CountingTargetId = null;
        }
    }
}
