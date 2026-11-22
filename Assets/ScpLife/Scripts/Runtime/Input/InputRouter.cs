using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace ScpLife.Runtime
{
    /// <summary>On-screen button that reports press and hold state (multi-touch friendly).</summary>
    public sealed class HoldButton : MonoBehaviour, IPointerDownHandler, IPointerUpHandler, IPointerExitHandler
    {
        public bool Held { get; private set; }
        private bool _pressedThisFrame;
        private int _pressFrame = -1;
        public Image Background;
        public Text Label;

        public bool ConsumePress()
        {
            if (!_pressedThisFrame) return false;
            _pressedThisFrame = false;
            return true;
        }

        public void OnPointerDown(PointerEventData eventData)
        {
            Held = true;
            _pressedThisFrame = true;
            _pressFrame = Time.frameCount;
            if (Background != null) Background.color = new Color(0.85f, 0.65f, 0.15f, 0.85f);
        }

        public void OnPointerUp(PointerEventData eventData) => Release();
        public void OnPointerExit(PointerEventData eventData) => Release();

        private void Release()
        {
            Held = false;
            if (Background != null) Background.color = new Color(0.1f, 0.12f, 0.14f, 0.55f);
        }

        private void LateUpdate()
        {
            // Unconsumed presses expire after a couple of frames.
            if (_pressedThisFrame && Time.frameCount - _pressFrame > 2) _pressedThisFrame = false;
        }
    }

    /// <summary>
    /// Unifies touch controls and keyboard/mouse into one per-frame input state.
    /// Gameplay code reads only this class. Runs before the game loop each frame.
    /// </summary>
    [DefaultExecutionOrder(-100)]
    public sealed class InputRouter : MonoBehaviour
    {
        public Vector2 Move { get; private set; }
        public Vector2 Look { get; private set; }
        public bool Sprint { get; private set; }
        public bool Interact { get; private set; }
        public bool Flashlight { get; private set; }
        public bool NextCard { get; private set; }
        public bool Pause { get; private set; }
        public bool Count { get; private set; }

        public MobileControls Mobile;
        public bool GameplayEnabled = true;
        public float Sensitivity = 1f;
        public bool InvertY;

        private bool _cursorLocked;

        private void Update()
        {
            Vector2 move = Vector2.zero;
            Vector2 look = Vector2.zero;
            bool sprint = false, interact = false, flashlight = false, card = false, pause = false, count = false;

            // Keyboard & mouse (editor, desktop, Android with keyboard).
            if (Input.GetKey(KeyCode.W) || Input.GetKey(KeyCode.UpArrow)) move.y += 1f;
            if (Input.GetKey(KeyCode.S) || Input.GetKey(KeyCode.DownArrow)) move.y -= 1f;
            if (Input.GetKey(KeyCode.D) || Input.GetKey(KeyCode.RightArrow)) move.x += 1f;
            if (Input.GetKey(KeyCode.A) || Input.GetKey(KeyCode.LeftArrow)) move.x -= 1f;
            sprint |= Input.GetKey(KeyCode.LeftShift);
            interact |= Input.GetKeyDown(KeyCode.E);
            flashlight |= Input.GetKeyDown(KeyCode.F);
            card |= Input.GetKeyDown(KeyCode.Q);
            count |= Input.GetKeyDown(KeyCode.C);
            pause |= Input.GetKeyDown(KeyCode.Escape) || Input.GetKeyDown(KeyCode.Tab);

            bool touchDevice = Mobile != null && Mobile.Active;
            if (!touchDevice && GameplayEnabled)
            {
                if (Input.GetMouseButtonDown(0) && !IsPointerOverUi()) SetCursorLock(true);
                if (_cursorLocked)
                {
                    look.x += Input.GetAxis("Mouse X") * 2.2f * Sensitivity;
                    look.y += Input.GetAxis("Mouse Y") * 2.2f * Sensitivity;
                }
            }
            if (!GameplayEnabled && _cursorLocked) SetCursorLock(false);
            if (pause && _cursorLocked) SetCursorLock(false);

            // Touch controls.
            if (touchDevice)
            {
                move += Mobile.Joystick;
                look += Mobile.ConsumeLookDelta() * Sensitivity;
                sprint |= Mobile.SprintHeld;
                interact |= Mobile.ConsumeInteract();
                flashlight |= Mobile.ConsumeFlashlight();
                card |= Mobile.ConsumeCard();
                pause |= Mobile.ConsumePause();
                count |= Mobile.ConsumeCount();
            }

            if (InvertY) look.y = -look.y;
            if (!GameplayEnabled)
            {
                move = Vector2.zero;
                look = Vector2.zero;
                sprint = interact = flashlight = card = count = false;
            }
            Move = Vector2.ClampMagnitude(move, 1f);
            Look = look;
            Sprint = sprint;
            Interact = interact;
            Flashlight = flashlight;
            NextCard = card;
            Pause = pause;
            Count = count;
        }

        public void SetCursorLock(bool locked)
        {
            _cursorLocked = locked;
            Cursor.lockState = locked ? CursorLockMode.Locked : CursorLockMode.None;
            Cursor.visible = !locked;
        }

        private static bool IsPointerOverUi()
        {
            return EventSystem.current != null && EventSystem.current.IsPointerOverGameObject();
        }
    }
}
