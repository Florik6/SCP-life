// Compile-only stubs: rendering, physics, audio, UI and editor APIs used by SCP LIFE.
#pragma warning disable
using System;
using System.Collections.Generic;

namespace UnityEngine.Rendering
{
    public enum BlendMode { Zero = 0, One = 1, DstColor = 2, SrcColor = 3, OneMinusDstColor = 4, SrcAlpha = 5, OneMinusSrcColor = 6, DstAlpha = 7, OneMinusDstAlpha = 8, SrcAlphaSaturate = 9, OneMinusSrcAlpha = 10 }
    public enum RenderQueue { Background = 1000, Geometry = 2000, AlphaTest = 2450, Transparent = 3000, Overlay = 4000 }
    public enum ShadowCastingMode { Off, On, TwoSided, ShadowsOnly }
    public enum LightProbeUsage { Off, BlendProbes, UseProxyVolume, CustomProvided }
    public enum ReflectionProbeUsage { Off, BlendProbes, BlendProbesAndSkybox, Simple }
    public enum IndexFormat { UInt16, UInt32 }
    public enum AmbientMode { Skybox, Trilight, Flat, Custom }
    public enum GraphicsDeviceType { OpenGLES3 = 11, Vulkan = 21, Metal = 16, Direct3D11 = 2 }

    public abstract class RenderPipelineAsset : ScriptableObject { }

    public static class GraphicsSettings
    {
        public static RenderPipelineAsset currentRenderPipeline => null;
        public static RenderPipelineAsset defaultRenderPipeline { get; set; }
    }
}

namespace UnityEngine.Rendering.Universal
{
    public abstract class ScriptableRendererData : ScriptableObject { }
    public class UniversalRendererData : ScriptableRendererData { }

    public class UniversalRenderPipelineAsset : RenderPipelineAsset
    {
        public static UniversalRenderPipelineAsset Create(ScriptableRendererData rendererData = null) => null;
        public float renderScale { get; set; }
        public int msaaSampleCount { get; set; }
        public bool supportsHDR { get; set; }
        public float shadowDistance { get; set; }
        public int maxAdditionalLightsCount { get; set; }
    }
}

namespace UnityEngine
{
    using UnityEngine.Rendering;

    public enum TextureFormat { RGBA32 = 4, ARGB32 = 5, RGB24 = 3 }
    public enum TextureWrapMode { Repeat, Clamp, Mirror, MirrorOnce }
    public enum FilterMode { Point, Bilinear, Trilinear }
    public enum RenderTextureFormat { ARGB32 = 0, Depth = 1, Default = 7 }

    public class Texture : Object
    {
        public virtual int width { get; set; }
        public virtual int height { get; set; }
        public TextureWrapMode wrapMode { get; set; }
        public FilterMode filterMode { get; set; }
        public int anisoLevel { get; set; }
    }

    public sealed class Texture2D : Texture
    {
        public Texture2D(int width, int height) { }
        public Texture2D(int width, int height, TextureFormat textureFormat, bool mipChain) { }
        public static Texture2D whiteTexture => null;
        public static Texture2D blackTexture => null;
        public void SetPixels(Color[] colors) { }
        public void SetPixels32(Color32[] colors) { }
        public void SetPixel(int x, int y, Color color) { }
        public void Apply() { }
        public void Apply(bool updateMipmaps) { }
        public void Apply(bool updateMipmaps, bool makeNoLongerReadable) { }
    }

    public class RenderTexture : Texture
    {
        public RenderTexture(int width, int height, int depth, RenderTextureFormat format) { }
        public bool Create() => true;
        public void Release() { }
    }

    public enum MaterialGlobalIlluminationFlags { None = 0, RealtimeEmissive = 1, BakedEmissive = 2, EmissiveIsBlack = 4, AnyEmissive = 3 }

    public class Shader : Object
    {
        public static Shader Find(string name) => null;
    }

