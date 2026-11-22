using ScpLife.Core;
using UnityEngine;

namespace ScpLife.Runtime
{
    /// <summary>
    /// 3D presentation of SCP-L-001: a 2.6 m tall, thin, featureless humanoid. Poses are driven
    /// by the simulated behaviour state; the chamber walls show its tally marks (procedural
    /// texture updated from the simulation, including the door time it has learned).
    /// </summary>
    public sealed class TallymanView : MonoBehaviour
    {
        public AnomalyInstance Anomaly { get; private set; }
        public bool Visible { get; private set; } = true;

        private Transform _body, _hips, _torso, _head, _shoulderL, _shoulderR, _elbowL, _elbowR, _hipL, _hipR, _kneeL, _kneeR;
        private Renderer[] _renderers;
        private Vector3 _prevPos, _currPos;
        private float _prevYaw, _currYaw;
        private Vector3 _lastRendered;
        private float _speed, _walkPhase;
        private AudioSource _audio;
        private AudioSource _drone;
        private float _tapClock;
        private bool _tapPlayed;
        private float _scratchTimer;

        private Material[] _decalMaterials;
        private Texture2D[] _decalTextures;
        private int _lastTally = -1;
        private int _lastLearned = -2;
        private float _decalTimer;

        public void Init(AnomalyInstance anomaly, SimWorld world, MaterialLibrary m)
        {
            Anomaly = anomaly;
            name = "SCP_" + anomaly.Id;
            var skin = m.Colored(new Color(0.2f, 0.21f, 0.22f), 0.55f);
            var scar = m.Colored(new Color(0.7f, 0.68f, 0.62f), 0.2f);
            var cube = PrimitiveMeshes.Cube;
            var capsule = PrimitiveMeshes.Capsule;
            var sphere = PrimitiveMeshes.Sphere;

            _body = new GameObject("Body").transform;
            _body.SetParent(transform, false);
            _hips = Pivot("Hips", _body, new Vector3(0f, 1.45f, 0f));
            PrimitiveMeshes.Part("Pelvis", _hips, cube, skin, Vector3.zero, new Vector3(0.28f, 0.16f, 0.16f));
            _torso = Pivot("Torso", _hips, new Vector3(0f, 0.06f, 0f));
            PrimitiveMeshes.Part("Chest", _torso, cube, skin, new Vector3(0f, 0.42f, 0f), new Vector3(0.3f, 0.82f, 0.17f));
            for (int i = 0; i < 6; i++)
                PrimitiveMeshes.Part("Scar" + i, _torso, cube, scar, new Vector3(-0.08f + i * 0.03f, 0.55f, 0.087f), new Vector3(0.008f, 0.14f, 0.005f));
            PrimitiveMeshes.Part("ScarX", _torso, cube, scar, new Vector3(0f, 0.55f, 0.088f), new Vector3(0.2f, 0.008f, 0.005f));
            _head = Pivot("Head", _torso, new Vector3(0f, 0.86f, 0f));
            PrimitiveMeshes.Part("Neck", _head, cube, skin, new Vector3(0f, 0.08f, 0f), new Vector3(0.07f, 0.2f, 0.07f));
            PrimitiveMeshes.Part("Skull", _head, sphere, skin, new Vector3(0f, 0.32f, 0.02f), new Vector3(0.17f, 0.34f, 0.2f));

            _shoulderL = Pivot("ShoulderL", _torso, new Vector3(-0.2f, 0.78f, 0f));
            _shoulderR = Pivot("ShoulderR", _torso, new Vector3(0.2f, 0.78f, 0f));
            _elbowL = Limb(_shoulderL, skin, 0.55f, 0.07f);
            _elbowR = Limb(_shoulderR, skin, 0.55f, 0.07f);
            foreach (var elbow in new[] { _elbowL, _elbowR })
            {
                PrimitiveMeshes.Part("Fore", elbow, capsule, skin, new Vector3(0f, -0.27f, 0f), new Vector3(0.06f, 0.28f, 0.06f));
                for (int f = 0; f < 3; f++)
                    PrimitiveMeshes.Part("Finger", elbow, cube, skin, new Vector3(-0.025f + f * 0.025f, -0.66f, 0f), new Vector3(0.015f, 0.2f, 0.02f));
            }
            _hipL = Pivot("HipL", _hips, new Vector3(-0.09f, -0.05f, 0f));
            _hipR = Pivot("HipR", _hips, new Vector3(0.09f, -0.05f, 0f));
            _kneeL = Limb(_hipL, skin, 0.7f, 0.09f);
            _kneeR = Limb(_hipR, skin, 0.7f, 0.09f);
            foreach (var knee in new[] { _kneeL, _kneeR })
            {
                PrimitiveMeshes.Part("Shin", knee, capsule, skin, new Vector3(0f, -0.34f, 0f), new Vector3(0.07f, 0.36f, 0.07f));
                PrimitiveMeshes.Part("Foot", knee, cube, skin, new Vector3(0f, -0.69f, 0.05f), new Vector3(0.08f, 0.04f, 0.22f));
            }

            var col = gameObject.AddComponent<CapsuleCollider>();
            col.height = 2.6f;
            col.radius = 0.3f;
            col.center = new Vector3(0f, 1.3f, 0f);
            var rb = gameObject.AddComponent<Rigidbody>();
            rb.isKinematic = true;
            rb.useGravity = false;
            gameObject.AddComponent<AnomalyInteractable>().AnomalyId = anomaly.Id;
            _renderers = GetComponentsInChildren<Renderer>();

            _audio = gameObject.AddComponent<AudioSource>();
            _audio.spatialBlend = 1f;
            _audio.rolloffMode = AudioRolloffMode.Linear;
            _audio.minDistance = 2f;
            _audio.maxDistance = 22f;
            _audio.playOnAwake = false;
            _audio.dopplerLevel = 0f;
            _drone = gameObject.AddComponent<AudioSource>();
            _drone.spatialBlend = 1f;
            _drone.rolloffMode = AudioRolloffMode.Linear;
            _drone.minDistance = 2f;
            _drone.maxDistance = 25f;
            _drone.loop = true;
            _drone.volume = 0f;
            _drone.dopplerLevel = 0f;
            if (GameAudio.Instance != null)
            {
                _drone.clip = GameAudio.Instance.Drone;
                _drone.Play();
            }

            BuildDecals(world, m);
            Snap();
        }

