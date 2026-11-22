using System.Linq;
using NUnit.Framework;
using ScpLife.Core;

namespace ScpLife.Tests
{
    public class NpcRoutineTests
    {
        [Test]
        public void NpcsFollowTheirSchedules()
        {
            var w = TestUtil.NewWorld(7);
            TestUtil.ParkPlayer(w);

            TestUtil.RunUntil(w, 8, 15);
            var orlova = w.GetNpc("s.orlova");
            Assert.AreEqual(ActivityType.ObservationSession, orlova.Activity);
            Assert.AreEqual("obs", orlova.Agent.RoomId, "Orlova should be at the observation window for the morning session");

            TestUtil.RunUntil(w, 10, 0);
            foreach (var d in w.Npcs.Where(n => n.Role == NpcRole.DClass))
            {
                Assert.AreEqual(ActivityType.Labor, d.Activity, d.Id);
                Assert.AreEqual("dblock", d.Agent.RoomId, d.Id);
            }
            Assert.AreEqual(ActivityType.Treat, w.GetNpc("m.zaitseva").Activity);
            Assert.AreEqual("med", w.GetNpc("m.zaitseva").Agent.RoomId);
            Assert.AreEqual(ActivityType.Sleep, w.GetNpc("g.melnik").Activity);
            Assert.AreEqual("dorm", w.GetNpc("g.melnik").Agent.RoomId);

            TestUtil.RunUntil(w, 12, 20);
            var petrenko = w.GetNpc("g.petrenko");
            Assert.AreEqual(ActivityType.Eat, petrenko.Activity);
            Assert.AreEqual("canteen", petrenko.Agent.RoomId);
        }

        [Test]
        public void ClassDSleepInTheirOwnCellsBehindCurfew()
        {
            var w = TestUtil.NewWorld(8);
            TestUtil.ParkPlayer(w);
            TestUtil.RunUntil(w, 23, 30);
            for (int i = 0; i < 4; i++)
            {
                var d = w.Npcs.Where(n => n.Role == NpcRole.DClass).ElementAt(i);
                Assert.AreEqual(ActivityType.Sleep, d.Activity, d.Id);
                Assert.AreEqual($"cell{i + 1}", d.Agent.RoomId, d.Id);
                Assert.AreEqual(Posture.Lying, d.Posture, d.Id);
            }
        }

        [Test]
        public void FullDayRunsWithoutErrorsAndDoorsCycle()
        {
            var w = TestUtil.NewWorld(9);
            TestUtil.ParkPlayer(w);
            int cyclesBefore = w.Facility.DoorList.Sum(d => d.OpenCycles);
            TestUtil.Run(w, 24 * 60);
            int cyclesAfter = w.Facility.DoorList.Sum(d => d.OpenCycles);
            Assert.Greater(cyclesAfter - cyclesBefore, 40, "NPCs should open doors many times per day");
            Assert.Greater(w.AccessLog.Entries.Count, 40);
            foreach (var npc in w.Npcs)
            {
                Assert.IsNotNull(npc.Agent.RoomId, npc.Id);
                Assert.IsTrue(npc.Needs.Hunger < 95f, $"{npc.Id} is starving: routine is broken");
                Assert.IsTrue(npc.Needs.Energy > 3f, $"{npc.Id} is exhausted: routine is broken");
            }
        }

        [Test]
        public void ConversationsSpreadRumours()
        {
            var w = TestUtil.NewWorld(10);
            TestUtil.ParkPlayer(w);
            var e = w.Events.Post(new FacilityEvent
            {
                Time = w.Now,
                Type = EventType.SuspiciousActivity,
                RoomId = "lab",
                Severity = 2,
                Text = "На двери лаборатории кто-то выцарапал ряды цифр"
            });
            int knowersBefore = w.Npcs.Count(n => n.Memory.Knows(e.Id));
            Assert.Greater(knowersBefore, 0, "witnesses in the laboratory must remember the event");
            Assert.IsFalse(w.GetNpc("s.kim").Memory.Knows(e.Id), "Kim was not in the lab and cannot know yet");
            TestUtil.Run(w, 14 * 60);
            int knowersAfter = w.Npcs.Count(n => n.Memory.Knows(e.Id));
            Assert.Greater(knowersAfter, knowersBefore, "the rumour should spread through conversations");
            Assert.IsTrue(w.Npcs.Any(n => n.Memory.Entries.Any(m => m.EventId == e.Id && m.Source == MemorySource.HeardFrom)));
        }

        [Test]
        public void SimulationIsDeterministic()
        {
            var a = TestUtil.NewWorld(42);
            var b = TestUtil.NewWorld(42);
            TestUtil.ParkPlayer(a);
            TestUtil.ParkPlayer(b);
            TestUtil.Run(a, 180);
            TestUtil.Run(b, 180);
            Assert.AreEqual(WorldSerializer.Save(a), WorldSerializer.Save(b));
        }

