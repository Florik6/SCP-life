using System;
using System.Globalization;

namespace ScpLife.Core
{
    /// <summary>
    /// Engine-independent 3D vector used by the simulation core.
    /// Y is up, matching Unity's coordinate system.
    /// </summary>
    [Serializable]
    public struct Vec3 : IEquatable<Vec3>
    {
        public float X;
        public float Y;
        public float Z;

        public static readonly Vec3 Zero = new Vec3(0f, 0f, 0f);
        public static readonly Vec3 Forward = new Vec3(0f, 0f, 1f);

        public Vec3(float x, float y, float z)
        {
            X = x;
            Y = y;
            Z = z;
        }

        public float Length => (float)Math.Sqrt(X * X + Y * Y + Z * Z);
        public float LengthSq => X * X + Y * Y + Z * Z;
        public float LengthXZ => (float)Math.Sqrt(X * X + Z * Z);

        public Vec3 Normalized
        {
            get
            {
                float len = Length;
                return len > 1e-6f ? new Vec3(X / len, Y / len, Z / len) : Zero;
            }
        }

        public Vec3 FlatXZ => new Vec3(X, 0f, Z);

        public static Vec3 operator +(Vec3 a, Vec3 b) => new Vec3(a.X + b.X, a.Y + b.Y, a.Z + b.Z);
        public static Vec3 operator -(Vec3 a, Vec3 b) => new Vec3(a.X - b.X, a.Y - b.Y, a.Z - b.Z);
        public static Vec3 operator -(Vec3 a) => new Vec3(-a.X, -a.Y, -a.Z);
        public static Vec3 operator *(Vec3 a, float s) => new Vec3(a.X * s, a.Y * s, a.Z * s);
        public static Vec3 operator *(float s, Vec3 a) => new Vec3(a.X * s, a.Y * s, a.Z * s);
        public static Vec3 operator /(Vec3 a, float s) => new Vec3(a.X / s, a.Y / s, a.Z / s);
        public static bool operator ==(Vec3 a, Vec3 b) => a.Equals(b);
        public static bool operator !=(Vec3 a, Vec3 b) => !a.Equals(b);

        public static float Dot(Vec3 a, Vec3 b) => a.X * b.X + a.Y * b.Y + a.Z * b.Z;
        public static float Distance(Vec3 a, Vec3 b) => (a - b).Length;

        public static float DistanceXZ(Vec3 a, Vec3 b)
        {
            float dx = a.X - b.X;
            float dz = a.Z - b.Z;
            return (float)Math.Sqrt(dx * dx + dz * dz);
        }

        public static Vec3 Lerp(Vec3 a, Vec3 b, float t)
        {
            if (t < 0f) t = 0f;
            else if (t > 1f) t = 1f;
            return new Vec3(a.X + (b.X - a.X) * t, a.Y + (b.Y - a.Y) * t, a.Z + (b.Z - a.Z) * t);
        }

        /// <summary>Yaw in degrees (0 = +Z, 90 = +X), same convention as Unity's Euler Y.</summary>
        public static float YawFromDirection(Vec3 dir)
        {
            if (Math.Abs(dir.X) < 1e-6f && Math.Abs(dir.Z) < 1e-6f) return 0f;
            return (float)(Math.Atan2(dir.X, dir.Z) * 180.0 / Math.PI);
        }

        public static Vec3 DirectionFromYaw(float yawDegrees)
        {
            double r = yawDegrees * Math.PI / 180.0;
            return new Vec3((float)Math.Sin(r), 0f, (float)Math.Cos(r));
        }

        public bool Equals(Vec3 other) => X == other.X && Y == other.Y && Z == other.Z;
        public override bool Equals(object obj) => obj is Vec3 v && Equals(v);

        public override int GetHashCode()
        {
            unchecked
            {
                int h = X.GetHashCode();
                h = (h * 397) ^ Y.GetHashCode();
                h = (h * 397) ^ Z.GetHashCode();
                return h;
            }
        }

        public override string ToString() =>
            string.Format(CultureInfo.InvariantCulture, "({0:0.##}, {1:0.##}, {2:0.##})", X, Y, Z);
    }

    public static class SimMath
    {
        public static float Clamp(float v, float min, float max) => v < min ? min : (v > max ? max : v);
        public static double Clamp(double v, double min, double max) => v < min ? min : (v > max ? max : v);
        public static float Clamp01(float v) => v < 0f ? 0f : (v > 1f ? 1f : v);
        public static float Lerp(float a, float b, float t) => a + (b - a) * Clamp01(t);

        public static float MoveTowards(float current, float target, float maxDelta)
        {
            if (Math.Abs(target - current) <= maxDelta) return target;
            return current + Math.Sign(target - current) * maxDelta;
        }

        /// <summary>Shortest signed difference between two angles in degrees, in range [-180, 180].</summary>
        public static float DeltaAngle(float from, float to)
        {
            float d = (to - from) % 360f;
            if (d > 180f) d -= 360f;
            if (d < -180f) d += 360f;
            return d;
        }

        public static float MoveTowardsAngle(float current, float target, float maxDelta)
        {
            float delta = DeltaAngle(current, target);
            if (Math.Abs(delta) <= maxDelta) return target;
            return current + Math.Sign(delta) * maxDelta;
        }
    }
}
