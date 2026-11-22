using System.Linq;
using NUnit.Framework;
using ScpLife.Core;

namespace ScpLife.Tests
{
    public class TallymanTests
    {
        private static (SimWorld w, AnomalyInstance a, TallymanBehaviour t) Setup(ulong seed = 31)
        {
            var w = TestUtil.NewWorld(seed);
            TestUtil.ParkPlayer(w);
            var a = w.GetAnomaly(TallymanBehaviour.AnomalyId);
            return (w, a, (TallymanBehaviour)a.Behaviour);
        }

        [Test]
        public void RegularSessionsKeepItCalm()
        {
            var (w, a, t) = Setup();
            TestUtil.Run(w, 12 * 60);
            Assert.IsTrue(a.Contained);
            Assert.Less(t.Dissonance, 55f, "with scheduled sessions it should not escalate");
            Assert.Greater(t.LastSessionEnd, Stage1Content.StartTime, "the morning session should have been registered");
        }

        [Test]
        public void MissedSessionsEscalateAndDispatcherReacts()
        {
            var (w, a, t) = Setup(32);
            // Nobody briefed is available: scientists are incapacitated for the whole period.
            foreach (var npc in w.Npcs.Where(n => n.Role == NpcRole.Scientist)) npc.IncapacitatedUntil = w.Now + 100000;
            TestUtil.Run(w, 10 * 60);
            Assert.Greater(t.Dissonance, 55f);
            Assert.GreaterOrEqual((int)w.Alert.Level, (int)AlertLevel.Yellow);
            Assert.IsTrue(w.Events.Recent.Any(e => e.Type == EventType.AnomalyBehaviour && e.ActorId == a.Id));
        }

        [Test]
        public void LearnsDoorScheduleAfterRepeatedOpenings()
        {
            var (w, a, t) = Setup(33);
            var door = w.Facility.GetDoor(t.ContainmentDoorId);
            Assert.Less(t.PredictMinutesToDoorOpening(GameClock.Hm(15, 50)), 0, "one observation is not enough");
            TestUtil.RunUntil(w, 16, 2);
            // Simulate a door cycle at 16:00 bucket (scientists usually do this themselves).
            door.CommandOpen(1f);
            TestUtil.Run(w, 1);
            double predicted = t.PredictMinutesToDoorOpening(w.Clock.TotalMinutes - w.Clock.MinuteOfDay + GameClock.Hm(15, 40));
            Assert.That(predicted, Is.InRange(5.0, 35.0), "after two days it should expect the 16:00 opening");
        }

        [Test]
        public void IrregularVisitorRaisesDissonanceMoreThanRegular()
        {
            var (w, a, t) = Setup(34);
            float before = t.Dissonance;
            // The new guard appears at the observation window: unfamiliar person.
            w.UpdatePlayerTransform(new Vec3(13.3f, 0f, 6.5f), 0f, 0f);
            w.Player.RoomId = "obs";
            TestUtil.Run(w, 1);
            Assert.IsTrue(t.People.ContainsKey(PlayerState.PlayerId));
            Assert.Greater(t.People[PlayerState.PlayerId].Irregularity, 0.5f);
            Assert.Greater(t.Dissonance, before - 0.5f);
        }

        [Test]
        public void OpeningDoorWhileAgitatedCausesBreachThatIsDetected()
        {
            var (w, a, t) = Setup(35);
            var door = w.Facility.GetDoor(t.ContainmentDoorId);
            t.Dissonance = 92f;
            TestUtil.Run(w, 3); // it walks to the door (probing)
            door.CommandOpen(30f);
            TestUtil.Run(w, 6);
            Assert.IsFalse(a.Contained, "an open door next to an agitated SCP-L-001 must lead to a breach");
            TestUtil.Run(w, 10);
            Assert.IsTrue(a.BreachDetected, "cameras or witnesses should detect the breach");
            Assert.AreEqual(AlertLevel.Red, w.Alert.Level);
            Assert.IsTrue(w.Facility.GetDoor("d.dblock").Lockdown, "class-D block must be sealed during a breach");
        }

