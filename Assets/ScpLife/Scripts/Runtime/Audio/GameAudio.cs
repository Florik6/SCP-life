using ScpLife.Core;
using UnityEngine;

namespace ScpLife.Runtime
{
    /// <summary>
    /// Procedurally synthesised sound effects (no external audio files) and the ambient mix:
    /// ventilation hum, door servos, card reader beeps, footsteps, knocks, scratching,
    /// anomaly drone, PA chime and the breach siren.
    /// </summary>
    public sealed class GameAudio : MonoBehaviour
    {
        public static GameAudio Instance { get; private set; }

        private const int Rate = 22050;

        public AudioClip Hum, DoorServo, HeavyDoor, BeepGranted, BeepDenied, BeepWait, Click, Knock, Scratch, Drone, Siren, Chime;
        public AudioClip[] Footsteps = new AudioClip[0];

        private AudioSource _ambient, _ui, _siren;
        private System.Random _rng = new System.Random(1234);

        public void Init()
        {
            Instance = this;
            Hum = Make("Hum", 4f, VentilationHum, true);
            DoorServo = Make("DoorServo", 1.0f, t => Servo(t, 1.0f, 180f));
            HeavyDoor = Make("HeavyDoor", 3.0f, t => Servo(t, 3.0f, 70f) + Thump(t, 2.85f) * 0.8f);
            BeepGranted = Make("BeepOk", 0.25f, t => Beep(t, 0.0f, 0.1f, 1320f) + Beep(t, 0.12f, 0.1f, 1760f));
            BeepDenied = Make("BeepNo", 0.4f, t => Beep(t, 0f, 0.35f, 330f, true));
            BeepWait = Make("BeepWait", 0.35f, t => Beep(t, 0f, 0.08f, 990f) + Beep(t, 0.2f, 0.08f, 990f));
            Click = Make("Click", 0.06f, t => Noise() * Mathf.Exp(-t * 120f) * 0.6f);
            Knock = Make("Knock", 0.35f, t => (Mathf.Sin(2f * Mathf.PI * 140f * t) * 0.8f + Noise() * 0.3f) * Mathf.Exp(-t * 28f));
            Scratch = Make("Scratch", 0.7f, t => Noise() * (0.35f + 0.25f * Mathf.Sin(t * 60f)) * Envelope(t, 0.7f, 0.05f, 0.2f));
            Drone = Make("Drone", 6f, t => (Mathf.Sin(2f * Mathf.PI * 41f * t) * 0.5f + Mathf.Sin(2f * Mathf.PI * 61.7f * t + Mathf.Sin(t * 0.7f) * 2f) * 0.35f
                                           + Noise() * 0.05f) * 0.6f, true);
            Siren = Make("Siren", 2.4f, t =>
            {
                float f = 520f + 380f * Mathf.Sin(2f * Mathf.PI * t / 2.4f);
                return Mathf.Sign(Mathf.Sin(2f * Mathf.PI * f * t)) * 0.18f + Mathf.Sin(2f * Mathf.PI * f * t) * 0.2f;
            }, true);
            Chime = Make("Chime", 1.4f, t => (Beep(t, 0f, 0.6f, 784f) + Beep(t, 0.45f, 0.9f, 523f)) * 0.7f);
            Footsteps = new AudioClip[4];
            for (int i = 0; i < Footsteps.Length; i++)
            {
                float pitch = 70f + i * 12f;
                Footsteps[i] = Make("Step" + i, 0.18f, t => (Noise() * 0.6f + Mathf.Sin(2f * Mathf.PI * pitch * t) * 0.5f) * Mathf.Exp(-t * 32f));
            }

            _ambient = gameObject.AddComponent<AudioSource>();
            _ambient.clip = Hum;
            _ambient.loop = true;
            _ambient.volume = 0.22f;
            _ambient.spatialBlend = 0f;
            _ambient.Play();
            _ui = gameObject.AddComponent<AudioSource>();
            _ui.spatialBlend = 0f;
            _siren = gameObject.AddComponent<AudioSource>();
            _siren.clip = Siren;
            _siren.loop = true;
            _siren.volume = 0f;
            _siren.spatialBlend = 0f;
        }

        public void PlayUi(AudioClip clip, float volume = 0.7f)
        {
            if (clip != null && _ui != null) _ui.PlayOneShot(clip, volume);
        }

        public void SetMasterVolume(float v) => AudioListener.volume = Mathf.Clamp01(v);

        /// <summary>Updates ambient layers from the alert state.</summary>
        public void Tick(SimWorld world, float dt)
        {
            if (_siren == null) return;
            bool red = world.Alert.Level >= AlertLevel.Red;
            float target = red ? 0.32f : 0f;
            _siren.volume = Mathf.MoveTowards(_siren.volume, target, dt * 0.5f);
            if (_siren.volume > 0.001f && !_siren.isPlaying) _siren.Play();
            if (_siren.volume <= 0.001f && _siren.isPlaying) _siren.Stop();
        }

        // ------------------------------------------------------------------ synthesis

        private delegate float Wave(float t);

        private AudioClip Make(string name, float seconds, Wave wave, bool loopSafe = false)
        {
            int samples = Mathf.CeilToInt(seconds * Rate);
            var data = new float[samples];
            for (int i = 0; i < samples; i++)
            {
                float t = (float)i / Rate;
                float v = wave(t);
                if (loopSafe)
                {
                    // Short crossfade at the edges so loops do not click.
                    float edge = Mathf.Min(t, seconds - t);
                    v *= Mathf.Clamp01(edge / 0.02f);
                }
                data[i] = Mathf.Clamp(v, -1f, 1f);
            }
            var clip = AudioClip.Create(name, samples, 1, Rate, false);
            clip.SetData(data, 0);
            return clip;
        }

        private float Noise() => (float)(_rng.NextDouble() * 2.0 - 1.0);

        private float _lp;

        private float VentilationHum(float t)
        {
            // Low-passed noise + mains hum (whole number of 50 Hz periods; edges are cross-faded).
            _lp = _lp * 0.96f + Noise() * 0.04f;
            return _lp * 2.2f + Mathf.Sin(2f * Mathf.PI * 50f * t) * 0.12f + Mathf.Sin(2f * Mathf.PI * 100f * t) * 0.05f;
        }

        private float Servo(float t, float length, float baseFreq)
        {
            float env = Envelope(t, length, 0.08f, 0.25f);
            float f = baseFreq * (1f + 0.25f * Mathf.Sin(t * 3f));
            return (Mathf.Sin(2f * Mathf.PI * f * t) * 0.25f + Noise() * 0.18f) * env;
        }

        private static float Thump(float t, float at)
        {
            if (t < at) return 0f;
            float d = t - at;
            return Mathf.Sin(2f * Mathf.PI * 55f * d) * Mathf.Exp(-d * 20f);
        }

        private static float Beep(float t, float start, float duration, float freq, bool square = false)
        {
            if (t < start || t > start + duration) return 0f;
            float local = t - start;
            float s = Mathf.Sin(2f * Mathf.PI * freq * local);
            if (square) s = Mathf.Sign(s) * 0.6f;
            return s * 0.35f * Envelope(local, duration, 0.005f, 0.03f);
        }

        private static float Envelope(float t, float length, float attack, float release)
        {
            if (t < attack) return t / attack;
            if (t > length - release) return Mathf.Max(0f, (length - t) / release);
            return 1f;
        }
    }
}
