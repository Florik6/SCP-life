using System.Collections.Generic;
using System.Text;
using ScpLife.Core;
using UnityEngine;
using UnityEngine.UI;

namespace ScpLife.Runtime
{
    /// <summary>Main menu, pause menu, settings, dialogue, journal and death screen.</summary>
    public sealed class MenuScreens : MonoBehaviour
    {
        private RectTransform _main, _pause, _settings, _dialogue, _death, _journal;
        private Text _dialogueTitle, _dialogueBody, _deathText, _journalText, _timeScaleLabel, _mainStatus;
        private Button _continueButton;
        private readonly Dictionary<string, Text> _settingLabels = new Dictionary<string, Text>();
        private bool _settingsFromMain;

        public bool MainOpen => _main.gameObject.activeSelf;
        public bool IsModalOpen => _main.gameObject.activeSelf || _pause.gameObject.activeSelf || _settings.gameObject.activeSelf ||
                                   _dialogue.gameObject.activeSelf || _death.gameObject.activeSelf || _journal.gameObject.activeSelf;
        public bool DialogueOpen => _dialogue.gameObject.activeSelf;

        private static GameBootstrap G => GameBootstrap.Instance;

        public void Build(Canvas canvas)
        {
            // --- main menu ---
            var main = UiFactory.Image("MainMenu", canvas.transform, new Color(0.015f, 0.02f, 0.025f, 1f));
            _main = main.rectTransform;
            UiFactory.Stretch(_main);
            var title = UiFactory.Text("Title", _main, "SCP LIFE", 120, TextAnchor.MiddleCenter, new Color(0.9f, 0.9f, 0.85f));
            UiFactory.Place(title.rectTransform, new Vector2(0.5f, 1f), new Vector2(1400f, 160f), new Vector2(0f, -90f));
            title.rectTransform.pivot = new Vector2(0.5f, 1f);
            var subtitle = UiFactory.Text("Subtitle", _main, "ЗОНА-19 · УРОВЕНЬ 3 · СЕКТОР СОДЕРЖАНИЯ Б-3", 30, TextAnchor.MiddleCenter, UiFactory.Accent);
            UiFactory.Place(subtitle.rectTransform, new Vector2(0.5f, 1f), new Vector2(1400f, 50f), new Vector2(0f, -250f));
            subtitle.rectTransform.pivot = new Vector2(0.5f, 1f);
            var col = UiFactory.Column("Buttons", _main, new Vector2(620f, 520f), 18f);
            col.anchoredPosition = new Vector2(0f, -110f);
            _continueButton = UiFactory.Button("Continue", col, "ПРОДОЛЖИТЬ СМЕНУ", 34, () => G.ContinueGame());
            UiFactory.Height(_continueButton, 96f);
            UiFactory.Height(UiFactory.Button("New", col, "НОВАЯ СМЕНА — ОХРАННИК", 34, () => G.StartNewGame()), 96f);
            UiFactory.Height(UiFactory.Button("Settings", col, "НАСТРОЙКИ", 34, () => OpenSettings(true)), 96f);
            UiFactory.Height(UiFactory.Button("Quit", col, "ВЫХОД", 34, () => Application.Quit()), 96f);
            _mainStatus = UiFactory.Text("Status", _main, "", 22, TextAnchor.LowerCenter, UiFactory.Dim);
            UiFactory.Place(_mainStatus.rectTransform, new Vector2(0.5f, 0f), new Vector2(1700f, 120f), new Vector2(0f, 20f));
            _mainStatus.rectTransform.pivot = new Vector2(0.5f, 0f);

            // --- pause menu ---
            var pause = UiFactory.Image("Pause", canvas.transform, new Color(0f, 0f, 0f, 0.8f));
            _pause = pause.rectTransform;
            UiFactory.Stretch(_pause);
            var pcol = UiFactory.Column("Buttons", _pause, new Vector2(620f, 760f), 14f);
            UiFactory.Height(UiFactory.Button("Resume", pcol, "ПРОДОЛЖИТЬ", 32, ClosePause), 84f);
            UiFactory.Height(UiFactory.Button("Save", pcol, "СОХРАНИТЬ", 32, () => G.SaveGame(true)), 84f);
            UiFactory.Height(UiFactory.Button("Load", pcol, "ЗАГРУЗИТЬ", 32, () => G.ContinueGame()), 84f);
            UiFactory.Height(UiFactory.Button("Journal", pcol, "ЖУРНАЛ", 32, OpenJournal), 84f);
            UiFactory.Height(UiFactory.Button("Settings", pcol, "НАСТРОЙКИ", 32, () => OpenSettings(false)), 84f);
            var ts = UiFactory.Button("TimeScale", pcol, "СКОРОСТЬ ВРЕМЕНИ: x1", 32, () => G.CycleTimeScale(), out _timeScaleLabel);
            UiFactory.Height(ts, 84f);
            UiFactory.Height(UiFactory.Button("Menu", pcol, "В ГЛАВНОЕ МЕНЮ (с сохранением)", 30, () => G.ReturnToMainMenu()), 84f);

            // --- settings ---
            var settings = UiFactory.Image("Settings", canvas.transform, new Color(0.02f, 0.025f, 0.03f, 0.97f));
            _settings = settings.rectTransform;
            UiFactory.Stretch(_settings);
            var scol = UiFactory.Column("Rows", _settings, new Vector2(1100f, 820f), 12f);
            SettingRow(scol, "sens", "Чувствительность обзора", () => G.ChangeSetting("sens", -1), () => G.ChangeSetting("sens", 1));
            SettingRow(scol, "invert", "Инверсия по вертикали", () => G.ChangeSetting("invert", 0), () => G.ChangeSetting("invert", 0));
            SettingRow(scol, "quality", "Качество графики", () => G.ChangeSetting("quality", -1), () => G.ChangeSetting("quality", 1));
            SettingRow(scol, "fps", "Частота кадров", () => G.ChangeSetting("fps", 0), () => G.ChangeSetting("fps", 0));
            SettingRow(scol, "volume", "Громкость", () => G.ChangeSetting("volume", -1), () => G.ChangeSetting("volume", 1));
            SettingRow(scol, "touch", "Сенсорное управление на ПК", () => G.ChangeSetting("touch", 0), () => G.ChangeSetting("touch", 0));
            UiFactory.Height(UiFactory.Button("Back", scol, "НАЗАД", 32, CloseSettings), 90f);

            // --- dialogue ---
            var dialogue = UiFactory.Image("Dialogue", canvas.transform, new Color(0.03f, 0.035f, 0.04f, 0.94f));
            _dialogue = dialogue.rectTransform;
            UiFactory.Place(_dialogue, new Vector2(0.5f, 0f), new Vector2(1500f, 460f), new Vector2(0f, 40f));
            _dialogue.pivot = new Vector2(0.5f, 0f);
            _dialogueTitle = UiFactory.Text("Title", _dialogue, "", 32, TextAnchor.UpperLeft, UiFactory.Accent);
            UiFactory.Place(_dialogueTitle.rectTransform, new Vector2(0f, 1f), new Vector2(1440f, 50f), new Vector2(30f, -16f));
            _dialogueBody = UiFactory.Text("Body", _dialogue, "", 26, TextAnchor.UpperLeft, UiFactory.TextColor);
            UiFactory.Place(_dialogueBody.rectTransform, new Vector2(0f, 1f), new Vector2(1440f, 300f), new Vector2(30f, -70f));
            var closeDialogue = UiFactory.Button("Close", _dialogue, "ЗАКРЫТЬ", 28, CloseDialogue);
            UiFactory.Place((RectTransform)closeDialogue.transform, new Vector2(1f, 0f), new Vector2(260f, 76f), new Vector2(-24f, 20f));

            // --- journal ---
            var journal = UiFactory.Image("Journal", canvas.transform, new Color(0.02f, 0.025f, 0.03f, 0.97f));
            _journal = journal.rectTransform;
            UiFactory.Stretch(_journal);
            _journalText = UiFactory.Text("Text", _journal, "", 24, TextAnchor.UpperLeft, UiFactory.TextColor);
            UiFactory.Stretch(_journalText.rectTransform, 40f);
            _journalText.rectTransform.offsetMin = new Vector2(40f, 140f);
            var closeJournal = UiFactory.Button("Close", _journal, "НАЗАД", 30, () => _journal.gameObject.SetActive(false));
            UiFactory.Place((RectTransform)closeJournal.transform, new Vector2(0.5f, 0f), new Vector2(360f, 90f), new Vector2(0f, 30f));
            ((RectTransform)closeJournal.transform).pivot = new Vector2(0.5f, 0f);

            // --- death ---
            var death = UiFactory.Image("Death", canvas.transform, new Color(0.15f, 0f, 0f, 0.92f));
            _death = death.rectTransform;
            UiFactory.Stretch(_death);
            _deathText = UiFactory.Text("Text", _death, "", 40, TextAnchor.MiddleCenter, Color.white);
            UiFactory.Place(_deathText.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(1500f, 300f), new Vector2(0f, 200f));
            _deathText.rectTransform.pivot = new Vector2(0.5f, 0.5f);
            var dcol = UiFactory.Column("Buttons", _death, new Vector2(620f, 320f), 16f);
            dcol.anchoredPosition = new Vector2(0f, -150f);
            UiFactory.Height(UiFactory.Button("Load", dcol, "ЗАГРУЗИТЬ СОХРАНЕНИЕ", 32, () => G.ContinueGame()), 90f);
            UiFactory.Height(UiFactory.Button("New", dcol, "НОВАЯ СМЕНА", 32, () => G.StartNewGame()), 90f);
            UiFactory.Height(UiFactory.Button("Menu", dcol, "ГЛАВНОЕ МЕНЮ", 32, () => G.ShowMainMenu()), 90f);

            HideAll();
        }

