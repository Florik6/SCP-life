using System.Collections.Generic;

namespace ScpLife.Core
{
    /// <summary>
    /// Stage 1 content: one sector of level 3 (security post, staff quarters, canteen, laboratory,
    /// observation room, airlock and containment chamber, medbay, class-D block with four cells,
    /// engineering), eleven NPCs with daily schedules, nine CCTV cameras and SCP-L-001.
    /// All geometry is in metres; adjacent rooms are separated by a 0.3 m wall gap.
    /// </summary>
    public static class Stage1Content
    {
        /// <summary>Day 1, 07:30 — the facility is already mid-routine when the shift starts.</summary>
        public const double StartTime = 7 * 60 + 30;
        public const string PlayerCardId = "card.player";

        public static readonly string[] PatrolRouteA =
        {
            "pp.post", "pp.corr_w", "pp.dorm", "pp.canteen", "pp.lab", "pp.obs", "pp.corr_e", "pp.eng", "pp.dblock", "pp.med"
        };

        public static readonly string[] PatrolRouteB =
        {
            "pp.med", "pp.dblock", "pp.eng", "pp.corr_e", "pp.obs", "pp.lab", "pp.canteen", "pp.dorm", "pp.corr_w", "pp.post"
        };

        public static readonly string[] MaintenanceRoute =
        {
            "panel.eng1", "panel.corr", "panel.lab", "panel.obs", "panel.canteen", "panel.dblock", "panel.eng2"
        };

        public static SimWorld CreateWorld(ulong seed, string catalogJson = null)
        {
            var facility = BuildFacility();
            var world = new SimWorld(facility, new GameClock(StartTime), seed);
            LoadCatalog(world, catalogJson);
            AddCameras(world);
            AddPeople(world);
            AddAnomaly(world);
            SetupPlayer(world);
            return world;
        }

        // ------------------------------------------------------------------ catalog

        public static AnomalyDefinition TallymanDefinition()
        {
            var def = new AnomalyDefinition
            {
                Id = TallymanBehaviour.AnomalyId,
                Name = "Счетовод",
                ObjectClass = "Euclid",
                Kind = AnomalyKind.Sapient,
                Description = "Высокий (2,6 м) гуманоид с гладкой серой кожей, покрытой мелкими насечками. " +
                              "Постоянно ведёт счёт: людей, шагов, циклов двери — и выцарапывает отметки на стенах.",
                Containment = "Камера 12×10 м с окном наблюдения. Сеанс счёта обученным сотрудником не реже раза в 6 часов. " +
                              "Освещение не отключать. Вход только вдвоём (две карты L3 «Содержание») и только при спокойном объекте.",
                BehaviourText = "Запоминает распорядок персонала и время открытия двери. Нерегулярность вызывает возбуждение.",
                Intelligence = 0.8f,
                Hostility = 0.45f,
                Mobility = 0.35f,
                Perception = 0.9f,
                Danger = 0.6f,
                HasMemory = true
            };
            def.Triggers.Add("Пропуск сеанса счёта");
            def.Triggers.Add("Отключение света в камере");
            def.Triggers.Add("Открытие двери в заученное время при возбуждении объекта");
            def.Triggers.Add("Появление незнакомых или нерегулярных посетителей");
            def.Reactions.Add("Протокол счёта замедляет и успокаивает объект");
            def.Requirements.Add("Сеанс счёта каждые 6 ч");
            def.Requirements.Add("Постоянное освещение");
            def.Requirements.Add("Двойная авторизация гермодвери");
            def.Tags.Add("прототип этапа 1");
            return def;
        }

        public static void LoadCatalog(SimWorld world, string catalogJson)
        {
            var catalog = new AnomalyCatalog();
            if (!string.IsNullOrEmpty(catalogJson))
            {
                try
                {
                    catalog.LoadJson(catalogJson);
                }
                catch (System.FormatException ex)
                {
                    catalog.Warnings.Add("Каталог не загружен: " + ex.Message);
                }
            }
            if (catalog.Get(TallymanBehaviour.AnomalyId) == null) catalog.Add(TallymanDefinition());
            world.Catalog = catalog;
        }

        // ------------------------------------------------------------------ facility layout

        private static Room R(Facility f, string id, string name, RoomType type, float minX, float maxX, float minZ, float maxZ, float height = 3.2f)
        {
            return f.AddRoom(new Room
            {
                Id = id,
                Name = name,
                Type = type,
                MinX = minX,
                MaxX = maxX,
                MinZ = minZ,
                MaxZ = maxZ,
                Height = height
            });
        }

        private static PointOfInterest P(Room room, string id, PoiType type, float x, float z, float yaw, string label, string owner = null)
        {
            var poi = new PointOfInterest
            {
                Id = id,
                Type = type,
                Position = new Vec3(x, room.FloorY, z),
                FacingYaw = yaw,
                RoomId = room.Id,
                OwnerId = owner,
                Label = label
            };
            room.Pois.Add(poi);
            return poi;
        }

        private static void Hubs(Room room, params float[] xz)
        {
            for (int i = 0; i + 1 < xz.Length; i += 2) room.HubPoints.Add(new Vec3(xz[i], room.FloorY, xz[i + 1]));
        }

        private static void Links(Room room, params int[] pairs)
        {
            for (int i = 0; i + 1 < pairs.Length; i += 2) room.HubEdges.Add(new[] { pairs[i], pairs[i + 1] });
        }

