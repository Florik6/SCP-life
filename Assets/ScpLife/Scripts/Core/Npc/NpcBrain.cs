using System;
using System.Collections.Generic;

namespace ScpLife.Core
{
    public struct ActivityPlan
    {
        public ActivityType Activity;
        public string RoomId;
        public PoiType Poi;
        public string Label;
        public string[] Route;
        public bool NeedDriven;
        public string TaskId;
        public string TargetId;
        public double Duration;
        public string SpecificPoiId;
    }

    /// <summary>
    /// Autonomous NPC behaviour: priorities (danger → alert → tasks → needs → schedule),
    /// movement through doors with their own keycard, activity effects, and socialising.
    /// Runs identically for NPCs the player sees and for those in remote sectors.
    /// </summary>
    public static class NpcBrain
    {
        public const float ThinkInterval = 1.6f;

        public static void Update(SimWorld w, Npc npc, float dt, double gameMinutes)
        {
            double now = w.Now;
            UpdateNeeds(w, npc, gameMinutes);

            if (npc.PendingBark != null && now >= npc.PendingBarkAt)
            {
                npc.Say(npc.PendingBark, now);
                npc.PendingBark = null;
            }

            if (npc.IsIncapacitated(now))
            {
                if (npc.Activity != ActivityType.Injured)
                {
                    ReleasePoi(w, npc);
                    if (npc.ConversationWith != null) EndConversation(w, npc);
                    npc.Agent.ClearPath();
                    npc.Activity = ActivityType.Injured;
                    npc.ActivityLabel = "Без сознания";
                    npc.CurrentTaskId = null;
                    npc.TargetRoomId = npc.Agent.RoomId;
                }
                npc.Posture = Posture.Down;
                return;
            }

            Perceive(w, npc);

            npc.NextThink -= dt;
            if (npc.NextThink <= 0f)
            {
                npc.NextThink = ThinkInterval * (0.75f + w.Rng.NextFloat() * 0.5f);
                Think(w, npc);
            }

            Act(w, npc, dt, gameMinutes);
            UpdateConversation(w, npc);
        }

        // ------------------------------------------------------------------ needs

        private static void UpdateNeeds(SimWorld w, Npc npc, double gameMinutes)
        {
            float h = (float)(gameMinutes / 60.0);
            if (h <= 0f) return;
            var n = npc.Needs;
            bool settled = npc.Arrived && !npc.Agent.IsMoving;
            bool asleep = npc.Activity == ActivityType.Sleep && settled;

            if (asleep)
            {
                n.Energy += 13f * h;
                n.Hunger += 1.5f * h;
                n.Stress -= 5f * h;
            }
            else
            {
                n.Energy -= 4.2f * h;
                n.Hunger += 5.5f * h;
                n.Social -= 2.5f * h;
                // Stress drifts toward a role baseline: confinement keeps class-D on edge.
                float baseline = npc.Role == NpcRole.DClass ? 30f : 8f + (1f - npc.Traits.Bravery) * 8f;
                n.Stress += (baseline - n.Stress) * Math.Min(1f, 0.08f * h);
            }

            if (settled)
            {
                switch (npc.Activity)
                {
                    case ActivityType.Eat:
                        n.Hunger -= 130f * h;
                        break;
                    case ActivityType.Leisure:
                        n.Stress -= 10f * h;
                        n.Social += 4f * h;
                        break;
                    case ActivityType.Work:
                    case ActivityType.Maintenance:
                    case ActivityType.RepairDoor:
                        n.Energy -= 1.5f * h;
                        break;
                    case ActivityType.Labor:
                        n.Energy -= 2f * h;
                        n.Stress += 1f * h;
                        break;
                    case ActivityType.Shelter:
                    case ActivityType.Confined:
                        if (w.Alert.Level >= AlertLevel.Red) n.Stress += 6f * h;
                        break;
                }
            }
            if (npc.Activity == ActivityType.Patrol) n.Energy -= 1.0f * h;
            if (npc.ConversationWith != null) n.Social += 45f * h;
            if (npc.Activity != ActivityType.Injured && n.Health < 100f) n.Health += 1.5f * h;
            n.Clamp();
        }

        private static bool NeedSatisfied(Npc npc)
        {
            switch (npc.Activity)
            {
                case ActivityType.Eat: return npc.Needs.Hunger < 15f;
                case ActivityType.Sleep: return npc.Needs.Energy > 92f;
                case ActivityType.Leisure: return npc.Needs.Stress < 35f;
                case ActivityType.SeekTreatment: return npc.Needs.Health >= 90f;
                default: return true;
            }
        }

        // ------------------------------------------------------------------ perception

        private static void Perceive(SimWorld w, Npc npc)
        {
            Room myRoom = w.Facility.GetRoom(npc.Agent.RoomId);
            if (myRoom == null) return;
            foreach (var a in w.Anomalies)
            {
                if (a.Agent.RoomId == null || !myRoom.CanSeeInto(a.Agent.RoomId)) continue;
                if (Vec3.DistanceXZ(npc.Agent.Position, a.Agent.Position) > 22f) continue;
                npc.KnownAnomalyThreat = a.Behaviour.ThreatLevel;
                npc.KnownAnomalyThreatTime = w.Now;
                if (a.Contained) continue;
                if (!a.BreachDetected || w.Now - w.Alert.LastKnownAnomalyTime > 0.5)
                    w.Alert.ReportBreachSighting(w, a, a.Agent.RoomId, npc.DisplayName);
                if (npc.Activity != ActivityType.CountingProtocol && npc.Activity != ActivityType.Flee) npc.NextThink = 0f;
            }
        }