        private void SettingRow(Transform parent, string key, string label, System.Action minus, System.Action plus)
        {
            var row = UiFactory.Image("Row_" + key, parent, UiFactory.PanelLight);
            UiFactory.Height(row, 96f);
            var name = UiFactory.Text("Name", row.transform, label, 28, TextAnchor.MiddleLeft, UiFactory.TextColor);
            UiFactory.Place(name.rectTransform, new Vector2(0f, 0.5f), new Vector2(560f, 80f), new Vector2(24f, 0f));
            name.rectTransform.pivot = new Vector2(0f, 0.5f);
            var m = UiFactory.Button("Minus", row.transform, "◀", 34, minus);
            UiFactory.Place((RectTransform)m.transform, new Vector2(1f, 0.5f), new Vector2(90f, 76f), new Vector2(-380f, 0f));
            ((RectTransform)m.transform).pivot = new Vector2(1f, 0.5f);
            var value = UiFactory.Text("Value", row.transform, "", 28, TextAnchor.MiddleCenter, UiFactory.Accent);
            UiFactory.Place(value.rectTransform, new Vector2(1f, 0.5f), new Vector2(260f, 76f), new Vector2(-115f, 0f));
            value.rectTransform.pivot = new Vector2(1f, 0.5f);
            var p = UiFactory.Button("Plus", row.transform, "▶", 34, plus);
            UiFactory.Place((RectTransform)p.transform, new Vector2(1f, 0.5f), new Vector2(90f, 76f), new Vector2(-20f, 0f));
            ((RectTransform)p.transform).pivot = new Vector2(1f, 0.5f);
            _settingLabels[key] = value;
        }

