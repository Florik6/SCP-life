using System;
using System.Collections.Generic;

namespace ScpLife.Core
{
    public enum EventType
    {
        DoorAccess,
        DoorDenied,
        AnomalyBehaviour,
        ContainmentWarning,
        ContainmentBreach,
        Recontained,
        Injury,
        Conversation,
        Conflict,
        AlertChanged,
        PatrolCheckpoint,
        CameraSighting,
        TaskIssued,
        TaskCompleted,
        TaskFailed,
        ReaderMalfunction,
        LightFlicker,
        Announcement,
        Observation,
        CountingProtocol,
        Report,
        Treatment,
        SuspiciousActivity
    }

    public sealed class FacilityEvent
    {
        public long Id;
        public double Time;
        public EventType Type;
        public string RoomId;
        public Vec3 Position;
        public string ActorId;
        public string TargetId;
        /// <summary>0 = routine, 1 = notable, 2 = serious, 3 = critical.</summary>
        public int Severity;
        public string Text;
        /// <summary>Broadcast over PA: everyone learns about it, not only witnesses.</summary>
        public bool Public;

        public JObj Save()
        {
            var o = new JObj();
            o["id"] = Id;
            o["t"] = Time;
            o["type"] = (int)Type;
            o["room"] = RoomId;
            o["pos"] = JObj.FromV3(Position);
            o["actor"] = ActorId;
            o["target"] = TargetId;
            o["sev"] = Severity;
            o["text"] = Text;
            o["public"] = Public;
            return o;
        }

        public static FacilityEvent Load(JObj o) => new FacilityEvent
        {
            Id = o.Long("id"),
            Time = o.Num("t"),
            Type = (EventType)o.Int("type"),
            RoomId = o.Str("room"),
            Position = o.V3("pos", Vec3.Zero),
            ActorId = o.Str("actor"),
            TargetId = o.Str("target"),
            Severity = o.Int("sev"),
            Text = o.Str("text"),
            Public = o.Bool("public")
        };
    }

    public sealed class EventLog
    {
        public const int Capacity = 300;
        public readonly List<FacilityEvent> Recent = new List<FacilityEvent>();
        public long NextId = 1;

        /// <summary>Raised for every new event. The simulation distributes it to witnesses.</summary>
        public event Action<FacilityEvent> Posted;

        public FacilityEvent Post(FacilityEvent e)
        {
            e.Id = NextId++;
            Recent.Add(e);
            if (Recent.Count > Capacity) Recent.RemoveRange(0, Recent.Count - Capacity);
            Posted?.Invoke(e);
            return e;
        }

        public IEnumerable<FacilityEvent> Since(double time)
        {
            foreach (var e in Recent)
                if (e.Time >= time) yield return e;
        }
    }

    public static class EventText
    {
        public static string TypeName(EventType t)
        {
            switch (t)
            {
                case EventType.DoorAccess: return "Проход";
                case EventType.DoorDenied: return "Отказ доступа";
                case EventType.AnomalyBehaviour: return "Поведение аномалии";
                case EventType.ContainmentWarning: return "Угроза содержанию";
                case EventType.ContainmentBreach: return "НАРУШЕНИЕ УСЛОВИЙ СОДЕРЖАНИЯ";
                case EventType.Recontained: return "Повторное содержание";
                case EventType.Injury: return "Травма";
                case EventType.Conversation: return "Разговор";
                case EventType.Conflict: return "Конфликт";
                case EventType.AlertChanged: return "Уровень тревоги";
                case EventType.PatrolCheckpoint: return "Контрольная точка";
                case EventType.CameraSighting: return "Камера";
                case EventType.TaskIssued: return "Новая задача";
                case EventType.TaskCompleted: return "Задача выполнена";
                case EventType.TaskFailed: return "Задача провалена";
                case EventType.ReaderMalfunction: return "Сбой считывателя";
                case EventType.LightFlicker: return "Сбой освещения";
                case EventType.Announcement: return "Оповещение";
                case EventType.Observation: return "Наблюдение";
                case EventType.CountingProtocol: return "Протокол счёта";
                case EventType.Report: return "Рапорт";
                case EventType.Treatment: return "Медпомощь";
                case EventType.SuspiciousActivity: return "Подозрительная активность";
                default: return t.ToString();
            }
        }
    }
}
