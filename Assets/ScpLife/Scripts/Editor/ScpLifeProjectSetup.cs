using System.IO;
using ScpLife.Runtime;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
#if SCP_URP
using UnityEngine.Rendering.Universal;
#endif

namespace ScpLife.EditorTools
{
    /// <summary>
    /// One-click project configuration (runs automatically once after the project is opened):
    /// URP pipeline assets per quality level, template materials that pull URP shader variants
    /// into player builds, the main scene, build settings and Android player settings.
    /// </summary>
    [InitializeOnLoad]
    public static class ScpLifeProjectSetup
    {
        private const string Root = "Assets/ScpLife";
        private const string SettingsDir = Root + "/Settings";
        private const string MaterialsDir = Root + "/Resources/ScpLife/Materials";
        private const string ScenePath = Root + "/Scenes/Main.unity";
        private const string DoneKey = "ScpLife.SetupDone.v1";

        static ScpLifeProjectSetup()
        {
            EditorApplication.delayCall += () =>
            {
                if (EditorApplication.isPlayingOrWillChangePlaymode) return;
                if (SessionState.GetBool(DoneKey, false)) return;
                SessionState.SetBool(DoneKey, true);
                if (!File.Exists(ScenePath) || GraphicsSettings.defaultRenderPipeline == null) Configure(false);
            };
        }

        [MenuItem("SCP LIFE/1. Настроить проект (URP, сцена, Android)")]
        public static void ConfigureMenu() => Configure(true);

        public static void Configure(bool verbose)
        {
            EnsureFolder(SettingsDir);
            EnsureFolder(MaterialsDir);
            EnsureFolder(Root + "/Scenes");
            EnsureFolder(Root + "/Resources/ScpLife/Data");

            ConfigureRenderPipeline();
            CreateTemplateMaterials();
            CreateMainScene();
            ConfigureBuildSettings();
            ConfigureAndroid();
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            Debug.Log("SCP LIFE: проект настроен. Откройте Assets/ScpLife/Scenes/Main.unity и нажмите Play.");
            if (verbose)
                EditorUtility.DisplayDialog("SCP LIFE", "Проект настроен:\n• URP (3 уровня качества)\n• материалы-шаблоны\n• сцена Main.unity\n• Android: IL2CPP, ARM64, альбомная ориентация", "OK");
        }

        private static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            string parent = Path.GetDirectoryName(path)?.Replace('\\', '/');
            if (!string.IsNullOrEmpty(parent) && !AssetDatabase.IsValidFolder(parent)) EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, Path.GetFileName(path));
        }

        // ------------------------------------------------------------------ URP

        private static void ConfigureRenderPipeline()
        {
#if SCP_URP
            var rendererPath = SettingsDir + "/ScpLife_Renderer.asset";
            var renderer = AssetDatabase.LoadAssetAtPath<UniversalRendererData>(rendererPath);
            if (renderer == null)
            {
                renderer = ScriptableObject.CreateInstance<UniversalRendererData>();
                AssetDatabase.CreateAsset(renderer, rendererPath);
            }

            var low = PipelineAsset("ScpLife_URP_Low", renderer, 0.7f, 1, 4);
            var medium = PipelineAsset("ScpLife_URP_Medium", renderer, 0.85f, 1, 6);
            var high = PipelineAsset("ScpLife_URP_High", renderer, 1.0f, 2, 8);
            GraphicsSettings.defaultRenderPipeline = medium;

            int current = QualitySettings.GetQualityLevel();
            int levels = QualitySettings.names.Length;
            for (int i = 0; i < levels; i++)
            {
                QualitySettings.SetQualityLevel(i, false);
                float t = levels <= 1 ? 1f : (float)i / (levels - 1);
                QualitySettings.renderPipeline = t < 0.34f ? low : t < 0.67f ? medium : high;
                QualitySettings.shadows = ShadowQuality.Disable;
            }
            QualitySettings.SetQualityLevel(Mathf.Clamp(current, 0, Mathf.Max(0, levels - 1)), false);
#else
            Debug.LogWarning("SCP LIFE: пакет URP не найден — игра будет работать на встроенном конвейере (шейдер Standard).");
#endif
        }

#if SCP_URP
        private static UniversalRenderPipelineAsset PipelineAsset(string name, ScriptableRendererData renderer, float renderScale, int msaa, int lights)
        {
            string path = SettingsDir + "/" + name + ".asset";
            var asset = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(path);
            if (asset == null)
            {
                asset = UniversalRenderPipelineAsset.Create(renderer);
                AssetDatabase.CreateAsset(asset, path);
            }
            asset.renderScale = renderScale;
            asset.msaaSampleCount = msaa;
            asset.supportsHDR = false;
            asset.shadowDistance = 0f;
            asset.maxAdditionalLightsCount = lights;
            EditorUtility.SetDirty(asset);
            return asset;
        }