        private static Door D(Facility f, string id, string name, string roomA, string roomB, float x, float z, bool crossesAlongX,
            DoorKind kind, AccessRequirement req, float width = 1.6f)
        {
            var door = new Door
            {
                Id = id,
                Name = name,
                RoomA = roomA,
                RoomB = roomB,
                Position = new Vec3(x, 0f, z),
                CrossesAlongX = crossesAlongX,
                Kind = kind,
                Requirement = req,
                Width = width
            };
            switch (kind)
            {
                case DoorKind.Heavy:
                    door.OpenSeconds = 3.0f;
                    door.AutoCloseSeconds = 6f;
                    door.Width = 2.2f;
                    door.Height = 3.0f;
                    break;
                case DoorKind.Security:
                    door.OpenSeconds = 1.4f;
                    break;
                case DoorKind.Cell:
                    door.OpenSeconds = 1.2f;
                    door.Width = 1.2f;
                    break;
            }
            return f.AddDoor(door);
        }

        public static Facility BuildFacility()
        {
            var f = new Facility();

            // Main corridor
            var corridor = R(f, "corridor", "Коридор сектора Б-3", RoomType.Corridor, -26f, 26f, -2f, 2f);
            Hubs(corridor, -24f, 0f, -16f, 0f, -8f, 0f, 0f, 0f, 8f, 0f, 16f, 0f, 24f, 0f);
            P(corridor, "pp.corr_w", PoiType.PatrolPoint, -12f, -0.9f, 90f, "Коридор, запад");
            P(corridor, "pp.corr_e", PoiType.PatrolPoint, 21f, 0.9f, 270f, "Коридор, восток");
            P(corridor, "panel.corr", PoiType.Panel, 4f, 1.4f, 0f, "Электрощиток коридора");

            // --- north side ---
            var dorm = R(f, "dorm", "Жилой блок персонала", RoomType.Dormitory, -26f, -15.3f, 2.3f, 12.3f);
            Hubs(dorm, -20.6f, 3.8f, -20.6f, 7.3f, -20.6f, 10.8f);
            float[] bedZ = { 4.3f, 6.6f, 8.9f, 11.2f };
            for (int i = 0; i < 4; i++)
            {
                P(dorm, $"dorm.bed{i + 1}", PoiType.Bed, -24.6f, bedZ[i], 270f, $"Койка {i + 1}");
                P(dorm, $"dorm.bed{i + 5}", PoiType.Bed, -16.7f, bedZ[i], 90f, $"Койка {i + 5}");
            }
            P(dorm, "dorm.seat1", PoiType.Seat, -21.8f, 11.6f, 180f, "Кресло");
            P(dorm, "dorm.seat2", PoiType.Seat, -19.4f, 11.6f, 180f, "Кресло");
            P(dorm, "pp.dorm", PoiType.PatrolPoint, -20.6f, 5.5f, 0f, "Жилой блок");

            var canteen = R(f, "canteen", "Столовая", RoomType.Canteen, -15f, -3.3f, 2.3f, 12.3f);
            Hubs(canteen, -9.2f, 3.6f, -9.2f, 7.0f, -9.2f, 10.2f);
            P(canteen, "canteen.counter", PoiType.FoodCounter, -9.2f, 10.7f, 0f, "Раздача");
            float[] tableX = { -12.6f, -5.8f };
            float[] tableZ = { 5.5f, 8.5f };
            int seat = 0;
            foreach (float tx in tableX)
                foreach (float tz in tableZ)
                {
                    P(canteen, $"canteen.seat{++seat}", PoiType.Seat, tx - 0.6f, tz - 0.85f, 0f, "Место");
                    P(canteen, $"canteen.seat{++seat}", PoiType.Seat, tx + 0.6f, tz - 0.85f, 0f, "Место");
                    P(canteen, $"canteen.seat{++seat}", PoiType.Seat, tx - 0.6f, tz + 0.85f, 180f, "Место");
                    P(canteen, $"canteen.seat{++seat}", PoiType.Seat, tx + 0.6f, tz + 0.85f, 180f, "Место");
                }
            P(canteen, "pp.canteen", PoiType.PatrolPoint, -8.4f, 8.6f, 0f, "Столовая");
            P(canteen, "panel.canteen", PoiType.Panel, -14.4f, 3.1f, 270f, "Щиток столовой");

            var lab = R(f, "lab", "Лаборатория исследований", RoomType.Laboratory, -3f, 9.7f, 2.3f, 12.3f);
            Hubs(lab, 0.6f, 4.4f, 6.1f, 4.4f, 0.6f, 10.6f, 6.1f, 10.6f);
            Links(lab, 0, 1, 0, 2, 1, 3, 2, 3);
            float[] deskZ = { 4.8f, 7.3f, 9.8f };
            for (int i = 0; i < 3; i++)
            {
                P(lab, $"lab.deskW{i + 1}", PoiType.Desk, -1.6f, deskZ[i], 270f, "Рабочее место");
                P(lab, $"lab.deskE{i + 1}", PoiType.Desk, 8.3f, deskZ[i], 90f, "Рабочее место");
            }
            P(lab, "lab.bench1", PoiType.Workbench, 3.35f, 6.4f, 0f, "Лабораторный стол");
            P(lab, "lab.bench2", PoiType.Workbench, 3.35f, 9.2f, 180f, "Лабораторный стол");
            P(lab, "lab.console", PoiType.Console, 3.35f, 11.3f, 0f, "Терминал лаборатории");
            P(lab, "pp.lab", PoiType.PatrolPoint, 3.3f, 3.4f, 0f, "Лаборатория");
            P(lab, "panel.lab", PoiType.Panel, 9.1f, 3.1f, 90f, "Щиток лаборатории");

            var obs = R(f, "obs", "Наблюдательный пункт SCP-L-001", RoomType.Observation, 10f, 16.7f, 2.3f, 8.3f);
            Hubs(obs, 13.35f, 3.8f, 13.35f, 5.8f);
            P(obs, "obs.console1", PoiType.Console, 12.4f, 7.0f, 0f, "Пульт наблюдения");
            P(obs, "obs.console2", PoiType.Console, 14.3f, 7.0f, 0f, "Пульт наблюдения");
            P(obs, "pp.obs", PoiType.PatrolPoint, 11.2f, 3.6f, 0f, "Наблюдательный пункт");
            P(obs, "panel.obs", PoiType.Panel, 16.1f, 3.1f, 90f, "Щиток наблюдательного пункта");

            var airlock = R(f, "airlock", "Шлюз камеры содержания", RoomType.Airlock, 17f, 22f, 2.3f, 8.3f);
            Hubs(airlock, 19.5f, 4.2f, 19.5f, 6.6f);
            P(airlock, "airlock.panel", PoiType.Panel, 21.3f, 7.2f, 90f, "Контроллер замка гермодвери");

            var chamber = R(f, "chamber", "Камера содержания SCP-L-001", RoomType.Containment, 10f, 22f, 8.6f, 18.6f, 4.5f);
            Hubs(chamber, 16f, 11f, 16f, 15.8f, 12.6f, 13.5f, 19.4f, 13.5f);
            // The first Stand POI is the centre: SCP-L-001 returns there after a breach.
            P(chamber, "l001.center", PoiType.Stand, 16f, 13.6f, 0f, "Центр камеры");
            P(chamber, "l001.cornerNW", PoiType.Stand, 11.3f, 17.3f, 315f, "Северо-западная стена");
            P(chamber, "l001.cornerNE", PoiType.Stand, 20.7f, 17.3f, 45f, "Северо-восточная стена");
            P(chamber, "l001.wallW", PoiType.Stand, 11.3f, 12.5f, 270f, "Западная стена");
            P(chamber, "l001.wallE", PoiType.Stand, 20.7f, 13.5f, 90f, "Восточная стена");
            P(chamber, "l001.window", PoiType.Window, 13.35f, 9.6f, 180f, "У окна наблюдения");
            P(chamber, "chamber.sensor1", PoiType.Terminal, 18.4f, 10.6f, 0f, "Датчики камеры");
            P(chamber, "chamber.sensor2", PoiType.Terminal, 20.5f, 10.6f, 0f, "Датчики камеры");
            chamber.VisibleRooms.Add(obs.Id);
            obs.VisibleRooms.Add(chamber.Id);

            // --- south side ---
            var post = R(f, "post", "КПП охраны", RoomType.SecurityPost, -26f, -17.3f, -10.3f, -2.3f);
            Hubs(post, -21.6f, -3.9f, -21.6f, -7.2f);
            P(post, "post.console1", PoiType.GuardPost, -23.0f, -8.8f, 180f, "Пульт видеонаблюдения");
            P(post, "post.console2", PoiType.GuardPost, -20.5f, -8.8f, 180f, "Пульт видеонаблюдения");
            P(post, "pp.post", PoiType.PatrolPoint, -19.2f, -4.0f, 0f, "КПП");

            var med = R(f, "med", "Медпункт", RoomType.MedicalBay, -17f, -9.3f, -10.3f, -2.3f);
            Hubs(med, -13.15f, -3.9f, -13.15f, -6.8f);
            P(med, "med.bed1", PoiType.MedBed, -15.6f, -9.2f, 180f, "Койка медпункта");
            P(med, "med.bed2", PoiType.MedBed, -12.4f, -9.2f, 180f, "Койка медпункта");
            P(med, "med.desk", PoiType.Desk, -10.7f, -5.3f, 90f, "Стол фельдшера");
            P(med, "pp.med", PoiType.PatrolPoint, -15.5f, -3.8f, 0f, "Медпункт");

            var dblock = R(f, "dblock", "Блок класса D — общий зал", RoomType.DClassCommon, -9f, 7.7f, -10.3f, -2.3f);
            Hubs(dblock, -7.6f, -3.5f, -0.6f, -3.5f, 6.3f, -3.5f, -0.6f, -6.3f, -7.6f, -9.0f, -0.6f, -9.0f, 6.3f, -9.0f);
            Links(dblock, 0, 1, 1, 2, 4, 5, 5, 6, 1, 3, 3, 5, 0, 4, 2, 6);
            float[] dTableX = { -4.5f, 3.2f };
            int dSeat = 0;
            foreach (float tx in dTableX)
                for (int k = -1; k <= 1; k++)
                {
                    P(dblock, $"dblock.seat{++dSeat}", PoiType.Seat, tx + k * 1.2f, -5.45f, 180f, "Скамья");
                    P(dblock, $"dblock.seat{++dSeat}", PoiType.Seat, tx + k * 1.2f, -7.15f, 0f, "Скамья");
                }
            P(dblock, "dblock.work1", PoiType.Workbench, -8.3f, -4.5f, 270f, "Сортировочный стол");
            P(dblock, "dblock.work2", PoiType.Workbench, -8.3f, -7.8f, 270f, "Сортировочный стол");
            P(dblock, "dblock.work3", PoiType.Workbench, 7.0f, -4.5f, 90f, "Стиральная машина");
            P(dblock, "dblock.work4", PoiType.Workbench, 7.0f, -7.8f, 90f, "Стиральная машина");
            P(dblock, "pp.dblock", PoiType.PatrolPoint, -2.6f, -3.4f, 0f, "Блок D");
            P(dblock, "panel.dblock", PoiType.Panel, 2.0f, -2.9f, 0f, "Щиток блока D");

            string[] dClassIds = { "d.9341", "d.7720", "d.4108", "d.5512" };
            for (int i = 0; i < 4; i++)
            {
                float cx = -7.15f + 4f * i;
                var cell = R(f, $"cell{i + 1}", $"Камера D-{i + 1}", RoomType.DClassCell, cx - 1.85f, cx + 1.85f, -16.6f, -10.6f, 2.8f);
                Hubs(cell, cx + 0.3f, -11.8f, cx + 0.3f, -14.6f);
                P(cell, $"cell{i + 1}.bunk", PoiType.CellBunk, cx - 1.3f, -15.4f, 180f, "Нары", dClassIds[i]);
            }

            var eng = R(f, "eng", "Инженерный блок", RoomType.Engineering, 8f, 18.7f, -10.3f, -2.3f);
            Hubs(eng, 10.0f, -3.8f, 16.7f, -3.8f, 10.0f, -9.4f, 16.7f, -9.4f);
            Links(eng, 0, 1, 0, 2, 1, 3, 2, 3);
            P(eng, "panel.eng1", PoiType.Panel, 8.7f, -4.8f, 270f, "Главный распределительный щит");
            P(eng, "panel.eng2", PoiType.Panel, 8.7f, -7.8f, 270f, "Щит резервного питания");
            P(eng, "eng.bench", PoiType.Workbench, 18.0f, -5.5f, 90f, "Верстак");
            P(eng, "pp.eng", PoiType.PatrolPoint, 11.0f, -3.5f, 0f, "Инженерный блок");

            // --- doors ---
            D(f, "d.post", "Дверь КПП", "post", "corridor", -21.5f, -2.15f, false, DoorKind.Security,
                new AccessRequirement(AccessLevel.L2, Permission.Security));
            D(f, "d.med", "Дверь медпункта", "med", "corridor", -13.2f, -2.15f, false, DoorKind.Standard,
                new AccessRequirement(AccessLevel.L1));
            D(f, "d.dblock", "Шлюз блока D", "dblock", "corridor", -0.6f, -2.15f, false, DoorKind.Security,
                new AccessRequirement(AccessLevel.L2, Permission.Security | Permission.DClassBlock | Permission.Engineering));
            for (int i = 0; i < 4; i++)
            {
                float cx = -7.15f + 4f * i;
                var cellDoor = D(f, $"d.cell{i + 1}", $"Дверь камеры D-{i + 1}", $"cell{i + 1}", "dblock", cx, -10.45f, false, DoorKind.Cell,
                    new AccessRequirement(AccessLevel.L0, Permission.CellResident | Permission.DClassBlock | Permission.Security));
                cellDoor.CurfewStart = GameClock.Hm(22, 0);
                cellDoor.CurfewEnd = GameClock.Hm(6, 30);
            }
            D(f, "d.eng", "Дверь инженерного блока", "eng", "corridor", 13.3f, -2.15f, false, DoorKind.Standard,
                new AccessRequirement(AccessLevel.L2, Permission.Engineering | Permission.Security));
            D(f, "d.dorm", "Дверь жилого блока", "dorm", "corridor", -20.5f, 2.15f, false, DoorKind.Standard,
                new AccessRequirement(AccessLevel.L1));
            D(f, "d.canteen", "Проём столовой", "canteen", "corridor", -9.2f, 2.15f, false, DoorKind.Archway,
                AccessRequirement.Open, 2.4f);
            D(f, "d.lab", "Дверь лаборатории", "lab", "corridor", 3.3f, 2.15f, false, DoorKind.Standard,
                new AccessRequirement(AccessLevel.L2, Permission.Research | Permission.Security | Permission.Engineering));
            D(f, "d.obs", "Дверь наблюдательного пункта", "obs", "corridor", 13.3f, 2.15f, false, DoorKind.Standard,
                new AccessRequirement(AccessLevel.L2, Permission.Research | Permission.Security | Permission.Engineering));
            D(f, "d.airlock", "Шлюз зоны содержания", "airlock", "corridor", 19.5f, 2.15f, false, DoorKind.Security,
                new AccessRequirement(AccessLevel.L3, Permission.Containment | Permission.Research));
            var heavy = D(f, "d.chamber", "Гермодверь камеры SCP-L-001", "chamber", "airlock", 19.5f, 8.45f, false, DoorKind.Heavy,
                new AccessRequirement(AccessLevel.L3, Permission.Containment, true));
            heavy.HasExitRequirement = true;
            heavy.ExitFromRoom = "chamber";
            heavy.ExitRequirement = new AccessRequirement(AccessLevel.L3, Permission.Containment);

            f.BuildNavigation();
            return f;
        }