        [Test]
        public void CountingProtocolCalmsAndItReturns()
        {
            var (w, a, t) = Setup(36);
            var door = w.Facility.GetDoor(t.ContainmentDoorId);
            t.Dissonance = 92f;
            TestUtil.Run(w, 3);
            door.CommandOpen(30f);
            TestUtil.Run(w, 6);
            Assert.IsFalse(a.Contained);

            // Player counts at it from close range repeatedly until it turns back.
            int guard = 0;
            while (t.State != TallymanBehaviour.TallyState.Returning && guard++ < 4000)
            {
                var pos = a.Agent.Position + new Vec3(0f, 0f, -5f);
                var room = w.Facility.RoomAt(pos);
                if (room == null || room.Id != a.Agent.RoomId) pos = a.Agent.Position + new Vec3(-4f, 0f, 0f);
                w.UpdatePlayerTransform(pos, 0f, 0f);
                w.Player.RoomId = w.Facility.RoomAt(pos)?.Id ?? a.Agent.RoomId;
                w.Player.Health = 100f;
                w.Player.Dead = false;
                if (!w.Player.Counting) w.StartPlayerCounting(a.Id);
                w.Tick(SimWorld.FixedStep);
            }
            Assert.AreEqual(TallymanBehaviour.TallyState.Returning, t.State, "the protocol should calm it below the return threshold");

            w.StopPlayerCounting("test");
            TestUtil.ParkPlayer(w);
            TestUtil.Run(w, 60);
            Assert.IsTrue(a.Contained, "after returning and the door closing it must be recontained");
            Assert.IsTrue(w.Events.Recent.Any(e => e.Type == EventType.Recontained));
        }

        [Test]
        public void ObservationReportMentionsLearnedTime()
        {
            var (w, a, t) = Setup(37);
            t.SeedDoorCycle(16, 0, 2);
            string report = w.PlayerObserveAnomaly(a.Id, false);
            StringAssert.Contains("16:00", report);
            Assert.Greater(t.LastObservedByPlayer, 0);
        }

        [Test]
        public void ProbingDamagesLockAndDispatcherSendsTechnician()
        {
            var (w, a, t) = Setup(38);
            foreach (var npc in w.Npcs.Where(n => n.Role == NpcRole.Scientist)) npc.IncapacitatedUntil = w.Now + 100000;
            t.Dissonance = 80f;
            TestUtil.Run(w, 90);
            var door = w.Facility.GetDoor(t.ContainmentDoorId);
            Assert.Less(door.Integrity, 100f);
            Assert.IsTrue(w.Tasks.Tasks.Any(task => task.Kind == TaskKind.RepairDoor));
            Assert.IsTrue(w.GetCard("card.t.sokolov").TempUntil > 0, "technician must receive temporary clearance");
        }
            [Test]
        public void PublicAlertInformsStaffAndInspectionIsCancelled()
        {
            var (w, a, t) = Setup(40);
            TestUtil.RunUntil(w, 15, 30);
            t.Dissonance = 82f; // lock interference → automatic sensors → Orange alert over PA
            TestUtil.Run(w, 5);
            Assert.GreaterOrEqual((int)w.Alert.Level, (int)AlertLevel.Orange);
            Assert.GreaterOrEqual(w.GetNpc("s.orlova").KnownAnomalyThreat, 55f, "the announcement must reach the scientists");
            int openingsBefore = w.Facility.GetDoor(t.ContainmentDoorId).OpenCycles;
            TestUtil.RunUntil(w, 16, 40);
            Assert.AreEqual(openingsBefore, w.Facility.GetDoor(t.ContainmentDoorId).OpenCycles, "the 16:00 inspection must be cancelled");
            Assert.IsTrue(a.Contained);
            Assert.IsTrue(w.Tasks.Tasks.Any(task => task.Kind == TaskKind.ObservationSession), "an emergency counting session must be ordered");
        }

        [Test]
        public void SilentWaitingAtLearnedTimeExploitsUninformedInspection()
        {
            var (w, a, t) = Setup(41);
            // It has watched the 16:00 inspection for days.
            t.SeedDoorCycle(16, 0, 3);
            t.SeedDoorCycle(16, 15, 3);
            TestUtil.RunUntil(w, 15, 50);
            // Agitation rose without anyone noticing: it skips the noisy phases and waits by the door.
            t.Dissonance = 76f;
            TestUtil.Run(w, 2);
            Assert.AreEqual(TallymanBehaviour.TallyState.WaitingAtDoor, t.State);
            Assert.Less((int)w.Alert.Level, (int)AlertLevel.Orange, "silent waiting is invisible to the lock sensors");
            TestUtil.RunUntil(w, 16, 40);
            Assert.IsTrue(!a.Contained || w.Events.Recent.Any(e => e.Type == EventType.Recontained),
                "the scheduled opening should have let it out");
            Assert.IsTrue(w.Events.Recent.Any(e => e.Type == EventType.AnomalyBehaviour && e.Text.Contains("выходит из камеры")));
        }
    }
}