        public void RefreshSettings(GameSettings s)
        {
            Set("sens", s.Sensitivity.ToString("0.0"));
            Set("invert", s.InvertY ? "ВКЛ" : "ВЫКЛ");
            Set("quality", GameSettings.QualityName(s.Quality));
            Set("fps", s.TargetFps + " FPS");
            Set("volume", Mathf.RoundToInt(s.Volume * 100f) + "%");
            Set("touch", s.ForceTouchControls ? "ВКЛ" : "ВЫКЛ");
        }

        private void Set(string key, string value)
        {
            if (_settingLabels.TryGetValue(key, out var t)) t.text = value;
        }

        public void HideAll()
        {
            _main.gameObject.SetActive(false);
            _pause.gameObject.SetActive(false);
            _settings.gameObject.SetActive(false);
            _dialogue.gameObject.SetActive(false);
            _death.gameObject.SetActive(false);
            _journal.gameObject.SetActive(false);
        }

        public void ShowMain(bool hasSave, string status)
        {
            HideAll();
            _main.gameObject.SetActive(true);
            _continueButton.interactable = hasSave;
            _mainStatus.text = status;
        }

        public void OpenPause()
        {
            _pause.gameObject.SetActive(true);
            _timeScaleLabel.text = $"СКОРОСТЬ ВРЕМЕНИ: x{G.TimeScale}";
            G.OnModalChanged();
        }

        public void ClosePause()
        {
            _pause.gameObject.SetActive(false);
            _journal.gameObject.SetActive(false);
            G.OnModalChanged();
        }

        public bool PauseOpen => _pause.gameObject.activeSelf;

        public void SetTimeScaleLabel(int scale)
        {
            if (_timeScaleLabel != null) _timeScaleLabel.text = $"СКОРОСТЬ ВРЕМЕНИ: x{scale}";
        }

        private void OpenSettings(bool fromMain)
        {
            _settingsFromMain = fromMain;
            RefreshSettings(G.Settings);
            _settings.gameObject.SetActive(true);
            _settings.SetAsLastSibling();
        }

        private void CloseSettings()
        {
            _settings.gameObject.SetActive(false);
            G.Settings.Save();
            if (_settingsFromMain) _main.gameObject.SetActive(true);
        }

        public void ShowDialogue(string title, IList<string> lines)
        {
            _dialogueTitle.text = title;
            var sb = new StringBuilder();
            foreach (string l in lines) sb.Append(l).Append('\n');
            _dialogueBody.text = sb.ToString();
            _dialogue.gameObject.SetActive(true);
            _dialogue.SetAsLastSibling();
            G.OnModalChanged();
        }

        public void CloseDialogue()
        {
            _dialogue.gameObject.SetActive(false);
            G.OnModalChanged();
        }

        private void OpenJournal()
        {
            var w = G.World;
            var sb = new StringBuilder("<b>ЖУРНАЛ ОХРАННИКА</b>\n\n");
            if (w != null)
            {
                var journal = w.Player.Journal;
                for (int i = journal.Count - 1; i >= 0 && i >= journal.Count - 24; i--) sb.Append(journal[i]).Append('\n');
            }
            _journalText.text = sb.ToString();
            _journal.gameObject.SetActive(true);
            _journal.SetAsLastSibling();
        }

        public void ShowDeath(string cause)
        {
            HideAll();
            _deathText.text = "ВЫ ПОГИБЛИ\n\n<size=28>" + cause + "</size>";
            _death.gameObject.SetActive(true);
            G.OnModalChanged();
        }
    }
}