    public class Material : Object
    {
        public Material(Shader shader) { }
        public Material(Material source) { }
        public Shader shader { get; set; }
        public Color color { get; set; }
        public Texture mainTexture { get; set; }
        public int renderQueue { get; set; }
        public bool enableInstancing { get; set; }
        public MaterialGlobalIlluminationFlags globalIlluminationFlags { get; set; }
        public bool HasProperty(string name) => false;
        public void SetFloat(string name, float value) { }
        public void SetInt(string name, int value) { }
        public void SetColor(string name, Color value) { }
        public void SetTexture(string name, Texture value) { }
        public void EnableKeyword(string keyword) { }
        public void DisableKeyword(string keyword) { }
    }

    public sealed class Mesh : Object
    {
        public IndexFormat indexFormat { get; set; }
        public int subMeshCount { get; set; }
        public void SetVertices(List<Vector3> inVertices) { }
        public void SetNormals(List<Vector3> inNormals) { }
        public void SetUVs(int channel, List<Vector2> uvs) { }
        public void SetTriangles(int[] triangles, int submesh, bool calculateBounds) { }
        public void RecalculateBounds() { }
        public void UploadMeshData(bool markNoLongerReadable) { }
    }

    public class Renderer : Component
    {
        public bool enabled { get; set; }
        public Material sharedMaterial { get; set; }
        public Material[] sharedMaterials { get; set; }
        public ShadowCastingMode shadowCastingMode { get; set; }
        public bool receiveShadows { get; set; }
        public LightProbeUsage lightProbeUsage { get; set; }
        public ReflectionProbeUsage reflectionProbeUsage { get; set; }
    }

    public class MeshRenderer : Renderer { }

    public sealed class MeshFilter : Component
    {
        public Mesh sharedMesh { get; set; }
        public Mesh mesh { get; set; }
    }

    public enum CameraClearFlags { Skybox = 1, SolidColor = 2, Depth = 3, Nothing = 4 }

    public sealed class Camera : Behaviour
    {
        public float fieldOfView { get; set; }
        public float nearClipPlane { get; set; }
        public float farClipPlane { get; set; }
        public CameraClearFlags clearFlags { get; set; }
        public Color backgroundColor { get; set; }
        public RenderTexture targetTexture { get; set; }
        public int cullingMask { get; set; }
        public Vector3 WorldToScreenPoint(Vector3 position) => default;
        public static Camera main => null;
    }

    public enum LightType { Spot = 0, Directional = 1, Point = 2 }
    public enum LightShadows { None, Hard, Soft }
    public enum LightRenderMode { Auto, ForcePixel, ForceVertex }

    public sealed class Light : Behaviour
    {
        public LightType type { get; set; }
        public Color color { get; set; }
        public float intensity { get; set; }
        public float range { get; set; }
        public float spotAngle { get; set; }
        public float innerSpotAngle { get; set; }
        public LightShadows shadows { get; set; }
        public LightRenderMode renderMode { get; set; }
    }

    public enum FogMode { Linear = 1, Exponential = 2, ExponentialSquared = 3 }

    public static class RenderSettings
    {
        public static AmbientMode ambientMode { get; set; }
        public static Color ambientLight { get; set; }
        public static bool fog { get; set; }
        public static FogMode fogMode { get; set; }
        public static Color fogColor { get; set; }
        public static float fogStartDistance { get; set; }
        public static float fogEndDistance { get; set; }
        public static Material skybox { get; set; }
    }

    public enum ShadowQuality { Disable, HardOnly, All }
    public enum ColorSpace { Uninitialized = -1, Gamma = 0, Linear = 1 }

    public static class QualitySettings
    {
        public static string[] names => null;
        public static int GetQualityLevel() => 0;
        public static void SetQualityLevel(int index, bool applyExpensiveChanges) { }
        public static ShadowQuality shadows { get; set; }
        public static int vSyncCount { get; set; }
        public static bool softParticles { get; set; }
        public static bool realtimeReflectionProbes { get; set; }
        public static int antiAliasing { get; set; }
        public static RenderPipelineAsset renderPipeline { get; set; }
    }

    // --- physics ---
    public enum QueryTriggerInteraction { UseGlobal, Ignore, Collide }

    [Flags]
    public enum CollisionFlags { None = 0, Sides = 1, Above = 2, Below = 4 }

    public class Collider : Component
    {
        public bool enabled { get; set; }
        public bool isTrigger { get; set; }
    }

    public sealed class BoxCollider : Collider
    {
        public Vector3 center { get; set; }
        public Vector3 size { get; set; }
    }

