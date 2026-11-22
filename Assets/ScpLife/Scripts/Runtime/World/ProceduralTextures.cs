using UnityEngine;

namespace ScpLife.Runtime
{
    /// <summary>
    /// All textures are generated at runtime: no third-party art is used.
    /// Sizes are small (64–256 px) to stay cheap on mobile GPUs.
    /// </summary>
    public static class ProceduralTextures
    {
        private static float Hash(int x, int y, int seed)
        {
            unchecked
            {
                int h = x * 374761393 + y * 668265263 + seed * 1442695041;
                h = (h ^ (h >> 13)) * 1274126177;
                return ((h ^ (h >> 16)) & 0xffff) / 65535f;
            }
        }

        private static Texture2D NewTexture(int size, string name, bool repeat = true)
        {
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, true)
            {
                name = name,
                wrapMode = repeat ? TextureWrapMode.Repeat : TextureWrapMode.Clamp,
                filterMode = FilterMode.Bilinear,
                anisoLevel = 1
            };
            return tex;
        }

        /// <summary>Tileable value noise in [0,1].</summary>
        private static float TileNoise(float x, float y, int period, int seed)
        {
            int x0 = Mathf.FloorToInt(x), y0 = Mathf.FloorToInt(y);
            float fx = x - x0, fy = y - y0;
            fx = fx * fx * (3f - 2f * fx);
            fy = fy * fy * (3f - 2f * fy);
            int ax = ((x0 % period) + period) % period, bx = (ax + 1) % period;
            int ay = ((y0 % period) + period) % period, by = (ay + 1) % period;
            float a = Hash(ax, ay, seed), b = Hash(bx, ay, seed), c = Hash(ax, by, seed), d = Hash(bx, by, seed);
            return Mathf.Lerp(Mathf.Lerp(a, b, fx), Mathf.Lerp(c, d, fx), fy);
        }

        private static float Fbm(float u, float v, int seed)
        {
            float sum = 0f, amp = 0.5f;
            int period = 4;
            for (int o = 0; o < 4; o++)
            {
                sum += TileNoise(u * period, v * period, period, seed + o) * amp;
                amp *= 0.5f;
                period *= 2;
            }
            return sum;
        }

