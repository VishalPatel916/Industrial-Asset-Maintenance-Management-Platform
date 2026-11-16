namespace AuraOps.Domain.Exceptions;

/// <summary>A business rule was violated (e.g. an invalid status transition).</summary>
public class DomainException(string message) : Exception(message);

/// <summary>An invalid state transition was requested.</summary>
public sealed class InvalidStatusTransitionException(string entity, object from, object to)
    : DomainException($"{entity} cannot move from '{from}' to '{to}'.")
{
    public object From { get; } = from;
    public object To { get; } = to;
}
