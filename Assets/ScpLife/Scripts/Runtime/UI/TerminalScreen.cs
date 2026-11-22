using System.Collections.Generic;
using System.Text;
using ScpLife.Core;
using UnityEngine;
using UnityEngine.UI;

namespace ScpLife.Runtime
{
    /// <summary>
    /// The duty officer terminal at the security post. Everything shown here is what the
    /// facility's systems actually recorded (cameras, readers, reports) — not omniscient data.
    /// </summary>
    public sealed class TerminalScreen : MonoBehaviour
    {
        private enum Tab { Cameras, Access, Events, Staff, Tasks, Report, Archive }

        public bool IsOpen { get; private set; }

        private RectTransform _root;
        private Text _header, _body, _camInfo, _camOverlay, _reportResult, _pageLabel;
        private RawImage _feed;
        private RectTransform _camPanel, _textPanel, _reportPanel;
        private Button _observeButton;
        private Tab _tab = Tab.Cameras;
        private int _page;
        private float _refresh;
        private float _cameraViewTime;
        private string _lastCameraId;
        private readonly Dictionary<Tab, Image> _tabButtons = new Dictionary<Tab, Image>();

        private static GameBootstrap G => GameBootstrap.Instance;

        public void Build(Canvas canvas)
        {
            var bg = UiFactory.Image("Terminal", canvas.transform, new Color(0.02f, 0.04f, 0.035f, 0.97f));
            _root = bg.rectTransform;
            UiFactory.Stretch(_root);

            _header = UiFactory.Text("Header", _root, "", 30, TextAnchor.MiddleLeft, new Color(0.5f, 1f, 0.6f));
            UiFactory.Place(_header.rectTransform, new Vector2(0f, 1f), new Vector2(1500f, 60f), new Vector2(30f, -10f));
            var close = UiFactory.Button("Close", _root, "ЗАКРЫТЬ ✕", 28, Close);
            UiFactory.Place((RectTransform)close.transform, new Vector2(1f, 1f), new Vector2(240f, 70f), new Vector2(-20f, -10f));

            string[] names = { "КАМЕРЫ", "ДОСТУП", "СОБЫТИЯ", "ПЕРСОНАЛ", "ЗАДАЧИ", "РАПОРТ", "АРХИВ SCP" };
            for (int i = 0; i < names.Length; i++)
            {
                var tab = (Tab)i;
                var b = UiFactory.Button("Tab" + i, _root, names[i], 24, () => SelectTab(tab));
                UiFactory.Place((RectTransform)b.transform, new Vector2(0f, 1f), new Vector2(240f, 64f), new Vector2(30f + i * 252f, -84f));
                _tabButtons[tab] = b.GetComponent<Image>();
            }

            // Cameras panel.
            _camPanel = UiFactory.Rect("Cameras", _root);
            UiFactory.Stretch(_camPanel);
            _camPanel.offsetMax = new Vector2(-20f, -160f);
            _camPanel.offsetMin = new Vector2(20f, 20f);
            var feedFrame = UiFactory.Image("FeedFrame", _camPanel, new Color(0.1f, 0.15f, 0.12f, 1f));
            UiFactory.Place(feedFrame.rectTransform, new Vector2(0f, 1f), new Vector2(1160f, 660f), new Vector2(10f, 0f));
            var feedGo = UiFactory.Rect("Feed", feedFrame.transform);
            UiFactory.Stretch(feedGo, 6f);
            _feed = feedGo.gameObject.AddComponent<RawImage>();
            var scan = UiFactory.Rect("Scan", feedFrame.transform);
            UiFactory.Stretch(scan, 6f);
            var scanImg = scan.gameObject.AddComponent<RawImage>();
            scanImg.texture = ProceduralTextures.Scanlines(4);
            scanImg.uvRect = new Rect(0f, 0f, 1f, 160f);
            scanImg.raycastTarget = false;
            _camOverlay = UiFactory.Text("Overlay", feedFrame.transform, "", 26, TextAnchor.UpperLeft, new Color(0.9f, 1f, 0.9f));
            UiFactory.Stretch(_camOverlay.rectTransform, 18f);
            _camOverlay.gameObject.AddComponent<Shadow>();

            _camInfo = UiFactory.Text("Info", _camPanel, "", 24, TextAnchor.UpperLeft, UiFactory.TextColor);
            UiFactory.Place(_camInfo.rectTransform, new Vector2(1f, 1f), new Vector2(680f, 480f), new Vector2(-10f, 0f));
            var prev = UiFactory.Button("Prev", _camPanel, "◀ ПРЕД.", 26, () => { G.Cctv.Select(G.Cctv.SelectedIndex - 1); _cameraViewTime = 0f; });
            UiFactory.Place((RectTransform)prev.transform, new Vector2(1f, 0f), new Vector2(320f, 90f), new Vector2(-370f, 100f));
            var next = UiFactory.Button("Next", _camPanel, "СЛЕД. ▶", 26, () => { G.Cctv.Select(G.Cctv.SelectedIndex + 1); _cameraViewTime = 0f; });
            UiFactory.Place((RectTransform)next.transform, new Vector2(1f, 0f), new Vector2(320f, 90f), new Vector2(-30f, 100f));
            _observeButton = UiFactory.Button("Observe", _camPanel, "НАБЛЮДАТЬ ЗА ОБЪЕКТОМ", 24, ObserveViaCamera);
            UiFactory.Place((RectTransform)_observeButton.transform, new Vector2(1f, 0f), new Vector2(660f, 80f), new Vector2(-30f, 0f));

            // Generic text panel with paging.
            _textPanel = UiFactory.Rect("TextPanel", _root);
            UiFactory.Stretch(_textPanel);
            _textPanel.offsetMax = new Vector2(-20f, -160f);
            _textPanel.offsetMin = new Vector2(20f, 20f);
            var textBg = UiFactory.Image("Bg", _textPanel, new Color(0f, 0f, 0f, 0.35f));
            UiFactory.Stretch(textBg.rectTransform);
            textBg.rectTransform.offsetMax = new Vector2(-140f, 0f);
            _body = UiFactory.Text("Body", textBg.transform, "", 24, TextAnchor.UpperLeft, new Color(0.75f, 0.95f, 0.8f));
            UiFactory.Stretch(_body.rectTransform, 16f);
            var up = UiFactory.Button("Up", _textPanel, "▲", 40, () => { _page = Mathf.Max(0, _page - 1); _refresh = 0f; });
            UiFactory.Place((RectTransform)up.transform, new Vector2(1f, 1f), new Vector2(120f, 120f), Vector2.zero);
            var down = UiFactory.Button("Down", _textPanel, "▼", 40, () => { _page++; _refresh = 0f; });
            UiFactory.Place((RectTransform)down.transform, new Vector2(1f, 0f), new Vector2(120f, 120f), Vector2.zero);
            _pageLabel = UiFactory.Text("Page", _textPanel, "", 22, TextAnchor.MiddleCenter, UiFactory.Dim);
            UiFactory.Place(_pageLabel.rectTransform, new Vector2(1f, 0.5f), new Vector2(120f, 60f), Vector2.zero);

            // Report panel.
            _reportPanel = UiFactory.Rect("Report", _root);
            UiFactory.Stretch(_reportPanel);
            _reportPanel.offsetMax = new Vector2(-20f, -160f);
            _reportPanel.offsetMin = new Vector2(20f, 20f);
            var info = UiFactory.Text("Info", _reportPanel,
                "Рапорт о происшествии передаётся диспетчеру смены. Диспетчер действует только на основании ваших личных наблюдений: " +
                "перед рапортом осмотрите объект через окно наблюдательного пункта или по камере К-06.", 26, TextAnchor.UpperLeft, UiFactory.TextColor);
            UiFactory.Place(info.rectTransform, new Vector2(0.5f, 1f), new Vector2(1500f, 160f), new Vector2(0f, -20f));
            info.rectTransform.pivot = new Vector2(0.5f, 1f);
            var report = UiFactory.Button("Send", _reportPanel, "ПОДАТЬ РАПОРТ", 30, SendReport);
            UiFactory.Place((RectTransform)report.transform, new Vector2(0.5f, 0.5f), new Vector2(520f, 110f), new Vector2(0f, 120f));
            ((RectTransform)report.transform).pivot = new Vector2(0.5f, 0.5f);
            _reportResult = UiFactory.Text("Result", _reportPanel, "", 26, TextAnchor.UpperCenter, new Color(0.9f, 0.85f, 0.5f));
            UiFactory.Place(_reportResult.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(1500f, 300f), new Vector2(0f, -60f));
            _reportResult.rectTransform.pivot = new Vector2(0.5f, 1f);

            _root.gameObject.SetActive(false);
        }

