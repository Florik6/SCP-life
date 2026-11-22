using ScpLife.Core;
using UnityEngine;

namespace ScpLife.Runtime
{
    /// <summary>
    /// Procedural low-poly humanoid made of primitives, with role-specific uniforms and
    /// code-driven animation (walk, sit, lie, work, count, cower, down). No external assets.
    /// </summary>
    public sealed class HumanoidRig
    {
        public Transform Root;
        private Transform _body, _hips, _torso, _head, _shoulderL, _shoulderR, _elbowL, _elbowR, _hipL, _hipR, _kneeL, _kneeR;
        private float _walkPhase;
        private float _blend;
        private Posture _posture = Posture.Standing;
        private float _postureBlend = 1f;
        private float _seed;

        private static readonly Color[] SkinTones =
        {
            new Color(0.93f, 0.78f, 0.66f), new Color(0.84f, 0.66f, 0.52f), new Color(0.66f, 0.48f, 0.36f),
            new Color(0.48f, 0.33f, 0.24f), new Color(0.96f, 0.84f, 0.74f)
        };

        private static readonly Color[] HairColors =
        {
            new Color(0.12f, 0.09f, 0.07f), new Color(0.35f, 0.24f, 0.14f), new Color(0.62f, 0.5f, 0.32f),
            new Color(0.5f, 0.5f, 0.5f), new Color(0.2f, 0.12f, 0.08f)
        };