        private static Transform Pivot(string name, Transform parent, Vector3 localPos)
        {
            var t = new GameObject(name).transform;
            t.SetParent(parent, false);
            t.localPosition = localPos;
            return t;
        }

        private static Transform Limb(Transform pivot, Material mat, float length, float radius)
        {
            PrimitiveMeshes.Part("Upper", pivot, PrimitiveMeshes.Capsule, mat, new Vector3(0f, -length * 0.5f, 0f), new Vector3(radius, length * 0.52f, radius));
            return Pivot("Joint", pivot, new Vector3(0f, -length, 0f));
        }

        // ------------------------------------------------------------------ chamber decals

        private void BuildDecals(SimWorld world, MaterialLibrary m)
        {
            Room chamber = world.Facility.GetRoom(Anomaly.ContainmentRoomId);
            if (chamber == null) return;
            var parent = new GameObject("TallyDecals").transform;
            parent.SetParent(transform.parent, false);
            _decalMaterials = new Material[3];
            _decalTextures = new Texture2D[3];
            float eps = 0.012f;
            // North wall (seen through the observation window), west wall, east wall by the door.
            AddDecal(0, parent, m, new Vector3((chamber.MinX + chamber.MaxX) * 0.5f, 2.2f, chamber.MaxZ - eps), Vector3.back, chamber.Width - 1.2f, 2.8f);
            AddDecal(1, parent, m, new Vector3(chamber.MinX + eps, 2.0f, (chamber.MinZ + chamber.MaxZ) * 0.5f + 1f), Vector3.right, chamber.Depth - 3f, 2.4f);
            AddDecal(2, parent, m, new Vector3(chamber.MaxX - eps, 1.9f, chamber.MinZ + 2.6f), Vector3.left, 4.2f, 2.0f);
        }

        private void AddDecal(int index, Transform parent, MaterialLibrary m, Vector3 center, Vector3 normal, float width, float height)
        {
            var mat = new Material(m.TallyDecal) { name = "TallyDecal" + index };
            _decalMaterials[index] = mat;
            var mb = new MeshBuilder();
            mb.Quad(mat, center, normal, Vector3.up, width, height);
            var go = mb.Build("Tally" + index, null);
            go.transform.SetParent(parent, true);
            go.isStatic = false;
        }