        public void Open()
        {
            IsOpen = true;
            _root.gameObject.SetActive(true);
            SelectTab(_tab);
            G.OnModalChanged();
        }

        public void Close()
        {
            IsOpen = false;
            _root.gameObject.SetActive(false);
            G.Cctv.SetActive(false);
            G.Presenter.SetExtraViewRoom(null);
            G.OnModalChanged();
        }

        private void SelectTab(Tab tab)
        {
            _tab = tab;
            _page = 0;
            _refresh = 0f;
            _camPanel.gameObject.SetActive(tab == Tab.Cameras);
            _reportPanel.gameObject.SetActive(tab == Tab.Report);
            _textPanel.gameObject.SetActive(tab != Tab.Cameras && tab != Tab.Report);
            bool cams = tab == Tab.Cameras;
            G.Cctv.SetActive(cams && IsOpen);
            G.Presenter.SetExtraViewRoom(cams ? G.Cctv.SelectedRoomId : null);
            _cameraViewTime = 0f;
            foreach (var kv in _tabButtons) kv.Value.color = kv.Key == tab ? new Color(0.55f, 0.45f, 0.12f, 1f) : UiFactory.ButtonColor;
            if (tab == Tab.Report) _reportResult.text = "";
        }

        private void Update()
        {
            if (!IsOpen || G.World == null) return;
            var w = G.World;
            _header.text = $"ТЕРМИНАЛ ДЕЖУРНОГО · СЕКТОР Б-3 · {GameClock.FormatStamp(w.Now)} · ТРЕВОГА {AlertSystem.LevelName(w.Alert.Level)}";

            if (_tab == Tab.Cameras)
            {
                UpdateCameras(w);
                return;
            }
            _refresh -= Time.unscaledDeltaTime;
            if (_refresh > 0f) return;
            _refresh = 1f;
            List<string> lines;
            switch (_tab)
            {
                case Tab.Access: lines = AccessLines(w); break;
                case Tab.Events: lines = EventLines(w); break;
                case Tab.Staff: lines = StaffLines(w); break;
                case Tab.Tasks: lines = TaskLines(w); break;
                case Tab.Archive: lines = ArchiveLines(w); break;
                default: lines = new List<string>(); break;
            }
            const int perPage = 22;
            int pages = Mathf.Max(1, (lines.Count + perPage - 1) / perPage);
            _page = Mathf.Clamp(_page, 0, pages - 1);
            var sb = new StringBuilder();
            for (int i = _page * perPage; i < Mathf.Min(lines.Count, (_page + 1) * perPage); i++) sb.Append(lines[i]).Append('\n');
            _body.text = sb.ToString();
            _pageLabel.text = $"{_page + 1}/{pages}";
        }

