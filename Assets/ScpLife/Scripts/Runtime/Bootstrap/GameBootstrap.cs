using System.Collections.Generic;
using ScpLife.Core;
using UnityEngine;

namespace ScpLife.Runtime
{
    /// <summary>
    /// Entry point. Creates all subsystems from code, so the game runs from any scene
    /// (an empty scene is enough). Owns the fixed-step simulation loop and connects the
    /// simulation with its 3D presentation, input, UI, audio and saving.
    /// </summary>
    public sealed class GameBootstrap : MonoBehaviour
    {
        public static GameBootstrap Instance { get; private set; }

        public const string CatalogResource = "ScpLife/Data/scp_life_120_original_anomalies";
        private const float AutosaveInterval = 120f;

        public SimWorld World { get; private set; }
        public HudController Hud { get; private set; }
        public TerminalScreen Terminal { get; private set; }
        public MenuScreens Menus { get; private set; }
        public PlayerController Player { get; private set; }
        public FacilityPresenter Presenter { get; private set; }
        public CctvSystem Cctv { get; private set; }
        public GameSettings Settings { get; private set; }
        public InputRouter Input { get; private set; }
        public int TimeScale { get; private set; } = 1;

        private MaterialLibrary _materials;
        private SaveManager _saves;
        private GameAudio _audio;
        private MobileControls _mobile;
        private Camera _menuCamera;
        private AudioListener _menuListener;
        private GameObject _worldRoot;
        private FacilityView _facility;
        private readonly List<NpcView> _npcViews = new List<NpcView>();
        private readonly List<TallymanView> _anomalyViews = new List<TallymanView>();
        private float _accumulator;
        private float _autosaveTimer;
        private bool _playing;
        private bool _deathShown;
        private string _catalogJson;
        private string _catalogStatus;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void AutoCreate()
        {
            if (FindFirstObjectByType<GameBootstrap>() == null) new GameObject("SCP LIFE").AddComponent<GameBootstrap>();
        }

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            Settings = GameSettings.Load();
            _saves = new SaveManager();
            PerformanceManager.ConfigureEnvironment();
            _materials = new MaterialLibrary();
            UiFactory.LoadFont();

            _audio = new GameObject("Audio").AddComponent<GameAudio>();
            _audio.transform.SetParent(transform, false);
            _audio.Init();

            Input = gameObject.AddComponent<InputRouter>();
            UiFactory.EnsureEventSystem();
            var hudCanvas = UiFactory.CreateCanvas("HUD Canvas", 10);
            hudCanvas.transform.SetParent(transform, false);
            Hud = hudCanvas.gameObject.AddComponent<HudController>();
            Hud.Build(hudCanvas);
            var mobileCanvas = UiFactory.CreateCanvas("Touch Canvas", 15);
            mobileCanvas.transform.SetParent(transform, false);
            _mobile = mobileCanvas.gameObject.AddComponent<MobileControls>();
            _mobile.Build(mobileCanvas, false);
            Input.Mobile = _mobile;
            var termCanvas = UiFactory.CreateCanvas("Terminal Canvas", 20);
            termCanvas.transform.SetParent(transform, false);
            Terminal = termCanvas.gameObject.AddComponent<TerminalScreen>();
            Terminal.Build(termCanvas);
            var menuCanvas = UiFactory.CreateCanvas("Menu Canvas", 30);
            menuCanvas.transform.SetParent(transform, false);
            Menus = menuCanvas.gameObject.AddComponent<MenuScreens>();
            Menus.Build(menuCanvas);

            _menuCamera = new GameObject("MenuCamera").AddComponent<Camera>();
            _menuCamera.transform.SetParent(transform, false);
            _menuCamera.clearFlags = CameraClearFlags.SolidColor;
            _menuCamera.backgroundColor = Color.black;
            _menuCamera.cullingMask = 0;
            _menuListener = _menuCamera.gameObject.AddComponent<AudioListener>();

            var catalog = Resources.Load<TextAsset>(CatalogResource);
            _catalogJson = catalog != null ? catalog.text : null;
            _catalogStatus = catalog != null
                ? "Каталог аномалий подключён."
                : "Каталог scp_life_120_original_anomalies.json не найден в Resources/ScpLife/Data — используется запись прототипа SCP-L-001.";