        // ------------------------------------------------------------------ cameras

        private static void Cam(SimWorld w, string id, string name, string room, float x, float y, float z, float yaw,
            float range, float fov = 75f, float sweep = 25f)
        {
            w.Surveillance.Cameras.Add(new SecurityCamera
            {
                Id = id,
                Name = name,
                RoomId = room,
                Position = new Vec3(x, y, z),
                BaseYaw = yaw,
                CurrentYaw = yaw,
                Range = range,
                Fov = fov,
                SweepAngle = sweep,
                SweepPeriod = 12f + w.Surveillance.Cameras.Count * 1.7f,
                Phase = w.Surveillance.Cameras.Count * 0.13f
            });
        }

        private static void AddCameras(SimWorld w)
        {
            Cam(w, "cam01", "К-01 Коридор, запад", "corridor", -25.5f, 2.9f, 1.6f, 90f, 28f, 60f, 12f);
            Cam(w, "cam02", "К-02 Коридор, восток", "corridor", 25.5f, 2.9f, -1.6f, 270f, 28f, 60f, 12f);
            Cam(w, "cam03", "К-03 КПП", "post", -17.8f, 2.9f, -2.8f, 225f, 12f);
            Cam(w, "cam04", "К-04 Блок D", "dblock", 7.2f, 2.9f, -2.8f, 240f, 18f, 85f, 25f);
            Cam(w, "cam05", "К-05 Лаборатория", "lab", 9.2f, 2.9f, 11.8f, 225f, 16f);
            Cam(w, "cam06", "К-06 Камера SCP-L-001", "chamber", 10.5f, 4.2f, 18.1f, 135f, 18f, 85f, 20f);
            Cam(w, "cam07", "К-07 Шлюз", "airlock", 21.5f, 2.9f, 2.8f, 315f, 8f, 80f, 20f);
            Cam(w, "cam08", "К-08 Столовая", "canteen", -3.8f, 2.9f, 11.8f, 225f, 16f);
            Cam(w, "cam09", "К-09 Инженерный блок", "eng", 18.2f, 2.9f, -2.8f, 225f, 14f);
        }

