using System.Collections.Generic;
using ScpLife.Core;
using UnityEngine;

namespace ScpLife.Runtime
{
    /// <summary>Wall-mounted camera model that mirrors the simulated sweep angle.</summary>
    public sealed class SecurityCameraView : MonoBehaviour
    {
        public SecurityCamera Camera { get; private set; }
        private Transform _pivot;
        private MeshRenderer _led;
        private MaterialLibrary _m;
        public Transform Lens { get; private set; }

        public void Init(SecurityCamera cam, MaterialLibrary m)
        {
            Camera = cam;
            _m = m;
            name = "Camera_" + cam.Id;
            transform.position = cam.Position.ToUnity();
            PrimitiveMeshes.Part("Mount", transform, PrimitiveMeshes.Cube, m.DarkMetal, new Vector3(0f, 0.12f, 0f), new Vector3(0.06f, 0.24f, 0.06f));
            _pivot = new GameObject("Pivot").transform;
            _pivot.SetParent(transform, false);
            PrimitiveMeshes.Part("Housing", _pivot, PrimitiveMeshes.Cube, m.White, new Vector3(0f, 0f, 0.12f), new Vector3(0.14f, 0.12f, 0.3f));
            PrimitiveMeshes.Part("LensRing", _pivot, PrimitiveMeshes.Cube, m.Black, new Vector3(0f, 0f, 0.28f), new Vector3(0.1f, 0.09f, 0.03f));
            _led = PrimitiveMeshes.Part("Led", _pivot, PrimitiveMeshes.Cube, m.IndicatorRed, new Vector3(0.05f, 0.05f, 0.27f), new Vector3(0.02f, 0.02f, 0.01f)).GetComponent<MeshRenderer>();
            Lens = new GameObject("Lens").transform;
            Lens.SetParent(_pivot, false);
            Lens.localPosition = new Vector3(0f, 0f, 0.32f);
        }

        private void LateUpdate()
        {
            if (Camera == null) return;
            _pivot.localRotation = Quaternion.Euler(Camera.Pitch, Camera.CurrentYaw, 0f);
            bool blink = Camera.Operational && Mathf.Repeat(Time.time, 1.6f) < 0.8f;
            var mat = blink ? _m.IndicatorRed : _m.Black;
            if (_led.sharedMaterial != mat) _led.sharedMaterial = mat;
        }
    }

    /// <summary>
    /// Renders the selected security camera into a small RenderTexture for the duty terminal.
    /// The camera is enabled only while the feed is on screen to save GPU time on phones.
    /// </summary>
    public sealed class CctvSystem : MonoBehaviour
    {
        public RenderTexture Texture { get; private set; }
        public int SelectedIndex { get; private set; }
        public bool Active { get; private set; }
        public readonly List<SecurityCameraView> Views = new List<SecurityCameraView>();

        private UnityEngine.Camera _camera;
        private float _renderTimer;
        private float _frameInterval = 1f / 15f;

        public SecurityCameraView Selected => Views.Count == 0 ? null : Views[Mathf.Clamp(SelectedIndex, 0, Views.Count - 1)];

        public void Init(int width, int height)
        {
            Texture = new RenderTexture(width, height, 16, RenderTextureFormat.ARGB32) { name = "CCTV" };
            Texture.Create();
            var go = new GameObject("CctvCamera");
            go.transform.SetParent(transform, false);
            _camera = go.AddComponent<UnityEngine.Camera>();
            _camera.targetTexture = Texture;
            _camera.fieldOfView = 52f;
            _camera.nearClipPlane = 0.05f;
            _camera.farClipPlane = 30f;
            _camera.clearFlags = CameraClearFlags.SolidColor;
            _camera.backgroundColor = Color.black;
            _camera.enabled = false;
        }

        public void SetQuality(int width, int height, int fps)
        {
            _frameInterval = 1f / Mathf.Max(5, fps);
            if (Texture != null && Texture.width == width && Texture.height == height) return;
            if (Texture != null) Texture.Release();
            Texture = new RenderTexture(width, height, 16, RenderTextureFormat.ARGB32) { name = "CCTV" };
            Texture.Create();
            if (_camera != null) _camera.targetTexture = Texture;
        }

        public void Select(int index)
        {
            if (Views.Count == 0) return;
            SelectedIndex = ((index % Views.Count) + Views.Count) % Views.Count;
        }

        public void SetActive(bool active)
        {
            Active = active;
            if (!active && _camera != null) _camera.enabled = false;
        }

        public string SelectedRoomId => Selected?.Camera.RoomId;

        private void LateUpdate()
        {
            if (!Active || _camera == null || Selected == null) return;
            var cam = Selected;
            _camera.transform.SetPositionAndRotation(cam.Lens.position, cam.Lens.rotation);
            if (!cam.Camera.Operational)
            {
                _camera.enabled = false;
                return;
            }
            // Throttled rendering (CCTV look, cheaper on mobile): the camera is enabled for a single
            // frame per interval. This works the same in URP and the built-in pipeline.
            _renderTimer -= Time.unscaledDeltaTime;
            if (_renderTimer <= 0f)
            {
                _renderTimer = _frameInterval;
                _camera.enabled = true;
            }
            else
            {
                _camera.enabled = false;
            }
        }
    }
}
