using System.Collections.Generic;

namespace ScpLife.Core
{
    public enum AlertLevel
    {
        Green = 0,
        Yellow = 1,
        Orange = 2,
        Red = 3
    }

    /// <summary>
    /// Facility alert state and the automatic measures tied to it (cell lockdown, announcements).
    /// The alert only rises because of concrete detected events, never on a timer.
    /// </summary>
    public sealed class AlertSystem
    {
        public AlertLevel Level = AlertLevel.Green;
        public string Reason = "Штатный режим";
        public string RoomId;
        public double ChangedAt;
        public string BreachAnomalyId;
        /// <summary>Last room where a breached anomaly was confirmed (public knowledge).</summary>
        public string LastKnownAnomalyRoom;
        public double LastKnownAnomalyTime;

        public static string LevelName(AlertLevel l)
        {
            switch (l)
            {
                case AlertLevel.Green: return "ЗЕЛЁНЫЙ";
                case AlertLevel.Yellow: return "ЖЁЛТЫЙ";
                case AlertLevel.Orange: return "ОРАНЖЕВЫЙ";
                case AlertLevel.Red: return "КРАСНЫЙ";
                default: return l.ToString();
            }
        }

        public void Raise(SimWorld world, AlertLevel level, string reason, string roomId)
        {
            if (level <= Level) return;
            Set(world, level, reason, roomId);
        }

        public void Lower(SimWorld world, AlertLevel level, string reason)
        {
            if (level >= Level) return;
            Set(world, level, reason, RoomId);
        }

        private void Set(SimWorld world, AlertLevel level, string reason, string roomId)
        {
            AlertLevel previous = Level;
            Level = level;
            Reason = reason;
            RoomId = roomId;
            ChangedAt = world.Now;
            ApplyMeasures(world, previous);
            Room room = world.Facility.GetRoom(roomId);
            if (room != null && room.Type == RoomType.Containment && level > previous)
            {
                // An official PA announcement: everyone now knows the object is agitated.
                float estimate = level >= AlertLevel.Red ? 100f : level == AlertLevel.Orange ? 80f : 55f;
                foreach (var npc in world.Npcs)
                {
                    if (npc.KnownAnomalyThreatTime > world.Now - 0.01 && npc.KnownAnomalyThreat >= estimate) continue;
                    npc.KnownAnomalyThreat = estimate;
                    npc.KnownAnomalyThreatTime = world.Now;
                }
            }
            world.Events.Post(new FacilityEvent
            {
                Time = world.Now,
                Type = EventType.AlertChanged,
                RoomId = roomId,
                Severity = level >= AlertLevel.Orange ? 3 : 1,
                Public = true,
                Text = $"Уровень тревоги {LevelName(level)}: {reason}" + (room != null ? $" ({room.Name})" : "")
            });
        }

        private void ApplyMeasures(SimWorld world, AlertLevel previous)
        {
            bool lockdown = Level >= AlertLevel.Red;
            bool wasLockdown = previous >= AlertLevel.Red;
            if (lockdown == wasLockdown) return;
            foreach (var door in world.Facility.DoorList)
            {
                Room a = world.Facility.GetRoom(door.RoomA);
                Room b = world.Facility.GetRoom(door.RoomB);
                bool dBlock = a.Type == RoomType.DClassCommon || b.Type == RoomType.DClassCommon;
                if (!dBlock) continue;
                // Class-D block is sealed during a breach; L4+ can still override.
                door.Lockdown = lockdown;
                if (lockdown) door.CommandClose();
            }
        }

        /// <summary>Called by cameras or witnesses who actually see a breached anomaly.</summary>
        public void ReportBreachSighting(SimWorld world, AnomalyInstance anomaly, string roomId, string source)
        {
            LastKnownAnomalyRoom = roomId;
            LastKnownAnomalyTime = world.Now;
            BreachAnomalyId = anomaly.Id;
            if (!anomaly.BreachDetected)
            {
                anomaly.BreachDetected = true;
                Room room = world.Facility.GetRoom(roomId);
                world.Events.Post(new FacilityEvent
                {
                    Time = world.Now,
                    Type = EventType.ContainmentBreach,
                    RoomId = roomId,
                    Position = anomaly.Agent.Position,
                    ActorId = anomaly.Id,
                    Severity = 3,
                    Public = true,
                    Text = $"ВНИМАНИЕ! Нарушение условий содержания {anomaly.DisplayName}. Обнаружено: {source}, {room?.Name}. " +
                           "Персоналу укрыться, охране — протокол счёта."
                });
            }
            Raise(world, AlertLevel.Red, $"Нарушение содержания {anomaly.Id}", roomId);
        }

        public JObj Save()
        {
            var o = new JObj();
            o["level"] = (int)Level;
            o["reason"] = Reason;
            o["room"] = RoomId;
            o["changed"] = ChangedAt;
            o["breach"] = BreachAnomalyId;
            o["lastRoom"] = LastKnownAnomalyRoom;
            o["lastTime"] = LastKnownAnomalyTime;
            return o;
        }

        public void Load(SimWorld world, JObj o)
        {
            var level = (AlertLevel)o.Int("level");
            Reason = o.Str("reason", Reason);
            RoomId = o.Str("room");
            ChangedAt = o.Num("changed");
            BreachAnomalyId = o.Str("breach");
            LastKnownAnomalyRoom = o.Str("lastRoom");
            LastKnownAnomalyTime = o.Num("lastTime");
            Level = level;
        }
    }
}
