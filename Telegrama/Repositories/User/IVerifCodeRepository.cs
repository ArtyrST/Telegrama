using Telegrama.API.Features.Users.Verif;

namespace Telegrama.Repositories.User;

public interface IVerifCodeRepository
{
    Task<VerifCodeEntity?> GetByUserIdAsync(Guid userId);
    Task<VerifCodeEntity?> GetByEmailAsync(string email);
    Task SaveAsync(VerifCodeEntity entity);
}
