using ScpLife.Core;

namespace ScpLife.Tests
{
    internal static class TestUtil
    {
        public static SimWorld NewWorld(ulong seed = 12345) => Stage1Content.CreateWorld(seed);

        /// <summary>Advances the world by game minutes using the fixed simulation step.</summary>
        public static void Run(SimWorld w, double gameMinutes)
        {
            double target = w.Now + gameMinutes;
            int guard = 0;
            while (w.Now < target && guard++ < 2_000_000) w.Tick(SimWorld.FixedStep);
        }

        /// <summary>Runs until the given minute of day is reached (on the current or next day).</summary>
        public static void RunUntil(SimWorld w, int hour, int minute = 0)
        {
            double mins = w.Clock.MinutesUntil(GameClock.Hm(hour, minute));
            Run(w, mins);
        }

        /// <summary>Parks the player somewhere neutral so they don't disturb NPCs or the anomaly.</summary>
        public static void ParkPlayer(SimWorld w)
        {
            w.UpdatePlayerTransform(new Vec3(-24.5f, 0f, -8.5f), 0f, 0f);
            w.Player.RoomId = "post";
        }

        public static Keycard Card(string id, string owner, AccessLevel level, Permission perms)
        {
            return new Keycard { Id = id, OwnerId = owner, OwnerName = owner, Level = level, Permissions = perms, HolderId = owner };
        }
    }
}