        private static AnomalyInstance VisibleBreachedAnomaly(SimWorld w, Npc npc)
        {
            Room myRoom = w.Facility.GetRoom(npc.Agent.RoomId);
            if (myRoom == null) return null;
            foreach (var a in w.Anomalies)
            {
                if (a.Contained || a.Agent.RoomId == null) continue;
                if (!myRoom.CanSeeInto(a.Agent.RoomId)) continue;
                if (Vec3.DistanceXZ(npc.Agent.Position, a.Agent.Position) > 22f) continue;
                return a;
            }
            return null;
        }

        // ------------------------------------------------------------------ decision

        private static void Think(SimWorld w, Npc npc)
        {
            ActivityPlan plan = Decide(w, npc);
            if (IsSamePlan(npc, plan)) return;
            Begin(w, npc, plan);
        }

        private static ActivityPlan MakePlan(ActivityType activity, string roomId, PoiType poi, string label)
        {
            return new ActivityPlan { Activity = activity, RoomId = roomId, Poi = poi, Label = label };
        }

        public static ActivityPlan Decide(SimWorld w, Npc npc)
        {
            double now = w.Now;

            // 1. Immediate danger the NPC can see with their own eyes.
            var visible = VisibleBreachedAnomaly(w, npc);
            if (visible != null)
            {
                bool canCount = npc.KnowsCountingProtocol && npc.Role != NpcRole.DClass &&
                                npc.Traits.Bravery >= 0.3f && npc.Needs.Health > 35f;
                if (canCount)
                {
                    var p = MakePlan(ActivityType.CountingProtocol, visible.Agent.RoomId, PoiType.Stand, "Протокол счёта");
                    p.TargetId = visible.Id;
                    return p;
                }
                return MakePlan(ActivityType.Flee, FleeRoom(w, npc, visible.Agent.RoomId), PoiType.Stand, "Бегство");
            }

            // 2. Facility-wide alert: react with what is publicly known (last reported location).
            var breached = w.Alert.Level >= AlertLevel.Red ? w.GetAnomaly(w.Alert.BreachAnomalyId) : null;
            if (breached != null && !breached.Contained)
            {
                string lastRoom = w.Alert.LastKnownAnomalyRoom ?? breached.ContainmentRoomId;
                bool responder = (npc.Role == NpcRole.Guard || npc.Role == NpcRole.SecurityChief || npc.Role == NpcRole.MtfOperative) &&
                                 npc.Traits.Bravery >= 0.3f && npc.Needs.Health > 35f;
                bool braveScientist = npc.Role == NpcRole.Scientist && npc.KnowsCountingProtocol && npc.Traits.Bravery >= 0.7f;
                if (responder || braveScientist)
                {
                    var p = MakePlan(ActivityType.Respond, lastRoom, PoiType.Stand, "Реагирование: " + w.RoomName(lastRoom));
                    p.TargetId = breached.Id;
                    return p;
                }
                if (npc.Role == NpcRole.DClass)
                {
                    var p = MakePlan(ActivityType.Confined, RoomOfPoi(w, npc.BedPoiId), PoiType.CellBunk, "Изоляция блока D");
                    p.SpecificPoiId = npc.BedPoiId;
                    return p;
                }
                return MakePlan(ActivityType.Shelter, ShelterRoom(w, npc, lastRoom), PoiType.Seat, "Укрытие");
            }

            // 3. Lost keycard: try to get it back.
            var card = w.GetCard(npc.KeycardId);
            if (card != null && card.HolderId != npc.Id && npc.Role != NpcRole.DClass)
            {
                if (card.InWorld && card.WorldRoomId != null && !card.Revoked)
                {
                    var p = MakePlan(ActivityType.RetrieveCard, card.WorldRoomId, PoiType.Stand, "Ищет ключ-карту");
                    p.TargetId = card.Id;
                    return p;
                }
                if (npc.CardLostReportedAt < 0)
                {
                    npc.CardLostReportedAt = now;
                    npc.Say("Кто-то забрал мою карту! Докладываю на пост.", now);
                    w.Events.Post(new FacilityEvent
                    {
                        Time = now,
                        Type = EventType.Report,
                        RoomId = npc.Agent.RoomId,
                        Position = npc.Agent.Position,
                        ActorId = npc.Id,
                        TargetId = card.Id,
                        Severity = 1,
                        Public = true,
                        Text = $"{npc.DisplayName} сообщает об утере ключ-карты {card.Id}"
                    });
                }
            }

            // 4. Injuries.
            if (npc.Needs.Health < 60f && npc.Role != NpcRole.Medic)
            {
                if (npc.Role == NpcRole.DClass)
                {
                    var p = MakePlan(ActivityType.Confined, RoomOfPoi(w, npc.BedPoiId), PoiType.CellBunk, "Отлёживается");
                    p.SpecificPoiId = npc.BedPoiId;
                    return p;
                }
                Room med = FirstRoom(w, RoomType.MedicalBay);
                if (med != null)
                {
                    var p = MakePlan(ActivityType.SeekTreatment, med.Id, PoiType.MedBed, "В медпункт");
                    p.NeedDriven = true; // stays until recovered (health ≥ 90)
                    p.Duration = 240;
                    return p;
                }
            }

            // 5. Tasks issued by the shift dispatcher.
            foreach (var task in w.Tasks.ActiveFor(npc.Id))
            {
                if (task.Kind == TaskKind.ObservationSession)
                {
                    var p = MakePlan(ActivityType.ObservationSession, task.TargetRoomId, PoiType.Console, "Внеплановый сеанс счёта");
                    p.TaskId = task.Id;
                    return p;
                }
                if (task.Kind == TaskKind.RepairDoor)
                {
                    var p = MakePlan(ActivityType.RepairDoor, task.TargetRoomId, PoiType.Panel, "Ремонт: " + (w.Facility.GetDoor(task.TargetId)?.Name ?? "замок"));
                    p.TaskId = task.Id;
                    p.TargetId = task.TargetId;
                    return p;
                }
            }

            // 6. Continue a need-driven activity until satisfied.
            if (npc.NeedDriven && now < npc.ActivityUntil && !NeedSatisfied(npc))
                return CurrentPlan(npc);

            // 7. Critical needs override the schedule (class-D are bound to their routine).
            if (npc.Role != NpcRole.DClass)
            {
                if (npc.Needs.Energy < 10f && npc.BedPoiId != null)
                {
                    var p = MakePlan(ActivityType.Sleep, RoomOfPoi(w, npc.BedPoiId), PoiType.Bed, "Сон (переутомление)");
                    p.NeedDriven = true;
                    p.Duration = 240;
                    p.SpecificPoiId = npc.BedPoiId;
                    return p;
                }
                if (npc.Needs.Hunger > 85f)
                {
                    Room canteen = FirstRoom(w, RoomType.Canteen);
                    if (canteen != null)
                    {
                        var p = MakePlan(ActivityType.Eat, canteen.Id, PoiType.Seat, "Внеплановый перекус");
                        p.NeedDriven = true;
                        p.Duration = 40;
                        return p;
                    }
                }
                if (npc.Needs.Stress > 85f)
                {
                    Room dorm = FirstRoom(w, RoomType.Dormitory);
                    if (dorm != null)
                    {
                        var p = MakePlan(ActivityType.Leisure, dorm.Id, PoiType.Seat, "Перерыв: нервы");
                        p.NeedDriven = true;
                        p.Duration = 30;
                        return p;
                    }
                }
            }

            // 8. Daily schedule.
            var block = npc.Schedule.At(w.Clock.MinuteOfDay);
            if (block != null)
            {
                if (block.Activity == ActivityType.ChamberInspection)
                {
                    // Decision based on what this NPC believes — which may be outdated.
                    // Diligent staff cancel at the first sign of unrest; careless ones need more evidence.
                    float caution = 45f + (1f - npc.Traits.Diligence) * 40f;
                    bool believesAgitated = npc.KnownAnomalyThreat >= caution && now - npc.KnownAnomalyThreatTime < 8 * 60;
                    if (believesAgitated)
                    {
                        Room obs = FirstRoom(w, RoomType.Observation);
                        return MakePlan(ActivityType.ObservationSession, obs?.Id, PoiType.Console, "Осмотр отменён: объект возбуждён — сеанс счёта");
                    }
                }
                return FromBlock(w, npc, block);
            }

            return MakePlan(ActivityType.Idle, npc.WorkRoomId ?? npc.Agent.RoomId, PoiType.Stand, "Свободное время");
        }