#endif

        // ------------------------------------------------------------------ materials

        private static void CreateTemplateMaterials()
        {
            bool urp = GraphicsSettings.defaultRenderPipeline != null;
            Shader lit = urp ? Shader.Find("Universal Render Pipeline/Lit") : Shader.Find("Standard");
            if (lit == null)
            {
                Debug.LogWarning("SCP LIFE: шейдер Lit не найден, шаблоны материалов не созданы.");
                return;
            }

            var opaque = LoadOrCreate(MaterialsDir + "/LitOpaque.mat", lit);
            opaque.EnableKeyword("_EMISSION");
            opaque.SetColor("_EmissionColor", Color.black);
            opaque.globalIlluminationFlags = MaterialGlobalIlluminationFlags.None;
            EditorUtility.SetDirty(opaque);

            var transparent = LoadOrCreate(MaterialsDir + "/LitTransparent.mat", lit);
            if (transparent.HasProperty("_Surface"))
            {
                transparent.SetFloat("_Surface", 1f);
                transparent.SetFloat("_Blend", 0f);
                transparent.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
                transparent.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
                transparent.SetFloat("_ZWrite", 0f);
                transparent.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            }
            else if (transparent.HasProperty("_Mode"))
            {
                transparent.SetFloat("_Mode", 3f);
                transparent.EnableKeyword("_ALPHABLEND_ON");
            }
            transparent.renderQueue = (int)RenderQueue.Transparent;
            EditorUtility.SetDirty(transparent);

            // An emissive variant so the _EMISSION keyword variant is kept in builds.
            var emissive = LoadOrCreate(MaterialsDir + "/LitEmissive.mat", lit);
            emissive.EnableKeyword("_EMISSION");
            emissive.SetColor("_EmissionColor", Color.white);
            emissive.globalIlluminationFlags = MaterialGlobalIlluminationFlags.None;
            EditorUtility.SetDirty(emissive);
        }

        private static Material LoadOrCreate(string path, Shader shader)
        {
            var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (mat == null)
            {
                mat = new Material(shader);
                AssetDatabase.CreateAsset(mat, path);
            }
            else if (mat.shader != shader)
            {
                mat.shader = shader;
            }
            return mat;
        }

        // ------------------------------------------------------------------ scene & build

        private static void CreateMainScene()
        {
            if (File.Exists(ScenePath)) return;
            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var go = new GameObject("SCP LIFE");
            go.AddComponent<GameBootstrap>();
            EditorSceneManager.SaveScene(scene, ScenePath);
        }

        private static void ConfigureBuildSettings()
        {
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        }

        private static void ConfigureAndroid()
        {
            PlayerSettings.companyName = "SCP LIFE Team";
            PlayerSettings.productName = "SCP LIFE";
            var android = NamedBuildTarget.Android;
            PlayerSettings.SetApplicationIdentifier(android, "com.scplife.game");
            PlayerSettings.SetScriptingBackend(android, ScriptingImplementation.IL2CPP);
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel24;
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.AutoRotation;
            PlayerSettings.allowedAutorotateToLandscapeLeft = true;
            PlayerSettings.allowedAutorotateToLandscapeRight = true;
            PlayerSettings.allowedAutorotateToPortrait = false;
            PlayerSettings.allowedAutorotateToPortraitUpsideDown = false;
            PlayerSettings.colorSpace = ColorSpace.Linear;
            PlayerSettings.SetManagedStrippingLevel(android, ManagedStrippingLevel.Low);
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.Android, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.Android, new[] { GraphicsDeviceType.Vulkan, GraphicsDeviceType.OpenGLES3 });
            PlayerSettings.SetMobileMTRendering(android, true);
        }

        [MenuItem("SCP LIFE/2. Собрать Android APK")]
        public static void BuildAndroid()
        {
            Configure(false);
            Directory.CreateDirectory("Builds/Android");
            var options = new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = "Builds/Android/SCPLife.apk",
                target = BuildTarget.Android,
                options = BuildOptions.None
            };
            var report = BuildPipeline.BuildPlayer(options);
            Debug.Log($"SCP LIFE: сборка Android завершена: {report.summary.result}, {report.summary.totalSize / (1024 * 1024)} МБ, ошибок {report.summary.totalErrors}");
        }

        /// <summary>Entry point for command-line builds: -executeMethod ScpLife.EditorTools.ScpLifeProjectSetup.BuildAndroidBatch</summary>
        public static void BuildAndroidBatch()
        {
            BuildAndroid();
        }

        [MenuItem("SCP LIFE/Открыть папку сохранений")]
        public static void OpenSaveFolder() => EditorUtility.RevealInFinder(Application.persistentDataPath);
    }
}
