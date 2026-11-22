using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace ScpLife.Core
{
    /// <summary>
    /// Small self-contained JSON reader/writer. The core assembly has no engine
    /// references, so it cannot use JsonUtility; this keeps saves and the anomaly
    /// catalog loadable both in Unity and in plain .NET test runs.
    /// Parsed values: Dictionary&lt;string, object&gt;, List&lt;object&gt;, string, double, bool, null.
    /// </summary>
    public static class Json
    {
        public static object Parse(string text)
        {
            if (text == null) throw new ArgumentNullException(nameof(text));
            var parser = new Parser(text);
            parser.SkipWhitespace();
            object value = parser.ParseValue();
            parser.SkipWhitespace();
            if (!parser.AtEnd) throw parser.Error("Unexpected trailing characters");
            return value;
        }

        public static JObj ParseObject(string text)
        {
            if (!(Parse(text) is Dictionary<string, object> dict))
                throw new FormatException("JSON root is not an object");
            return new JObj(dict);
        }

        public static string Serialize(object value, bool pretty = false)
        {
            var sb = new StringBuilder(1024);
            WriteValue(sb, value, pretty, 0);
            return sb.ToString();
        }

        private static void WriteValue(StringBuilder sb, object value, bool pretty, int indent)
        {
            switch (value)
            {
                case null:
                    sb.Append("null");
                    return;
                case string s:
                    WriteString(sb, s);
                    return;
                case bool b:
                    sb.Append(b ? "true" : "false");
                    return;
                case JObj jo:
                    WriteValue(sb, jo.Raw, pretty, indent);
                    return;
                case IDictionary<string, object> dict:
                    WriteObject(sb, dict, pretty, indent);
                    return;
                case IDictionary legacyDict:
                {
                    var converted = new Dictionary<string, object>();
                    foreach (DictionaryEntry e in legacyDict) converted[Convert.ToString(e.Key, CultureInfo.InvariantCulture)] = e.Value;
                    WriteObject(sb, converted, pretty, indent);
                    return;
                }
                case IEnumerable enumerable:
                    WriteArray(sb, enumerable, pretty, indent);
                    return;
                case float f:
                    WriteNumber(sb, f);
                    return;
                case double d:
                    WriteNumber(sb, d);
                    return;
                case decimal m:
                    sb.Append(m.ToString(CultureInfo.InvariantCulture));
                    return;
                case int _:
                case long _:
                case short _:
                case byte _:
                case uint _:
                case ulong _:
                case ushort _:
                case sbyte _:
                    sb.Append(Convert.ToString(value, CultureInfo.InvariantCulture));
                    return;
                case Enum en:
                    WriteString(sb, en.ToString());
                    return;
                default:
                    WriteString(sb, Convert.ToString(value, CultureInfo.InvariantCulture));
                    return;
            }
        }

        private static void WriteNumber(StringBuilder sb, double d)
        {
            if (double.IsNaN(d) || double.IsInfinity(d))
            {
                sb.Append('0');
                return;
            }
            sb.Append(d.ToString("R", CultureInfo.InvariantCulture));
        }

        private static void WriteObject(StringBuilder sb, IDictionary<string, object> dict, bool pretty, int indent)
        {
            sb.Append('{');
            bool first = true;
            foreach (var kv in dict)
            {
                if (!first) sb.Append(',');
                first = false;
                if (pretty) NewLine(sb, indent + 1);
                WriteString(sb, kv.Key);
                sb.Append(pretty ? ": " : ":");
                WriteValue(sb, kv.Value, pretty, indent + 1);
            }
            if (pretty && !first) NewLine(sb, indent);
            sb.Append('}');
        }

        private static void WriteArray(StringBuilder sb, IEnumerable items, bool pretty, int indent)
        {
            sb.Append('[');
            bool first = true;
            foreach (object item in items)
            {
                if (!first) sb.Append(',');
                first = false;
                if (pretty) NewLine(sb, indent + 1);
                WriteValue(sb, item, pretty, indent + 1);
            }
            if (pretty && !first) NewLine(sb, indent);
            sb.Append(']');
        }

        private static void NewLine(StringBuilder sb, int indent)
        {
            sb.Append('\n');
            sb.Append(' ', indent * 2);
        }

        private static void WriteString(StringBuilder sb, string s)
        {
            sb.Append('"');
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    default:
                        if (c < 0x20)
                            sb.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                        else
                            sb.Append(c);
                        break;
                }
            }
            sb.Append('"');
        }

        private sealed class Parser
        {
            private readonly string _s;
            private int _i;

            public Parser(string s)
            {
                _s = s;
                // Skip UTF-8 BOM if present.
                if (_s.Length > 0 && _s[0] == '﻿') _i = 1;
            }

            public bool AtEnd => _i >= _s.Length;

            public FormatException Error(string message) =>
                new FormatException($"JSON error at position {_i}: {message}");

            public void SkipWhitespace()
            {
                while (_i < _s.Length)
                {
                    char c = _s[_i];
                    if (c == ' ' || c == '\t' || c == '\n' || c == '\r') _i++;
                    else if (c == '/' && _i + 1 < _s.Length && _s[_i + 1] == '/')
                    {
                        // Tolerate // comments in hand-edited data files.
                        while (_i < _s.Length && _s[_i] != '\n') _i++;
                    }
                    else break;
                }
            }

            public object ParseValue()
            {
                if (AtEnd) throw Error("Unexpected end of input");
                char c = _s[_i];
                switch (c)
                {
                    case '{': return ParseObject();
                    case '[': return ParseArray();
                    case '"': return ParseString();
                    case 't': Expect("true"); return true;
                    case 'f': Expect("false"); return false;
                    case 'n': Expect("null"); return null;
                    default:
                        if (c == '-' || (c >= '0' && c <= '9')) return ParseNumber();
                        throw Error($"Unexpected character '{c}'");
                }
            }

            private void Expect(string word)
            {
                if (string.CompareOrdinal(_s, _i, word, 0, word.Length) != 0) throw Error($"Expected '{word}'");
                _i += word.Length;
            }

            private Dictionary<string, object> ParseObject()
            {
                var dict = new Dictionary<string, object>();
                _i++; // {
                SkipWhitespace();
                if (!AtEnd && _s[_i] == '}')
                {
                    _i++;
                    return dict;
                }
                while (true)
                {
                    SkipWhitespace();
                    if (AtEnd || _s[_i] != '"') throw Error("Expected property name");
                    string key = ParseString();
                    SkipWhitespace();
                    if (AtEnd || _s[_i] != ':') throw Error("Expected ':'");
                    _i++;
                    SkipWhitespace();
                    dict[key] = ParseValue();
                    SkipWhitespace();
                    if (AtEnd) throw Error("Unterminated object");
                    if (_s[_i] == ',')
                    {
                        _i++;
                        SkipWhitespace();
                        if (!AtEnd && _s[_i] == '}') { _i++; return dict; } // trailing comma
                        continue;
                    }
                    if (_s[_i] == '}')
                    {
                        _i++;
                        return dict;
                    }
                    throw Error("Expected ',' or '}'");
                }
            }

            private List<object> ParseArray()
            {
                var list = new List<object>();
                _i++; // [
                SkipWhitespace();
                if (!AtEnd && _s[_i] == ']')
                {
                    _i++;
                    return list;
                }
                while (true)
                {
                    SkipWhitespace();
                    list.Add(ParseValue());
                    SkipWhitespace();
                    if (AtEnd) throw Error("Unterminated array");
                    if (_s[_i] == ',')
                    {
                        _i++;
                        SkipWhitespace();
                        if (!AtEnd && _s[_i] == ']') { _i++; return list; }
                        continue;
                    }
                    if (_s[_i] == ']')
                    {
                        _i++;
                        return list;
                    }
                    throw Error("Expected ',' or ']'");
                }
            }

            private string ParseString()
            {
                _i++; // opening quote
                var sb = new StringBuilder();
                while (true)
                {
                    if (AtEnd) throw Error("Unterminated string");
                    char c = _s[_i++];
                    if (c == '"') return sb.ToString();
                    if (c != '\\')
                    {
                        sb.Append(c);
                        continue;
                    }
                    if (AtEnd) throw Error("Unterminated escape");
                    char e = _s[_i++];
                    switch (e)
                    {
                        case '"': sb.Append('"'); break;
                        case '\\': sb.Append('\\'); break;
                        case '/': sb.Append('/'); break;
                        case 'b': sb.Append('\b'); break;
                        case 'f': sb.Append('\f'); break;
                        case 'n': sb.Append('\n'); break;
                        case 'r': sb.Append('\r'); break;
                        case 't': sb.Append('\t'); break;
                        case 'u':
                            if (_i + 4 > _s.Length) throw Error("Bad unicode escape");
                            string hex = _s.Substring(_i, 4);
                            if (!int.TryParse(hex, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out int code))
                                throw Error("Bad unicode escape");
                            sb.Append((char)code);
                            _i += 4;
                            break;
                        default:
                            throw Error($"Unknown escape '\\{e}'");
                    }
                }
            }

            private double ParseNumber()
            {
                int start = _i;
                if (_s[_i] == '-') _i++;
                while (_i < _s.Length)
                {
                    char c = _s[_i];
                    if ((c >= '0' && c <= '9') || c == '.' || c == 'e' || c == 'E' || c == '+' || c == '-') _i++;
                    else break;
                }
                string token = _s.Substring(start, _i - start);
                if (!double.TryParse(token, NumberStyles.Float, CultureInfo.InvariantCulture, out double d))
                    throw Error($"Bad number '{token}'");
                return d;
            }
        }
    }

    /// <summary>Typed, null-tolerant accessor over a parsed JSON object.</summary>
    public sealed class JObj
    {
        public readonly Dictionary<string, object> Raw;

        public JObj() : this(new Dictionary<string, object>()) { }

        public JObj(Dictionary<string, object> raw)
        {
            Raw = raw ?? new Dictionary<string, object>();
        }

        public bool Has(string key) => Raw.ContainsKey(key) && Raw[key] != null;

        public object this[string key]
        {
            get => Raw.TryGetValue(key, out object v) ? v : null;
            set => Raw[key] = value;
        }

        public JObj Set(string key, object value)
        {
            Raw[key] = value;
            return this;
        }

        public string Str(string key, string fallback = null)
        {
            if (!Raw.TryGetValue(key, out object v) || v == null) return fallback;
            if (v is string s) return s;
            if (v is double d) return d.ToString(CultureInfo.InvariantCulture);
            if (v is bool b) return b ? "true" : "false";
            return fallback;
        }

        public double Num(string key, double fallback = 0)
        {
            if (!Raw.TryGetValue(key, out object v) || v == null) return fallback;
            switch (v)
            {
                case double d: return d;
                case float f: return f;
                case int i: return i;
                case long l: return l;
                case bool b: return b ? 1 : 0;
                case string s when double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out double p): return p;
                default: return fallback;
            }
        }

        public float F(string key, float fallback = 0f) => (float)Num(key, fallback);
        public int Int(string key, int fallback = 0) => (int)Math.Round(Num(key, fallback));
        public long Long(string key, long fallback = 0) => (long)Math.Round(Num(key, fallback));

        public bool Bool(string key, bool fallback = false)
        {
            if (!Raw.TryGetValue(key, out object v) || v == null) return fallback;
            switch (v)
            {
                case bool b: return b;
                case double d: return Math.Abs(d) > double.Epsilon;
                case string s: return s.Equals("true", StringComparison.OrdinalIgnoreCase) || s == "1";
                default: return fallback;
            }
        }

        public JObj Obj(string key)
        {
            return Raw.TryGetValue(key, out object v) && v is Dictionary<string, object> d ? new JObj(d) : null;
        }

        public List<object> Arr(string key)
        {
            return Raw.TryGetValue(key, out object v) && v is List<object> l ? l : null;
        }

        public IEnumerable<JObj> Objects(string key)
        {
            var arr = Arr(key);
            if (arr == null) yield break;
            foreach (object o in arr)
                if (o is Dictionary<string, object> d) yield return new JObj(d);
        }

        public List<string> Strings(string key)
        {
            var result = new List<string>();
            var arr = Arr(key);
            if (arr == null)
            {
                // Accept a single string or a comma separated string as a list too.
                string single = Str(key);
                if (!string.IsNullOrEmpty(single))
                    foreach (string part in single.Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries))
                        result.Add(part.Trim());
                return result;
            }
            foreach (object o in arr)
            {
                if (o is string s) result.Add(s);
                else if (o is double d) result.Add(d.ToString(CultureInfo.InvariantCulture));
                else if (o is Dictionary<string, object> dict)
                {
                    var jo = new JObj(dict);
                    string text = jo.Str("name") ?? jo.Str("id") ?? jo.Str("text") ?? jo.Str("description");
                    if (text != null) result.Add(text);
                }
            }
            return result;
        }

        public T Enum<T>(string key, T fallback) where T : struct
        {
            string s = Str(key);
            if (s != null && System.Enum.TryParse(s, true, out T value)) return value;
            return fallback;
        }

        public Vec3 V3(string key, Vec3 fallback)
        {
            var arr = Arr(key);
            if (arr == null || arr.Count < 3) return fallback;
            return new Vec3(ToF(arr[0]), ToF(arr[1]), ToF(arr[2]));
        }

        public static List<object> FromV3(Vec3 v) => new List<object> { (double)v.X, (double)v.Y, (double)v.Z };

        private static float ToF(object o) => o is double d ? (float)d : 0f;
    }
}