        private static ActivityPlan FromBlock(SimWorld w, Npc npc, ScheduleBlock block)
        {
            var p = MakePlan(block.Activity, block.RoomId, block.Poi, block.Label);
            p.Route = block.Route;
            if (block.RoomId == "@bed")
            {
                p.RoomId = RoomOfPoi(w, npc.BedPoiId);
                if (block.Poi == PoiType.Bed || block.Poi == PoiType.CellBunk) p.SpecificPoiId = npc.BedPoiId;
            }
            return p;
        }

        private static ActivityPlan CurrentPlan(Npc npc)
        {
            return new ActivityPlan
            {
                Activity = npc.Activity,
                RoomId = npc.TargetRoomId,
                Label = npc.ActivityLabel,
                Route = npc.Route,
                NeedDriven = npc.NeedDriven,
                TaskId = npc.CurrentTaskId,
                TargetId = npc.FollowTargetId,
                SpecificPoiId = npc.ReservedPoiId
            };
        }

        private static bool IsSamePlan(Npc npc, ActivityPlan p)
        {
            if (npc.Activity != p.Activity) return false;
            if (npc.CurrentTaskId != p.TaskId) return false;
            switch (p.Activity)
            {
                case ActivityType.CountingProtocol:
                case ActivityType.Flee:
                    return true;
                case ActivityType.Respond:
                case ActivityType.Shelter:
                    return npc.TargetRoomId == p.RoomId;
                default:
                    return npc.TargetRoomId == p.RoomId && npc.ActivityLabel == (p.Label ?? npc.ActivityLabel);
            }
        }

        private static string RoomOfPoi(SimWorld w, string poiId) => w.Facility.GetPoi(poiId)?.RoomId;

        private static Room FirstRoom(SimWorld w, RoomType type)
        {
            foreach (var r in w.Facility.RoomsOfType(type)) return r;
            return null;
        }

        private static string FleeRoom(SimWorld w, Npc npc, string dangerRoom)
        {
            return SafestRoom(w, npc, dangerRoom, null);
        }

        private static string ShelterRoom(SimWorld w, Npc npc, string dangerRoom)
        {
            return SafestRoom(w, npc, dangerRoom, new[]
            {
                RoomType.Dormitory, RoomType.Laboratory, RoomType.MedicalBay, RoomType.SecurityPost, RoomType.Canteen, RoomType.Engineering
            });
        }

