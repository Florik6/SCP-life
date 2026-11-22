using System;
using System.Collections.Generic;

namespace ScpLife.Core
{
    public enum MemorySource
    {
        Witnessed,
        HeardFrom,
        Announcement,
        Camera
    }

    /// <summary>
    /// One thing an agent knows. Agents only know what they witnessed, saw on camera,
    /// heard over PA, or were told by someone — so knowledge is partial and can be outdated.
    /// </summary>
    public sealed class MemoryEntry
    {
        public long EventId;
        public double Time;
        public EventType Type;
        public string RoomId;
        public string SubjectId;
        public string Text;
        public float Importance;
        public float Confidence;
        public MemorySource Source;
        public string ToldBy;
        public bool Shared;

        public JObj Save()
        {
            var o = new JObj();
            o["e"] = EventId;
            o["t"] = Time;
            o["type"] = (int)Type;
            o["room"] = RoomId;
            o["subj"] = SubjectId;
            o["text"] = Text;
            o["imp"] = Importance;
            o["conf"] = Confidence;
            o["src"] = (int)Source;
            o["by"] = ToldBy;
            o["shared"] = Shared;
            return o;
        }

        public static MemoryEntry Load(JObj o) => new MemoryEntry
        {
            EventId = o.Long("e"),
            Time = o.Num("t"),
            Type = (EventType)o.Int("type"),
            RoomId = o.Str("room"),
            SubjectId = o.Str("subj"),
            Text = o.Str("text"),
            Importance = o.F("imp"),
            Confidence = o.F("conf", 1f),
            Source = (MemorySource)o.Int("src"),
            ToldBy = o.Str("by"),
            Shared = o.Bool("shared")
        };
    }

    public sealed class NpcMemory
    {
        public int Capacity = 40;
        public readonly List<MemoryEntry> Entries = new List<MemoryEntry>();

        /// <summary>Salience decays with age; important events (breaches, injuries) are remembered for days.</summary>
        public static float Salience(MemoryEntry m, double now)
        {
            double ageHours = Math.Max(0.0, (now - m.Time) / 60.0);
            double halfLife = 4.0 + m.Importance * 30.0;
            return (float)(m.Importance * m.Confidence * Math.Pow(0.5, ageHours / halfLife));
        }

        public bool Knows(long eventId)
        {
            if (eventId <= 0) return false;
            foreach (var m in Entries)
                if (m.EventId == eventId) return true;
            return false;
        }

        /// <summary>Adds a memory unless the event is already known (keeps the most confident version).</summary>
        public bool Remember(MemoryEntry entry, double now)
        {
            if (entry.EventId > 0)
            {
                foreach (var m in Entries)
                {
                    if (m.EventId != entry.EventId) continue;
                    if (entry.Confidence > m.Confidence)
                    {
                        m.Confidence = entry.Confidence;
                        m.Source = entry.Source;
                    }
                    return false;
                }
            }
            Entries.Add(entry);
            if (Entries.Count > Capacity) Forget(now);
            return true;
        }

        private void Forget(double now)
        {
            int worst = -1;
            float worstScore = float.MaxValue;
            for (int i = 0; i < Entries.Count; i++)
            {
                float s = Salience(Entries[i], now);
                if (s < worstScore)
                {
                    worstScore = s;
                    worst = i;
                }
            }
            if (worst >= 0) Entries.RemoveAt(worst);
        }

        /// <summary>Most salient memory not yet shared with others, suitable as a conversation topic.</summary>
        public MemoryEntry BestGossip(double now, Func<MemoryEntry, bool> filter = null)
        {
            MemoryEntry best = null;
            float bestScore = 0.08f;
            foreach (var m in Entries)
            {
                if (filter != null && !filter(m)) continue;
                float s = Salience(m, now) * (m.Shared ? 0.35f : 1f);
                if (s > bestScore)
                {
                    bestScore = s;
                    best = m;
                }
            }
            return best;
        }

        public MemoryEntry Latest(Func<MemoryEntry, bool> filter)
        {
            for (int i = Entries.Count - 1; i >= 0; i--)
                if (filter(Entries[i])) return Entries[i];
            return null;
        }

        public List<object> Save()
        {
            var list = new List<object>();
            foreach (var m in Entries) list.Add(m.Save());
            return list;
        }

        public void Load(List<object> list)
        {
            Entries.Clear();
            if (list == null) return;
            foreach (object o in list)
                if (o is Dictionary<string, object> d) Entries.Add(MemoryEntry.Load(new JObj(d)));
        }
    }
}