    public sealed class CapsuleCollider : Collider
    {
        public Vector3 center { get; set; }
        public float radius { get; set; }
        public float height { get; set; }
    }

    public sealed class CharacterController : Collider
    {
        public float height { get; set; }
        public float radius { get; set; }
        public Vector3 center { get; set; }
        public float stepOffset { get; set; }
        public float slopeLimit { get; set; }
        public float skinWidth { get; set; }
        public float minMoveDistance { get; set; }
        public bool isGrounded => false;
        public CollisionFlags Move(Vector3 motion) => default;
    }

    public sealed class Rigidbody : Component
    {
        public bool isKinematic { get; set; }
        public bool useGravity { get; set; }
    }

    public struct RaycastHit
    {
        public Collider collider => null;
        public Vector3 point => default;
        public float distance => 0f;
    }

    public static class Physics
    {
        public static bool Raycast(Vector3 origin, Vector3 direction, out RaycastHit hitInfo, float maxDistance, int layerMask, QueryTriggerInteraction queryTriggerInteraction)
        { hitInfo = default; return false; }
        public static bool Linecast(Vector3 start, Vector3 end, out RaycastHit hitInfo) { hitInfo = default; return false; }
    }

    // --- audio ---
    public enum AudioRolloffMode { Logarithmic, Linear, Custom }

    public sealed class AudioClip : Object
    {
        public static AudioClip Create(string name, int lengthSamples, int channels, int frequency, bool stream) => null;
        public bool SetData(float[] data, int offsetSamples) => true;
    }

    public sealed class AudioSource : Behaviour
    {
        public AudioClip clip { get; set; }
        public bool loop { get; set; }
        public float volume { get; set; }
        public float pitch { get; set; }
        public float spatialBlend { get; set; }
        public AudioRolloffMode rolloffMode { get; set; }
        public float minDistance { get; set; }
        public float maxDistance { get; set; }
        public bool playOnAwake { get; set; }
        public float dopplerLevel { get; set; }
        public bool isPlaying => false;
        public void Play() { }
        public void Stop() { }
        public void PlayOneShot(AudioClip clip) { }
        public void PlayOneShot(AudioClip clip, float volumeScale) { }
    }

    public sealed class AudioListener : Behaviour
    {
        public static float volume { get; set; }
    }

    // --- UI module (in UnityEngine namespace) ---
    public enum RenderMode { ScreenSpaceOverlay, ScreenSpaceCamera, WorldSpace }
    public enum TextAnchor { UpperLeft, UpperCenter, UpperRight, MiddleLeft, MiddleCenter, MiddleRight, LowerLeft, LowerCenter, LowerRight }
    public enum HorizontalWrapMode { Wrap, Overflow }
    public enum VerticalWrapMode { Truncate, Overflow }

    public sealed class Canvas : Behaviour
    {
        public RenderMode renderMode { get; set; }
        public int sortingOrder { get; set; }
        public float scaleFactor { get; set; }
    }
}

namespace UnityEngine.SceneManagement
{
    public struct Scene
    {
        public string name => "";
        public string path => "";
    }
}

namespace UnityEngine.Events
{
    public delegate void UnityAction();

    public class UnityEvent
    {
        public void AddListener(UnityAction call) { }
        public void RemoveAllListeners() { }
    }
}

namespace UnityEngine.EventSystems
{
    public abstract class UIBehaviour : MonoBehaviour { }
    public abstract class BaseEventData { }
    public class PointerEventData : BaseEventData
    {
        public Vector2 position => default;
        public int pointerId => 0;
    }
    public interface IEventSystemHandler { }
    public interface IPointerDownHandler : IEventSystemHandler { void OnPointerDown(PointerEventData eventData); }
    public interface IPointerUpHandler : IEventSystemHandler { void OnPointerUp(PointerEventData eventData); }
    public interface IPointerExitHandler : IEventSystemHandler { void OnPointerExit(PointerEventData eventData); }

    public class EventSystem : UIBehaviour
    {
        public static EventSystem current { get; set; }
        public bool IsPointerOverGameObject() => false;
        public bool IsPointerOverGameObject(int pointerId) => false;
    }

