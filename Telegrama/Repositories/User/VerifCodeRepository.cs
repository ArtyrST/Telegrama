using Microsoft.EntityFrameworkCore;
using Telegrama.API.Data;
using Telegrama.API.Features.Users.Verif;

namespace Telegrama.Repositories.User;

public class VerifCodeRepository : IVerifCodeRepository
{
    private readonly AppDbContext _context;

    public VerifCodeRepository(AppDbContext context)
    {
        _context = context;
    }

    public Task<VerifCodeEntity?> GetByUserIdAsync(Guid userId)
    {
        return _context.VerifCodes.FirstOrDefaultAsync(code => code.UserId == userId);
    }

    public Task<VerifCodeEntity?> GetByEmailAsync(string email)
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();
        return _context.VerifCodes
            .Include(code => code.User)
            .FirstOrDefaultAsync(code => code.User.Email == normalizedEmail);
    }

    public async Task SaveAsync(VerifCodeEntity entity)
    {
        if (entity.Id == Guid.Empty)
        {
            await _context.VerifCodes.AddAsync(entity);
        }

        await _context.SaveChangesAsync();
    }
}
