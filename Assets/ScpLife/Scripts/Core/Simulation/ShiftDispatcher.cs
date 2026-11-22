using System;
using System.Collections.Generic;

namespace ScpLife.Core
{
    /// <summary>
    /// Stage-1 shift dispatcher: issues duty tasks to the player, reacts to containment sensors
    /// (overdue counting sessions, failing door locks), handles lost keycards and alert de-escalation.
    /// Stage 2 replaces it with the full SCP LIFE management system.
    /// </summary>
    public sealed class ShiftDispatcher
    {
        public const string IssuerName = "Диспетчер смены";

        public double LastPatrolIssued = -10000;
        public double LastCameraCheckIssued = -10000;
        public double CalmSince = -1;
        public double LastInvestigateIssued = -10000;
        public double LastEmergencySession = -10000;
        private float _timer;

        public void Tick(SimWorld w, float dt)
        {
            _timer -= dt;
            if (_timer > 0f) return;
            _timer = 2f;

            IssuePlayerDuties(w);
            MonitorContainment(w);
            HandleLostCards(w);
            UpdateAlertLevel(w);
        }

        // ------------------------------------------------------------------ player duties

        private void IssuePlayerDuties(SimWorld w)
        {
            if (w.Player.Dead || w.Player.Role != NpcRole.Guard) return;
            double now = w.Now;
            double minute = w.Clock.MinuteOfDay;
            bool onDuty = GameClock.InRange(minute, GameClock.Hm(7, 30), GameClock.Hm(23, 0));
            if (!onDuty || w.Alert.Level >= AlertLevel.Red) return;

            if (w.Tasks.FirstActive(PlayerState.PlayerId, TaskKind.Patrol) == null && now - LastPatrolIssued >= 100)
            {
                var route = BuildPatrolRoute(w, 5);
                if (route.Count > 0)
                {
                    var task = new DutyTask
                    {
                        Kind = TaskKind.Patrol,
                        Title = "Обход сектора",
                        Description = "Отметьтесь на контрольных точках маршрута: " + string.Join(" → ", route.ConvertAll(id => w.Facility.GetPoi(id).Label)),
                        AssigneeId = PlayerState.PlayerId,
                        IssuedBy = IssuerName,
                        Deadline = now + 90
                    };
                    task.Checkpoints.AddRange(route);
                    w.Tasks.Issue(w, task);
                    LastPatrolIssued = now;
                }
            }

            if (w.Tasks.FirstActive(PlayerState.PlayerId, TaskKind.CameraCheck) == null && now - LastCameraCheckIssued >= 240)
            {
                var task = new DutyTask
                {
                    Kind = TaskKind.CameraCheck,
                    Title = "Проверка видеонаблюдения",
                    Description = "На посту КПП просмотрите не менее 4 камер и убедитесь, что они исправны.",
                    AssigneeId = PlayerState.PlayerId,
                    IssuedBy = IssuerName,
                    RequiredCount = Math.Min(4, w.Surveillance.Cameras.Count),
                    Deadline = now + 120
                };
                w.Tasks.Issue(w, task);
                LastCameraCheckIssued = now;
                w.Player.CamerasViewedThisShift.Clear();
            }
        }

        public static List<string> BuildPatrolRoute(SimWorld w, int count)
        {
            var playerCard = w.GetCard(w.Player.SelectedCardId);
            var candidates = new List<PointOfInterest>();
            foreach (var poi in w.Facility.Pois.Values)
            {
                if (poi.Type != PoiType.PatrolPoint) continue;
                candidates.Add(poi);
            }
            candidates.Sort((x, y) => string.CompareOrdinal(x.Id, y.Id));
            var route = new List<string>();
            int guard = 0;
            while (route.Count < count && candidates.Count > 0 && guard++ < 50)
            {
                var pick = candidates[w.Rng.Range(0, candidates.Count)];
                candidates.Remove(pick);
                if (playerCard != null && !RoomReachable(w, pick.RoomId, playerCard)) continue;
                route.Add(pick.Id);
            }
            // Order the route by a simple nearest-neighbour walk from the player's position.
            var ordered = new List<string>();
            Vec3 cursor = w.Player.Position;
            while (route.Count > 0)
            {
                int best = 0;
                float bestD = float.MaxValue;
                for (int i = 0; i < route.Count; i++)
                {
                    float d = Vec3.DistanceXZ(cursor, w.Facility.GetPoi(route[i]).Position);
                    if (d < bestD)
                    {
                        bestD = d;
                        best = i;
                    }
                }
                ordered.Add(route[best]);
                cursor = w.Facility.GetPoi(route[best]).Position;
                route.RemoveAt(best);
            }
            return ordered;
        }