    public abstract class BaseInputModule : UIBehaviour { }
    public class StandaloneInputModule : BaseInputModule { }
}

namespace UnityEngine.UI
{
    using UnityEngine.EventSystems;

    public abstract class Graphic : UIBehaviour
    {
        public virtual Color color { get; set; }
        public virtual bool raycastTarget { get; set; }
        public RectTransform rectTransform => null;
    }

    public abstract class MaskableGraphic : Graphic { }

    public class Image : MaskableGraphic
    {
        public Sprite sprite { get; set; }
    }

    public class RawImage : MaskableGraphic
    {
        public Texture texture { get; set; }
        public Rect uvRect { get; set; }
    }

    public class Text : MaskableGraphic
    {
        public Font font { get; set; }
        public virtual string text { get; set; }
        public int fontSize { get; set; }
        public TextAnchor alignment { get; set; }
        public HorizontalWrapMode horizontalOverflow { get; set; }
        public VerticalWrapMode verticalOverflow { get; set; }
        public bool resizeTextForBestFit { get; set; }
        public int resizeTextMinSize { get; set; }
        public int resizeTextMaxSize { get; set; }
        public bool supportRichText { get; set; }
        public virtual float preferredHeight => 0f;
    }

    public struct ColorBlock
    {
        public Color normalColor { get; set; }
        public Color highlightedColor { get; set; }
        public Color pressedColor { get; set; }
        public Color selectedColor { get; set; }
        public Color disabledColor { get; set; }
    }

    public class Selectable : UIBehaviour
    {
        public ColorBlock colors { get; set; }
        public bool interactable { get; set; }
    }

    public class Button : Selectable
    {
        public class ButtonClickedEvent : UnityEngine.Events.UnityEvent { }
        public ButtonClickedEvent onClick { get; set; }
    }

    public abstract class BaseMeshEffect : UIBehaviour { }

    public class Shadow : BaseMeshEffect
    {
        public Vector2 effectDistance { get; set; }
        public Color effectColor { get; set; }
    }

    public class LayoutElement : UIBehaviour
    {
        public virtual float preferredHeight { get; set; }
        public virtual float minHeight { get; set; }
        public virtual float preferredWidth { get; set; }
    }

    public abstract class LayoutGroup : UIBehaviour
    {
        public TextAnchor childAlignment { get; set; }
    }

    public abstract class HorizontalOrVerticalLayoutGroup : LayoutGroup
    {
        public float spacing { get; set; }
        public bool childForceExpandWidth { get; set; }
        public bool childForceExpandHeight { get; set; }
        public bool childControlWidth { get; set; }
        public bool childControlHeight { get; set; }
    }

    public class VerticalLayoutGroup : HorizontalOrVerticalLayoutGroup { }

    public class CanvasScaler : UIBehaviour
    {
        public enum ScaleMode { ConstantPixelSize, ScaleWithScreenSize, ConstantPhysicalSize }
        public ScaleMode uiScaleMode { get; set; }
        public Vector2 referenceResolution { get; set; }
        public float matchWidthOrHeight { get; set; }
    }

    public class GraphicRaycaster : UIBehaviour { }
}

namespace UnityEditor
{
    using UnityEngine;

    [AttributeUsage(AttributeTargets.Class)]
    public sealed class InitializeOnLoadAttribute : Attribute { }

    [AttributeUsage(AttributeTargets.Method, AllowMultiple = true)]
    public sealed class MenuItem : Attribute
    {
        public MenuItem(string itemName) { }
    }

    public static class EditorApplication
    {
        public delegate void CallbackFunction();
        public static CallbackFunction delayCall;
        public static bool isPlayingOrWillChangePlaymode => false;
    }

    public static class SessionState
    {
        public static bool GetBool(string key, bool defaultValue) => false;
        public static void SetBool(string key, bool value) { }
    }

    public static class AssetDatabase
    {
        public static T LoadAssetAtPath<T>(string assetPath) where T : Object => null;
        public static void CreateAsset(Object asset, string path) { }
        public static bool IsValidFolder(string path) => false;
        public static string CreateFolder(string parentFolder, string newFolderName) => "";
        public static void SaveAssets() { }
        public static void Refresh() { }
    }