        // ------------------------------------------------------------------ people

        private static Npc Person(SimWorld w, string id, string first, string last, bool female, NpcRole role, string title,
            AccessLevel level, Permission perms, string bed, string workRoom,
            float bravery, float sociability, float diligence, float temper, float curiosity, bool protocol)
        {
            var npc = new Npc
            {
                Id = id,
                FirstName = first,
                LastName = last,
                Female = female,
                Role = role,
                Title = title,
                Callsign = role == NpcRole.DClass ? last : null,
                BedPoiId = bed,
                WorkRoomId = workRoom,
                KnowsCountingProtocol = protocol,
                Traits = new Personality
                {
                    Bravery = bravery,
                    Sociability = sociability,
                    Diligence = diligence,
                    Temper = temper,
                    Curiosity = curiosity
                }
            };
            var card = new Keycard
            {
                Id = "card." + id,
                OwnerId = id,
                OwnerName = role == NpcRole.DClass ? last : $"{title} {last}",
                Level = level,
                Permissions = perms,
                HolderId = id
            };
            npc.KeycardId = card.Id;
            var bedPoi = w.Facility.GetPoi(bed);
            if (bedPoi != null && bedPoi.OwnerId == null) bedPoi.OwnerId = id;
            w.AddKeycard(card);
            w.AddNpc(npc);
            return npc;
        }

