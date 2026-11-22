using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace ScpLife.Runtime
{
    /// <summary>
    /// Accumulates boxes into one mesh with a submesh per material. UVs are world-space so
    /// textures tile seamlessly across walls and floors. One static mesh per room keeps the
    /// draw-call count low on mobile.
    /// </summary>
    public sealed class MeshBuilder
    {
        private sealed class Part
        {
            public readonly List<Vector3> Vertices = new List<Vector3>();
            public readonly List<Vector3> Normals = new List<Vector3>();
            public readonly List<Vector2> Uvs = new List<Vector2>();
            public readonly List<int> Triangles = new List<int>();
        }

        private readonly Dictionary<Material, Part> _parts = new Dictionary<Material, Part>();
        private readonly List<Material> _order = new List<Material>();

        public int BoxCount { get; private set; }

        private Part GetPart(Material m)
        {
            if (!_parts.TryGetValue(m, out var p))
            {
                p = new Part();
                _parts[m] = p;
                _order.Add(m);
            }
            return p;
        }

        /// <summary>Axis-aligned box in world space. `uvScale` = metres per texture repeat.</summary>
        public void Box(Material m, Vector3 center, Vector3 size, float uvScale = 2f, bool bottom = true)
        {
            BoxRotated(m, center, size, Quaternion.identity, uvScale, bottom);
        }

        public void BoxRotated(Material m, Vector3 center, Vector3 size, Quaternion rotation, float uvScale = 2f, bool bottom = true)
        {
            if (m == null || size.x <= 0.0001f || size.y <= 0.0001f || size.z <= 0.0001f) return;
            var p = GetPart(m);
            Vector3 h = size * 0.5f;
            bool axisAligned = rotation == Quaternion.identity;
            float inv = 1f / Mathf.Max(0.01f, uvScale);

            // +X, -X, +Y, -Y, +Z, -Z
            Face(p, center, rotation, new Vector3(h.x, 0, 0), new Vector3(0, 0, -h.z), new Vector3(0, h.y, 0), Vector3.right, axisAligned, inv, 0);
            Face(p, center, rotation, new Vector3(-h.x, 0, 0), new Vector3(0, 0, h.z), new Vector3(0, h.y, 0), Vector3.left, axisAligned, inv, 0);
            Face(p, center, rotation, new Vector3(0, h.y, 0), new Vector3(h.x, 0, 0), new Vector3(0, 0, -h.z), Vector3.up, axisAligned, inv, 1);
            if (bottom) Face(p, center, rotation, new Vector3(0, -h.y, 0), new Vector3(h.x, 0, 0), new Vector3(0, 0, h.z), Vector3.down, axisAligned, inv, 1);
            Face(p, center, rotation, new Vector3(0, 0, h.z), new Vector3(h.x, 0, 0), new Vector3(0, h.y, 0), Vector3.forward, axisAligned, inv, 2);
            Face(p, center, rotation, new Vector3(0, 0, -h.z), new Vector3(-h.x, 0, 0), new Vector3(0, h.y, 0), Vector3.back, axisAligned, inv, 2);
            BoxCount++;
        }

        /// <summary>
        /// Adds one quad. `offset` is the face centre relative to the box centre, `u`/`v` are half
        /// extents along the face with Cross(u, v) pointing along the outward normal; the triangles
        /// are then clockwise when seen from outside (Unity's front-face convention).
        /// UV projection: 0 = (z,y), 1 = (x,z), 2 = (x,y).
        /// </summary>
        private static void Face(Part p, Vector3 center, Quaternion rot, Vector3 offset, Vector3 u, Vector3 v, Vector3 normal,
            bool axisAligned, float inv, int projection)
        {
            int start = p.Vertices.Count;
            Vector3[] corners =
            {
                offset - u - v,
                offset + u - v,
                offset + u + v,
                offset - u + v
            };
            Vector3 n = rot * normal;
            for (int i = 0; i < 4; i++)
            {
                Vector3 local = corners[i];
                Vector3 world = center + rot * local;
                Vector3 uvSource = axisAligned ? world : local + center;
                Vector2 uv;
                switch (projection)
                {
                    case 0: uv = new Vector2(uvSource.z * Mathf.Sign(normal.x == 0 ? 1 : -normal.x), uvSource.y); break;
                    case 1: uv = new Vector2(uvSource.x, uvSource.z); break;
                    default: uv = new Vector2(uvSource.x * Mathf.Sign(normal.z == 0 ? 1 : normal.z), uvSource.y); break;
                }
                p.Vertices.Add(world);
                p.Normals.Add(n);
                p.Uvs.Add(uv * inv);
            }
            p.Triangles.Add(start);
            p.Triangles.Add(start + 1);
            p.Triangles.Add(start + 2);
            p.Triangles.Add(start);
            p.Triangles.Add(start + 2);
            p.Triangles.Add(start + 3);
        }

        /// <summary>Single-sided quad facing `normal` (used for decals and screens).</summary>
        public void Quad(Material m, Vector3 center, Vector3 normal, Vector3 up, float width, float height)
        {
            var p = GetPart(m);
            Vector3 right = Vector3.Cross(up, normal).normalized * (width * 0.5f);
            Vector3 vUp = up.normalized * (height * 0.5f);
            int start = p.Vertices.Count;
            p.Vertices.Add(center - right - vUp);
            p.Vertices.Add(center + right - vUp);
            p.Vertices.Add(center + right + vUp);
            p.Vertices.Add(center - right + vUp);
            for (int i = 0; i < 4; i++) p.Normals.Add(normal);
            // Seen from the front, vertex 0 is bottom-right and vertex 1 bottom-left.
            p.Uvs.Add(new Vector2(1, 0));
            p.Uvs.Add(new Vector2(0, 0));
            p.Uvs.Add(new Vector2(0, 1));
            p.Uvs.Add(new Vector2(1, 1));
            p.Triangles.Add(start);
            p.Triangles.Add(start + 1);
            p.Triangles.Add(start + 2);
            p.Triangles.Add(start);
            p.Triangles.Add(start + 2);
            p.Triangles.Add(start + 3);
        }

        public bool IsEmpty => _order.Count == 0;

        public GameObject Build(string name, Transform parent)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            if (_order.Count == 0) return go;

            var mesh = new Mesh { name = name };
            var vertices = new List<Vector3>();
            var normals = new List<Vector3>();
            var uvs = new List<Vector2>();
            foreach (var m in _order)
            {
                var p = _parts[m];
                vertices.AddRange(p.Vertices);
                normals.AddRange(p.Normals);
                uvs.AddRange(p.Uvs);
            }
            if (vertices.Count > 65000) mesh.indexFormat = IndexFormat.UInt32;
            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetUVs(0, uvs);
            mesh.subMeshCount = _order.Count;
            int offset = 0;
            for (int i = 0; i < _order.Count; i++)
            {
                var p = _parts[_order[i]];
                var tris = new int[p.Triangles.Count];
                for (int t = 0; t < tris.Length; t++) tris[t] = p.Triangles[t] + offset;
                mesh.SetTriangles(tris, i, false);
                offset += p.Vertices.Count;
            }
            mesh.RecalculateBounds();
            mesh.UploadMeshData(true);

            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var renderer = go.AddComponent<MeshRenderer>();
            renderer.sharedMaterials = _order.ToArray();
            renderer.shadowCastingMode = ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            renderer.lightProbeUsage = LightProbeUsage.Off;
            renderer.reflectionProbeUsage = ReflectionProbeUsage.Off;
            go.isStatic = true;
            return go;
        }
    }
}
