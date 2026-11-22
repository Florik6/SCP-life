using System.Collections.Generic;
using System.Text;
using ScpLife.Core;
using UnityEngine;
using UnityEngine.UI;

namespace ScpLife.Runtime
{
    /// <summary>In-game HUD: clock, location, alert, duty tasks, message feed, prompts, NPC speech.</summary>
    public sealed class HudController : MonoBehaviour
    {
        private struct FeedLine
        {
            public Text Text;
            public float Expires;
        }

        private RectTransform _root;
        private Text _clock, _alert, _tasks, _prompt, _card, _counting;
        private Image _promptBg, _health, _stamina, _damage, _alertStrip;
        private RectTransform _feedRoot;
        private readonly List<FeedLine> _feed = new List<FeedLine>();
        private readonly List<Text> _speech = new List<Text>();
        private float _lastHealth = 100f;
        private float _damageAlpha;
        private float _taskTimer;

        public void Build(Canvas canvas)
        {
            _root = UiFactory.Rect("HUD", canvas.transform);
            UiFactory.Stretch(_root);

            var top = UiFactory.Image("TopLeft", _root, UiFactory.Panel);
            UiFactory.Place(top.rectTransform, new Vector2(0f, 1f), new Vector2(640f, 112f), new Vector2(20f, -20f));
            _alertStrip = UiFactory.Image("AlertStrip", top.transform, Color.green);
            UiFactory.Place(_alertStrip.rectTransform, new Vector2(0f, 1f), new Vector2(8f, 112f), Vector2.zero);
            _clock = UiFactory.Text("Clock", top.transform, "", 34, TextAnchor.UpperLeft, UiFactory.TextColor);
            UiFactory.Place(_clock.rectTransform, new Vector2(0f, 1f), new Vector2(610f, 48f), new Vector2(22f, -8f));
            _alert = UiFactory.Text("Alert", top.transform, "", 22, TextAnchor.UpperLeft, UiFactory.Dim);
            UiFactory.Place(_alert.rectTransform, new Vector2(0f, 1f), new Vector2(610f, 56f), new Vector2(22f, -54f));

            var healthBg = UiFactory.Image("HealthBg", _root, new Color(0f, 0f, 0f, 0.6f));
            UiFactory.Place(healthBg.rectTransform, new Vector2(0f, 1f), new Vector2(320f, 12f), new Vector2(20f, -140f));
            _health = UiFactory.Image("Health", healthBg.transform, new Color(0.8f, 0.2f, 0.2f, 0.9f));
            UiFactory.Place(_health.rectTransform, new Vector2(0f, 0.5f), new Vector2(320f, 12f), Vector2.zero);
            var stamBg = UiFactory.Image("StamBg", _root, new Color(0f, 0f, 0f, 0.6f));
            UiFactory.Place(stamBg.rectTransform, new Vector2(0f, 1f), new Vector2(320f, 6f), new Vector2(20f, -158f));
            _stamina = UiFactory.Image("Stamina", stamBg.transform, new Color(0.8f, 0.8f, 0.8f, 0.8f));
            UiFactory.Place(_stamina.rectTransform, new Vector2(0f, 0.5f), new Vector2(320f, 6f), Vector2.zero);

            var tasksBg = UiFactory.Image("Tasks", _root, UiFactory.Panel);
            UiFactory.Place(tasksBg.rectTransform, new Vector2(1f, 1f), new Vector2(640f, 250f), new Vector2(-140f, -20f));
            _tasks = UiFactory.Text("TasksText", tasksBg.transform, "", 22, TextAnchor.UpperLeft, UiFactory.TextColor);
            UiFactory.Stretch(_tasks.rectTransform, 14f);

            _feedRoot = UiFactory.Rect("Feed", _root);
            UiFactory.Place(_feedRoot, new Vector2(0f, 0.5f), new Vector2(860f, 380f), new Vector2(20f, 40f));

            var cross = UiFactory.Image("Crosshair", _root, new Color(1f, 1f, 1f, 0.6f));
            cross.sprite = Sprite.Create(ProceduralTextures.Circle(32, false), new Rect(0, 0, 32, 32), new Vector2(0.5f, 0.5f));
            UiFactory.Place(cross.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(10f, 10f), Vector2.zero);
            cross.rectTransform.pivot = new Vector2(0.5f, 0.5f);
            cross.raycastTarget = false;

            _promptBg = UiFactory.Image("PromptBg", _root, new Color(0f, 0f, 0f, 0.55f));
            UiFactory.Place(_promptBg.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(980f, 96f), new Vector2(0f, -110f));
            _promptBg.rectTransform.pivot = new Vector2(0.5f, 0.5f);
            _promptBg.raycastTarget = false;
            _prompt = UiFactory.Text("Prompt", _promptBg.transform, "", 26, TextAnchor.MiddleCenter, UiFactory.TextColor);
            UiFactory.Stretch(_prompt.rectTransform, 8f);

            _counting = UiFactory.Text("Counting", _root, "", 30, TextAnchor.MiddleCenter, new Color(1f, 0.9f, 0.5f));
            UiFactory.Place(_counting.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(1100f, 60f), new Vector2(0f, 170f));
            _counting.rectTransform.pivot = new Vector2(0.5f, 0.5f);
            _counting.gameObject.AddComponent<Shadow>();

            var cardBg = UiFactory.Image("CardBg", _root, UiFactory.Panel);
            UiFactory.Place(cardBg.rectTransform, new Vector2(0.5f, 0f), new Vector2(560f, 46f), new Vector2(0f, 18f));
            cardBg.rectTransform.pivot = new Vector2(0.5f, 0f);
            _card = UiFactory.Text("Card", cardBg.transform, "", 22, TextAnchor.MiddleCenter, UiFactory.TextColor);
            UiFactory.Stretch(_card.rectTransform, 4f);

            _damage = UiFactory.Image("Damage", _root, new Color(0.6f, 0f, 0f, 0f));
            UiFactory.Stretch(_damage.rectTransform);
            _damage.raycastTarget = false;

            for (int i = 0; i < 6; i++)
            {
                var t = UiFactory.Text("Speech" + i, _root, "", 22, TextAnchor.LowerCenter, Color.white);
                t.rectTransform.sizeDelta = new Vector2(520f, 90f);
                t.rectTransform.anchorMin = t.rectTransform.anchorMax = Vector2.zero;
                t.rectTransform.pivot = new Vector2(0.5f, 0f);
                var shadow = t.gameObject.AddComponent<Shadow>();
                shadow.effectDistance = new Vector2(2f, -2f);
                t.gameObject.SetActive(false);
                _speech.Add(t);
            }
            // Tasks panel is drawn after the speech labels so it stays readable.
            tasksBg.transform.SetAsLastSibling();
            top.transform.SetAsLastSibling();
            // The HUD is purely informational: it must never swallow touches meant for look/move.
            foreach (var g in _root.GetComponentsInChildren<Graphic>(true)) g.raycastTarget = false;
        }

