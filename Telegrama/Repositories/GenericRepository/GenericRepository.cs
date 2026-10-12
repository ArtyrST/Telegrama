using AlaBackEnd.DAL.Repositories;
using Microsoft.EntityFrameworkCore;
using Telegrama.API.Data;
using Telegrama.API.Features;

namespace Telegrama.Repositories.GenericRepository
{
    public class GenericRepository<TEntity> : IGenericRepository<TEntity>
        where TEntity : class, IBaseEntity
    {
        private readonly AppDbContext _context;
        public GenericRepository(AppDbContext context)
        {
            _context = context;
        }
        public async Task<bool> CreateAsync(TEntity entity)
        {
            await _context.Set<TEntity>().AddAsync(entity);
            int res = await _context.SaveChangesAsync();
            return res != 0;
        }
        public async Task<bool> CreateRangeAsync(IEnumerable<TEntity> entities)
        {
            await _context.Set<TEntity>().AddRangeAsync(entities);
            int res = await _context.SaveChangesAsync();
            return res != 0;
        }
        public async Task<bool> UpdateAsync(TEntity entity)
        {
            _context.Set<TEntity>().Update(entity);
            int res = await _context.SaveChangesAsync();
            return res != 0;
        }
        public async Task<bool> UpdateRangeAsync(IEnumerable<TEntity> entities)
        {
            _context.Set<TEntity>().UpdateRange(entities);
            int res = await _context.SaveChangesAsync();
            return res != 0;
        }
        public async Task<bool> DeleteIdAsync(Guid id)
        {
            var entity = await GetByIdAsync(id);
            if (entity == null) return false;

            _context.Set<TEntity>().Remove(entity);
            int res = await _context.SaveChangesAsync();
            return res != 0;
        }
        public async Task<bool> DeleteEntityAsync(TEntity entity)
        {
            _context.Set<TEntity>().Remove(entity);
            int res = await _context.SaveChangesAsync();
            return res != 0;
        }
        public async Task<bool> DeleteRangeAsync(IEnumerable<TEntity> entities)
        {
            _context.Set<TEntity>().RemoveRange(entities);
            int res = await _context.SaveChangesAsync();
            return res != 0;
        }

        public async Task<TEntity?> GetByIdAsync(Guid id)
        {
            return await _context.Set<TEntity>()
                .FirstOrDefaultAsync(e => e.Id == id);
        }
        public IQueryable<TEntity> GetAll()
        {
            return _context.Set<TEntity>();
        }
    }
}