        private static bool RoomReachable(SimWorld w, string roomId, Keycard card)
        {
            var room = w.Facility.GetRoom(roomId);
            if (room == null || room.HubNodes.Count == 0) return false;
            string from = w.Player.RoomId ?? w.Facility.RoomList[0].Id;
            return w.PlanPath(w.Player.Position, from, room.HubNodes[0], (d, f) => w.CanPlanThrough(d, f, card)) != null;
        }

        // ------------------------------------------------------------------ containment monitoring

        private void MonitorContainment(SimWorld w)
        {
            double now = w.Now;
            foreach (var anomaly in w.Anomalies)
            {
                if (!(anomaly.Behaviour is TallymanBehaviour tally)) continue;

                // Overdue session, or unrest reported (alert for this chamber) → counting session by a scientist.
                bool unrestReported = w.Alert.Level >= AlertLevel.Yellow && w.Alert.RoomId == anomaly.ContainmentRoomId &&
                                      now - LastEmergencySession >= 45 && now - tally.LastSessionEnd > 20;
                if ((tally.SessionOverdueMinutes(now) > 0 || unrestReported) &&
                    !w.Tasks.HasActive(TaskKind.ObservationSession, anomaly.Id) && anomaly.Contained)
                {
                    if (unrestReported) LastEmergencySession = now;
                    var scientist = PickScientist(w);
                    var obs = FirstRoom(w, RoomType.Observation);
                    if (scientist != null && obs != null)
                    {
                        w.Tasks.Issue(w, new DutyTask
                        {
                            Kind = TaskKind.ObservationSession,
                            Title = $"Внеплановый сеанс счёта {anomaly.Id}",
                            Description = unrestReported
                                ? "Поступил доклад о беспокойстве объекта. Провести сеанс счёта у окна наблюдения."
                                : "Плановый сеанс просрочен. Провести сеанс счёта у окна наблюдения.",
                            AssigneeId = scientist.Id,
                            IssuedBy = IssuerName,
                            TargetRoomId = obs.Id,
                            TargetId = anomaly.Id,
                            Deadline = now + 90
                        });
                        scientist.NextThink = 0f;
                    }
                }

                // Lock integrity sensor.
                Door door = w.Facility.GetDoor(tally.ContainmentDoorId);
                if (door != null && door.Integrity < 70f && !w.Tasks.HasActive(TaskKind.RepairDoor, door.Id))
                {
                    var tech = PickByRole(w, NpcRole.Technician);
                    Room repairRoom = w.Facility.GetRoom(door.RoomA)?.Type == RoomType.Containment ? w.Facility.GetRoom(door.RoomB) : w.Facility.GetRoom(door.RoomA);
                    if (tech != null && repairRoom != null)
                    {
                        // Temporary clearance so the technician can reach the lock controller.
                        var card = w.GetCard(tech.KeycardId);
                        if (card != null)
                        {
                            card.TempLevel = AccessLevel.L3;
                            card.TempPermissions = Permission.Containment;
                            card.TempUntil = now + 120;
                        }
                        w.Tasks.Issue(w, new DutyTask
                        {
                            Kind = TaskKind.RepairDoor,
                            Title = "Ремонт замка камеры " + anomaly.Id,
                            Description = $"Целостность замка {door.Name}: {door.Integrity:0}%. Временный допуск L3 выдан на 2 часа.",
                            AssigneeId = tech.Id,
                            IssuedBy = IssuerName,
                            TargetRoomId = repairRoom.Id,
                            TargetId = door.Id,
                            Deadline = now + 120
                        });
                        tech.NextThink = 0f;
                    }
                }

                // Automatic sensors only measure what hardware can measure: interference with the
                // lock controller and lock integrity. Tapping, staring or silently waiting at the door
                // must be noticed by people (observation room, camera monitoring) and reported.
                if (anomaly.Contained)
                {
                    bool lockInterference = tally.State == TallymanBehaviour.TallyState.Probing;
                    if (lockInterference || (door != null && door.Integrity < 50f))
                        w.Alert.Raise(w, AlertLevel.Orange, $"Датчики камеры {anomaly.Id}: воздействие на замок", anomaly.ContainmentRoomId);

                    bool reported = w.Alert.Level >= AlertLevel.Yellow && w.Alert.RoomId == anomaly.ContainmentRoomId;
                    if (reported && !w.Tasks.HasActive(TaskKind.Investigate, anomaly.Id) && w.Player.Role == NpcRole.Guard && !w.Player.Dead &&
                        now - LastInvestigateIssued > 90)
                    {
                        LastInvestigateIssued = now;
                        w.Tasks.Issue(w, new DutyTask
                        {
                            Kind = TaskKind.Investigate,
                            Title = $"Проверить {anomaly.Id}",
                            Description = "Датчики фиксируют активность. Осмотрите объект через окно наблюдательного пункта или по камере и доложите.",
                            AssigneeId = PlayerState.PlayerId,
                            IssuedBy = IssuerName,
                            TargetRoomId = FirstRoom(w, RoomType.Observation)?.Id,
                            TargetId = anomaly.Id,
                            Deadline = now + 45
                        });
                    }
                }
            }
        }

