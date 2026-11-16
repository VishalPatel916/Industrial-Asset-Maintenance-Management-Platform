using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using AuraOps.Application.Abstractions;
using AuraOps.Application.Dtos;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace AuraOps.Api.Auth;

public sealed class JwtOptions
{
    public const string Section = "Jwt";
    public string Issuer { get; set; } = "AuraOps";
    public string Audience { get; set; } = "AuraOps.Client";
    /// <summary>HMAC signing key (≥ 32 bytes). Supply via environment / Key Vault — never commit a real key.</summary>
    public string SigningKey { get; set; } = string.Empty;
    public int AccessTokenMinutes { get; set; } = 480;

    public SymmetricSecurityKey GetKey()
    {
        if (Encoding.UTF8.GetByteCount(SigningKey) < 32)
            throw new InvalidOperationException("Jwt:SigningKey must be configured and at least 32 bytes long.");
        return new SymmetricSecurityKey(Encoding.UTF8.GetBytes(SigningKey));
    }
}

public static class AuraClaims
{
    public const string SecurityStamp = "sstamp";
}

public sealed class JwtTokenService(IOptions<JwtOptions> options, IClock clock)
{
    private readonly JwtOptions _options = options.Value;

    public (string Token, DateTime ExpiresAt) CreateToken(UserDto user, string securityStamp)
    {
        var expires = clock.UtcNow.AddMinutes(_options.AccessTokenMinutes);
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id),
            new(JwtRegisteredClaimNames.Email, user.Email),
            new(JwtRegisteredClaimNames.Name, user.FullName),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")),
            new(AuraClaims.SecurityStamp, securityStamp),
        };
        claims.AddRange(user.Roles.Select(r => new Claim("role", r)));

        var token = new JwtSecurityToken(
            issuer: _options.Issuer,
            audience: _options.Audience,
            claims: claims,
            notBefore: clock.UtcNow,
            expires: expires,
            signingCredentials: new SigningCredentials(_options.GetKey(), SecurityAlgorithms.HmacSha256));

        return (new JwtSecurityTokenHandler().WriteToken(token), expires);
    }
}