        private void UpdateCameras(SimWorld w)
        {
            var view = G.Cctv.Selected;
            if (view == null) return;
            var cam = view.Camera;
            G.Presenter.SetExtraViewRoom(cam.RoomId);
            _feed.texture = cam.Operational ? (Texture)G.Cctv.Texture : Texture2D.blackTexture;
            bool rec = Mathf.Repeat(Time.unscaledTime, 1.4f) < 0.7f;
            _camOverlay.text = $"{cam.Name}\n{GameClock.FormatStamp(w.Now)}  {(rec ? "<color=#ff4040>● ЗАПИСЬ</color>" : "")}" +
                               (cam.Operational ? "" : "\n\n<color=#ff5050>НЕТ СИГНАЛА</color>");

            if (_lastCameraId != cam.Id)
            {
                _lastCameraId = cam.Id;
                _cameraViewTime = 0f;
            }
            _cameraViewTime += Time.unscaledDeltaTime;
            bool counted = w.Player.CamerasViewedThisShift.Contains(cam.Id);
            if (_cameraViewTime > 1.5f && !counted) w.PlayerViewedCamera(cam.Id);

            var sb = new StringBuilder();
            sb.Append($"<b>{cam.Name}</b>\nПомещение: {w.RoomName(cam.RoomId)}\n");
            sb.Append(counted ? "<color=#7c7>Проверена в эту смену</color>\n\n" : "<color=#cc7>Проверка…</color>\n\n");
            sb.Append("<b>В кадре:</b>\n");
            if (cam.Visible.Count == 0) sb.Append("  никого\n");
            foreach (string id in cam.Visible)
            {
                var npc = w.GetNpc(id);
                string extra = npc != null ? $" — {NpcText.ActivityName(npc.Activity).ToLowerInvariant()}" : "";
                var anomaly = w.GetAnomaly(id);
                if (anomaly != null) extra = $" — <color=#f88>{anomaly.Behaviour.StatusText}</color>";
                sb.Append($"  • {w.NameOf(id)}{extra}\n");
            }
            sb.Append($"\nКамера {G.Cctv.SelectedIndex + 1} из {G.Cctv.Views.Count}");
            _camInfo.text = sb.ToString();
            bool chamber = w.Facility.GetRoom(cam.RoomId)?.Type == RoomType.Containment;
            _observeButton.gameObject.SetActive(chamber && cam.Operational);
        }