            ApplySettings();
            ShowMainMenu();
        }

        // ------------------------------------------------------------------ game flow

        public void ShowMainMenu()
        {
            DestroyWorld();
            _playing = false;
            Hud.SetVisible(false);
            _mobile.SetActive(false);
            _menuCamera.enabled = true;
            _menuListener.enabled = true;
            string controls = Settings.UseTouch
                ? "Управление: джойстик слева — движение, свайп справа — обзор, кнопки справа — действия."
                : "Управление: WASD — движение, мышь — обзор (клик для захвата), E — использовать, F — фонарь, Q — карта, C — протокол счёта, Shift — бег, Esc — меню.";
            Menus.ShowMain(_saves.HasSave, controls + "\n" + _catalogStatus);
            OnModalChanged();
        }

        public void StartNewGame()
        {
            ulong seed = (ulong)System.DateTime.UtcNow.Ticks;
            var world = Stage1Content.CreateWorld(seed, _catalogJson);
            BeginSession(world);
            Message("Смена началась. Вы — сержант охраны сектора Б-3. Проверьте задачи (справа вверху) и терминал дежурного на КПП.",
                new Color(0.9f, 0.85f, 0.5f));
            SaveGame(false);
        }

        public void ContinueGame()
        {
            var world = _saves.Load(_catalogJson);
            if (world == null)
            {
                Menus.ShowMain(_saves.HasSave, "Не удалось загрузить сохранение: " + (_saves.LastError ?? "файл не найден"));
                return;
            }
            BeginSession(world);
            Message($"Сохранение загружено: {GameClock.FormatStamp(world.Now)}", Color.white);
        }

        private void BeginSession(SimWorld world)
        {
            DestroyWorld();
            World = world;
            _deathShown = false;
            _accumulator = 0f;
            _autosaveTimer = AutosaveInterval;
            TimeScale = 1;
            BuildWorldViews();
            Menus.HideAll();
            Hud.SetVisible(true);
            _menuCamera.enabled = false;
            _menuListener.enabled = false;
            _playing = true;
            ApplySettings();
            OnModalChanged();
        }

        public void ReturnToMainMenu()
        {
            if (World != null && !World.Player.Dead) SaveGame(false);
            ShowMainMenu();
        }

        public void SaveGame(bool notify)
        {
            if (World == null || World.Player.Dead) return;
            World.UpdatePlayerTransform(Player.transform.position.ToCore(), Player.Yaw, Player.Pitch);
            bool ok = _saves.Save(World);
            if (notify)
            {
                Message(ok ? $"Игра сохранена ({GameClock.FormatStamp(World.Now)})" : "Ошибка сохранения: " + _saves.LastError,
                    ok ? new Color(0.6f, 1f, 0.6f) : Color.red);
            }
        }

        public void CycleTimeScale()
        {
            TimeScale = TimeScale == 1 ? 2 : TimeScale == 2 ? 4 : 1;
            Menus.SetTimeScaleLabel(TimeScale);
        }

        // ------------------------------------------------------------------ world construction

        private void BuildWorldViews()
        {
            _worldRoot = new GameObject("World");
            _facility = new FacilityBuilder(World, _materials, UiFactory.DefaultFont).Build(_worldRoot.transform);

            Presenter = _worldRoot.AddComponent<FacilityPresenter>();
            Presenter.Init(World, _facility, _materials);

            var npcRoot = new GameObject("NPCs").transform;
            npcRoot.SetParent(_worldRoot.transform, false);
            foreach (var npc in World.Npcs)
            {
                var go = new GameObject("NPC");
                go.transform.SetParent(npcRoot, false);
                var view = go.AddComponent<NpcView>();
                view.Init(npc, _materials);
                _npcViews.Add(view);
            }

            foreach (var anomaly in World.Anomalies)
            {
                if (!(anomaly.Behaviour is TallymanBehaviour)) continue;
                var go = new GameObject("Anomaly");
                go.transform.SetParent(_worldRoot.transform, false);
                var view = go.AddComponent<TallymanView>();
                view.Init(anomaly, World, _materials);
                _anomalyViews.Add(view);
            }

            var camRoot = new GameObject("SecurityCameras").transform;
            camRoot.SetParent(_worldRoot.transform, false);
            Cctv = _worldRoot.AddComponent<CctvSystem>();
            Cctv.Init(384, 216);
            foreach (var cam in World.Surveillance.Cameras)
            {
                var go = new GameObject("Cam");
                go.transform.SetParent(camRoot, false);
                var view = go.AddComponent<SecurityCameraView>();
                view.Init(cam, _materials);
                Cctv.Views.Add(view);
            }

            var playerGo = new GameObject("Player");
            playerGo.transform.SetParent(_worldRoot.transform, false);
            playerGo.AddComponent<CharacterController>();
            Player = playerGo.AddComponent<PlayerController>();
            Player.Init(Input);
            var p = World.Player;
            Player.Teleport(p.Position.ToUnity() + Vector3.up * 0.08f, p.Yaw, p.Pitch);
            Player.Flashlight.enabled = p.FlashlightOn;

            World.PlayerNotified += OnPlayerNotified;
        }

