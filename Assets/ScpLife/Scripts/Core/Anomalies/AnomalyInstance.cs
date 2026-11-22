using System.Collections.Generic;

namespace ScpLife.Core
{
    /// <summary>Visual hint for the presentation layer; the simulation never depends on it.</summary>
    public enum AnomalyPose
    {
        Idle,
        Scratching,
        Watching,
        Tapping,
        Probing,
        Waiting,
        Walking,
        Attacking,
        Slowed
    }

    public abstract class AnomalyBehaviour
    {
        public AnomalyInstance Owner;

        /// <summary>Short status for terminals/observation, written as the staff would describe it.</summary>
        public abstract string StatusText { get; }

        /// <summary>0..100 threat indicator shown on containment monitors.</summary>
        public abstract float ThreatLevel { get; }

        public virtual void Initialize(SimWorld world) { }
        public abstract void Tick(SimWorld world, float dt, double gameMinutes);
        public virtual void OnEvent(SimWorld world, FacilityEvent e) { }

        /// <summary>Detailed observation result when someone studies the anomaly through a window/camera.</summary>
        public abstract string Observe(SimWorld world, string observerId);

        public abstract JObj Save();
        public abstract void Load(JObj o);
    }

    public sealed class AnomalyInstance
    {
        public string Id;
        public AnomalyDefinition Definition;
        public string ContainmentRoomId;
        public readonly NavAgent Agent = new NavAgent();
        public AnomalyBehaviour Behaviour;
        public bool Contained = true;
        public AnomalyPose Pose = AnomalyPose.Idle;
        /// <summary>Who the anomaly is looking at (for head tracking in views).</summary>
        public string LookAtId;
        public double BreachStartedAt = -1;
        public bool BreachDetected;

        public string Name => Definition?.Name ?? Id;
        public string DisplayName => $"{Id} «{Name}»";

        public JObj Save()
        {
            var o = new JObj();
            o["id"] = Id;
            o["agent"] = Agent.Save();
            o["contained"] = Contained;
            o["pose"] = (int)Pose;
            o["look"] = LookAtId;
            o["breachAt"] = BreachStartedAt;
            o["detected"] = BreachDetected;
            o["behaviour"] = Behaviour?.Save();
            return o;
        }

        public void Load(JObj o)
        {
            Agent.Load(o.Obj("agent"));
            Contained = o.Bool("contained", true);
            Pose = (AnomalyPose)o.Int("pose");
            LookAtId = o.Str("look");
            BreachStartedAt = o.Num("breachAt", -1);
            BreachDetected = o.Bool("detected");
            var b = o.Obj("behaviour");
            if (b != null) Behaviour?.Load(b);
        }
    }

    /// <summary>Maps catalog ids to behaviour implementations.</summary>
    public static class AnomalyBehaviourRegistry
    {
        private static readonly Dictionary<string, System.Func<AnomalyBehaviour>> Factories =
            new Dictionary<string, System.Func<AnomalyBehaviour>>(System.StringComparer.OrdinalIgnoreCase)
            {
                { TallymanBehaviour.AnomalyId, () => new TallymanBehaviour() }
            };

        public static bool HasBehaviour(string id) => id != null && Factories.ContainsKey(id);

        public static AnomalyBehaviour Create(string id) => Factories.TryGetValue(id, out var f) ? f() : null;

        public static IEnumerable<string> ImplementedIds => Factories.Keys;
    }
}
