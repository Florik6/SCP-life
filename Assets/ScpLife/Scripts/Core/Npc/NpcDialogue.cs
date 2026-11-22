using System;
using System.Collections.Generic;

namespace ScpLife.Core
{
    public struct ConversationResult
    {
        public string OpeningLine;
        public string ReplyLine;
        public string FollowUpLine;
        public bool Conflict;
    }

    /// <summary>
    /// Generates NPC speech from their actual state: activity, needs, relations and memories.
    /// Rumours spread through these conversations, so knowledge travels person to person.
    /// </summary>
    public static class NpcDialogue
    {
        public static ConversationResult Converse(SimWorld w, Npc a, Npc b)
        {
            double now = w.Now;
            var result = new ConversationResult();

            float avgStress = (a.Needs.Stress + b.Needs.Stress) * 0.5f;
            float avgTemper = (a.Traits.Temper + b.Traits.Temper) * 0.5f;
            float relation = (a.RelationTo(b.Id) + b.RelationTo(a.Id)) * 0.5f;
            double conflictChance = 0.0;
            if (relation < 5f && avgStress > 45f) conflictChance = 0.15 + avgTemper * 0.5 + (avgStress - 45f) / 150f;
            // Open hostility can flare up even on a calm day.
            if (relation < -20f) conflictChance = Math.Max(conflictChance, 0.1 + avgTemper * 0.3);
            if (relation < -30f) conflictChance += 0.2;

            if (w.Rng.Chance(conflictChance))
            {
                result.Conflict = true;
                result.OpeningLine = Pick(w, a.Role == NpcRole.DClass
                    ? new[] { "Чего уставился? Отвали.", "Это моё место, понял?", "Ещё раз тронешь мои вещи — пожалеешь." }
                    : new[] { "Опять ты за своё? Хватит.", "Мне надоело за тебя отдуваться.", "Не указывай мне, как работать." });
                result.ReplyLine = Pick(w, b.Role == NpcRole.DClass
                    ? new[] { "Сам отвали!", "Ты кому это сказал?", "Посмотрим, кто пожалеет." }
                    : new[] { "Это я-то? На себя посмотри.", "Поговорим об этом у начальства.", "Не начинай." });
                a.AdjustRelation(b.Id, -12f);
                b.AdjustRelation(a.Id, -12f);
                a.Needs.Stress += 10f;
                b.Needs.Stress += 10f;
                a.Needs.Clamp();
                b.Needs.Clamp();
                return result;
            }

            // Exchange the most interesting thing each knows that the other doesn't.
            var gossipA = a.Memory.BestGossip(now, m => !b.Memory.Knows(m.EventId) && m.SubjectId != b.Id);
            var gossipB = b.Memory.BestGossip(now, m => !a.Memory.Knows(m.EventId) && m.SubjectId != a.Id);

            if (gossipA != null)
            {
                result.OpeningLine = GossipLine(w, a, gossipA);
                ShareMemory(w, a, b, gossipA);
            }
            else
            {
                result.OpeningLine = SmallTalk(w, a, b);
            }

            if (gossipB != null)
            {
                result.ReplyLine = GossipLine(w, b, gossipB);
                ShareMemory(w, b, a, gossipB);
            }
            else
            {
                result.ReplyLine = Reaction(w, b, gossipA);
            }

            if (gossipA != null && gossipA.Severity() >= 2 && w.Rng.Chance(0.5))
                result.FollowUpLine = a.Role == NpcRole.DClass ? "Нас тут всех когда-нибудь пустят в расход." : "Надеюсь, СБ разберётся.";

            float gain = 2f + a.Traits.Sociability * 2f + b.Traits.Sociability * 2f;
            a.AdjustRelation(b.Id, gain);
            b.AdjustRelation(a.Id, gain);
            return result;
        }

        private static int Severity(this MemoryEntry m)
        {
            switch (m.Type)
            {
                case EventType.ContainmentBreach:
                case EventType.Injury:
                    return 3;
                case EventType.ContainmentWarning:
                case EventType.Conflict:
                case EventType.AlertChanged:
                case EventType.SuspiciousActivity:
                    return 2;
                default:
                    return 1;
            }
        }