        private static int H(int h, int m = 0) => GameClock.Hm(h, m);

        private static void AddPeople(SimWorld w)
        {
            const Permission guardPerms = Permission.Security | Permission.DClassBlock | Permission.Surveillance;

            var petrenko = Person(w, "g.petrenko", "Олег", "Петренко", false, NpcRole.Guard, "Охранник",
                AccessLevel.L2, guardPerms, "dorm.bed1", "post", 0.7f, 0.6f, 0.6f, 0.4f, 0.4f, true);
            petrenko.Schedule
                .Add(H(22, 30), H(6), ActivityType.Sleep, "@bed", PoiType.Bed, "Сон")
                .Add(H(6), H(6, 40), ActivityType.Leisure, "dorm", PoiType.Seat, "Подъём")
                .Add(H(6, 40), H(7, 15), ActivityType.Eat, "canteen", PoiType.Seat, "Завтрак")
                .Add(H(7, 15), H(12), ActivityType.Patrol, "corridor", PoiType.PatrolPoint, "Патрулирование, маршрут А", PatrolRouteA)
                .Add(H(12), H(12, 40), ActivityType.Eat, "canteen", PoiType.Seat, "Обед")
                .Add(H(12, 40), H(17), ActivityType.GuardPost, "post", PoiType.GuardPost, "Пост видеонаблюдения")
                .Add(H(17), H(19), ActivityType.Patrol, "corridor", PoiType.PatrolPoint, "Патрулирование, маршрут Б", PatrolRouteB)
                .Add(H(19), H(19, 40), ActivityType.Eat, "canteen", PoiType.Seat, "Ужин")
                .Add(H(19, 40), H(22, 30), ActivityType.Leisure, "canteen", PoiType.Seat, "Отдых");

            var melnik = Person(w, "g.melnik", "Ирина", "Мельник", true, NpcRole.Guard, "Охранник",
                AccessLevel.L2, guardPerms, "dorm.bed2", "post", 0.55f, 0.4f, 0.8f, 0.3f, 0.3f, true);
            melnik.Schedule
                .Add(H(7, 30), H(14, 30), ActivityType.Sleep, "@bed", PoiType.Bed, "Сон после ночной смены")
                .Add(H(14, 30), H(15, 10), ActivityType.Leisure, "canteen", PoiType.Seat, "Подъём")
                .Add(H(15, 10), H(15, 50), ActivityType.Eat, "canteen", PoiType.Seat, "Обед")
                .Add(H(15, 50), H(20), ActivityType.Patrol, "corridor", PoiType.PatrolPoint, "Патрулирование, маршрут Б", PatrolRouteB)
                .Add(H(20), H(20, 40), ActivityType.Eat, "canteen", PoiType.Seat, "Ужин")
                .Add(H(20, 40), H(4), ActivityType.GuardPost, "post", PoiType.GuardPost, "Ночной пост")
                .Add(H(4), H(7), ActivityType.Patrol, "corridor", PoiType.PatrolPoint, "Ночной обход, маршрут А", PatrolRouteA)
                .Add(H(7), H(7, 30), ActivityType.Eat, "canteen", PoiType.Seat, "Завтрак после смены");

            var orlova = Person(w, "s.orlova", "Вера", "Орлова", true, NpcRole.Scientist, "Д-р",
                AccessLevel.L3, Permission.Research | Permission.Containment, "dorm.bed3", "lab", 0.75f, 0.5f, 0.9f, 0.2f, 0.9f, true);
            orlova.Schedule
                .Add(H(23), H(6, 45), ActivityType.Sleep, "@bed", PoiType.Bed, "Сон")
                .Add(H(6, 45), H(7, 30), ActivityType.Eat, "canteen", PoiType.Seat, "Завтрак")
                .Add(H(7, 30), H(8), ActivityType.Work, "lab", PoiType.Desk, "Подготовка к сеансу")
                .Add(H(8), H(8, 30), ActivityType.ObservationSession, "obs", PoiType.Console, "Сеанс счёта (утро)")
                .Add(H(8, 30), H(12), ActivityType.Work, "lab", PoiType.Desk, "Анализ записей сеансов")
                .Add(H(12), H(12, 45), ActivityType.Eat, "canteen", PoiType.Seat, "Обед")
                .Add(H(12, 45), H(14), ActivityType.Work, "lab", PoiType.Workbench, "Эксперимент с отметками")
                .Add(H(14), H(14, 30), ActivityType.ObservationSession, "obs", PoiType.Console, "Сеанс счёта (день)")
                .Add(H(14, 30), H(16), ActivityType.Work, "lab", PoiType.Desk, "Отчёт")
                .Add(H(16), H(16, 20), ActivityType.ChamberInspection, "chamber", PoiType.Terminal, "Плановый осмотр камеры")
                .Add(H(16, 20), H(19), ActivityType.Work, "lab", PoiType.Desk, "Обработка данных осмотра")
                .Add(H(19), H(19, 45), ActivityType.Eat, "canteen", PoiType.Seat, "Ужин")
                .Add(H(19, 45), H(20), ActivityType.Leisure, "canteen", PoiType.Seat, "Перерыв")
                .Add(H(20), H(20, 30), ActivityType.ObservationSession, "obs", PoiType.Console, "Сеанс счёта (вечер)")
                .Add(H(20, 30), H(23), ActivityType.Leisure, "canteen", PoiType.Seat, "Отдых");

            var kim = Person(w, "s.kim", "Артём", "Ким", false, NpcRole.Scientist, "Д-р",
                AccessLevel.L3, Permission.Research | Permission.Containment, "dorm.bed4", "lab", 0.45f, 0.7f, 0.6f, 0.35f, 0.7f, true);
            kim.Schedule
                .Add(H(23, 30), H(7), ActivityType.Sleep, "@bed", PoiType.Bed, "Сон")
                .Add(H(7), H(7, 45), ActivityType.Eat, "canteen", PoiType.Seat, "Завтрак")
                .Add(H(7, 45), H(12, 30), ActivityType.Work, "lab", PoiType.Desk, "Исследования")
                .Add(H(12, 30), H(13, 15), ActivityType.Eat, "canteen", PoiType.Seat, "Обед")
                .Add(H(13, 15), H(16), ActivityType.Work, "lab", PoiType.Workbench, "Калибровка датчиков")
                .Add(H(16), H(16, 20), ActivityType.ChamberInspection, "chamber", PoiType.Terminal, "Плановый осмотр камеры")
                .Add(H(16, 20), H(19, 30), ActivityType.Work, "lab", PoiType.Desk, "Исследования")
                .Add(H(19, 30), H(20, 15), ActivityType.Eat, "canteen", PoiType.Seat, "Ужин")
                .Add(H(20, 15), H(23, 30), ActivityType.Leisure, "canteen", PoiType.Seat, "Отдых");

            var lebedev = Person(w, "s.lebedev", "Павел", "Лебедев", false, NpcRole.Scientist, "Мл. н. с.",
                AccessLevel.L2, Permission.Research, "dorm.bed5", "lab", 0.35f, 0.8f, 0.5f, 0.5f, 0.6f, true);
            lebedev.Schedule
                .Add(H(3), H(10, 30), ActivityType.Sleep, "@bed", PoiType.Bed, "Сон")
                .Add(H(10, 30), H(11, 15), ActivityType.Eat, "canteen", PoiType.Seat, "Поздний завтрак")
                .Add(H(11, 15), H(12), ActivityType.Leisure, "canteen", PoiType.Seat, "Перерыв")
                .Add(H(12), H(18), ActivityType.Work, "lab", PoiType.Desk, "Расшифровка записей")
                .Add(H(18), H(18, 45), ActivityType.Eat, "canteen", PoiType.Seat, "Ужин")
                .Add(H(18, 45), H(20), ActivityType.Work, "lab", PoiType.Desk, "Расшифровка записей")
                .Add(H(20), H(20, 30), ActivityType.ObservationSession, "obs", PoiType.Console, "Сеанс счёта (ассистент)")
                .Add(H(20, 30), H(2), ActivityType.Work, "lab", PoiType.Desk, "Ночная смена")
                .Add(H(2), H(2, 30), ActivityType.ObservationSession, "obs", PoiType.Console, "Сеанс счёта (ночь)")
                .Add(H(2, 30), H(3), ActivityType.Eat, "canteen", PoiType.Seat, "Ночной перекус");

            var sokolov = Person(w, "t.sokolov", "Игорь", "Соколов", false, NpcRole.Technician, "Техник",
                AccessLevel.L2, Permission.Engineering, "dorm.bed6", "eng", 0.5f, 0.5f, 0.7f, 0.45f, 0.4f, false);
            sokolov.Schedule
                .Add(H(23), H(6, 30), ActivityType.Sleep, "@bed", PoiType.Bed, "Сон")
                .Add(H(6, 30), H(7, 10), ActivityType.Eat, "canteen", PoiType.Seat, "Завтрак")
                .Add(H(7, 10), H(7, 30), ActivityType.Leisure, "canteen", PoiType.Seat, "Перекур")
                .Add(H(7, 30), H(12), ActivityType.Maintenance, "eng", PoiType.Panel, "Обход щитков", MaintenanceRoute)
                .Add(H(12), H(12, 40), ActivityType.Eat, "canteen", PoiType.Seat, "Обед")
                .Add(H(12, 40), H(18), ActivityType.Work, "eng", PoiType.Workbench, "Ремонт оборудования")
                .Add(H(18), H(18, 40), ActivityType.Eat, "canteen", PoiType.Seat, "Ужин")
                .Add(H(18, 40), H(20), ActivityType.Maintenance, "eng", PoiType.Panel, "Вечерний обход щитков", MaintenanceRoute)
                .Add(H(20), H(23), ActivityType.Leisure, "canteen", PoiType.Seat, "Отдых");

            var zaitseva = Person(w, "m.zaitseva", "Анна", "Зайцева", true, NpcRole.Medic, "Фельдшер",
                AccessLevel.L2, Permission.Medical | Permission.DClassBlock, "dorm.bed7", "med", 0.4f, 0.65f, 0.75f, 0.25f, 0.5f, false);
            zaitseva.Schedule
                .Add(H(23), H(6, 45), ActivityType.Sleep, "@bed", PoiType.Bed, "Сон")
                .Add(H(6, 45), H(7, 30), ActivityType.Eat, "canteen", PoiType.Seat, "Завтрак")
                .Add(H(7, 30), H(12), ActivityType.Treat, "med", PoiType.Desk, "Приём в медпункте")
                .Add(H(12), H(12, 40), ActivityType.Eat, "canteen", PoiType.Seat, "Обед")
                .Add(H(12, 40), H(13, 30), ActivityType.Work, "dblock", PoiType.Stand, "Медосмотр класса D")
                .Add(H(13, 30), H(19), ActivityType.Treat, "med", PoiType.Desk, "Приём в медпункте")
                .Add(H(19), H(19, 40), ActivityType.Eat, "canteen", PoiType.Seat, "Ужин")
                .Add(H(19, 40), H(23), ActivityType.Leisure, "canteen", PoiType.Seat, "Отдых");

            string[] dIds = { "d.9341", "d.7720", "d.4108", "d.5512" };
            string[] dNames = { "Виктор", "Сергей", "Марина", "Рустам" };
            string[] dCalls = { "D-9341", "D-7720", "D-4108", "D-5512" };
            bool[] dFemale = { false, false, true, false };
            float[] dBravery = { 0.6f, 0.3f, 0.5f, 0.45f };
            float[] dSocial = { 0.4f, 0.6f, 0.7f, 0.5f };
            float[] dTemper = { 0.7f, 0.5f, 0.3f, 0.55f };
            var dClass = new List<Npc>();
            for (int i = 0; i < 4; i++)
            {
                var d = Person(w, dIds[i], dNames[i], dCalls[i], dFemale[i], NpcRole.DClass, "",
                    AccessLevel.L0, Permission.CellResident, $"cell{i + 1}.bunk", "dblock",
                    dBravery[i], dSocial[i], 0.4f, dTemper[i], 0.3f, false);
                d.ColorVariant = i;
                string labor = i % 2 == 0 ? "Трудовая смена: сортировка" : "Трудовая смена: прачечная";
                d.Schedule
                    .Add(H(22), H(6, 30), ActivityType.Sleep, "@bed", PoiType.CellBunk, "Отбой")
                    .Add(H(6, 30), H(7), ActivityType.Hygiene, "@bed", PoiType.Stand, "Подъём, гигиена")
                    .Add(H(7), H(7, 40), ActivityType.Eat, "dblock", PoiType.Seat, "Раздача пайков")
                    .Add(H(7, 40), H(12), ActivityType.Labor, "dblock", PoiType.Workbench, labor)
                    .Add(H(12), H(12, 40), ActivityType.Eat, "dblock", PoiType.Seat, "Обед")
                    .Add(H(12, 40), H(17), ActivityType.Labor, "dblock", PoiType.Workbench, labor)
                    .Add(H(17), H(18, 30), ActivityType.Leisure, "dblock", PoiType.Seat, "Свободное время")
                    .Add(H(18, 30), H(19, 10), ActivityType.Eat, "dblock", PoiType.Seat, "Ужин")
                    .Add(H(19, 10), H(21, 45), ActivityType.Leisure, "dblock", PoiType.Seat, "Свободное время")
                    .Add(H(21, 45), H(22), ActivityType.Confined, "@bed", PoiType.CellBunk, "Вечерняя поверка");
                dClass.Add(d);
            }

            // Pre-existing relationships.
            Relate(orlova, kim, 35f);
            Relate(orlova, lebedev, 15f);
            Relate(kim, lebedev, 20f);
            Relate(petrenko, melnik, 25f);
            Relate(sokolov, petrenko, 15f);
            Relate(zaitseva, orlova, 20f);
            Relate(dClass[0], dClass[1], -25f);
            Relate(dClass[2], dClass[3], 20f);
            Relate(dClass[1], dClass[2], 10f);
            petrenko.AdjustRelation(PlayerState.PlayerId, 10f);
            melnik.AdjustRelation(PlayerState.PlayerId, 5f);

            // Small personal variation in starting needs.
            foreach (var npc in w.Npcs)
            {
                npc.Needs.Hunger = w.Rng.Range(10f, 35f);
                npc.Needs.Energy = w.Rng.Range(65f, 90f);
                npc.Needs.Social = w.Rng.Range(40f, 75f);
                npc.Needs.Stress = w.Rng.Range(5f, 25f) + (npc.Role == NpcRole.DClass ? 15f : 0f);
                npc.NextConversationTime = StartTime + w.Rng.Range(5f, 40f);
                PlaceAtSchedule(w, npc);
            }
            melnik.Needs.Energy = 22f; // just finished the night shift
        }