        private void ObserveViaCamera()
        {
            var w = G.World;
            var cam = G.Cctv.Selected?.Camera;
            if (cam == null) return;
            foreach (var a in w.Anomalies)
            {
                if (!cam.Visible.Contains(a.Id) && a.Agent.RoomId != cam.RoomId) continue;
                string report = w.PlayerObserveAnomaly(a.Id, true);
                G.Menus.ShowDialogue("Камера " + cam.Name, new[] { report });
                return;
            }
            G.Menus.ShowDialogue("Камера " + cam.Name, new[] { "Объекта в поле зрения камеры нет." });
        }

        private void SendReport()
        {
            string result = G.World.PlayerReportIncident();
            _reportResult.text = "Ответ диспетчера: " + result;
            GameAudio.Instance?.PlayUi(GameAudio.Instance.BeepGranted);
        }

        // ------------------------------------------------------------------ content

        private static List<string> AccessLines(SimWorld w)
        {
            var lines = new List<string> { "<b>ЖУРНАЛ СЧИТЫВАТЕЛЕЙ (последние записи сверху)</b>", "" };
            var entries = w.AccessLog.Entries;
            for (int i = entries.Count - 1; i >= 0 && lines.Count < 200; i--)
            {
                var e = entries[i];
                string door = w.Facility.GetDoor(e.DoorId)?.Name ?? e.DoorId;
                string color = e.Success ? "#8f8" : e.Result == AccessResult.AwaitingSecondCard ? "#ee8" : "#f77";
                lines.Add($"{GameClock.FormatStamp(e.Time)}  {door,-34}  {e.CardOwnerName,-26} <color={color}>{AccessText.ResultText(e.Result)}</color>");
            }
            return lines;
        }

        private static List<string> EventLines(SimWorld w)
        {
            var lines = new List<string> { "<b>СОБЫТИЯ, ЗАФИКСИРОВАННЫЕ СИСТЕМАМИ СЕКТОРА</b>", "" };
            var events = w.Events.Recent;
            for (int i = events.Count - 1; i >= 0 && lines.Count < 200; i--)
            {
                var e = events[i];
                bool covered = e.RoomId != null && w.Surveillance.RoomCovered(e.RoomId);
                bool relevant = e.Public || e.ActorId == PlayerState.PlayerId || e.TargetId == PlayerState.PlayerId ||
                                e.Type == EventType.DoorDenied || e.Type == EventType.ReaderMalfunction || e.Type == EventType.Report ||
                                e.Type == EventType.SuspiciousActivity || e.Type == EventType.ContainmentWarning ||
                                (covered && (e.Type == EventType.AnomalyBehaviour || e.Type == EventType.Conflict || e.Type == EventType.Injury ||
                                             e.Type == EventType.Treatment));
                if (!relevant || e.Type == EventType.Conversation) continue;
                string color = e.Severity >= 3 ? "#f55" : e.Severity == 2 ? "#fa6" : e.Severity == 1 ? "#ee8" : "#9c9";
                lines.Add($"{GameClock.FormatStamp(e.Time)} <color={color}>[{EventText.TypeName(e.Type)}]</color> {e.Text}");
            }
            return lines;
        }

