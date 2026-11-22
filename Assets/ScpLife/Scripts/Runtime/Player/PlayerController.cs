using ScpLife.Core;
using UnityEngine;

namespace ScpLife.Runtime
{
    /// <summary>
    /// First-person controller (CharacterController). Movement, look, sprint with stamina,
    /// head bob, footsteps, flashlight, keycard switching, stun after being hit and
    /// interaction ray. Position is pushed into the simulation every frame by the bootstrap.
    /// </summary>
    [RequireComponent(typeof(CharacterController))]
    public sealed class PlayerController : MonoBehaviour
    {
        public const float EyeHeight = 1.62f;
        public const float WalkSpeed = 2.3f;
        public const float SprintSpeed = 4.2f;
        public const float InteractDistance = 2.7f;

        public Camera Camera { get; private set; }
        public Light Flashlight { get; private set; }
        public IInteractable Current { get; private set; }
        public float Stamina { get; private set; } = 1f;
        public float Yaw => _yaw;
        public float Pitch => _pitch;

        private CharacterController _cc;
        private InputRouter _input;
        private Transform _head;
        private float _yaw, _pitch;
        private float _verticalVelocity;
        private float _bobPhase;
        private float _stepDistance;
        private Vector3 _lastPosition;
        private AudioSource _footsteps;
        private float _shake;

        public void Init(InputRouter input)
        {
            _input = input;
            _cc = GetComponent<CharacterController>();
            _cc.height = 1.8f;
            _cc.radius = 0.32f;
            _cc.center = new Vector3(0f, 0.9f, 0f);
            _cc.stepOffset = 0.3f;
            _cc.slopeLimit = 45f;
            _cc.skinWidth = 0.03f;
            _cc.minMoveDistance = 0f;

            _head = new GameObject("Head").transform;
            _head.SetParent(transform, false);
            _head.localPosition = new Vector3(0f, EyeHeight, 0f);

            var camGo = new GameObject("PlayerCamera");
            camGo.transform.SetParent(_head, false);
            camGo.tag = "MainCamera";
            Camera = camGo.AddComponent<Camera>();
            Camera.nearClipPlane = 0.05f;
            Camera.farClipPlane = 48f;
            Camera.fieldOfView = 68f;
            Camera.clearFlags = CameraClearFlags.SolidColor;
            Camera.backgroundColor = new Color(0.02f, 0.025f, 0.03f);
            camGo.AddComponent<AudioListener>();

            Flashlight = new GameObject("Flashlight").AddComponent<Light>();
            Flashlight.transform.SetParent(camGo.transform, false);
            Flashlight.transform.localPosition = new Vector3(0.18f, -0.15f, 0.1f);
            Flashlight.type = LightType.Spot;
            Flashlight.spotAngle = 58f;
            Flashlight.innerSpotAngle = 30f;
            Flashlight.range = 15f;
            Flashlight.intensity = 2.4f;
            Flashlight.color = new Color(1f, 0.95f, 0.85f);
            Flashlight.shadows = LightShadows.None;
            Flashlight.enabled = false;

            _footsteps = gameObject.AddComponent<AudioSource>();
            _footsteps.spatialBlend = 0f;
            _footsteps.playOnAwake = false;
            _footsteps.volume = 0.35f;
            _lastPosition = transform.position;
        }

        public void Teleport(Vector3 feet, float yaw, float pitch)
        {
            _cc.enabled = false;
            transform.position = feet;
            _cc.enabled = true;
            _yaw = yaw;
            _pitch = Mathf.Clamp(pitch, -80f, 80f);
            transform.rotation = Quaternion.Euler(0f, _yaw, 0f);
            _head.localRotation = Quaternion.Euler(_pitch, 0f, 0f);
            _lastPosition = feet;
            _verticalVelocity = 0f;
        }