        private void DestroyWorld()
        {
            if (Terminal != null && Terminal.IsOpen) Terminal.Close();
            if (World != null) World.PlayerNotified -= OnPlayerNotified;
            _npcViews.Clear();
            _anomalyViews.Clear();
            if (_worldRoot != null) Destroy(_worldRoot);
            _worldRoot = null;
            World = null;
            Player = null;
            Presenter = null;
            Cctv = null;
            _playing = false;
        }

        // ------------------------------------------------------------------ main loop

        private void Update()
        {
            if (!_playing || World == null || Player == null) return;
            float dt = Time.deltaTime;

            if (Input.Pause)
            {
                if (Terminal.IsOpen) Terminal.Close();
                else if (Menus.DialogueOpen) Menus.CloseDialogue();
                else if (Menus.PauseOpen) Menus.ClosePause();
                else if (!World.Player.Dead) Menus.OpenPause();
            }

            bool paused = Menus.PauseOpen || World.Player.Dead;
            bool gameplay = !paused && !Terminal.IsOpen && !Menus.IsModalOpen;

            if (gameplay && Input.Count) ToggleCounting();

            Player.Tick(World, gameplay);
            World.UpdatePlayerTransform(Player.transform.position.ToCore(), Player.Yaw, Player.Pitch);

            if (!paused)
            {
                _accumulator += Mathf.Min(dt, 0.25f) * TimeScale;
                int steps = 0;
                while (_accumulator >= SimWorld.FixedStep && steps++ < 80)
                {
                    World.Tick(SimWorld.FixedStep);
                    _accumulator -= SimWorld.FixedStep;
                    foreach (var v in _npcViews) v.OnSimTick();
                    foreach (var v in _anomalyViews) v.OnSimTick();
                }
                if (steps >= 80) _accumulator = 0f;
            }

            float alpha = Mathf.Clamp01(_accumulator / SimWorld.FixedStep);
            Vector3 camPos = Player.Camera.transform.position;
            Presenter.Tick(camPos, World.Player.RoomId, dt);
            foreach (var v in _npcViews) v.Render(World, alpha, dt, camPos, Presenter.IsRoomVisible(v.Npc.Agent.RoomId));
            foreach (var v in _anomalyViews) v.Render(World, alpha, dt, camPos, Presenter.IsRoomVisible(v.Anomaly.Agent.RoomId));
            Hud.Tick(World, Player, _npcViews, Player.Camera, gameplay);
            _audio.Tick(World, dt);
            UpdateCountButton();

            if (World.Player.Dead && !_deathShown)
            {
                _deathShown = true;
                Menus.ShowDeath(DeathCause());
            }

            _autosaveTimer -= dt;
            if (_autosaveTimer <= 0f)
            {
                _autosaveTimer = AutosaveInterval;
                SaveGame(false);
            }
        }

        private void ToggleCounting()
        {
            var p = World.Player;
            if (p.Counting)
            {
                World.StopPlayerCounting("вы прекратили счёт");
                return;
            }
            var target = CountableAnomaly();
            if (target == null)
            {
                Message("Протокол счёта: объект вне зоны видимости (нужна прямая видимость, до 10 м)", new Color(1f, 0.7f, 0.4f));
                return;
            }
            World.StartPlayerCounting(target.Id);
        }

