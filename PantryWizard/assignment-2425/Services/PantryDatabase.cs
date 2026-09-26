using System.Collections.Generic;
using System.Threading.Tasks;
using SQLite;
using PantryWizard.Models;

namespace PantryWizard.Services
{
    public class PantryDatabase
    {
        private readonly SQLiteAsyncConnection database;

        public PantryDatabase(string dbPath)
        {
            database = new SQLiteAsyncConnection(dbPath);
            database.CreateTableAsync<PantryItem>().Wait();
        }

        public Task<List<PantryItem>> GetItemsAsync()
        {
            return database.Table<PantryItem>().ToListAsync();
        }

        public Task<int> SaveItemAsync(PantryItem item)
        {
            if (item.Id != 0)
                return database.UpdateAsync(item);
            else
                return database.InsertAsync(item);
        }

        public Task<int> DeleteItemAsync(PantryItem item)
        {
            return database.DeleteAsync(item);
        }
    }
}
