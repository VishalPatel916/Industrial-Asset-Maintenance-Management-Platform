namespace AuraOps.Application.Common;

/// <summary>Requested resource does not exist (→ HTTP 404).</summary>
public sealed class NotFoundException(string resource, object key)
    : Exception($"{resource} '{key}' was not found.");

/// <summary>Caller is authenticated but not permitted to perform this action (→ HTTP 403).</summary>
public sealed class ForbiddenException(string message = "You do not have permission to perform this action.")
    : Exception(message);

/// <summary>Request conflicts with current state, e.g. a duplicate unique key (→ HTTP 409).</summary>
public sealed class ConflictException(string message) : Exception(message);

/// <summary>Input failed server-side validation (→ HTTP 400 with field errors).</summary>
public sealed class ValidationException(IDictionary<string, string[]> errors)
    : Exception("One or more validation errors occurred.")
{
    public IDictionary<string, string[]> Errors { get; } = errors;

    public ValidationException(string field, string message)
        : this(new Dictionary<string, string[]> { [field] = [message] }) { }
}
