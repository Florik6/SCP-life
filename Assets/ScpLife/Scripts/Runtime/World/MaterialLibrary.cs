using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace ScpLife.Runtime
{
    /// <summary>
    /// Creates every material at runtime from procedural textures. Works with URP (preferred) and
    /// falls back to the built-in Standard shader. In player builds the URP shaders are guaranteed
    /// to be included through template materials in Resources/ScpLife/Materials, which the editor
    /// setup script creates (ScpLife ▸ Настроить проект).
    /// </summary>
    public sealed class MaterialLibrary
    {
        public static MaterialLibrary Instance { get; private set; }

        public readonly bool Urp;
        private readonly Material _opaqueTemplate;
        private readonly Material _transparentTemplate;
        private readonly Dictionary<string, Material> _cache = new Dictionary<string, Material>();
        private readonly Dictionary<int, Material> _colorCache = new Dictionary<int, Material>();

        public Material ConcreteFloor, TileFloor, CorridorFloor, WallUpper, WallLower, Ceiling, Stripe, Hazard;
        public Material Metal, DarkMetal, DoorMetal, Fabric, Mattress, Wood, Plastic, Rubber, Glass;
        public Material LightPanel, ScreenGreen, ScreenBlue, IndicatorRed, IndicatorGreen, AlarmRed, ChamberWall, Orange, White, Black;
        public Material TallyDecal;

        public MaterialLibrary()
        {
            Instance = this;
            Urp = GraphicsSettings.currentRenderPipeline != null;
            _opaqueTemplate = Resources.Load<Material>("ScpLife/Materials/LitOpaque");
            _transparentTemplate = Resources.Load<Material>("ScpLife/Materials/LitTransparent");

            ConcreteFloor = Make("ConcreteFloor", ProceduralTextures.Concrete(256, new Color(0.42f, 0.42f, 0.41f), 0.35f, 1), 0.15f);
            TileFloor = Make("TileFloor", ProceduralTextures.Tiles(256, new Color(0.62f, 0.64f, 0.63f), new Color(0.3f, 0.31f, 0.31f), 4, 2), 0.35f);
            CorridorFloor = Make("CorridorFloor", ProceduralTextures.Tiles(256, new Color(0.36f, 0.38f, 0.37f), new Color(0.2f, 0.2f, 0.2f), 2, 3), 0.3f);
            WallUpper = Make("WallUpper", ProceduralTextures.Concrete(128, new Color(0.7f, 0.71f, 0.68f), 0.12f, 4), 0.1f);
            WallLower = Make("WallLower", ProceduralTextures.Concrete(128, new Color(0.32f, 0.36f, 0.36f), 0.18f, 5), 0.2f);
            Ceiling = Make("Ceiling", ProceduralTextures.Concrete(128, new Color(0.3f, 0.3f, 0.31f), 0.25f, 6), 0.05f);
            Stripe = Make("Stripe", ProceduralTextures.Solid(new Color(0.75f, 0.55f, 0.12f)), 0.2f);
            Hazard = Make("Hazard", ProceduralTextures.Stripes(64, new Color(0.9f, 0.72f, 0.08f), new Color(0.08f, 0.08f, 0.08f), 4), 0.25f);
            Metal = Make("Metal", ProceduralTextures.BrushedMetal(128, new Color(0.55f, 0.57f, 0.6f), 7), 0.55f, 0.6f);
            DarkMetal = Make("DarkMetal", ProceduralTextures.BrushedMetal(128, new Color(0.22f, 0.23f, 0.25f), 8), 0.45f, 0.5f);
            DoorMetal = Make("DoorMetal", ProceduralTextures.BrushedMetal(128, new Color(0.38f, 0.42f, 0.46f), 9), 0.5f, 0.55f);
            Fabric = Make("Fabric", ProceduralTextures.Concrete(64, new Color(0.25f, 0.33f, 0.45f), 0.2f, 10), 0.05f);
            Mattress = Make("Mattress", ProceduralTextures.Concrete(64, new Color(0.78f, 0.78f, 0.74f), 0.15f, 11), 0.05f);
            Wood = Make("Wood", ProceduralTextures.BrushedMetal(64, new Color(0.45f, 0.33f, 0.22f), 12), 0.2f);
            Plastic = Make("Plastic", ProceduralTextures.Solid(new Color(0.82f, 0.82f, 0.8f)), 0.45f);
            Rubber = Make("Rubber", ProceduralTextures.Solid(new Color(0.08f, 0.08f, 0.09f)), 0.1f);
            Orange = Make("Orange", ProceduralTextures.Solid(new Color(0.95f, 0.45f, 0.08f)), 0.2f);
            White = Make("White", ProceduralTextures.Solid(new Color(0.9f, 0.9f, 0.88f)), 0.3f);
            Black = Make("Black", ProceduralTextures.Solid(new Color(0.03f, 0.03f, 0.035f)), 0.3f);
            ChamberWall = Make("ChamberWall", ProceduralTextures.Concrete(256, new Color(0.5f, 0.5f, 0.52f), 0.4f, 13), 0.08f);
            Glass = MakeTransparent("Glass", new Color(0.55f, 0.7f, 0.8f, 0.22f));

            LightPanel = MakeEmissive("LightPanel", new Color(0.95f, 0.95f, 0.9f), new Color(1.6f, 1.55f, 1.4f));
            ScreenGreen = MakeEmissive("ScreenGreen", ProceduralTextures.Screen(128, new Color(0.3f, 1f, 0.5f), 14), new Color(0.35f, 0.9f, 0.5f));
            ScreenBlue = MakeEmissive("ScreenBlue", ProceduralTextures.Screen(128, new Color(0.4f, 0.7f, 1f), 15), new Color(0.35f, 0.6f, 0.95f));
            IndicatorRed = MakeEmissive("IndicatorRed", new Color(0.8f, 0.1f, 0.1f), new Color(2f, 0.15f, 0.1f));
            IndicatorGreen = MakeEmissive("IndicatorGreen", new Color(0.1f, 0.8f, 0.2f), new Color(0.2f, 2f, 0.4f));
            AlarmRed = MakeEmissive("AlarmRed", new Color(0.6f, 0.05f, 0.05f), new Color(0.6f, 0.02f, 0.02f));

            TallyDecal = MakeTransparent("TallyDecal", Color.white);
        }

        private Material NewMaterial(bool transparent)
        {
            if (transparent && _transparentTemplate != null) return new Material(_transparentTemplate);
            if (!transparent && _opaqueTemplate != null) return new Material(_opaqueTemplate);
            Shader shader = Urp ? Shader.Find("Universal Render Pipeline/Lit") : null;
            if (shader == null) shader = Shader.Find("Standard");
            if (shader == null) shader = Shader.Find("Universal Render Pipeline/Simple Lit");
            if (shader == null) shader = Shader.Find("Unlit/Texture");
            var m = new Material(shader);
            if (transparent) ConfigureTransparent(m);
            return m;
        }

        private static void ConfigureTransparent(Material m)
        {
            if (m.HasProperty("_Surface"))
            {
                m.SetFloat("_Surface", 1f);
                m.SetFloat("_Blend", 0f);
                m.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
                m.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
                m.SetFloat("_ZWrite", 0f);
                m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            }
            else if (m.HasProperty("_Mode"))
            {
                m.SetFloat("_Mode", 3f);
                m.SetInt("_SrcBlend", (int)BlendMode.SrcAlpha);
                m.SetInt("_DstBlend", (int)BlendMode.OneMinusSrcAlpha);
                m.SetInt("_ZWrite", 0);
                m.DisableKeyword("_ALPHATEST_ON");
                m.EnableKeyword("_ALPHABLEND_ON");
                m.DisableKeyword("_ALPHAPREMULTIPLY_ON");
            }
            m.renderQueue = (int)RenderQueue.Transparent;
        }

        private static void SetSmoothness(Material m, float smoothness, float metallic)
        {
            if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", smoothness);
            if (m.HasProperty("_Glossiness")) m.SetFloat("_Glossiness", smoothness);
            if (m.HasProperty("_Metallic")) m.SetFloat("_Metallic", metallic);
        }

        public Material Make(string name, Texture2D texture, float smoothness, float metallic = 0f)
        {
            var m = NewMaterial(false);
            m.name = name;
            m.color = Color.white;
            m.mainTexture = texture;
            SetSmoothness(m, smoothness, metallic);
            m.enableInstancing = true;
            _cache[name] = m;
            return m;
        }

        public Material MakeEmissive(string name, Color albedo, Color emission)
        {
            var m = Make(name, ProceduralTextures.Solid(albedo), 0.5f);
            EnableEmission(m, emission, null);
            return m;
        }

        public Material MakeEmissive(string name, Texture2D texture, Color emission)
        {
            var m = Make(name, texture, 0.6f);
            EnableEmission(m, emission, texture);
            return m;
        }

        public static void EnableEmission(Material m, Color emission, Texture2D map)
        {
            m.EnableKeyword("_EMISSION");
            if (m.HasProperty("_EmissionColor")) m.SetColor("_EmissionColor", emission);
            if (map != null && m.HasProperty("_EmissionMap")) m.SetTexture("_EmissionMap", map);
            m.globalIlluminationFlags = MaterialGlobalIlluminationFlags.None;
        }

        public Material MakeTransparent(string name, Color color)
        {
            var m = NewMaterial(true);
            m.name = name;
            m.color = color;
            SetSmoothness(m, 0.9f, 0f);
            _cache[name] = m;
            return m;
        }

        /// <summary>Flat-coloured material, cached per colour (used for characters and small props).</summary>
        public Material Colored(Color c, float smoothness = 0.25f)
        {
            int key = ((int)(c.r * 255) << 24) ^ ((int)(c.g * 255) << 16) ^ ((int)(c.b * 255) << 8) ^ (int)(smoothness * 100);
            if (_colorCache.TryGetValue(key, out var m)) return m;
            m = NewMaterial(false);
            m.name = "Color_" + ColorUtility.ToHtmlStringRGB(c);
            m.color = c;
            m.mainTexture = Texture2D.whiteTexture;
            SetSmoothness(m, smoothness, 0f);
            m.enableInstancing = true;
            _colorCache[key] = m;
            return m;
        }

        public Material Get(string name) => _cache.TryGetValue(name, out var m) ? m : null;
    }
}