        private static Npc PickScientist(SimWorld w)
        {
            Npc best = null;
            float bestScore = float.MinValue;
            foreach (var npc in w.Npcs)
            {
                if (npc.Role != NpcRole.Scientist || !npc.KnowsCountingProtocol || npc.IsIncapacitated(w.Now)) continue;
                float score = npc.Traits.Diligence * 10f;
                if (npc.Activity == ActivityType.Sleep) score -= 20f;
                if (npc.Activity == ActivityType.Work) score += 5f;
                score -= npc.Needs.Stress * 0.05f;
                if (score > bestScore)
                {
                    bestScore = score;
                    best = npc;
                }
            }
            return best;
        }

        private static Npc PickByRole(SimWorld w, NpcRole role)
        {
            Npc best = null;
            foreach (var npc in w.Npcs)
            {
                if (npc.Role != role || npc.IsIncapacitated(w.Now)) continue;
                if (best == null || (best.Activity == ActivityType.Sleep && npc.Activity != ActivityType.Sleep)) best = npc;
            }
            return best;
        }

        private static Room FirstRoom(SimWorld w, RoomType type)
        {
            foreach (var r in w.Facility.RoomsOfType(type)) return r;
            return null;
        }

        // ------------------------------------------------------------------ lost cards

        private static void HandleLostCards(SimWorld w)
        {
            double now = w.Now;
            foreach (var npc in w.Npcs)
            {
                if (npc.CardLostReportedAt < 0 || now - npc.CardLostReportedAt < 30) continue;
                var old = w.GetCard(npc.KeycardId);
                if (old != null && old.HolderId == npc.Id)
                {
                    npc.CardLostReportedAt = -1;
                    continue;
                }
                if (old != null) old.Revoked = true;
                var fresh = new Keycard
                {
                    Id = (old?.Id ?? "card." + npc.Id) + "r",
                    OwnerId = npc.Id,
                    OwnerName = npc.DisplayName,
                    Level = old?.Level ?? AccessLevel.L1,
                    Permissions = old?.Permissions ?? Permission.None,
                    HolderId = npc.Id
                };
                w.AddKeycard(fresh);
                npc.KeycardId = fresh.Id;
                npc.CardLostReportedAt = -1;
                npc.NextThink = 0f;
                w.Events.Post(new FacilityEvent
                {
                    Time = now,
                    Type = EventType.Announcement,
                    ActorId = npc.Id,
                    TargetId = old?.Id,
                    Severity = 1,
                    Public = true,
                    Text = $"{IssuerName}: карта {old?.Id} аннулирована, {npc.DisplayName} получает новую ({fresh.Id})"
                });
            }
        }

        // ------------------------------------------------------------------ alert de-escalation