        private static string SafestRoom(SimWorld w, Npc npc, string dangerRoom, RoomType[] allowed)
        {
            var card = w.GetCard(npc.KeycardId);
            string best = npc.Agent.RoomId;
            float bestScore = float.MinValue;
            foreach (var room in w.Facility.RoomList)
            {
                if (room.Id == dangerRoom) continue;
                if (room.Type == RoomType.Containment) continue;
                if (allowed != null && Array.IndexOf(allowed, room.Type) < 0) continue;
                int dDanger = w.Facility.RoomDistance(dangerRoom, room.Id);
                int dSelf = w.Facility.RoomDistance(npc.Agent.RoomId, room.Id);
                if (dDanger == int.MaxValue || dSelf == int.MaxValue) continue;
                float score = Math.Min(dDanger, 6) * 1.0f - dSelf * 0.35f;
                if (room.Id == npc.Agent.RoomId) score += 0.2f;
                if (score <= bestScore) continue;
                int goal = room.HubNodes.Count > 0 ? room.HubNodes[0] : -1;
                if (goal < 0) continue;
                if (room.Id != npc.Agent.RoomId &&
                    w.PlanPath(npc.Agent.Position, npc.Agent.RoomId, goal, (d, from) => w.CanPlanThrough(d, from, card)) == null)
                    continue;
                bestScore = score;
                best = room.Id;
            }
            return best;
        }

        // ------------------------------------------------------------------ starting activities

        private static void Begin(SimWorld w, Npc npc, ActivityPlan plan)
        {
            double now = w.Now;
            ReleasePoi(w, npc);
            if (npc.ConversationWith != null) EndConversation(w, npc);

            npc.Activity = plan.Activity;
            npc.ActivityLabel = plan.Label ?? NpcText.ActivityName(plan.Activity);
            npc.TargetRoomId = plan.RoomId;
            npc.CurrentTaskId = plan.TaskId;
            npc.NeedDriven = plan.NeedDriven;
            npc.ActivityStarted = now;
            npc.ActivityUntil = plan.Duration > 0 ? now + plan.Duration : 0;
            npc.Route = plan.Route ?? Array.Empty<string>();
            npc.RouteIndex = 0;
            npc.Arrived = false;
            npc.Posture = Posture.Standing;
            npc.DwellTimer = 0f;
            npc.BlockedCount = 0;
            npc.BlockedRetryTimer = 0f;
            npc.FollowTargetId = plan.TargetId;

            switch (plan.Activity)
            {
                case ActivityType.Flee:
                    npc.Say(npc.Role == NpcRole.DClass ? "Откройте! Оно идёт!" : "Оно здесь! Уходим!", now);
                    break;
                case ActivityType.CountingProtocol:
                    npc.Say("Протокол счёта! Один… два… три…", now);
                    break;
                case ActivityType.Shelter:
                    if (w.Alert.Level >= AlertLevel.Red) npc.Say("В укрытие, быстро!", now);
                    break;
                case ActivityType.Respond:
                    npc.Say("Иду на сигнал: " + w.RoomName(plan.RoomId) + ".", now);
                    break;
                case ActivityType.RepairDoor:
                    npc.Say("Принял заявку, иду чинить замок.", now);
                    break;
            }

            SetDestination(w, npc, plan.Poi, plan.SpecificPoiId);
        }

        private static void SetDestination(SimWorld w, Npc npc, PoiType poiType, string specificPoi)
        {
            int goal = -1;
            float? yaw = null;
            Room room = w.Facility.GetRoom(npc.TargetRoomId);

            switch (npc.Activity)
            {
                case ActivityType.Patrol:
                case ActivityType.Maintenance:
                {
                    if (npc.Route.Length == 0) break;
                    var poi = w.Facility.GetPoi(npc.Route[npc.RouteIndex % npc.Route.Length]);
                    if (poi == null) break;
                    npc.TargetRoomId = poi.RoomId;
                    goal = poi.NodeIndex;
                    yaw = poi.FacingYaw;
                    break;
                }
                case ActivityType.CountingProtocol:
                {
                    var a = w.GetAnomaly(npc.FollowTargetId);
                    if (a == null) break;
                    Room mine = w.Facility.GetRoom(npc.Agent.RoomId);
                    string targetRoom = mine != null && mine.CanSeeInto(a.Agent.RoomId) ? mine.Id : a.Agent.RoomId;
                    goal = NearestNodeTowards(w, targetRoom, a.Agent.Position, npc.Agent.Position, 6f);
                    break;
                }
                case ActivityType.RetrieveCard:
                {
                    var card = w.GetCard(npc.FollowTargetId);
                    if (card == null || !card.InWorld) break;
                    goal = w.Facility.NearestNode(card.WorldPosition, card.WorldRoomId);
                    break;
                }
                default:
                {
                    if (room == null) break;
                    PointOfInterest poi = ReservePoi(w, npc, room, poiType, specificPoi);
                    if (poi != null)
                    {
                        goal = poi.NodeIndex;
                        yaw = poi.FacingYaw;
                    }
                    else if (room.HubNodes.Count > 0)
                    {
                        goal = room.HubNodes[w.Rng.Range(0, room.HubNodes.Count)];
                    }
                    break;
                }
            }

            if (goal < 0)
            {
                npc.Agent.ClearPath();
                npc.Arrived = true;
                return;
            }

            var card2 = w.GetCard(npc.KeycardId);
            var path = w.PlanPath(npc.Agent.Position, npc.Agent.RoomId, goal,
                (door, from) => card2 != null && card2.HolderId == npc.Id ? w.CanPlanThrough(door, from, card2) : door.IsPassable);
            if (path == null)
            {
                npc.Agent.ClearPath();
                npc.Arrived = true;
                npc.BlockedRetryTimer = 8f;
                if (npc.BlockedCount++ < 1)
                    npc.Say($"Не могу пройти в «{w.RoomName(npc.TargetRoomId)}».", w.Now);
                return;
            }
            npc.Agent.SetPath(path);
            npc.Agent.ArriveYaw = yaw;
            npc.Arrived = false;
        }