        private AnomalyInstance CountableAnomaly()
        {
            var p = World.Player;
            foreach (var a in World.Anomalies)
                if (World.CanPerformCounting(PlayerState.PlayerId, p.Position, p.RoomId, a))
                    return a;
            return null;
        }

        private void UpdateCountButton()
        {
            var p = World.Player;
            _mobile.SetCountAvailable(!p.Dead && CountableAnomaly() != null, p.Counting);
            var card = World.GetCard(p.SelectedCardId);
            _mobile.SetCardLabel(card != null ? "КАРТА\n" + card.Level : "КАРТА");
        }

        private string DeathCause()
        {
            var events = World.Events.Recent;
            for (int i = events.Count - 1; i >= 0; i--)
                if (events[i].Type == EventType.Injury && events[i].TargetId == PlayerState.PlayerId)
                    return events[i].Text;
            return "Причина не установлена.";
        }

        private void OnPlayerNotified(FacilityEvent e)
        {
            Color color;
            string prefix = "";
            switch (e.Type)
            {
                case EventType.TaskIssued:
                    color = new Color(0.95f, 0.85f, 0.45f);
                    prefix = "Новая задача: ";
                    break;
                case EventType.TaskCompleted:
                    color = new Color(0.55f, 1f, 0.6f);
                    break;
                case EventType.TaskFailed:
                    color = new Color(1f, 0.5f, 0.4f);
                    break;
                case EventType.PatrolCheckpoint:
                case EventType.Observation:
                case EventType.DoorAccess:
                    return;
                default:
                    if (e.Severity <= 0 && !e.Public && e.Type != EventType.CountingProtocol) return;
                    color = e.Severity >= 3 ? new Color(1f, 0.3f, 0.3f) : e.Severity == 2 ? new Color(1f, 0.6f, 0.35f) : new Color(0.9f, 0.9f, 0.75f);
                    break;
            }
            if (e.Public)
            {
                prefix = "[ОПОВЕЩЕНИЕ] ";
                _audio.PlayUi(_audio.Chime, 0.6f);
            }
            Message(prefix + e.Text, color);
        }

        public void Message(string text, Color color)
        {
            if (Hud != null) Hud.Push($"<color=#7a8a8a>{(World != null ? GameClock.FormatTime(World.Now) : "")}</color> {text}", color);
        }

        public void OnModalChanged()
        {
            bool modal = (Terminal != null && Terminal.IsOpen) || (Menus != null && Menus.IsModalOpen);
            Input.GameplayEnabled = _playing && !modal;
            if (_mobile != null) _mobile.SetActive(_playing && !modal && Settings.UseTouch);
        }

        // ------------------------------------------------------------------ settings

        public void ChangeSetting(string key, int direction)
        {
            var s = Settings;
            switch (key)
            {
                case "sens": s.Sensitivity = Mathf.Clamp(Mathf.Round((s.Sensitivity + direction * 0.1f) * 10f) / 10f, 0.2f, 3f); break;
                case "invert": s.InvertY = !s.InvertY; break;
                case "quality": s.Quality = Mathf.Clamp(s.Quality + direction, 0, 2); break;
                case "fps": s.TargetFps = s.TargetFps == 60 ? 30 : 60; break;
                case "volume": s.Volume = Mathf.Clamp01(Mathf.Round((s.Volume + direction * 0.1f) * 10f) / 10f); break;
                case "touch": s.ForceTouchControls = !s.ForceTouchControls; break;
            }
            ApplySettings();
            Menus.RefreshSettings(s);
        }

        private void ApplySettings()
        {
            Input.Sensitivity = Settings.Sensitivity;
            Input.InvertY = Settings.InvertY;
            PerformanceManager.Apply(Settings, Player, Presenter, Cctv);
            OnModalChanged();
        }

        // ------------------------------------------------------------------ lifecycle

        private void OnApplicationPause(bool pause)
        {
            // Android: the app may be killed while in background — persist immediately.
            if (pause && _playing) SaveGame(false);
        }

        private void OnApplicationQuit()
        {
            if (_playing) SaveGame(false);
        }
    }
}