        private static void Relate(Npc a, Npc b, float value)
        {
            a.AdjustRelation(b.Id, value);
            b.AdjustRelation(a.Id, value);
        }

        /// <summary>Puts an NPC where their schedule says they should be at the start time.</summary>
        private static void PlaceAtSchedule(SimWorld w, Npc npc)
        {
            var block = npc.Schedule.At(w.Clock.MinuteOfDay);
            Room room = null;
            PointOfInterest poi = null;
            if (block != null)
            {
                if (block.Activity == ActivityType.Patrol || block.Activity == ActivityType.Maintenance)
                {
                    poi = block.Route.Length > 0 ? w.Facility.GetPoi(block.Route[0]) : null;
                }
                else
                {
                    string roomId = block.RoomId == "@bed" ? w.Facility.GetPoi(npc.BedPoiId)?.RoomId : block.RoomId;
                    room = w.Facility.GetRoom(roomId);
                    if (room != null)
                    {
                        if (block.RoomId == "@bed" && (block.Poi == PoiType.Bed || block.Poi == PoiType.CellBunk))
                            poi = w.Facility.GetPoi(npc.BedPoiId);
                        if (poi == null)
                            foreach (var p in room.Pois)
                                if (p.Type == block.Poi && p.ReservedBy == null && (p.OwnerId == null || p.OwnerId == npc.Id))
                                {
                                    poi = p;
                                    break;
                                }
                    }
                }
            }
            if (poi != null)
            {
                npc.Agent.Position = poi.Position;
                npc.Agent.RoomId = poi.RoomId;
                npc.Agent.Yaw = poi.FacingYaw;
            }
            else
            {
                room = room ?? w.Facility.GetRoom(npc.WorkRoomId) ?? w.Facility.RoomList[0];
                npc.Agent.Position = room.HubPoints.Count > 0 ? room.HubPoints[0] : room.Center;
                npc.Agent.RoomId = room.Id;
            }
        }