        [Test]
        public void PlayerPatrolTaskIsIssuedAndCompletable()
        {
            var w = TestUtil.NewWorld(11);
            TestUtil.ParkPlayer(w);
            TestUtil.Run(w, 2);
            var task = w.Tasks.FirstActive(PlayerState.PlayerId, TaskKind.Patrol);
            Assert.IsNotNull(task);
            Assert.GreaterOrEqual(task.Checkpoints.Count, 3);
            foreach (string cp in task.Checkpoints.ToArray()) w.ReachPatrolCheckpoint(cp);
            Assert.AreEqual(DutyTaskStatus.Completed, task.Status);
            Assert.AreEqual(1, w.Player.TasksCompleted);
        }

        [Test]
        public void CameraCheckTaskCompletesAfterViewingCameras()
        {
            var w = TestUtil.NewWorld(12);
            TestUtil.ParkPlayer(w);
            TestUtil.Run(w, 2);
            var task = w.Tasks.FirstActive(PlayerState.PlayerId, TaskKind.CameraCheck);
            Assert.IsNotNull(task);
            foreach (var cam in w.Surveillance.Cameras.Take(4)) w.PlayerViewedCamera(cam.Id);
            Assert.AreEqual(DutyTaskStatus.Completed, task.Status);
        }

        [Test]
        public void CamerasRecordWhoTheySee()
        {
            var w = TestUtil.NewWorld(13);
            TestUtil.ParkPlayer(w);
            TestUtil.Run(w, 30);
            Assert.Greater(w.Surveillance.Log.Count, 5);
            Assert.IsTrue(w.Surveillance.Log.Any(s => s.CameraId == "cam04" && s.SubjectId.StartsWith("d.")),
                "the D-block camera should see class-D personnel");
        }

        [Test]
        public void TalkingGivesPlayerPartialKnowledge()
        {
            var w = TestUtil.NewWorld(14);
            var lines = w.TalkTo("s.orlova");
            Assert.GreaterOrEqual(lines.Count, 2);
            StringAssert.Contains("Орлова", lines[0]);
        }
    }

    public class SaveLoadTests
    {
        [Test]
        public void SaveLoadRoundTripIsLossless()
        {
            var w = TestUtil.NewWorld(21);
            TestUtil.ParkPlayer(w);
            TestUtil.Run(w, 9 * 60);
            w.Player.Health = 61f;
            w.DropCard(Stage1Content.PlayerCardId);

            string first = WorldSerializer.Save(w);
            var loaded = WorldSerializer.Load(first);
            string second = WorldSerializer.Save(loaded);
            Assert.AreEqual(first, second, "saving a freshly loaded world must reproduce the same data");

            Assert.AreEqual(w.Now, loaded.Now, 1e-6);
            Assert.AreEqual(w.Rng.State, loaded.Rng.State);
            Assert.AreEqual(61f, loaded.Player.Health, 1e-4);
            Assert.IsTrue(loaded.GetCard(Stage1Content.PlayerCardId).InWorld);
            var tallyA = (TallymanBehaviour)w.GetAnomaly(TallymanBehaviour.AnomalyId).Behaviour;
            var tallyB = (TallymanBehaviour)loaded.GetAnomaly(TallymanBehaviour.AnomalyId).Behaviour;
            Assert.AreEqual(tallyA.Dissonance, tallyB.Dissonance, 1e-4);
            Assert.AreEqual(tallyA.People.Count, tallyB.People.Count);
            CollectionAssert.AreEqual(tallyA.DoorHistogram, tallyB.DoorHistogram);
            foreach (var npc in w.Npcs)
            {
                var other = loaded.GetNpc(npc.Id);
                Assert.AreEqual(npc.Memory.Entries.Count, other.Memory.Entries.Count, npc.Id);
                Assert.AreEqual(npc.Needs.Hunger, other.Needs.Hunger, 1e-4, npc.Id);
                Assert.AreEqual(npc.Agent.Position.X, other.Agent.Position.X, 1e-4, npc.Id);
            }
        }

        [Test]
        public void LoadedWorldKeepsSimulating()
        {
            var w = TestUtil.NewWorld(22);
            TestUtil.ParkPlayer(w);
            TestUtil.Run(w, 60);
            var loaded = WorldSerializer.Load(WorldSerializer.Save(w));
            TestUtil.ParkPlayer(loaded);
            TestUtil.Run(loaded, 6 * 60);
            Assert.Greater(loaded.Facility.DoorList.Sum(d => d.OpenCycles), w.Facility.DoorList.Sum(d => d.OpenCycles));
        }

        [Test]
        public void RejectsIncompatibleVersion()
        {
            Assert.Throws<System.FormatException>(() => WorldSerializer.Load("{\"version\": 999}"));
        }
    }
}
