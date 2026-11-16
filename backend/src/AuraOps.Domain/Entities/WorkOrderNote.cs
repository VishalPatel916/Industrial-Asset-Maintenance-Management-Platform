namespace AuraOps.Domain.Entities;

public class WorkOrderNote
{
    public int NoteId { get; set; }
    public int WorkOrderId { get; set; }
    public WorkOrder WorkOrder { get; set; } = null!;
    public string AuthorUserId { get; set; } = string.Empty;
    public ApplicationUser Author { get; set; } = null!;
    public string Text { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
