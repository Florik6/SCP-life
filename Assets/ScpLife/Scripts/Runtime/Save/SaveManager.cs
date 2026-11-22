using System;
using System.IO;
using ScpLife.Core;
using UnityEngine;

namespace ScpLife.Runtime
{
    /// <summary>
    /// Writes the complete simulation state to Application.persistentDataPath.
    /// Writes are atomic (temp file + replace) and the previous save is kept as a backup,
    /// so an interrupted write (app killed on Android) never destroys progress.
    /// </summary>
    public sealed class SaveManager
    {
        public const string FileName = "scp_life_save.json";
        public const string BackupName = "scp_life_save.bak.json";

        public string Directory => Application.persistentDataPath;
        public string PathMain => Path.Combine(Directory, FileName);
        public string PathBackup => Path.Combine(Directory, BackupName);

        public bool HasSave => File.Exists(PathMain) || File.Exists(PathBackup);

        public string LastError { get; private set; }

        public bool Save(SimWorld world)
        {
            try
            {
                string json = WorldSerializer.Save(world);
                string tmp = PathMain + ".tmp";
                File.WriteAllText(tmp, json);
                if (File.Exists(PathMain))
                {
                    if (File.Exists(PathBackup)) File.Delete(PathBackup);
                    File.Move(PathMain, PathBackup);
                }
                File.Move(tmp, PathMain);
                LastError = null;
                return true;
            }
            catch (Exception ex)
            {
                LastError = ex.Message;
                Debug.LogError("SCP LIFE: save failed: " + ex);
                return false;
            }
        }

        /// <summary>Loads the main save, falling back to the backup if the main file is damaged.</summary>
        public SimWorld Load(string catalogJson)
        {
            foreach (string path in new[] { PathMain, PathBackup })
            {
                if (!File.Exists(path)) continue;
                try
                {
                    var world = WorldSerializer.Load(File.ReadAllText(path), catalogJson);
                    LastError = null;
                    return world;
                }
                catch (Exception ex)
                {
                    LastError = ex.Message;
                    Debug.LogWarning($"SCP LIFE: could not load {path}: {ex.Message}");
                }
            }
            return null;
        }

        public void Delete()
        {
            try
            {
                if (File.Exists(PathMain)) File.Delete(PathMain);
                if (File.Exists(PathBackup)) File.Delete(PathBackup);
            }
            catch (Exception ex)
            {
                Debug.LogWarning("SCP LIFE: could not delete saves: " + ex.Message);
            }
        }
    }

    /// <summary>Player preferences (PlayerPrefs): controls, graphics, audio.</summary>
    public sealed class GameSettings
    {
        public float Sensitivity = 1f;
        public bool InvertY;
        public int Quality = 1; // 0 low, 1 medium, 2 high
        public int TargetFps = 60;
        public bool ForceTouchControls;
        public float Volume = 0.9f;
        public int TimeScale = 1;

        public static GameSettings Load()
        {
            var s = new GameSettings
            {
                Sensitivity = PlayerPrefs.GetFloat("scp.sens", 1f),
                InvertY = PlayerPrefs.GetInt("scp.invert", 0) == 1,
                Quality = PlayerPrefs.GetInt("scp.quality", Application.isMobilePlatform ? 1 : 2),
                TargetFps = PlayerPrefs.GetInt("scp.fps", 60),
                ForceTouchControls = PlayerPrefs.GetInt("scp.touch", 0) == 1,
                Volume = PlayerPrefs.GetFloat("scp.volume", 0.9f)
            };
            return s;
        }

        public void Save()
        {
            PlayerPrefs.SetFloat("scp.sens", Sensitivity);
            PlayerPrefs.SetInt("scp.invert", InvertY ? 1 : 0);
            PlayerPrefs.SetInt("scp.quality", Quality);
            PlayerPrefs.SetInt("scp.fps", TargetFps);
            PlayerPrefs.SetInt("scp.touch", ForceTouchControls ? 1 : 0);
            PlayerPrefs.SetFloat("scp.volume", Volume);
            PlayerPrefs.Save();
        }

        public bool UseTouch => Application.isMobilePlatform || Input.touchSupported && Application.platform == RuntimePlatform.Android || ForceTouchControls;

        public static string QualityName(int q) => q == 0 ? "Низкое" : q == 1 ? "Среднее" : "Высокое";
    }
}