        public static HumanoidRig Build(Transform parent, NpcRole role, int variant, bool female, MaterialLibrary m)
        {
            var rig = new HumanoidRig();
            rig._seed = variant * 1.37f;
            rig.Root = parent;

            Color uniform, pants, accent, hat = Color.clear;
            bool coat = false, vest = false, hardHat = false;
            switch (role)
            {
                case NpcRole.Guard:
                    uniform = new Color(0.13f, 0.16f, 0.2f);
                    pants = new Color(0.1f, 0.11f, 0.13f);
                    accent = new Color(0.05f, 0.05f, 0.06f);
                    vest = true;
                    hat = new Color(0.08f, 0.09f, 0.1f);
                    break;
                case NpcRole.Scientist:
                    uniform = new Color(0.55f, 0.68f, 0.82f);
                    pants = new Color(0.25f, 0.26f, 0.3f);
                    accent = new Color(0.92f, 0.92f, 0.9f);
                    coat = true;
                    break;
                case NpcRole.Technician:
                    uniform = new Color(0.86f, 0.55f, 0.12f);
                    pants = new Color(0.82f, 0.52f, 0.1f);
                    accent = new Color(0.85f, 0.85f, 0.2f);
                    hardHat = true;
                    hat = new Color(0.95f, 0.8f, 0.1f);
                    break;
                case NpcRole.Medic:
                    uniform = new Color(0.62f, 0.82f, 0.78f);
                    pants = new Color(0.58f, 0.78f, 0.74f);
                    accent = new Color(0.8f, 0.1f, 0.1f);
                    break;
                case NpcRole.DClass:
                    uniform = new Color(0.95f, 0.45f, 0.08f);
                    pants = new Color(0.92f, 0.43f, 0.07f);
                    accent = new Color(0.15f, 0.15f, 0.15f);
                    break;
                default:
                    uniform = new Color(0.2f, 0.25f, 0.2f);
                    pants = new Color(0.15f, 0.17f, 0.15f);
                    accent = Color.black;
                    break;
            }

            Color skin = SkinTones[Mathf.Abs(variant) % SkinTones.Length];
            Color hair = HairColors[Mathf.Abs(variant * 7 + 3) % HairColors.Length];
            Material uniformM = m.Colored(uniform), pantsM = m.Colored(pants), accentM = m.Colored(accent);
            Material skinM = m.Colored(skin, 0.35f), hairM = m.Colored(hair, 0.15f), shoeM = m.Colored(new Color(0.06f, 0.06f, 0.06f));
            float scale = female ? 0.95f : 1f;

            var cube = PrimitiveMeshes.Cube;
            var capsule = PrimitiveMeshes.Capsule;
            var sphere = PrimitiveMeshes.Sphere;

            rig._body = new GameObject("Body").transform;
            rig._body.SetParent(parent, false);
            rig._body.localScale = Vector3.one * scale;

            rig._hips = Pivot("Hips", rig._body, new Vector3(0f, 0.95f, 0f));
            PrimitiveMeshes.Part("Pelvis", rig._hips, cube, pantsM, new Vector3(0f, 0.0f, 0f), new Vector3(0.34f, 0.18f, 0.2f));

            rig._torso = Pivot("Torso", rig._hips, new Vector3(0f, 0.08f, 0f));
            PrimitiveMeshes.Part("Chest", rig._torso, cube, uniformM, new Vector3(0f, 0.27f, 0f), new Vector3(female ? 0.36f : 0.4f, 0.5f, 0.22f));
            if (vest) PrimitiveMeshes.Part("Vest", rig._torso, cube, accentM, new Vector3(0f, 0.3f, 0f), new Vector3(0.43f, 0.38f, 0.25f));
            if (coat)
            {
                PrimitiveMeshes.Part("CoatL", rig._torso, cube, accentM, new Vector3(-0.12f, 0.12f, 0f), new Vector3(0.18f, 0.78f, 0.25f));
                PrimitiveMeshes.Part("CoatR", rig._torso, cube, accentM, new Vector3(0.12f, 0.12f, 0f), new Vector3(0.18f, 0.78f, 0.25f));
                PrimitiveMeshes.Part("CoatBack", rig._torso, cube, accentM, new Vector3(0f, 0.12f, -0.1f), new Vector3(0.42f, 0.78f, 0.05f));
            }
            if (role == NpcRole.Technician)
            {
                PrimitiveMeshes.Part("Reflect1", rig._torso, cube, m.Colored(new Color(0.9f, 0.9f, 0.9f), 0.8f), new Vector3(0f, 0.32f, 0f), new Vector3(0.41f, 0.04f, 0.23f));
                PrimitiveMeshes.Part("Reflect2", rig._torso, cube, m.Colored(new Color(0.9f, 0.9f, 0.9f), 0.8f), new Vector3(0f, 0.15f, 0f), new Vector3(0.41f, 0.04f, 0.23f));
            }
            if (role == NpcRole.Medic)
                PrimitiveMeshes.Part("Armband", rig._torso, cube, accentM, new Vector3(0.24f, 0.38f, 0f), new Vector3(0.1f, 0.06f, 0.12f));
            if (role == NpcRole.DClass)
                PrimitiveMeshes.Part("Patch", rig._torso, cube, accentM, new Vector3(0.09f, 0.4f, 0.11f), new Vector3(0.12f, 0.06f, 0.01f));
            if (role == NpcRole.Guard)
                PrimitiveMeshes.Part("Belt", rig._torso, cube, m.Colored(new Color(0.05f, 0.05f, 0.05f)), new Vector3(0f, 0.03f, 0f), new Vector3(0.42f, 0.06f, 0.24f));

            rig._head = Pivot("Head", rig._torso, new Vector3(0f, 0.56f, 0f));
            PrimitiveMeshes.Part("Neck", rig._head, cube, skinM, new Vector3(0f, -0.02f, 0f), new Vector3(0.1f, 0.08f, 0.1f));
            PrimitiveMeshes.Part("Skull", rig._head, sphere, skinM, new Vector3(0f, 0.12f, 0f), new Vector3(0.2f, 0.24f, 0.22f));
            PrimitiveMeshes.Part("EyeL", rig._head, cube, m.Black, new Vector3(-0.045f, 0.14f, 0.1f), new Vector3(0.03f, 0.02f, 0.01f));
            PrimitiveMeshes.Part("EyeR", rig._head, cube, m.Black, new Vector3(0.045f, 0.14f, 0.1f), new Vector3(0.03f, 0.02f, 0.01f));
            if (hat.a > 0f)
            {
                if (hardHat) PrimitiveMeshes.Part("HardHat", rig._head, sphere, m.Colored(hat, 0.6f), new Vector3(0f, 0.2f, 0f), new Vector3(0.25f, 0.14f, 0.27f));
                else
                {
                    PrimitiveMeshes.Part("Cap", rig._head, cube, m.Colored(hat), new Vector3(0f, 0.23f, 0f), new Vector3(0.22f, 0.07f, 0.23f));
                    PrimitiveMeshes.Part("Visor", rig._head, cube, m.Colored(hat), new Vector3(0f, 0.2f, 0.13f), new Vector3(0.2f, 0.02f, 0.08f));
                }
            }
            else if (role != NpcRole.DClass || female)
            {
                PrimitiveMeshes.Part("Hair", rig._head, sphere, hairM, new Vector3(0f, 0.17f, -0.015f), new Vector3(0.215f, 0.18f, 0.22f));
                if (female) PrimitiveMeshes.Part("HairBack", rig._head, cube, hairM, new Vector3(0f, 0.06f, -0.09f), new Vector3(0.18f, 0.2f, 0.06f));
            }
            else
            {
                PrimitiveMeshes.Part("Buzz", rig._head, sphere, hairM, new Vector3(0f, 0.16f, -0.01f), new Vector3(0.205f, 0.2f, 0.215f));
            }

            Material sleeveM = coat ? accentM : uniformM;
            rig._shoulderL = Pivot("ShoulderL", rig._torso, new Vector3(-0.25f, 0.47f, 0f));
            rig._shoulderR = Pivot("ShoulderR", rig._torso, new Vector3(0.25f, 0.47f, 0f));
            foreach (var (shoulder, name) in new[] { (rig._shoulderL, "L"), (rig._shoulderR, "R") })
            {
                PrimitiveMeshes.Part("Upper" + name, shoulder, capsule, sleeveM, new Vector3(0f, -0.15f, 0f), new Vector3(0.1f, 0.16f, 0.1f));
                var elbow = Pivot("Elbow" + name, shoulder, new Vector3(0f, -0.3f, 0f));
                PrimitiveMeshes.Part("Fore" + name, elbow, capsule, sleeveM, new Vector3(0f, -0.13f, 0f), new Vector3(0.09f, 0.14f, 0.09f));
                PrimitiveMeshes.Part("Hand" + name, elbow, sphere, skinM, new Vector3(0f, -0.29f, 0f), new Vector3(0.08f, 0.09f, 0.08f));
                if (name == "L") rig._elbowL = elbow; else rig._elbowR = elbow;
            }

            rig._hipL = Pivot("HipL", rig._hips, new Vector3(-0.1f, -0.05f, 0f));
            rig._hipR = Pivot("HipR", rig._hips, new Vector3(0.1f, -0.05f, 0f));
            foreach (var (hip, name) in new[] { (rig._hipL, "L"), (rig._hipR, "R") })
            {
                PrimitiveMeshes.Part("Thigh" + name, hip, capsule, pantsM, new Vector3(0f, -0.22f, 0f), new Vector3(0.14f, 0.23f, 0.14f));
                var knee = Pivot("Knee" + name, hip, new Vector3(0f, -0.44f, 0f));
                PrimitiveMeshes.Part("Shin" + name, knee, capsule, pantsM, new Vector3(0f, -0.2f, 0f), new Vector3(0.11f, 0.21f, 0.11f));
                PrimitiveMeshes.Part("Foot" + name, knee, cube, shoeM, new Vector3(0f, -0.43f, 0.05f), new Vector3(0.11f, 0.07f, 0.24f));
                if (name == "L") rig._kneeL = knee; else rig._kneeR = knee;
            }
            return rig;
        }

