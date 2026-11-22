using System.Collections.Generic;
using NUnit.Framework;
using ScpLife.Core;

namespace ScpLife.Tests
{
    public class JsonTests
    {
        [Test]
        public void RoundTripsNestedValues()
        {
            var obj = new Dictionary<string, object>
            {
                ["name"] = "Счетовод \"L-001\"\n",
                ["n"] = 3.25,
                ["neg"] = -7.0,
                ["flag"] = true,
                ["none"] = null,
                ["list"] = new List<object> { 1.0, "два", new Dictionary<string, object> { ["x"] = 0.5 } }
            };
            string json = Json.Serialize(obj, true);
            var back = Json.ParseObject(json);
            Assert.AreEqual("Счетовод \"L-001\"\n", back.Str("name"));
            Assert.AreEqual(3.25, back.Num("n"), 1e-9);
            Assert.AreEqual(-7.0, back.Num("neg"), 1e-9);
            Assert.IsTrue(back.Bool("flag"));
            Assert.IsFalse(back.Has("none"));
            var list = back.Arr("list");
            Assert.AreEqual(3, list.Count);
            Assert.AreEqual("два", list[1]);
        }

        [Test]
        public void ToleratesCommentsTrailingCommasAndBom()
        {
            var o = Json.ParseObject("\uFEFF{ // comment\n \"a\": [1, 2, ], \"b\": \"\\u0416\", }");
            Assert.AreEqual(2, o.Arr("a").Count);
            Assert.AreEqual("Ж", o.Str("b"));
        }

        [Test]
        public void RejectsMalformedInput()
        {
            Assert.Throws<System.FormatException>(() => Json.Parse("{\"a\": }"));
            Assert.Throws<System.FormatException>(() => Json.Parse("[1, 2"));
        }
    }

    public class ClockAndScheduleTests
    {
        [Test]
        public void InRangeHandlesMidnightWrap()
        {
            Assert.IsTrue(GameClock.InRange(GameClock.Hm(23, 30), GameClock.Hm(22), GameClock.Hm(6, 30)));
            Assert.IsTrue(GameClock.InRange(GameClock.Hm(3), GameClock.Hm(22), GameClock.Hm(6, 30)));
            Assert.IsFalse(GameClock.InRange(GameClock.Hm(12), GameClock.Hm(22), GameClock.Hm(6, 30)));
        }

        [Test]
        public void EveryNpcScheduleCoversWholeDay()
        {
            var w = TestUtil.NewWorld();
            foreach (var npc in w.Npcs)
                for (int minute = 0; minute < 1440; minute += 5)
                    Assert.IsNotNull(npc.Schedule.At(minute), $"{npc.Id} has no schedule block at {GameClock.FormatTime(minute)}");
        }

        [Test]
        public void ClockFormatsDayAndTime()
        {
            var clock = new GameClock(1440 + 61);
            Assert.AreEqual(2, clock.Day);
            Assert.AreEqual("01:01", clock.TimeString);
        }
    }

    public class CatalogTests
    {
        [Test]
        public void ParsesArrayWithVariantFieldNames()
        {
            const string json = @"[
                { ""id"": 7, ""name"": ""Тест"", ""class"": ""Safe"", ""type"": ""предмет"", ""danger"": 3 },
                { ""scp_id"": ""SCP-L-050"", ""название"": ""Шептун"", ""категория"": ""разумное существо"",
                  ""stats"": { ""intelligence"": 80, ""speed"": 0.4 }, ""triggers"": [""тишина"", ""темнота""] }
            ]";
            var c = new AnomalyCatalog();
            Assert.AreEqual(2, c.LoadJson(json));
            var a = c.Get("SCP-007");
            Assert.IsNotNull(a);
            Assert.AreEqual(AnomalyKind.Object, a.Kind);
            Assert.AreEqual(0.3f, a.Danger, 1e-4);
            Assert.IsFalse(a.IsAutonomous, "Passive objects must not act on their own");

            var b = c.Get("SCP-L-050");
            Assert.AreEqual("Шептун", b.Name);
            Assert.AreEqual(AnomalyKind.Sapient, b.Kind);
            Assert.AreEqual(0.8f, b.Intelligence, 1e-4);
            Assert.AreEqual(0.4f, b.Mobility, 1e-4);
            CollectionAssert.AreEqual(new[] { "тишина", "темнота" }, b.Triggers);
        }

        [Test]
        public void ParsesObjectRootAndReportsDuplicates()
        {
            const string json = @"{ ""anomalies"": [ { ""id"": ""A"" }, { ""id"": ""A"", ""name"": ""B"" } ] }";
            var c = new AnomalyCatalog();
            c.LoadJson(json);
            Assert.AreEqual(1, c.Count);
            Assert.AreEqual("B", c.Get("A").Name);
            Assert.IsNotEmpty(c.Warnings);
        }

        [Test]
        public void WorldAlwaysContainsStageOneAnomaly()
        {
            var w = Stage1Content.CreateWorld(1, "{ \"anomalies\": [ { \"id\": \"SCP-L-099\", \"name\": \"X\" } ] }");
            Assert.IsNotNull(w.Catalog.Get("SCP-L-099"));
            Assert.IsNotNull(w.Catalog.Get(TallymanBehaviour.AnomalyId));
        }
    }
}
