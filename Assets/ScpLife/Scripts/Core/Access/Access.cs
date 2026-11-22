using System;
using System.Collections.Generic;

namespace ScpLife.Core
{
    public enum AccessLevel
    {
        L0 = 0,
        L1 = 1,
        L2 = 2,
        L3 = 3,
        L4 = 4,
        L5 = 5
    }

    /// <summary>Additional clearances on top of the numeric level.</summary>
    [Flags]
    public enum Permission
    {
        None = 0,
        Security = 1 << 0,
        Research = 1 << 1,
        Engineering = 1 << 2,
        Medical = 1 << 3,
        DClassBlock = 1 << 4,
        Containment = 1 << 5,
        Armory = 1 << 6,
        Command = 1 << 7,
        Surveillance = 1 << 8,
        CellResident = 1 << 9
    }

    /// <summary>What a reader demands. Permissions use "any of" semantics.</summary>
    [Serializable]
    public struct AccessRequirement
    {
        public AccessLevel MinLevel;
        public Permission AnyOf;
        public bool DualAuthorization;

        public AccessRequirement(AccessLevel minLevel, Permission anyOf = Permission.None, bool dual = false)
        {
            MinLevel = minLevel;
            AnyOf = anyOf;
            DualAuthorization = dual;
        }

        public static AccessRequirement Open => new AccessRequirement(AccessLevel.L0);

        public string Describe()
        {
            string s = MinLevel.ToString();
            if (AnyOf != Permission.None) s += " + " + AccessText.PermissionList(AnyOf);
            if (DualAuthorization) s += " (две карты)";
            return s;
        }
    }

    public enum AccessResult
    {
        Granted,
        GrantedOverride,
        AwaitingSecondCard,
        DeniedLevel,
        DeniedPermission,
        DeniedRevoked,
        DeniedLocked,
        DeniedLockdown,
        DeniedSameCard,
        DeniedCurfew,
        ReaderFault
    }

    /// <summary>A physical keycard. It can be carried by someone or lie somewhere in the world.</summary>
    public sealed class Keycard
    {
        public string Id;
        public string OwnerId;
        public string OwnerName;
        public AccessLevel Level;
        public Permission Permissions;
        public bool Revoked;
        /// <summary>Temporary elevation granted by the dispatcher (e.g. a technician sent to repair a containment lock).</summary>
        public AccessLevel TempLevel;
        public Permission TempPermissions;
        public double TempUntil = -1;

        public AccessLevel EffectiveLevel(double now) => TempUntil > now && TempLevel > Level ? TempLevel : Level;
        public Permission EffectivePermissions(double now) => TempUntil > now ? Permissions | TempPermissions : Permissions;

        /// <summary>Who currently carries the card (npc id or "player"), null if it lies in the world.</summary>
        public string HolderId;
        public string WorldRoomId;
        public Vec3 WorldPosition;

        public bool InWorld => string.IsNullOrEmpty(HolderId);

        public string Label => $"{Level} · {OwnerName}";

        public JObj Save()
        {
            var o = new JObj();
            o["id"] = Id;
            o["owner"] = OwnerId;
            o["ownerName"] = OwnerName;
            o["level"] = (int)Level;
            o["perm"] = (int)Permissions;
            o["revoked"] = Revoked;
            o["holder"] = HolderId;
            o["room"] = WorldRoomId;
            o["pos"] = JObj.FromV3(WorldPosition);
            o["tmpL"] = (int)TempLevel;
            o["tmpP"] = (int)TempPermissions;
            o["tmpU"] = TempUntil;
            return o;
        }

        public static Keycard Load(JObj o)
        {
            return new Keycard
            {
                Id = o.Str("id"),
                OwnerId = o.Str("owner"),
                OwnerName = o.Str("ownerName"),
                Level = (AccessLevel)o.Int("level"),
                Permissions = (Permission)o.Int("perm"),
                Revoked = o.Bool("revoked"),
                HolderId = o.Str("holder"),
                WorldRoomId = o.Str("room"),
                WorldPosition = o.V3("pos", Vec3.Zero),
                TempLevel = (AccessLevel)o.Int("tmpL"),
                TempPermissions = (Permission)o.Int("tmpP"),
                TempUntil = o.Num("tmpU", -1)
            };
        }
    }

    public sealed class AccessLogEntry
    {
        public double Time;
        public string DoorId;
        public string CardId;
        public string CardOwnerName;
        /// <summary>Who physically presented the card. The facility only sees the card; kept for investigations/debug.</summary>
        public string PresenterId;
        public AccessResult Result;