        private static Transform Pivot(string name, Transform parent, Vector3 localPos)
        {
            var t = new GameObject(name).transform;
            t.SetParent(parent, false);
            t.localPosition = localPos;
            return t;
        }

        /// <summary>
        /// Animates the rig. `speed` in m/s; `lookYaw` is a relative head turn in degrees.
        /// </summary>
        public void Animate(float dt, float speed, Posture posture, float lookYaw, float time)
        {
            if (posture != _posture)
            {
                _posture = posture;
                _postureBlend = 0f;
            }
            _postureBlend = Mathf.MoveTowards(_postureBlend, 1f, dt * 2.5f);
            float walk = Mathf.Clamp01(speed / 1.4f);
            _blend = Mathf.MoveTowards(_blend, walk, dt * 4f);
            _walkPhase += speed * dt * 4.2f;
            float s = Mathf.Sin(_walkPhase);
            float breathe = Mathf.Sin(time * 1.6f + _seed) * 1.5f;

            // Defaults: standing / walking.
            Vector3 bodyPos = Vector3.zero;
            Quaternion bodyRot = Quaternion.identity;
            float hipsY = 0.95f + Mathf.Abs(Mathf.Cos(_walkPhase)) * 0.03f * _blend;
            float torsoPitch = breathe * 0.3f + _blend * 4f;
            float thighL = s * 28f * _blend, thighR = -s * 28f * _blend;
            float kneeL = Mathf.Max(0f, -s) * 35f * _blend, kneeR = Mathf.Max(0f, s) * 35f * _blend;
            float armL = -s * 22f * _blend, armR = s * 22f * _blend;
            float elbowL = -10f - _blend * 10f, elbowR = -10f - _blend * 10f;
            float armSideL = 4f, armSideR = -4f;
            float headPitch = 0f;
            float headYaw = lookYaw;

            if (_blend < 0.5f)
            {
                switch (posture)
                {
                    case Posture.Sitting:
                        hipsY = 0.5f;
                        thighL = thighR = -88f;
                        kneeL = kneeR = 88f;
                        armL = armR = -35f;
                        elbowL = elbowR = -55f;
                        torsoPitch = 4f + breathe * 0.3f;
                        break;
                    case Posture.Lying:
                        // X -90 lays the body face-up with the head towards -Z, Y 180 turns the head
                        // towards +Z (the POI facing = head direction); shift back to centre on the bed.
                        bodyRot = Quaternion.Euler(-90f, 180f, 0f);
                        bodyPos = new Vector3(0f, 0.55f, -0.9f);
                        armL = armR = 0f;
                        elbowL = elbowR = -5f;
                        headPitch = 0f;
                        headYaw = 0f;
                        torsoPitch = breathe * 0.5f;
                        break;
                    case Posture.Working:
                        armL = -55f + Mathf.Sin(time * 3.1f + _seed) * 8f;
                        armR = -60f + Mathf.Sin(time * 3.7f + _seed + 1f) * 10f;
                        elbowL = elbowR = -35f;
                        torsoPitch = 12f;
                        headPitch = 20f;
                        break;
                    case Posture.Counting:
                        armR = -95f + Mathf.Sin(time * 4.2f) * 6f;
                        elbowR = -5f;
                        armL = -20f;
                        headPitch = -5f + Mathf.Sin(time * 4.2f) * 3f;
                        break;
                    case Posture.Cowering:
                        hipsY = 0.55f;
                        thighL = thighR = -110f;
                        kneeL = kneeR = 125f;
                        armL = armR = -150f;
                        elbowL = elbowR = -120f;
                        torsoPitch = 35f;
                        headPitch = 30f;
                        break;
                    case Posture.Down:
                        // Face-down on the floor, head forward, centred on the agent position.
                        bodyRot = Quaternion.Euler(90f, 0f, 0f);
                        bodyPos = new Vector3(0f, 0.12f, -0.9f);
                        armL = -160f;
                        armR = -20f;
                        armSideL = 30f;
                        armSideR = -40f;
                        headYaw = 70f;
                        breathe = 0f;
                        break;
                }
            }

            float k = Mathf.Clamp01(dt * 8f);
            _body.localPosition = Vector3.Lerp(_body.localPosition, bodyPos, k);
            _body.localRotation = Quaternion.Slerp(_body.localRotation, bodyRot, k);
            _hips.localPosition = Vector3.Lerp(_hips.localPosition, new Vector3(0f, hipsY, 0f), k);
            _torso.localRotation = Quaternion.Slerp(_torso.localRotation, Quaternion.Euler(torsoPitch, 0f, 0f), k);
            _head.localRotation = Quaternion.Slerp(_head.localRotation, Quaternion.Euler(headPitch, Mathf.Clamp(headYaw, -70f, 70f), 0f), k);
            _hipL.localRotation = Quaternion.Slerp(_hipL.localRotation, Quaternion.Euler(thighL, 0f, 0f), k);
            _hipR.localRotation = Quaternion.Slerp(_hipR.localRotation, Quaternion.Euler(thighR, 0f, 0f), k);
            _kneeL.localRotation = Quaternion.Slerp(_kneeL.localRotation, Quaternion.Euler(kneeL, 0f, 0f), k);
            _kneeR.localRotation = Quaternion.Slerp(_kneeR.localRotation, Quaternion.Euler(kneeR, 0f, 0f), k);
            _shoulderL.localRotation = Quaternion.Slerp(_shoulderL.localRotation, Quaternion.Euler(armL, 0f, -armSideL), k);
            _shoulderR.localRotation = Quaternion.Slerp(_shoulderR.localRotation, Quaternion.Euler(armR, 0f, -armSideR), k);
            _elbowL.localRotation = Quaternion.Slerp(_elbowL.localRotation, Quaternion.Euler(elbowL, 0f, 0f), k);
            _elbowR.localRotation = Quaternion.Slerp(_elbowR.localRotation, Quaternion.Euler(elbowR, 0f, 0f), k);
        }

        public Vector3 HeadPosition => _head.position + Vector3.up * 0.3f;
    }
}
