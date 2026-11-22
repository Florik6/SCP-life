using UnityEngine;

namespace ScpLife.Runtime
{
    /// <summary>
    /// Mobile performance profile. Quality presets map to Unity quality levels (the editor setup
    /// assigns a URP asset per level with its own render scale and light limits) and adjust the
    /// game's own budgets: realtime light count, CCTV resolution, view distance, frame rate.
    /// </summary>
    public static class PerformanceManager
    {
        public static void Apply(GameSettings s, PlayerController player, FacilityPresenter presenter, CctvSystem cctv)
        {
            Application.targetFrameRate = s.TargetFps;
            QualitySettings.vSyncCount = 0;
            Screen.sleepTimeout = SleepTimeout.NeverSleep;

            int levels = QualitySettings.names.Length;
            if (levels > 0)
            {
                // Low → first level, Medium → middle, High → top.
                int level = s.Quality == 0 ? 0 : s.Quality == 1 ? levels / 2 : levels - 1;
                if (QualitySettings.GetQualityLevel() != level) QualitySettings.SetQualityLevel(level, true);
            }
            QualitySettings.shadows = ShadowQuality.Disable;
            QualitySettings.realtimeReflectionProbes = false;
            QualitySettings.softParticles = false;
            QualitySettings.antiAliasing = s.Quality >= 2 ? 2 : 0;

            if (presenter != null)
            {
                presenter.MaxLights = s.Quality == 0 ? 4 : s.Quality == 1 ? 6 : 8;
                presenter.VisibilityDepth = s.Quality == 0 ? 2 : 3;
            }
            if (player != null && player.Camera != null)
            {
                player.Camera.farClipPlane = s.Quality == 0 ? 32f : s.Quality == 1 ? 42f : 55f;
                RenderSettings.fogEndDistance = player.Camera.farClipPlane;
            }
            if (cctv != null)
            {
                if (s.Quality == 0) cctv.SetQuality(256, 144, 8);
                else if (s.Quality == 1) cctv.SetQuality(384, 216, 12);
                else cctv.SetQuality(512, 288, 20);
            }
            AudioListener.volume = s.Volume;
        }

        public static void ConfigureEnvironment()
        {
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.16f, 0.17f, 0.19f);
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = new Color(0.03f, 0.035f, 0.04f);
            RenderSettings.fogStartDistance = 10f;
            RenderSettings.fogEndDistance = 45f;
            RenderSettings.skybox = null;
        }
    }
}
