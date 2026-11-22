using NUnit.Framework;
using ScpLife.Core;

namespace ScpLife.Tests
{
    public class AccessTests
    {
        [Test]
        public void LevelsAndPermissionsAreEnforced()
        {
            var req = new AccessRequirement(AccessLevel.L2, Permission.Research | Permission.Security);
            Assert.AreEqual(AccessResult.Granted, AccessControl.CheckCard(TestUtil.Card("a", "a", AccessLevel.L2, Permission.Security), req));
            Assert.AreEqual(AccessResult.DeniedLevel, AccessControl.CheckCard(TestUtil.Card("b", "b", AccessLevel.L1, Permission.Security), req));
            Assert.AreEqual(AccessResult.DeniedPermission, AccessControl.CheckCard(TestUtil.Card("c", "c", AccessLevel.L3, Permission.Medical), req));
            Assert.AreEqual(AccessResult.GrantedOverride, AccessControl.CheckCard(TestUtil.Card("d", "d", AccessLevel.L4, Permission.None), req));
        }

        [Test]
        public void ContainmentNeedsExplicitPermissionOrL5()
        {
            var req = new AccessRequirement(AccessLevel.L3, Permission.Containment);
            Assert.AreEqual(AccessResult.DeniedPermission, AccessControl.CheckCard(TestUtil.Card("chief", "chief", AccessLevel.L4, Permission.Security), req));
            Assert.AreEqual(AccessResult.GrantedOverride, AccessControl.CheckCard(TestUtil.Card("dir", "dir", AccessLevel.L5, Permission.None), req));
        }

        [Test]
        public void RevokedAndTemporaryAccess()
        {
            var req = new AccessRequirement(AccessLevel.L3, Permission.Containment);
            var card = TestUtil.Card("t", "t", AccessLevel.L2, Permission.Engineering);
            Assert.AreEqual(AccessResult.DeniedLevel, AccessControl.CheckCard(card, req, 100));
            card.TempLevel = AccessLevel.L3;
            card.TempPermissions = Permission.Containment;
            card.TempUntil = 200;
            Assert.AreEqual(AccessResult.Granted, AccessControl.CheckCard(card, req, 150));
            Assert.AreEqual(AccessResult.DeniedLevel, AccessControl.CheckCard(card, req, 250), "temporary access must expire");
            card.Revoked = true;
            Assert.AreEqual(AccessResult.DeniedRevoked, AccessControl.CheckCard(card, req, 150));
        }

        [Test]
        public void ChamberDoorRequiresTwoDifferentOwners()
        {
            var w = TestUtil.NewWorld();
            var door = w.Facility.GetDoor("d.chamber");
            int logBefore = w.AccessLog.Entries.Count;

            Assert.AreEqual(AccessResult.AwaitingSecondCard, w.PresentCard("d.chamber", "card.s.orlova", "s.orlova", "airlock"));
            Assert.AreEqual(DoorState.Closed, door.State);
            // Same person again: still waiting, no duplicate journal spam.
            Assert.AreEqual(AccessResult.AwaitingSecondCard, w.PresentCard("d.chamber", "card.s.orlova", "s.orlova", "airlock"));
            Assert.AreEqual(AccessResult.Granted, w.PresentCard("d.chamber", "card.s.kim", "s.kim", "airlock"));
            Assert.AreEqual(DoorState.Opening, door.State);
            Assert.AreEqual(logBefore + 2, w.AccessLog.Entries.Count);
        }

        [Test]
        public void ChamberExitNeedsOnlyOneCard()
        {
            var w = TestUtil.NewWorld();
            Assert.AreEqual(AccessResult.Granted, w.PresentCard("d.chamber", "card.s.orlova", "s.orlova", "chamber"));
        }