    public static class EditorUtility
    {
        public static void SetDirty(Object target) { }
        public static bool DisplayDialog(string title, string message, string ok) => true;
        public static void RevealInFinder(string path) { }
    }

    public enum ScriptingImplementation { Mono2x = 0, IL2CPP = 1 }
    [Flags] public enum AndroidArchitecture { None = 0, ARMv7 = 1, ARM64 = 2, X86_64 = 8 }
    public enum AndroidSdkVersions { AndroidApiLevelAuto = 0, AndroidApiLevel23 = 23, AndroidApiLevel24 = 24, AndroidApiLevel25 = 25 }
    public enum ManagedStrippingLevel { Disabled = 0, Low = 1, Medium = 2, High = 3, Minimal = 4 }
    public enum UIOrientation { Portrait = 0, PortraitUpsideDown = 1, LandscapeRight = 2, LandscapeLeft = 3, AutoRotation = 4 }
    public enum BuildTarget { StandaloneWindows64 = 19, Android = 13, iOS = 9 }
    [Flags] public enum BuildOptions { None = 0, Development = 1 }

    public struct BuildPlayerOptions
    {
        public string[] scenes { get; set; }
        public string locationPathName { get; set; }
        public BuildTarget target { get; set; }
        public BuildOptions options { get; set; }
    }

    public static class BuildPipeline
    {
        public static UnityEditor.Build.Reporting.BuildReport BuildPlayer(BuildPlayerOptions buildPlayerOptions) => null;
    }

    public class EditorBuildSettingsScene
    {
        public EditorBuildSettingsScene(string path, bool enabled) { }
    }

    public static class EditorBuildSettings
    {
        public static EditorBuildSettingsScene[] scenes { get; set; }
    }

    public static class PlayerSettings
    {
        public static string companyName { get; set; }
        public static string productName { get; set; }
        public static UIOrientation defaultInterfaceOrientation { get; set; }
        public static bool allowedAutorotateToPortrait { get; set; }
        public static bool allowedAutorotateToPortraitUpsideDown { get; set; }
        public static bool allowedAutorotateToLandscapeLeft { get; set; }
        public static bool allowedAutorotateToLandscapeRight { get; set; }
        public static ColorSpace colorSpace { get; set; }
        public static void SetApplicationIdentifier(UnityEditor.Build.NamedBuildTarget buildTarget, string identifier) { }
        public static void SetScriptingBackend(UnityEditor.Build.NamedBuildTarget buildTarget, ScriptingImplementation backend) { }
        public static void SetManagedStrippingLevel(UnityEditor.Build.NamedBuildTarget buildTarget, ManagedStrippingLevel level) { }
        public static void SetMobileMTRendering(UnityEditor.Build.NamedBuildTarget buildTarget, bool enable) { }
        public static void SetUseDefaultGraphicsAPIs(BuildTarget platform, bool automatic) { }
        public static void SetGraphicsAPIs(BuildTarget platform, UnityEngine.Rendering.GraphicsDeviceType[] apis) { }

        public static class Android
        {
            public static AndroidArchitecture targetArchitectures { get; set; }
            public static AndroidSdkVersions minSdkVersion { get; set; }
        }
    }
}

namespace UnityEditor.Build
{
    public readonly struct NamedBuildTarget
    {
        public static readonly NamedBuildTarget Android;
        public static readonly NamedBuildTarget Standalone;
    }
}

namespace UnityEditor.Build.Reporting
{
    public enum BuildResult { Unknown, Succeeded, Failed, Cancelled }

    public struct BuildSummary
    {
        public BuildResult result => default;
        public ulong totalSize => 0;
        public int totalErrors => 0;
    }

    public class BuildReport : UnityEngine.Object
    {
        public BuildSummary summary => default;
    }
}

namespace UnityEditor.SceneManagement
{
    using UnityEngine.SceneManagement;

    public enum NewSceneSetup { EmptyScene, DefaultGameObjects }
    public enum NewSceneMode { Single, Additive }

    public static class EditorSceneManager
    {
        public static Scene NewScene(NewSceneSetup setup, NewSceneMode mode) => default;
        public static bool SaveScene(Scene scene, string dstScenePath) => true;
        public static bool SaveCurrentModifiedScenesIfUserWantsTo() => true;
    }
}
