using System;

namespace ScpLife.Core
{
    /// <summary>
    /// Facility time. Stored as total game minutes since day 1, 00:00.
    /// </summary>
    public sealed class GameClock
    {
        public const double MinutesPerDay = 1440.0;

        /// <summary>Game minutes since the beginning of day 1.</summary>
        public double TotalMinutes;

        /// <summary>How many game minutes pass per real second (0.5 → one game day lasts 48 real minutes).</summary>
        public float MinutesPerRealSecond = 0.5f;

        public GameClock(double startTotalMinutes)
        {
            TotalMinutes = startTotalMinutes;
        }

        public int Day => (int)(TotalMinutes / MinutesPerDay) + 1;
        public double MinuteOfDay => TotalMinutes % MinutesPerDay;
        public int Hour => (int)(MinuteOfDay / 60.0);
        public int Minute => (int)(MinuteOfDay % 60.0);
        public int HourBucket => Hour;

        /// <summary>Advances by real seconds, returns elapsed game minutes.</summary>
        public double Advance(double realSeconds)
        {
            double minutes = realSeconds * MinutesPerRealSecond;
            TotalMinutes += minutes;
            return minutes;
        }

        public void SkipMinutes(double minutes)
        {
            if (minutes > 0) TotalMinutes += minutes;
        }

        public string TimeString => FormatTime(TotalMinutes);

        public static string FormatTime(double totalMinutes)
        {
            double mod = totalMinutes % MinutesPerDay;
            if (mod < 0) mod += MinutesPerDay;
            int h = (int)(mod / 60.0);
            int m = (int)(mod % 60.0);
            return $"{h:00}:{m:00}";
        }

        public static string FormatStamp(double totalMinutes)
        {
            int day = (int)(totalMinutes / MinutesPerDay) + 1;
            return $"Д{day} {FormatTime(totalMinutes)}";
        }

        /// <summary>True if minuteOfDay is inside [start, end), supporting ranges that wrap past midnight.</summary>
        public static bool InRange(double minuteOfDay, int start, int end)
        {
            if (start == end) return true;
            if (start < end) return minuteOfDay >= start && minuteOfDay < end;
            return minuteOfDay >= start || minuteOfDay < end;
        }

        public static int Hm(int hour, int minute = 0) => hour * 60 + minute;

        /// <summary>Game minutes from now until minuteOfDay `target` (0..1440).</summary>
        public double MinutesUntil(int targetMinuteOfDay)
        {
            double diff = targetMinuteOfDay - MinuteOfDay;
            if (diff < 0) diff += MinutesPerDay;
            return diff;
        }

        public static string DurationText(double minutes)
        {
            if (minutes < 60) return $"{Math.Max(0, (int)minutes)} мин";
            int h = (int)(minutes / 60);
            int m = (int)(minutes % 60);
            return m == 0 ? $"{h} ч" : $"{h} ч {m} мин";
        }
    }
}
