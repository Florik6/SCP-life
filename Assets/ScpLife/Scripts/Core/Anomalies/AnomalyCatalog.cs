using System;
using System.Collections.Generic;
using System.Globalization;

namespace ScpLife.Core
{
    public enum AnomalyKind
    {
        Unknown,
        Sapient,
        Creature,
        Object,
        Phenomenon,
        Biological,
        Location
    }

    /// <summary>
    /// Data describing one anomaly from the catalog (scp_life_120_original_anomalies.json).
    /// The loader accepts several field-name variants (English and Russian keys) because the
    /// catalog is authored outside the code; unknown fields are kept in <see cref="Raw"/>.
    /// </summary>
    public sealed class AnomalyDefinition
    {
        public string Id;
        public string Name;
        public string ObjectClass = "Euclid";
        public AnomalyKind Kind = AnomalyKind.Unknown;
        public string Description = "";
        public string Containment = "";
        public string BehaviourText = "";
        /// <summary>0..1 normalised characteristics.</summary>
        public float Intelligence;
        public float Hostility;
        public float Mobility;
        public float Perception;
        public float Danger;
        public bool HasMemory;
        public readonly List<string> Triggers = new List<string>();
        public readonly List<string> Reactions = new List<string>();
        public readonly List<string> Requirements = new List<string>();
        public readonly List<string> Tags = new List<string>();
        public JObj Raw = new JObj();

        /// <summary>Passive objects never act on their own; only sapient/creature anomalies plan.</summary>
        public bool IsAutonomous => Kind == AnomalyKind.Sapient || Kind == AnomalyKind.Creature || Kind == AnomalyKind.Biological;
        public bool IsSapient => Kind == AnomalyKind.Sapient || Intelligence >= 0.6f;
    }

    public sealed class AnomalyCatalog
    {
        public readonly List<AnomalyDefinition> Entries = new List<AnomalyDefinition>();
        private readonly Dictionary<string, AnomalyDefinition> _byId = new Dictionary<string, AnomalyDefinition>(StringComparer.OrdinalIgnoreCase);
        public readonly List<string> Warnings = new List<string>();

        public int Count => Entries.Count;

        public AnomalyDefinition Get(string id) => id != null && _byId.TryGetValue(id, out var d) ? d : null;

        public void Add(AnomalyDefinition def)
        {
            if (string.IsNullOrEmpty(def.Id))
            {
                Warnings.Add("Пропущена запись без идентификатора");
                return;
            }
            if (_byId.ContainsKey(def.Id))
            {
                Warnings.Add($"Повторный идентификатор {def.Id}: запись заменена");
                Entries.RemoveAll(e => string.Equals(e.Id, def.Id, StringComparison.OrdinalIgnoreCase));
            }
            _byId[def.Id] = def;
            Entries.Add(def);
        }

        /// <summary>Merges entries from a JSON document: either an array or an object holding an array.</summary>
        public int LoadJson(string json)
        {
            object root = Json.Parse(json);
            List<object> items = null;
            if (root is List<object> list) items = list;
            else if (root is Dictionary<string, object> dict)
            {
                foreach (string key in new[] { "anomalies", "scp", "scps", "entries", "items", "catalog", "objects", "аномалии" })
                {
                    if (dict.TryGetValue(key, out object v) && v is List<object> l)
                    {
                        items = l;
                        break;
                    }
                }
                if (items == null)
                {
                    // Fallback: first array-valued property, or a map of id -> entry.
                    foreach (var kv in dict)
                    {
                        if (kv.Value is List<object> l)
                        {
                            items = l;
                            break;
                        }
                    }
                    if (items == null)
                    {
                        items = new List<object>();
                        foreach (var kv in dict)
                        {
                            if (kv.Value is Dictionary<string, object> entry)
                            {
                                if (!entry.ContainsKey("id")) entry["id"] = kv.Key;
                                items.Add(entry);
                            }
                        }
                    }
                }
            }
            if (items == null) throw new FormatException("Каталог аномалий: не найден массив записей");

            int added = 0;
            foreach (object item in items)
            {
                if (!(item is Dictionary<string, object> d)) continue;
                var def = ParseEntry(new JObj(d));
                if (def == null) continue;
                Add(def);
                added++;
            }
            return added;
        }

        public static AnomalyDefinition ParseEntry(JObj o)
        {
            var def = new AnomalyDefinition { Raw = o };
            def.Id = First(o, "id", "scp_id", "scpId", "designation", "code", "number", "номер", "обозначение");
            if (def.Id != null && double.TryParse(def.Id, NumberStyles.Float, CultureInfo.InvariantCulture, out double num))
                def.Id = "SCP-" + ((int)num).ToString("000", CultureInfo.InvariantCulture);
            def.Name = First(o, "name", "title", "nickname", "codename", "название", "имя") ?? def.Id;
            def.ObjectClass = First(o, "object_class", "objectClass", "class", "containment_class", "класс") ?? "Euclid";
            def.Description = First(o, "description", "summary", "short_description", "shortDescription", "описание") ?? "";
            def.Containment = JoinAll(o, "containment_procedures", "containmentProcedures", "containment", "procedures", "условия_содержания", "содержание");
            def.BehaviourText = JoinAll(o, "behavior", "behaviour", "behavior_model", "behaviorModel", "ai", "поведение");

            def.Intelligence = Norm(o, "intelligence", "sapience", "intellect", "интеллект", "разум");
            def.Hostility = Norm(o, "hostility", "aggression", "aggressiveness", "агрессия", "враждебность");
            def.Mobility = Norm(o, "mobility", "speed", "movement", "мобильность", "скорость");
            def.Perception = Norm(o, "perception", "awareness", "восприятие");
            def.Danger = Norm(o, "danger", "threat", "threat_level", "danger_level", "опасность", "угроза");
            def.HasMemory = o.Bool("memory") || o.Bool("has_memory") || o.Bool("hasMemory") || o.Bool("learns");

            def.Triggers.AddRange(StringsAny(o, "triggers", "incident_triggers", "breach_triggers", "триггеры"));
            def.Reactions.AddRange(StringsAny(o, "reactions", "reaction_to_staff", "staff_reactions", "реакции"));
            def.Requirements.AddRange(StringsAny(o, "containment_requirements", "requirements", "требования"));
            def.Tags.AddRange(StringsAny(o, "tags", "теги"));

            def.Kind = DetectKind(o, def);
            return def;
        }

