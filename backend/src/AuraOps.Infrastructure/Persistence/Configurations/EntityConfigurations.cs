using AuraOps.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuraOps.Infrastructure.Persistence.Configurations;

// Enums are stored as integers so that ORDER BY priority/status follows business order.
// Raw SQL in filters/check constraints uses [brackets], which both SQL Server and SQLite accept.

internal sealed class ApplicationUserConfiguration : IEntityTypeConfiguration<ApplicationUser>
{
    public void Configure(EntityTypeBuilder<ApplicationUser> b)
    {
        b.Property(u => u.FullName).HasMaxLength(100).IsRequired();
        b.HasIndex(u => u.IsActive);
    }
}

internal sealed class AssetConfiguration : IEntityTypeConfiguration<Asset>
{
    public void Configure(EntityTypeBuilder<Asset> b)
    {
        b.ToTable("Assets");
        b.HasKey(a => a.AssetId);
        b.Property(a => a.AssetCode).HasMaxLength(50).IsRequired();
        b.Property(a => a.Name).HasMaxLength(150).IsRequired();
        b.Property(a => a.Category).HasMaxLength(80).IsRequired();
        b.Property(a => a.Location).HasMaxLength(120).IsRequired();
        b.Property(a => a.Description).HasMaxLength(2000);
        b.Property(a => a.Status).IsRequired();

        b.HasIndex(a => a.AssetCode).IsUnique();
        b.HasIndex(a => a.Status);
        b.HasIndex(a => a.Category);
        b.HasIndex(a => a.Location);
        b.HasIndex(a => a.CreatedAt);
        b.HasIndex(a => a.IsArchived);
    }
}

internal sealed class MaintenanceRequestConfiguration : IEntityTypeConfiguration<MaintenanceRequest>
{
    public void Configure(EntityTypeBuilder<MaintenanceRequest> b)
    {
        b.ToTable("MaintenanceRequests");
        b.HasKey(r => r.RequestId);
        b.Property(r => r.Title).HasMaxLength(150).IsRequired();
        b.Property(r => r.Description).HasMaxLength(4000).IsRequired();
        b.Property(r => r.CreatedByUserId).IsRequired();
        b.Ignore(r => r.CanCreateWorkOrder);

        b.HasOne(r => r.Asset).WithMany(a => a.MaintenanceRequests)
            .HasForeignKey(r => r.AssetId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(r => r.CreatedBy).WithMany()
            .HasForeignKey(r => r.CreatedByUserId).OnDelete(DeleteBehavior.Restrict);

        b.HasIndex(r => r.Status);
        b.HasIndex(r => r.Priority);
        b.HasIndex(r => r.CreatedAt);
        b.HasIndex(r => new { r.AssetId, r.Status });
    }
}

internal sealed class WorkOrderConfiguration : IEntityTypeConfiguration<WorkOrder>
{
    public void Configure(EntityTypeBuilder<WorkOrder> b)
    {
        b.ToTable("WorkOrders", t =>
        {
            // A completed work order must carry a completion timestamp (Status 3 = Completed).
            t.HasCheckConstraint("CK_WorkOrders_CompletedHasDate", "[Status] <> 3 OR [CompletionDate] IS NOT NULL");
            // Work can only be in progress / completed when someone is assigned (2 = InProgress).
            t.HasCheckConstraint("CK_WorkOrders_StartedIsAssigned", "[Status] NOT IN (1, 2, 3) OR [AssignedTechnicianId] IS NOT NULL");
        });
        b.HasKey(w => w.WorkOrderId);
        b.Property(w => w.Remarks).HasMaxLength(2000);
        b.Ignore(w => w.IsActive);

        b.HasOne(w => w.Request).WithMany(r => r.WorkOrders)
            .HasForeignKey(w => w.RequestId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(w => w.AssignedTechnician).WithMany()
            .HasForeignKey(w => w.AssignedTechnicianId).OnDelete(DeleteBehavior.Restrict);

        // A request may have many work orders over time, but only one active (Open/Assigned/InProgress).
        b.HasIndex(w => w.RequestId).IsUnique().HasFilter("[Status] < 3").HasDatabaseName("UX_WorkOrders_OneActivePerRequest");
        b.HasIndex(w => w.Status);
        b.HasIndex(w => w.AssignedTechnicianId);
        b.HasIndex(w => w.CreatedAt);
    }
}

internal sealed class WorkOrderNoteConfiguration : IEntityTypeConfiguration<WorkOrderNote>
{
    public void Configure(EntityTypeBuilder<WorkOrderNote> b)
    {
        b.ToTable("WorkOrderNotes");
        b.HasKey(n => n.NoteId);
        b.Property(n => n.Text).HasMaxLength(4000).IsRequired();
        b.HasOne(n => n.WorkOrder).WithMany(w => w.Notes)
            .HasForeignKey(n => n.WorkOrderId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne(n => n.Author).WithMany()
            .HasForeignKey(n => n.AuthorUserId).OnDelete(DeleteBehavior.Restrict);
        b.HasIndex(n => new { n.WorkOrderId, n.CreatedAt });
    }
}

internal sealed class MaintenanceHistoryConfiguration : IEntityTypeConfiguration<MaintenanceHistory>
{
    public void Configure(EntityTypeBuilder<MaintenanceHistory> b)
    {
        b.ToTable("MaintenanceHistory");
        b.HasKey(h => h.HistoryId);
        b.Property(h => h.Notes).HasMaxLength(2000).IsRequired();

        b.HasOne(h => h.Asset).WithMany(a => a.History)
            .HasForeignKey(h => h.AssetId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(h => h.Request).WithMany()
            .HasForeignKey(h => h.RequestId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(h => h.WorkOrder).WithMany()
            .HasForeignKey(h => h.WorkOrderId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(h => h.PerformedBy).WithMany()
            .HasForeignKey(h => h.PerformedByUserId).OnDelete(DeleteBehavior.Restrict);

        b.HasIndex(h => new { h.AssetId, h.Timestamp });
        b.HasIndex(h => h.WorkOrderId);
        b.HasIndex(h => h.RequestId);
        b.HasIndex(h => h.Timestamp);
    }
}