        private static List<string> StaffLines(SimWorld w)
        {
            var lines = new List<string>
            {
                "<b>ПЕРСОНАЛ СЕКТОРА</b> — по графику и по последней фиксации камерами",
                "<color=#8a9>Система знает только то, что видели камеры. График — это план, а не факт.</color>",
                ""
            };
            foreach (var npc in w.Npcs)
            {
                var block = npc.Schedule.At(w.Clock.MinuteOfDay);
                string planned = block != null ? $"{block.Label} ({w.RoomName(block.RoomId == "@bed" ? w.Facility.GetPoi(npc.BedPoiId)?.RoomId : block.RoomId)})" : "—";
                string seen = "не фиксировался";
                foreach (var cam in w.Surveillance.Cameras)
                    if (cam.Visible.Contains(npc.Id)) seen = $"<color=#8f8>сейчас: {cam.Name}</color>";
                if (!seen.StartsWith("<color"))
                {
                    var log = w.Surveillance.Log;
                    for (int i = log.Count - 1; i >= 0; i--)
                        if (log[i].SubjectId == npc.Id)
                        {
                            var cam = w.Surveillance.Get(log[i].CameraId);
                            seen = $"{GameClock.FormatTime(log[i].Time)}, {cam?.Name ?? log[i].CameraId}";
                            break;
                        }
                }
                var card = w.GetCard(npc.KeycardId);
                lines.Add($"<b>{npc.DisplayName}</b> · {NpcText.RoleName(npc.Role)} · карта {card?.Level}");
                lines.Add($"   по графику: {planned}");
                lines.Add($"   камеры: {seen}");
            }
            return lines;
        }

        private static List<string> TaskLines(SimWorld w)
        {
            var lines = new List<string> { "<b>ЗАДАЧИ И ЖУРНАЛ ОХРАННИКА</b>", "" };
            foreach (var t in w.Tasks.ActiveFor(PlayerState.PlayerId))
            {
                lines.Add($"<color=#ee8>АКТИВНО</color> {t.Title} {t.ProgressText} — срок {GameClock.FormatTime(t.Deadline)} (выдал: {t.IssuedBy})");
                lines.Add($"   {t.Description}");
            }
            lines.Add("");
            lines.Add("<b>Последние задачи</b>");
            int shown = 0;
            for (int i = w.Tasks.Tasks.Count - 1; i >= 0 && shown < 12; i--)
            {
                var t = w.Tasks.Tasks[i];
                if (t.IsActive) continue;
                string who = t.AssigneeId == PlayerState.PlayerId ? "вы" : w.NameOf(t.AssigneeId);
                string st = t.Status == DutyTaskStatus.Completed ? "<color=#8f8>выполнено</color>" : "<color=#f77>провалено</color>";
                lines.Add($"{GameClock.FormatStamp(t.Issued)} {st} {t.Title} ({who})");
                shown++;
            }
            lines.Add("");
            lines.Add("<b>Личный журнал</b>");
            var journal = w.Player.Journal;
            for (int i = journal.Count - 1; i >= 0 && i >= journal.Count - 10; i--) lines.Add(journal[i]);
            return lines;
        }

        private static List<string> ArchiveLines(SimWorld w)
        {
            var c = w.Catalog;
            var lines = new List<string> { $"<b>АРХИВ АНОМАЛИЙ</b> — записей: {c.Count}" };
            if (c.Count <= 1)
                lines.Add("<color=#fa6>Каталог scp_life_120_original_anomalies.json не подключён: доступна только запись прототипа. " +
                          "Положите файл в Assets/ScpLife/Resources/ScpLife/Data/ (см. Docs/STAGE1.md).</color>");
            foreach (string warn in c.Warnings) lines.Add($"<color=#fa6>{warn}</color>");
            lines.Add("");
            foreach (var def in c.Entries)
            {
                bool simulated = AnomalyBehaviourRegistry.HasBehaviour(def.Id);
                lines.Add($"<b>{def.Id} «{def.Name}»</b> · класс {def.ObjectClass} · {KindName(def.Kind)}" +
                          (simulated ? " · <color=#8f8>поведение смоделировано</color>" : " · <color=#999>только данные</color>"));
                if (!string.IsNullOrEmpty(def.Description)) lines.Add("   " + Trim(def.Description, 220));
                if (!string.IsNullOrEmpty(def.Containment)) lines.Add("   <color=#9ab>Содержание:</color> " + Trim(def.Containment, 220));
                if (def.Triggers.Count > 0) lines.Add("   <color=#9ab>Триггеры:</color> " + Trim(string.Join("; ", def.Triggers), 220));
            }
            return lines;
        }

        private static string KindName(AnomalyKind k)
        {
            switch (k)
            {
                case AnomalyKind.Sapient: return "разумный";
                case AnomalyKind.Creature: return "существо";
                case AnomalyKind.Object: return "предмет";
                case AnomalyKind.Phenomenon: return "явление";
                case AnomalyKind.Biological: return "биологический";
                case AnomalyKind.Location: return "локация";
                default: return "не классифицирован";
            }
        }

        private static string Trim(string s, int max) => s.Length > max ? s.Substring(0, max - 1) + "…" : s;
    }
}
