using System;
using System.Collections.Generic;

namespace ScpLife.Core
{
    /// <summary>
    /// Serialises the complete facility state. Static content (layout, schedules) is rebuilt from
    /// code; everything that changes during play is written out, including the random generator
    /// state, so a loaded game continues exactly where it stopped.
    /// </summary>
    public static class WorldSerializer
    {
        public static string Save(SimWorld w, bool pretty = false)
        {
            var root = new JObj();
            root["version"] = SimWorld.SaveVersion;
            root["content"] = "stage1";
            root["clock"] = w.Clock.TotalMinutes;
            root["timeScale"] = w.Clock.MinutesPerRealSecond;
            root["rng"] = w.Rng.State.ToString(System.Globalization.CultureInfo.InvariantCulture);
            root["realTime"] = w.RealTime;

            var events = new List<object>();
            foreach (var e in w.Events.Recent) events.Add(e.Save());
            root["events"] = events;
            root["nextEventId"] = w.Events.NextId;

            var access = new List<object>();
            foreach (var a in w.AccessLog.Entries) access.Add(a.Save());
            root["accessLog"] = access;

            var cards = new List<object>();
            foreach (var c in w.Keycards.Values) cards.Add(c.Save());
            root["keycards"] = cards;

            var doors = new List<object>();
            foreach (var d in w.Facility.DoorList) doors.Add(d.Save());
            root["doors"] = doors;

            var rooms = new List<object>();
            foreach (var r in w.Facility.RoomList)
            {
                var ro = new JObj();
                ro["id"] = r.Id;
                ro["lights"] = r.LightsOn;
                ro["flicker"] = r.FlickerUntil;
                rooms.Add(ro);
            }
            root["rooms"] = rooms;

            var npcs = new List<object>();
            foreach (var n in w.Npcs) npcs.Add(n.Save());
            root["npcs"] = npcs;

            var anomalies = new List<object>();
            foreach (var a in w.Anomalies) anomalies.Add(a.Save());
            root["anomalies"] = anomalies;

            root["cameras"] = w.Surveillance.Save();
            root["cameraLog"] = w.Surveillance.SaveLog();
            root["alert"] = w.Alert.Save();
            root["tasks"] = w.Tasks.Save();
            root["nextTaskId"] = w.Tasks.NextId;
            root["dispatcher"] = w.Dispatcher.Save();
            root["player"] = w.Player.Save();
            return Json.Serialize(root, pretty);
        }

        /// <summary>Rebuilds a world from a save. Throws FormatException for unreadable/incompatible data.</summary>
        public static SimWorld Load(string json, string catalogJson = null)
        {
            JObj root = Json.ParseObject(json);
            int version = root.Int("version", -1);
            if (version != SimWorld.SaveVersion)
                throw new FormatException($"Несовместимая версия сохранения: {version} (ожидалась {SimWorld.SaveVersion})");

            var w = Stage1Content.CreateWorld(1, catalogJson);
            w.Clock.TotalMinutes = root.Num("clock", Stage1Content.StartTime);
            w.Clock.MinutesPerRealSecond = root.F("timeScale", 0.5f);
            if (ulong.TryParse(root.Str("rng"), System.Globalization.NumberStyles.Integer, System.Globalization.CultureInfo.InvariantCulture, out ulong rng))
                w.Rng.State = rng;
            w.RealTime = root.F("realTime");

            w.Events.Recent.Clear();
            foreach (var e in root.Objects("events")) w.Events.Recent.Add(FacilityEvent.Load(e));
            w.Events.NextId = Math.Max(1, root.Long("nextEventId", 1));

            w.AccessLog.Entries.Clear();
            foreach (var a in root.Objects("accessLog")) w.AccessLog.Entries.Add(AccessLogEntry.Load(a));

            w.Keycards.Clear();
            foreach (var c in root.Objects("keycards"))
            {
                var card = Keycard.Load(c);
                if (!string.IsNullOrEmpty(card.Id)) w.Keycards[card.Id] = card;
            }

            foreach (var d in root.Objects("doors"))
                w.Facility.GetDoor(d.Str("id"))?.Load(d);

            foreach (var r in root.Objects("rooms"))
            {
                var room = w.Facility.GetRoom(r.Str("id"));
                if (room == null) continue;
                room.LightsOn = r.Bool("lights", true);
                room.FlickerUntil = r.Num("flicker");
            }

            foreach (var poi in w.Facility.Pois.Values) poi.ReservedBy = null;
            foreach (var n in root.Objects("npcs"))
                w.GetNpc(n.Str("id"))?.Load(n);

            foreach (var a in root.Objects("anomalies"))
                w.GetAnomaly(a.Str("id"))?.Load(a);

            w.Surveillance.Load(root.Arr("cameras"), root.Arr("cameraLog"));
            var alert = root.Obj("alert");
            if (alert != null) w.Alert.Load(w, alert);
            w.Tasks.Load(root.Arr("tasks"), root.Int("nextTaskId", 1));
            w.Dispatcher.Load(root.Obj("dispatcher"));
            var player = root.Obj("player");
            if (player != null) w.Player.Load(player);
            return w;
        }
    }
}
