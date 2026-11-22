using System;
using System.Collections.Generic;

namespace ScpLife.Core
{
    /// <summary>
    /// Deterministic, serializable PRNG (xorshift64*). The whole simulation uses one
    /// instance so that a saved game continues with the same random stream.
    /// </summary>
    public sealed class SimRandom
    {
        private ulong _state;

        public SimRandom(ulong seed)
        {
            _state = seed == 0 ? 0x9E3779B97F4A7C15UL : seed;
        }

        public ulong State
        {
            get => _state;
            set => _state = value == 0 ? 0x9E3779B97F4A7C15UL : value;
        }

        public ulong NextULong()
        {
            ulong x = _state;
            x ^= x >> 12;
            x ^= x << 25;
            x ^= x >> 27;
            _state = x;
            return x * 0x2545F4914F6CDD1DUL;
        }

        /// <summary>Uniform double in [0, 1).</summary>
        public double NextDouble() => (NextULong() >> 11) * (1.0 / 9007199254740992.0);

        public float NextFloat() => (float)NextDouble();

        /// <summary>Integer in [minInclusive, maxExclusive).</summary>
        public int Range(int minInclusive, int maxExclusive)
        {
            if (maxExclusive <= minInclusive) return minInclusive;
            return minInclusive + (int)(NextULong() % (ulong)(maxExclusive - minInclusive));
        }

        public float Range(float min, float max) => min + (max - min) * NextFloat();

        public bool Chance(double probability) => NextDouble() < probability;

        public T Pick<T>(IList<T> list)
        {
            if (list == null || list.Count == 0) throw new ArgumentException("Cannot pick from an empty list");
            return list[Range(0, list.Count)];
        }
    }
}
