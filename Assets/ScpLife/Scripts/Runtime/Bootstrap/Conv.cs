using ScpLife.Core;
using UnityEngine;

namespace ScpLife.Runtime
{
    /// <summary>Conversions between the engine-independent core types and Unity types.</summary>
    public static class Conv
    {
        public static Vector3 ToUnity(this Vec3 v) => new Vector3(v.X, v.Y, v.Z);
        public static Vec3 ToCore(this Vector3 v) => new Vec3(v.x, v.y, v.z);

        public static Quaternion YawRotation(float yawDegrees) => Quaternion.Euler(0f, yawDegrees, 0f);

        public static Color Hex(string hex)
        {
            return ColorUtility.TryParseHtmlString(hex, out Color c) ? c : Color.magenta;
        }

        public static Color AlertColor(AlertLevel level)
        {
            switch (level)
            {
                case AlertLevel.Green: return new Color(0.35f, 0.85f, 0.45f);
                case AlertLevel.Yellow: return new Color(0.95f, 0.85f, 0.25f);
                case AlertLevel.Orange: return new Color(1f, 0.55f, 0.15f);
                default: return new Color(1f, 0.2f, 0.2f);
            }
        }

        public static Color LevelColor(AccessLevel level)
        {
            switch (level)
            {
                case AccessLevel.L0: return new Color(0.95f, 0.5f, 0.1f);
                case AccessLevel.L1: return new Color(0.75f, 0.75f, 0.75f);
                case AccessLevel.L2: return new Color(0.25f, 0.55f, 0.95f);
                case AccessLevel.L3: return new Color(0.3f, 0.8f, 0.4f);
                case AccessLevel.L4: return new Color(0.9f, 0.75f, 0.2f);
                default: return new Color(0.85f, 0.2f, 0.25f);
            }
        }
    }
}