        private void UpdateAlertLevel(SimWorld w)
        {
            double now = w.Now;
            bool anyBreach = false;
            bool anyRestless = false;
            foreach (var a in w.Anomalies)
            {
                if (!a.Contained) anyBreach = true;
                // De-escalation also relies on observable calm, not on the entity's inner state.
                if (a.Behaviour is TallymanBehaviour t && t.State >= TallymanBehaviour.TallyState.Signaling) anyRestless = true;
            }

            if (w.Alert.Level == AlertLevel.Red && !anyBreach)
            {
                w.Alert.Lower(w, AlertLevel.Yellow, "Объект возвращён в камеру содержания");
                CalmSince = now;
                return;
            }

            if (anyBreach || anyRestless)
            {
                CalmSince = -1;
                return;
            }
            if (CalmSince < 0) CalmSince = now;
            if (w.Alert.Level > AlertLevel.Green && now - CalmSince >= 60)
                w.Alert.Lower(w, AlertLevel.Green, "Показатели в норме");
        }

        /// <summary>The player files a report at a terminal. Acts on what the player could actually know.</summary>
        public string HandlePlayerReport(SimWorld w)
        {
            double now = w.Now;
            var parts = new List<string>();
            foreach (var anomaly in w.Anomalies)
            {
                if (!(anomaly.Behaviour is TallymanBehaviour tally)) continue;
                bool playerSawRecently = tally.LastObservedByPlayer >= 0 && now - tally.LastObservedByPlayer < 90;
                if (!anomaly.Contained && anomaly.BreachDetected)
                {
                    parts.Add($"{anomaly.Id} вне камеры: тревога уже объявлена");
                    continue;
                }
                if (!playerSawRecently)
                {
                    parts.Add($"по {anomaly.Id} нет свежих наблюдений — осмотрите объект");
                    continue;
                }
                if (tally.LastPlayerObservedThreat >= 45f)
                {
                    w.Alert.Raise(w, AlertLevel.Yellow, $"Рапорт охраны: беспокойство {anomaly.Id}", anomaly.ContainmentRoomId);
                    if (!w.Tasks.HasActive(TaskKind.ObservationSession, anomaly.Id))
                    {
                        var scientist = PickScientist(w);
                        var obs = FirstRoom(w, RoomType.Observation);
                        if (scientist != null && obs != null)
                        {
                            w.Tasks.Issue(w, new DutyTask
                            {
                                Kind = TaskKind.ObservationSession,
                                Title = $"Сеанс счёта {anomaly.Id} по рапорту охраны",
                                Description = "Охрана сообщает о беспокойстве объекта.",
                                AssigneeId = scientist.Id,
                                IssuedBy = IssuerName,
                                TargetRoomId = obs.Id,
                                TargetId = anomaly.Id,
                                Deadline = now + 60
                            });
                            scientist.NextThink = 0f;
                            parts.Add($"{anomaly.Id} беспокоен — к окну направлен {scientist.DisplayName}");
                        }
                        else parts.Add($"{anomaly.Id} беспокоен — свободных учёных нет");
                    }
                    else parts.Add($"{anomaly.Id} беспокоен — сеанс счёта уже назначен");
                    foreach (var t in new List<DutyTask>(w.Tasks.ActiveFor(PlayerState.PlayerId)))
                        if (t.Kind == TaskKind.Investigate && t.TargetId == anomaly.Id) w.Tasks.Complete(w, t, "рапорт принят");
                }
                else
                {
                    parts.Add($"{anomaly.Id} в норме");
                }
            }
            return parts.Count == 0 ? "происшествий нет" : string.Join("; ", parts);
        }

        public JObj Save()
        {
            var o = new JObj();
            o["patrol"] = LastPatrolIssued;
            o["cams"] = LastCameraCheckIssued;
            o["calm"] = CalmSince;
            o["investigate"] = LastInvestigateIssued;
            o["emergency"] = LastEmergencySession;
            return o;
        }

        public void Load(JObj o)
        {
            if (o == null) return;
            LastPatrolIssued = o.Num("patrol", -10000);
            LastCameraCheckIssued = o.Num("cams", -10000);
            CalmSince = o.Num("calm", -1);
            LastInvestigateIssued = o.Num("investigate", -10000);
            LastEmergencySession = o.Num("emergency", -10000);
        }
    }
}