        private static int NearestNodeTowards(SimWorld w, string roomId, Vec3 target, Vec3 from, float keepDistance)
        {
            int best = -1;
            float bestScore = float.MaxValue;
            foreach (var n in w.Facility.Graph.Nodes)
            {
                if (n.RoomId != roomId) continue;
                float dTarget = Vec3.DistanceXZ(n.Position, target);
                float score = Math.Abs(dTarget - keepDistance) + Vec3.DistanceXZ(n.Position, from) * 0.15f;
                if (score < bestScore)
                {
                    bestScore = score;
                    best = n.Index;
                }
            }
            return best;
        }

        private static PointOfInterest ReservePoi(SimWorld w, Npc npc, Room room, PoiType type, string specificPoi)
        {
            PointOfInterest chosen = null;
            if (specificPoi != null)
            {
                chosen = w.Facility.GetPoi(specificPoi);
                if (chosen != null && chosen.ReservedBy != null && chosen.ReservedBy != npc.Id) chosen = null;
            }
            if (chosen == null)
            {
                var candidates = new List<PointOfInterest>();
                foreach (var poi in room.Pois)
                {
                    if (poi.Type != type) continue;
                    if (poi.ReservedBy != null && poi.ReservedBy != npc.Id) continue;
                    if (poi.OwnerId != null && poi.OwnerId != npc.Id) continue;
                    if (poi.OwnerId == npc.Id)
                    {
                        chosen = poi;
                        break;
                    }
                    candidates.Add(poi);
                }
                if (chosen == null && candidates.Count > 0) chosen = candidates[w.Rng.Range(0, candidates.Count)];
            }
            if (chosen != null)
            {
                chosen.ReservedBy = npc.Id;
                npc.ReservedPoiId = chosen.Id;
            }
            return chosen;
        }

        private static void ReleasePoi(SimWorld w, Npc npc)
        {
            if (npc.ReservedPoiId == null) return;
            var poi = w.Facility.GetPoi(npc.ReservedPoiId);
            if (poi != null && poi.ReservedBy == npc.Id) poi.ReservedBy = null;
            npc.ReservedPoiId = null;
        }

        // ------------------------------------------------------------------ acting

        private static void Act(SimWorld w, Npc npc, float dt, double gameMinutes)
        {
            double now = w.Now;
            if (npc.Agent.HasPath)
            {
                var status = w.MoveAgent(npc.Agent, dt, GetDoorHandler(w, npc), true);
                npc.Posture = Posture.Standing;
                if (status == MoveStatus.Arrived) OnArrived(w, npc);
                else if (status == MoveStatus.Blocked) OnBlocked(w, npc);
                else if (status == MoveStatus.Waiting && npc.Agent.BlockedTime > 1.2f && npc.Agent.BlockedTime < 1.2f + dt + 0.01f)
                    npc.Say(npc.Role == NpcRole.DClass ? "Можно пройти, начальник?" : "Разрешите пройти.", now);
                if (npc.Activity == ActivityType.CountingProtocol) UpdateCounting(w, npc, dt);
                return;
            }

            if (npc.BlockedRetryTimer > 0f)
            {
                npc.BlockedRetryTimer -= dt;
                if (npc.BlockedRetryTimer <= 0f) SetDestination(w, npc, PoiTypeFor(w, npc), npc.ReservedPoiId);
                return;
            }

            if (!npc.Arrived) OnArrived(w, npc);

            switch (npc.Activity)
            {
                case ActivityType.Patrol:
                case ActivityType.Maintenance:
                    npc.DwellTimer -= dt;
                    if (npc.DwellTimer <= 0f && npc.Route.Length > 0)
                    {
                        npc.RouteIndex = (npc.RouteIndex + 1) % npc.Route.Length;
                        npc.Arrived = false;
                        SetDestination(w, npc, PoiType.Stand, null);
                    }
                    break;

                case ActivityType.CountingProtocol:
                    UpdateCounting(w, npc, dt);
                    break;

                case ActivityType.Respond:
                {
                    string last = w.Alert.LastKnownAnomalyRoom;
                    if (last != null && last != npc.TargetRoomId)
                    {
                        npc.TargetRoomId = last;
                        npc.ActivityLabel = "Реагирование: " + w.RoomName(last);
                        npc.Arrived = false;
                        SetDestination(w, npc, PoiType.Stand, null);
                    }
                    break;
                }

                case ActivityType.Flee:
                    npc.Activity = ActivityType.Shelter;
                    npc.ActivityLabel = "Укрытие";
                    npc.Posture = Posture.Cowering;
                    break;

                case ActivityType.RetrieveCard:
                {
                    var card = w.GetCard(npc.FollowTargetId);
                    if (card != null && card.InWorld && Vec3.DistanceXZ(card.WorldPosition, npc.Agent.Position) < 2.5f)
                    {
                        card.HolderId = npc.Id;
                        card.WorldRoomId = null;
                        npc.Say("Вот она, моя карта.", now);
                    }
                    npc.NextThink = 0f;
                    break;
                }

                case ActivityType.RepairDoor:
                {
                    npc.DwellTimer += (float)gameMinutes;
                    var task = w.Tasks.Get(npc.CurrentTaskId);
                    var door = w.Facility.GetDoor(task?.TargetId);
                    if (door != null && npc.DwellTimer >= 15f)
                    {
                        door.Integrity = 100f;
                        door.ReaderFaultUntil = 0;
                        if (door.State == DoorState.Open && !w.IsDoorOccupied(door)) door.CommandClose();
                        w.Tasks.Complete(w, task, "замок восстановлен");
                        npc.Say("Замок перебран, контроллер в норме.", now);
                        npc.CurrentTaskId = null;
                        npc.NextThink = 0f;
                    }
                    break;
                }

                case ActivityType.ObservationSession:
                {
                    if (npc.CurrentTaskId != null && now - npc.ActivityStarted > 25)
                    {
                        var task = w.Tasks.Get(npc.CurrentTaskId);
                        if (task != null) w.Tasks.Complete(w, task, "сеанс проведён");
                        npc.CurrentTaskId = null;
                        npc.NextThink = 0f;
                    }
                    else if (w.Rng.Chance(dt * 0.05))
                    {
                        npc.Say(CountLine(w), now, 1.0);
                    }
                    break;
                }

                case ActivityType.Treat:
                    TreatPatients(w, npc, gameMinutes);
                    break;

                case ActivityType.GuardPost:
                    MonitorCameras(w, npc, gameMinutes);
                    break;

                case ActivityType.SeekTreatment:
                    if (!AnyMedicWorking(w, npc.Agent.RoomId)) npc.Needs.Health += (float)(gameMinutes / 60.0) * 3f;
                    break;
            }

            if (npc.NeedDriven && NeedSatisfied(npc))
            {
                npc.NeedDriven = false;
                npc.NextThink = 0f;
            }
        }

