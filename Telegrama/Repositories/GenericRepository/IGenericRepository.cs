using Telegrama.API.Features;

namespace AlaBackEnd.DAL.Repositories
{
    public interface IGenericRepository<TEntity> where TEntity : class, IBaseEntity
    {
        Task<bool> CreateAsync(TEntity entity);
        Task<bool> CreateRangeAsync(IEnumerable<TEntity> entities);
        Task<bool> UpdateAsync(TEntity entity);
        Task<bool> UpdateRangeAsync(IEnumerable<TEntity> entities);
        Task<bool> DeleteIdAsync(Guid id);
        Task<bool> DeleteEntityAsync(TEntity entity);
        Task<bool> DeleteRangeAsync(IEnumerable<TEntity> entities);
        Task<TEntity?> GetByIdAsync(Guid id);
        IQueryable<TEntity> GetAll();
    }
}