        public void SetVisible(bool visible) => _root.gameObject.SetActive(visible);

        public void Push(string text, Color color)
        {
            var t = UiFactory.Text("Msg", _feedRoot, text, 23, TextAnchor.LowerLeft, color);
            t.gameObject.AddComponent<Shadow>();
            t.rectTransform.anchorMin = new Vector2(0f, 0f);
            t.rectTransform.anchorMax = new Vector2(1f, 0f);
            t.rectTransform.pivot = new Vector2(0f, 0f);
            t.rectTransform.sizeDelta = new Vector2(0f, 60f);
            _feed.Add(new FeedLine { Text = t, Expires = Time.time + 12f });
            while (_feed.Count > 6)
            {
                Destroy(_feed[0].Text.gameObject);
                _feed.RemoveAt(0);
            }
            LayoutFeed();
        }

        private void LayoutFeed()
        {
            float y = 0f;
            for (int i = _feed.Count - 1; i >= 0; i--)
            {
                var t = _feed[i].Text;
                float h = Mathf.Max(30f, t.preferredHeight + 4f);
                t.rectTransform.sizeDelta = new Vector2(0f, h);
                t.rectTransform.anchoredPosition = new Vector2(0f, y);
                y += h;
            }
        }

        public void Tick(SimWorld world, PlayerController player, List<NpcView> npcs, Camera cam, bool showPrompt)
        {
            var p = world.Player;
            Room room = world.Facility.GetRoom(p.RoomId);
            _clock.text = $"{GameClock.FormatStamp(world.Now)}  ·  {room?.Name ?? "—"}";
            Color alertColor = Conv.AlertColor(world.Alert.Level);
            _alert.text = $"<color=#{ColorUtility.ToHtmlStringRGB(alertColor)}>ТРЕВОГА: {AlertSystem.LevelName(world.Alert.Level)}</color> — {world.Alert.Reason}";
            _alertStrip.color = alertColor;

            _health.rectTransform.sizeDelta = new Vector2(320f * Mathf.Clamp01(p.Health / 100f), 12f);
            _stamina.rectTransform.sizeDelta = new Vector2(320f * player.Stamina, 6f);
            if (p.Health < _lastHealth - 0.5f) _damageAlpha = 0.55f;
            _lastHealth = p.Health;
            _damageAlpha = Mathf.MoveTowards(_damageAlpha, p.Health < 30f ? 0.15f : 0f, Time.deltaTime * 0.6f);
            _damage.color = new Color(0.6f, 0f, 0f, _damageAlpha);

            var card = world.GetCard(p.SelectedCardId);
            _card.text = card != null
                ? $"Карта: <color=#{ColorUtility.ToHtmlStringRGB(Conv.LevelColor(card.Level))}>{card.Level}</color> · {card.OwnerName}" +
                  (p.CardIds.Count > 1 ? $"  ({p.SelectedCard % p.CardIds.Count + 1}/{p.CardIds.Count})" : "") + (card.Revoked ? " · АННУЛИРОВАНА" : "")
                : "Карты нет";

            string prompt = showPrompt && player.Current != null ? player.Current.Prompt : "";
            _prompt.text = prompt;
            _promptBg.enabled = prompt.Length > 0;

            if (p.Counting)
                _counting.text = $"ПРОТОКОЛ СЧЁТА: {NumberWords.Capitalized((int)(p.CountingSeconds / 1.2f) % 100 + 1)}… — не двигайтесь";
            else _counting.text = "";

            _taskTimer -= Time.deltaTime;
            if (_taskTimer <= 0f)
            {
                _taskTimer = 0.5f;
                _tasks.text = TaskText(world);
            }

            for (int i = _feed.Count - 1; i >= 0; i--)
            {
                float left = _feed[i].Expires - Time.time;
                if (left <= 0f)
                {
                    Destroy(_feed[i].Text.gameObject);
                    _feed.RemoveAt(i);
                    LayoutFeed();
                    continue;
                }
                var c = _feed[i].Text.color;
                c.a = Mathf.Clamp01(left / 2f);
                _feed[i].Text.color = c;
            }

            UpdateSpeech(world, npcs, cam);
        }