        public static Texture2D Concrete(int size, Color baseColor, float variation, int seed)
        {
            var tex = NewTexture(size, "Concrete");
            var px = new Color[size * size];
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float u = (float)x / size, v = (float)y / size;
                    float n = Fbm(u, v, seed);
                    float speck = Hash(x, y, seed + 99) > 0.985f ? -0.12f : 0f;
                    float k = 1f + (n - 0.5f) * variation + speck;
                    px[y * size + x] = new Color(baseColor.r * k, baseColor.g * k, baseColor.b * k, 1f);
                }
            tex.SetPixels(px);
            tex.Apply(true, true);
            return tex;
        }

        public static Texture2D Tiles(int size, Color tile, Color grout, int tilesPerSide, int seed)
        {
            var tex = NewTexture(size, "Tiles");
            var px = new Color[size * size];
            int cell = size / tilesPerSide;
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    bool line = x % cell < 2 || y % cell < 2;
                    float n = Fbm((float)x / size, (float)y / size, seed);
                    float tint = 1f + (Hash(x / cell, y / cell, seed) - 0.5f) * 0.08f + (n - 0.5f) * 0.1f;
                    Color c = line ? grout : tile * tint;
                    c.a = 1f;
                    px[y * size + x] = c;
                }
            tex.SetPixels(px);
            tex.Apply(true, true);
            return tex;
        }

        public static Texture2D Stripes(int size, Color a, Color b, int stripes)
        {
            var tex = NewTexture(size, "Hazard");
            var px = new Color[size * size];
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    int band = ((x + y) * stripes / size) % 2;
                    float wear = Hash(x, y, 7) > 0.97f ? 0.75f : 1f;
                    Color c = (band == 0 ? a : b) * wear;
                    c.a = 1f;
                    px[y * size + x] = c;
                }
            tex.SetPixels(px);
            tex.Apply(true, true);
            return tex;
        }

        public static Texture2D BrushedMetal(int size, Color baseColor, int seed)
        {
            var tex = NewTexture(size, "Metal");
            var px = new Color[size * size];
            for (int y = 0; y < size; y++)
            {
                float row = (Hash(0, y, seed) - 0.5f) * 0.12f;
                for (int x = 0; x < size; x++)
                {
                    float k = 1f + row + (Hash(x, y, seed + 3) - 0.5f) * 0.05f;
                    px[y * size + x] = new Color(baseColor.r * k, baseColor.g * k, baseColor.b * k, 1f);
                }
            }
            tex.SetPixels(px);
            tex.Apply(true, true);
            return tex;
        }

        /// <summary>Monitor screen: dark with scanlines and a few text-like bars.</summary>
        public static Texture2D Screen(int size, Color glow, int seed)
        {
            var tex = NewTexture(size, "Screen", false);
            var px = new Color[size * size];
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float scan = (y % 3 == 0) ? 0.55f : 1f;
                    int row = y / 6;
                    bool text = x > 6 && x < size - 6 && y > 6 && y < size - 6 && (row % 2 == 0) &&
                                x < 10 + Hash(row, 0, seed) * (size - 20) && Hash(x / 3, row, seed) > 0.25f;
                    float v = text ? 0.9f : 0.08f;
                    px[y * size + x] = new Color(glow.r * v * scan, glow.g * v * scan, glow.b * v * scan, 1f);
                }
            tex.SetPixels(px);
            tex.Apply(true, true);
            return tex;
        }

        public static Texture2D Solid(Color c)
        {
            var tex = new Texture2D(4, 4, TextureFormat.RGBA32, false) { name = "Solid" };
            var px = new Color[16];
            for (int i = 0; i < 16; i++) px[i] = c;
            tex.SetPixels(px);
            tex.Apply(false, true);
            return tex;
        }

        /// <summary>Radial soft dot used for UI joystick and lamp glows.</summary>
        public static Texture2D Circle(int size, bool ring)
        {
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false) { name = "Circle", wrapMode = TextureWrapMode.Clamp };
            var px = new Color[size * size];
            float r = size * 0.5f;
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float d = Mathf.Sqrt((x - r + 0.5f) * (x - r + 0.5f) + (y - r + 0.5f) * (y - r + 0.5f)) / r;
                    float a = ring ? Mathf.Clamp01(1f - Mathf.Abs(d - 0.9f) * 12f) : Mathf.Clamp01((1f - d) * 6f);
                    px[y * size + x] = new Color(1f, 1f, 1f, a);
                }
            tex.SetPixels(px);
            tex.Apply(false, true);
            return tex;
        }

        public static Texture2D Scanlines(int height)
        {
            var tex = new Texture2D(1, height, TextureFormat.RGBA32, false) { name = "Scanlines", wrapMode = TextureWrapMode.Repeat };
            for (int y = 0; y < height; y++) tex.SetPixel(0, y, new Color(0f, 0f, 0f, y % 2 == 0 ? 0.28f : 0f));
            tex.Apply(false, true);
            return tex;
        }

        // ------------------------------------------------------------------ tally marks

        /// <summary>
        /// Wall of scratched tally marks (groups of four strokes crossed by a fifth). Optionally adds a
        /// separate group with a 7-segment style time stamp near one edge (what SCP-L-001 has learned).
        /// </summary>
        public static Texture2D TallyWall(int width, int height, int count, string learnedTime, int learnedCount, Texture2D reuse = null)
        {
            var tex = reuse;
            if (tex == null || tex.width != width || tex.height != height)
                tex = new Texture2D(width, height, TextureFormat.RGBA32, false) { name = "Tally", wrapMode = TextureWrapMode.Clamp };
            var px = new Color32[width * height];
            for (int i = 0; i < px.Length; i++) px[i] = new Color32(0, 0, 0, 0);

            var scratch = new Color32(225, 220, 205, 220);
            int groups = Mathf.Min(count / 5, 900);
            const int gw = 22, gh = 26;
            int cols = Mathf.Max(1, (width - (learnedTime != null ? 120 : 0)) / gw);
            for (int g = 0; g < groups; g++)
            {
                int cx = (g % cols) * gw + 4;
                int cy = height - 6 - (g / cols + 1) * gh;
                if (cy < 2) break;
                int jitter = (int)(Hash(g, 1, 5) * 4f);
                for (int s = 0; s < 4; s++) Line(px, width, height, cx + s * 4, cy + jitter, cx + s * 4 + 1, cy + gh - 6 + jitter, scratch);
                Line(px, width, height, cx - 2, cy + 4 + jitter, cx + 15, cy + gh - 10 + jitter, scratch);
            }
            int rest = count % 5;
            if (groups < 900)
            {
                int g = groups;
                int cx = (g % cols) * gw + 4;
                int cy = height - 6 - (g / cols + 1) * gh;
                if (cy >= 2)
                    for (int s = 0; s < rest; s++) Line(px, width, height, cx + s * 4, cy, cx + s * 4 + 1, cy + gh - 6, scratch);
            }

            if (learnedTime != null)
            {
                var deep = new Color32(240, 236, 220, 255);
                int x0 = width - 112;
                int y0 = height / 2;
                DrawSevenSegment(px, width, height, learnedTime, x0, y0, 14, 24, deep);
                for (int s = 0; s < Mathf.Min(learnedCount, 10); s++)
                    Line(px, width, height, x0 + s * 9, y0 - 40, x0 + s * 9 + 2, y0 - 12, deep);
            }

            tex.SetPixels32(px);
            tex.Apply(false, false);
            return tex;
        }

        private static void Line(Color32[] px, int w, int h, int x0, int y0, int x1, int y1, Color32 c)
        {
            int dx = Mathf.Abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
            int dy = -Mathf.Abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
            int err = dx + dy;
            int guard = 0;
            while (guard++ < 4096)
            {
                for (int ox = 0; ox < 2; ox++)
                {
                    int px0 = x0 + ox;
                    if (px0 >= 0 && px0 < w && y0 >= 0 && y0 < h) px[y0 * w + px0] = c;
                }
                if (x0 == x1 && y0 == y1) break;
                int e2 = 2 * err;
                if (e2 >= dy) { err += dy; x0 += sx; }
                if (e2 <= dx) { err += dx; y0 += sy; }
            }
        }

        // Segments: a(top) b(top-right) c(bottom-right) d(bottom) e(bottom-left) f(top-left) g(middle)
        private static readonly string[] Digits =
        {
            "abcdef", "bc", "abdeg", "abcdg", "bcfg", "acdfg", "acdefg", "abc", "abcdefg", "abcdfg"
        };

        private static void DrawSevenSegment(Color32[] px, int w, int h, string text, int x, int y, int cw, int ch, Color32 c)
        {
            int cursor = x;
            foreach (char ch0 in text)
            {
                if (ch0 == ':')
                {
                    Line(px, w, h, cursor + 2, y + ch / 3, cursor + 3, y + ch / 3 + 1, c);
                    Line(px, w, h, cursor + 2, y + 2 * ch / 3, cursor + 3, y + 2 * ch / 3 + 1, c);
                    cursor += 8;
                    continue;
                }
                int digit = ch0 - '0';
                if (digit < 0 || digit > 9)
                {
                    cursor += cw / 2;
                    continue;
                }
                string seg = Digits[digit];
                int top = y + ch, mid = y + ch / 2, bot = y;
                if (seg.IndexOf('a') >= 0) Line(px, w, h, cursor, top, cursor + cw, top, c);
                if (seg.IndexOf('b') >= 0) Line(px, w, h, cursor + cw, top, cursor + cw, mid, c);
                if (seg.IndexOf('c') >= 0) Line(px, w, h, cursor + cw, mid, cursor + cw, bot, c);
                if (seg.IndexOf('d') >= 0) Line(px, w, h, cursor, bot, cursor + cw, bot, c);
                if (seg.IndexOf('e') >= 0) Line(px, w, h, cursor, mid, cursor, bot, c);
                if (seg.IndexOf('f') >= 0) Line(px, w, h, cursor, top, cursor, mid, c);
                if (seg.IndexOf('g') >= 0) Line(px, w, h, cursor, mid, cursor + cw, mid, c);
                cursor += cw + 6;
            }
        }
    }
}