        public void Tick(SimWorld world, bool gameplay)
        {
            float dt = Time.deltaTime;
            var p = world.Player;
            bool stunned = world.RealTime < p.StunnedUntil;
            if (stunned) _shake = 0.25f;
            _shake = Mathf.MoveTowards(_shake, 0f, dt * 0.15f);

            if (gameplay && !p.Dead)
            {
                if (!stunned)
                {
                    _yaw += _input.Look.x;
                    _pitch = Mathf.Clamp(_pitch - _input.Look.y, -80f, 80f);
                }

                Vector2 move = stunned ? Vector2.zero : _input.Move;
                bool sprinting = _input.Sprint && move.y > 0.2f && Stamina > 0.05f && !p.Counting;
                float speed = (sprinting ? SprintSpeed : WalkSpeed) * (p.Health < 35f ? 0.75f : 1f);
                Stamina = Mathf.Clamp01(Stamina + (sprinting ? -dt / 7f : dt / 10f));

                Vector3 dir = transform.forward * move.y + transform.right * move.x;
                if (dir.sqrMagnitude > 1f) dir.Normalize();
                if (_cc.isGrounded && _verticalVelocity < 0f) _verticalVelocity = -1f;
                _verticalVelocity -= 9.81f * dt;
                _cc.Move((dir * speed + Vector3.up * _verticalVelocity) * dt);

                if (p.Counting && move.sqrMagnitude > 0.3f) world.StopPlayerCounting("вы сдвинулись с места");

                if (_input.Flashlight)
                {
                    Flashlight.enabled = !Flashlight.enabled;
                    p.FlashlightOn = Flashlight.enabled;
                    GameAudio.Instance?.PlayUi(GameAudio.Instance.Click);
                }
                if (_input.NextCard && p.CardIds.Count > 0)
                {
                    p.SelectedCard = (p.SelectedCard + 1) % p.CardIds.Count;
                    var card = world.GetCard(p.SelectedCardId);
                    if (card != null) GameBootstrap.Instance.Message($"Выбрана карта: {card.Level} · {card.OwnerName}", Color.white);
                }

                UpdateInteraction();
                if (_input.Interact && Current != null && Current.CanInteract) Current.Interact();
            }
            else
            {
                Current = null;
            }

            transform.rotation = Quaternion.Euler(0f, _yaw, 0f);
            UpdateHeadBob(dt);
        }

        private void UpdateInteraction()
        {
            Current = null;
            Transform cam = Camera.transform;
            if (Physics.Raycast(cam.position, cam.forward, out RaycastHit hit, InteractDistance, ~0, QueryTriggerInteraction.Collide))
            {
                var interactable = hit.collider.GetComponentInParent<IInteractable>();
                if (interactable != null && interactable.CanInteract) Current = interactable;
            }
        }

        private void UpdateHeadBob(float dt)
        {
            Vector3 pos = transform.position;
            Vector3 delta = pos - _lastPosition;
            delta.y = 0f;
            float moved = delta.magnitude;
            _lastPosition = pos;
            float speed = dt > 0f ? moved / dt : 0f;

            _bobPhase += moved * 2.2f;
            float bobAmount = Mathf.Clamp01(speed / SprintSpeed) * 0.045f;
            float bobY = Mathf.Sin(_bobPhase * 2f) * bobAmount;
            float bobX = Mathf.Cos(_bobPhase) * bobAmount * 0.6f;
            Vector3 shake = _shake > 0f ? Random.insideUnitSphere * _shake * 0.1f : Vector3.zero;
            _head.localPosition = new Vector3(bobX, EyeHeight + bobY, 0f) + shake;
            _head.localRotation = Quaternion.Euler(_pitch, 0f, _shake * Mathf.Sin(Time.time * 40f) * 8f);

            _stepDistance += moved;
            float stride = speed > 3.2f ? 0.85f : 0.7f;
            if (_stepDistance > stride && _cc.isGrounded)
            {
                _stepDistance = 0f;
                if (GameAudio.Instance != null && GameAudio.Instance.Footsteps.Length > 0)
                {
                    _footsteps.pitch = Random.Range(0.9f, 1.1f);
                    _footsteps.PlayOneShot(GameAudio.Instance.Footsteps[Random.Range(0, GameAudio.Instance.Footsteps.Length)], speed > 3.2f ? 0.7f : 0.45f);
                }
            }
        }
    }
}