        private static void ShareMemory(SimWorld w, Npc speaker, Npc listener, MemoryEntry m)
        {
            m.Shared = true;
            listener.Memory.Remember(new MemoryEntry
            {
                EventId = m.EventId,
                Time = m.Time,
                Type = m.Type,
                RoomId = m.RoomId,
                SubjectId = m.SubjectId,
                Text = m.Text,
                Importance = m.Importance * 0.85f,
                Confidence = m.Confidence * 0.8f,
                Source = MemorySource.HeardFrom,
                ToldBy = speaker.Id
            }, w.Now);
            if (m.Type == EventType.AnomalyBehaviour || m.Type == EventType.ContainmentWarning)
            {
                // Rumours update what the listener believes about the anomaly, but keep the original time.
                float estimate = m.Type == EventType.ContainmentWarning ? 75f : 55f;
                if (m.Time > listener.KnownAnomalyThreatTime)
                {
                    listener.KnownAnomalyThreat = estimate;
                    listener.KnownAnomalyThreatTime = m.Time;
                }
            }
        }

        private static string GossipLine(SimWorld w, Npc speaker, MemoryEntry m)
        {
            string when = GameClock.FormatTime(m.Time);
            string text = Shorten(m.Text);
            switch (m.Source)
            {
                case MemorySource.Witnessed:
                    return $"{speaker.G("Я сам видел", "Я сама видела")} в {when}: {text}";
                case MemorySource.HeardFrom:
                    var teller = w.GetNpc(m.ToldBy);
                    return teller != null ? $"{teller.ShortName} говорит: {text}" : $"Говорят: {text}";
                case MemorySource.Announcement:
                    return $"Слышал{speaker.G("", "а")} оповещение в {when}? {text}";
                default:
                    return $"По камерам видно: {text}";
            }
        }

        private static string Shorten(string s)
        {
            if (string.IsNullOrEmpty(s)) return "что-то странное";
            return s.Length > 110 ? s.Substring(0, 107) + "…" : s;
        }

        private static string Reaction(SimWorld w, Npc listener, MemoryEntry heard)
        {
            if (heard == null) return SmallTalkReply(w, listener);
            switch (heard.Severity())
            {
                case 3: return Pick(w, new[] { "Чёрт… Кто пострадал?", "Я так и знал" + listener.G("", "а") + ", что этим кончится.", "Мне это совсем не нравится." });
                case 2: return Pick(w, new[] { "Серьёзно? Надо быть осторожнее.", "Опять? Уже не первый раз.", "Лучше не говорить об этом громко." });
                default: return Pick(w, new[] { "Ну и дела.", "Хм, буду иметь в виду.", "Интересно." });
            }
        }

        private static string SmallTalk(SimWorld w, Npc a, Npc b)
        {
            if (a.Needs.Energy < 25f) return "Я с ног валюсь. Скорее бы отбой.";
            if (a.Needs.Hunger > 70f) return "Когда уже раздача? Есть хочется.";
            if (a.Needs.Stress > 60f) return "Нервы ни к чёрту в последнее время.";
            switch (a.Role)
            {
                case NpcRole.DClass:
                    return Pick(w, new[] { "Слышал, через месяц обещают перевод. Врут, конечно.", "Опять эта баланда.", "Сколько тебе ещё сидеть?", "Ночью опять что-то скреблось за стеной." });
                case NpcRole.Scientist:
                    return Pick(w, new[] { "Счётчик сегодня сделал на стене новую серию отметок.", "Я дописываю отчёт по сеансам счёта.", "Гипотеза о ритме подтверждается — он реагирует на распорядок.", "Кофе в лаборатории опять кончился." });
                case NpcRole.Guard:
                    return Pick(w, new[] { "На посту всё тихо.", "Камера К-04 снова мутит изображение.", "Начальник смены опять менял маршруты.", "Говорят, в восточном крыле меняют замки." });
                case NpcRole.Technician:
                    return Pick(w, new[] { "Генератор гудит громче обычного.", "Половина ламп в коридоре на последнем издыхании.", "Заявок сегодня — как никогда." });
                case NpcRole.Medic:
                    return Pick(w, new[] { "У D-класса опять жалобы на бессонницу.", "Запасы перевязки пора пополнять.", "Вы спите хоть иногда?" });
                default:
                    return "Как смена?";
            }
        }

        private static string SmallTalkReply(SimWorld w, Npc b)
        {
            if (b.Needs.Stress > 60f) return "Да уж… Держимся.";
            return Pick(w, new[] { "Угу.", "И не говори.", "Бывает.", "Ладно, не будем о грустном.", "Точно." });
        }

