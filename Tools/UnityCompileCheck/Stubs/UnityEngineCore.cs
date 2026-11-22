// Compile-only stubs mirroring the subset of the UnityEngine API used by SCP LIFE.
// Signatures follow Unity 6 (6000.0) / 2022.3. Bodies are placeholders and never executed.
#pragma warning disable
using System;
using System.Collections.Generic;

namespace UnityEngine
{
    public class Object
    {
        public string name { get; set; }
        public static void Destroy(Object obj) { }
        public static void Destroy(Object obj, float t) { }
        public static void DontDestroyOnLoad(Object target) { }
        public static T FindFirstObjectByType<T>() where T : Object => null;
        public int GetInstanceID() => 0;
        public static implicit operator bool(Object exists) => exists != null;
    }

    public class Component : Object
    {
        public GameObject gameObject => null;
        public Transform transform => null;
        public string tag { get; set; }
        public T GetComponent<T>() => default;
        public T GetComponentInParent<T>() => default;
        public T[] GetComponentsInChildren<T>() => null;
        public T[] GetComponentsInChildren<T>(bool includeInactive) => null;
    }

    public class Behaviour : Component
    {
        public bool enabled { get; set; }
        public bool isActiveAndEnabled => true;
    }

    public class MonoBehaviour : Behaviour { }

    public class ScriptableObject : Object
    {
        public static T CreateInstance<T>() where T : ScriptableObject => null;
    }

    public enum PrimitiveType { Sphere, Capsule, Cylinder, Cube, Plane, Quad }

    public sealed class GameObject : Object
    {
        public GameObject() { }
        public GameObject(string name) { }
        public GameObject(string name, params Type[] components) { }
        public Transform transform => null;
        public bool activeSelf => true;
        public bool activeInHierarchy => true;
        public bool isStatic { get; set; }
        public string tag { get; set; }
        public int layer { get; set; }
        public T AddComponent<T>() where T : Component => null;
        public T GetComponent<T>() => default;
        public T GetComponentInParent<T>() => default;
        public T[] GetComponentsInChildren<T>() => null;
        public void SetActive(bool value) { }
        public static GameObject CreatePrimitive(PrimitiveType type) => null;
    }

    public class Transform : Component, System.Collections.IEnumerable
    {
        public Vector3 position { get; set; }
        public Quaternion rotation { get; set; }
        public Vector3 localPosition { get; set; }
        public Quaternion localRotation { get; set; }
        public Vector3 localScale { get; set; }
        public Vector3 eulerAngles { get; set; }
        public Vector3 lossyScale => default;
        public Vector3 forward { get; set; }
        public Vector3 right { get; set; }
        public Vector3 up { get; set; }
        public Transform parent { get; set; }
        public int childCount => 0;
        public void SetParent(Transform parent) { }
        public void SetParent(Transform parent, bool worldPositionStays) { }
        public void SetPositionAndRotation(Vector3 position, Quaternion rotation) { }
        public Vector3 TransformPoint(Vector3 position) => default;
        public Vector3 InverseTransformPoint(Vector3 position) => default;
        public void SetAsLastSibling() { }
        public void SetAsFirstSibling() { }
        public Transform GetChild(int index) => null;
        public System.Collections.IEnumerator GetEnumerator() => null;
    }

    public sealed class RectTransform : Transform
    {
        public Vector2 anchorMin { get; set; }
        public Vector2 anchorMax { get; set; }
        public Vector2 pivot { get; set; }
        public Vector2 sizeDelta { get; set; }
        public Vector2 anchoredPosition { get; set; }
        public Vector2 offsetMin { get; set; }
        public Vector2 offsetMax { get; set; }
        public Rect rect => default;
    }

    [AttributeUsage(AttributeTargets.Class, AllowMultiple = true)]
    public sealed class RequireComponent : Attribute
    {
        public RequireComponent(Type requiredComponent) { }
    }

    [AttributeUsage(AttributeTargets.Class)]
    public sealed class DefaultExecutionOrder : Attribute
    {
        public DefaultExecutionOrder(int order) { }
    }

    public enum RuntimeInitializeLoadType { AfterSceneLoad, BeforeSceneLoad, AfterAssembliesLoaded, BeforeSplashScreen, SubsystemRegistration }

    [AttributeUsage(AttributeTargets.Method)]
    public sealed class RuntimeInitializeOnLoadMethodAttribute : Attribute
    {
        public RuntimeInitializeOnLoadMethodAttribute() { }
        public RuntimeInitializeOnLoadMethodAttribute(RuntimeInitializeLoadType loadType) { }
    }

    public static class Debug
    {
        public static void Log(object message) { }
        public static void LogWarning(object message) { }
        public static void LogError(object message) { }
    }

