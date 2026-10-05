using AlaBackEnd.DAL.Entity.BaseEntity;
using Microsoft.EntityFrameworkCore;
using System.Linq.Expressions;
using Telegrama.API.Data;

namespace AlaBackEnd.DAL.Repositories
{
    public class GenericRepository<TEntity>
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
        public async Task<bool> CreateRangeAsync(IEnumerable<TEntity> entitis)
        {
            await _context.Set<TEntity>().AddRangeAsync(entitis);
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
            await _context.Set<TEntity>().AddRangeAsync(entities);
            int res = await _context.SaveChangesAsync();
            return res != 0;
        }
        public async Task<bool> DeleteIdAsync(int id)
        {
            var entity = await GetByIdAsync(id);
            if (entity != null)
            {
                _context.Set<TEntity>().Remove(entity);
                var res = await _context.SaveChangesAsync();
                return (res != 0);
            }
            return false;
        }
        public async Task<bool> DeleteEntityAsync(TEntity entity)
        {
            _context.Set<TEntity>().Remove(entity);
            var res = await _context.SaveChangesAsync();
            return res != 0;
        }
        public async Task<bool> DeleteRangeAsync(IEnumerable<TEntity> entities)
        {
            _context.Set<TEntity>().RemoveRange(entities);
            int res = await _context.SaveChangesAsync();
            return res != 0;
        }

        public async Task<TEntity?> GetByIdAsync(int id)
        {
            return await _context.Set<TEntity>().
                FirstOrDefaultAsync(e => e.Id == id);
        }
        public IQueryable<TEntity> GetAll()
        {
            return _context.Set<TEntity>();
        }
        // Додай цей метод в GenericRepository
        //public IQueryable<TEntity> GetAll(params Expression<Func<TEntity, object>>[] includes)
        //{
        //    IQueryable<TEntity> query = _context.Set<TEntity>();

        //    foreach (var include in includes)
        //    {
        //        query = query.Include(include);
        //    }

        //    return query;
        //}

    }
}