        private static PoiType PoiTypeFor(SimWorld w, Npc npc)
        {
            var poi = w.Facility.GetPoi(npc.ReservedPoiId);
            return poi?.Type ?? PoiType.Stand;
        }

        private static void OnArrived(SimWorld w, Npc npc)
        {
            npc.Arrived = true;
            var poi = w.Facility.GetPoi(npc.ReservedPoiId);
            npc.Posture = PostureFor(npc.Activity, poi?.Type ?? PoiType.Stand, w.Alert.Level);
            switch (npc.Activity)
            {
                case ActivityType.Patrol:
                    npc.DwellTimer = w.Rng.Range(10f, 22f);
                    if (w.Rng.Chance(0.35))
                    {
                        var cp = npc.Route.Length > 0 ? w.Facility.GetPoi(npc.Route[npc.RouteIndex % npc.Route.Length]) : null;
                        npc.Say(cp != null ? $"Точка «{cp.Label}»: без происшествий." : "Чисто.", w.Now);
                    }
                    break;
                case ActivityType.Maintenance:
                    npc.DwellTimer = w.Rng.Range(18f, 32f);
                    npc.Posture = Posture.Working;
                    if (w.Rng.Chance(0.3)) npc.Say("Щиток в норме, напряжение стабильное.", w.Now);
                    break;
                case ActivityType.RepairDoor:
                    npc.DwellTimer = 0f;
                    break;
            }
        }

        private static Posture PostureFor(ActivityType activity, PoiType poi, AlertLevel alert)
        {
            switch (activity)
            {
                case ActivityType.Sleep:
                    return poi == PoiType.Bed || poi == PoiType.CellBunk ? Posture.Lying : Posture.Sitting;
                case ActivityType.Confined:
                    return alert >= AlertLevel.Red ? Posture.Cowering : (poi == PoiType.CellBunk ? Posture.Sitting : Posture.Standing);
                case ActivityType.Eat:
                case ActivityType.Leisure:
                    return poi == PoiType.Seat || poi == PoiType.Bed ? Posture.Sitting : Posture.Standing;
                case ActivityType.GuardPost:
                    return Posture.Sitting;
                case ActivityType.Work:
                    return poi == PoiType.Desk || poi == PoiType.Console ? Posture.Sitting : Posture.Working;
                case ActivityType.ObservationSession:
                    return Posture.Counting;
                case ActivityType.ChamberInspection:
                case ActivityType.Maintenance:
                case ActivityType.RepairDoor:
                case ActivityType.Labor:
                case ActivityType.Hygiene:
                case ActivityType.Treat:
                    return Posture.Working;
                case ActivityType.SeekTreatment:
                    return poi == PoiType.MedBed ? Posture.Lying : Posture.Sitting;
                case ActivityType.Shelter:
                    return alert >= AlertLevel.Red ? Posture.Cowering : Posture.Standing;
                case ActivityType.CountingProtocol:
                    return Posture.Counting;
                default:
                    return Posture.Standing;
            }
        }

