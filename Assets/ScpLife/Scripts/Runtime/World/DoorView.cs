using ScpLife.Core;
using UnityEngine;

namespace ScpLife.Runtime
{
    /// <summary>Shared primitive meshes (taken once from Unity's built-in primitives).</summary>
    public static class PrimitiveMeshes
    {
        private static Mesh _cube, _sphere, _capsule, _cylinder;

        public static Mesh Cube => _cube != null ? _cube : (_cube = Grab(PrimitiveType.Cube));
        public static Mesh Sphere => _sphere != null ? _sphere : (_sphere = Grab(PrimitiveType.Sphere));
        public static Mesh Capsule => _capsule != null ? _capsule : (_capsule = Grab(PrimitiveType.Capsule));
        public static Mesh Cylinder => _cylinder != null ? _cylinder : (_cylinder = Grab(PrimitiveType.Cylinder));

        private static Mesh Grab(PrimitiveType type)
        {
            var go = GameObject.CreatePrimitive(type);
            var mesh = go.GetComponent<MeshFilter>().sharedMesh;
            Object.Destroy(go);
            return mesh;
        }

        public static GameObject Part(string name, Transform parent, Mesh mesh, Material mat, Vector3 localPos, Vector3 localScale)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            go.transform.localScale = localScale;
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = mat;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = false;
            return go;
        }
    }

    /// <summary>
    /// Visual and physical representation of a simulated door: frame, sliding leaves with colliders,
    /// card readers on both sides (interactive), status LEDs and mechanism sounds.
    /// The door logic itself lives in the simulation; this view only mirrors it.
    /// </summary>
    public sealed class DoorView : MonoBehaviour
    {
        public Door Door { get; private set; }
        private SimWorld _world;
        private Transform[] _leaves = new Transform[0];
        private Vector3[] _closedPos = new Vector3[0];
        private Vector3[] _openOffset = new Vector3[0];
        private MeshRenderer[] _leds = new MeshRenderer[0];
        private MaterialLibrary _m;
        private Material _ledIdle, _ledWait;
        private DoorState _lastState;
        private AudioSource _audio;

        public void Build(SimWorld world, Door door, MaterialLibrary m)
        {
            _world = world;
            Door = door;
            _m = m;
            _ledIdle = m.Colored(new Color(0.9f, 0.6f, 0.1f), 0.6f);
            _ledWait = m.IndicatorGreen;
            _lastState = door.State;

            // Local frame: X runs along the wall, Z crosses the doorway.
            transform.rotation = door.CrossesAlongX ? Quaternion.Euler(0f, 90f, 0f) : Quaternion.identity;
            float w = door.Width;
            float h = door.Kind == DoorKind.Archway ? 2.6f : door.Height;
            float depth = FacilityBuilder.WallThickness * 2f + 0.06f;
            float jamb = 0.12f;
            Material frameMat = door.Kind == DoorKind.Heavy ? m.Hazard : m.DarkMetal;

            var mb = new MeshBuilder();
            Vector3 origin = transform.position;
            Quaternion rot = transform.rotation;
            mb.BoxRotated(frameMat, origin + rot * new Vector3(-(w * 0.5f + jamb * 0.5f), h * 0.5f, 0f), new Vector3(jamb, h + 0.12f, depth), rot, 0.6f);
            mb.BoxRotated(frameMat, origin + rot * new Vector3(w * 0.5f + jamb * 0.5f, h * 0.5f, 0f), new Vector3(jamb, h + 0.12f, depth), rot, 0.6f);
            mb.BoxRotated(frameMat, origin + rot * new Vector3(0f, h + 0.06f, 0f), new Vector3(w + jamb * 2f, 0.12f, depth), rot, 0.6f);
            if (door.Kind == DoorKind.Heavy)
                mb.BoxRotated(m.Hazard, origin + rot * new Vector3(0f, 0.005f, 0f), new Vector3(w + 0.4f, 0.01f, depth + 0.6f), rot, 0.5f);
            // The builder emits world-space vertices: build at the origin, then re-parent keeping world pose.
            var frame = mb.Build("Frame", null);
            frame.transform.SetParent(transform, true);

            if (door.Kind == DoorKind.Archway) return;

            Material leafMat = door.Kind == DoorKind.Heavy ? m.DarkMetal : door.Kind == DoorKind.Cell ? m.Metal : m.DoorMetal;
            float thickness = door.Kind == DoorKind.Heavy ? 0.22f : 0.08f;
            if (door.Kind == DoorKind.Heavy || door.Kind == DoorKind.Security)
            {
                _leaves = new Transform[2];
                _closedPos = new Vector3[2];
                _openOffset = new Vector3[2];
                for (int i = 0; i < 2; i++)
                {
                    float sign = i == 0 ? -1f : 1f;
                    var leaf = Leaf($"Leaf{i}", leafMat, new Vector3(sign * w * 0.25f, h * 0.5f, 0f), new Vector3(w * 0.5f, h, thickness));
                    _leaves[i] = leaf;
                    _closedPos[i] = leaf.localPosition;
                    _openOffset[i] = new Vector3(sign * w * 0.5f, 0f, 0f);
                    if (door.Kind == DoorKind.Heavy)
                    {
                        PrimitiveMeshes.Part("Stripe", leaf, PrimitiveMeshes.Cube, m.Hazard, new Vector3(0f, -0.3f, 0f), new Vector3(1.01f, 0.08f, 1.05f));
                        PrimitiveMeshes.Part("Bolt", leaf, PrimitiveMeshes.Cube, m.Metal, new Vector3(-sign * 0.4f, 0.1f, 0f), new Vector3(0.08f, 0.15f, 1.1f));
                    }
                }
            }
            else
            {
                _leaves = new Transform[1];
                _closedPos = new Vector3[1];
                _openOffset = new Vector3[1];
                var leaf = Leaf("Leaf", leafMat, new Vector3(0f, h * 0.5f, 0f), new Vector3(w, h, thickness));
                _leaves[0] = leaf;
                _closedPos[0] = leaf.localPosition;
                _openOffset[0] = new Vector3(w * 0.98f, 0f, 0f);
                if (door.Kind == DoorKind.Cell)
                {
                    PrimitiveMeshes.Part("Hatch", leaf, PrimitiveMeshes.Cube, m.Black, new Vector3(0f, 0.18f, 0f), new Vector3(0.35f, 0.12f, 1.1f));
                    for (int b = -1; b <= 1; b++)
                        PrimitiveMeshes.Part("Bar", leaf, PrimitiveMeshes.Cube, m.DarkMetal, new Vector3(b * 0.06f, 0.18f, 0f), new Vector3(0.02f, 0.12f, 1.2f));
                }
                else
                {
                    PrimitiveMeshes.Part("Window", leaf, PrimitiveMeshes.Cube, m.Glass, new Vector3(0f, 0.22f, 0f), new Vector3(0.4f, 0.18f, 1.1f));
                }
            }

            // Card readers on both sides.
            _leds = new MeshRenderer[2];
            for (int side = 0; side < 2; side++)
            {
                float z = (side == 0 ? -1f : 1f) * (depth * 0.5f + 0.03f);
                var reader = new GameObject("Reader" + side);
                reader.transform.SetParent(transform, false);
                reader.transform.localPosition = new Vector3(w * 0.5f + jamb + 0.18f, 1.25f, z);
                PrimitiveMeshes.Part("Body", reader.transform, PrimitiveMeshes.Cube, m.DarkMetal, Vector3.zero, new Vector3(0.13f, 0.2f, 0.05f));
                var led = PrimitiveMeshes.Part("Led", reader.transform, PrimitiveMeshes.Cube, _ledIdle, new Vector3(0f, 0.06f, side == 0 ? -0.03f : 0.03f), new Vector3(0.06f, 0.025f, 0.01f));
                _leds[side] = led.GetComponent<MeshRenderer>();
                var col = reader.AddComponent<BoxCollider>();
                col.size = new Vector3(0.3f, 0.35f, 0.15f);
                // The room on this side of the door, in world terms.
                Vector3 sideWorld = transform.TransformPoint(new Vector3(0f, 0f, z * 4f));
                Room sideRoom = world.Facility.RoomAt(sideWorld.ToCore());
                reader.AddComponent<KeycardReaderInteractable>().Init(this, sideRoom?.Id ?? door.RoomA);
            }

            _audio = gameObject.AddComponent<AudioSource>();
            _audio.spatialBlend = 1f;
            _audio.rolloffMode = AudioRolloffMode.Linear;
            _audio.minDistance = 1.5f;
            _audio.maxDistance = 18f;
            _audio.playOnAwake = false;
            _audio.dopplerLevel = 0f;
        }

        private Transform Leaf(string name, Material mat, Vector3 localPos, Vector3 size)
        {
            var go = PrimitiveMeshes.Part(name, transform, PrimitiveMeshes.Cube, mat, localPos, size);
            go.AddComponent<BoxCollider>();
            var rb = go.AddComponent<Rigidbody>();
            rb.isKinematic = true;
            rb.useGravity = false;
            return go.transform;
        }

        private void LateUpdate()
        {
            if (Door == null || _leaves.Length == 0) return;
            float t = Door.Openness;
            float eased = t * t * (3f - 2f * t);
            for (int i = 0; i < _leaves.Length; i++)
                _leaves[i].localPosition = _closedPos[i] + _openOffset[i] * eased;

            if (_lastState != Door.State)
            {
                if ((Door.State == DoorState.Opening || Door.State == DoorState.Closing) && GameAudio.Instance != null)
                    _audio.PlayOneShot(Door.Kind == DoorKind.Heavy ? GameAudio.Instance.HeavyDoor : GameAudio.Instance.DoorServo, 0.8f);
                _lastState = Door.State;
            }
            UpdateLeds();
        }

        private void UpdateLeds()
        {
            if (_leds.Length == 0) return;
            float age = _world.RealTime - (float)Door.LastResultTime;
            Material mat = _ledIdle;
            if (Door.Locked || Door.Lockdown) mat = _m.IndicatorRed;
            if (age < 2.5f)
            {
                if (AccessControl.IsSuccess(Door.LastResult)) mat = _m.IndicatorGreen;
                else if (Door.LastResult == AccessResult.AwaitingSecondCard) mat = Mathf.Repeat(Time.time * 3f, 1f) > 0.5f ? _ledWait : _ledIdle;
                else mat = _m.IndicatorRed;
            }
            else if (Door.PendingFirstCardId != null)
            {
                mat = Mathf.Repeat(Time.time * 3f, 1f) > 0.5f ? _ledWait : _ledIdle;
            }
            if (Door.ReaderFaultUntil > _world.Now) mat = Mathf.Repeat(Time.time * 7f, 1f) > 0.5f ? _m.IndicatorRed : _m.Black;
            foreach (var led in _leds)
                if (led.sharedMaterial != mat) led.sharedMaterial = mat;
        }

        public void PlayReaderSound(AccessResult result)
        {
            if (_audio == null || GameAudio.Instance == null) return;
            var clip = AccessControl.IsSuccess(result) ? GameAudio.Instance.BeepGranted
                : result == AccessResult.AwaitingSecondCard ? GameAudio.Instance.BeepWait : GameAudio.Instance.BeepDenied;
            _audio.PlayOneShot(clip, 0.9f);
        }
    }
}