        private static AnomalyKind DetectKind(JObj o, AnomalyDefinition def)
        {
            if (o.Bool("sapient") || o.Bool("is_sapient") || o.Bool("intelligent") || o.Bool("разумный")) return AnomalyKind.Sapient;
            string text = (First(o, "kind", "type", "category", "nature", "тип", "категория") ?? "").ToLowerInvariant();
            foreach (string tag in def.Tags) text += " " + tag.ToLowerInvariant();

            if (ContainsAny(text, "sapient", "разум", "humanoid", "гуманоид", "intelligent", "мыслящ")) return AnomalyKind.Sapient;
            if (ContainsAny(text, "phenomen", "явлен", "spatial", "пространств", "temporal", "временн")) return AnomalyKind.Phenomenon;
            if (ContainsAny(text, "location", "локац", "место", "room", "комнат")) return AnomalyKind.Location;
            if (ContainsAny(text, "biolog", "биолог", "organism", "организм", "plant", "растен")) return AnomalyKind.Biological;
            if (ContainsAny(text, "creature", "существ", "animal", "живот", "entity", "сущност")) return AnomalyKind.Creature;
            if (ContainsAny(text, "object", "предмет", "item", "артефакт", "artifact", "device", "устройств")) return AnomalyKind.Object;

            if (def.Intelligence >= 0.6f) return AnomalyKind.Sapient;
            if (def.Mobility >= 0.3f) return AnomalyKind.Creature;
            return text.Length > 0 ? AnomalyKind.Object : AnomalyKind.Unknown;
        }

        private static bool ContainsAny(string text, params string[] needles)
        {
            foreach (string n in needles)
                if (text.Contains(n)) return true;
            return false;
        }

        private static string First(JObj o, params string[] keys)
        {
            foreach (string k in keys)
            {
                string s = o.Str(k);
                if (!string.IsNullOrWhiteSpace(s)) return s.Trim();
            }
            // Search one level deep in common grouping objects ("stats", "profile", ...).
            foreach (string group in new[] { "stats", "profile", "characteristics", "info", "характеристики" })
            {
                var g = o.Obj(group);
                if (g == null) continue;
                foreach (string k in keys)
                {
                    string s = g.Str(k);
                    if (!string.IsNullOrWhiteSpace(s)) return s.Trim();
                }
            }
            return null;
        }

        private static string JoinAll(JObj o, params string[] keys)
        {
            foreach (string k in keys)
            {
                if (!o.Has(k)) continue;
                var list = o.Strings(k);
                if (list.Count > 0) return string.Join(" ", list);
            }
            return "";
        }

        private static IEnumerable<string> StringsAny(JObj o, params string[] keys)
        {
            foreach (string k in keys)
                if (o.Has(k))
                    return o.Strings(k);
            return Array.Empty<string>();
        }

        /// <summary>Reads a number on any common scale (0..1, 0..10, 0..100) or a word, returns 0..1.</summary>
        private static float Norm(JObj o, params string[] keys)
        {
            JObj source = o;
            foreach (string group in new[] { null, "stats", "characteristics", "profile", "характеристики" })
            {
                source = group == null ? o : o.Obj(group);
                if (source == null) continue;
                foreach (string k in keys)
                {
                    if (!source.Has(k)) continue;
                    object raw = source[k];
                    if (raw is string s && !double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out _))
                        return WordScale(s);
                    double v = source.Num(k);
                    if (v > 10.0) v /= 100.0;
                    else if (v > 1.0) v /= 10.0;
                    return (float)SimMath.Clamp(v, 0.0, 1.0);
                }
            }
            return 0f;
        }

        private static float WordScale(string s)
        {
            s = s.ToLowerInvariant();
            if (ContainsAny(s, "none", "нет", "отсутств")) return 0f;
            if (ContainsAny(s, "very low", "очень низ", "минимал")) return 0.1f;
            if (ContainsAny(s, "very high", "очень выс", "экстрем", "extreme", "критич")) return 0.95f;
            if (ContainsAny(s, "low", "низ", "слаб")) return 0.25f;
            if (ContainsAny(s, "medium", "moderate", "сред", "умерен")) return 0.5f;
            if (ContainsAny(s, "high", "выс", "сильн")) return 0.8f;
            return 0.5f;
        }
    }
}
