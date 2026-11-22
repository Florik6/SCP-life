using System;
using System.Collections.Generic;

namespace ScpLife.Core
{
    /// <summary>A* over the facility navigation graph with a per-agent door filter.</summary>
    public static class PathFinder
    {
        /// <summary>
        /// Returns the node sequence from start to goal (inclusive) or null if unreachable.
        /// `canUseDoor(door, fromRoomId)` decides whether the agent may plan through a door.
        /// </summary>
        public static List<int> FindPath(Facility facility, int start, int goal, Func<Door, string, bool> canUseDoor)
        {
            var graph = facility.Graph;
            if (start < 0 || goal < 0 || start >= graph.Nodes.Count || goal >= graph.Nodes.Count) return null;
            if (start == goal) return new List<int> { start };

            int n = graph.Nodes.Count;
            var gScore = new float[n];
            var cameFrom = new int[n];
            var closed = new bool[n];
            for (int i = 0; i < n; i++)
            {
                gScore[i] = float.MaxValue;
                cameFrom[i] = -1;
            }

            var open = new MinHeap(n);
            gScore[start] = 0f;
            open.Push(start, Heuristic(graph, start, goal));

            while (open.Count > 0)
            {
                int current = open.Pop();
                if (current == goal) return Reconstruct(cameFrom, goal);
                if (closed[current]) continue;
                closed[current] = true;

                foreach (var edge in graph.Edges[current])
                {
                    if (closed[edge.To]) continue;
                    float extra = 0f;
                    if (edge.DoorId != null)
                    {
                        Door door = facility.Doors[edge.DoorId];
                        string fromRoom = graph.Nodes[current].RoomId;
                        if (canUseDoor != null && !canUseDoor(door, fromRoom)) continue;
                        // Closed doors cost a little time to open; prefer open routes slightly.
                        if (!door.IsPassable) extra = door.Kind == DoorKind.Heavy ? 6f : 1.5f;
                    }
                    float tentative = gScore[current] + edge.Cost + extra;
                    if (tentative < gScore[edge.To])
                    {
                        gScore[edge.To] = tentative;
                        cameFrom[edge.To] = current;
                        open.Push(edge.To, tentative + Heuristic(graph, edge.To, goal));
                    }
                }
            }
            return null;
        }

        private static float Heuristic(NavGraph g, int a, int b) => Vec3.Distance(g.Nodes[a].Position, g.Nodes[b].Position);

        private static List<int> Reconstruct(int[] cameFrom, int goal)
        {
            var path = new List<int>();
            int cur = goal;
            while (cur >= 0)
            {
                path.Add(cur);
                cur = cameFrom[cur];
            }
            path.Reverse();
            return path;
        }

        public static float PathLength(NavGraph g, List<int> path)
        {
            if (path == null) return float.MaxValue;
            float len = 0f;
            for (int i = 1; i < path.Count; i++) len += Vec3.Distance(g.Nodes[path[i - 1]].Position, g.Nodes[path[i]].Position);
            return len;
        }

        private sealed class MinHeap
        {
            private readonly List<int> _items;
            private readonly List<float> _keys;

            public MinHeap(int capacity)
            {
                _items = new List<int>(capacity);
                _keys = new List<float>(capacity);
            }

            public int Count => _items.Count;

            public void Push(int item, float key)
            {
                _items.Add(item);
                _keys.Add(key);
                int i = _items.Count - 1;
                while (i > 0)
                {
                    int parent = (i - 1) / 2;
                    if (_keys[parent] <= _keys[i]) break;
                    Swap(i, parent);
                    i = parent;
                }
            }

            public int Pop()
            {
                int result = _items[0];
                int last = _items.Count - 1;
                _items[0] = _items[last];
                _keys[0] = _keys[last];
                _items.RemoveAt(last);
                _keys.RemoveAt(last);
                int i = 0;
                while (true)
                {
                    int l = i * 2 + 1;
                    int r = l + 1;
                    int smallest = i;
                    if (l < _items.Count && _keys[l] < _keys[smallest]) smallest = l;
                    if (r < _items.Count && _keys[r] < _keys[smallest]) smallest = r;
                    if (smallest == i) break;
                    Swap(i, smallest);
                    i = smallest;
                }
                return result;
            }

            private void Swap(int a, int b)
            {
                int ti = _items[a];
                _items[a] = _items[b];
                _items[b] = ti;
                float tk = _keys[a];
                _keys[a] = _keys[b];
                _keys[b] = tk;
            }
        }
    }
}
