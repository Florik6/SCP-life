using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace ScpLife.Runtime
{
    /// <summary>
    /// Touch layout for phones: floating joystick on the left half, drag-to-look on the right half,
    /// action buttons bottom-right. Multi-touch: move, look and press buttons simultaneously.
    /// </summary>
    public sealed class MobileControls : MonoBehaviour
    {
        public bool Active { get; private set; }
        public Vector2 Joystick { get; private set; }
        public bool SprintHeld => _sprint != null && _sprint.Held;

        private RectTransform _root;
        private RectTransform _joyBase;
        private RectTransform _joyKnob;
        private Image _joyBaseImage;
        private HoldButton _use, _sprint, _light, _card, _menu, _count;
        private Canvas _canvas;
        private int _joyFinger = -1;
        private int _lookFinger = -1;
        private Vector2 _joyOrigin;
        private Vector2 _lookAccum;
        private const float JoyRadius = 120f;

        public void Build(Canvas canvas, bool active)
        {
            _canvas = canvas;
            _root = UiFactory.Rect("MobileControls", canvas.transform);
            UiFactory.Stretch(_root);

            var ring = Sprite.Create(ProceduralTextures.Circle(128, true), new Rect(0, 0, 128, 128), new Vector2(0.5f, 0.5f));
            var dot = Sprite.Create(ProceduralTextures.Circle(128, false), new Rect(0, 0, 128, 128), new Vector2(0.5f, 0.5f));

            _joyBaseImage = UiFactory.Image("JoyBase", _root, new Color(1f, 1f, 1f, 0.25f));
            _joyBaseImage.sprite = ring;
            _joyBaseImage.raycastTarget = false;
            _joyBase = _joyBaseImage.rectTransform;
            UiFactory.Place(_joyBase, Vector2.zero, new Vector2(JoyRadius * 2.2f, JoyRadius * 2.2f), new Vector2(170f, 150f));
            _joyBase.pivot = new Vector2(0.5f, 0.5f);
            var knob = UiFactory.Image("JoyKnob", _joyBase, new Color(1f, 1f, 1f, 0.45f));
            knob.sprite = dot;
            knob.raycastTarget = false;
            _joyKnob = knob.rectTransform;
            UiFactory.Place(_joyKnob, new Vector2(0.5f, 0.5f), new Vector2(110f, 110f), Vector2.zero);
            _joyKnob.pivot = new Vector2(0.5f, 0.5f);

            _use = MakeButton("ИСПОЛЬЗ.", new Vector2(-210f, 230f), 190f, dot, 30);
            _sprint = MakeButton("БЕГ", new Vector2(-440f, 140f), 140f, dot, 26);
            _count = MakeButton("СЧЁТ", new Vector2(-210f, 450f), 150f, dot, 26);
            _light = MakeButton("ФОНАРЬ", new Vector2(-420f, 360f), 120f, dot, 22);
            _card = MakeButton("КАРТА", new Vector2(-600f, 120f), 120f, dot, 22);
            _menu = MakeButton("≡", new Vector2(-70f, 0f), 100f, dot, 46, new Vector2(1f, 1f), new Vector2(-70f, -70f));
            _count.gameObject.SetActive(false);

            SetActive(active);
        }

        private HoldButton MakeButton(string label, Vector2 offset, float size, Sprite sprite, int fontSize, Vector2? anchor = null, Vector2? pos = null)
        {
            var img = UiFactory.Image("Btn_" + label, _root, new Color(0.1f, 0.12f, 0.14f, 0.55f));
            img.sprite = sprite;
            var a = anchor ?? new Vector2(1f, 0f);
            UiFactory.Place(img.rectTransform, a, new Vector2(size, size), pos ?? offset);
            img.rectTransform.pivot = new Vector2(0.5f, 0.5f);
            var b = img.gameObject.AddComponent<HoldButton>();
            b.Background = img;
            var t = UiFactory.Text("Label", img.transform, label, fontSize, TextAnchor.MiddleCenter, Color.white);
            UiFactory.Stretch(t.rectTransform);
            b.Label = t;
            return b;
        }

        public void SetActive(bool active)
        {
            Active = active;
            if (_root != null) _root.gameObject.SetActive(active);
            if (!active)
            {
                Joystick = Vector2.zero;
                _joyFinger = _lookFinger = -1;
            }
        }

        public void SetCountAvailable(bool available, bool counting)
        {
            if (_count == null) return;
            _count.gameObject.SetActive(available || counting);
            _count.Label.text = counting ? "СТОП" : "СЧЁТ";
        }

        public void SetCardLabel(string text)
        {
            if (_card != null) _card.Label.text = text;
        }

        public Vector2 ConsumeLookDelta()
        {
            Vector2 v = _lookAccum;
            _lookAccum = Vector2.zero;
            return v;
        }

        public bool ConsumeInteract() => _use != null && _use.ConsumePress();
        public bool ConsumeFlashlight() => _light != null && _light.ConsumePress();
        public bool ConsumeCard() => _card != null && _card.ConsumePress();
        public bool ConsumePause() => _menu != null && _menu.ConsumePress();
        public bool ConsumeCount() => _count != null && _count.gameObject.activeSelf && _count.ConsumePress();

        private void Update()
        {
            if (!Active) return;
            float scale = _canvas != null ? _canvas.scaleFactor : 1f;
            for (int i = 0; i < Input.touchCount; i++)
            {
                Touch touch = Input.GetTouch(i);
                switch (touch.phase)
                {
                    case TouchPhase.Began:
                        if (EventSystem.current != null && EventSystem.current.IsPointerOverGameObject(touch.fingerId)) break;
                        if (touch.position.x < Screen.width * 0.45f && _joyFinger < 0)
                        {
                            _joyFinger = touch.fingerId;
                            _joyOrigin = touch.position;
                            _joyBase.anchoredPosition = touch.position / scale;
                            _joyBaseImage.color = new Color(1f, 1f, 1f, 0.45f);
                        }
                        else if (_lookFinger < 0)
                        {
                            _lookFinger = touch.fingerId;
                        }
                        break;
                    case TouchPhase.Moved:
                    case TouchPhase.Stationary:
                        if (touch.fingerId == _joyFinger)
                        {
                            Vector2 delta = (touch.position - _joyOrigin) / scale;
                            Vector2 clamped = Vector2.ClampMagnitude(delta, JoyRadius);
                            _joyKnob.anchoredPosition = clamped;
                            Vector2 v = clamped / JoyRadius;
                            // Small dead zone, then full range.
                            Joystick = v.magnitude < 0.12f ? Vector2.zero : v;
                        }
                        else if (touch.fingerId == _lookFinger)
                        {
                            // Degrees per screen-height swipe: ~170° at sensitivity 1.
                            _lookAccum += touch.deltaPosition / Mathf.Max(1f, Screen.height) * 170f;
                        }
                        break;
                    case TouchPhase.Ended:
                    case TouchPhase.Canceled:
                        if (touch.fingerId == _joyFinger)
                        {
                            _joyFinger = -1;
                            Joystick = Vector2.zero;
                            _joyKnob.anchoredPosition = Vector2.zero;
                            _joyBase.anchoredPosition = new Vector2(170f, 150f);
                            _joyBaseImage.color = new Color(1f, 1f, 1f, 0.25f);
                        }
                        else if (touch.fingerId == _lookFinger)
                        {
                            _lookFinger = -1;
                        }
                        break;
                }
            }
        }
    }
}
