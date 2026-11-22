using ScpLife.Core;
using UnityEngine;

namespace ScpLife.Runtime
{
    /// <summary>Anything the player can use by looking at it and pressing "Использовать".</summary>
    public interface IInteractable
    {
        string Prompt { get; }
        bool CanInteract { get; }
        void Interact();
    }

    public sealed class KeycardReaderInteractable : MonoBehaviour, IInteractable
    {
        private DoorView _door;
        private string _sideRoomId;

        public void Init(DoorView door, string sideRoomId)
        {
            _door = door;
            _sideRoomId = sideRoomId;
        }

        private static SimWorld World => GameBootstrap.Instance.World;

        public bool CanInteract => _door != null && World != null && !World.Player.Dead;

        public string Prompt
        {
            get
            {
                var card = World.GetCard(World.Player.SelectedCardId);
                string cardText = card != null ? $"{card.Level} · {card.OwnerName}" : "нет карты";
                return $"Приложить карту [{cardText}]\n{_door.Door.Name} · допуск {_door.Door.RequirementFrom(_sideRoomId).Describe()}";
            }
        }

        public void Interact()
        {
            var w = World;
            string cardId = w.Player.SelectedCardId;
            if (cardId == null)
            {
                GameBootstrap.Instance.Message("У вас нет ключ-карты", Color.red);
                return;
            }
            var result = w.PresentCard(_door.Door.Id, cardId, PlayerState.PlayerId, _sideRoomId);
            _door.PlayReaderSound(result);
            Color color = AccessControl.IsSuccess(result) ? new Color(0.4f, 1f, 0.5f)
                : result == AccessResult.AwaitingSecondCard ? new Color(1f, 0.85f, 0.3f) : new Color(1f, 0.35f, 0.3f);
            GameBootstrap.Instance.Message($"{_door.Door.Name}: {AccessText.ResultText(result)}", color);
        }
    }

    public sealed class TerminalInteractable : MonoBehaviour, IInteractable
    {
        public bool CanInteract => GameBootstrap.Instance.World != null;
        public string Prompt => "Терминал дежурного\nкамеры · журнал доступа · события · персонал · рапорт · архив";
        public void Interact() => GameBootstrap.Instance.Terminal.Open();
    }

    public sealed class CheckpointInteractable : MonoBehaviour, IInteractable
    {
        private string _poiId;
        private string _label;

        public void Init(string poiId, string label)
        {
            _poiId = poiId;
            _label = label;
        }

        public bool CanInteract => GameBootstrap.Instance.World != null;

        public string Prompt
        {
            get
            {
                var task = GameBootstrap.Instance.World.Tasks.FirstActive(PlayerState.PlayerId, TaskKind.Patrol);
                bool inRoute = task != null && task.Checkpoints.Contains(_poiId) && !task.Done.Contains(_poiId);
                return $"Отметиться: контрольная точка «{_label}»" + (inRoute ? "\n(входит в текущий обход)" : "");
            }
        }

        public void Interact()
        {
            string result = GameBootstrap.Instance.World.ReachPatrolCheckpoint(_poiId);
            if (result != null) GameBootstrap.Instance.Message(result, new Color(0.9f, 0.85f, 0.4f));
            GameAudio.Instance?.PlayUi(GameAudio.Instance.BeepGranted);
        }
    }

    public sealed class ObservationWindowInteractable : MonoBehaviour, IInteractable
    {
        private string _anomalyId;

        public void Init(string anomalyId) => _anomalyId = anomalyId;

        public bool CanInteract => GameBootstrap.Instance.World?.GetAnomaly(_anomalyId) != null;
        public string Prompt => $"Наблюдать за {_anomalyId} через окно";

        public void Interact()
        {
            var w = GameBootstrap.Instance.World;
            string report = w.PlayerObserveAnomaly(_anomalyId, false);
            GameBootstrap.Instance.Menus.ShowDialogue("Наблюдение: " + w.GetAnomaly(_anomalyId).DisplayName, new[] { report });
        }
    }

    public sealed class NpcInteractable : MonoBehaviour, IInteractable
    {
        public string NpcId;

        public bool CanInteract => GameBootstrap.Instance.World?.GetNpc(NpcId) != null;

        public string Prompt
        {
            get
            {
                var npc = GameBootstrap.Instance.World.GetNpc(NpcId);
                if (npc == null) return "";
                string activity = string.IsNullOrEmpty(npc.ActivityLabel) ? NpcText.ActivityName(npc.Activity) : npc.ActivityLabel;
                return $"Говорить: {npc.DisplayName}\n{NpcText.RoleName(npc.Role)} · {activity}";
            }
        }

        public void Interact()
        {
            var w = GameBootstrap.Instance.World;
            var npc = w.GetNpc(NpcId);
            var lines = w.TalkTo(NpcId);
            GameBootstrap.Instance.Menus.ShowDialogue(npc.DisplayName, lines);
        }
    }

    public sealed class KeycardPickupInteractable : MonoBehaviour, IInteractable
    {
        public string CardId;

        public bool CanInteract
        {
            get
            {
                var card = GameBootstrap.Instance.World?.GetCard(CardId);
                return card != null && card.InWorld;
            }
        }

        public string Prompt
        {
            get
            {
                var card = GameBootstrap.Instance.World.GetCard(CardId);
                return card == null ? "" : $"Подобрать ключ-карту: {card.Level} · {card.OwnerName}" + (card.Revoked ? " (аннулирована)" : "");
            }
        }

        public void Interact()
        {
            var w = GameBootstrap.Instance.World;
            if (w.PickUpCard(CardId))
            {
                var card = w.GetCard(CardId);
                GameBootstrap.Instance.Message($"Подобрана карта {card.Level} · {card.OwnerName}. Использование чужой карты фиксируется в журнале.", new Color(1f, 0.85f, 0.4f));
            }
        }
    }

    public sealed class AnomalyInteractable : MonoBehaviour, IInteractable
    {
        public string AnomalyId;

        public bool CanInteract => GameBootstrap.Instance.World?.GetAnomaly(AnomalyId) != null;
        public string Prompt => $"Наблюдать: {AnomalyId}";

        public void Interact()
        {
            var w = GameBootstrap.Instance.World;
            string report = w.PlayerObserveAnomaly(AnomalyId, false);
            GameBootstrap.Instance.Menus.ShowDialogue("Наблюдение: " + w.GetAnomaly(AnomalyId).DisplayName, new[] { report });
        }
    }
}