    public static class Time
    {
        public static float time => 0f;
        public static float deltaTime => 0f;
        public static float unscaledDeltaTime => 0f;
        public static float unscaledTime => 0f;
        public static int frameCount => 0;
        public static float timeScale { get; set; }
    }

    public static class Random
    {
        public static float Range(float minInclusive, float maxInclusive) => 0f;
        public static int Range(int minInclusive, int maxExclusive) => 0;
        public static Vector3 insideUnitSphere => default;
        public static float value => 0f;
    }

    public static class Mathf
    {
        public const float PI = 3.14159274f;
        public const float Rad2Deg = 57.29578f;
        public const float Deg2Rad = 0.0174532924f;
        public static float Sin(float f) => 0f;
        public static float Cos(float f) => 0f;
        public static float Atan2(float y, float x) => 0f;
        public static float Sqrt(float f) => 0f;
        public static float Abs(float f) => 0f;
        public static int Abs(int value) => 0;
        public static float Min(float a, float b) => 0f;
        public static int Min(int a, int b) => 0;
        public static float Max(float a, float b) => 0f;
        public static int Max(int a, int b) => 0;
        public static float Clamp(float value, float min, float max) => 0f;
        public static int Clamp(int value, int min, int max) => 0;
        public static float Clamp01(float value) => 0f;
        public static float Lerp(float a, float b, float t) => 0f;
        public static float LerpAngle(float a, float b, float t) => 0f;
        public static float MoveTowards(float current, float target, float maxDelta) => 0f;
        public static float DeltaAngle(float current, float target) => 0f;
        public static float Repeat(float t, float length) => 0f;
        public static float Round(float f) => 0f;
        public static int RoundToInt(float f) => 0;
        public static int FloorToInt(float f) => 0;
        public static int CeilToInt(float f) => 0;
        public static float Sign(float f) => 0f;
        public static float Exp(float power) => 0f;
        public static float Pow(float f, float p) => 0f;
        public static float PerlinNoise(float x, float y) => 0f;
        public static float SmoothStep(float from, float to, float t) => 0f;
    }

    public struct Vector2
    {
        public float x, y;
        public Vector2(float x, float y) { this.x = x; this.y = y; }
        public static Vector2 zero => default;
        public static Vector2 one => default;
        public float magnitude => 0f;
        public float sqrMagnitude => 0f;
        public Vector2 normalized => default;
        public static Vector2 ClampMagnitude(Vector2 vector, float maxLength) => default;
        public static Vector2 operator +(Vector2 a, Vector2 b) => default;
        public static Vector2 operator -(Vector2 a, Vector2 b) => default;
        public static Vector2 operator -(Vector2 a) => default;
        public static Vector2 operator *(Vector2 a, float d) => default;
        public static Vector2 operator *(float d, Vector2 a) => default;
        public static Vector2 operator /(Vector2 a, float d) => default;
        public static implicit operator Vector2(Vector3 v) => default;
        public static implicit operator Vector3(Vector2 v) => default;
    }

    public struct Vector3
    {
        public float x, y, z;
        public Vector3(float x, float y, float z) { this.x = x; this.y = y; this.z = z; }
        public static Vector3 zero => default;
        public static Vector3 one => default;
        public static Vector3 up => default;
        public static Vector3 down => default;
        public static Vector3 forward => default;
        public static Vector3 back => default;
        public static Vector3 right => default;
        public static Vector3 left => default;
        public float magnitude => 0f;
        public float sqrMagnitude => 0f;
        public Vector3 normalized => default;
        public void Normalize() { }
        public static float Distance(Vector3 a, Vector3 b) => 0f;
        public static float Dot(Vector3 a, Vector3 b) => 0f;
        public static Vector3 Cross(Vector3 a, Vector3 b) => default;
        public static Vector3 Lerp(Vector3 a, Vector3 b, float t) => default;
        public static Vector3 MoveTowards(Vector3 current, Vector3 target, float maxDistanceDelta) => default;
        public static Vector3 ClampMagnitude(Vector3 vector, float maxLength) => default;
        public static Vector3 operator +(Vector3 a, Vector3 b) => default;
        public static Vector3 operator -(Vector3 a, Vector3 b) => default;
        public static Vector3 operator -(Vector3 a) => default;
        public static Vector3 operator *(Vector3 a, float d) => default;
        public static Vector3 operator *(float d, Vector3 a) => default;
        public static Vector3 operator /(Vector3 a, float d) => default;
        public static bool operator ==(Vector3 a, Vector3 b) => true;
        public static bool operator !=(Vector3 a, Vector3 b) => false;
        public override bool Equals(object other) => false;
        public override int GetHashCode() => 0;
    }