        private static string TaskText(SimWorld world)
        {
            var sb = new StringBuilder();
            sb.Append("<b>ЗАДАЧИ СМЕНЫ</b>\n");
            int n = 0;
            foreach (var t in world.Tasks.ActiveFor(PlayerState.PlayerId))
            {
                if (n++ >= 3) break;
                string left = t.Deadline > 0 ? GameClock.DurationText(t.Deadline - world.Now) : "";
                sb.Append($"• {t.Title} <color=#c8b45a>{t.ProgressText}</color> <color=#8a9a9a>({left})</color>\n");
                if (t.Kind == TaskKind.Patrol)
                {
                    var next = new List<string>();
                    foreach (string cp in t.Checkpoints)
                        if (!t.Done.Contains(cp)) next.Add(world.Facility.GetPoi(cp)?.Label ?? cp);
                    if (next.Count > 0) sb.Append($"   <color=#9aa>далее: {string.Join(" → ", next)}</color>\n");
                }
                else if (!string.IsNullOrEmpty(t.Description) && n == 1)
                {
                    sb.Append($"   <color=#9aa>{t.Description}</color>\n");
                }
            }
            if (n == 0) sb.Append("<color=#9aa>Нет активных задач. Следите за сектором.</color>\n");
            sb.Append($"<color=#8a9a9a>Выполнено: {world.Player.TasksCompleted} · Провалено: {world.Player.TasksFailed} · Репутация: {world.Player.Reputation}</color>");
            return sb.ToString();
        }

        private void UpdateSpeech(SimWorld world, List<NpcView> npcs, Camera cam)
        {
            int used = 0;
            double now = world.Now;
            if (cam != null)
            {
                Vector3 camPos = cam.transform.position;
                float scale = _root.lossyScale.x > 0f ? _root.lossyScale.x : 1f;
                foreach (var view in npcs)
                {
                    if (used >= _speech.Count) break;
                    var npc = view.Npc;
                    if (!view.Visible || npc.Bark == null || npc.BarkUntil < now) continue;
                    Vector3 anchor = view.SpeechAnchor;
                    float dist = Vector3.Distance(camPos, anchor);
                    if (dist > 11f) continue;
                    Vector3 screen = cam.WorldToScreenPoint(anchor);
                    if (screen.z <= 0f) continue;
                    if (Physics.Linecast(camPos, anchor, out RaycastHit hit) && hit.collider.GetComponentInParent<NpcView>() != view) continue;
                    var label = _speech[used++];
                    label.gameObject.SetActive(true);
                    label.text = $"<color=#c8c8a0>{npc.ShortName}:</color> {npc.Bark}";
                    label.fontSize = dist < 5f ? 24 : 20;
                    label.rectTransform.anchoredPosition = new Vector2(screen.x, screen.y) / scale;
                }
            }
            for (int i = used; i < _speech.Count; i++)
                if (_speech[i].gameObject.activeSelf) _speech[i].gameObject.SetActive(false);
        }
    }
}