        public bool Success => Result == AccessResult.Granted || Result == AccessResult.GrantedOverride;

        public JObj Save()
        {
            var o = new JObj();
            o["t"] = Time;
            o["door"] = DoorId;
            o["card"] = CardId;
            o["owner"] = CardOwnerName;
            o["by"] = PresenterId;
            o["r"] = (int)Result;
            return o;
        }

        public static AccessLogEntry Load(JObj o) => new AccessLogEntry
        {
            Time = o.Num("t"),
            DoorId = o.Str("door"),
            CardId = o.Str("card"),
            CardOwnerName = o.Str("owner"),
            PresenterId = o.Str("by"),
            Result = (AccessResult)o.Int("r")
        };
    }

    /// <summary>Facility-wide journal of every card presentation.</summary>
    public sealed class AccessLog
    {
        public const int Capacity = 400;
        public readonly List<AccessLogEntry> Entries = new List<AccessLogEntry>();

        public void Add(AccessLogEntry e)
        {
            Entries.Add(e);
            if (Entries.Count > Capacity) Entries.RemoveRange(0, Entries.Count - Capacity);
        }

        public IEnumerable<AccessLogEntry> ForDoor(string doorId)
        {
            for (int i = Entries.Count - 1; i >= 0; i--)
                if (Entries[i].DoorId == doorId) yield return Entries[i];
        }
    }

    public static class AccessControl
    {
        /// <summary>
        /// Pure rule check of a card against a requirement (no door state).
        /// L4+ cards act as command override for everything except containment,
        /// which needs an explicit Containment permission or L5.
        /// </summary>
        public static AccessResult CheckCard(Keycard card, AccessRequirement req, double now = 0)
        {
            if (card == null) return AccessResult.DeniedLevel;
            if (card.Revoked) return AccessResult.DeniedRevoked;
            AccessLevel level = card.EffectiveLevel(now);
            Permission perms = card.EffectivePermissions(now);
            if (level < req.MinLevel) return AccessResult.DeniedLevel;
            if (req.AnyOf == Permission.None) return AccessResult.Granted;
            if ((perms & req.AnyOf) != 0) return AccessResult.Granted;

            bool needsContainment = (req.AnyOf & Permission.Containment) == req.AnyOf;
            if (level >= AccessLevel.L5) return AccessResult.GrantedOverride;
            if (level >= AccessLevel.L4 && !needsContainment) return AccessResult.GrantedOverride;
            return AccessResult.DeniedPermission;
        }

        public static bool IsSuccess(AccessResult r) => r == AccessResult.Granted || r == AccessResult.GrantedOverride;
    }

    public static class AccessText
    {
        public static string PermissionList(Permission p)
        {
            if (p == Permission.None) return "—";
            var parts = new List<string>();
            foreach (Permission flag in Enum.GetValues(typeof(Permission)))
            {
                if (flag == Permission.None) continue;
                if ((p & flag) != 0) parts.Add(PermissionName(flag));
            }
            return string.Join("/", parts);
        }

        public static string PermissionName(Permission p)
        {
            switch (p)
            {
                case Permission.Security: return "Охрана";
                case Permission.Research: return "Исследования";
                case Permission.Engineering: return "Инженерия";
                case Permission.Medical: return "Медицина";
                case Permission.DClassBlock: return "Блок D";
                case Permission.Containment: return "Содержание";
                case Permission.Armory: return "Оружейная";
                case Permission.Command: return "Командование";
                case Permission.Surveillance: return "Наблюдение";
                case Permission.CellResident: return "Камера D";
                default: return p.ToString();
            }
        }

        public static string ResultText(AccessResult r)
        {
            switch (r)
            {
                case AccessResult.Granted: return "Доступ разрешён";
                case AccessResult.GrantedOverride: return "Доступ разрешён (приоритет командования)";
                case AccessResult.AwaitingSecondCard: return "Принято. Требуется вторая карта";
                case AccessResult.DeniedLevel: return "Отказ: недостаточный уровень допуска";
                case AccessResult.DeniedPermission: return "Отказ: нет разрешения для этой зоны";
                case AccessResult.DeniedRevoked: return "Отказ: карта аннулирована";
                case AccessResult.DeniedLocked: return "Отказ: дверь заблокирована";
                case AccessResult.DeniedLockdown: return "Отказ: режим изоляции";
                case AccessResult.DeniedSameCard: return "Отказ: вторая карта должна принадлежать другому сотруднику";
                case AccessResult.DeniedCurfew: return "Отказ: комендантский час";
                case AccessResult.ReaderFault: return "Ошибка считывателя";
                default: return r.ToString();
            }
        }
    }
}