        // ------------------------------------------------------------------ anomaly & player

        private static void AddAnomaly(SimWorld w)
        {
            var def = w.Catalog.Get(TallymanBehaviour.AnomalyId);
            var behaviour = (TallymanBehaviour)AnomalyBehaviourRegistry.Create(TallymanBehaviour.AnomalyId);
            var instance = new AnomalyInstance
            {
                Id = def.Id,
                Definition = def,
                ContainmentRoomId = "chamber",
                Behaviour = behaviour
            };
            w.AddAnomaly(instance);
            behaviour.Initialize(w);
            behaviour.LastSessionEnd = StartTime - 300; // last session ended at 02:30
            behaviour.SeedFamiliarity("s.orlova", 8, 14, 16, 20);
            behaviour.SeedFamiliarity("s.kim", 16);
            behaviour.SeedFamiliarity("s.lebedev", 2, 20);
            // It has already heard yesterday's 16:00 inspection: one more day and it will know the time.
            behaviour.SeedDoorCycle(16, 0, 1);
            behaviour.SeedDoorCycle(16, 20, 1);
        }

        public static void InitializeAnomalies(SimWorld w)
        {
            foreach (var a in w.Anomalies) a.Behaviour.Initialize(w);
        }

        private static void SetupPlayer(SimWorld w)
        {
            var card = new Keycard
            {
                Id = PlayerCardId,
                OwnerId = PlayerState.PlayerId,
                OwnerName = w.Player.Name,
                Level = AccessLevel.L2,
                Permissions = Permission.Security | Permission.DClassBlock | Permission.Surveillance,
                HolderId = PlayerState.PlayerId
            };
            w.AddKeycard(card);
            w.Player.CardIds.Add(card.Id);
            w.Player.Position = new Vec3(-21.6f, 0f, -5.5f);
            w.Player.Yaw = 180f;
            w.Player.RoomId = "post";
            w.Player.AddJournal($"[{GameClock.FormatStamp(StartTime)}] Заступил на смену. Пост: КПП сектора Б-3. Карта L2 «Охрана».");
        }
    }
}