        private static void OnBlocked(SimWorld w, Npc npc)
        {
            npc.BlockedCount++;
            string doorName = w.Facility.GetDoor(npc.Agent.WaitingDoorId)?.Name ?? "дверь";
            npc.Agent.ClearPath();
            if (npc.BlockedCount >= 3)
            {
                npc.Say($"{doorName} не открывается. Подожду.", w.Now);
                npc.Arrived = true;
                npc.BlockedRetryTimer = 25f;
                npc.BlockedCount = 0;
                npc.NextThink = 20f;
                return;
            }
            npc.Say(npc.G("Странно, не пускает…", "Странно, не пускает…"), w.Now);
            npc.BlockedRetryTimer = 4f + npc.BlockedCount * 2f;
            npc.Arrived = true;
        }

        private static ClosedDoorHandler GetDoorHandler(SimWorld w, Npc npc)
        {
            if (npc.DoorHandler == null) npc.DoorHandler = (door, fromRoom) => HandleDoor(w, npc, door, fromRoom);
            return npc.DoorHandler;
        }

        private static DoorWaitOutcome HandleDoor(SimWorld w, Npc npc, Door door, string fromRoom)
        {
            if (door.State == DoorState.Opening) return DoorWaitOutcome.Wait;
            if (npc.Agent.DoorRequestCooldown > 0f) return DoorWaitOutcome.Wait;
            npc.Agent.DoorRequestCooldown = 1.3f;

            var card = w.GetCard(npc.KeycardId);
            if (card == null || card.HolderId != npc.Id)
            {
                if (npc.Agent.WaitTime < 1.5f) npc.Say("Где моя карта?..", w.Now);
                return npc.Agent.WaitTime > 10f ? DoorWaitOutcome.Blocked : DoorWaitOutcome.Wait;
            }

            var result = w.PresentCard(door.Id, card.Id, npc.Id, fromRoom);
            switch (result)
            {
                case AccessResult.Granted:
                case AccessResult.GrantedOverride:
                    return DoorWaitOutcome.Wait;
                case AccessResult.AwaitingSecondCard:
                    if (npc.Agent.WaitTime > 60f)
                    {
                        npc.Say("Второй карты так и нет. Отбой.", w.Now);
                        return DoorWaitOutcome.Blocked;
                    }
                    if (npc.Agent.WaitTime < 1.5f) npc.Say("Жду вторую карту.", w.Now);
                    return DoorWaitOutcome.Wait;
                case AccessResult.DeniedSameCard:
                    return DoorWaitOutcome.Wait;
                case AccessResult.ReaderFault:
                    if (npc.Agent.WaitTime < 1.5f) npc.Say("Считыватель глючит…", w.Now);
                    return npc.Agent.WaitTime > 25f ? DoorWaitOutcome.Blocked : DoorWaitOutcome.Wait;
                default:
                    return DoorWaitOutcome.Blocked;
            }
        }

        // ------------------------------------------------------------------ special activities

        private static void UpdateCounting(SimWorld w, Npc npc, float dt)
        {
            var a = w.GetAnomaly(npc.FollowTargetId);
            if (a == null || a.Contained)
            {
                npc.NextThink = 0f;
                return;
            }
            bool canCount = w.CanPerformCounting(npc.Id, npc.Agent.Position, npc.Agent.RoomId, a);
            if (canCount)
            {
                if (npc.Agent.HasPath) npc.Agent.ClearPath();
                npc.Posture = Posture.Counting;
                npc.Arrived = true;
                SimWorld.FaceTowards(npc.Agent, a.Agent.Position, dt);
                if (w.Now >= npc.BarkUntil - 0.3) npc.Say(CountLine(w), w.Now, 0.9);
                // Too close: step back while counting.
                if (Vec3.DistanceXZ(npc.Agent.Position, a.Agent.Position) < 2.0f)
                {
                    int retreat = NearestNodeTowards(w, npc.Agent.RoomId, a.Agent.Position, npc.Agent.Position, 7f);
                    var card = w.GetCard(npc.KeycardId);
                    var path = w.PlanPath(npc.Agent.Position, npc.Agent.RoomId, retreat, (d, f) => w.CanPlanThrough(d, f, card));
                    if (path != null) npc.Agent.SetPath(path);
                }
                return;
            }
            npc.DwellTimer -= dt;
            if (npc.DwellTimer <= 0f || !npc.Agent.HasPath)
            {
                npc.DwellTimer = 2f;
                SetDestination(w, npc, PoiType.Stand, null);
            }
        }

        private static string CountLine(SimWorld w)
        {
            int n = (int)(w.RealTime / 1.5f) % 100 + 1;
            return NumberWords.ToWords(n) + "…";
        }

        /// <summary>
        /// A guard at the CCTV desk watches the feeds. Restless anomaly behaviour on a working camera
        /// is noticed with a probability that depends on diligence and stress; then it is reported.
        /// </summary>
        private static void MonitorCameras(SimWorld w, Npc npc, double gameMinutes)
        {
            if (!npc.Arrived || gameMinutes <= 0) return;
            foreach (var a in w.Anomalies)
            {
                if (!a.Contained || !(a.Behaviour is TallymanBehaviour t)) continue;
                bool restless = t.State == TallymanBehaviour.TallyState.Signaling || t.State == TallymanBehaviour.TallyState.Probing;
                if (!restless) continue;
                bool onCamera = false;
                foreach (var cam in w.Surveillance.Cameras)
                    if (cam.Operational && cam.RoomId == a.Agent.RoomId) onCamera = true;
                if (!onCamera) continue;
                double perMinute = 0.04 + npc.Traits.Diligence * 0.1 - npc.Needs.Stress * 0.0005;
                if (!w.Rng.Chance(Math.Max(0.01, perMinute) * gameMinutes)) continue;
                w.ReportAnomalyBehaviour(npc.Id, npc.DisplayName, new FacilityEvent { ActorId = a.Id, RoomId = a.Agent.RoomId });
            }
        }