        private void UpdateDecals()
        {
            if (_decalMaterials == null || !(Anomaly.Behaviour is TallymanBehaviour t)) return;
            int bucket = t.StrongestLearnedBucket();
            int learned = bucket >= 0 && t.DoorHistogram[bucket] >= 2 ? bucket : -1;
            if (t.TallyCount == _lastTally && learned == _lastLearned) return;
            _lastTally = t.TallyCount;
            _lastLearned = learned;
            int share = t.TallyCount / 3;
            for (int i = 0; i < 3; i++)
            {
                string time = i == 2 && learned >= 0 ? GameClock.FormatTime(learned * 15) : null;
                int count = i == 2 ? Mathf.Min(share, 200) : share;
                _decalTextures[i] = ProceduralTextures.TallyWall(i == 2 ? 384 : 512, 256, count, time,
                    learned >= 0 ? t.DoorHistogram[learned] : 0, _decalTextures[i]);
                _decalMaterials[i].mainTexture = _decalTextures[i];
            }
        }

        // ------------------------------------------------------------------ per-frame

        public void Snap()
        {
            _currPos = _prevPos = Anomaly.Agent.Position.ToUnity();
            _currYaw = _prevYaw = Anomaly.Agent.Yaw;
            transform.SetPositionAndRotation(_currPos, Quaternion.Euler(0f, _currYaw, 0f));
            _lastRendered = _currPos;
        }

        public void OnSimTick()
        {
            _prevPos = _currPos;
            _prevYaw = _currYaw;
            _currPos = Anomaly.Agent.Position.ToUnity();
            _currYaw = Anomaly.Agent.Yaw;
            if ((_currPos - _prevPos).sqrMagnitude > 9f) _prevPos = _currPos;
        }

        public void Render(SimWorld world, float alpha, float dt, Vector3 cameraPos, bool roomVisible)
        {
            _decalTimer -= dt;
            if (_decalTimer <= 0f)
            {
                _decalTimer = 6f;
                UpdateDecals();
            }

            Vector3 pos = Vector3.Lerp(_prevPos, _currPos, alpha);
            float yaw = Mathf.LerpAngle(_prevYaw, _currYaw, alpha);
            transform.SetPositionAndRotation(pos, Quaternion.Euler(0f, yaw, 0f));
            float moved = (pos - _lastRendered).magnitude;
            _lastRendered = pos;
            _speed = Mathf.Lerp(_speed, dt > 0f ? Mathf.Min(moved / dt, 3f) : 0f, Mathf.Clamp01(dt * 8f));

            bool visible = roomVisible && Vector3.Distance(cameraPos, pos) < 45f;
            if (visible != Visible)
            {
                Visible = visible;
                foreach (var r in _renderers) r.enabled = visible;
            }

            float targetDrone = !Anomaly.Contained ? 0.55f : (Anomaly.Pose == AnomalyPose.Probing ? 0.35f : 0.08f);
            _drone.volume = Mathf.MoveTowards(_drone.volume, targetDrone, dt * 0.3f);
            if (!visible) return;

            Animate(world, dt, yaw);
        }