    public struct Quaternion
    {
        public float x, y, z, w;
        public static Quaternion identity => default;
        public Vector3 eulerAngles { get; set; }
        public static Quaternion Euler(float x, float y, float z) => default;
        public static Quaternion Euler(Vector3 euler) => default;
        public static Quaternion LookRotation(Vector3 forward) => default;
        public static Quaternion LookRotation(Vector3 forward, Vector3 upwards) => default;
        public static Quaternion Slerp(Quaternion a, Quaternion b, float t) => default;
        public static Quaternion Lerp(Quaternion a, Quaternion b, float t) => default;
        public static Quaternion operator *(Quaternion lhs, Quaternion rhs) => default;
        public static Vector3 operator *(Quaternion rotation, Vector3 point) => default;
        public static bool operator ==(Quaternion lhs, Quaternion rhs) => true;
        public static bool operator !=(Quaternion lhs, Quaternion rhs) => false;
        public override bool Equals(object other) => false;
        public override int GetHashCode() => 0;
    }

    public struct Color
    {
        public float r, g, b, a;
        public Color(float r, float g, float b) { this.r = r; this.g = g; this.b = b; a = 1f; }
        public Color(float r, float g, float b, float a) { this.r = r; this.g = g; this.b = b; this.a = a; }
        public static Color white => default;
        public static Color black => default;
        public static Color red => default;
        public static Color green => default;
        public static Color blue => default;
        public static Color magenta => default;
        public static Color clear => default;
        public static Color yellow => default;
        public static Color operator *(Color a, float b) => default;
        public static Color operator *(float b, Color a) => default;
        public static Color operator *(Color a, Color b) => default;
        public static Color operator +(Color a, Color b) => default;
        public static Color Lerp(Color a, Color b, float t) => default;
    }

    public struct Color32
    {
        public byte r, g, b, a;
        public Color32(byte r, byte g, byte b, byte a) { this.r = r; this.g = g; this.b = b; this.a = a; }
    }

    public struct Rect
    {
        public Rect(float x, float y, float width, float height) { }
        public float width => 0f;
        public float height => 0f;
    }

    public static class ColorUtility
    {
        public static bool TryParseHtmlString(string htmlString, out Color color) { color = default; return false; }
        public static string ToHtmlStringRGB(Color color) => "";
    }

    public enum KeyCode { None, W, A, S, D, E, F, Q, C, Escape, Tab, LeftShift, UpArrow, DownArrow, LeftArrow, RightArrow, Space }
    public enum TouchPhase { Began, Moved, Stationary, Ended, Canceled }

    public struct Touch
    {
        public int fingerId => 0;
        public Vector2 position => default;
        public Vector2 deltaPosition => default;
        public TouchPhase phase => default;
    }

    public static class Input
    {
        public static bool GetKey(KeyCode key) => false;
        public static bool GetKeyDown(KeyCode key) => false;
        public static bool GetMouseButtonDown(int button) => false;
        public static float GetAxis(string axisName) => 0f;
        public static int touchCount => 0;
        public static bool touchSupported => false;
        public static Touch GetTouch(int index) => default;
        public static bool simulateMouseWithTouches { get; set; }
    }

    public enum CursorLockMode { None, Locked, Confined }

    public static class Cursor
    {
        public static CursorLockMode lockState { get; set; }
        public static bool visible { get; set; }
    }

    public static class Screen
    {
        public static int width => 0;
        public static int height => 0;
        public static float dpi => 0f;
        public static int sleepTimeout { get; set; }
    }

    public static class SleepTimeout
    {
        public const int NeverSleep = -1;
        public const int SystemSetting = -2;
    }

    public enum RuntimePlatform { WindowsEditor, Android, IPhonePlayer, LinuxEditor, OSXEditor, WindowsPlayer }

    public static class Application
    {
        public static string persistentDataPath => "";
        public static bool isMobilePlatform => false;
        public static RuntimePlatform platform => default;
        public static int targetFrameRate { get; set; }
        public static bool isPlaying => false;
        public static void Quit() { }
    }

    public static class PlayerPrefs
    {
        public static int GetInt(string key, int defaultValue) => 0;
        public static float GetFloat(string key, float defaultValue) => 0f;
        public static void SetInt(string key, int value) { }
        public static void SetFloat(string key, float value) { }
        public static void Save() { }
    }

    public class TextAsset : Object
    {
        public string text => "";
    }

    public static class Resources
    {
        public static T Load<T>(string path) where T : Object => null;
        public static T GetBuiltinResource<T>(string path) where T : Object => null;
    }

    public sealed class Font : Object
    {
        public static Font CreateDynamicFontFromOSFont(string[] fontnames, int size) => null;
        public Material material { get; set; }
    }

    public sealed class Sprite : Object
    {
        public static Sprite Create(Texture2D texture, Rect rect, Vector2 pivot) => null;
    }
}
