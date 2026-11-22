using System;
using System.Collections.Generic;

namespace ScpLife.Core
{
    public enum TaskKind
    {
        Patrol,
        CameraCheck,
        Investigate,
        ObservationSession,
        RepairDoor,
        Respond
    }

    public enum DutyTaskStatus
    {
        Active,
        Completed,
        Failed,
        Cancelled
    }

    public sealed class DutyTask
    {
        public string Id;
        public TaskKind Kind;
        public string Title;
        public string Description;
        public string AssigneeId;
        public string IssuedBy = "Диспетчер смены";
        public string TargetRoomId;
        public string TargetId;
        public readonly List<string> Checkpoints = new List<string>();
        public readonly HashSet<string> Done = new HashSet<string>();
        public int RequiredCount;
        public double Issued;
        public double Deadline;
        public DutyTaskStatus Status = DutyTaskStatus.Active;

        public bool IsActive => Status == DutyTaskStatus.Active;

        public string ProgressText
        {
            get
            {
                switch (Kind)
                {
                    case TaskKind.Patrol: return $"{Done.Count}/{Checkpoints.Count} точек";
                    case TaskKind.CameraCheck: return $"{Done.Count}/{RequiredCount} камер";
                    default: return "";
                }
            }
        }

        public JObj Save()
        {
            var o = new JObj();
            o["id"] = Id;
            o["kind"] = (int)Kind;
            o["title"] = Title;
            o["desc"] = Description;
            o["who"] = AssigneeId;
            o["by"] = IssuedBy;
            o["room"] = TargetRoomId;
            o["target"] = TargetId;
            o["cps"] = new List<object>(Checkpoints);
            o["done"] = new List<object>(Done);
            o["req"] = RequiredCount;
            o["issued"] = Issued;
            o["deadline"] = Deadline;
            o["status"] = (int)Status;
            return o;
        }

        public static DutyTask Load(JObj o)
        {
            var t = new DutyTask
            {
                Id = o.Str("id"),
                Kind = (TaskKind)o.Int("kind"),
                Title = o.Str("title"),
                Description = o.Str("desc"),
                AssigneeId = o.Str("who"),
                IssuedBy = o.Str("by", "Диспетчер смены"),
                TargetRoomId = o.Str("room"),
                TargetId = o.Str("target"),
                RequiredCount = o.Int("req"),
                Issued = o.Num("issued"),
                Deadline = o.Num("deadline"),
                Status = (DutyTaskStatus)o.Int("status")
            };
            t.Checkpoints.AddRange(o.Strings("cps"));
            foreach (string d in o.Strings("done")) t.Done.Add(d);
            return t;
        }
    }

    public sealed class TaskBoard
    {
        public readonly List<DutyTask> Tasks = new List<DutyTask>();
        public int NextId = 1;

        public DutyTask Issue(SimWorld world, DutyTask task)
        {
            task.Id = "T" + NextId++;
            task.Issued = world.Now;
            task.Status = DutyTaskStatus.Active;
            Tasks.Add(task);
            if (Tasks.Count > 120) Tasks.RemoveAll(t => !t.IsActive && world.Now - t.Issued > 24 * 60);
            world.Events.Post(new FacilityEvent
            {
                Time = world.Now,
                Type = EventType.TaskIssued,
                ActorId = task.AssigneeId,
                TargetId = task.Id,
                RoomId = task.TargetRoomId,
                Severity = 0,
                Text = $"{task.IssuedBy} → {world.NameOf(task.AssigneeId)}: {task.Title}"
            });
            return task;
        }

        public DutyTask Get(string id)
        {
            foreach (var t in Tasks)
                if (t.Id == id) return t;
            return null;
        }

        public IEnumerable<DutyTask> ActiveFor(string assigneeId)
        {
            foreach (var t in Tasks)
                if (t.IsActive && t.AssigneeId == assigneeId) yield return t;
        }

        public DutyTask FirstActive(string assigneeId, TaskKind kind)
        {
            foreach (var t in Tasks)
                if (t.IsActive && t.AssigneeId == assigneeId && t.Kind == kind) return t;
            return null;
        }

        public bool HasActive(TaskKind kind, string targetId = null)
        {
            foreach (var t in Tasks)
                if (t.IsActive && t.Kind == kind && (targetId == null || t.TargetId == targetId)) return true;
            return false;
        }

        public void Complete(SimWorld world, DutyTask task, string note = null)
        {
            if (!task.IsActive) return;
            task.Status = DutyTaskStatus.Completed;
            if (task.AssigneeId == PlayerState.PlayerId)
            {
                world.Player.TasksCompleted++;
                world.Player.Reputation = Math.Min(100, world.Player.Reputation + 3);
            }
            world.Events.Post(new FacilityEvent
            {
                Time = world.Now,
                Type = EventType.TaskCompleted,
                ActorId = task.AssigneeId,
                TargetId = task.Id,
                RoomId = task.TargetRoomId,
                Text = $"{world.NameOf(task.AssigneeId)}: выполнено «{task.Title}»" + (note != null ? $" — {note}" : "")
            });
        }

        public void Fail(SimWorld world, DutyTask task, string reason)
        {
            if (!task.IsActive) return;
            task.Status = DutyTaskStatus.Failed;
            if (task.AssigneeId == PlayerState.PlayerId)
            {
                world.Player.TasksFailed++;
                world.Player.Reputation = Math.Max(0, world.Player.Reputation - 5);
            }
            world.Events.Post(new FacilityEvent
            {
                Time = world.Now,
                Type = EventType.TaskFailed,
                ActorId = task.AssigneeId,
                TargetId = task.Id,
                Severity = 1,
                Text = $"{world.NameOf(task.AssigneeId)}: не выполнено «{task.Title}» ({reason})"
            });
        }

        public void Tick(SimWorld world)
        {
            foreach (var t in new List<DutyTask>(Tasks))
                if (t.IsActive && t.Deadline > 0 && world.Now > t.Deadline)
                    Fail(world, t, "истёк срок");
        }

        public List<object> Save()
        {
            var list = new List<object>();
            foreach (var t in Tasks) list.Add(t.Save());
            return list;
        }

        public void Load(List<object> list, int nextId)
        {
            Tasks.Clear();
            NextId = Math.Max(1, nextId);
            if (list == null) return;
            foreach (object o in list)
                if (o is Dictionary<string, object> d)
                    Tasks.Add(DutyTask.Load(new JObj(d)));
        }
    }
}