        private static string Pick(SimWorld w, string[] options) => options[w.Rng.Range(0, options.Length)];

        /// <summary>Conversation with the player character.</summary>
        public static List<string> Talk(SimWorld w, Npc npc)
        {
            double now = w.Now;
            var lines = new List<string>();
            float rel = npc.RelationTo(PlayerState.PlayerId);

            if (npc.IsIncapacitated(now))
            {
                lines.Add($"{npc.DisplayName} без сознания. Дыхание есть.");
                return lines;
            }

            string greeting;
            if (npc.Role == NpcRole.DClass)
                greeting = rel < -20f ? "Чего надо, начальник?" : "Здравствуйте, гражданин начальник.";
            else if (rel > 30f)
                greeting = $"А, {ShortPlayerName(w)}! Рад{npc.G("", "а")} видеть.";
            else
                greeting = Pick(w, new[] { "Слушаю.", "Да?", "Что-то случилось?" });
            lines.Add($"{npc.DisplayName}: {greeting}");

            // What am I doing and until when.
            var block = npc.Schedule.At(w.Clock.MinuteOfDay);
            string activity = string.IsNullOrEmpty(npc.ActivityLabel) ? NpcText.ActivityName(npc.Activity) : npc.ActivityLabel;
            if (block != null && block.Activity == npc.Activity)
                lines.Add($"«Сейчас у меня {activity.ToLowerInvariant()}, по графику до {GameClock.FormatTime(block.End)}.»");
            else
                lines.Add($"«Сейчас: {activity.ToLowerInvariant()}.»");

            // Something I know that the player might not.
            var gossip = npc.Memory.BestGossip(now, m => m.SubjectId != PlayerState.PlayerId);
            if (gossip != null)
            {
                lines.Add("«" + GossipLine(w, npc, gossip) + "»");
                gossip.Shared = true;
                w.Player.AddJournal($"[{GameClock.FormatStamp(now)}] {npc.ShortName}: {Shorten(gossip.Text)}");
            }
            else
            {
                lines.Add("«Ничего особенного не слышал" + npc.G("", "а") + ".»");
            }

            // Role-specific knowledge.
            if (npc.Role == NpcRole.Scientist && npc.KnownAnomalyThreatTime >= 0)
            {
                string age = GameClock.DurationText(now - npc.KnownAnomalyThreatTime);
                string state = npc.KnownAnomalyThreat < 30 ? "спокоен" : npc.KnownAnomalyThreat < 55 ? "насторожен" : npc.KnownAnomalyThreat < 75 ? "возбуждён" : "крайне возбуждён";
                lines.Add($"«Когда я видел{npc.G("", "а")} SCP-L-001 ({age} назад), он был {state}.»");
            }

            // Needs complaints.
            if (npc.Needs.Hunger > 70f) lines.Add("«Ещё бы поесть успеть…»");
            else if (npc.Needs.Energy < 25f) lines.Add("«Я почти не спал" + npc.G("", "а") + ".»");
            else if (npc.Needs.Stress > 65f) lines.Add("«Честно — мне здесь страшно.»");

            // Relationship with the player shifts a little on contact (at most once per hour).
            npc.AdjustRelation(PlayerState.PlayerId, 1.5f);
            return lines;
        }

        private static string ShortPlayerName(SimWorld w)
        {
            string[] parts = w.Player.Name.Split(' ');
            return parts.Length > 0 ? parts[parts.Length - 1] : w.Player.Name;
        }
    }

    /// <summary>Russian number words for the counting protocol.</summary>
    public static class NumberWords
    {
        private static readonly string[] Units =
        {
            "ноль", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять",
            "десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать",
            "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"
        };

        private static readonly string[] Tens =
        {
            "", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"
        };

        public static string ToWords(int n)
        {
            if (n < 0) return "минус " + ToWords(-n);
            if (n < 20) return Units[n];
            if (n < 100) return Tens[n / 10] + (n % 10 != 0 ? " " + Units[n % 10] : "");
            if (n == 100) return "сто";
            return n.ToString();
        }

        public static string Capitalized(int n)
        {
            string s = ToWords(n);
            return s.Length == 0 ? s : char.ToUpperInvariant(s[0]) + s.Substring(1);
        }
    }
}