        private static bool AnyMedicWorking(SimWorld w, string roomId)
        {
            foreach (var other in w.Npcs)
                if (other.Role == NpcRole.Medic && other.Activity == ActivityType.Treat && other.Arrived && other.Agent.RoomId == roomId &&
                    !other.IsIncapacitated(w.Now))
                    return true;
            return false;
        }

        private static void TreatPatients(SimWorld w, Npc medic, double gameMinutes)
        {
            float heal = (float)(gameMinutes / 60.0) * 35f;
            foreach (var patient in w.Npcs)
            {
                if (patient == medic || patient.Activity != ActivityType.SeekTreatment || !patient.Arrived) continue;
                if (patient.Agent.RoomId != medic.Agent.RoomId) continue;
                bool wasBelow = patient.Needs.Health < 90f;
                patient.Needs.Health = Math.Min(100f, patient.Needs.Health + heal);
                patient.Needs.Stress = Math.Max(0f, patient.Needs.Stress - heal * 0.5f);
                if (wasBelow && patient.Needs.Health >= 90f)
                {
                    w.Events.Post(new FacilityEvent
                    {
                        Time = w.Now,
                        Type = EventType.Treatment,
                        RoomId = medic.Agent.RoomId,
                        ActorId = medic.Id,
                        TargetId = patient.Id,
                        Text = $"{medic.DisplayName} оказала помощь: {patient.DisplayName} снова в строю"
                    });
                    medic.Say($"{patient.ShortName}, можете возвращаться к работе.", w.Now);
                    patient.NextThink = 0f;
                }
            }
        }

        // ------------------------------------------------------------------ conversations

        private static bool IsSocialActivity(Npc npc)
        {
            switch (npc.Activity)
            {
                case ActivityType.Eat:
                case ActivityType.Leisure:
                    return true;
                case ActivityType.Labor:
                case ActivityType.Confined:
                    return npc.Role == NpcRole.DClass && npc.Posture != Posture.Cowering;
                default:
                    return false;
            }
        }

        private static void UpdateConversation(SimWorld w, Npc npc)
        {
            double now = w.Now;
            if (npc.ConversationWith != null)
            {
                var partner = w.GetNpc(npc.ConversationWith);
                if (partner == null || now >= npc.ConversationUntil || partner.Agent.RoomId != npc.Agent.RoomId ||
                    partner.IsIncapacitated(now) || npc.Agent.HasPath)
                {
                    EndConversation(w, npc);
                }
                return;
            }

            if (!npc.Arrived || npc.Agent.HasPath || !IsSocialActivity(npc)) return;
            if (now < npc.NextConversationTime) return;
            if (npc.Needs.Social > 85f && !w.Rng.Chance(0.25))
            {
                npc.NextConversationTime = now + 20;
                return;
            }

            Npc best = null;
            float bestScore = float.MinValue;
            foreach (var other in w.Npcs)
            {
                if (other == npc || other.ConversationWith != null || !other.Arrived || other.Agent.HasPath) continue;
                if (other.Agent.RoomId != npc.Agent.RoomId || !IsSocialActivity(other)) continue;
                if (other.IsIncapacitated(now)) continue;
                if (Vec3.DistanceXZ(other.Agent.Position, npc.Agent.Position) > 6f) continue;
                float score = npc.RelationTo(other.Id) * 0.02f + w.Rng.NextFloat() + other.Traits.Sociability * 0.5f;
                if (score > bestScore)
                {
                    bestScore = score;
                    best = other;
                }
            }
            if (best == null || !w.Rng.Chance(0.35 + npc.Traits.Sociability * 0.5))
            {
                npc.NextConversationTime = now + w.Rng.Range(8f, 20f);
                return;
            }
            StartConversation(w, npc, best);
        }

        private static void StartConversation(SimWorld w, Npc a, Npc b)
        {
            double now = w.Now;
            double duration = w.Rng.Range(6f, 12f);
            a.ConversationWith = b.Id;
            b.ConversationWith = a.Id;
            a.ConversationUntil = b.ConversationUntil = now + duration;
            a.NextConversationTime = now + duration + w.Rng.Range(35f, 80f);
            b.NextConversationTime = now + duration + w.Rng.Range(35f, 80f);

            var result = NpcDialogue.Converse(w, a, b);
            a.Say(result.OpeningLine, now, 2.0);
            b.PendingBark = result.ReplyLine;
            b.PendingBarkAt = now + 1.2;
            if (result.FollowUpLine != null)
            {
                a.PendingBark = result.FollowUpLine;
                a.PendingBarkAt = now + 3.0;
            }

            if (result.Conflict)
            {
                w.Events.Post(new FacilityEvent
                {
                    Time = now,
                    Type = EventType.Conflict,
                    RoomId = a.Agent.RoomId,
                    Position = a.Agent.Position,
                    ActorId = a.Id,
                    TargetId = b.Id,
                    Severity = a.Role == NpcRole.DClass || b.Role == NpcRole.DClass ? 2 : 1,
                    Text = $"Ссора: {a.DisplayName} и {b.DisplayName}"
                });
            }
        }

        private static void EndConversation(SimWorld w, Npc npc)
        {
            var partner = w.GetNpc(npc.ConversationWith);
            npc.ConversationWith = null;
            if (partner != null && partner.ConversationWith == npc.Id) partner.ConversationWith = null;
        }
    }
}
