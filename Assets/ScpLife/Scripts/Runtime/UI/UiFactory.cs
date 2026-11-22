using System;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace ScpLife.Runtime
{
    /// <summary>Helpers that build uGUI hierarchies from code (no prefabs needed).</summary>
    public static class UiFactory
    {
        public static Font DefaultFont { get; private set; }

        public static readonly Color Panel = new Color(0.05f, 0.06f, 0.07f, 0.88f);
        public static readonly Color PanelLight = new Color(0.12f, 0.14f, 0.16f, 0.92f);
        public static readonly Color Accent = new Color(0.85f, 0.65f, 0.15f, 1f);
        public static readonly Color TextColor = new Color(0.9f, 0.92f, 0.9f, 1f);
        public static readonly Color Dim = new Color(0.6f, 0.65f, 0.65f, 1f);
        public static readonly Color ButtonColor = new Color(0.16f, 0.19f, 0.21f, 0.92f);

        public static Font LoadFont()
        {
            if (DefaultFont != null) return DefaultFont;
            Font font = null;
            try { font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"); }
            catch (Exception) { font = null; }
            if (font == null)
            {
                try { font = Resources.GetBuiltinResource<Font>("Arial.ttf"); }
                catch (Exception) { font = null; }
            }
            if (font == null) font = Font.CreateDynamicFontFromOSFont(new[] { "Roboto", "Noto Sans", "Arial", "DejaVu Sans" }, 32);
            DefaultFont = font;
            return font;
        }

        public static Canvas CreateCanvas(string name, int sortOrder)
        {
            var go = new GameObject(name);
            var canvas = go.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = sortOrder;
            var scaler = go.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920f, 1080f);
            scaler.matchWidthOrHeight = 0.6f;
            go.AddComponent<GraphicRaycaster>();
            return canvas;
        }

        public static void EnsureEventSystem()
        {
            if (UnityEngine.Object.FindFirstObjectByType<EventSystem>() != null) return;
            var go = new GameObject("EventSystem");
            go.AddComponent<EventSystem>();
            go.AddComponent<StandaloneInputModule>();
            UnityEngine.Object.DontDestroyOnLoad(go);
        }

        public static RectTransform Rect(string name, Transform parent)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            return (RectTransform)go.transform;
        }

        public static void Stretch(RectTransform rt, float padding = 0f)
        {
            rt.anchorMin = Vector2.zero;
            rt.anchorMax = Vector2.one;
            rt.offsetMin = new Vector2(padding, padding);
            rt.offsetMax = new Vector2(-padding, -padding);
        }

        /// <summary>Places a rect by anchor point (0..1) with pixel size and offset (in reference pixels).</summary>
        public static void Place(RectTransform rt, Vector2 anchor, Vector2 size, Vector2 offset)
        {
            rt.anchorMin = anchor;
            rt.anchorMax = anchor;
            rt.pivot = anchor;
            rt.sizeDelta = size;
            rt.anchoredPosition = offset;
        }

        public static Image Image(string name, Transform parent, Color color)
        {
            var rt = Rect(name, parent);
            var img = rt.gameObject.AddComponent<Image>();
            img.color = color;
            return img;
        }

        public static Text Text(string name, Transform parent, string content, int size, TextAnchor anchor, Color color)
        {
            var rt = Rect(name, parent);
            var t = rt.gameObject.AddComponent<Text>();
            t.font = LoadFont();
            t.text = content;
            t.fontSize = size;
            t.alignment = anchor;
            t.color = color;
            t.horizontalOverflow = HorizontalWrapMode.Wrap;
            t.verticalOverflow = VerticalWrapMode.Truncate;
            t.raycastTarget = false;
            t.supportRichText = true;
            return t;
        }

        public static Button Button(string name, Transform parent, string label, int fontSize, Action onClick, out Text text)
        {
            var img = Image(name, parent, ButtonColor);
            var button = img.gameObject.AddComponent<Button>();
            var colors = button.colors;
            colors.highlightedColor = new Color(1f, 1f, 1f, 1f);
            colors.pressedColor = new Color(0.7f, 0.7f, 0.7f, 1f);
            colors.disabledColor = new Color(0.5f, 0.5f, 0.5f, 0.5f);
            button.colors = colors;
            if (onClick != null) button.onClick.AddListener(() => onClick());
            text = Text("Label", img.transform, label, fontSize, TextAnchor.MiddleCenter, TextColor);
            Stretch(text.rectTransform, 6f);
            return button;
        }

        public static Button Button(string name, Transform parent, string label, int fontSize, Action onClick)
        {
            return Button(name, parent, label, fontSize, onClick, out _);
        }

        /// <summary>Vertical list of buttons centred in a panel.</summary>
        public static RectTransform Column(string name, Transform parent, Vector2 size, float spacing)
        {
            var rt = Rect(name, parent);
            Place(rt, new Vector2(0.5f, 0.5f), size, Vector2.zero);
            var layout = rt.gameObject.AddComponent<VerticalLayoutGroup>();
            layout.spacing = spacing;
            layout.childAlignment = TextAnchor.MiddleCenter;
            layout.childControlHeight = true;
            layout.childControlWidth = true;
            layout.childForceExpandHeight = false;
            layout.childForceExpandWidth = true;
            return rt;
        }

        public static LayoutElement Height(Component c, float height)
        {
            var le = c.gameObject.GetComponent<LayoutElement>();
            if (le == null) le = c.gameObject.AddComponent<LayoutElement>();
            le.preferredHeight = height;
            le.minHeight = height;
            return le;
        }
    }
}
