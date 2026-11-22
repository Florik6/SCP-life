using ScpLife.Core;
using UnityEngine;

namespace ScpLife.Runtime
{
    /// <summary>
    /// Renders one simulated NPC. The NPC's position comes from the simulation (10 Hz) and is
    /// interpolated here; posture and activity drive the procedural animation.
    /// </summary>
    public sealed class NpcView : MonoBehaviour
    {
        public Npc Npc { get; private set; }
        public HumanoidRig Rig { get; private set; }
        public bool Visible { get; private set; } = true;

        private Vector3 _prevPos, _currPos;
        private float _prevYaw, _currYaw;
        private Renderer[] _renderers;
        private AudioSource _audio;
        private float _stepTimer;
        private Vector3 _lastRendered;
        private float _speed;

        public void Init(Npc npc, MaterialLibrary m)
        {
            Npc = npc;
            name = "NPC_" + npc.Id;
            Rig = HumanoidRig.Build(transform, npc.Role, npc.ColorVariant + Mathf.Abs(npc.Id.GetHashCode() % 5), npc.Female, m);
            var col = gameObject.AddComponent<CapsuleCollider>();
            col.height = 1.8f;
            col.radius = 0.3f;
            col.center = new Vector3(0f, 0.9f, 0f);
            var rb = gameObject.AddComponent<Rigidbody>();
            rb.isKinematic = true;
            rb.useGravity = false;
            gameObject.AddComponent<NpcInteractable>().NpcId = npc.Id;
            _renderers = GetComponentsInChildren<Renderer>();
            _audio = gameObject.AddComponent<AudioSource>();
            _audio.spatialBlend = 1f;
            _audio.rolloffMode = AudioRolloffMode.Linear;
            _audio.minDistance = 1f;
            _audio.maxDistance = 14f;
            _audio.playOnAwake = false;
            _audio.dopplerLevel = 0f;
            Snap();
        }

        public void Snap()
        {
            _currPos = _prevPos = Npc.Agent.Position.ToUnity();
            _currYaw = _prevYaw = Npc.Agent.Yaw;
            transform.SetPositionAndRotation(_currPos, Quaternion.Euler(0f, _currYaw, 0f));
            _lastRendered = _currPos;
        }

        /// <summary>Called after every simulation step.</summary>
        public void OnSimTick()
        {
            _prevPos = _currPos;
            _prevYaw = _currYaw;
            _currPos = Npc.Agent.Position.ToUnity();
            _currYaw = Npc.Agent.Yaw;
            if ((_currPos - _prevPos).sqrMagnitude > 9f) _prevPos = _currPos; // remote catch-up or teleport
        }

        public void Render(SimWorld world, float alpha, float dt, Vector3 cameraPos, bool roomVisible)
        {
            Vector3 pos = Vector3.Lerp(_prevPos, _currPos, alpha);
            float yaw = Mathf.LerpAngle(_prevYaw, _currYaw, alpha);
            transform.SetPositionAndRotation(pos, Quaternion.Euler(0f, yaw, 0f));

            float moved = (pos - _lastRendered).magnitude;
            _lastRendered = pos;
            float instSpeed = dt > 0f ? moved / dt : 0f;
            _speed = Mathf.Lerp(_speed, Mathf.Min(instSpeed, 3f), Mathf.Clamp01(dt * 10f));

            float dist = Vector3.Distance(cameraPos, pos);
            bool visible = roomVisible && dist < 42f;
            if (visible != Visible)
            {
                Visible = visible;
                foreach (var r in _renderers) r.enabled = visible;
            }
            if (!visible) return;

            Posture posture = Npc.Agent.IsMoving ? Posture.Standing : Npc.Posture;
            float lookYaw = 0f;
            Vector3? lookAt = null;
            if (Npc.ConversationWith != null)
            {
                var partner = world.GetNpc(Npc.ConversationWith);
                if (partner != null) lookAt = partner.Agent.Position.ToUnity();
            }
            else if (dist < 3.5f && posture != Posture.Lying && posture != Posture.Down && posture != Posture.Counting)
            {
                lookAt = cameraPos;
            }
            if (lookAt.HasValue)
            {
                Vector3 d = lookAt.Value - pos;
                d.y = 0f;
                if (d.sqrMagnitude > 0.01f) lookYaw = Mathf.DeltaAngle(yaw, Quaternion.LookRotation(d).eulerAngles.y);
            }
            Rig.Animate(dt, _speed, posture, lookYaw, Time.time);

            if (_speed > 0.4f && dist < 14f)
            {
                _stepTimer -= dt * _speed;
                if (_stepTimer <= 0f && GameAudio.Instance != null && GameAudio.Instance.Footsteps.Length > 0)
                {
                    _stepTimer = 0.75f;
                    _audio.pitch = Random.Range(0.85f, 1.05f);
                    _audio.PlayOneShot(GameAudio.Instance.Footsteps[Random.Range(0, GameAudio.Instance.Footsteps.Length)], 0.5f);
                }
            }
        }

        public Vector3 SpeechAnchor => Rig.HeadPosition;
    }
}