        [Test]
        public void GuardCannotEnterAirlockAndDenialIsJournaled()
        {
            var w = TestUtil.NewWorld();
            var r = w.PresentCard("d.airlock", Stage1Content.PlayerCardId, PlayerState.PlayerId, "corridor");
            Assert.AreEqual(AccessResult.DeniedLevel, r);
            var last = w.AccessLog.Entries[w.AccessLog.Entries.Count - 1];
            Assert.AreEqual("d.airlock", last.DoorId);
            Assert.AreEqual(Stage1Content.PlayerCardId, last.CardId);
            Assert.IsFalse(last.Success);
        }

        [Test]
        public void CurfewLocksCellsForClassDButNotGuards()
        {
            var w = TestUtil.NewWorld();
            TestUtil.ParkPlayer(w);
            TestUtil.RunUntil(w, 23, 0);
            var door = w.Facility.GetDoor("d.cell1");
            Assert.IsTrue(door.Locked);
            Assert.AreEqual(AccessResult.DeniedCurfew, w.PresentCard("d.cell1", "card.d.9341", "d.9341", "cell1"));
            Assert.AreEqual(AccessResult.Granted, w.PresentCard("d.cell1", "card.g.petrenko", "g.petrenko", "dblock"));
        }
    }

    public class NavigationTests
    {
        [Test]
        public void GraphIsConnected()
        {
            var w = TestUtil.NewWorld();
            var f = w.Facility;
            int start = f.Rooms["post"].HubNodes[0];
            foreach (var node in f.Graph.Nodes)
                Assert.IsNotNull(PathFinder.FindPath(f, start, node.Index, null), $"node {node.Id} unreachable");
        }

        [Test]
        public void AccessShapesRoutes()
        {
            var w = TestUtil.NewWorld();
            var f = w.Facility;
            var guardCard = w.GetCard("card.g.petrenko");
            var dCard = w.GetCard("card.d.9341");
            int labHub = f.Rooms["lab"].HubNodes[0];
            int corridorHub = f.Rooms["corridor"].HubNodes[3];
            int chamberHub = f.Rooms["chamber"].HubNodes[0];

            Assert.IsNotNull(w.PlanPath(f.Rooms["post"].Center, "post", labHub, (d, from) => w.CanPlanThrough(d, from, guardCard)));
            Assert.IsNull(w.PlanPath(f.Rooms["cell1"].Center, "cell1", corridorHub, (d, from) => w.CanPlanThrough(d, from, dCard)),
                "class-D must not be able to leave the block");
            Assert.IsNull(w.PlanPath(f.Rooms["corridor"].Center, "corridor", chamberHub, (d, from) => w.CanPlanThrough(d, from, guardCard)),
                "a guard has no route into the containment chamber");
            var orlovaCard = w.GetCard("card.s.orlova");
            Assert.IsNotNull(w.PlanPath(f.Rooms["lab"].Center, "lab", chamberHub, (d, from) => w.CanPlanThrough(d, from, orlovaCard)));
        }

        [Test]
        public void RoomLookupAndDistances()
        {
            var f = TestUtil.NewWorld().Facility;
            Assert.AreEqual("canteen", f.RoomAt(new Vec3(-9f, 0f, 7f)).Id);
            Assert.AreEqual("corridor", f.RoomAt(new Vec3(0f, 0f, 0f)).Id);
            Assert.AreEqual(1, f.RoomDistance("corridor", "lab"));
            Assert.AreEqual(2, f.RoomDistance("corridor", "chamber"));
            Assert.AreEqual(3, f.RoomDistance("post", "cell2"));
        }

        [Test]
        public void DoorOpensForAgentAndClosesAfterwards()
        {
            var w = TestUtil.NewWorld();
            TestUtil.ParkPlayer(w);
            var door = w.Facility.GetDoor("d.lab");
            Assert.AreEqual(AccessResult.Granted, w.PresentCard("d.lab", "card.g.petrenko", "g.petrenko", "corridor"));
            for (int i = 0; i < 20; i++) w.Tick(SimWorld.FixedStep);
            Assert.AreEqual(DoorState.Open, door.State);
            for (int i = 0; i < 100; i++) w.Tick(SimWorld.FixedStep);
            Assert.AreEqual(DoorState.Closed, door.State, "door must auto-close when nobody stands in it");
        }
    }
}