        private void Animate(SimWorld world, float dt, float yaw)
        {
            float t = Time.time;
            var pose = Anomaly.Pose;
            bool slowed = pose == AnomalyPose.Slowed;
            float walk = Mathf.Clamp01(_speed / 1.2f);
            _walkPhase += _speed * dt * (slowed ? 1.5f : 2.6f);
            float s = Mathf.Sin(_walkPhase);
            float sway = pose == AnomalyPose.Waiting ? 0f : Mathf.Sin(t * 0.7f) * 2f;

            float thighL = s * 22f * walk, thighR = -s * 22f * walk;
            float kneeL = Mathf.Max(0f, -s) * 30f * walk, kneeR = Mathf.Max(0f, s) * 30f * walk;
            float armL = -s * 12f * walk + 3f, armR = s * 12f * walk + 3f;
            float elbowL = -8f, elbowR = -8f;
            float torsoPitch = 8f + sway * 0.5f;
            float headPitch = 0f, headYaw = 0f, headRoll = sway * 2f;

            // Head follows whoever it is looking at.
            if (Anomaly.LookAtId != null)
            {
                Vector3 target = world.PositionOf(Anomaly.LookAtId).ToUnity() + Vector3.up * 1.6f;
                Vector3 d = target - _head.position;
                Vector3 flat = new Vector3(d.x, 0f, d.z);
                if (flat.sqrMagnitude > 0.01f)
                {
                    headYaw = Mathf.Clamp(Mathf.DeltaAngle(yaw, Quaternion.LookRotation(flat).eulerAngles.y), -80f, 80f);
                    headPitch = Mathf.Clamp(-Mathf.Atan2(d.y, flat.magnitude) * Mathf.Rad2Deg, -30f, 40f);
                }
            }

            switch (pose)
            {
                case AnomalyPose.Scratching:
                    armR = -100f;
                    elbowR = -20f + Mathf.Sin(t * 6f) * 25f;
                    torsoPitch = 15f;
                    headPitch = 10f;
                    _scratchTimer -= dt;
                    if (_scratchTimer <= 0f && GameAudio.Instance != null)
                    {
                        _scratchTimer = Random.Range(1.2f, 2.5f);
                        _audio.PlayOneShot(GameAudio.Instance.Scratch, 0.5f);
                    }
                    break;
                case AnomalyPose.Watching:
                    torsoPitch = 4f;
                    headRoll = 12f;
                    break;
                case AnomalyPose.Tapping:
                {
                    _tapClock += dt * 2.4f;
                    float phase = Mathf.Repeat(_tapClock, 1f);
                    armR = -80f - Mathf.Clamp01(1f - phase * 4f) * 12f;
                    elbowR = -15f;
                    if (phase < 0.1f && !_tapPlayed)
                    {
                        _tapPlayed = true;
                        if (GameAudio.Instance != null) _audio.PlayOneShot(GameAudio.Instance.Knock, 0.9f);
                    }
                    if (phase > 0.5f) _tapPlayed = false;
                    break;
                }
                case AnomalyPose.Probing:
                    armL = armR = -85f + Mathf.Sin(t * 22f) * 2f;
                    elbowL = elbowR = -10f;
                    torsoPitch = 18f;
                    headPitch = 25f;
                    break;
                case AnomalyPose.Waiting:
                    armL = armR = 2f;
                    elbowL = elbowR = 0f;
                    torsoPitch = 2f;
                    headPitch = 0f;
                    headRoll = 0f;
                    break;
                case AnomalyPose.Attacking:
                    armR = -110f;
                    elbowR = 0f;
                    torsoPitch = 25f;
                    break;
                case AnomalyPose.Slowed:
                    headRoll = Mathf.Sin(t * 13f) * 6f;
                    torsoPitch = 20f;
                    break;
            }

            float k = Mathf.Clamp01(dt * (pose == AnomalyPose.Attacking ? 14f : 5f));
            _hips.localPosition = Vector3.Lerp(_hips.localPosition, new Vector3(0f, 1.45f + Mathf.Abs(Mathf.Cos(_walkPhase)) * 0.04f * walk, 0f), k);
            _torso.localRotation = Quaternion.Slerp(_torso.localRotation, Quaternion.Euler(torsoPitch, 0f, sway), k);
            _head.localRotation = Quaternion.Slerp(_head.localRotation, Quaternion.Euler(headPitch, headYaw, headRoll), k);
            _hipL.localRotation = Quaternion.Slerp(_hipL.localRotation, Quaternion.Euler(thighL, 0f, 0f), k);
            _hipR.localRotation = Quaternion.Slerp(_hipR.localRotation, Quaternion.Euler(thighR, 0f, 0f), k);
            _kneeL.localRotation = Quaternion.Slerp(_kneeL.localRotation, Quaternion.Euler(kneeL, 0f, 0f), k);
            _kneeR.localRotation = Quaternion.Slerp(_kneeR.localRotation, Quaternion.Euler(kneeR, 0f, 0f), k);
            _shoulderL.localRotation = Quaternion.Slerp(_shoulderL.localRotation, Quaternion.Euler(armL, 0f, 6f), k);
            _shoulderR.localRotation = Quaternion.Slerp(_shoulderR.localRotation, Quaternion.Euler(armR, 0f, -6f), k);
            _elbowL.localRotation = Quaternion.Slerp(_elbowL.localRotation, Quaternion.Euler(elbowL, 0f, 0f), k);
            _elbowR.localRotation = Quaternion.Slerp(_elbowR.localRotation, Quaternion.Euler(elbowR, 0f, 0f), k);
        }
    }
}
